// Run against the local development server with playwright-cli run-code --filename.
// Creates disposable sessions, keeps device tokens in memory, and saves only screenshots/results.
async page => {
    const base = (process.env.TI4_BASE_URL || 'http://localhost:5116').replace(/\/$/, '');
    const engine = page.context().browser().browserType().name();
    const report = { browser: engine, layouts: [], interactions: {}, errors: [] };
    const check = (ok, message) => { if (!ok) throw new Error(message); };
    page.on('pageerror', error => report.errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
    try {
    async function call(path, body, token, method = 'POST') {
        const response = await page.request.fetch(base + '/api/sessions' + path, {
            method, headers: { 'X-Device-Token': token, 'Content-Type': 'application/json' },
            ...(body === undefined ? {} : { data: body })
        });
        check(response.ok(), `Fixture request ${path}: ${response.status()}`);
        return response.json();
    }
    async function table(count) {
        const tokens = await page.evaluate(count => Array.from({length: count}, () => crypto.randomUUID().replaceAll('-', '')), count);
        const names = ['Jakob', 'Alexandra', 'Sam', 'Christine', 'Maximilian', 'Lena', 'Alexander mit langem Spielernamen', 'Ben'].slice(0, count);
        const created = await call('', { name: 'Table Prototype', language: 0, hostName: names[0], playerNames: names, deviceToken: tokens[0] }, tokens[0]);
        let s = created.session;
        const ids = s.players.map(p => p.id), path = '/' + s.id;
        for (let i = 1; i < count; i++) await call(path + '/players', { name: '', deviceToken: tokens[i], claimPlayerId: ids[i] }, tokens[i]);
        const factions = [count > 4 ? 'naalu' : 'sol', 'hacan', 'sardakk', 'arborec', 'xxcha', 'jolnar', 'ghosts', 'yssaril'];
        for (let i = 0; i < count; i++) await call(path + '/players/' + ids[i], { factionId: factions[i], isReady: true }, tokens[i], 'PATCH');
        await call(path + '/phase/start', {}, tokens[0]);
        for (let card = 1; card <= (count < 5 ? count * 2 : count); card++) {
            const i = (card - 1) % count;
            await call(path + '/players/' + ids[i] + '/strategy-cards', { strategyCardId: card }, tokens[i]);
        }
        s = await call(path + '/phase/action', {}, tokens[0]);
        await page.evaluate(tokens => {
            localStorage.setItem('ti4.device', tokens[0]);
            tokens.slice(0, 3).forEach((token, i) => localStorage.setItem(`prototype.${i+1}.ti4.device`, token));
        }, tokens);
        await page.goto(base + '/table/' + s.joinCode + '?device=1');
        await page.locator('.table-focus').waitFor();
        await page.waitForFunction(() => document.querySelector('.table-live')?.textContent.includes('Live'));
        return { s, tokens, ids, path };
    }
    async function layout(count, width, height) {
        await page.setViewportSize({ width, height });
        await page.locator('.initiative-wheel[data-wheel-ready=true]').waitFor();
        await page.evaluate(() => scrollTo(0, 0));
        const result = await page.evaluate(() => {
            const box = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom, right: r.right }; };
            return {
                viewport: [innerWidth, innerHeight], horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
                focus: box('.table-focus'), board: box('.sc-overview'), order: box('.initiative-list'),
                cards: document.querySelectorAll('[data-card]').length,
                wheel: Object.assign({}, document.querySelector('.initiative-wheel').dataset),
                rail: box('.tools-toggle'),
                touchHeights: Array.from(document.querySelectorAll('.turn-actions button, .own-cards button, .tools-toggle, .undo-button')).map(e => e.getBoundingClientRect().height)
            };
        });
        check(!result.horizontalOverflow, `${count} players ${width}x${height}: horizontal overflow`);
        check(result.cards === 8, 'All eight cards must remain visible in the board');
        check(result.wheel.depth === '1.3' && result.wheel.duration === '1800' && result.wheel.glow === '0.35' && result.wheel.originalColors === '80', 'Chosen hologram settings must be preserved');
        check(result.touchHeights.every(h => h >= 43.9), 'Touch controls must be at least 44px high');
        check(result.rail.width >= 43.9 && result.rail.right <= result.focus.x + 1, 'Collapsed tools rail must have its own space beside game actions');
        if (width > height && height >= 360) {
            check(result.board.x > result.focus.x + result.focus.width - 1, 'Landscape must have two columns');
            check(result.board.bottom <= height + 1, `${count} players ${width}x${height}: board bottom ${result.board.bottom}`);
            check(result.order.bottom <= height + 1, `${count} players ${width}x${height}: initiative bottom ${result.order.bottom}`);
        }
        if (width < height && width < 600) check(result.board.y > result.order.y, 'Portrait must stack the board below the controls');
        const screenshot = `output/playwright/${engine}-compact-${count}p-${width}x${height}.png`;
        await page.screenshot({ path: screenshot });
        report.layouts.push({ players: count, size: `${width}x${height}`, horizontalOverflow: result.horizontalOverflow, boardBottom: Math.ceil(result.board.bottom), initiativeBottom: Math.ceil(result.order.bottom), minTouchHeight: Math.min(...result.touchHeights), screenshot });
    }
    await page.goto(base + '/prototype.html');
    await page.setViewportSize({width:844,height:390});
    const three = await table(3);
    for (const [w,h] of [[2400,1080],[800,360],[844,390],[812,375],[740,360],[667,375],[640,360],[390,844],[1440,900]]) await layout(3,w,h);
    await page.setViewportSize({width:667,height:375});
    const tools = page.locator('.table-tools-dialog');
    const toggle = page.getByRole('button', {name:'Open table tools',exact:true});
    for (const size of [[667,375],[390,844]]) {
        await page.setViewportSize({width:size[0],height:size[1]});
        await toggle.click();
        await page.locator('.table-tools-dialog[open]').waitFor();
        check(await tools.getByRole('button',{name:/Player times/}).count() === 1, 'Time option appears inside the expanded rail');
        check(await tools.getByRole('button',{name:/Admin/,exact:false}).count() === 1, 'Admin option appears for the host');
        for (const name of ['Player times','Admin']) {
            await tools.getByRole('button',{name:new RegExp(name)}).click();
            const panel = tools.locator('.tools-panel');
            const r = await panel.boundingBox();
            check(r.x >= 0 && r.x + r.width <= size[0]+1 && r.height <= size[1]+1, `${name} panel fits ${size}`);
            check(await panel.evaluate(e=>e.scrollWidth <= e.clientWidth+1), `${name} content must not overflow horizontally`);
            check(await panel.getByRole('heading',{name:name === 'Admin' ? 'Admin panel' : name,exact:true}).isVisible(), 'Selected panel is visible');
            await tools.getByRole('button',{name:'Close panel',exact:true}).click();
            check(await tools.locator('.tools-panel').count() === 0, 'Closing one panel keeps the options available');
        }
        await page.keyboard.press('Shift+Tab');
        check(await page.evaluate(()=>!!document.activeElement.closest('.table-tools-dialog')), 'Keyboard focus stays inside the native modal');
        check(await page.evaluate(()=>{document.querySelector('.turn-actions button').focus();return !!document.activeElement.closest('.table-tools-dialog');}), 'Open modal makes background game actions inert');
        await page.keyboard.press('Escape');
        await page.locator('.table-tools-dialog[open]').waitFor({state:'hidden'});
        await page.waitForFunction(()=>document.querySelector('.tools-toggle').getAttribute('aria-expanded') === 'false');
        check(await toggle.evaluate(e=>e===document.activeElement), 'Closing returns keyboard focus to the rail');
        await toggle.click();
        await tools.locator('.tools-scrim').click({position:{x:size[0]-8,y:size[1]-8}});
        await page.locator('.table-tools-dialog[open]').waitFor({state:'hidden'});
    }
    await page.setViewportSize({width:667,height:375});
    await toggle.click();
    await tools.getByRole('button',{name:/Admin/}).click();
    await tools.getByRole('button',{name:"End Jakob's turn →",exact:true}).click();
    await page.waitForFunction(id=>document.querySelector('.initiative-wheel').dataset.focusPlayer === id,three.ids[1]);
    check(await tools.isVisible(), 'Admin panel stays usable after a live game update');
    await tools.getByRole('button',{name:/Player times/}).click();
    check(await tools.locator('.time-player').count() === 3, 'Player times shows the actual roster');
    check(await tools.locator('.time-player strong').first().textContent().then(t=>/^\d{2}:\d{2}:\d{2}$/.test(t)), 'Turn times are rendered');
    await tools.locator('.tools-close').click();
    await call(three.path+'/turn/advance',undefined,three.tokens[1]);
    await call(three.path+'/turn/advance',undefined,three.tokens[2]);
    await page.waitForFunction(id=>document.querySelector('.initiative-wheel').dataset.focusPlayer === id,three.ids[0]);
    await page.locator('.initiative-wheel:not(.wheel-moving)').waitFor();
    report.interactions.drawers = 'Vertical tools rail, viewport-safe panels, close/backdrop/Escape, focus trapping/restoration, working Admin handoff and player times';
    const second = await page.context().newPage();
    await second.setViewportSize({width:844,height:390});
    await second.goto(base + '/table/' + three.s.joinCode + '?device=2');
    await second.locator('.table-focus').waitFor();
    await second.getByRole('button',{name:'Open table tools',exact:true}).click();
    await second.locator('.table-tools-dialog[open]').waitFor();
    check(await second.locator('.table-tools-dialog').getByRole('button',{name:/Admin/}).count() === 0, 'Non-hosts must not see an Admin option');
    await second.keyboard.press('Escape');
    const third = await page.context().newPage();
    await third.setViewportSize({width:844,height:390});
    await third.goto(base + '/table/' + three.s.joinCode + '?device=3');
    await third.locator('.table-focus').waitFor();
    await page.getByRole('button', {name:'PLAY 1 Leadership →',exact:true}).click();
    await page.getByRole('button', {name:'Primary complete →',exact:true}).waitFor();
    await second.getByRole('button', {name:'Follow',exact:true}).waitFor();
    await third.getByRole('button', {name:'Skip',exact:true}).waitFor();
    const undo = page.getByRole('button',{name:'Undo last own action',exact:true});
    await page.waitForFunction(()=>!document.querySelector('.undo-button').disabled);
    let cancelSeen = false;
    page.once('dialog',async d=>{cancelSeen = d.type()==='confirm';await d.dismiss();});
    await undo.click();
    check(cancelSeen && await page.getByRole('button',{name:'Primary complete →',exact:true}).isVisible(), 'Canceling Undo must retain the running SC');
    page.once('dialog',async d=>{await d.accept();});
    await undo.click();
    await page.getByRole('button',{name:'PLAY 1 Leadership →',exact:true}).waitFor();
    await second.getByRole('button',{name:'Follow',exact:true}).waitFor({state:'hidden'});
    await page.getByRole('button',{name:'PLAY 1 Leadership →',exact:true}).click();
    await third.getByRole('button',{name:'Skip',exact:true}).waitFor();
    // Both secondaries are available while the owner is still resolving the primary.
    await third.getByRole('button',{name:'Skip',exact:true}).click();
    await second.getByRole('button', {name:'Follow',exact:true}).click();
    await second.getByRole('button', {name:'Secondary complete ✓',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('.secondary-progress')?.textContent.includes('0 pending'));
    check(await page.getByRole('button',{name:'Primary complete →',exact:true}).isVisible(), 'Finishing secondaries must not complete the primary');
    await page.getByRole('button', {name:'Primary complete →',exact:true}).click();
    await page.getByRole('button',{name:'End turn →',exact:true}).waitFor();
    await page.waitForFunction(()=>!document.querySelector('.undo-button').disabled);
    page.once('dialog',async d=>{await d.accept();});
    await undo.click();
    await page.getByRole('button',{name:'Primary complete →',exact:true}).waitFor();
    check(await second.getByRole('button',{name:'Follow',exact:true}).count() === 0, 'Undoing the primary keeps completed secondary answers');
    await page.getByRole('button',{name:'Primary complete →',exact:true}).click();
    await page.waitForFunction(() => document.querySelector('[data-card="1"]')?.dataset.played === 'true');
    await page.getByRole('button', {name:'End turn →',exact:true}).click();
    await second.getByRole('heading', {name:'Your move',exact:true}).waitFor();
    await page.waitForFunction(id => document.querySelector('.initiative-wheel')?.dataset.focusPlayer === id, three.ids[1]);
    await second.waitForFunction(id => document.querySelector('.initiative-wheel')?.dataset.focusPlayer === id, three.ids[1]);
    check(await page.locator('.initiative-wheel').evaluate(el => el.classList.contains('wheel-moving')), 'Real turn change must animate the wheel');
    check(await second.locator('.initiative-wheel').evaluate(el => el.classList.contains('wheel-moving')), 'Turn animation must synchronize on the second device');
    report.interactions.turnFlow = 'Immediate independent secondaries, confirmation/cancel/accept of own Undo, preserved secondary answers, and synchronized turn handoff across three devices';
    await third.close();
    await second.close();
    await page.setViewportSize({width:844,height:390});
    await page.screenshot({path:`output/playwright/${engine}-compact-waiting-844x390.png`});
    const wake = await page.evaluate(async () => { const mod = await import('/prototype-turn-attention.js'); return typeof mod.request; });
    check(wake === 'function', 'Screen wake-lock module must load');
    report.interactions.wakeModule = 'Loads successfully';
    for (const count of [6,8]) {
        const fixture = await table(count);
        check((await page.locator('.init-player').first().textContent()).trim().startsWith('0'), 'Naalu initiative 0 must sort first');
        check(await page.locator('.naalu-token').count() === 1, 'Naalu initiative must remain visible');
        for (const [w,h] of [[2400,1080],[800,360],[844,390],[812,375],[740,360],[667,375],[640,360],[390,844]]) await layout(count,w,h);
        if (count === 6) {
            await page.setViewportSize({width:667,height:375});
            await page.locator('.wheel-roster>summary').click();
            check(await page.locator('.wheel-roster-list .init-player').count() === 6, 'Full roster remains available');
            await page.locator('.wheel-roster>summary').click();
            const {ids,tokens,path} = fixture;
            async function finishCardAndPass(index) {
                const card = index + 1;
                await page.waitForFunction(id => document.querySelector('.initiative-wheel')?.dataset.focusPlayer === id, ids[index]);
                await page.locator('.initiative-wheel:not(.wheel-moving)').waitFor();
                let s = await call(path + '/active-strategy', {strategyCardId:card}, tokens[index]);
                await page.waitForFunction(name => document.querySelector('.workflow h3')?.textContent === name, ['Leadership','Diplomacy','Politics','Construction','Trade','Warfare'][index]);
                check((await page.locator('.initiative-wheel').getAttribute('data-focus-player')) === ids[index], 'Primary action must keep the current focus');
                if (card === 3) {
                    const target = s.players.find(p => p.id !== s.speakerPlayerId).id;
                    await call(path + '/speaker', {playerId:target}, tokens[index]);
                }
                await call(path + '/secondary', {playerIds:ids.filter(id => id !== ids[index])}, tokens[index]);
                for (let delta=1; delta<ids.length; delta++) {
                    const seat = (index+delta)%ids.length;
                    await call(path + '/players/' + ids[seat] + '/secondary-done', {}, tokens[seat]);
                }
                await page.locator('.workflow').waitFor({state:'hidden'});
                check(!await page.locator('.initiative-wheel').evaluate(el => el.classList.contains('wheel-moving')), 'Secondaries must not replay the turn animation');
                return call(path + '/players/' + ids[index] + '/pass', {passed:true}, tokens[index]);
            }
            await finishCardAndPass(0);
            await page.waitForFunction(id => document.querySelector('.initiative-wheel')?.dataset.focusPlayer === id, ids[1]);
            check((await page.locator('.wheel-slot').evaluateAll(slots => slots.filter(s => Number(s.dataset.rank)>=0).map(s=>s.dataset.playerId))).every(id=>id!==ids[0]), 'Passed players must be skipped by the wheel');
            const duration = await page.locator('.wheel-figure').first().evaluate(el=>getComputedStyle(el).transitionDuration);
            check(duration.startsWith('1.8s'), 'The real animation must last 1800ms');
            await call(path + '/turn/advance', undefined, tokens[1]);
            await call(path + '/turn/advance', undefined, tokens[2]);
            await page.waitForFunction(id => document.querySelector('.initiative-wheel')?.dataset.focusPlayer === id, ids[3]);
            await page.locator('.initiative-wheel:not(.wheel-moving)').waitFor();
            check((await page.locator('.wheel-slot').evaluateAll(slots => slots.find(s=>s.dataset.rank==='0')?.dataset.playerId)) === ids[3], 'Rapid turns must settle on the latest server focus');
            for (const seat of [3,4,5,1]) await finishCardAndPass(seat);
            await page.waitForFunction(id => document.querySelector('.initiative-wheel')?.dataset.focusPlayer === id, ids[2]);
            await page.locator('.initiative-wheel:not(.wheel-moving)').waitFor();
            check(await page.locator('.wheel-slot[aria-hidden=false]').count() === 1, 'Last remaining player must appear once');
            await page.screenshot({path:`output/playwright/${engine}-wheel-last-player.png`});
            await call(path + '/turn/advance', undefined, tokens[2]);
            check(!await page.locator('.initiative-wheel').evaluate(el => el.classList.contains('wheel-moving')), 'Same-player turns must not spin a duplicate player into view');
            await finishCardAndPass(2);
            await page.locator('.wheel-empty').waitFor();
            check(await page.locator('.wheel-slot[aria-hidden=false]').count() === 0, 'All-passed state must not display a phantom active player');
            await page.screenshot({path:`output/playwright/${engine}-wheel-all-passed.png`});
            report.interactions.wheel = '1800ms synchronized turns, chosen settings, full roster, skip passed players, no spin during secondaries, rapid turns, single remaining player, and all-passed state';
        }
    }
    check(report.errors.length === 0, 'Browser errors: ' + report.errors.join('; '));
    } catch (error) {
        report.failure = error.message;
    }
    // Native confirmation dialogs may consume the CLI's direct response; keep an inspectable result too.
    await page.evaluate(result => { window.__ti4UiReport = result; }, report);
    if (report.failure) throw new Error(report.failure);
    return report;
}
