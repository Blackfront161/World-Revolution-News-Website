import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';

const script = readFileSync(resolve(import.meta.dirname, '..', 'website-local-diagnostics.js'), 'utf8');

test('website diagnostics stay local, bounded and redact contact details', () => {
  const values = new Map();
  const listeners = new Map();
  const window = {
    WRN_CONFIG: { version: 'website-test' },
    addEventListener: (event, handler) => listeners.set(event, handler)
  };
  const localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key)
  };
  vm.runInNewContext(script, { window, localStorage, navigator: { onLine: true }, Date });

  assert.equal(window.WRNLocalDiagnostics.record('test', 'Mail me@example.org at https://example.org/private'), true);
  assert.equal(values.get(window.WRNLocalDiagnostics.storageKey).includes('me@example.org'), false);
  assert.equal(values.get(window.WRNLocalDiagnostics.storageKey).includes('https://example.org/private'), false);
  for (let index = 0; index < 35; index += 1) {
    window.WRNLocalDiagnostics.record('test', `entry ${index}`);
  }
  const payload = window.WRNLocalDiagnostics.exportPayload();
  assert.equal(payload.records.length, 30);
  assert.equal(payload.records.at(-1).message, 'entry 34');
  assert.equal(listeners.has('error'), true);
  assert.equal(listeners.has('unhandledrejection'), true);
  assert.equal(window.WRNLocalDiagnostics.clear(), true);
  assert.equal(window.WRNLocalDiagnostics.count(), 0);
});
