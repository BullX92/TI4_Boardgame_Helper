// Direct Playwright runner: unlike CLI run-code, it awaits the whole flow across native confirm dialogs.
const fs = require('node:fs');
const path = require('node:path');

async function main() {
    const packagePath = process.argv[2] || 'playwright';
    const engine = process.argv[3] || 'chromium';
    const playwright = require(packagePath);
    if (!['chromium', 'webkit'].includes(engine)) throw new Error('Choose chromium or webkit');
    const run = new Function('return (' + fs.readFileSync(path.join(__dirname, 'verify_compact_ui.js'), 'utf8') + ')')();
    const browser = await playwright[engine].launch({headless:true, ...(engine === 'chromium' ? {channel:'chrome'} : {})});
    const context = await browser.newContext();
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    const output = path.join(__dirname, '..', 'output', 'playwright', engine + '-parallel-undo-checks.json');
    fs.mkdirSync(path.dirname(output), {recursive:true});
    let report;
    try {
        report = await run(page);
        fs.writeFileSync(output, JSON.stringify(report, null, 2));
        console.log(JSON.stringify({browser:engine, layouts:report.layouts.length, errors:report.errors.length, interactions:report.interactions, report:output}, null, 2));
    } catch (error) {
        report = await page.evaluate(() => window.__ti4UiReport).catch(() => null) || {};
        report.failure = error.message;
        fs.writeFileSync(output, JSON.stringify(report, null, 2));
        await page.screenshot({path:path.join(path.dirname(output), engine + '-parallel-failure.png')}).catch(() => {});
        throw error;
    } finally {
        await browser.close();
    }
}

main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
