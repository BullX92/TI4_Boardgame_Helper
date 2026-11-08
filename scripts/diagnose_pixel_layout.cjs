const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const pw = require(process.env.PLAYWRIGHT_PACKAGE || '/opt/data/.npm/_npx/e41f203b7505f1fb/node_modules/playwright');
const base = process.env.TI4_BASE_URL || 'http://127.0.0.1:18094';
if (!/^http:\/\/(127\.0\.0\.1|localhost):18094$/.test(base)) throw new Error('Diagnostic writes are restricted to the isolated test instance on loopback:18094');
const out = process.env.TI4_EVIDENCE_DIR || '/evidence';
fs.mkdirSync(out, { recursive: true });
(async () => {
 const browser = await pw.chromium.launch({headless:true});
 const context = await browser.newContext({viewport:{width:915,height:412},deviceScaleFactor:2.625,isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (Linux; Android 14; Pixel 7a) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Mobile Safari/537.36'});
 const page = await context.newPage();
 page.setDefaultTimeout(15000);
 const results = [], errors = [];
 page.on('pageerror',e=>errors.push(e.message));
 async function call(p, body, token, method='POST') {
  const r = await context.request.fetch(base+'/api/sessions'+p,{method,headers:{'X-Device-Token':token,'Content-Type':'application/json'},...(body===undefined?{}:{data:body})});
  if(!r.ok()) throw new Error(`${method} ${p}: ${r.status()} ${await r.text()}`);
  return r.json();
 }
 async function view(f, seat=0) {
  await page.goto(base+'/table');
  await page.locator('.create-session').waitFor();
  await page.evaluate(t=>localStorage.setItem('ti4.device',t),f.tokens[seat]);
  await page.goto(base+'/table/'+f.s.joinCode);
  await page.locator('.table-identity').waitFor();
  await page.waitForFunction(()=>document.querySelector('.table-live')?.textContent.includes('Live'));
 }
 async function measure(count,state,sizes=[[915,412],[915,360],[915,320],[800,360],[2400,1080]]) {
  for(const [width,height] of sizes) {
   await page.setViewportSize({width,height});
   await page.evaluate(()=>scrollTo(0,0));
   await page.waitForTimeout(80);
   const r=await page.evaluate(()=>{
    const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}};
    const visible=e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden'&&getComputedStyle(e).display!=='none';
    const selectors=['.table-app','.table-top','.table-identity','.play-grid','.table-focus','.sc-overview','.initiative-list','.setup-panel','.pick-console','.identity-picker','.table-foot'];
    const regions=Object.fromEntries(selectors.flatMap(s=>{const e=document.querySelector(s);return e?[[s,box(e)]]:[]}));
    const controls=[...document.querySelectorAll('main button,main select,main input,main summary')].filter(visible).map(e=>({text:(e.getAttribute('aria-label')||e.textContent).trim().slice(0,65),...box(e)}));
    return {viewport:[innerWidth,innerHeight],screen:[screen.width,screen.height],dpr:devicePixelRatio,document:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],regions,offscreen:controls.filter(r=>r.x<-.5||r.y<-.5||r.right>innerWidth+.5||r.bottom>innerHeight+.5),smallActions:controls.filter(r=>r.height<43.9&&r.text!=='Invite players'&&!r.text.startsWith('Full order')),cards:document.querySelectorAll('[data-card]').length};
   });
   r.players=count;r.state=state;r.size=`${width}x${height}`;
   r.fits=r.document[0]<=width+1&&r.document[1]<=height+1&&r.offscreen.length===0;
   results.push(r);
   if(width===915&&height===320) await page.screenshot({path:path.join(out,`pixel-${count}p-${state}-${width}x${height}.png`)});
  }
 }
 try {
  await page.goto(base+'/table');await page.locator('.create-session').waitFor();
  await measure(0,'create',[[915,412],[915,320]]);
  for(const count of [3,8]) {
   const tokens=Array.from({length:count},()=>crypto.randomBytes(16).toString('hex'));
   const names=(count===3?['A','Bb','Ccc']:['Jakob','Alexandra','Sam','Christine','Maximilian','Lena','Alexander mit langem Spielernamen','Ben']);
   const created=await call('',{name:'Pixel layout regression',language:0,hostName:names[0],playerNames:names,deviceToken:tokens[0]},tokens[0]);
   const f={s:created.session,tokens};f.path='/'+f.s.id;f.ids=f.s.players.map(p=>p.id);
   for(let i=1;i<count;i++) await call(f.path+'/players',{name:'',deviceToken:tokens[i],claimPlayerId:f.ids[i]},tokens[i]);
   await view(f);await measure(count,'setup',[[915,412],[915,320]]);
   const factions=['arborec','barony','crimson','hacan','xxcha','jolnar','ghosts','yssaril'];
   for(let i=0;i<count;i++)await call(f.path+'/players/'+f.ids[i],{factionId:factions[i],isReady:true},tokens[i],'PATCH');
   await call(f.path+'/phase/start',{},tokens[0]);await page.locator('.pick-console').waitFor();await measure(count,'strategy');
   for(let c=1;c<=(count<5?count*2:count);c++){const i=(c-1)%count;await call(f.path+'/players/'+f.ids[i]+'/strategy-cards',{strategyCardId:c},tokens[i]);}
   await call(f.path+'/phase/action',{},tokens[0]);await page.locator('.table-focus').waitFor();await measure(count,'action');
   await call(f.path+'/active-strategy',{strategyCardId:1},tokens[0]);await page.locator('.workflow').waitFor();await measure(count,'primary');
   await view(f,1);await page.locator('.workflow').waitFor();await measure(count,'secondary');
   await view(f);await measure(count,'primary-return',[[915,320]]);
  }
 } catch(e){errors.push(e.stack||e.message);await page.screenshot({path:path.join(out,'pixel-diagnostic-failure.png')}).catch(()=>{});}
 finally {await browser.close();fs.writeFileSync(path.join(out,'pixel-layout-diagnostic.json'),JSON.stringify({results,errors},null,2));console.log(JSON.stringify({cases:results.length,failing:results.filter(r=>!r.fits).map(r=>({players:r.players,state:r.state,size:r.size,document:r.document,offscreen:r.offscreen.map(o=>o.text)})),errors},null,2));if(errors.length)process.exitCode=1;}
})();
