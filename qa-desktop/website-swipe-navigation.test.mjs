import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';

const script = readFileSync(resolve(import.meta.dirname, '..', 'website-swipe-navigation.js'), 'utf8');

function harness() {
  const listeners = {};
  let active = 'home';
  let dialogOpen = false;
  const buttons = Object.fromEntries(['home', 'following', 'discover', 'media', 'saved']
    .map(area => [area, { click: () => { active = area; } }]));
  const main = { addEventListener: (type, handler) => { listeners[type] = handler; } };
  const navigation = {
    querySelector(selector) {
      if (selector.includes('aria-current')) return { dataset: { viewTarget: active } };
      return buttons[selector.match(/data-view-target="([^"]+)"/)?.[1]] || null;
    }
  };
  class Element {
    constructor(interactive = false) {
      this.interactive = interactive;
      this.parentElement = main;
      this.scrollWidth = this.clientWidth = 100;
    }
    closest() { return this.interactive ? this : null; }
  }
  const document = {
    getElementById: () => main,
    querySelector: selector => selector === '.bottom-nav' ? navigation : dialogOpen ? {} : null
  };
  vm.runInNewContext(script, { document, Element, Date, getComputedStyle: () => ({ overflowX: 'visible' }) });
  function gesture(dx, dy, { interactive = false, dialog = false } = {}) {
    dialogOpen = dialog;
    const target = new Element(interactive);
    let prevented = false;
    listeners.touchstart({ target, touches: [{ clientX: 200, clientY: 200 }] });
    listeners.touchend({
      changedTouches: [{ clientX: 200 + dx, clientY: 200 + dy }],
      preventDefault: () => { prevented = true; }
    });
    dialogOpen = false;
    return prevented;
  }
  return { gesture, active: () => active };
}

test('horizontal swipes traverse primary areas and ignore vertical, interactive and dialog gestures', () => {
  const page = harness();
  assert.equal(page.gesture(-120, 10), true);
  assert.equal(page.active(), 'following');
  assert.equal(page.gesture(-20, 140), false);
  assert.equal(page.active(), 'following');
  assert.equal(page.gesture(-130, 0, { interactive: true }), false);
  assert.equal(page.gesture(-130, 0, { dialog: true }), false);
  assert.equal(page.active(), 'following');
  assert.equal(page.gesture(120, 2), true);
  assert.equal(page.active(), 'home');
  assert.equal(page.gesture(120, 2), false);
  assert.equal(page.active(), 'home');
});
