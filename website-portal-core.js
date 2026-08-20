/* Pure, testable website helpers. No DOM access and no implicit relative URLs. */
'use strict';

((scope) => {
  const text = value => String(value ?? '').trim();
  const STABLE_ARTICLE_ID = /^wrn-[a-z0-9]+-[a-z0-9]+$/i;

  function safeHttpUrl(value) {
    const candidate = text(value);
    if (!candidate) return null;
    try {
      const url = new URL(candidate);
      const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
      return url.protocol === 'https:' || (url.protocol === 'http:' && loopback) ? url.href : null;
    } catch {
      return null;
    }
  }

  function normalizeArticleId(value) {
    const candidate = text(value);
    return STABLE_ARTICLE_ID.test(candidate) ? candidate.toLowerCase() : '';
  }

  function stableArticleId(article = {}) {
    const declared = normalizeArticleId(article.websiteArticleId || article.stableId);
    if (declared) return declared;
    const original = safeHttpUrl(article.original || article.link || article.url || article.id);
    const legacyId = normalizeArticleId(article.id);
    if (!original && legacyId) return legacyId;
    const identity = original || [
      text(article.source || article.quelleName),
      text(article.title),
      text(article.published || article.pubDate || article.date)
    ].join('\u001f');
    if (!identity.replace(/\u001f/g, '')) return '';
    let first = 0x811c9dc5;
    let second = 0x9e3779b9;
    for (let index = 0; index < identity.length; index += 1) {
      const code = identity.charCodeAt(index);
      first ^= code;
      first = Math.imul(first, 0x01000193) >>> 0;
      second ^= code + index;
      second = Math.imul(second, 0x85ebca6b) >>> 0;
    }
    return `wrn-${first.toString(36)}-${second.toString(36)}`;
  }

  function validIsoDate(value) {
    const candidate = text(value);
    if (!candidate) return null;
    const timestamp = Date.parse(candidate);
    return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
  }

  function articleLandingUrl(article = {}, siteUrl = 'https://solinaridao.com/') {
    const stableId = stableArticleId(article);
    const site = safeHttpUrl(siteUrl);
    if (!stableId || !site) return '';
    return new URL(`/articles/${encodeURIComponent(stableId)}/`, site).href;
  }

  function articleReaderUrl(article = {}, siteUrl = 'https://solinaridao.com/') {
    const stableId = stableArticleId(article);
    const site = safeHttpUrl(siteUrl);
    if (!stableId || !site) return '';
    const reader = new URL('/', site);
    reader.searchParams.set('article', stableId);
    return reader.href;
  }

  function hasStaticLanding(manifest, article = {}) {
    const stableId = stableArticleId(article);
    if (!stableId) return false;
    if (manifest instanceof Set || typeof manifest?.has === 'function') return manifest.has(stableId);
    const ids = Array.isArray(manifest) ? manifest : manifest?.ids;
    return Array.isArray(ids) && ids.some(value => normalizeArticleId(value) === stableId);
  }

  function articlePublicUrl(article = {}, siteUrl = 'https://solinaridao.com/', manifest = null) {
    return hasStaticLanding(manifest, article)
      ? articleLandingUrl(article, siteUrl)
      : articleReaderUrl(article, siteUrl);
  }

  function articleControlId(controlId, containerId, insideArticleDialog = false) {
    const ownId = stableArticleId({ id: controlId });
    if (ownId) return ownId;
    if (insideArticleDialog) return '';
    return stableArticleId({ id: containerId });
  }

  function buildArticleMetadata(article = {}, pageUrl, options = {}) {
    const original = safeHttpUrl(article.original || article.link || article.url);
    const title = text(article.title);
    const stableId = stableArticleId({ ...article, original });
    const page = safeHttpUrl(pageUrl);
    if (!original || !title || !stableId || !page) return null;
    const appUrl = new URL(page);
    appUrl.search = '';
    appUrl.hash = '';
    appUrl.searchParams.set('article', stableId);
    const publicUrl = safeHttpUrl(options.publicUrl)
      || articleLandingUrl({ stableId }, page);
    const image = safeHttpUrl(article.image);
    const published = validIsoDate(article.published || article.pubDate || article.date);
    return {
      id: stableId,
      original,
      canonical: publicUrl,
      appUrl: appUrl.href,
      title,
      description: text(article.description || article.intro).slice(0, 500),
      source: text(article.source),
      image,
      published
    };
  }

  scope.WRNWebsitePortalCore = Object.freeze({
    buildArticleMetadata,
    articleLandingUrl,
    articleControlId,
    articlePublicUrl,
    articleReaderUrl,
    hasStaticLanding,
    normalizeArticleId,
    safeHttpUrl,
    stableArticleId,
    validIsoDate
  });
})(typeof window !== 'undefined' ? window : globalThis);
