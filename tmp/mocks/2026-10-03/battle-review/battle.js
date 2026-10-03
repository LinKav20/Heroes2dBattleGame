/* Standalone art-direction preview. No dependency on the battle engine. */
'use strict';
const canvas=document.querySelector('#battle'),ctx=canvas.getContext('2d');
const W=1672,H=1040,TAU=Math.PI*2;
const NORMAL_SCALE=1.4,DENSE_HEIGHT=112;
const scenes=[
 {title:'Расстановка',short:'01 · Начало',copy:'Пять героев слева, противники справа. Между силуэтами есть воздух; цветные опоры показывают сторону, а порядок хода вынесен над полем.',duration:4.8},
 {title:'Перемещение',short:'02 · Движение',copy:'Выберите свободный гекс: маршрут Бубсильды обойдёт камни, корни и занятые клетки. Нажмите «Проиграть». На клетку препятствия встать нельзя.',duration:4.8},
 {title:'Удар и ответ',short:'03 · Ближний бой',copy:'Ледяной полумесяц Бубсильды разбивается на кристаллы при контакте. В ответ — багровый разрез и искры воительницы. Крупные числа урона появляются после каждого попадания.',duration:4.8},
 {title:'Выстрел Ламберта',short:'04 · Выстрел',copy:'Золотистая вспышка на тетиве, прицел на противнике, стремительная стрела с длинным шлейфом. Попадание отмечено яркой россыпью искр и числом урона.',duration:4.8},
 {title:'Поддержка Линды',short:'05 · Магия',copy:'Магия питахайи: розовая лента с лепестками летит от Линды к Бубсильде. Зелёная печать и две восходящие спирали отмечают исцеление; силуэт героя остаётся читаемым.',duration:4.8},
 {title:'Нетак: смена фазы',short:'06 · Босс',copy:'Две клетки охватывает рунический круг: трещины света, языки теневого пламени и вихрь фиолетовых искр. Появление дракона сопровождает расширяющаяся ударная волна.',duration:5.8},
 {title:'Плотный бой: 40 юнитов',short:'07 · Плотность',copy:'Контрольный строй для верхнего лимита из документации. Фигуры высотой 112 px — на 40% крупнее предыдущей версии; подписи скрыты до выбора. Нажмите на юнита, чтобы проверить выделение в плотной группе.',duration:4.8}
];
const types={
 b:{atlas:'heroes-atlas',index:0,name:'Бубсильда',height:116,color:'#8fd9ef'},
 l:{atlas:'heroes-atlas',index:1,name:'Линда',height:132,color:'#dfc7e3'},
 a:{atlas:'heroes-atlas',index:2,name:'Ламберт',height:112,color:'#b7c6a3'},
 f:{atlas:'heroes-atlas',index:3,name:'Головач Лена',height:118,color:'#f4a16b'},
 t:{atlas:'heroes-atlas',index:4,name:'Торин',height:96,color:'#c2ae83'},
 s:{atlas:'enemies-atlas',index:0,name:'Патрульная',height:104,color:'#e68a85'},
 w:{atlas:'enemies-atlas',index:1,name:'Воительница',height:129,color:'#e68a85'},
 g:{atlas:'enemies-atlas',index:2,name:'Страж-куст',height:112,color:'#a1b676'},
 i:{atlas:'enemies-atlas',index:3,name:'Ледяной страж',height:132,color:'#acd6ed'},
 q:{atlas:'boss-atlas',index:0,name:'Строганесса',height:133,color:'#f08a88'},
 n:{atlas:'boss-atlas',index:1,name:'Нетак',height:125,color:'#c49ce5'},
 d:{atlas:'boss-atlas',index:2,name:'Нетак · дракон',height:145,color:'#c49ce5'}
};
const assets={},state={scene:0,arena:1,p:0,playing:false,grid:true,bounds:false,selected:'b',speed:1,destination:[7,4],blockedSelection:null};
let bounds={},lastFrame=0,hitBoxes=[],qa={};
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const lerp=(a,b,t)=>a+(b-a)*t;
const ease=t=>t*t*(3-2*t);
const phase=(p,a,b)=>clamp((p-a)/(b-a));
const cell=BattleBoard.center;
const activeArena=()=>state.scene===5?2:state.arena;
function unit(id,type,c,r,side='ally',count=1){return{id,type,c,r,side,count,hp:1,...cell(c,r)};}
function party(){return[unit('b','b',1,5),unit('l','l',1,1),unit('a','a',3,0),unit('f','f',3,8),unit('t','t',0,5)];}
function baseUnits(){
 const allies=party();
 if(state.scene===5)return[...allies,unit('s1','s',10,0,'enemy',6),unit('w1','w',11,7,'enemy',4),unit('n','n',8,5,'enemy')];
 return[...allies,unit('s1','s',7,0,'enemy',8),unit('s2','s',10,2,'enemy',6),unit('w1','w',8,4,'enemy',4),unit('g1','g',6,8,'enemy',2),unit('q','q',11,8,'enemy')];
}
function overlap(a,b){return Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));}
function movementRoute(){
 const units=baseUnits(),mover=units[0],others=units.slice(1),forbidden=BattleBoard.blocked(activeArena());
 for(const u of others)forbidden.add(BattleBoard.key(u.c,u.r));
 const clear=(from,to)=>{
  const a=cell(...from),b=cell(...to),box=spriteBox(mover),padding=3;
  return !others.some(u=>{const obstacle=spriteBox(u);return BattleBoard.segmentHitsRect(a,b,{
   x:obstacle.x-box.w/2-padding,y:obstacle.y-7-padding,
   w:obstacle.w+box.w+padding*2,h:obstacle.h+box.h+padding*2
  });});
 };
 return BattleBoard.route([mover.c,mover.r],state.destination,forbidden,clear);
}
function denseUnits(){
 const units=[],candidates=[];
 for(const r of [0,2,4,6,8,1,3,5,7])for(let c=0;c<BattleBoard.cols;c++)candidates.push([c,r]);
 for(const [c,r] of candidates){
  if(BattleBoard.obstacle(activeArena(),c,r))continue;
  const ally=c<6,keys=ally?['b','l','a','f','t','i']:['s','w','g'];
  const u=unit('dense-'+units.length,keys[(r+c)%keys.length],c,r,ally?'ally':'enemy',8+units.length*3),box=spriteBox(u);
  if(units.some(other=>overlap(box,spriteBox(other))>0))continue;
  units.push(u);if(units.length===40)break;
 }
 return units;
}
function unitsAt(p){
 if(state.scene===6)return denseUnits();
 const units=baseUnits(),b=units[0];
 if(state.scene===5){const n=units.find(u=>u.id==='n');n.type=p<.5?'n':'d';n.alpha=p<.5?1-ease(phase(p,.26,.46)):ease(phase(p,.53,.76));if(n.type==='d'){n.x+=BattleBoard.dx/2;n.height=lerp(147,203,ease(phase(p,.53,.85)));}return units;}
 if(state.scene===1){const route=movementRoute();if(route.length>1){const t=ease(phase(p,.18,.82))*(route.length-1),i=Math.min(Math.floor(t),route.length-2),a=cell(...route[i]),next=cell(...route[i+1]);Object.assign(b,{x:lerp(a.x,next.x,t-i),y:lerp(a.y,next.y,t-i)});const at=route[Math.round(t)];b.c=at[0];b.r=at[1];}}
 if(state.scene===2){Object.assign(b,cell(7,4),{c:7,r:4});const w=units.find(u=>u.id==='w1');b.x+=Math.sin(phase(p,.2,.43)*Math.PI)*12;w.x-=Math.sin(phase(p,.55,.77)*Math.PI)*10;w.hp=p>.34?.68:1;b.hp=p>.68?.84:1;}
 if(state.scene===3)units.find(u=>u.id==='s2').hp=p>.64?.56:1;
 if(state.scene===4)b.hp=lerp(.55,1,ease(phase(p,.52,.75)));
 return units;
}
function text(s,x,y,size=16,color='#e6e6d8',align='left',font='system-ui'){ctx.fillStyle=color;ctx.font=`${size}px ${font}`;ctx.textAlign=align;ctx.fillText(s,x,y);}
function round(x,y,w,h,r=6,fill='#202a2c',stroke){ctx.beginPath();ctx.roundRect(x,y,w,h,r);if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke();}}
function hex(c,r,fill,stroke,width=1){const p=cell(c,r);ctx.beginPath();for(let i=0;i<6;i++){const a=(i*60-90)*Math.PI/180,x=p.x+(BattleBoard.dx/Math.sqrt(3))*Math.cos(a),y=p.y+(BattleBoard.dy*2/3)*Math.sin(a);if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);}ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke();}}
function ring(x,y,rx,color,width=2){ctx.beginPath();ctx.ellipse(x,y,rx,rx*.34,0,0,TAU);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();}
function spriteBox(u){const t=types[u.type],b=bounds[t.atlas][t.index],height=state.scene===6?DENSE_HEIGHT:(u.height||t.height*NORMAL_SCALE);return{x:u.x-b[2]/b[3]*height/2,y:u.y+7-height,w:b[2]/b[3]*height,h:height};}
function sprite(u){
 const t=types[u.type],b=bounds[t.atlas][t.index],box=spriteBox(u),selected=u.id===state.selected;
 ctx.save();ctx.globalAlpha=u.alpha??1;
 ctx.fillStyle='rgba(15,22,22,.32)';ctx.beginPath();ctx.ellipse(u.x,u.y+6,u.type==='d'?90:36,10,0,0,TAU);ctx.fill();
 ring(u.x,u.y+7,u.type==='d'?101:42,u.side==='ally'?'#79cddd':'#e79688',selected?3:1.5);
 if(selected){hex(u.c,u.r,'rgba(234,209,123,.2)','#f3d896',2.5);if(u.type==='d')hex(u.c+1,u.r,'rgba(234,209,123,.2)','#f3d896',2.5);}
 ctx.drawImage(assets[t.atlas],...b,box.x,box.y,box.w,box.h);
 if(state.scene!==6||selected){const x=u.x-26,y=u.y+21;round(x,y,52,6,2,'#273330');round(x,y,52*u.hp,6,2,u.side==='ally'?'#83c6a0':'#da8f80');if(u.count>1){round(u.x+31,u.y+12,30,20,4,'#162228');text(String(u.count),u.x+46,u.y+27,13,'#ede7d7','center');}}
 if(state.bounds){ctx.strokeStyle='#e7b6fd';ctx.lineWidth=1;ctx.strokeRect(box.x,box.y,box.w,box.h);}
 ctx.restore();hitBoxes.push({...box,id:u.id,name:t.name,type:u.type,unit:u});
}
function terrainOverlay(){
 const arena=activeArena();
 if(state.grid){
  // A dark under-stroke keeps the light grid legible on snow and bright grass.
  for(let r=0;r<BattleBoard.rows;r++)for(let c=0;c<BattleBoard.cols;c++)hex(c,r,null,'rgba(18,32,34,.65)',3.8);
  for(let r=0;r<BattleBoard.rows;r++)for(let c=0;c<BattleBoard.cols;c++)hex(c,r,null,'rgba(250,232,177,.76)',1.65);
 }
 for(const object of BattleBoard.terrain[arena])for(const [c,r] of object.cells){
  hex(c,r,'rgba(61,35,28,.27)','rgba(226,161,115,.83)',2);
  const p=cell(c,r);ctx.strokeStyle='rgba(247,196,152,.87)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(p.x-5,p.y+17);ctx.lineTo(p.x+5,p.y+27);ctx.moveTo(p.x+5,p.y+17);ctx.lineTo(p.x-5,p.y+27);ctx.stroke();
 }
 if(state.blockedSelection)hex(...state.blockedSelection,'rgba(199,77,60,.33)','#ffc39e',3.5);
}
function path(){
 if(state.scene!==1)return;const route=movementRoute();if(route.length<2)return;
 route.slice(1).forEach(([c,r])=>hex(c,r,'rgba(85,185,177,.27)','#d9ffce',2.4));
 ctx.setLineDash([7,6]);ctx.beginPath();route.forEach(([c,r],i)=>{const p=cell(c,r);if(i)ctx.lineTo(p.x,p.y);else ctx.moveTo(p.x,p.y);});ctx.strokeStyle='#e6f4b5';ctx.lineWidth=3;ctx.stroke();ctx.setLineDash([]);
 route.slice(1).forEach(([c,r],i)=>{const p=cell(c,r);text(String(i+1),p.x,p.y+5,16,'#fff4ce','center');});
}
function popup(label,u,p,start,end,color='#ffe4a7'){const t=phase(p,start,end);if(p<start||p>end)return;ctx.save();ctx.globalAlpha=Math.min(1,t*10)*Math.min(1,(1-t)*4);const box=spriteBox(u);ctx.shadowColor='#101822';ctx.shadowBlur=5;ctx.strokeStyle='#15202b';ctx.lineWidth=5;ctx.font='bold 32px system-ui';ctx.textAlign='center';ctx.strokeText(label,u.x,box.y-12-t*24);ctx.fillStyle=color;ctx.fillText(label,u.x,box.y-12-t*24);ctx.restore();}
function effects(units,p){
 BattleEffects.render(ctx,{scene:state.scene,p,units,cell,layer:'front'});
 const find=id=>units.find(u=>u.id===id);
 if(state.scene===2){popup('−12',find('w1'),p,.34,.6,'#bcf2ff');popup('−6',find('b'),p,.68,.96,'#ffb3b8');}
 if(state.scene===3)popup('−18',find('s2'),p,.64,.98,'#ffe0a0');
 if(state.scene===4)popup('+14',find('b'),p,.6,.98,'#d9ffb1');
}
function activeId(){return state.scene===3?'a':state.scene===4?'l':state.scene===5?'n':'b';}
function hud(units,p){
 round(0,0,W,78,0,'#172427');ctx.fillStyle='#6e7460';ctx.fillRect(0,77,W,1);
 text('ХРОНИКИ ВОСЬМИ ЗЕМЕЛЬ',26,28,14,'#c8bb95');text(state.scene===5?'Нетак · последняя битва':['Северный перевал','Роща питахайи','Ночной двор'][state.arena],26,54,19,'#eee4ce');
 text('ПОРЯДОК ХОДА',430,22,11,'#9caea9');
 const order=units.slice(0,8);order.forEach((u,i)=>{const x=428+i*116,active=u.id===activeId();round(x,31,108,33,4,active?'#48544a':'#29373a',active?'#d6be83':'#425052');text(types[u.type].name.split(' ')[0],x+54,53,12,active?'#f5e3b5':'#cbd4cc','center');});
 text('РАУНД 03',W-26,29,13,'#d6c79e','right');text(state.scene===6?units.length+' юнитов':'13 × 9',W-26,53,14,'#9fb1ac','right');
 round(0,946,W,94,0,'#172427');ctx.fillStyle='#66715c';ctx.fillRect(0,946,W,1);
 const u=units.find(u=>u.id===state.selected)||units.find(u=>u.id===activeId())||units[0];
 text(types[u.type].name,28,979,22,'#eadfbe','left','Georgia');text(u.side==='ally'?'Союзник · готов к действию':'Противник · цель',28,1007,13,'#9cafa8');
 const actions=['Перемещение','Атака','Заклинание','Защита','Ожидание'];actions.forEach((s,i)=>{const x=465+i*155,highlight=(state.scene===1&&i===0)||([2,3].includes(state.scene)&&i===1)||(state.scene===4&&i===2);round(x,969,145,45,5,highlight?'#4a5140':'#273638',highlight?'#d0bc81':'#46534f');text(s,x+72,997,14,highlight?'#f0deb5':'#b5c4bc','center');});
 text(state.scene===5?(p<.5?'ФАЗА I':'ФАЗА II'):Math.round(p*100)+'%',W-30,994,18,'#d2c095','right');
}
function assess(boxes){let worst=0,pairs=[];for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const a=boxes[i],b=boxes[j];if((a.unit.alpha??1)<.1||(b.unit.alpha??1)<.1)continue;const area=Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));const ratio=area/Math.min(a.w*a.h,b.w*b.h);if(ratio>0){pairs.push({a:a.id,b:b.id,ratio});worst=Math.max(worst,ratio);}}return{unitCount:boxes.length,maxSilhouetteBoxOverlap:worst,pairs};}
function draw(){
 const p=state.p,units=unitsAt(p);ctx.clearRect(0,0,W,H);const arena=state.scene===5?2:state.arena;ctx.drawImage(assets['arena'+arena],0,78,1672,941);
 ctx.fillStyle='rgba(15,30,29,.055)';ctx.fillRect(0,290,W,656);
 terrainOverlay();
 if(state.scene===5){hex(8,5,'rgba(159,116,206,.1)','#b29acb',1.5);hex(9,5,'rgba(159,116,206,.1)','#b29acb',1.5);}
 path();BattleEffects.render(ctx,{scene:state.scene,p,units,cell,layer:'back'});hitBoxes=[];units.sort((a,b)=>a.y-b.y).forEach(sprite);effects(units,p);hud(units,p);
 qa=assess(hitBoxes);document.querySelector('#qa-result').textContent=`${units.length} фигур · максимальное перекрытие ${Math.round(qa.maxSilhouetteBoxOverlap*100)}%`;
 document.querySelector('#time').textContent=(p*scenes[state.scene].duration).toFixed(1)+' / '+scenes[state.scene].duration.toFixed(1)+' с';
 document.querySelector('#scrub').value=Math.round(p*1000);
}
function selectScene(index){state.scene=index;state.p=0;state.playing=false;state.blockedSelection=null;state.destination=[7,4];state.selected=index===6?'dense-0':activeId();document.querySelector('#play').textContent='▶ Проиграть';document.querySelectorAll('#chapters button').forEach((b,i)=>b.classList.toggle('active',i===index));document.querySelector('#scene-title').textContent=scenes[index].title;document.querySelector('#scene-copy').textContent=scenes[index].copy;document.querySelector('#step').textContent='СЦЕНА '+String(index+1).padStart(2,'0')+' / 07';draw();}
function frame(now){const dt=Math.min((now-lastFrame)/1000,.1);lastFrame=now;if(state.playing){state.p=clamp(state.p+dt*state.speed/scenes[state.scene].duration);if(state.p===1){state.playing=false;document.querySelector('#play').textContent='↻ Повторить';}draw();}requestAnimationFrame(frame);}
async function init(){
 try{bounds=await(await fetch('atlas-bounds.json')).json();const files={'heroes-atlas':'heroes-atlas.png','enemies-atlas':'enemies-atlas.png','boss-atlas':'boss-atlas.png',arena0:'../01-battlefield-northern-pass.png',arena1:'../02-battlefield-pitahaya-grove.png',arena2:'../03-battlefield-netak-court.png'};await Promise.all(Object.entries(files).map(([name,url])=>new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>{assets[name]=im;resolve();};im.onerror=reject;im.src=url;})));
 scenes.forEach((s,i)=>{const b=document.createElement('button');b.textContent=s.short;b.addEventListener('click',()=>selectScene(i));document.querySelector('#chapters').append(b);});
 document.querySelector('#loading').remove();selectScene(0);requestAnimationFrame(frame);
 }catch(error){document.querySelector('#loading').textContent='Не удалось загрузить изображения. Откройте галерею через локальный HTTP-сервер.';console.error(error);}
}
document.querySelectorAll('[data-arena]').forEach(button=>button.addEventListener('click',()=>{state.arena=Number(button.dataset.arena);document.querySelectorAll('[data-arena]').forEach(b=>b.classList.toggle('active',b===button));selectScene(state.scene===5?0:state.scene);}));
for(const name of ['grid','bounds'])document.querySelector('#'+name).addEventListener('click',e=>{state[name]=!state[name];e.currentTarget.setAttribute('aria-pressed',String(state[name]));draw();});
document.querySelector('#play').addEventListener('click',()=>{if(state.p===1)state.p=0;state.playing=!state.playing;document.querySelector('#play').textContent=state.playing?'Ⅱ Пауза':'▶ Проиграть';});
document.querySelector('#scrub').addEventListener('input',e=>{state.playing=false;state.p=Number(e.target.value)/1000;document.querySelector('#play').textContent='▶ Проиграть';draw();});
document.querySelector('#speed').addEventListener('change',e=>{state.speed=Number(e.target.value);});
canvas.addEventListener('click',event=>{
 const rect=canvas.getBoundingClientRect(),x=(event.clientX-rect.left)*W/rect.width,y=(event.clientY-rect.top)*H/rect.height;
 const at=BattleBoard.pick(x,y);if(!at)return;
 const obstruction=BattleBoard.obstacle(activeArena(),...at);
 if(obstruction){state.blockedSelection=at;document.querySelector('#selection').textContent=obstruction.name+' · непроходимый гекс. Маршрут сюда недоступен.';draw();return;}
 const h=[...hitBoxes].reverse().find(b=>x>=b.x&&x<=b.x+b.w&&y>=b.y&&y<=b.y+b.h);
 if(h){state.selected=h.id;state.blockedSelection=null;document.querySelector('#selection').textContent=h.name+' · '+(h.unit.c+1)+':'+(h.unit.r+1)+' · '+(h.unit.count>1?h.unit.count+' в отряде':'одиночный герой');draw();return;}
 if(state.scene===1){const old=state.destination;state.destination=at;const route=movementRoute();if(route.length<2){state.destination=old;document.querySelector('#selection').textContent='Нет свободного маршрута: препятствие, занятая клетка или слишком тесный проход.';}else{state.p=0;state.playing=false;state.blockedSelection=null;document.querySelector('#play').textContent='▶ Проиграть';document.querySelector('#selection').textContent='Маршрут: '+(route.length-1)+' гексов. Камни, корни и фигуры обходятся.';}draw();}
});
document.querySelector('#export').addEventListener('click',()=>{const a=document.createElement('a');a.download=`battle-scene-${state.scene+1}-${Math.round(state.p*100)}.png`;a.href=canvas.toDataURL('image/png');a.click();});
window.battlePreview={setScene:selectScene,setProgress(p){state.p=clamp(p);draw();},getState:()=>({...state,qa}),audit(){const previous={...state};const result=[];for(let scene=0;scene<scenes.length;scene++){state.scene=scene;let max=0,count=0,violations=[];for(let f=0;f<=100;f++){state.p=f/100;const units=unitsAt(state.p);const boxes=units.map(u=>({...spriteBox(u),id:u.id,unit:u}));const check=assess(boxes);max=Math.max(max,check.maxSilhouetteBoxOverlap);count=units.length;for(const b of boxes)if(b.x<0||b.y<78||b.x+b.w>W||b.y+b.h>946)violations.push(b.id);}result.push({scene:scene+1,title:scenes[scene].title,count,maxBoxOverlap:max,outOfBounds:[...new Set(violations)]});}Object.assign(state,previous);draw();return result;}};
init();
