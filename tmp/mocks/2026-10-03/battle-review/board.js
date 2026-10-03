/* Geometry and navigation for the standalone visual preview. */
'use strict';
const BattleBoard=(()=>{
 const cols=13,rows=9,dx=110,dy=65,origin={x:140,y:345};
 const center=(c,r)=>({x:origin.x+c*dx+(r%2)*dx/2,y:origin.y+r*dy});
 const key=(c,r)=>`${c},${r}`;
 const inside=(c,r)=>Number.isInteger(c)&&Number.isInteger(r)&&c>=0&&c<cols&&r>=0&&r<rows;
 // Footprints intentionally cover the full rock/root mass, including its skirt.
 const terrain=[
  [
   {name:'Скалы',cells:[[3,1],[4,1],[3,2],[4,2]]},
   {name:'Скалы',cells:[[8,6],[9,6],[10,6],[8,7],[9,7],[10,7]]},
   {name:'Ели и валуны',cells:[[0,7],[0,8],[1,8]]}
  ],
  [
   {name:'Упавшая колонна и корни',cells:[[2,3],[3,3],[4,3],[2,4],[3,4],[4,4]]},
   {name:'Корни дерева',cells:[[8,1],[9,1],[8,2],[9,2]]},
   {name:'Корни дерева',cells:[[10,5],[11,5],[10,6],[11,6]]},
   {name:'Древнее дерево',cells:[[11,0],[12,0],[11,1],[12,1]]},
   {name:'Камни у края',cells:[[0,8],[1,8]]}
  ],
  [
   {name:'Обломки стены',cells:[[0,2],[1,2],[0,3],[1,3]]},
   {name:'Упавшая колонна',cells:[[10,3],[11,3],[12,3],[10,4],[11,4],[12,4]]},
   {name:'Разрушенная арка',cells:[[0,7],[1,7],[0,8],[1,8]]}
  ]
 ];
 function obstacle(arena,c,r){return terrain[arena].find(t=>t.cells.some(([x,y])=>x===c&&y===r));}
 function blocked(arena){return new Set(terrain[arena].flatMap(t=>t.cells.map(([c,r])=>key(c,r))));}
 function neighbors(c,r){const shift=r%2?1:-1;return[[c-1,r],[c+1,r],[c,r-1],[c+shift,r-1],[c,r+1],[c+shift,r+1]].filter(([x,y])=>inside(x,y));}
 function route(start,end,forbidden,canStep=()=>true){
  if(!inside(...start)||!inside(...end)||forbidden.has(key(...end)))return[];
  const queue=[start],parent=new Map([[key(...start),null]]);
  for(let i=0;i<queue.length;i++){
   const at=queue[i];if(at[0]===end[0]&&at[1]===end[1]){const path=[];let k=key(...at);while(k!==null){path.push(k.split(',').map(Number));k=parent.get(k);}return path.reverse();}
   for(const next of neighbors(...at)){const k=key(...next);if(parent.has(k)||forbidden.has(k)||!canStep(at,next))continue;parent.set(k,key(...at));queue.push(next);}
  }return[];
 }
 function pick(x,y){let nearest=null,distance=Infinity;for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){const p=center(c,r),d=((x-p.x)/(dx/2))**2+((y-p.y)/(dy*2/3))**2;if(d<distance){distance=d;nearest=[c,r];}}return distance<=1.4?nearest:null;}
 function segmentHitsRect(a,b,rect){
  let enter=0,leave=1;
  for(const axis of ['x','y']){
   const delta=b[axis]-a[axis],min=rect[axis],max=min+rect[axis==='x'?'w':'h'];
   if(Math.abs(delta)<1e-9){if(a[axis]<min||a[axis]>max)return false;continue;}
   const t1=(min-a[axis])/delta,t2=(max-a[axis])/delta;
   enter=Math.max(enter,Math.min(t1,t2));leave=Math.min(leave,Math.max(t1,t2));
   if(enter>leave)return false;
  }return true;
 }
 return{cols,rows,dx,dy,center,key,inside,terrain,obstacle,blocked,neighbors,route,pick,segmentHitsRect};
})();
