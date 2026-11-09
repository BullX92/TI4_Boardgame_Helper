// Deterministic module tests; no browser/device or production-session actions.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../Ti4Companion.Web/wwwroot/prototype-tools-rail.js'), 'utf8');
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
function fixture({supported = true, request} = {}) {
    const document = new EventTarget();
    document.fullscreenEnabled = supported;
    document.fullscreenElement = null;
    const stats = {requests: 0, exits: 0, callbacks: 0, focuses: 0, activation: false};
    const button = new EventTarget();
    button.disabled = true;
    const attrs = new Map([['aria-pressed', 'false']]);
    button.setAttribute = (k,v) => attrs.set(k,v);
    const label = {textContent: 'Vollbild'}, status = {hidden: true, textContent: ''};
    button.querySelector = () => label;
    const trigger = {isConnected: true, focus: () => stats.focuses++};
    const dialog = new EventTarget();
    dialog.isConnected = true; dialog.open = false;
    dialog.showModal = () => {dialog.open = true;};
    dialog.close = () => {dialog.open = false; dialog.dispatchEvent(new Event('close'));};
    dialog.querySelector = selector => selector === '.tools-fullscreen' ? button : selector === '.tools-fullscreen-status' ? status : null;
    document.documentElement = {requestFullscreen: supported ? options => {
        stats.requests++; stats.options = options;
        assert.equal(stats.activation, true, 'request must run synchronously within the tap, before any await');
        if (request) return request();
        document.fullscreenElement = document.documentElement;
        document.dispatchEvent(new Event('fullscreenchange'));
        return Promise.resolve();
    } : undefined};
    document.exitFullscreen = async () => {stats.exits++; document.fullscreenElement = null; document.dispatchEvent(new Event('fullscreenchange'));};
    const callback = {invokeMethodAsync: () => {stats.callbacks++; return Promise.resolve();}};
    const context = {document, isSecureContext: false};
    vm.runInNewContext(source.replace(/\bexport\s+/g, '') + '\nthis.api={open,close,disconnect,focusOption};', context);
    const api = context.api;
    const open = () => api.open(dialog, callback, trigger);
    const tap = () => {stats.activation = true; button.dispatchEvent(new Event('click')); stats.activation = false;};
    return {document, button, attrs, label, status, dialog, stats, api, open, tap};
}
(async () => {
    let passed = 0;
    async function test(name, fn) {await fn(); passed++; console.log('PASS: ' + name);}
    await test('HTTP capability, real-state label, enter and exit in the original gesture', async () => {
        const f = fixture(); f.open();
        assert.equal(f.button.disabled, false, 'Supported HTTP fullscreen must be enabled');
        f.tap(); await flush();
        assert.equal(f.stats.requests, 1); assert.equal(f.stats.options.navigationUI, 'hide');
        assert.equal(f.document.fullscreenElement, f.document.documentElement);
        assert.equal(f.attrs.get('aria-pressed'), 'true'); assert.equal(f.label.textContent, 'Vollbild verlassen');
        assert.equal(f.dialog.open, false); assert.equal(f.stats.callbacks, 1);
        f.open(); f.tap(); await flush();
        assert.equal(f.stats.exits, 1); assert.equal(f.attrs.get('aria-pressed'), 'false');
        assert.equal(f.label.textContent, 'Vollbild'); assert.equal(f.dialog.open, false);
        f.api.disconnect(f.dialog);
    });
    await test('external fullscreenchange updates the closed menu and reopen does not duplicate listeners', async () => {
        const f = fixture(); f.open(); f.api.close(f.dialog); f.open();
        f.document.fullscreenElement = f.document.documentElement;
        f.document.dispatchEvent(new Event('fullscreenchange'));
        assert.equal(f.label.textContent, 'Vollbild verlassen');
        f.document.fullscreenElement = null; f.document.dispatchEvent(new Event('fullscreenchange'));
        assert.equal(f.attrs.get('aria-pressed'), 'false');
        f.tap(); await flush(); assert.equal(f.stats.requests, 1);
        f.api.disconnect(f.dialog);
    });
    await test('unsupported/policy-denied capability stays disabled without a fake active state', async () => {
        const f = fixture({supported: false}); f.open(); f.tap(); await flush();
        assert.equal(f.button.disabled, true); assert.equal(f.stats.requests, 0);
        assert.equal(f.attrs.get('aria-pressed'), 'false');
        assert.match(f.button.title, /nicht|gesperrt|unterstützt/);
        f.api.disconnect(f.dialog);
    });
    await test('rejected request shows an honest retryable error and keeps Tools open', async () => {
        const f = fixture({request: () => Promise.reject(new Error('Denied'))}); f.open(); f.tap(); await flush();
        assert.equal(f.dialog.open, true); assert.equal(f.button.disabled, false);
        assert.equal(f.attrs.get('aria-pressed'), 'false'); assert.equal(f.status.hidden, false);
        assert.match(f.status.textContent, /Vollbild/);
        f.api.disconnect(f.dialog);
    });
    await test('synchronous browser errors are caught', async () => {
        const f = fixture({request: () => {throw Error('Denied');}}); f.open(); f.tap(); await flush();
        assert.equal(f.status.hidden, false); assert.equal(f.button.disabled, false); assert.equal(f.dialog.open, true);
        f.api.disconnect(f.dialog);
    });
    await test('pending request blocks duplicate taps, disposal removes listeners and ignores late settlement', async () => {
        let reject;
        const f = fixture({request: () => new Promise((_, r) => {reject = r;})});
        f.open(); f.tap(); f.tap();
        assert.equal(f.stats.requests, 1); assert.equal(f.button.disabled, true);
        f.api.disconnect(f.dialog);
        assert.equal(f.stats.callbacks, 0);
        reject(new Error('Late')); await flush();
        assert.equal(f.status.hidden, true);
        f.document.fullscreenElement = f.document.documentElement;
        f.document.dispatchEvent(new Event('fullscreenchange')); f.tap(); await flush();
        assert.equal(f.attrs.get('aria-pressed'), 'false'); assert.equal(f.stats.requests, 1);
    });
    console.log(`${passed}/${passed} fullscreen tests passed`);
})().catch(e => {console.error(e); process.exitCode = 1;});
