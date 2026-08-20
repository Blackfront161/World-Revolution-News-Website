/* World Revolution News – website-only portal enhancements. */
'use strict';

(() => {
  const core = window.WRNWebsitePortalCore;
  if (!core) throw new Error('WRN website portal core is unavailable');

  const PLAY_URL = 'https://play.google.com/store/apps/details?id=com.world.revolution';
  const SITE_URL = 'https://solinaridao.com/';
  const DEFAULT_TITLE = document.title;
  const viewRoot = document.getElementById('next-view') || document.getElementById('next-main');
  const donationDialog = document.getElementById('next-donation-dialog');
  const donateButton = document.querySelector('.website-header-donate-button');
  const articleDialog = document.getElementById('next-article-dialog');
  const canonical = document.querySelector('link[rel="canonical"]');
  const initialMeta = new Map();
  let activeMetadataId = '';
  let restoreController = null;
  let articleReturnFocus = null;
  let articleReturnId = '';
  const landingIds = new Set();
  let landingManifestReady = false;

  function enforceWebsiteFontScale() {
    const select = document.getElementById('next-menu-font-size');
    if (!select) return;
    const unsupportedScaleActive = document.documentElement.dataset.fontSize === '200'
      || select.value === '200';
    select.querySelector('option[value="200"]')?.remove();
    if (!unsupportedScaleActive) return;
    select.value = 'normal';
    document.documentElement.dataset.fontSize = 'normal';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }

  enforceWebsiteFontScale();

  document.querySelectorAll('meta[property^="og:"], meta[name^="twitter:"]').forEach(node => {
    initialMeta.set(node.getAttribute('property') || node.getAttribute('name'), node.content);
  });

  function resolvedLink(value) {
    const candidate = String(value ?? '').trim();
    if (!candidate) return null;
    try {
      const url = new URL(candidate, location.href);
      if (url.protocol === 'http:' || url.protocol === 'https:') return url;
      const decodedPath = decodeURIComponent(url.pathname);
      if (url.protocol === 'tel:' && /^\+?[0-9][0-9().+\-\s]{2,}$/.test(decodedPath)) return url;
      if (url.protocol === 'mailto:' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(decodedPath)) return url;
      return null;
    } catch {
      return null;
    }
  }

  function hardenExternalLinks(root = document) {
    const links = root.matches?.('a[href]') ? [root] : [...root.querySelectorAll?.('a[href]') || []];
    links.forEach(link => {
      const url = resolvedLink(link.getAttribute('href'));
      if (!url) {
        link.removeAttribute('href');
        return;
      }
      if (url.protocol === 'tel:' || url.protocol === 'mailto:') {
        link.removeAttribute('target');
        link.removeAttribute('rel');
        return;
      }
      if (url.origin !== location.origin) {
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.referrerPolicy = 'no-referrer';
      }
    });
  }

  function setMeta(selector, attribute, value) {
    const node = document.querySelector(selector);
    if (node) node.setAttribute(attribute, value || '');
  }

  function setSchema(id, data) {
    let node = document.getElementById(id);
    if (!node) {
      node = document.createElement('script');
      node.type = 'application/ld+json';
      node.id = id;
      document.head.append(node);
    }
    node.textContent = JSON.stringify(data);
  }

  setSchema('wrn-site-schema', {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'NewsMediaOrganization',
        '@id': `${SITE_URL}#organization`,
        name: 'World Revolution News',
        url: SITE_URL,
        logo: {
          '@type': 'ImageObject',
          url: `${SITE_URL}site-icon-512.png`,
          width: 512,
          height: 512
        },
        publishingPrinciples: `${SITE_URL}privacy.html`
      },
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}#website`,
        url: SITE_URL,
        name: 'World Revolution News',
        description: 'Independent international news and media from social movements worldwide.',
        publisher: { '@id': `${SITE_URL}#organization` },
        inLanguage: ['de', 'en', 'es', 'fr', 'it', 'pt', 'ru', 'el', 'tr']
      }
    ]
  });

  function updateScrolledHeader() {
    document.documentElement.classList.toggle(
      'website-scrolled',
      window.scrollY > 36
    );
  }

  let scrollFrame = 0;
  addEventListener('scroll', () => {
    if (scrollFrame) return;
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = 0;
      updateScrolledHeader();
    });
  }, { passive: true });
  addEventListener('resize', updateScrolledHeader, { passive: true });

  if (donateButton && donationDialog) {
    donateButton.addEventListener('click', () => {
      if (!donationDialog.open) donationDialog.showModal();
    });
  }

  document.querySelectorAll('.website-header-app-button, #next-brand-link').forEach(link => {
    link.href = PLAY_URL;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.referrerPolicy = 'no-referrer';
  });

  function readOpenArticle() {
    if (!articleDialog?.open) return null;
    const title = (
      articleDialog.querySelector('#next-article-content h1')
      || articleDialog.querySelector('#next-article-title')
    )?.textContent?.trim();
    const original = core.safeHttpUrl(articleDialog.querySelector('.article-source-link a')?.getAttribute('href'));
    if (!title || !original) return null;
    return {
      id: articleDialog.dataset.articleId,
      title,
      original,
      source: document.getElementById('next-article-source')?.textContent?.split(' · ')[0]?.trim(),
      description: articleDialog.querySelector('.article-intro')?.textContent?.trim(),
      image: articleDialog.dataset.articleImage || articleDialog.querySelector('.article-lead-image')?.getAttribute('src'),
      published: articleDialog.dataset.articlePublished
    };
  }

  function articleLandingHref(articleId) {
    const stableId = core.stableArticleId({ id: articleId });
    if (!stableId) return '';
    return landingManifestReady && landingIds.has(stableId)
      ? `/articles/${encodeURIComponent(stableId)}/`
      : `/?article=${encodeURIComponent(stableId)}`;
  }

  function shareArticleUrl(article) {
    return core.articlePublicUrl(
      article,
      SITE_URL,
      landingManifestReady ? landingIds : null
    );
  }

  function requestArticleOpen(stableId) {
    const detail = { id: stableId, opened: false };
    window.dispatchEvent(new CustomEvent('wrn:open-article-request', { detail }));
    return detail.opened === true;
  }

  function enhanceArticleLinks(root = document) {
    const candidates = root.matches?.('[data-action="open"]')
      ? [root]
      : [...root.querySelectorAll?.('[data-action="open"]') || []];
    candidates.forEach(control => {
      const articleId = core.articleControlId(
        control.dataset.articleId,
        control.closest('[data-article-id]')?.dataset.articleId,
        Boolean(control.closest('#next-article-dialog'))
      );
      const href = articleLandingHref(articleId);
      if (!href) return;
      if (control instanceof HTMLAnchorElement) {
        control.href = href;
        return;
      }
      if (!(control instanceof HTMLButtonElement)) return;
      const link = document.createElement('a');
      [...control.attributes].forEach(attribute => {
        if (attribute.name !== 'type') link.setAttribute(attribute.name, attribute.value);
      });
      link.href = href;
      link.innerHTML = control.innerHTML;
      control.replaceWith(link);
    });
  }

  document.addEventListener('click', event => {
    const link = event.target.closest?.('a[data-action="open"]');
    if (!link) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      event.stopPropagation();
      return;
    }
    event.preventDefault();
    const stableId = core.articleControlId(
      link.dataset.articleId,
      link.closest('[data-article-id]')?.dataset.articleId,
      Boolean(link.closest('#next-article-dialog'))
    );
    if (stableId && requestArticleOpen(stableId)) {
      event.stopImmediatePropagation();
    }
  }, true);

  function updateArticleMetadata() {
    const article = readOpenArticle();
    const metadata = core.buildArticleMetadata(article || {}, location.href, {
      publicUrl: article ? shareArticleUrl(article) : ''
    });
    if (!metadata) return false;
    if (activeMetadataId !== metadata.id || new URL(location.href).searchParams.get('article') !== metadata.id) {
      history.replaceState(history.state, '', metadata.appUrl);
    }
    activeMetadataId = metadata.id;
    document.title = `${metadata.title} – World Revolution News`;
    canonical?.setAttribute('href', metadata.canonical);
    setMeta('meta[property="og:type"]', 'content', 'article');
    setMeta('meta[property="og:title"]', 'content', metadata.title);
    setMeta('meta[property="og:description"]', 'content', metadata.description);
    setMeta('meta[property="og:url"]', 'content', metadata.canonical);
    setMeta('meta[property="og:image"]', 'content', metadata.image || initialMeta.get('og:image') || '');
    setMeta('meta[name="twitter:title"]', 'content', metadata.title);
    setMeta('meta[name="twitter:description"]', 'content', metadata.description);
    setMeta('meta[name="twitter:image"]', 'content', metadata.image || initialMeta.get('twitter:image') || '');
    const schema = {
      '@context': 'https://schema.org',
      '@type': 'NewsArticle',
      headline: metadata.title.slice(0, 220),
      mainEntityOfPage: metadata.canonical,
      isBasedOn: metadata.original,
      publisher: { '@type': 'NewsMediaOrganization', name: 'World Revolution News', url: SITE_URL },
      author: { '@type': 'Organization', name: metadata.source || 'Originalquelle' }
    };
    if (metadata.description) schema.description = metadata.description;
    if (metadata.image) schema.image = [metadata.image];
    if (metadata.published) schema.datePublished = metadata.published;
    setSchema('wrn-article-schema', schema);
    return true;
  }

  function resetArticleMetadata({ preserveDeepLink = false } = {}) {
    if (articleDialog?.open) return;
    activeMetadataId = '';
    if (!preserveDeepLink) {
      const current = new URL(location.href);
      current.searchParams.delete('article');
      history.replaceState(history.state, '', current);
    }
    document.title = DEFAULT_TITLE;
    canonical?.setAttribute('href', SITE_URL);
    initialMeta.forEach((value, key) => {
      const selector = key.startsWith('og:') ? `meta[property="${key}"]` : `meta[name="${key}"]`;
      setMeta(selector, 'content', value);
    });
    document.getElementById('wrn-article-schema')?.remove();
  }

  document.addEventListener('click', event => {
    const opener = event.target.closest?.('[data-action="open"]');
    if (opener) {
      articleReturnFocus = opener;
      const container = opener.closest('[data-article-id]');
      articleReturnId = core.stableArticleId({ id: container?.dataset.articleId });
    }
  }, true);

  articleDialog?.addEventListener('close', () => {
    resetArticleMetadata();
    const target = articleReturnFocus;
    const stableId = articleReturnId;
    articleReturnFocus = null;
    articleReturnId = '';
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const rendered = stableId ? findRenderedArticle(stableId) : null;
      const currentTarget = rendered?.querySelector?.('[data-action="open"]') || target;
      if (currentTarget?.isConnected) currentTarget.focus({ preventScroll: true });
    }));
  });

  const observer = new MutationObserver(records => {
    records.forEach(record => record.addedNodes.forEach(node => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        hardenExternalLinks(node);
        enhanceArticleLinks(node);
      }
    }));
    if (articleDialog?.open) updateArticleMetadata();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  enhanceArticleLinks();

  function enhanceEditorialImage(image) {
    if (!(image instanceof HTMLImageElement) || image.dataset.websiteImageReady) return;
    image.dataset.websiteImageReady = 'true';
    image.decoding = 'async';
    const isHero = Boolean(image.closest('.home-hero'));
    image.loading = isHero ? 'eager' : 'lazy';
    if (isHero) image.fetchPriority = 'high';
    const finish = () => {
      if (!image.naturalWidth || !image.naturalHeight) return;
      if (!image.hasAttribute('width')) image.width = image.naturalWidth;
      if (!image.hasAttribute('height')) image.height = image.naturalHeight;
      const ratio = image.naturalWidth / image.naturalHeight;
      image.dataset.fit = ratio < 1.2 || ratio > 2.25 ? 'contain' : 'cover';
    };
    image.addEventListener('load', finish);
    if (image.complete) finish();
    image.addEventListener('error', () => image.closest('.home-hero__image, .news-card__image')?.classList.add('image-unavailable'), { once: true });
  }

  document.querySelectorAll('.home-hero__image img, .news-card__image img, .article-lead-image').forEach(enhanceEditorialImage);
  new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (node.matches?.('.home-hero__image img, .news-card__image img, .article-lead-image')) enhanceEditorialImage(node);
    node.querySelectorAll?.('.home-hero__image img, .news-card__image img, .article-lead-image').forEach(enhanceEditorialImage);
  }))).observe(viewRoot, { childList: true, subtree: true });

  const delay = (ms, signal) => new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const timeout = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timeout);
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });

  function findRenderedArticle(stableId) {
    return [...viewRoot.querySelectorAll('[data-article-id]')].find(node => (
      core.stableArticleId({ id: node.dataset.articleId }) === stableId
    )) || null;
  }

  async function loadLandingManifest() {
    try {
      const response = await fetch('/article-landing-manifest.json?release=1', { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const manifest = await response.json();
      (Array.isArray(manifest.ids) ? manifest.ids : []).forEach(value => {
        const stableId = core.normalizeArticleId(value);
        if (stableId) landingIds.add(stableId);
      });
      const sitemapUrl = String(manifest.sitemap || '').trim();
      if (sitemapUrl) {
        const sitemapResponse = await fetch(sitemapUrl, { cache: 'no-store' });
        if (!sitemapResponse.ok) throw new Error(`Sitemap HTTP ${sitemapResponse.status}`);
        const sitemap = new DOMParser().parseFromString(await sitemapResponse.text(), 'application/xml');
        sitemap.querySelectorAll('loc').forEach(node => {
          try {
            const match = new URL(node.textContent.trim(), location.href).pathname
              .match(/^\/articles\/(wrn-[a-z0-9]+-[a-z0-9]+)\/?$/i);
            const stableId = core.normalizeArticleId(match?.[1]);
            if (stableId) landingIds.add(stableId);
          } catch {}
        });
      }
    } catch (error) {
      console.warn('Article landing manifest unavailable; using reader deep links', error);
    } finally {
      landingManifestReady = true;
      enhanceArticleLinks(document);
      if (articleDialog?.open) updateArticleMetadata();
    }
    return landingIds;
  }

  async function waitForRenderedArticle(stableId, signal, timeoutMs = 22000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const node = findRenderedArticle(stableId);
      if (node) return node;
      await delay(200, signal);
    }
    return null;
  }

  async function waitForArticleBridge(stableId, signal, timeoutMs = 22000) {
    const appRendered = () => document.getElementById('next-loading')?.hidden === true;
    if (appRendered() && requestArticleOpen(stableId)) return true;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await delay(200, signal);
      if (appRendered() && requestArticleOpen(stableId)) return true;
    }
    return false;
  }

  function feedItems(payload) {
    return Array.isArray(payload) ? payload : (payload?.items || payload?.articles || []);
  }

  async function fetchJsonWithTimeout(url, signal, timeoutMs = 12000) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
    }
  }

  function configuredFeedUrls() {
    const config = window.WRN_CONFIG || {};
    return [...new Set([
      core.safeHttpUrl(config.dataMirrors?.newsFeed),
      core.safeHttpUrl(config.dataUrls?.newsFeed),
      'news-feed.json'
    ].filter(Boolean))];
  }

  async function resolveConfiguredArticle(stableId, signal) {
    for (const url of configuredFeedUrls()) {
      try {
        const payload = await fetchJsonWithTimeout(url, signal);
        const match = feedItems(payload).find(item => core.stableArticleId(item) === stableId);
        if (match?.title && core.safeHttpUrl(match.link || match.url)) return match;
      } catch (error) {
        if (signal.aborted) throw error;
        console.warn('Deep-link feed unavailable; trying configured fallback', url, error);
      }
    }
    return null;
  }

  function showRestoreStatus(message) {
    let node = document.getElementById('wrn-deep-link-status');
    if (!node) {
      node = document.createElement('p');
      node.id = 'wrn-deep-link-status';
      node.className = 'website-deep-link-status';
      node.role = 'status';
      viewRoot.prepend(node);
    }
    node.textContent = message;
  }

  async function openRenderedNode(node) {
    const button = node?.matches?.('button[data-action="open"]')
      ? node
      : node?.querySelector?.('button[data-action="open"], [data-action="open"]');
    if (!button) return false;
    button.click();
    return true;
  }

  async function openDeepLinkedArticle() {
    const requested = core.normalizeArticleId(new URL(location.href).searchParams.get('article'));
    if (!requested) return false;
    restoreController?.abort();
    restoreController = new AbortController();
    const { signal } = restoreController;
    try {
      if (await waitForArticleBridge(requested, signal, 22000)) return true;
      let rendered = await waitForRenderedArticle(requested, signal, 1000);
      if (rendered) return openRenderedNode(rendered);
      const item = await resolveConfiguredArticle(requested, signal);
      if (!item) {
        showRestoreStatus('Der verlinkte Artikel konnte nicht geladen werden. Die URL bleibt erhalten; bitte später erneut versuchen.');
        return false;
      }
      showRestoreStatus('Der Artikel ist im Feed vorhanden, aber nicht in der geladenen Ausgabe. Bitte später erneut versuchen.');
      return false;
    } catch (error) {
      if (error?.name !== 'AbortError') {
        showRestoreStatus('Der verlinkte Artikel konnte wegen eines Ladefehlers nicht geöffnet werden. Bitte später erneut versuchen.');
      }
      return false;
    }
  }

  hardenExternalLinks();
  updateScrolledHeader();
  window.WRNWebsitePortal = Object.freeze({
    configuredFeedUrls,
    openDeepLinkedArticle,
    readOpenArticle,
    resetArticleMetadata,
    shareArticleUrl,
    updateArticleMetadata
  });
  void loadLandingManifest();
  void openDeepLinkedArticle();
})();
