/* Stable website-only contract for cached machine translations. */
'use strict';

(() => {
  const normalizeLanguage = value => String(value || '').trim().toLowerCase().split(/[-_]/)[0];
  const clean = value => String(value || '').trim();

  function cacheMatches(value = {}) {
    const state = clean(value.translationState);
    const articleFingerprint = clean(value.articleFingerprint);
    const translationFingerprint = clean(value.translationFingerprint);
    return ['cached', 'done'].includes(state)
      && Boolean(articleFingerprint)
      && articleFingerprint === translationFingerprint
      && normalizeLanguage(value.translationLanguage) === normalizeLanguage(value.targetLanguage);
  }

  function read(element, targetLanguage) {
    const data = element?.dataset || {};
    return cacheMatches({
      translationState: data.translationState,
      articleFingerprint: data.articleFingerprint,
      translationFingerprint: data.translationFingerprint,
      translationLanguage: data.translationLanguage,
      targetLanguage
    });
  }

  function mark(element, value = {}) {
    if (!element?.dataset) return;
    element.dataset.translationState = value.translationState || 'done';
    element.dataset.translationLanguage = normalizeLanguage(value.translationLanguage);
    element.dataset.translationFingerprint = clean(value.translationFingerprint || value.articleFingerprint);
  }

  window.WRNWebsiteTranslationState = Object.freeze({ cacheMatches, read, mark, normalizeLanguage });
})();
