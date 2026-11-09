// Isolated real UI + deterministic Wake Lock API mock, never production game/device actions.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const pw = require(process.env.PLAYWRIGHT_PACKAGE || '/opt/data/.npm/_npx/e41f203b7505f1fb/node_modules/playwright');
const base = process.env.TI4_BASE_URL || 'http://127.0.0.1:18094';
assert.match(base, /^http:\/\/(127\.0\.0\.1|localhost):18094$/);
const out = process.env.TI4_EVIDENCE_DIR || '/evidence';
(async () => {
    const browser = await pw.chromium.launch({headless: true});
    const errors = [], failures = [], layouts = [];
    const tokens = Array.from({length: 3}, () => crypto.randomBytes(16).toString('hex'));
    let ownedId;
    try {
        const context = await browser.newContext({serviceWorkers: 'block', viewport: {width: 915, height: 320}, hasTouch: true, isMobile: true});
        async function call(suffix, body, token = tokens[0]) {
            assert.ok(suffix === '' || suffix.startsWith('/' + ownedId + '/'), 'Only owned fixture may be changed');
            const r = await context.request.post(base + '/api/sessions' + suffix, {headers: {'X-Device-Token': token}, data: body});
            assert.ok(r.ok(), `${suffix}: ${r.status()} ${await r.text()}`);
            return r.json();
        }
        const created = await call('', {name: 'Table Prototype', hostName: 'A', language: 0, playerNames: ['A', 'Bb', 'Ccc'], deviceToken: tokens[0]});
        const session = created.session;
        ownedId = session.id;
        for (let i = 1; i < 3; i++) await call('/' + ownedId + '/players', {name: '', deviceToken: tokens[i], claimPlayerId: session.players[i].id}, tokens[i]);
        for (const [i, factionId] of ['arborec', 'barony', 'crimson'].entries()) {
            const r = await context.request.patch(base + '/api/sessions/' + ownedId + '/players/' + session.players[i].id, {headers: {'X-Device-Token': tokens[i]}, data: {factionId, isReady: true}});
            assert.ok(r.ok());
        }
        await call('/' + ownedId + '/phase/start', {});
        for (const [i, strategyCardId] of [1, 3, 2, 4, 5, 6].entries()) await call('/' + ownedId + '/players/' + session.players[i % 3].id + '/strategy-cards', {strategyCardId});
        await call('/' + ownedId + '/phase/action', {});
        async function initialize(c, supported) {
            await c.addInitScript(({token, supported}) => {
                localStorage.setItem('ti4.device', token);
                window.__wakeStats = {requests: 0, releases: 0, held: 0};
                Object.defineProperty(navigator, 'wakeLock', {configurable: true, value: supported ? {request: async () => {
                    const lock = new EventTarget(); lock.released = false;
                    window.__wakeStats.requests++; window.__wakeStats.held++;
                    lock.release = async () => {if (lock.released) return; lock.released = true; window.__wakeStats.held--; window.__wakeStats.releases++; lock.dispatchEvent(new Event('release'));};
                    return lock;
                }} : undefined});
            }, {token: tokens[1], supported});
        }
        await initialize(context, true);
        const page = await context.newPage();
        page.on('pageerror', e => errors.push(e.message));
        page.on('requestfailed', r => failures.push(r.url()));
        page.on('response', r => {if (r.status() >= 400) failures.push(`${r.status()} ${r.url()}`);});
        await page.goto(base + '/table/' + session.joinCode);
        await page.locator('.table-identity').waitFor();
        for (const [width, height] of [[915, 412], [915, 320], [800, 360], [412, 915]]) {
            await page.setViewportSize({width, height});
            const geometry = await page.evaluate(() => {
                const header = document.querySelector('.table-top'), center = document.querySelector('.turn-main');
                const initiative = document.querySelector('.table-initiative');
                const h = header.getBoundingClientRect(), c = center.getBoundingClientRect();
                return {inCenter: center.contains(header), onlyHeader: document.querySelectorAll('.table-top').length === 1,
                    headerHeight: h.height, bounded: h.x >= c.x - 1 && h.right <= c.right + 1,
                    initiativeFont: parseFloat(getComputedStyle(initiative).fontSize), initiative: initiative.textContent,
                    faction: document.querySelector('.table-faction')?.textContent,
                    wakeInTools: !!document.querySelector('dialog .wake-status'), wakeInHeader: !!header.querySelector('.wake-status'),
                    documentFits: innerWidth < innerHeight || document.documentElement.scrollHeight <= innerHeight + 1};
            });
            assert.ok(geometry.inCenter && geometry.onlyHeader && geometry.bounded, 'Header must exist only inside the central sector');
            assert.ok(geometry.headerHeight <= 68 && geometry.initiativeFont <= 14, 'Identity/initiative must be compact');
            assert.match(geometry.initiative, /Initiative\s*3/);
            assert.equal(geometry.faction, 'Letnev');
            assert.ok(geometry.wakeInTools && !geometry.wakeInHeader, 'Wake control must be in left tools, not header');
            assert.ok(geometry.documentFits);
            layouts.push({width, height, ...geometry});
        }
        await page.setViewportSize({width: 915, height: 320});
        await page.waitForFunction(() => window.__wakeStats.held === 1);
        await page.getByRole('button', {name: 'Open table tools', exact: true}).tap();
        const toggle = page.locator('dialog .wake-status');
        await toggle.waitFor();
        assert.equal(await toggle.getAttribute('role'), 'switch');
        assert.equal(await toggle.getAttribute('aria-checked'), 'true');
        await toggle.tap(); await page.waitForFunction(() => window.__wakeStats.held === 0);
        assert.equal(await toggle.getAttribute('aria-checked'), 'false');
        await page.locator('.tools-close').tap();
        await page.getByRole('button', {name: 'Open table tools', exact: true}).tap();
        assert.equal(await toggle.getAttribute('aria-checked'), 'false', 'Closing/reopening tools must retain Off');
        await toggle.tap(); await page.waitForFunction(() => window.__wakeStats.held === 1);
        await page.getByRole('button', {name: 'Admin', exact: true}).tap();
        await page.locator('.tools-panel-close').tap();
        await page.locator('.tools-close').tap();
        assert.deepEqual(await page.evaluate(() => window.__wakeStats), {requests: 2, releases: 1, held: 1}, 'Closing tools/panels must not release or reconnect the wake component');
        fs.mkdirSync(out, {recursive: true});
        await page.screenshot({path: out + '/center-header-waiting.png'});
        const unsupported = await browser.newContext({serviceWorkers: 'block', viewport: {width: 915, height: 320}, hasTouch: true});
        await initialize(unsupported, false);
        const p = await unsupported.newPage();
        await p.goto(base + '/table/' + session.joinCode); await p.locator('.table-identity').waitFor();
        await p.getByRole('button', {name: 'Open table tools', exact: true}).tap();
        const unavailable = p.locator('dialog .wake-status');
        await p.waitForFunction(() => !!document.querySelector('dialog[open] .wake-status:disabled'));
        assert.equal(await unavailable.getAttribute('aria-checked'), 'false');
        assert.match(await p.locator('.tools-nav').innerText(), /HTTPS/);
        assert.deepEqual(await p.evaluate(() => window.__wakeStats), {requests: 0, releases: 0, held: 0});
        await p.screenshot({path: out + '/center-header-tools-unavailable.png'});
        await unsupported.close();
        assert.deepEqual(errors, []); assert.deepEqual(failures, []);
        const report = {layouts, wakeLifecycle: 'on/off/reopen/close preserved', unsupported: 'disabled with HTTPS hint', errors, failures};
        fs.writeFileSync(out + '/center-header-verification.json', JSON.stringify(report, null, 2));
        console.log(JSON.stringify(report, null, 2));
    } finally {await browser.close();}
})().catch(e => {console.error(e); process.exitCode = 1;});
