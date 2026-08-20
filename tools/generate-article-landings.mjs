#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto';
import {
  access,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DEFAULT_SITE = 'https://solinaridao.com/';
const ID_PATTERN = /^wrn-[a-z0-9]+-[a-z0-9]+$/;
const JSON_LD_MARKER = '<script type="application/ld+json">';
const TRANSACTION_DIRECTORY = '.article-generator-transaction';
const LOCK_FILE = '.article-generator.lock';
const FAULT_EXIT_CODE = 86;
const MONTHS_DE = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'
];

function usage() {
  return `World Revolution News – append-only article generator

Usage:
  node tools/generate-article-landings.mjs [--check] [options]
  node tools/generate-article-landings.mjs --write [options]

Options:
  --check          Validate and print the plan without generating product output (default)
  --write          Explicitly add new pages and atomically replace manifest/sitemap
  --strict         With --check, exit with code 2 when --write would change files
  --root <path>    Website root (default: current working directory)
  --feed <path>    Feed JSON, relative to root unless absolute (default: news-feed.json)
  --site <url>     Public HTTPS site URL (default: ${DEFAULT_SITE})
  --report <path>  Additionally write the deterministic QA report to this path
  --help           Show this help

Existing article pages are validated and preserved byte-for-byte. There is no
delete, refresh or force mode. Any invocation safely recovers a journalled
transaction left by an interrupted generator process before it continues.
File flushes provide only best-effort filesystem persistence. This is not a
guarantee against power loss, kernel failure or storage failure. This tool never
uploads or deploys; run --write only in a worktree or release candidate, never
directly in a live hosting directory.`;
}

function parseArgs(argv) {
  const options = {
    mode: 'check',
    strict: false,
    root: process.cwd(),
    feed: 'news-feed.json',
    site: DEFAULT_SITE,
    report: '',
    help: false
  };
  let explicitCheck = false;
  let explicitWrite = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--check') {
      explicitCheck = true;
      options.mode = 'check';
    } else if (argument === '--write') {
      explicitWrite = true;
      options.mode = 'write';
    } else if (argument === '--strict') {
      options.strict = true;
    } else if (argument === '--help' || argument === '-h') {
      options.help = true;
    } else if (['--root', '--feed', '--site', '--report'].includes(argument)) {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value.`);
      options[argument.slice(2)] = value;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if (explicitCheck && explicitWrite) throw new Error('--check and --write are mutually exclusive.');
  if (options.strict && options.mode !== 'check') throw new Error('--strict is only valid with --check.');
  options.root = path.resolve(options.root);
  options.feed = path.isAbsolute(options.feed) ? options.feed : path.join(options.root, options.feed);
  if (options.report) {
    options.report = path.isAbsolute(options.report) ? options.report : path.join(options.root, options.report);
  }
  const site = new URL(options.site);
  if (site.protocol !== 'https:') throw new Error('--site must be an absolute HTTPS URL.');
  options.site = new URL('/', site).href;
  return options;
}

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function durableWrite(target, content) {
  // File-level sync narrows the process-crash window. Filesystem, controller and
  // power-loss persistence remains platform-dependent and must be backed by Git
  // plus an immutable release package.
  await mkdir(path.dirname(target), { recursive: true });
  const handle = await open(target, 'w');
  try {
    await handle.writeFile(content);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function fileHash(target) {
  return sha256(await readFile(target));
}

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

async function acquireLock(root) {
  const lockPath = path.join(root, LOCK_FILE);
  const token = `${process.pid}-${randomUUID()}`;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const candidatePath = `${lockPath}.candidate-${token}-${attempt}`;
    try {
      await mkdir(candidatePath);
      await durableWrite(
        path.join(candidatePath, 'owner.json'),
        `${JSON.stringify({ pid: process.pid, token })}\n`
      );
      await rename(candidatePath, lockPath);
      return async () => {
        try {
          const current = JSON.parse(await readFile(path.join(lockPath, 'owner.json'), 'utf8'));
          if (current.token === token) await rm(lockPath, { recursive: true, force: true });
        } catch {
          // A recovered or replaced lock never belongs to this process.
        }
      };
    } catch (error) {
      await rm(candidatePath, { recursive: true, force: true });
      if (!['EEXIST', 'ENOTEMPTY', 'EPERM'].includes(error?.code)) throw error;
      let current;
      try {
        current = JSON.parse(await readFile(path.join(lockPath, 'owner.json'), 'utf8'));
      } catch {
        current = {};
      }
      if (processIsAlive(Number(current.pid))) {
        throw new Error(`Another article generator process is active (PID ${current.pid}).`);
      }
      const stalePath = `${lockPath}.stale-${process.pid}-${attempt}`;
      try {
        await rename(lockPath, stalePath);
        await rm(stalePath, { recursive: true, force: true });
      } catch (renameError) {
        if (!['ENOENT', 'EEXIST'].includes(renameError?.code)) throw renameError;
      }
    }
  }
  throw new Error('Could not acquire the exclusive article-generator lock.');
}

function journalPayload(journal) {
  const { checksum: _checksum, ...payload } = journal;
  return payload;
}

function journalText(journal) {
  const payload = journalPayload(journal);
  return `${JSON.stringify({ ...payload, checksum: sha256(JSON.stringify(payload)) }, null, 2)}\n`;
}

async function writeJournal(transactionRoot, journal) {
  const target = path.join(transactionRoot, 'journal.json');
  const temporary = path.join(transactionRoot, `journal.next-${process.pid}.json`);
  await durableWrite(temporary, journalText(journal));
  await rename(temporary, target);
}

async function readJournal(transactionRoot) {
  const target = path.join(transactionRoot, 'journal.json');
  const journal = JSON.parse(await readFile(target, 'utf8'));
  const payload = journalPayload(journal);
  if (journal.schemaVersion !== 1 || journal.checksum !== sha256(JSON.stringify(payload))) {
    throw new Error('Article-generator transaction journal is corrupt.');
  }
  for (const collection of [journal.old.articles, journal.next.articles, journal.next.newArticles]) {
    const ids = collection.map(item => item.id);
    if (ids.some(id => !ID_PATTERN.test(id)) || new Set(ids).size !== ids.length) {
      throw new Error('Article-generator transaction journal contains unsafe or duplicate IDs.');
    }
  }
  return journal;
}

function injectCrash(point) {
  if (process.env.WRN_ARTICLE_GENERATOR_FAULT === point) {
    process.stderr.write(`Injected article-generator crash at ${point}.\n`);
    process.exit(FAULT_EXIT_CODE);
  }
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function serializeJsonLd(value) {
  const escapes = {
    '<': '\\u003c',
    '>': '\\u003e',
    '&': '\\u0026',
    '\u2028': '\\u2028',
    '\u2029': '\\u2029'
  };
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, character => escapes[character]);
}

function decodeEntities(value) {
  const named = new Map([
    ['amp', '&'], ['lt', '<'], ['gt', '>'], ['quot', '"'],
    ['apos', "'"], ['nbsp', ' '], ['ndash', '–'], ['mdash', '—'],
    ['hellip', '…'], ['laquo', '«'], ['raquo', '»']
  ]);
  return String(value).replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (match, entity) => {
    if (entity.startsWith('#x')) {
      const code = Number.parseInt(entity.slice(2), 16);
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    if (entity.startsWith('#')) {
      const code = Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return named.get(entity.toLowerCase()) ?? match;
  });
}

export function plainText(value, { paragraphs = false } = {}) {
  let result = String(value ?? '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(?:p|div|li|h[1-6]|blockquote)\s*>/gi, '\n\n')
    .replace(/<[^>]*>/g, ' ');
  result = decodeEntities(result)
    .replace(/\u0000/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\t\f\v ]+/g, ' ')
    .replace(/ *\n */g, '\n');
  if (paragraphs) {
    return result.replace(/\n{3,}/g, '\n\n').trim();
  }
  return result.replace(/\s+/g, ' ').trim();
}

function truncateAtWord(value, limit) {
  const text = plainText(value);
  if (text.length <= limit) return text;
  const slice = text.slice(0, Math.max(1, limit - 1));
  const boundary = slice.lastIndexOf(' ');
  return `${slice.slice(0, boundary >= Math.floor(limit * 0.65) ? boundary : slice.length).trimEnd()}…`;
}

function truncateParagraphs(value, limit) {
  const text = plainText(value, { paragraphs: true });
  if (text.length <= limit) return text;
  const slice = text.slice(0, Math.max(1, limit - 1));
  const boundary = Math.max(slice.lastIndexOf(' '), slice.lastIndexOf('\n'));
  return `${slice.slice(0, boundary >= Math.floor(limit * 0.65) ? boundary : slice.length).trimEnd()}…`;
}

function sentenceExcerpt(value, limit) {
  const text = plainText(value);
  if (text.length <= limit) return text;
  const window = text.slice(0, limit);
  const matches = [...window.matchAll(/[.!?…](?=\s|$)/g)];
  const firstComplete = matches.find(match => match.index >= 20);
  return firstComplete ? window.slice(0, firstComplete.index + 1) : truncateAtWord(text, limit);
}

function normalizeLanguage(value) {
  const language = plainText(value).toLowerCase().replaceAll('_', '-');
  if (!language || language === 'unknown') return 'und';
  if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(language)) return 'und';
  return language;
}

function germanDate(isoDate) {
  const date = new Date(isoDate);
  return `${date.getUTCDate()}. ${MONTHS_DE[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function jsonLdFromPage(html, id) {
  const start = html.indexOf(JSON_LD_MARKER);
  const end = html.indexOf('</script>', start);
  if (start < 0 || end < 0) throw new Error(`Existing article ${id} has no readable NewsArticle JSON-LD.`);
  let schema;
  try {
    schema = JSON.parse(html.slice(start + JSON_LD_MARKER.length, end));
  } catch (error) {
    throw new Error(`Existing article ${id} has invalid JSON-LD: ${error.message}`);
  }
  return schema;
}

async function loadCore(root) {
  const corePath = path.join(root, 'website-portal-core.js');
  if (!(await exists(corePath))) throw new Error(`Missing ID contract: ${corePath}`);
  const cacheKey = sha256(await readFile(corePath)).slice(0, 12);
  await import(`${pathToFileURL(corePath).href}?article-generator=${cacheKey}`);
  const core = globalThis.WRNWebsitePortalCore;
  if (!core?.stableArticleId || !core?.safeHttpUrl || !core?.validIsoDate) {
    throw new Error('website-portal-core.js did not expose the required ID and URL helpers.');
  }
  return core;
}

async function scanExistingArticles(root, site, core) {
  const articlesRoot = path.join(root, 'articles');
  if (!(await exists(articlesRoot))) return [];
  const entries = await readdir(articlesRoot, { withFileTypes: true });
  const records = [];
  for (const entry of entries.sort((first, second) => first.name.localeCompare(second.name))) {
    if (!entry.isDirectory()) throw new Error(`Unexpected non-directory in articles/: ${entry.name}`);
    const id = core.normalizeArticleId(entry.name);
    if (!id || id !== entry.name) throw new Error(`Unsafe article directory name: ${entry.name}`);
    const pagePath = path.join(articlesRoot, id, 'index.html');
    const html = await readFile(pagePath, 'utf8');
    const schema = jsonLdFromPage(html, id);
    const original = core.safeHttpUrl(schema.isBasedOn);
    const published = core.validIsoDate(schema.datePublished);
    const canonical = new URL(`/articles/${id}/`, site).href;
    if (!original || new URL(original).protocol !== 'https:') {
      throw new Error(`Existing article ${id} has no safe HTTPS isBasedOn URL.`);
    }
    if (core.stableArticleId({ original }) !== id) {
      throw new Error(`Existing article ${id} no longer matches the shared stable-ID contract.`);
    }
    if (!published) throw new Error(`Existing article ${id} has no valid datePublished.`);
    if (schema.url !== canonical || schema.mainEntityOfPage !== canonical) {
      throw new Error(`Existing article ${id} has a canonical JSON-LD mismatch.`);
    }
    records.push({ id, original, published, canonical, pageHash: sha256(html), existing: true });
  }
  return records;
}

function candidateFromFeed(item, feedIndex, core, site) {
  const title = plainText(item?.title);
  const originalCandidate = item?.original || item?.link || item?.url;
  const original = core.safeHttpUrl(originalCandidate);
  const fallbackId = core.stableArticleId(item || {});
  const base = {
    feedIndex,
    id: fallbackId || '',
    source: plainText(item?.quelleName || item?.source),
    title
  };
  if (!title) return { excluded: { ...base, reason: 'missing-title' } };
  if (!original || new URL(original).protocol !== 'https:') {
    return { excluded: { ...base, reason: 'invalid-original-url' } };
  }
  const derivedId = core.stableArticleId({ original });
  const id = core.stableArticleId({ ...item, original });
  if (!id || !ID_PATTERN.test(id)) return { excluded: { ...base, reason: 'invalid-stable-id' } };
  if (id !== derivedId) {
    throw new Error(`Declared stable ID ${id} does not match original-derived ID ${derivedId}.`);
  }
  const published = core.validIsoDate(item?.published || item?.pubDate || item?.date);
  if (!published) return { excluded: { ...base, id, reason: 'invalid-published-date' } };
  const rawContent = item?.content || item?.description || item?.intro;
  const content = plainText(rawContent, { paragraphs: true });
  if (!content) return { excluded: { ...base, id, reason: 'missing-content' } };
  const imageCandidate = Array.isArray(item?.images) ? item.images[0] : '';
  const imageUrl = core.safeHttpUrl(item?.image || imageCandidate);
  const image = imageUrl && new URL(imageUrl).protocol === 'https:' ? imageUrl : '';
  const source = base.source || 'Originalquelle';
  const author = plainText(item?.author);
  const categories = Array.isArray(item?.categories) ? item.categories : [];
  const section = plainText(item?.primaryTopic || categories[1] || categories[0] || item?.kontinent);
  return {
    article: {
      id,
      original,
      canonical: new URL(`/articles/${id}/`, site).href,
      reader: new URL(`/?article=${encodeURIComponent(id)}`, site).href,
      title,
      source,
      author,
      section,
      published,
      language: normalizeLanguage(item?.language),
      content,
      description: sentenceExcerpt(content, 190),
      intro: truncateAtWord(content, 420),
      body: truncateParagraphs(content, 4500),
      image,
      existing: false
    }
  };
}

function paragraphHtml(value) {
  const paragraphs = String(value).split(/\n{2,}/).map(paragraph => plainText(paragraph)).filter(Boolean);
  return paragraphs.map(paragraph => `<p>${escapeHtml(paragraph)}</p>`).join('');
}

export function renderArticlePage(article, site = DEFAULT_SITE) {
  const fallbackImage = new URL('/site-icon-512.png', site).href;
  const socialImage = article.image || fallbackImage;
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: article.title.slice(0, 220),
    description: article.description,
    mainEntityOfPage: article.canonical,
    url: article.canonical,
    isBasedOn: article.original,
    inLanguage: article.language,
    articleSection: article.section || undefined,
    publisher: {
      '@type': 'NewsMediaOrganization',
      '@id': new URL('/#organization', site).href,
      name: 'World Revolution News',
      logo: {
        '@type': 'ImageObject',
        url: new URL('/site-icon-512.png', site).href,
        width: 512,
        height: 512
      }
    },
    author: article.author
      ? { '@type': 'Person', name: article.author }
      : { '@type': 'Organization', name: article.source },
    datePublished: article.published,
    image: article.image ? [article.image] : undefined
  };
  Object.keys(schema).forEach(key => schema[key] === undefined && delete schema[key]);
  const imageHtml = article.image
    ? `\n      <img class="article-image" src="${escapeHtml(article.image)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`
    : '';
  const sectionHtml = article.section
    ? `\n      <p class="article-meta">${escapeHtml(article.section)}</p>`
    : '';
  return `<!doctype html>
<html lang="${escapeHtml(article.language)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(article.title)} | World Revolution News</title>
  <meta name="description" content="${escapeHtml(article.description)}">
  <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">
  <meta name="referrer" content="no-referrer">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="World Revolution News">
  <meta property="og:title" content="${escapeHtml(article.title)}">
  <meta property="og:description" content="${escapeHtml(article.description)}">
  <meta property="og:url" content="${escapeHtml(article.canonical)}">
  <meta property="og:image" content="${escapeHtml(socialImage)}">
  <meta property="article:published_time" content="${escapeHtml(article.published)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(article.title)}">
  <meta name="twitter:description" content="${escapeHtml(article.description)}">
  <meta name="twitter:image" content="${escapeHtml(socialImage)}">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self'; img-src 'self' https: data:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests">
  <link rel="canonical" href="${escapeHtml(article.canonical)}">
  <link rel="icon" href="/favicon.ico?release=2" sizes="any">
  <link rel="icon" type="image/png" sizes="32x32" href="/site-icon-32.png?release=1">
  <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon-site.png?release=1">
  <link rel="stylesheet" href="/article-landing.css?release=1">
  <script type="application/ld+json">${serializeJsonLd(schema)}</script>
</head>
<body>
  <header class="site-header"><div class="site-header__inner">
    <a class="site-brand" href="/"><img src="/site-icon-192.png?release=1" alt=""><span>WORLD REVOLUTION NEWS</span></a>
    <a class="site-action" href="${escapeHtml(article.reader)}">Interaktiv lesen</a>
  </div></header>
  <main class="article-page">
    <article>
      <p class="article-page__eyebrow">${escapeHtml(article.source)} · ${escapeHtml(germanDate(article.published))}</p>
      <h1>${escapeHtml(article.title)}</h1>${sectionHtml}
      <p class="article-intro">${escapeHtml(article.intro)}</p>${imageHtml}
      <div class="article-body">${paragraphHtml(article.body)}</div>
      <nav class="article-actions" aria-label="Artikelaktionen">
        <a class="primary" href="${escapeHtml(article.reader)}">In World Revolution News weiterlesen</a>
        <a class="source" href="${escapeHtml(article.original)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">Originalquelle öffnen</a>
      </nav>
    </article>
  </main>
  <footer class="site-footer">World Revolution News · Unabhängige internationale Nachrichten aus sozialen Bewegungen.</footer>
</body>
</html>
`;
}

function manifestFor(records, feedHash) {
  const ids = records.map(record => record.id).sort();
  return {
    schemaVersion: 1,
    revision: `sha256:${feedHash}`,
    articleCount: ids.length,
    ids,
    sitemap: '/sitemap.xml',
    articlePathPattern: '^/articles/(wrn-[a-z0-9]+-[a-z0-9]+)/?$',
    fallback: '/?article={id}'
  };
}

function sitemapFor(records, site) {
  const ordered = [...records].sort((first, second) => {
    const dateOrder = second.published.localeCompare(first.published);
    return dateOrder || first.id.localeCompare(second.id);
  });
  const rows = [
    `  <url><loc>${escapeHtml(site)}</loc><changefreq>hourly</changefreq><priority>1.0</priority></url>`,
    `  <url><loc>${escapeHtml(new URL('/privacy.html', site).href)}</loc><changefreq>monthly</changefreq><priority>0.3</priority></url>`
  ];
  ordered.forEach(record => {
    rows.push(`  <url><loc>${escapeHtml(record.canonical)}</loc><lastmod>${record.published.slice(0, 10)}</lastmod><changefreq>monthly</changefreq><priority>0.6</priority></url>`);
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.join('\n')}\n</urlset>\n`;
}

function sitemapIds(xml) {
  return [...xml.matchAll(/<loc>[^<]*\/articles\/(wrn-[a-z0-9]+-[a-z0-9]+)\/<\/loc>/g)].map(match => match[1]);
}

function assertSameSet(label, expected, actual) {
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  if (actual.length !== actualSet.size) throw new Error(`${label} contains duplicate article IDs.`);
  const missing = [...expectedSet].filter(value => !actualSet.has(value));
  const extra = [...actualSet].filter(value => !expectedSet.has(value));
  if (missing.length || extra.length) {
    throw new Error(`${label} set mismatch (missing: ${missing.slice(0, 3)}, extra: ${extra.slice(0, 3)}).`);
  }
}

function validateGenerated(records, manifestText, sitemapText, newPages, site) {
  const ids = records.map(record => record.id);
  const manifest = JSON.parse(manifestText);
  assertSameSet('Manifest', ids, manifest.ids);
  assertSameSet('Sitemap', ids, sitemapIds(sitemapText));
  if (manifest.articleCount !== ids.length) throw new Error('Manifest articleCount is inconsistent.');
  for (const [id, html] of newPages) {
    const schema = jsonLdFromPage(html, id);
    const canonical = new URL(`/articles/${id}/`, site).href;
    if (schema.url !== canonical || schema.mainEntityOfPage !== canonical) {
      throw new Error(`Generated article ${id} has inconsistent canonical metadata.`);
    }
    if (html.includes('</script><script') || html.includes('<img onerror')) {
      throw new Error(`Generated article ${id} contains unsafe markup.`);
    }
  }
}

async function readOptional(target) {
  return (await exists(target)) ? readFile(target, 'utf8') : '';
}

export async function createPlan(options) {
  const core = await loadCore(options.root);
  const feedBytes = await readFile(options.feed);
  const payload = JSON.parse(feedBytes.toString('utf8'));
  const feedItems = Array.isArray(payload) ? payload : (payload?.items || payload?.articles);
  if (!Array.isArray(feedItems)) throw new Error('Feed must be an array or contain an items/articles array.');
  const existing = await scanExistingArticles(options.root, options.site, core);
  const byId = new Map(existing.map(record => [record.id, record]));
  const excluded = [];
  const candidates = [];
  feedItems.forEach((item, index) => {
    const result = candidateFromFeed(item, index, core, options.site);
    if (result.excluded) excluded.push(result.excluded);
    else candidates.push(result.article);
  });
  candidates.sort((first, second) => first.id.localeCompare(second.id));
  const newArticles = [];
  const eligibleIds = new Set();
  for (const article of candidates) {
    eligibleIds.add(article.id);
    const priorCandidate = newArticles.find(candidate => candidate.id === article.id);
    const existingRecord = byId.get(article.id);
    const conflict = priorCandidate || existingRecord;
    if (conflict) {
      if (conflict.original !== article.original) {
        throw new Error(`Stable-ID collision for ${article.id}: ${conflict.original} versus ${article.original}`);
      }
      continue;
    }
    byId.set(article.id, article);
    newArticles.push(article);
  }
  const records = [...byId.values()];
  const feedHash = sha256(feedBytes);
  const manifestText = `${JSON.stringify(manifestFor(records, feedHash), null, 2)}\n`;
  const sitemapText = sitemapFor(records, options.site);
  const newPages = new Map(newArticles.map(article => [article.id, renderArticlePage(article, options.site)]));
  validateGenerated(records, manifestText, sitemapText, newPages, options.site);
  const manifestPath = path.join(options.root, 'article-landing-manifest.json');
  const sitemapPath = path.join(options.root, 'sitemap.xml');
  const currentManifest = await readOptional(manifestPath);
  const currentSitemap = await readOptional(sitemapPath);
  excluded.sort((first, second) => (
    first.reason.localeCompare(second.reason)
      || first.id.localeCompare(second.id)
      || first.title.localeCompare(second.title)
  ));
  const report = {
    schemaVersion: 1,
    feed: path.relative(options.root, options.feed).replaceAll('\\', '/'),
    feedSha256: feedHash,
    candidateCount: feedItems.length,
    eligibleCount: candidates.length,
    existingCount: existing.length,
    preservedCount: eligibleIds.size - newArticles.length,
    newCount: newArticles.length,
    finalCount: records.length,
    excludedCount: excluded.length,
    newIds: newArticles.map(article => article.id),
    excluded,
    manifestChanged: currentManifest !== manifestText,
    sitemapChanged: currentSitemap !== sitemapText,
    writeRequired: newArticles.length > 0 || currentManifest !== manifestText || currentSitemap !== sitemapText
  };
  return { records, newArticles, newPages, manifestText, sitemapText, report, site: options.site };
}

async function articleState(root, expectedArticles) {
  const articlesRoot = path.join(root, 'articles');
  const entries = (await exists(articlesRoot)) ? await readdir(articlesRoot, { withFileTypes: true }) : [];
  if (entries.some(entry => !entry.isDirectory())) return false;
  const liveIds = entries.map(entry => entry.name).sort();
  const expectedIds = expectedArticles.map(item => item.id).sort();
  if (liveIds.length !== expectedIds.length || liveIds.some((id, index) => id !== expectedIds[index])) return false;
  for (const article of expectedArticles) {
    const target = path.join(articlesRoot, article.id, 'index.html');
    if (!(await exists(target)) || await fileHash(target) !== article.sha256) return false;
  }
  return true;
}

async function metadataState(root, descriptor) {
  const target = path.join(root, descriptor.name);
  if (!descriptor.exists) return !(await exists(target));
  return (await exists(target)) && await fileHash(target) === descriptor.sha256;
}

async function stateMatches(root, journal, stateName) {
  try {
    const state = journal[stateName];
    if (!(await articleState(root, state.articles))) return false;
    if (!(await metadataState(root, state.manifest)) || !(await metadataState(root, state.sitemap))) return false;
    if (stateName === 'next') {
      const manifest = JSON.parse(await readFile(path.join(root, state.manifest.name), 'utf8'));
      const sitemap = await readFile(path.join(root, state.sitemap.name), 'utf8');
      const ids = state.articles.map(item => item.id);
      assertSameSet('Recovered manifest', ids, manifest.ids);
      assertSameSet('Recovered sitemap', ids, sitemapIds(sitemap));
      if (manifest.articleCount !== ids.length) return false;
    } else if (state.sitemap.exists) {
      const sitemap = await readFile(path.join(root, state.sitemap.name), 'utf8');
      assertSameSet('Recovered old sitemap', state.articles.map(item => item.id), sitemapIds(sitemap));
    }
    return true;
  } catch {
    return false;
  }
}

async function replaceFromBackup(backup, target) {
  const content = await readFile(backup);
  const temporary = `${target}.recovery-${process.pid}`;
  await durableWrite(temporary, content);
  await rename(temporary, target);
}

async function restoreMetadata(root, transactionRoot, oldDescriptor, nextDescriptor) {
  const target = path.join(root, oldDescriptor.name);
  const targetExists = await exists(target);
  if (targetExists) {
    const currentHash = await fileHash(target);
    const allowed = new Set([oldDescriptor.sha256, nextDescriptor.sha256].filter(Boolean));
    if (!allowed.has(currentHash)) {
      throw new Error(`Recovery stopped: ${oldDescriptor.name} contains an unknown concurrent version.`);
    }
  }
  if (oldDescriptor.exists) {
    const backup = path.join(transactionRoot, 'old', oldDescriptor.name);
    if (!(await exists(backup)) || await fileHash(backup) !== oldDescriptor.sha256) {
      throw new Error(`Recovery stopped: backup for ${oldDescriptor.name} is missing or corrupt.`);
    }
    await replaceFromBackup(backup, target);
  } else if (targetExists) {
    if (await fileHash(target) !== nextDescriptor.sha256) {
      throw new Error(`Recovery stopped: refusing to remove unknown ${oldDescriptor.name}.`);
    }
    await rm(target, { force: true });
  }
}

async function recoverTransaction(root) {
  const transactionRoot = path.join(root, TRANSACTION_DIRECTORY);
  if (!(await exists(transactionRoot))) return 'none';
  const journalPath = path.join(transactionRoot, 'journal.json');
  if (!(await exists(journalPath))) {
    // The journal is the last preparation write and live paths are touched only
    // afterwards. Without it, this is an uncommitted staging directory.
    await rm(transactionRoot, { recursive: true, force: true });
    return 'discarded-unprepared';
  }
  const journal = await readJournal(transactionRoot);
  if (await stateMatches(root, journal, 'next')) {
    await rm(transactionRoot, { recursive: true, force: true });
    return 'kept-new';
  }

  const oldById = new Map(journal.old.articles.map(article => [article.id, article]));
  const nextById = new Map(journal.next.articles.map(article => [article.id, article]));
  const articlesRoot = path.join(root, 'articles');
  const liveEntries = (await exists(articlesRoot)) ? await readdir(articlesRoot, { withFileTypes: true }) : [];
  if (liveEntries.some(entry => !entry.isDirectory() || !nextById.has(entry.name))) {
    throw new Error('Recovery stopped: articles/ contains an unknown concurrent entry.');
  }
  for (const oldArticle of journal.old.articles) {
    const target = path.join(articlesRoot, oldArticle.id, 'index.html');
    if (!(await exists(target)) || await fileHash(target) !== oldArticle.sha256) {
      throw new Error(`Recovery stopped: historical article ${oldArticle.id} changed.`);
    }
  }
  for (const newArticle of journal.next.newArticles) {
    const target = path.join(articlesRoot, newArticle.id);
    if (!(await exists(target))) continue;
    const page = path.join(target, 'index.html');
    if (!(await exists(page)) || await fileHash(page) !== newArticle.sha256 || oldById.has(newArticle.id)) {
      throw new Error(`Recovery stopped: refusing to remove unexpected article ${newArticle.id}.`);
    }
    await rm(target, { recursive: true, force: true });
  }
  await restoreMetadata(root, transactionRoot, journal.old.manifest, journal.next.manifest);
  await restoreMetadata(root, transactionRoot, journal.old.sitemap, journal.next.sitemap);
  if (!(await stateMatches(root, journal, 'old'))) {
    throw new Error('Recovery failed to prove a complete old article state.');
  }
  await rm(transactionRoot, { recursive: true, force: true });
  return 'restored-old';
}

async function prepareTransaction(root, plan) {
  const transactionRoot = path.join(root, TRANSACTION_DIRECTORY);
  if (await exists(transactionRoot)) throw new Error('An unrecovered article-generator transaction already exists.');
  const newRoot = path.join(transactionRoot, 'new');
  const oldRoot = path.join(transactionRoot, 'old');
  await mkdir(path.join(newRoot, 'articles'), { recursive: true });
  await mkdir(oldRoot, { recursive: true });
  for (const [id, html] of plan.newPages) {
    const directory = path.join(newRoot, 'articles', id);
    await mkdir(directory, { recursive: true });
    await durableWrite(path.join(directory, 'index.html'), html);
  }
  await durableWrite(path.join(newRoot, 'article-landing-manifest.json'), plan.manifestText);
  await durableWrite(path.join(newRoot, 'sitemap.xml'), plan.sitemapText);

  const oldManifestPath = path.join(root, 'article-landing-manifest.json');
  const oldSitemapPath = path.join(root, 'sitemap.xml');
  const oldManifestExists = await exists(oldManifestPath);
  const oldSitemapExists = await exists(oldSitemapPath);
  const oldManifest = oldManifestExists ? await readFile(oldManifestPath) : null;
  const oldSitemap = oldSitemapExists ? await readFile(oldSitemapPath) : null;
  if (oldManifest) await durableWrite(path.join(oldRoot, 'article-landing-manifest.json'), oldManifest);
  if (oldSitemap) await durableWrite(path.join(oldRoot, 'sitemap.xml'), oldSitemap);

  const baseline = plan.records.filter(record => record.existing).map(record => ({
    id: record.id,
    sha256: record.pageHash
  })).sort((first, second) => first.id.localeCompare(second.id));
  const newArticles = [...plan.newPages].map(([id, html]) => ({ id, sha256: sha256(html) }))
    .sort((first, second) => first.id.localeCompare(second.id));
  const journal = {
    schemaVersion: 1,
    transactionId: randomUUID(),
    phase: 'prepared',
    old: {
      articles: baseline,
      manifest: {
        name: 'article-landing-manifest.json',
        exists: oldManifestExists,
        sha256: oldManifest ? sha256(oldManifest) : ''
      },
      sitemap: {
        name: 'sitemap.xml',
        exists: oldSitemapExists,
        sha256: oldSitemap ? sha256(oldSitemap) : ''
      }
    },
    next: {
      articles: [...baseline, ...newArticles].sort((first, second) => first.id.localeCompare(second.id)),
      newArticles,
      manifest: {
        name: 'article-landing-manifest.json',
        exists: true,
        sha256: sha256(plan.manifestText)
      },
      sitemap: {
        name: 'sitemap.xml',
        exists: true,
        sha256: sha256(plan.sitemapText)
      }
    }
  };
  await writeJournal(transactionRoot, journal);
  return { transactionRoot, journal };
}

async function commitPlan(root, plan) {
  const { transactionRoot, journal } = await prepareTransaction(root, plan);
  try {
    const articlesRoot = path.join(root, 'articles');
    await mkdir(articlesRoot, { recursive: true });
    for (const article of journal.next.newArticles) {
      const target = path.join(articlesRoot, article.id);
      if (await exists(target)) throw new Error(`Concurrent article appeared during staging: ${article.id}`);
      await rename(path.join(transactionRoot, 'new', 'articles', article.id), target);
    }
    injectCrash('after-articles-rename');
    journal.phase = 'articles-installed';
    await writeJournal(transactionRoot, journal);

    await rename(
      path.join(transactionRoot, 'new', journal.next.manifest.name),
      path.join(root, journal.next.manifest.name)
    );
    injectCrash('after-manifest-rename');
    journal.phase = 'manifest-installed';
    await writeJournal(transactionRoot, journal);

    await rename(
      path.join(transactionRoot, 'new', journal.next.sitemap.name),
      path.join(root, journal.next.sitemap.name)
    );
    injectCrash('after-sitemap-rename');
    journal.phase = 'sitemap-installed';
    await writeJournal(transactionRoot, journal);

    if (!(await stateMatches(root, journal, 'next'))) {
      throw new Error('New article state failed its final hash/set proof.');
    }
    journal.phase = 'verified';
    await writeJournal(transactionRoot, journal);
    injectCrash('after-verification');
    await rm(transactionRoot, { recursive: true, force: true });
  } catch (error) {
    await recoverTransaction(root);
    throw error;
  }
}

async function atomicWriteReport(target, reportText) {
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`;
  const backup = `${target}.backup-${process.pid}-${randomUUID()}`;
  const hadTarget = await exists(target);
  if (hadTarget) await durableWrite(backup, await readFile(target));
  await durableWrite(temporary, reportText);
  try {
    await rename(temporary, target);
    if (await fileHash(target) !== sha256(reportText)) throw new Error('QA report hash verification failed.');
    if (hadTarget) await rm(backup, { force: true });
  } catch (error) {
    if (hadTarget && await exists(backup)) await replaceFromBackup(backup, target);
    throw error;
  } finally {
    if (await exists(temporary)) await rm(temporary, { force: true });
    if (await exists(backup)) await rm(backup, { force: true });
  }
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return 0;
  }
  const releaseLock = await acquireLock(options.root);
  try {
    await recoverTransaction(options.root);
    const plan = await createPlan(options);
    if (options.mode === 'write' && plan.report.writeRequired) await commitPlan(options.root, plan);
    const reportText = `${JSON.stringify(plan.report, null, 2)}\n`;
    if (options.report) await atomicWriteReport(options.report, reportText);
    process.stdout.write(reportText);
    return options.strict && plan.report.writeRequired ? 2 : 0;
  } finally {
    await releaseLock();
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath && path.resolve(fileURLToPath(import.meta.url)) === invokedPath) {
  main().then(code => {
    process.exitCode = code;
  }).catch(error => {
    process.stderr.write(`Article generator failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
