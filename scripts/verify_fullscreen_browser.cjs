// Disposable candidate only. Native fullscreen on a genuinely insecure HTTP origin; no fullscreen mock in the main flow.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const pw = require(process.env.PLAYWRIGHT_PACKAGE || '/opt/data/.npm/_npx/e41f203b7505f1fb/node_modules/playwright');
const base = process.env.TI4_BASE_URL || 'http://127.0.0.1:18094';
assert.match(base, /^http:\/\/(127\.0\.0\.1|localhost):18094$/);
const insecureBase = 'http://ti4-fullscreen.test:18094';
const out = process.env.TI4_EVIDENCE_DIR || '/evidence';
(async () => {
    const browser = await pw.chromium.launch({headless: true, args: ['--host-resolver-rules=MAP ti4-fullscreen.test 127.0.0.1', '--no-proxy-server']});
    const errors = [], failures = [], layouts = [], mutations = [];
    let ownedId;
    const tokens = Array.from({length: 3}, () => crypto.randomBytes(16).toString('hex'));
    try {
        const context = await browser.newContext({serviceWorkers: 'block', viewport: {width: 915, height: 320}, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true});
        async function call(suffix, body, token = tokens[0]) {
            assert.ok(suffix === '' || suffix.startsWith('/' + ownedId + '/'), 'Only owned fixture may be changed');
            const r = await context.request.post(base + '/api/sessions' + suffix, {headers: {'X-Device-Token': token}, data: body});
            assert.ok(r.ok(), `${suffix}: ${r.status()} ${await r.text()}`); return r.json();
        }
        const {session} = await call('', {name: 'Table Prototype', hostName: 'A', language: 0, playerNames: ['A', 'Bb', 'Ccc'], deviceToken: tokens[0]});
        ownedId = session.id;
        for (let i = 1; i < 3; i++) await call('/' + ownedId + '/players', {name: '', deviceToken: tokens[i], claimPlayerId: session.players[i].id}, tokens[i]);
        for (const [i, factionId] of ['arborec', 'barony', 'crimson'].entries()) {
            const r = await context.request.patch(base + '/api/sessions/' + ownedId + '/players/' + session.players[i].id, {headers: {'X-Device-Token': tokens[i]}, data: {factionId, isReady: true}}); assert.ok(r.ok());
        }
        await call('/' + ownedId + '/phase/start', {});
        for (const [i, strategyCardId] of [1, 3, 2, 4, 5, 6].entries()) await call('/' + ownedId + '/players/' + session.players[i % 3].id + '/strategy-cards', {strategyCardId});
        await call('/' + ownedId + '/phase/action', {});
        async function prepare(c, mode = 'native') {
            await c.addInitScript(({token, mode}) => {
                localStorage.setItem('ti4.device', token);
                if (mode === 'unsupported') Object.defineProperty(document, 'fullscreenEnabled', {configurable: true, value: false});
                if (mode === 'reject') {
                    const native = Element.prototype.requestFullscreen;
                    window.__rejectFullscreen = true;
                    Element.prototype.requestFullscreen = function(options) {
                        return window.__rejectFullscreen ? Promise.reject(new DOMException('Test denial', 'NotAllowedError')) : native.call(this, options);
                    };
                }
            }, {token: tokens[1], mode});
            const p = await c.newPage();
            p.on('pageerror', e => errors.push(e.message));
            p.on('requestfailed', r => failures.push(r.url() + ': ' + r.failure()?.errorText));
            p.on('response', r => {if (r.status() >= 400) failures.push(r.status() + ' ' + r.url());});
            await p.goto(insecureBase + '/table/' + session.joinCode);
            await p.locator('.table-identity').waitFor();
            assert.equal(await p.evaluate(() => isSecureContext), false, 'Must really test non-secure HTTP, not trustworthy localhost');
            return p;
        }
        const page = await prepare(context);
        const before = await (await context.request.get(base + '/api/sessions/' + session.joinCode)).json();
        page.on('request', r => {if (r.url().includes('/api/sessions') && !['GET','HEAD'].includes(r.method())) mutations.push(r.method() + ' ' + r.url());});
        async function openTools(p) {
            await p.getByRole('button', {name: 'Open table tools', exact: true}).tap();
            await p.locator('dialog[open]').waitFor();
        }
        async function settled(p, active) {
            await p.waitForFunction(active => !!document.fullscreenElement === active && !document.querySelector('dialog[open]') && document.querySelector('.tools-toggle').getAttribute('aria-expanded') === 'false', active);
        }
        await openTools(page);
        const button = page.locator('.tools-fullscreen');
        await page.waitForFunction(() => !document.querySelector('.tools-fullscreen').disabled);
        assert.equal(await button.getAttribute('aria-pressed'), 'false');
        const target = await button.evaluate(e => {const r=e.getBoundingClientRect();return {width:r.width,height:r.height,hit:e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};});
        assert.ok(target.width >= 44 && target.height >= 44 && target.hit, 'Fullscreen control must be touchable');
        await button.tap(); await settled(page, true);
        // A real fullscreen headless window cannot be resized with Browser.setWindowBounds.
        // Emulate viewport/orientation directly while leaving the native fullscreen state intact.
        const cdp = await context.newCDPSession(page);
        async function resize(width, height) {
            await cdp.send('Emulation.setDeviceMetricsOverride', {width, height, screenWidth:width, screenHeight:height, deviceScaleFactor:2.625, mobile:true,
                screenOrientation:{type:width>height?'landscapePrimary':'portraitPrimary',angle:width>height?90:0}});
        }
        for (const [width, height] of [[915,320],[915,412],[800,360],[640,360],[412,915]]) {
            await resize(width,height); await page.waitForTimeout(100);
            const g = await page.evaluate(() => ({active: !!document.fullscreenElement, secure: isSecureContext, width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight, cards: document.querySelectorAll('.sc-strip').length, tools: !!document.querySelector('.tools-toggle')}));
            assert.deepEqual([g.width,g.height],[width,height]);
            assert.ok(g.active && !g.secure && g.tools && g.cards === 8 && g.scrollWidth <= g.width + 1);
            if (g.width > g.height) assert.ok(g.scrollHeight <= g.height + 1, 'Fullscreen must preserve viewport fit');
            layouts.push(g);
        }
        await resize(915,412);
        fs.mkdirSync(out, {recursive:true});
        await page.screenshot({path:out + '/fullscreen-active.png'});
        await openTools(page);
        assert.match(await button.innerText(), /Vollbild verlassen/);
        assert.equal(await button.getAttribute('aria-pressed'), 'true');
        await page.screenshot({path:out + '/fullscreen-tools.png'});
        await button.tap(); await settled(page, false);
        await openTools(page); await button.tap(); await settled(page, true);
        await page.evaluate(() => document.exitFullscreen()); // Real external exit event, not an API mock.
        await page.waitForFunction(() => !document.fullscreenElement);
        await openTools(page);
        assert.match(await button.innerText(), /^⛶\s*Vollbild$/);
        assert.equal(await button.getAttribute('aria-pressed'), 'false');
        await page.locator('.tools-close').tap();
        const noSupport = await browser.newContext({serviceWorkers:'block', viewport:{width:915,height:320}, hasTouch:true});
        const unsupported = await prepare(noSupport, 'unsupported'); await openTools(unsupported);
        assert.ok(await unsupported.locator('.tools-fullscreen').isDisabled());
        assert.equal(await unsupported.locator('.tools-fullscreen').getAttribute('aria-pressed'), 'false');
        assert.match(await unsupported.locator('.tools-fullscreen').getAttribute('title'), /nicht|gesperrt|unterstützt/);
        const rejection = await browser.newContext({serviceWorkers:'block', viewport:{width:915,height:320}, hasTouch:true});
        const denied = await prepare(rejection, 'reject'); await openTools(denied);
        await denied.locator('.tools-fullscreen').tap();
        await denied.locator('.tools-fullscreen-status:not([hidden])').waitFor();
        assert.equal(await denied.locator('.tools-fullscreen').getAttribute('aria-pressed'), 'false');
        assert.ok(await denied.locator('dialog[open]').isVisible());
        await denied.evaluate(() => {window.__rejectFullscreen = false;});
        await denied.locator('.tools-fullscreen').tap(); await settled(denied, true);
        await denied.evaluate(() => document.exitFullscreen());
        const after = await (await context.request.get(base + '/api/sessions/' + session.joinCode)).json();
        assert.deepEqual(after, before, 'Fullscreen must not mutate the game');
        assert.deepEqual(mutations, []); assert.deepEqual(errors, []); assert.deepEqual(failures, []);
        const report = {nativeInsecureHttp:true, layouts, touchTarget:target, enterExitReenter:true, externalExit:true, unsupported:'capability mock: disabled', rejection:'request mock: honest error then native retry succeeds', sessionUnchanged:true, errors, failures, mutations};
        fs.writeFileSync(out + '/fullscreen-verification.json', JSON.stringify(report,null,2));
        console.log(JSON.stringify(report,null,2));
    } finally {await browser.close();}
})().catch(e => {console.error(e); process.exitCode=1;});
