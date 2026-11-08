// Read-only live smoke: never select a seat or mutate an existing game.
const fs=require('node:fs');
const pw=require('/opt/data/.npm/_npx/e41f203b7505f1fb/node_modules/playwright');
(async()=>{
 const base='http://192.168.0.69:8093';
 const browser=await pw.chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:915,height:412},deviceScaleFactor:2.625,isMobile:true,hasTouch:true});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const before=await(await page.request.get(base+'/api/sessions/FS5EQ')).json();
  await page.goto(base+'/table');await page.locator('.create-session').waitFor();
  await page.goto(base+'/table/FS5EQ');await page.locator('.identity-picker').waitFor();
  await page.screenshot({path:'/evidence/live-fs5eq-pixel.png'});
  const geometry=await page.evaluate(()=>({viewport:[innerWidth,innerHeight],document:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],players:[...document.querySelectorAll('.seat-choice strong')].map(e=>e.textContent),links:[...document.querySelectorAll('main a[href]')].map(e=>({text:e.textContent,height:e.getBoundingClientRect().height}))}));
  const after=await(await page.request.get(base+'/api/sessions/FS5EQ')).json();
  const report={version:await(await page.request.get(base+'/api/version')).json(),geometry,errors,sessionUnchanged:JSON.stringify(before)===JSON.stringify(after)};
  fs.writeFileSync('/evidence/live-smoke.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  if(errors.length||!report.sessionUnchanged||geometry.document[0]>915||geometry.document[1]>412)throw Error('Live smoke failed');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
