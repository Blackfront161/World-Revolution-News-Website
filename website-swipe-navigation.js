/* Website-only swipe navigation between the five primary areas. */
'use strict';

(() => {
  const main = document.getElementById('next-main');
  const navigation = document.querySelector('.bottom-nav');
  if (!main || !navigation) return;

  const areas = ['home', 'following', 'discover', 'media', 'saved'];
  const interactive = 'input, select, textarea, button, a, [contenteditable], [role="slider"], audio, video';
  let start = null;

  function horizontallyScrollable(element) {
    for (let node = element; node && node !== main; node = node.parentElement) {
      if (node.scrollWidth <= node.clientWidth + 2) continue;
      const overflow = getComputedStyle(node).overflowX;
      if (overflow === 'auto' || overflow === 'scroll') return true;
    }
    return false;
  }

  main.addEventListener('touchstart', event => {
    start = null;
    if (event.touches.length !== 1 || document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]')) return;
    const target = event.target;
    if (!(target instanceof Element) || target.closest(interactive) || horizontallyScrollable(target)) return;
    const active = navigation.querySelector('[data-view-target][aria-current="page"]')?.dataset.viewTarget;
    if (!areas.includes(active)) return;
    start = { x: event.touches[0].clientX, y: event.touches[0].clientY, time: Date.now(), active };
  }, { passive: true });

  main.addEventListener('touchend', event => {
    const gesture = start;
    start = null;
    if (!gesture || event.changedTouches.length !== 1 || Date.now() - gesture.time > 900) return;
    if (document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]')) return;
    const dx = event.changedTouches[0].clientX - gesture.x;
    const dy = event.changedTouches[0].clientY - gesture.y;
    if (Math.abs(dx) < 75 || Math.abs(dx) < Math.abs(dy) * 1.35) return;
    const active = navigation.querySelector('[data-view-target][aria-current="page"]')?.dataset.viewTarget;
    if (active !== gesture.active) return;
    const next = areas[areas.indexOf(active) + (dx < 0 ? 1 : -1)];
    const button = next && navigation.querySelector(`[data-view-target="${next}"]`);
    if (!button) return;
    event.preventDefault();
    button.click();
  }, { passive: false });

  main.addEventListener('touchcancel', () => { start = null; }, { passive: true });
})();
