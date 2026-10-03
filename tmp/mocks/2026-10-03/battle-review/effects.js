/* Deterministic, layered VFX: scrubbing and replay produce the same frame. */
'use strict';
const BattleEffects=(()=>{
 const TAU=Math.PI*2,clamp=x=>Math.max(0,Math.min(1,x));
 const progress=(p,a,b)=>clamp((p-a)/(b-a));
 const envelope=(p,a,b)=>p<=a||p>=b?0:Math.pow(Math.sin(progress(p,a,b)*Math.PI),.65);
 const rand=n=>{const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x);};
 function render(ctx,{scene,p,units,cell,layer}){
  if(scene<2||scene>5)return;
  const get=id=>units.find(u=>u.id===id),back=layer==='back';
  ctx.save();ctx.beginPath();ctx.rect(0,78,1672,868);ctx.clip();
  function glow(x,y,r,color,alpha=1){
   if(alpha<=0)return;ctx.save();ctx.globalAlpha=alpha;
   const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,color);g.addColorStop(1,'transparent');
   ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);ctx.restore();
  }
  function stroke(points,color,width,blur=0){
   ctx.save();ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='round';ctx.lineJoin='round';ctx.shadowColor=color;ctx.shadowBlur=blur;
   ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();ctx.restore();
  }
  function ellipse(x,y,r,color,width=3,flat=.34){
   ctx.save();ctx.strokeStyle=color;ctx.lineWidth=width;ctx.shadowColor=color;ctx.shadowBlur=12;ctx.beginPath();ctx.ellipse(x,y,r,r*flat,0,0,TAU);ctx.stroke();ctx.restore();
  }
  function star(x,y,r,color){
   ctx.save();ctx.translate(x,y);ctx.fillStyle=color;ctx.beginPath();
   for(let i=0;i<8;i++){const a=i*Math.PI/4,rr=i%2?r*.2:r;ctx.lineTo(Math.cos(a)*rr,Math.sin(a)*rr);}ctx.closePath();ctx.fill();ctx.restore();
  }
  function burst(x,y,t,{color,core='#fff9e0',radius=110,count=28,kind='spark',seed=1}){
   if(t<=0||t>=1)return;ctx.save();ctx.globalAlpha=Math.pow(1-t,.75);
   glow(x,y,80*(1-t)+20,color,.65);star(x,y,42*Math.pow(1-t,2)+4,core);
   for(let i=0;i<count;i++){
    const a=rand(i+seed)*TAU,s=.35+rand(i+77+seed)*.65,d=radius*s*(1-Math.pow(1-t,2));
    const px=x+Math.cos(a)*d,py=y+Math.sin(a)*d*.8+t*t*20;
    if(kind==='shard'){
     ctx.save();ctx.translate(px,py);ctx.rotate(a+t);ctx.fillStyle=i%3?color:core;ctx.beginPath();ctx.moveTo(-3,-11*s);ctx.lineTo(4,0);ctx.lineTo(1,13*s);ctx.lineTo(-4,2);ctx.closePath();ctx.fill();ctx.restore();
    }else if(kind==='petal'){
     ctx.save();ctx.translate(px,py);ctx.rotate(a+t*3);ctx.fillStyle=i%3?color:core;ctx.beginPath();ctx.ellipse(0,0,4+3*s,2+2*s,0,0,TAU);ctx.fill();ctx.restore();
    }else stroke([[px,py],[px-Math.cos(a)*14*s*(1-t),py-Math.sin(a)*14*s*(1-t)]],i%3?color:core,2.5);
   }ctx.restore();
  }
  function crescent(x,y,t,color,reverse=false){
   if(t<=0||t>=1)return;ctx.save();ctx.translate(x,y);if(reverse)ctx.scale(-1,1);ctx.rotate(-.65+t*.6);
   ctx.globalAlpha=Math.sin(Math.PI*t);ctx.shadowColor=color;ctx.shadowBlur=22;
   const blade=ctx.createLinearGradient(-50,0,83,0);blade.addColorStop(0,'transparent');blade.addColorStop(.72,color);blade.addColorStop(1,'#ecffff');ctx.fillStyle=blade;
   ctx.beginPath();ctx.moveTo(-50,-100);ctx.bezierCurveTo(112,-63,116,49,-51,99);ctx.bezierCurveTo(51,40,57,-36,-50,-100);ctx.fill();
   ctx.shadowBlur=4;ctx.strokeStyle='#f5ffff';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-49,-100);ctx.bezierCurveTo(112,-63,116,49,-51,99);ctx.stroke();ctx.restore();
  }
  function sigil(x,y,r,color,t){
   ctx.save();ctx.translate(x,y);ctx.scale(1,.34);ctx.rotate(t);
   ctx.strokeStyle=color;ctx.lineWidth=3;ctx.shadowColor=color;ctx.shadowBlur=16;
   for(const k of [1,.79]){ctx.beginPath();ctx.arc(0,0,r*k,0,TAU);ctx.stroke();}
   for(let i=0;i<12;i++){const a=i*TAU/12;ctx.save();ctx.rotate(a);ctx.beginPath();ctx.moveTo(r*.84,-5);ctx.lineTo(r*.93,0);ctx.lineTo(r*.84,5);ctx.stroke();ctx.restore();}
   ctx.beginPath();for(let i=0;i<=6;i++){const a=i*TAU/6;ctx.lineTo(Math.cos(a)*r*.7,Math.sin(a)*r*.7);}ctx.stroke();ctx.restore();
  }
  function ribbon(from,to,t,color){
   const point=k=>[from.x+(to.x-from.x)*k,from.y+(to.y-from.y)*k-Math.sin(k*Math.PI)*85];
   const points=[];for(let k=Math.max(0,t-.28);k<=t;k+=.008)points.push(point(k));points.push(point(t));
   stroke(points,color,15,22);stroke(points,'#fff5c5',4,8);
   const [x,y]=point(t);glow(x,y,45,color,.85);star(x,y,17,'#ffffe8');
   for(let i=0;i<28;i++){const k=Math.max(0,t-rand(i)*.25),[xx,yy]=point(k),a=i*2.4+t*8;ctx.save();ctx.fillStyle=i%2?'#f697d4':'#ceff91';ctx.translate(xx+Math.cos(a)*18,yy+Math.sin(a)*18);ctx.rotate(a);ctx.beginPath();ctx.ellipse(0,0,5,2.5,0,0,TAU);ctx.fill();ctx.restore();}
  }
  if(scene===2){
   const b=get('b'),w=get('w1'),ice=envelope(p,.12,.55),red=envelope(p,.52,.89);
   if(back){glow(b.x,b.y-70,105,'#44bce8',ice*.65);glow(w.x,w.y-65,112,'#ec3d47',red*.5);}
   else{
    crescent(w.x-40,w.y-82,progress(p,.24,.47),'#68deff');
    burst(w.x-22,w.y-83,progress(p,.34,.59),{color:'#8ee8ff',core:'#efffff',radius:115,count:34,kind:'shard'});
    crescent(b.x+35,b.y-76,progress(p,.59,.79),'#e94f5e',true);
    burst(b.x+21,b.y-73,progress(p,.68,.92),{color:'#f05b61',radius:86,count:24,seed:21});
    if(ice){ctx.globalAlpha=ice*.8;ellipse(w.x,w.y+8,42+progress(p,.34,.57)*26,'#82dfff',2);}
   }
  }
  if(scene===3){
   const a=get('a'),target=get('s2'),start={x:a.x+35,y:a.y-88},end={x:target.x-10,y:target.y-78};
   const charge=envelope(p,.06,.33),t=progress(p,.28,.64);
   if(back){glow(start.x,start.y,75,'#f5bd57',charge*.65);glow(end.x,end.y,115,'#ffc365',envelope(p,.64,.89)*.6);}
   else{
    if(charge){ctx.globalAlpha=charge;ellipse(end.x,end.y,25,'#f4cb81',2,1);stroke([[end.x-35,end.y],[end.x-19,end.y]],'#ffe5a8',2);stroke([[end.x+19,end.y],[end.x+35,end.y]],'#ffe5a8',2);star(start.x,start.y,17,'#fff0b8');ctx.globalAlpha=1;}
    if(p>.28&&p<.64){
     const x=start.x+(end.x-start.x)*t,y=start.y+(end.y-start.y)*t,angle=Math.atan2(end.y-start.y,end.x-start.x);
     stroke([[x-Math.cos(angle)*125,y-Math.sin(angle)*125],[x,y]],'#c0873e',9,18);
     stroke([[x-Math.cos(angle)*105,y-Math.sin(angle)*105],[x,y]],'#ffe6a1',3,8);
     ctx.save();ctx.translate(x,y);ctx.rotate(angle);stroke([[-32,0],[17,0]],'#fffae9',4);ctx.fillStyle='#fff8d4';ctx.beginPath();ctx.moveTo(25,0);ctx.lineTo(11,-7);ctx.lineTo(13,7);ctx.closePath();ctx.fill();stroke([[-25,-7],[-18,0],[-25,7]],'#edca88',3);ctx.restore();
    }
    const hit=progress(p,.64,.94);
    burst(end.x,end.y,hit,{color:'#ffc878',radius:128,count:36,seed:43});
    if(hit>0&&hit<1){ctx.globalAlpha=(1-hit)*.8;ellipse(end.x,end.y,14+hit*78,'#ffe1a2',3,1);ctx.globalAlpha=1;}
   }
  }
  if(scene===4){
   const l=get('l'),b=get('b'),charge=envelope(p,.06,.55),heal=envelope(p,.5,.98);
   if(back){
    glow(l.x,l.y-90,110,'#e852b7',charge*.5);ctx.globalAlpha=charge;sigil(l.x,l.y+8,61,'#efa0d9',p*2);ctx.globalAlpha=heal;
    sigil(b.x,b.y+9,72,'#beed81',-p*2);glow(b.x,b.y-60,135,'#a9e973',.6);ctx.globalAlpha=1;
   }else{
    if(p>.2&&p<.62)ribbon({x:l.x+25,y:l.y-113},{x:b.x,y:b.y-85},progress(p,.2,.62),'#dd71c3');
    burst(b.x,b.y-77,progress(p,.57,.95),{color:'#e896d6',core:'#dfff9d',radius:107,count:36,kind:'petal',seed:13});
    if(heal){ctx.globalAlpha=heal;
     // Two rising botanical spirals surround, rather than fill, the silhouette.
     for(let arm=0;arm<2;arm++){const pts=[];for(let i=0;i<60;i++){const t=i/59,a=t*TAU*1.2+p*8+arm*Math.PI;pts.push([b.x+Math.cos(a)*50,b.y+8-t*177]);}stroke(pts,arm?'#f29edb':'#d2fba1',2.5,12);}
     for(let i=0;i<15;i++){const a=i*2.399,y=b.y-((p*180+i*17)%175);star(b.x+Math.cos(a+p*3)*62,y,4+rand(i)*4,i%2?'#fffbd2':'#edade0');}ctx.globalAlpha=1;
    }
   }
  }
  if(scene===5){
   const n=get('n'),x=cell(8,5).x+55,y=n.y,e=envelope(p,.12,.94);
   if(back){
    // Local atmospheric shadow makes the violet fire readable without a screen flash.
    glow(x,y-100,240,'#130d25',e*.88);glow(x,y-60,177,'#7736cf',e*.7);
    ctx.globalAlpha=e;sigil(x,y+10,122,'#b473ff',p*1.7);ellipse(x,y+10,137,'#763abe',2);
    for(let i=0;i<9;i++){const a=i*TAU/9,r=90+rand(i)*65;stroke([[x+Math.cos(a)*55,y+Math.sin(a)*18],[x+Math.cos(a+.09)*r*.7,y+Math.sin(a+.09)*r*.23],[x+Math.cos(a)*r,y+Math.sin(a)*r*.34]],'#dba4ff',2,11);}
    // Curved tongues of shadowflame rise behind the changing silhouette.
    for(let i=0;i<13;i++){
     const xx=x-105+i*17,h=(90+rand(i+40)*155)*e,w=13+rand(i)*16;
     ctx.fillStyle=i%2?'#6d32bc':'#35205e';ctx.shadowColor='#9c54eb';ctx.shadowBlur=18;
     ctx.beginPath();ctx.moveTo(xx-w,y);ctx.bezierCurveTo(xx-45,y-h*.45,xx+35,y-h*.6,xx+Math.sin(p*15+i)*25,y-h);ctx.bezierCurveTo(xx+55,y-h*.45,xx+20,y-h*.4,xx+w,y);ctx.fill();
    }ctx.shadowBlur=0;ctx.globalAlpha=1;
   }else{
    if(e){ctx.globalAlpha=e;
     for(let i=0;i<42;i++){const a=i*2.399+p*7,r=65+rand(i)*100,yy=y-((p*240+i*19)%260);const xx=x+Math.cos(a)*r;star(xx,yy,2+rand(i+6)*4,i%3?'#c38aff':'#f2dcff');}
     for(let j=0;j<3;j++){const pts=[];for(let i=0;i<45;i++){const k=i/44,a=k*TAU+p*9+j*2.1;pts.push([x+Math.cos(a)*(110-k*55),y-15-k*210]);}stroke(pts,j===1?'#d9a7ff':'#8c55ce',2,12);}
     ctx.globalAlpha=1;
    }
    const impact=progress(p,.53,.83);if(p>.53&&p<.83){ctx.globalAlpha=1-impact;ellipse(x,y+8,70+impact*110,'#ddb7ff',5);ctx.globalAlpha=1;}
    burst(x,y-112,progress(p,.5,.73),{color:'#be82fa',core:'#f3e0ff',radius:137,count:30,kind:'shard',seed:73});
   }
  }
  ctx.restore();
 }
 return{render};
})();
