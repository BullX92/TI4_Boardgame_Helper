// Real Chromium style regression using the same source styles as the components.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const pw=require(process.env.PLAYWRIGHT_PACKAGE||'/opt/data/.npm/_npx/e41f203b7505f1fb/node_modules/playwright');
(async()=>{
 const browser=await pw.chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:915,height:412}});
  const dir=path.join(__dirname,'../Ti4Companion.Web/Components');
  await page.setContent(`<div style="width:400px">${['available','played',''].map(cls=>`<div class="sc-strip ${cls}" style="--card:#ef5555"><div class="sc-face"><div class="sc-label"><strong>Leadership</strong><small>${cls||'Picked'}</small></div></div></div>`).join('')}<button class="wake-status" type="button">☼ Keep screen awake</button></div>`);
  for(const file of ['PrototypeStrategyBoard.razor.css','PrototypeTurnAttention.razor.css'])await page.addStyleTag({content:fs.readFileSync(path.join(dir,file),'utf8')});
  const report=await page.evaluate(()=>({cards:[...document.querySelectorAll('.sc-strip')].map(e=>({state:e.className,filter:getComputedStyle(e).filter,opacity:getComputedStyle(e).opacity,strike:getComputedStyle(e.querySelector('strong')).textDecorationLine})),wake:{border:getComputedStyle(document.querySelector('button')).borderTopWidth,background:getComputedStyle(document.querySelector('button')).backgroundColor,height:document.querySelector('button').getBoundingClientRect().height}}));
  console.log(JSON.stringify(report,null,2));
  const errors=[];
  for(const c of report.cards.slice(0,2))if(c.filter!=='grayscale(1)'||!c.strike.includes('line-through'))errors.push(c.state+' must be gray and struck through');
  if(report.cards[2].filter!=='none'||report.cards[2].strike.includes('line-through'))errors.push('picked unplayed must remain normal');
  if(parseFloat(report.wake.border)<1||report.wake.background==='rgba(0, 0, 0, 0)'||report.wake.height<44)errors.push('wake control must look like a touch button');
  const component=fs.readFileSync(path.join(dir,'PrototypeTurnAttention.razor'),'utf8');
  if(!/<button[^>]*type="button"/.test(component))errors.push('wake component must declare button type');
  assert.deepEqual(errors,[]);
  await page.screenshot({path:process.env.TI4_VISUAL_SCREENSHOT||'/tmp/card-wake-visuals.png'});
  console.log('PASS: unused/played gray and struck through; picked preserved; wake is a visible button');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
