// Deterministic geometry contract: evaluate the real presentation module, no game actions.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../Ti4Companion.Web/wwwroot/prototype-initiative-wheel.js'), 'utf8').replace(/export function /g, 'function ');
function layout(width, height, count) {
 const slots = Array.from({length:4}, (_,rank)=>({dataset:{playerId:String(rank),rank:String(rank<count?rank:-1)},figure:{style:{}},label:{style:{}},querySelector(s){return s==='.wheel-figure'?this.figure:this.label;}}));
 const props = new Map();
 const root = {isConnected:true,dataset:{focusPlayer:'0',phase:'Action',depth:'1.3',duration:'1800',glow:'.35',originalColors:'80'},style:{setProperty:(k,v)=>props.set(k,v)},classList:{add(){},remove(){},contains(){return false;}},querySelector:()=>({clientWidth:width,clientHeight:height,getBoundingClientRect(){}}),querySelectorAll:()=>slots};
 const context={WeakMap,Map,Number,Math,Array,Boolean,performance:{now:()=>0},matchMedia:()=>({matches:false}),document:{visibilityState:'visible'},getComputedStyle:()=>({getPropertyValue:()=>76}),ResizeObserver:class{observe(){}disconnect(){}},clearTimeout(){},setTimeout(){}};
 vm.runInNewContext(source+';globalThis.update=update;', context);context.update(root);
 const figures=slots.slice(0,count).map(s=>{
  const m=/translate3d\(([-\d.]+)px,([-\d.]+)px,([-\d.]+)px\) scale\(([-\d.]+)\)/.exec(s.figure.style.transform);
  const l=/translate\(([-\d.]+)px,([-\d.]+)px\)/.exec(s.label.style.transform);
  const h=100*Number(m[4]), bottom=Number(m[2])+100;
  return {h,top:bottom-h,bottom,labelX:Number(l[1]),labelY:Number(l[2]),labelWidth:parseFloat(s.label.style.width)};
 });
 assert.equal(slots[3].figure.style.opacity,0,'passed/unranked player stays hidden');
 assert.equal(props.get('--wheel-glow'),.35);assert(Math.abs(props.get('--wheel-tint')-.2)<1e-10);assert.equal(props.get('--wheel-duration'),'1800ms');
 return {figures,mode:root.dataset.wheelLayout};
}
// Tiny stages must fall back when full 16px label rows cannot fit.
// At the exact boundary vertical rows fit, with zero artwork and no overlap.
const labelSpaceCases=[[40,40,3], ...[1,2,3].flatMap(count=>[
 [count*16-1,count*16-1,count], [count*16,count*16,count]
])];
const labelSpaceFailures=[];
for(const [w,h,count] of labelSpaceCases) {
 try {
  const {figures,mode}=layout(w,h,count);
  if(mode==='vertical') {
   for(let i=0;i<figures.length;i++) {
    const f=figures[i];
    assert(f.h>=0&&f.top>=-1e-8,'nonnegative contained art');
    assert(f.labelX>=0&&f.labelX+f.labelWidth<=w,'labels fit width');
    assert(f.bottom<=f.labelY+1e-8,'art must precede its label');
    assert(f.labelY+16<=h+1e-8,`label ${i+1} ends at ${f.labelY+16}, beyond height ${h}`);
    if(i)assert(figures[i-1].labelY+16<=f.top+1e-8,'previous name cannot overlap next art');
   }
  } else {
   // The existing horizontal fallback promises finite, reduced art, not
   // nonoverlapping full-height labels in a stage shorter than one label.
   for(const [i,f] of figures.entries()) {
    assert(Object.values(f).every(Number.isFinite),'finite horizontal geometry');
    assert(f.h>=0&&f.h<=Math.max(0,h-20),'horizontal art shrinks to available height');
    assert(f.labelX>=0&&f.labelX+f.labelWidth<=w,'horizontal labels fit width');
    assert(Math.abs(f.labelY-(f.bottom+3))<1e-8,'horizontal labels follow their art');
    assert(Math.abs(f.h-Math.max(0,h-20)*[1,.68/1.3,.43/1.3][i])<1e-8,'existing horizontal art allocation');
   }
  }
  assert.equal(mode,h>=count*16?'vertical':'horizontal','vertical requires full label rows');
 } catch(error) { labelSpaceFailures.push(`${w}x${h}/${count}: ${error.message}`); }
}
assert.equal(labelSpaceFailures.length,0,'label-space regressions:\n'+labelSpaceFailures.join('\n'));
console.log(`PASS label-space boundaries: ${labelSpaceCases.length} cases`);
const tall=layout(180,250,3);
assert(tall.figures[0].h>90,`active art must exceed 90px, got ${tall.figures[0].h}`);
assert(tall.figures[1].h>55,`second art must exceed 55px, got ${tall.figures[1].h}`);
for(const [w,h] of [[180,250],[180,264],[120,180],[60,64],[180,181],[320,500]]) {
 for(const count of [1,2,3]) {
  const {figures,mode}=layout(w,h,count); assert.equal(mode,'vertical');
  for(let i=0;i<figures.length;i++) {
   const f=figures[i];assert(f.h>=0&&f.top>=-1e-8,'nonnegative contained art');
   assert(f.labelX>=0&&f.labelX+f.labelWidth<=w,'labels fit width');
   assert(f.bottom<=f.labelY+1e-8,'art must precede its label');
   assert(f.labelY+16<=h+1e-8,'labels fit height');
   if(i)assert(figures[i-1].labelY+16<=f.top+1e-8,'previous name cannot overlap next art');
  }
 }
}
assert(layout(180,250,1).figures[0].h>layout(180,250,2).figures[0].h,'one remaining player grows');
assert(layout(180,250,2).figures[0].h>tall.figures[0].h,'two remaining players grow');
for(const [w,h] of [[440,96],[915,50],[180,96],[440,0]]) {
 const r=layout(w,h,3);assert.equal(r.mode,'horizontal');
 assert(r.figures.every(f=>f.h>=0&&Number.isFinite(f.h)),'short/wide stage has finite nonnegative art');
}
console.log('PASS adaptive fill: '+JSON.stringify({tall:tall.figures.map(f=>f.h),fullscreen:layout(180,264,3).figures.map(f=>f.h),one:layout(180,250,1).figures.map(f=>f.h),two:layout(180,250,2).figures.map(f=>f.h)}));
