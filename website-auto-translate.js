/* Progressive, website-only automatic translation for visible articles. */
'use strict';

(() => {
  const Queue = window.WRNWebsiteTranslationQueue;
  const TranslationState = window.WRNWebsiteTranslationState;
  if (!Queue || !TranslationState) return;
  const queue = new Queue({
    concurrency: 2,
    retries: 1,
    minIntervalMs: 450,
    backoffBaseMs: 900,
    backoffMaxMs: 8000,
    jitterRatio: 0.2
  });
  const signals = new WeakMap();
  window.WRNWebsiteTranslationSignals = signals;
  const languageSelect = document.getElementById('next-language');
  const articleDialog = document.getElementById('next-article-dialog');
  const view = document.getElementById('next-view');
  const articleSelector = '.news-card[data-article-id], .home-hero[data-article-id]';
  let dialogRunGeneration = 0;

  const language = () => String(languageSelect?.value || document.documentElement.lang || 'de')
    .toLowerCase().split(/[-_]/)[0];
  const normalizedLanguage = element => window.WRNLanguageOrigin?.normalize(
    element?.dataset?.sourceLanguage || ''
  ) || '';
  const statusText = {
    de: { original: 'Originalsprache', translating: 'Automatische Übersetzung läuft …', translated: 'Maschinell übersetzt', failed: 'Original angezeigt · Übersetzung nicht verfügbar · Erneut versuchen' },
    en: { original: 'Original language', translating: 'Automatic translation in progress …', translated: 'Machine translated', failed: 'Original shown · Translation unavailable · Retry' }
  };
  const copy = () => statusText[language()] || statusText.en;

  const translatedLabel = element => window.WRNLanguageOrigin?.machineTranslationLabel(
    element?.dataset?.sourceLanguage || '',
    language()
  ) || copy().translated;

  function statusNode(container) {
    const isTeaser = container.matches?.(articleSelector);
    const candidates = Array.from(container.querySelectorAll(
      '.translation-note[data-machine-translation="true"], .website-translation-status'
    ));
    const machineCandidate = candidates.find(candidate => (
      candidate.matches('.translation-note[data-machine-translation="true"]')
    ));
    let node = machineCandidate || candidates.find(candidate => (
      candidate.classList.contains('website-translation-status')
    ));
    if (!node) {
      node = document.createElement('small');
      node.className = isTeaser
        ? 'translation-note website-translation-status'
        : 'website-translation-status';
      node.setAttribute('role', 'status');
      node.hidden = true;
      const actions = container.querySelector('.card-actions, .dialog-actions');
      if (actions) actions.before(node);
      else container.append(node);
    }
    if (isTeaser) {
      node.classList.add('translation-note', 'website-translation-status');
    }
    candidates.filter(candidate => candidate !== node).forEach(candidate => candidate.remove());
    return node;
  }

  function setStatus(container, value) {
    const node = statusNode(container);
    node.textContent = value || '';
    node.hidden = !value;
    return node;
  }

  function waitForButton(button, signal, timeout = 47000) {
    return new Promise((resolve, reject) => {
      if (signal.aborted) return reject(new DOMException('Aborted', 'AbortError'));
      let becameBusy = button.getAttribute('aria-busy') === 'true';
      const finish = callback => {
        clearTimeout(timer);
        observer.disconnect();
        signal.removeEventListener('abort', onAbort);
        callback();
      };
      const onAbort = () => finish(() => reject(new DOMException('Aborted', 'AbortError')));
      const observer = new MutationObserver(() => {
        becameBusy ||= button.getAttribute('aria-busy') === 'true';
        if (becameBusy && button.getAttribute('aria-busy') !== 'true') finish(resolve);
      });
      observer.observe(button, { attributes: true, attributeFilter: ['aria-busy', 'disabled'] });
      const timer = setTimeout(() => finish(() => reject(new Error('Translation timeout'))), timeout);
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  async function translateVisible(container, button, signal) {
    setStatus(container, '');
    const sourceLanguage = normalizedLanguage(container);
    if (sourceLanguage && sourceLanguage === language()) return;
    setStatus(container, copy().translating);
    signals.set(button, new AbortController());
    const controller = signals.get(button);
    signal.addEventListener('abort', () => controller.abort(), { once: true });
    let note;
    try {
      button.click();
      await Promise.resolve();
      if (button.getAttribute('aria-busy') === 'true') {
        await waitForButton(button, signal);
      }
      note = statusNode(container);
    } finally {
      if (signals.get(button) === controller) signals.delete(button);
    }
    if (!note?.matches('.translation-note[data-machine-translation="true"]')
      || !TranslationState.read(container, language())) {
      throw new Error('Translation unavailable');
    }
    TranslationState.mark(container, {
      translationLanguage: language(),
      articleFingerprint: container.dataset.articleFingerprint
    });
    setStatus(container, translatedLabel(container));
    container.dataset.autoTranslationState = 'done';
  }

  const intersection = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const container = entry.target;
      const button = container.querySelector('.translate-card');
      if (!button || container.dataset.autoTranslationState) return;
      const targetLanguage = language();
      const key = `${targetLanguage}::${container.dataset.articleId || button.dataset.index}::${container.dataset.articleFingerprint || 'no-fingerprint'}`;
      container.dataset.autoTranslationState = 'queued';
      queue.add(key, signal => translateVisible(container, button, signal), {
        cacheHit: TranslationState.read(container, targetLanguage),
        onCacheHit: () => {
          container.dataset.autoTranslationState = 'done';
          setStatus(container, translatedLabel(container));
        },
        onError: () => {
          setStatus(container, copy().failed);
          container.dataset.autoTranslationState = 'failed';
        }
      });
    });
  }, { rootMargin: '240px 0px', threshold: 0.01 });

  function observeCards() {
    view?.querySelectorAll(articleSelector).forEach(card => {
      if (!card.dataset.translationObserved) {
        card.dataset.translationObserved = 'true';
        intersection.observe(card);
      }
    });
  }

  function dialogRunIsCurrent(run) {
    return Boolean(
      articleDialog?.open
      && run.generation === dialogRunGeneration
      && run.articleId === (articleDialog.dataset.articleId || 'article')
      && run.fingerprint === (articleDialog.dataset.articleFingerprint || 'no-fingerprint')
      && run.targetLanguage === language()
    );
  }

  function invalidateDialogTranslation() {
    dialogRunGeneration += 1;
    if (!articleDialog) return;
    if (['queued', 'running'].includes(articleDialog.dataset.autoTranslationState)) {
      delete articleDialog.dataset.autoTranslationState;
    }
  }

  async function translateOpenArticle() {
    if (!articleDialog?.open) return;
    const button = document.getElementById('next-dialog-translate');
    if (!button) return;
    const sourceLanguage = normalizedLanguage(articleDialog);
    const statusContainer = articleDialog.querySelector('.dialog-shell') || articleDialog;
    const status = statusNode(statusContainer);
    const existingTranslation = articleDialog.querySelector('.translation-comparison, [data-translation-comparison]');
    if (existingTranslation) {
      if (articleDialog.dataset.autoTranslationState === 'done') return;
      const translatedStatus = translatedLabel(articleDialog);
      if (status.textContent !== translatedStatus) status.textContent = translatedStatus;
      status.hidden = false;
      articleDialog.dataset.autoTranslationState = 'done';
      return;
    }
    if (articleDialog.dataset.autoTranslationState) return;
    setStatus(statusContainer, '');
    if (sourceLanguage && sourceLanguage === language()) {
      articleDialog.dataset.autoTranslationState = 'original';
      return;
    }
    const run = {
      generation: ++dialogRunGeneration,
      articleId: articleDialog.dataset.articleId || 'article',
      fingerprint: articleDialog.dataset.articleFingerprint || 'no-fingerprint',
      targetLanguage: language()
    };
    articleDialog.dataset.autoTranslationState = 'queued';
    const key = `${run.targetLanguage}::detail::${run.articleId}::${run.fingerprint}::run-${run.generation}`;
    const accepted = queue.add(key, async signal => {
      if (!dialogRunIsCurrent(run)) throw new DOMException('Stale article translation', 'AbortError');
      setStatus(statusContainer, copy().translating);
      articleDialog.dataset.autoTranslationState = 'running';
      const controller = new AbortController();
      signals.set(button, controller);
      signal.addEventListener('abort', () => controller.abort(), { once: true });
      let translated;
      try {
        button.click();
        await Promise.resolve();
        translated = articleDialog.querySelector('.translation-comparison, [data-translation-comparison]');
        if (!translated && button.getAttribute('aria-busy') === 'true') {
          await waitForButton(button, signal, 90000);
          translated = articleDialog.querySelector('.translation-comparison, [data-translation-comparison]');
        }
      } finally {
        if (signals.get(button) === controller) signals.delete(button);
      }
      if (!dialogRunIsCurrent(run)) throw new DOMException('Stale article translation', 'AbortError');
      if (!translated) throw new Error('Article translation unavailable');
      setStatus(statusContainer, translatedLabel(articleDialog));
      articleDialog.dataset.autoTranslationState = 'done';
    }, {
      onError: () => {
        if (!dialogRunIsCurrent(run)) return;
        setStatus(statusContainer, copy().failed);
        articleDialog.dataset.autoTranslationState = 'failed';
      }
    });
    if (!accepted && dialogRunIsCurrent(run)) {
      setStatus(statusContainer, copy().failed);
      articleDialog.dataset.autoTranslationState = 'failed';
    }
  }

  const renderObserver = new MutationObserver(records => {
    const articleTreeChanged = records.some(record => Array.from(record.addedNodes).some(node => (
      node.nodeType === Node.ELEMENT_NODE
      && (node.matches?.(articleSelector) || node.querySelector?.(articleSelector))
    )));
    if (articleTreeChanged) {
      queue.cancel();
      invalidateDialogTranslation();
      view?.querySelectorAll(articleSelector).forEach(card => {
        if (['queued', 'running'].includes(card.dataset.autoTranslationState)) {
          delete card.dataset.autoTranslationState;
        }
        delete card.dataset.translationObserved;
      });
    }
    observeCards();
    if (articleDialog?.open) void translateOpenArticle();
  });
  if (view) renderObserver.observe(view, { childList: true, subtree: true });
  if (articleDialog) renderObserver.observe(articleDialog, { attributes: true, childList: true, subtree: true, attributeFilter: ['open'] });

  function cancelForNavigation() {
    queue.cancel();
    invalidateDialogTranslation();
    document.querySelectorAll('[data-auto-translation-state="queued"], [data-auto-translation-state="running"]').forEach(element => {
      delete element.dataset.autoTranslationState;
    });
  }
  document.querySelector('.bottom-nav')?.addEventListener('click', cancelForNavigation);
  document.getElementById('next-global-search')?.addEventListener('submit', cancelForNavigation);
  languageSelect?.addEventListener('change', () => {
    cancelForNavigation();
    document.querySelectorAll('[data-auto-translation-state], [data-translation-observed]').forEach(element => {
      delete element.dataset.autoTranslationState;
      delete element.dataset.translationObserved;
    });
    observeCards();
    if (articleDialog?.open) void translateOpenArticle();
  });
  articleDialog?.addEventListener('close', () => {
    cancelForNavigation();
    delete articleDialog.dataset.autoTranslationState;
  });

  observeCards();
})();
