const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../Ti4Companion.Web/wwwroot/prototype-turn-attention.js'), 'utf8');
const tick = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function harness({ secure = true, supported = true, deferred = false } = {}) {
    const listeners = new Set(), locks = [], requests = [], values = [];
    const document = { title: '', visibilityState: 'visible', addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn) };
    function lock() {
        const handlers = [];
        const value = { released: false, releases: 0, addEventListener: (_, fn) => handlers.push(fn), emit() { this.released = true; handlers.forEach(fn => fn()); }, async release() { this.releases++; this.emit(); } };
        locks.push(value);
        return value;
    }
    const navigator = supported ? { wakeLock: { request(type) { assert.equal(type, 'screen'); const value = lock(); if (!deferred) return Promise.resolve(value); return new Promise(resolve => requests.push(() => resolve(value))); } } } : {};
    const context = vm.createContext({ document, navigator, isSecureContext: secure });
    vm.runInContext(source.replace(/export /g, '') + '\nthis.api = {connect, request, disconnect, update, release: typeof release === "function" ? release : undefined};', context);
    return { api: context.api, document, locks, requests, values, listeners, callback: { invokeMethodAsync(name, value) { assert.equal(name, 'WakeChanged'); values.push(value); return Promise.resolve(); } }, visible() { for (const fn of listeners) fn(); } };
}
const tests = [];
const test = (name, run) => tests.push({ name, run });
test('connect returns capability and auto acquires actual lock', async () => {
    const h = harness(); assert.equal(await h.api.connect(h.callback), true); assert.equal(h.locks.length, 1); assert.equal(h.values.at(-1), true);
});
test('off releases and blocks visibility reacquire; on retries', async () => {
    const h = harness(); await h.api.connect(h.callback); await h.api.release(); assert.equal(h.locks[0].releases, 1); assert.equal(h.values.at(-1), false);
    h.visible(); await tick(); assert.equal(h.locks.length, 1); await h.api.request(); assert.equal(h.locks.length, 2); assert.equal(h.values.at(-1), true);
});
test('actual release reports off; stale release cannot clear newer lock', async () => {
    const h = harness(); await h.api.connect(h.callback); h.locks[0].emit(); assert.equal(h.values.at(-1), false); await h.api.request(); h.locks[0].emit(); assert.equal(h.values.at(-1), true);
});
test('Active title updates and disconnect cleans listeners, lock and title', async () => {
    const h = harness(); await h.api.connect(h.callback); h.api.update(true); assert.equal(h.document.title, 'Your turn · TI4 Table Companion'); h.api.update(false); assert.equal(h.document.title, 'TI4 · Table Companion'); await h.api.disconnect(); assert.equal(h.listeners.size, 0); assert.equal(h.locks[0].releases, 1); assert.equal(h.document.title, 'TI4 · Table Companion'); h.visible(); await tick(); assert.equal(h.locks.length, 1);
});
for (const options of [{ secure: false }, { supported: false }]) test('unsupported ' + JSON.stringify(options), async () => {
    const h = harness(options); assert.equal(await h.api.connect(h.callback), false); await h.api.request(); assert.equal(h.locks.length, 0); assert.ok(!h.values.includes(true));
});
test('off invalidates pending request and on starts a fresh request', async () => {
    const h = harness({ deferred: true }); const connecting = h.api.connect(h.callback); await h.api.release(); const retry = h.api.request(); assert.equal(h.requests.length, 2); h.requests[1](); await retry; h.requests[0](); await connecting; assert.equal(h.locks[0].releases, 1); assert.equal(h.locks[1].releases, 0); assert.equal(h.values.at(-1), true);
});
test('disconnect and reconnect isolate late pending requests and callbacks', async () => {
    const h = harness({ deferred: true }); const old = h.api.connect(h.callback); await h.api.disconnect(); const nextValues = []; const next = h.api.connect({ invokeMethodAsync(_, value) { nextValues.push(value); return Promise.resolve(); } }); assert.equal(h.listeners.size, 1); assert.equal(h.requests.length, 2); h.requests[1](); await next; h.requests[0](); await old; assert.equal(h.locks[0].releases, 1); assert.equal(h.locks[1].releases, 0); assert.equal(nextValues.at(-1), true); assert.ok(!h.values.includes(true));
});
test('disconnect releases late pending lock without reporting awake', async () => {
    const h = harness({ deferred: true }); const connecting = h.api.connect(h.callback); await h.api.disconnect(); h.requests[0](); await connecting; assert.equal(h.locks[0].releases, 1); assert.ok(!h.values.includes(true));
});
(async () => {
    let failed = 0;
    for (const { name, run } of tests) { try { await run(); console.log('PASS: ' + name); } catch (error) { failed++; console.error('FAIL: ' + name + '\n' + error.message); } }
    console.log(`${tests.length - failed}/${tests.length} passed`); if (failed) process.exitCode = 1;
})();
