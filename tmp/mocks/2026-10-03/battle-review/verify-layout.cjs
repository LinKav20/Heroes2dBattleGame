// Checks the preview geometry without a browser or the future battle engine.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=__dirname;
const context=new Proxy({}, {get:()=>()=>{}});
const element={getContext:()=>context,addEventListener:()=>{},classList:{toggle:()=>{}},setAttribute:()=>{}};
const sandbox={document:{querySelector:()=>element,querySelectorAll:()=>[]},window:{},assert};
vm.createContext(sandbox);
const source=fs.readFileSync(path.join(root,'board.js'),'utf8')+'\n'+fs.readFileSync(path.join(root,'battle.js'),'utf8').replace(/init\(\);\s*$/,'')+'\nbounds='+fs.readFileSync(path.join(root,'atlas-bounds.json'),'utf8')+';draw=()=>{};';
vm.runInContext(source,sandbox);
vm.runInContext(`
const reports=[];let routeCases=0,blockedDestinations=0;
for(let arena=0;arena<3;arena++){
 state.arena=arena;state.destination=[7,4];const scenes=window.battlePreview.audit();
 for(const result of scenes){assert.equal(result.maxBoxOverlap,0);assert.equal(result.outOfBounds.length,0);if(result.scene===7)assert.equal(result.count,40);}
 for(let scene=0;scene<7;scene++){
  state.scene=scene;
  for(let frame=0;frame<=100;frame++)for(const u of unitsAt(frame/100)){
   assert.ok(BattleBoard.inside(u.c,u.r));assert.ok(!BattleBoard.obstacle(activeArena(),u.c,u.r),u.id+' on terrain');
   if(u.type==='d'){assert.ok(BattleBoard.inside(u.c+1,u.r));assert.ok(!BattleBoard.obstacle(activeArena(),u.c+1,u.r));}
  }
 }
 state.scene=1;let reachable=0;
 for(let r=0;r<BattleBoard.rows;r++)for(let c=0;c<BattleBoard.cols;c++){
  state.destination=[c,r];const route=movementRoute();routeCases++;
  if(BattleBoard.obstacle(arena,c,r)){assert.equal(route.length,0);blockedDestinations++;continue;}
  if(!route.length)continue;reachable++;
  for(let i=0;i<route.length;i++){
   const [x,y]=route[i];assert.ok(!BattleBoard.obstacle(arena,x,y));
   if(i)assert.ok(BattleBoard.neighbors(...route[i-1]).some(([a,b])=>a===x&&b===y));
  }
  const others=baseUnits().slice(1),mover=baseUnits()[0];
  for(let i=1;i<route.length;i++)for(let f=0;f<=20;f++){
   const a=cell(...route[i-1]),b=cell(...route[i]),box=spriteBox({...mover,x:lerp(a.x,b.x,f/20),y:lerp(a.y,b.y,f/20)});
   for(const other of others)assert.equal(overlap(box,spriteBox(other)),0);
  }
 }
 reports.push({arena,scenes,blockedCells:BattleBoard.blocked(arena).size,reachableDestinations:reachable});
}
window.result={grid:'13x9',normalScale:1.4,denseHeight:112,sceneSamples:2121,routeCases,blockedDestinations,reports};
`,sandbox);
fs.writeFileSync(path.join(root,'layout-audit-v3.json'),JSON.stringify(sandbox.window.result,null,2)+'\n');
console.log(JSON.stringify({status:'PASS',...Object.fromEntries(Object.entries(sandbox.window.result).filter(([key])=>key!=='reports'))}));
