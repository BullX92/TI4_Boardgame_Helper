// Real candidate app, read-only: presentation-only active class; no session API writes.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const pw = require(process.env.PLAYWRIGHT_PACKAGE || '/opt/data/.npm/_npx/e41f203b7505f1fb/node_modules/playwright');
const base = process.env.TI4_BASE_URL || 'http://127.0.0.1:18094';
assert.match(base, /^http:\/\/(127\.0\.0\.1|localhost):18094$/);
const asset = '/assets/ti4-agent/table-space-v1.jpg';
const expectedHash = '67c8836334f5f4f55c9c277bf25588c708271ede3781bc58207ad52360b385ce';
const output = process.env.TI4_EVIDENCE_DIR || '/evidence';
(async () => {
    fs.mkdirSync(output, {recursive: true});
    const browser = await pw.chromium.launch({headless: true});
    const errors = [], failures = [], cases = [];
    try {
        const context = await browser.newContext({serviceWorkers: 'block', viewport: {width: 915, height: 412}, isMobile: true, hasTouch: true});
        const page = await context.newPage();
        page.on('pageerror', e => errors.push(e.message));
        page.on('requestfailed', r => failures.push(r.url()));
        page.on('response', r => {if (r.status() >= 400) failures.push(`${r.status()} ${r.url()}`);});
        await page.goto(base + '/table');
        await page.locator('.create-session').waitFor();
        for (const [width, height] of [[915, 412], [915, 320], [800, 360], [412, 915], [2400, 1080]]) {
            await page.setViewportSize({width, height});
            for (const active of [false, true]) {
                await page.locator('main').evaluate((e, value) => e.classList.toggle('is-my-turn', value), active);
                const style = await page.evaluate(() => {
                    const root = document.querySelector('main');
                    const layer = getComputedStyle(root, '::before');
                    const button = [...root.querySelectorAll('button:not(:disabled),input:not(:disabled),a[href]')].find(e => {
                        const r = e.getBoundingClientRect();
                        return e.checkVisibility() && r.width > 0 && r.height > 0 && r.x >= 0 && r.y >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
                    });
                    if (!button) throw Error('No visible enabled control to hit-test');
                    const r = button.getBoundingClientRect();
                    return {image: layer.backgroundImage, position: layer.position, pointer: layer.pointerEvents,
                        z: layer.zIndex, width: parseFloat(layer.width), height: parseFloat(layer.height),
                        size: layer.backgroundSize, isolation: getComputedStyle(root).isolation,
                        hit: button.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2))};
                });
                assert.ok(style.image.includes(asset), 'Supplied space image must be the table backdrop, including active turns');
                assert.equal(style.position, 'fixed');
                assert.equal(style.pointer, 'none');
                assert.equal(style.z, '-1');
                assert.equal(style.isolation, 'isolate');
                assert.equal(style.width, width);
                assert.equal(style.height, height);
                assert.ok(style.size.includes('cover'));
                assert.ok(style.hit, 'Background must not intercept a real control');
                cases.push({width, height, active, passed: true});
            }
        }
        const response = await context.request.get(base + asset);
        assert.equal(response.status(), 200);
        assert.match(response.headers()['content-type'], /image\/jpeg/);
        const hash = crypto.createHash('sha256').update(await response.body()).digest('hex');
        assert.equal(hash, expectedHash, 'Served image must match the user-supplied bytes');
        const imageSize = await page.evaluate(src => new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve([image.naturalWidth, image.naturalHeight]);
            image.onerror = () => reject(Error('Image decode failed'));
            image.src = src;
        }), asset);
        assert.deepEqual(imageSize, [1672, 941]);
        assert.deepEqual(errors, []);
        assert.deepEqual(failures, []);
        await page.locator('main').evaluate(e => e.classList.remove('is-my-turn'));
        await page.setViewportSize({width: 915, height: 412});
        await page.screenshot({path: path.join(output, 'space-background-landing.png')});
        const report = {cases, hash, imageSize, errors, failures};
        fs.writeFileSync(path.join(output, 'space-background-verification.json'), JSON.stringify(report, null, 2));
        console.log(JSON.stringify(report, null, 2));
    } finally {
        await browser.close();
    }
})().catch(e => {console.error(e); process.exitCode = 1;});
