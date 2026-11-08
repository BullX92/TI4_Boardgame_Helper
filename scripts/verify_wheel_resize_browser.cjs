// Real Chromium CSS regression; no session, API or game state is touched.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const pw = require(process.env.PLAYWRIGHT_PACKAGE || '/opt/data/.npm/_npx/e41f203b7505f1fb/node_modules/playwright');
(async()=>{
 const browser=await pw.chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:915,height:412}});
  const rootDir=path.join(__dirname,'..');
  const source=fs.readFileSync(path.join(rootDir,'Ti4Companion.Web/wwwroot/prototype-initiative-wheel.js'),'utf8');
  const css=fs.readFileSync(path.join(rootDir,'Ti4Companion.Web/Components/PrototypeInitiativeWheel.razor.css'),'utf8');
  await page.setContent(`<div class="initiative-wheel" data-focus-player="a" data-phase="Action" data-duration="1800"><div class="wheel-stage">${['a','b','c'].map((id,i)=>`<div class="wheel-slot" data-player-id="${id}" data-rank="${i}"><div class="wheel-figure"></div><div class="wheel-label">${id}</div></div>`).join('')}</div></div>`);
  await page.addStyleTag({content:css+' .initiative-wheel{width:440px;--wheel-hero-height:76px}.wheel-stage{flex:none!important;height:96px!important;min-height:0!important}'});
  await page.evaluate(async code=>{window.wheel=await import('data:text/javascript;base64,'+btoa(code));window.root=document.querySelector('.initiative-wheel');wheel.update(root);},source);
  await page.waitForTimeout(80);
  await page.evaluate(()=>{root.dataset.focusPlayer='b';const slots=root.querySelectorAll('.wheel-slot');slots[0].dataset.rank='2';slots[1].dataset.rank='0';slots[2].dataset.rank='1';window.started=performance.now();wheel.update(root);});
  await page.waitForTimeout(850);
  await page.addStyleTag({content:'.wheel-stage{height:50px!important}'});
  await page.waitForTimeout(90);
  const report=await page.evaluate(()=>({elapsed:performance.now()-started,moving:root.classList.contains('wheel-moving'),duration:parseFloat(root.style.getPropertyValue('--wheel-duration')),transitions:root.querySelector('.wheel-figure').getAnimations().filter(a=>a.transitionProperty==='transform').map(a=>({duration:a.effect.getTiming().duration,currentTime:a.currentTime}))}));
  console.log(JSON.stringify(report));
  assert(report.moving,'resize must preserve moving state');
  assert(report.duration>400&&report.duration<1150,'retarget duration must reflect remaining handoff time');
  assert(report.transitions.length>0,'real CSS transform transition must run');
  assert(report.transitions.every(t=>t.duration<1150),'CSS must not restart a fresh 1800ms transition');
  await page.waitForTimeout(1050);
  assert(await page.evaluate(()=>!root.classList.contains('wheel-moving')),'handoff must settle at original deadline');
  console.log(JSON.stringify({result:'PASS',...report}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
