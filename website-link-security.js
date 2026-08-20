/* Website-only hardening for static and dynamically rendered links. */
'use strict';

(() => {
  function secureLink(link) {
    if (!(link instanceof HTMLAnchorElement)) return;
    const raw = String(link.getAttribute('href') || '').trim();
    if (/^http:\/\//i.test(raw)) {
      link.removeAttribute('href');
      link.removeAttribute('target');
      link.setAttribute('aria-disabled', 'true');
      link.dataset.legacyInsecureSource = 'true';
      return;
    }
    if (link.target === '_blank') {
      link.rel = 'noopener noreferrer';
      link.referrerPolicy = 'no-referrer';
    }
  }

  function secureTree(root) {
    if (root instanceof HTMLAnchorElement) secureLink(root);
    root.querySelectorAll?.('a').forEach(secureLink);
  }

  secureTree(document);
  new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => {
    if (node instanceof Element) secureTree(node);
  }))).observe(document.documentElement, { childList: true, subtree: true });
})();
