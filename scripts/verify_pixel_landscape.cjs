// Disposable fixtures ONLY. No production URL, session identifier or token is accepted.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const base = process.env.TI4_BASE_URL || 'http://127.0.0.1:18094';
if (!/^http:\/\/(127\.0\.0\.1|localhost):18094$/.test(base)) throw Error('Only isolated loopback:18094 is permitted');
const pw = require(process.env.PLAYWRIGHT_PACKAGE || '/opt/data/.npm/_npx/e41f203b7505f1fb/node_modules/playwright');
const out = process.env.TI4_EVIDENCE_DIR || '/evidence';
const sizes = [[915,412],[915,360],[915,320],[800,360],[2400,1080],[1440,900],[412,915],[915,320],[915,412]];
fs.mkdirSync(out, {recursive:true});
(async () => {
 const browser = await pw.chromium.launch({headless:true, ...(process.env.PLAYWRIGHT_CHANNEL ? {channel:process.env.PLAYWRIGHT_CHANNEL} : {})});
 // Production uses plain HTTP on a LAN IP (no service workers). Loopback is otherwise
 // a secure context and spuriously exercises PWA activation/cache/reload during layout tests.
 const context = await browser.newContext({serviceWorkers:'block',viewport:{width:915,height:412},deviceScaleFactor:2.625,isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (Linux; Android 14; Pixel 7a) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Mobile Safari/537.36'});
 const page = await context.newPage();
 page.setDefaultTimeout(15000);
 const results = [], errors = [], networkFailures = [], owned = new Set(), codes = new Map();
 page.on('pageerror', e => errors.push(e.message));
 page.on('requestfailed', r => networkFailures.push({url:r.url(),failure:r.failure(),state:results.at(-1)?.state}));
 page.on('response', r => {if(r.status()>=400)networkFailures.push({url:r.url(),status:r.status()});});
 const check = (ok, message) => { if (!ok) throw Error(message); };
 async function call(p, body, token, method='POST') {
  if (p && !owned.has(p.split('/')[1])) throw Error('Refusing a session not created by this run');
  const target = method==='GET' ? '/'+codes.get(p.slice(1)) : p;
  const response = await context.request.fetch(base+'/api/sessions'+target,{method,maxRedirects:0,headers:{'X-Device-Token':token,'Content-Type':'application/json'},...(body===undefined?{}:{data:body})});
  check(response.ok(), `${method} ${p}: ${response.status()} ${await response.text()}`);
  return response.json();
 }
 async function view(f, seat=0, choose=false) {
  await page.goto(base+'/table'); await page.locator('.create-session').waitFor();
  await page.evaluate(t=>localStorage.setItem('ti4.device',t),f.tokens[seat]);
  await page.goto(base+'/table/'+f.s.joinCode+(choose?'?choose=true':''));
  await page.locator(choose?'.identity-picker':'.table-identity').waitFor();
  await page.waitForFunction(()=>document.querySelector('.table-live')?.textContent.includes('Live'));
 }
 async function measure(count,state,viewports=sizes) {
  for (const [width,height] of viewports) {
   await page.setViewportSize({width,height});
   await page.evaluate(()=>scrollTo({left:0,top:0,behavior:'instant'}));
   await page.waitForTimeout(150);
   const r = await page.evaluate(() => {
    const landscape = innerWidth > innerHeight && innerWidth >= 800;
    const box = e => {const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
    const visible = e => e.checkVisibility({checkVisibilityCSS:true,checkOpacity:true}) && !e.closest('details:not([open]) :not(summary)');
    const inside = r => r.x>=-.75 && r.y>=-.75 && r.right<=innerWidth+.75 && r.bottom<=innerHeight+.75;
    const modal = document.querySelector('dialog[open]');
    const root = modal || document.querySelector('main');
    const issues = [], controls = [];
    const auxiliary = '.player-names,.create-intro,.create-session>details,.setup-choice,.setup-roster,.identity-picker,.tools-panel,.tools-panel-content,.tools-nav,.wheel-roster-list';
    const saved = new Map();
    for (const e of root.querySelectorAll('button,select,input,summary,a[href]')) {
     if (!visible(e) || e.matches('.tools-scrim')) continue;
     const name = (e.getAttribute('aria-label')||e.textContent).trim().slice(0,85);
     // A bounded inner list is allowed only if each control can actually be scrolled into view.
     const scrollers=[];
     for(let a=e.parentElement;a&&a!==document.body;a=a.parentElement){
      if(a.matches(auxiliary)&&/auto|scroll/.test(getComputedStyle(a).overflowY)&&a.scrollHeight>a.clientHeight+1) scrollers.push(a);
     }
     if(landscape){
      for(const a of scrollers){if(!saved.has(a))saved.set(a,[a.scrollLeft,a.scrollTop]);const er=box(e),ar=box(a);a.scrollTop+=er.bottom>ar.bottom?er.bottom-ar.bottom+2:er.y<ar.y?er.y-ar.y-2:0;}
     } else {
      // Portrait may page-scroll; exercise reachability instead of requiring simultaneous fit.
      e.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});
     }
     const target=e.matches('input[type=checkbox]')?e.closest('label'):e;
     const r=box(target); const failures=[];
     if(!inside(r)) failures.push('offscreen');
     if(r.height<43.9||r.width<43.9)failures.push('touch target <44px');
     for(let a=e.parentElement;a&&a!==document.body;a=a.parentElement){
      const s=getComputedStyle(a),ar=box(a);
      if((/hidden|clip|auto|scroll/.test(s.overflowY)&&(r.y<ar.y-.75||r.bottom>ar.bottom+.75))||(/hidden|clip|auto|scroll/.test(s.overflowX)&&(r.x<ar.x-.75||r.right>ar.right+.75)))failures.push('clipped ancestor '+a.className);
     }
     // Not just the centre: edge coverage catches overlapping panels and the tools tab.
     for(const [fx,fy] of [[.5,.5],[.15,.5],[.85,.5]]){
      const hit=document.elementFromPoint(r.x+r.width*fx,r.y+r.height*fy);
      if(!hit||!(target===hit||target.contains(hit)))failures.push('covered at '+fx);
     }
     controls.push({name,...r,internalScroll:scrollers.length>0,failures});
     if(failures.length)issues.push({name,failures});
    }
    for(const [e,[x,y]] of saved){e.scrollLeft=x;e.scrollTop=y;}
    scrollTo({left:0,top:0,behavior:'instant'});
    const roster=document.querySelector('.wheel-roster[open]');
    if(roster){
     const list=roster.querySelector('.wheel-roster-list'), initial=list.scrollTop;
     const lr=box(list);
     if(!inside(lr)||lr.height<44)issues.push({name:'full roster',failures:['popover must be viewport-bounded and usable']});
     for(const row of list.querySelectorAll('.init-player')){
      const rr=box(row);list.scrollTop+=rr.bottom>lr.bottom?rr.bottom-lr.bottom+2:rr.y<lr.y?rr.y-lr.y-2:0;
      const r=box(row),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
      if(!inside(r)||r.y<lr.y-.75||r.bottom>lr.bottom+.75||!hit||!row.contains(hit))issues.push({name:'roster '+row.textContent.trim(),failures:['row not reachable inside popover']});
     }
     list.scrollTop=initial;
    }
    const selectors=modal?['.tools-dock','.tools-nav','.tools-panel-close']:['.table-app','.table-top','.table-identity','.play-grid','.table-focus','.sc-overview','.initiative-wheel','.wheel-stage','.setup-panel','.pick-console','.identity-picker','.status-panel','.table-foot'];
    const regions=Object.fromEntries(selectors.flatMap(s=>{const e=document.querySelector(s);return e&&visible(e)?[[s,box(e)]]:[];}));
    if(landscape)for(const [name,r] of Object.entries(regions))if(!inside(r))issues.push({name,failures:['region offscreen']});
    const cards=[...document.querySelectorAll('[data-card]')].map(e=>({id:e.dataset.card,...box(e)}));
    if(!modal&&cards.length){if(cards.length!==8)issues.push({name:'board',failures:['not eight rows']});if(landscape)for(const c of cards)if(!inside(c))issues.push({name:'card '+c.id,failures:['offscreen']});
     // An explicitly opened roster may cover the informational board, never turn actions.
     // Its rows are independently checked above, and normal board hit-tests resume on close.
     if(landscape&&!roster)for(const e of document.querySelectorAll('.sc-face,.sc-label strong,.card-owner,.sc-number')){const r=box(e);if(!inside(r))issues.push({name:e.className||e.textContent,failures:['board content offscreen']});const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);if(!hit||!(hit===e||e.contains(hit)))issues.push({name:e.className,failures:['board content covered']});}}
    if(landscape&&document.querySelector('.play-grid')){
     const order=document.querySelector('.order-zone'),turn=document.querySelector('.turn-main'),strategy=document.querySelector('.strategy-zone');
     if(!order||!turn||!strategy)issues.push({name:'three-zone layout',failures:['missing order/actions/strategy zone']});
     else{
      const l=box(order),c=box(turn),r=box(strategy);
      if(l.right>c.x+.75||c.right>r.x+.75||Math.abs(l.y-c.y)>1||Math.abs(c.y-r.y)>1)issues.push({name:'three-zone layout',failures:['order, actions and strategy must be side by side left to right']});
      if(!order.querySelector('.initiative-wheel')||!strategy.querySelector('.sc-overview')||!turn.querySelector('.table-focus,.pick-console'))issues.push({name:'zone content',failures:['wheel/actions/strategy in wrong zone']});
     }
    }
    const identity=document.querySelector('.table-identity'),header=document.querySelector('.table-top');
    if(identity&&landscape){const ir=box(identity),hr=box(header);if(!header.contains(identity)||ir.y<hr.y-.75||ir.bottom>hr.bottom+.75)issues.push({name:'header identity',failures:['player details must fit inside compact header']});}
    if(header&&document.querySelector('.play-grid')){
     const center=document.querySelector('.turn-main'),hr=box(header),cr=box(center);
     if(!center.contains(header)||hr.x<cr.x-.75||hr.right>cr.right+.75)issues.push({name:'central header',failures:['header must be inside middle sector']});
    }
    if(header?.querySelector('.wake-status')||identity&&!document.querySelector('dialog .wake-status'))issues.push({name:'wake location',failures:['wake switch must be in persistent left tools only']});
    const mutedCards=[...document.querySelectorAll('.sc-strip.available,.sc-strip.played')].map(e=>({id:e.dataset.card,filter:getComputedStyle(e).filter,strike:getComputedStyle(e.querySelector('.sc-label strong')).textDecorationLine}));
    for(const c of mutedCards)if(!c.filter.includes('grayscale(1)')||!c.strike.includes('line-through'))issues.push({name:'card visual '+c.id,failures:['unpicked/played must be gray and struck through']});
    for(const e of document.querySelectorAll('.sc-strip:not(.available):not(.played)'))if(getComputedStyle(e).filter.includes('grayscale(1)')||getComputedStyle(e.querySelector('.sc-label strong')).textDecorationLine.includes('line-through'))issues.push({name:'picked card '+e.dataset.card,failures:['unplayed picked card must stay colored and not crossed out']});
    const wake=document.querySelector('.wake-status');
    if(wake&&visible(wake)){
     const ws=getComputedStyle(wake);
     if(wake.tagName!=='BUTTON'||wake.type!=='button'||wake.getAttribute('role')!=='switch'||parseFloat(ws.borderTopWidth)<1||ws.borderTopStyle==='none'||ws.backgroundColor==='rgba(0, 0, 0, 0)')issues.push({name:'Keep screen awake',failures:['must be a visibly styled button']});
    }
    const wheel=document.querySelector('.initiative-wheel');
    if(wheel&&landscape&&!wheel.classList.contains('wheel-moving')){
     const stage=box(wheel.querySelector('.wheel-stage'));
     for(const e of wheel.querySelectorAll('.wheel-slot[aria-hidden="false"] .wheel-label')){const r=box(e);if(r.x<stage.x-.75||r.right>stage.right+.75||r.y<stage.y-.75||r.bottom>stage.bottom+.75)issues.push({name:'wheel label '+e.textContent.trim(),failures:['name clipped inside wheel stage']});}
     if(wheel.dataset.wheelLayout==='vertical'){
      const figures=[...wheel.querySelectorAll('.wheel-slot[aria-hidden="false"]')].sort((a,b)=>Number(a.dataset.rank)-Number(b.dataset.rank)).map(e=>({rank:Number(e.dataset.rank),...box(e.querySelector('.wheel-figure'))}));
      for(const f of figures)if(f.x<stage.x-2||f.right>stage.right+2||f.y<stage.y-2||f.bottom>stage.bottom+2)issues.push({name:'Holo figure '+f.rank,failures:['figure clipped inside stage']});
      if(stage.height>=240&&figures.length>=2&&(figures[0].height<=90||figures[1].height<=55))issues.push({name:'Holo fill',failures:['current/next must grow into available space']});
     }
    }
    if(wheel&&['1.3','1800','0.35','80'].some((v,i)=>wheel.dataset[['depth','duration','glow','originalColors'][i]]!==v))issues.push({name:'wheel',failures:['hologram settings changed']});
    const documentSize=[document.documentElement.scrollWidth,document.documentElement.scrollHeight];
    if(documentSize[0]>innerWidth+1||(landscape&&documentSize[1]>innerHeight+1))issues.push({name:'document',failures:['overflow '+documentSize.join('x')]});
    return {viewport:[innerWidth,innerHeight],dpr:devicePixelRatio,touch:navigator.maxTouchPoints,landscape,document:documentSize,regions,cards,controls,issues,fits:issues.length===0};
   });
   Object.assign(r,{players:count,state,size:`${width}x${height}`}); results.push(r);
   if(width===915&&height===320)await page.screenshot({path:path.join(out,`verify-${count}p-${state}-${results.length}.png`)});
  }
 }
 async function tools(count) {
  await page.setViewportSize({width:915,height:320});
  await page.getByRole('button',{name:'Open table tools',exact:true}).tap();
  await page.locator('dialog[open]').waitFor(); await measure(count,'tools',[[915,320]]);
  await page.getByRole('button',{name:'Player times',exact:true}).tap();await page.getByRole('region',{name:'Player times panel'}).waitFor();
  await measure(count,'tools-times',[[915,320],[800,360]]);
  await page.getByRole('button',{name:'Admin',exact:true}).tap();await page.getByRole('region',{name:'Admin panel'}).waitFor();
  await measure(count,'tools-admin',[[915,320],[800,360]]);
  const details=page.locator('.tools-panel details');
  for(let i=0;i<await details.count();i++)await details.nth(i).evaluate(e=>e.open=true);
  await measure(count,'tools-admin-expanded',[[915,320]]);
  await page.locator('.tools-close').tap();await page.locator('dialog[open]').waitFor({state:'hidden'});
 }
 try {
  await page.goto(base+'/table');await page.locator('.create-session').waitFor();await measure(0,'create');
  await page.getByLabel('Number of players',{exact:true}).selectOption('8');await measure(0,'create-eight');
  await page.getByText('Already invited?',{exact:true}).tap();await measure(0,'join',[[915,320],[412,915]]);
  for(const count of [3,8]){
   const tokens=Array.from({length:count},()=>crypto.randomBytes(16).toString('hex'));
   const names=['Jakob','Alexandra','Sam','Christine','Maximilian','Lena','Alexander mit langem Spielernamen','Ben'].slice(0,count);
   const created=await call('',{name:'Table Prototype',language:0,hostName:names[0],playerNames:names,deviceToken:tokens[0]},tokens[0]);
   const f={s:created.session,tokens};owned.add(f.s.id);codes.set(f.s.id,f.s.joinCode);f.path='/'+f.s.id;f.ids=f.s.players.map(p=>p.id);
   await view(f,0,true);await measure(count,'seat-selection');
   for(let i=1;i<count;i++)await call(f.path+'/players',{name:'',deviceToken:tokens[i],claimPlayerId:f.ids[i]},tokens[i]);
   await view(f);await measure(count,'setup');
   await view(f,1);
   await page.getByRole('button',{name:'Open table tools',exact:true}).tap();
   await page.getByRole('button',{name:'Admin',exact:true}).tap();
   await page.getByRole('region',{name:'Admin panel',exact:true}).waitFor();
   const factionSaved=page.waitForResponse(r=>r.url().endsWith('/players/'+f.ids[0])&&r.request().method()==='PATCH');
   await page.getByLabel('Faction for Jakob',{exact:true}).selectOption('arborec');
   check((await factionSaved).ok(),'non-host admin must be able to change another player faction');
   check((await call(f.path,undefined,tokens[1],'GET')).players.find(p=>p.id===f.ids[0]).factionId==='arborec','non-host edit persisted on server');
   await measure(count,'shared-admin-setup',[[915,320],[915,412],[800,360]]);
   await page.locator('.tools-close').tap();await page.locator('dialog[open]').waitFor({state:'hidden'});
   await view(f);
   const factions=['arborec','barony','crimson','hacan','xxcha','jolnar','ghosts','yssaril'];
   for(let i=0;i<count;i++)await call(f.path+'/players/'+f.ids[i],{factionId:factions[i],isReady:true},tokens[i],'PATCH');
   await call(f.path+'/phase/start',{},tokens[0]);await page.locator('.pick-console').waitFor();await measure(count,'draft-own');
   await view(f,1);await measure(count,'draft-waiting');await view(f);
   for(let c=1;c<=(count<5?count*2:count);c++){const i=(c-1)%count;await call(f.path+'/players/'+f.ids[i]+'/strategy-cards',{strategyCardId:c},tokens[i]);}
   await call(f.path+'/phase/action',{},tokens[0]);await page.locator('.table-focus').waitFor();await measure(count,'action');await tools(count);
   await page.locator('.wheel-roster>summary').tap();await measure(count,'full-roster',[[915,320],[800,360]]);await page.locator('.wheel-roster>summary').tap();await measure(count,'roster-closed',[[915,320]]);
   await view(f,1);await measure(count,'waiting');await view(f);
   await page.locator('.own-cards button').first().tap();await page.locator('.workflow').waitFor();await measure(count,'primary');
   await view(f,1);await measure(count,'secondary-pending');
   await page.getByRole('button',{name:'Follow',exact:true}).tap();await page.getByRole('button',{name:'Secondary complete ✓',exact:true}).waitFor();await measure(count,'secondary-followed');
   await page.getByRole('button',{name:'Secondary complete ✓',exact:true}).tap();await page.locator('.secondary-done').waitFor();await measure(count,'secondary-done',[[915,320]]);
   await view(f);await page.getByRole('button',{name:'Primary complete →',exact:true}).tap();
   for(let i=2;i<count;i++)await call(f.path+'/players/'+f.ids[i]+'/secondary-done',{actionId:(await call(f.path,undefined,tokens[0],'GET')).strategyActionId},tokens[i]);
   await page.locator('.turn-actions').waitFor();
   // Drive the actual initiative order and all remaining cards to reach Politics and status.
   for(let guard=0;guard<40;guard++){
    const s=await call(f.path,undefined,tokens[0],'GET');const active=s.players.find(p=>p.id===s.activePlayerId);if(!active)break;
    const seat=f.ids.indexOf(active.id), card=active.strategyCards.find(c=>!c.isExhausted);
    if(card){
     let current=await call(f.path+'/active-strategy',{strategyCardId:card.strategyCardId},tokens[seat]);
     if(card.strategyCardId===3){await view(f,seat);await page.getByLabel('New Speaker',{exact:true}).waitFor();await measure(count,'politics-speaker');await page.getByLabel('New Speaker',{exact:true}).selectOption(f.ids.find(id=>id!==current.speakerPlayerId));current=await call(f.path,undefined,tokens[0],'GET');}
     await call(f.path+'/primary/complete',{strategyCardId:card.strategyCardId,actionId:current.strategyActionId},tokens[seat]);
     for(let i=0;i<count;i++)if(i!==seat)await call(f.path+'/players/'+f.ids[i]+'/secondary-done',{actionId:current.strategyActionId},tokens[i]);
    }else{await call(f.path+'/players/'+active.id+'/pass',{passed:true},tokens[seat]);}
   }
   await view(f,1);await measure(count,'passed');await view(f);
   await call(f.path+'/phase/status',{},tokens[0]);await page.locator('.table-meta').filter({hasText:'Status phase'}).waitFor();await measure(count,'status-scoring');
   for(let i=0;i<count;i++)await call(f.path+'/players/'+f.ids[i]+'/status-done',{done:true},tokens[i]);
   await call(f.path+'/status-stage',{stage:1},tokens[0]);await page.getByText('Reveal a new objective.',{exact:true}).waitFor();await measure(count,'status-reveal');
   await page.getByRole('button',{name:'Objective revealed →',exact:true}).tap();await page.locator('.table-check').first().waitFor();await measure(count,'status-checklist');
   const checks=page.locator('.table-check');for(let i=0;i<await checks.count();i++)await checks.nth(i).tap();
   await page.locator('.table-agenda input').check();await page.getByRole('button',{name:'Next round →',exact:true}).tap();
   await page.locator('.pick-console').waitFor();await measure(count,'next-round',[[915,320],[915,412]]);
  }
 }catch(e){errors.push(e.stack||e.message);await page.screenshot({path:path.join(out,'verify-error.png')}).catch(()=>{});}
 finally{
  await browser.close();
  fs.writeFileSync(path.join(out,'pixel-landscape-verification.json'),JSON.stringify({results,errors,networkFailures},null,2));
  console.log(JSON.stringify({cases:results.length,failed:results.filter(r=>!r.fits).length,failures:results.filter(r=>!r.fits).map(r=>({players:r.players,state:r.state,size:r.size,issues:r.issues})),errors},null,2));
  if(errors.length||networkFailures.length||results.length!==302||results.some(r=>!r.fits))process.exitCode=1;
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
