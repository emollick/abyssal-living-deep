import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { paintGeometry, segment } from './ReefGeometry.js';
import { seeded, TAU } from './WorldMath.js';

// Every animal is a mesh grown here. Silhouette, mouth, fins and appendages
// carry its identity; color and luminous organs are secondary.
export const CREATURE_TYPES = [
  'butterflyfish','parrotfish','reefshark','tuna','sunfish','dolphin','seal',
  'lanternfish','hatchetfish','dragonfish','anglerfish','gulpereel',
  'squid','vampire','flapjack','octopus','crab','shrimp','ventshrimp',
  'starfish','brittlestar','urchin','isopod','cucumber','seapen',
];

export function creatureGeometry(type, seed=713) {
  if(!CREATURE_TYPES.includes(type))throw new Error('Unknown creature: '+type);
  const rng=seeded(seed),parts=[];
  const tint=(hex,variation=.08)=>new THREE.Color(hex).multiplyScalar(1+(rng()-.5)*variation);
  function skin(g,color,part=0,glow=0,phase=0) {
    paintGeometry(g,color,rng);
    const n=g.attributes.position.count;
    g.setAttribute('aGlow',new THREE.Float32BufferAttribute(new Float32Array(n).fill(glow),1));
    g.setAttribute('aPart',new THREE.Float32BufferAttribute(new Float32Array(n).fill(part),1));
    g.setAttribute('aPhase',new THREE.Float32BufferAttribute(new Float32Array(n).fill(phase),1));
    if(!g.index)g.setIndex(Array.from({length:n},(_,i)=>i));
    parts.push(g);return g;
  }
  function ell(pos,scale,color,part=0,glow=0,detail=16) {
    const g=new THREE.SphereGeometry(1,detail,Math.max(6,Math.round(detail*.65)));
    g.scale(...scale);g.translate(...pos);return skin(g,color,part,glow);
  }
  function blade(points,color,part=0,glow=0,phase=0) {
    const p=[],uv=[],idx=[];
    for(let i=1;i<points.length-1;i++){
      const start=p.length/3;p.push(...points[0],...points[i],...points[i+1]);
      uv.push(0,0,i/points.length,1,(i+1)/points.length,1);idx.push(start,start+1,start+2);
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
    g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();
    return skin(g,color,part,glow,phase);
  }
  function limb(points,radius,color,part=0,phase=0,tip=.12) {
    const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
    const rows=22,sides=7,frames=curve.computeFrenetFrames(rows,false),p=[],uv=[],idx=[];
    for(let i=0;i<=rows;i++){
      const t=i/rows,c=curve.getPointAt(t),r=radius*(tip+(1-tip)*Math.pow(1-t,.7));
      for(let j=0;j<=sides;j++){
        const a=j/sides*TAU,v=c.clone().addScaledVector(frames.normals[i],Math.cos(a)*r).addScaledVector(frames.binormals[i],Math.sin(a)*r);
        p.push(v.x,v.y,v.z);uv.push(t,j/sides);
        if(i<rows&&j<sides){const n=i*(sides+1)+j;idx.push(n,n+1,n+sides+1,n+1,n+sides+2,n+sides+1);}
      }
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
    g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return skin(g,color,part,0,phase);
  }
  function rod(a,b,ra,rb,color,part=0,glow=0,phase=0) {
    return skin(segment(new THREE.Vector3(...a),new THREE.Vector3(...b),ra,rb,6),color,part,glow,phase);
  }
  function eyes(x,y,z,r=.11,iris='#dfd3a4') {
    for(const s of [-1,1]){
      ell([x,y,z*s],[r,r,r*.48],iris,0,0,12);
      ell([x+r*.12,y,z*s+s*r*.35],[r*.60,r*.68,r*.28],'#050e18',0,0,12);
      ell([x+r*.3,y+r*.25,z*s+s*r*.57],[r*.19,r*.19,r*.12],'#e6f2de',0,.2,8);
    }
  }
  function body(length,height,width,back,belly,pattern='plain') {
    const g=ell([0,0,0],[length,height*(.94+rng()*.12),width],back,0,0,26);
    const p=g.attributes.position,c=g.attributes.color,b=new THREE.Color(back),light=new THREE.Color(belly);
    for(let i=0;i<p.count;i++){
      const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
      const col=b.clone().lerp(light,THREE.MathUtils.smoothstep(-y/height,-.3,.75));
      if(pattern==='bands'&&Math.cos((x+.15)*9)>0.5)col.multiplyScalar(.14);
      if(pattern==='parrot'){
        col.lerp(new THREE.Color('#e5a37e'),THREE.MathUtils.smoothstep(x/length,.3,.9)*.55);
        if(Math.sin(x*18+z*14)>0.7)col.multiplyScalar(.7);
      }
      if(pattern==='spots'&&Math.sin(x*16)*Math.cos(z*18)*Math.sin(y*21)>.53)col.multiplyScalar(.45);
      if(pattern==='stripes'&&y>0&&Math.sin(x*18+z*8)>0.4)col.multiplyScalar(.53);
      c.setXYZ(i,col.r,col.g,col.b);
    }
    return g;
  }
  function tail(x,h,color,horizontal=false) {
    const p=[[x+.32,0,0],[x-.5,h,0],[x-.30,.03,0],[x-.5,-h,0]];
    blade(horizontal?p.map(v=>[v[0],v[2],v[1]]):p,color,1);
  }
  function fins(length,height,width,color) {
    blade([[-length*.55,height*.68,0],[-length*.22,height*2.0,0],[length*.35,height*.72,0]],color,2);
    for(const s of [-1,1])blade([[length*.3,0,s*width*.75],[-length*.16,-height*.55,s*width*3.0],[-length*.34,-height*.2,s*width*.65]],color,2,0,s);
  }
  function photophores(count,x0,x1,y,z,color='#83e6dd',r=.035) {
    for(let i=0;i<count;i++)for(const s of [-1,1])ell([THREE.MathUtils.lerp(x0,x1,i/Math.max(1,count-1)),y,z*s],[r,r,r*.7],color,0,1,8);
  }

  if(type==='butterflyfish'){
    body(.75,.72,.14,tint('#e7c45c'),'#fff2be','bands');
    ell([.72,-.08,0],[.25,.11,.1],'#d6b663');tail(-.79,.38,'#ecd870');
    blade([[-.60,.32,0],[-.46,1.18,0],[.17,.70,0],[.57,.4,0]],'#f5dc8a',2);
    blade([[-.51,-.35,0],[-.32,-.95,0],[.46,-.44,0]],'#eaca65',2);
    eyes(.49,.23,.135,.09);
  }else if(type==='parrotfish'){
    body(1,.43,.28,tint('#2bab95'),'#b3d4a3','parrot');tail(-1.08,.57,'#b4d77e');fins(1,.35,.23,'#68b3c7');
    ell([.97,-.03,0],[.22,.21,.21],'#ddbc92');rod([1.12,-.045,-.19],[1.12,-.045,.19],.019,.019,'#4c5c51');
    eyes(.70,.19,.245,.105);
  }else if(type==='reefshark'){
    body(1.72,.38,.42,tint('#7f9195'),'#e5e4cd');
    ell([1.38,-.03,0],[.61,.22,.37],'#a8b5ae');tail(-1.93,.95,'#5d777d');
    blade([[-.5,.26,0],[-.55,1.2,0],[.5,.27,0]],'#71858a',2);
    for(const s of [-1,1]){
      blade([[.75,-.14,s*.3],[-.18,-.48,s*1.46],[-.6,-.18,s*.32]],'#aebcb2',2);
      blade([[-1.08,-.17,s*.16],[-1.58,-.42,s*.52],[-1.5,-.12,s*.1]],'#71858a',2);
      for(let j=0;j<5;j++)rod([.77-j*.1,.12,s*.365],[.70-j*.1,-.12,s*.375],.014,.012,'#354f58');
    }
    eyes(1.53,.07,.33,.064);
    limb([[1.4,-.15,-.27],[1.6,-.19,0],[1.4,-.15,.27]],.018,'#496265');
  }else if(type==='tuna'){
    body(1.20,.43,.33,tint('#537f91'),'#d9e5cd','stripes');tail(-1.4,.74,'#799a97');fins(1.1,.3,.29,'#d0b65e');
    for(let i=0;i<6;i++)blade([[-.6-i*.1,.18-i*.021,0],[-.71-i*.1,.31-i*.033,0],[-.8-i*.1,.16-i*.021,0]],'#e6cf72',1);
    eyes(.89,.1,.25,.09);
  }else if(type==='sunfish'){
    body(.74,1.13,.36,tint('#7b9294'),'#d6d3b7','spots');
    blade([[-.34,.79,0],[-.40,2.33,0],[.22,1.26,0],[.5,.7,0]],'#afbfbb',2);
    blade([[-.4,-.69,0],[-.45,-2.15,0],[.2,-1.23,0],[.43,-.7,0]],'#c1c4ab',2);
    blade([[-.63,.78,0],[-1.10,.6,0],[-1.13,-.52,0],[-.62,-.86,0]],'#bfc6b1',1);
    ell([.77,-.02,0],[.13,.17,.16],'#cacdbc');eyes(.49,.38,.31,.1);
  }else if(type==='dolphin'){
    body(1.42,.36,.40,tint('#789eab'),'#d8e4d9');
    ell([1.15,.01,0],[.5,.33,.34],'#8eadb4');ell([1.70,-.075,0],[.45,.10,.12],'#b6cbc7');
    tail(-1.7,.92,'#839fa8',true);
    blade([[-.4,.26,0],[-.54,1.0,0],[.35,.58,0],[.58,.2,0]],'#789ba5',2);
    for(const s of [-1,1])blade([[.75,-.16,s*.28],[.08,-.7,s*.88],[-.25,-.26,s*.4]],'#b1c6c5',2);
    eyes(1.20,.075,.32,.064);
  }else if(type==='seal'){
    body(1.38,.49,.50,tint('#9a9987'),'#d3c7ab','spots');
    ell([1.22,.15,0],[.54,.41,.37],'#a8aa91');ell([1.64,.05,0],[.21,.23,.27],'#d4cdb2');
    ell([1.84,.17,0],[.055,.07,.1],'#354747');
    for(const s of [-1,1]){
      blade([[.52,-.13,s*.34],[-.16,-.48,s*1.18],[-.52,-.20,s*.70]],'#b7b39a',2);
      blade([[-1.12,-.05,s*.15],[-1.93,-.12,s*.6],[-1.87,.06,s*.1]],'#9d9f8b',1);
      for(let j=0;j<4;j++)limb([[1.71,.02-j*.04,s*.18],[1.85,.03-j*.05,s*.43],[1.72,.08-j*.1,s*.67]],.008,'#e9e5d3');
    }eyes(1.46,.30,.27,.087);
  }else if(type==='lanternfish'){
    body(.82,.23,.19,tint('#698b9c'),'#c1d5d0');tail(-.90,.29,'#729faf');fins(.78,.19,.13,'#82a4b3');
    eyes(.56,.04,.17,.13,'#b3d6c4');photophores(10,-.65,.59,-.16,.16,'#91f4d8',.032);
  }else if(type==='hatchetfish'){
    const shape=new THREE.Shape();
    [[-.92,.12],[-.37,.24],[.60,.5],[.91,.30],[.88,-.34],[.39,-.89],[-.27,-.53],[-.72,-.06]].forEach((p,i)=>i?shape.lineTo(...p):shape.moveTo(...p));shape.closePath();
    const g=new THREE.ExtrudeGeometry(shape,{depth:.13,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.045,bevelThickness:.035});g.translate(0,0,-.065);skin(g,tint('#c2d6d0'));
    tail(-1.00,.23,'#85a9b1');eyes(.62,.20,.11,.15,'#deedd7');
    photophores(8,-.42,.59,-.50,.12,'#8cecdd',.045);
  }else if(type==='dragonfish'){
    body(1.05,.16,.16,tint('#4e6975'),'#7c9d9e');tail(-1.22,.28,'#7a929c');
    ell([1.0,.02,0],[.35,.22,.21],'#647f87');ell([1.28,-.05,0],[.05,.14,.17],'#0e1e2b');
    for(let i=0;i<6;i++)for(const s of [-1,1])rod([1.15-i*.09,.11,s*.13],[1.13-i*.09,-.10,s*.12],.022,.002,'#e5e0c6');
    limb([[1.04,-.15,0],[1.24,-.73,.04],[1.78,-.78,0]],.02,'#91b2aa',5);
    ell([1.78,-.78,0],[.085,.085,.085],'#e5d597',5,1);
    eyes(1.02,.11,.20,.073);photophores(12,-.94,.7,-.1,.14,'#c9e8ce',.027);
    fins(.85,.10,.10,'#718b91');
  }else if(type==='anglerfish'){
    body(.70,.59,.51,tint('#536e78'),'#87928a');
    ell([.55,.04,0],[.50,.61,.53],'#65787c');
    ell([.96,-.02,0],[.055,.44,.39],'#091824',0,0,22);
    for(let i=0;i<15;i++){
      const a=i/15*TAU,y=Math.cos(a)*.44,z=Math.sin(a)*.39;
      rod([1.01,y-.02,z],[1.11,y*.52-.02,z*.73],.028,.002,'#d8d2b5');
    }
    eyes(.6,.39,.45,.10);tail(-.83,.35,'#789298');
    for(const s of [-1,1])blade([[.05,-.1,s*.4],[-.5,-.42,s*.91],[-.65,-.18,s*.4]],'#95a7a1',2);
    limb([[.26,.55,0],[.34,1.60,0],[1.11,1.69,0],[1.30,1.19,0]],.035,'#829c98',5);
    ell([1.30,1.18,0],[.15,.18,.15],'#b5f4d4',5,1);
  }else if(type==='gulpereel'){
    limb([[.4,0,0],[-.6,-.12,0],[-1.8,-.25,.10],[-3.1,-.18,-.1],[-4.7,-.40,.3]],.25,tint('#526d80'),1,0,.025);
    ell([.76,-.14,0],[.80,.30,.40],'#80958f');
    ell([1.35,.03,0],[.13,.37,.30],'#102334');
    for(const s of [-1,1]){
      limb([[.45,.19,s*.22],[1.50,.42,s*.24],[1.77,.04,0]],.044,'#b0b9a7');
      limb([[.45,-.24,s*.27],[1.40,-.48,s*.22],[1.77,.04,0]],.06,'#94a29b');
      blade([[-.2,.04,0],[-1.2,.38,0],[-3.8,.01,0],[-4.2,-.28,0],[-1.9,-.2,0]],'#6f8da0',1);
    }
    eyes(.81,.20,.29,.052);ell([-4.65,-.4,.3],[.045,.045,.045],'#adebc9',1,1,8);
  }else if(type==='squid'){
    body(1.24,.36,.34,tint('#b47563'),'#e2c5a7','spots');
    ell([.96,-.02,0],[.34,.28,.38],'#d1a485');eyes(1.05,.02,.33,.17,'#eadbad');
    for(const s of [-1,1])blade([[-1.32,0,0],[-.65,.02,s*.92],[.02,0,s*.30]],'#c89483',2);
    for(let i=0;i<8;i++){
      const a=i/8*TAU,z=Math.sin(a),y=Math.cos(a);
      limb([[1.12,y*.19,z*.23],[1.83,y*.44-.10,z*.54],[2.45,y*.55-.22,z*.66]],.075,'#ceac99',3,a);
    }
    for(const s of [-1,1]){
      limb([[1.09,-.13,s*.20],[2.0,-.5,s*.36],[3.0,-.55,s*.60],[3.6,-.21,s*.8]],.045,'#d9c6a4',3,s);
      ell([3.58,-.22,s*.8],[.23,.07,.085],'#d9c3a3',3);
    }
  }else if(type==='vampire'){
    body(.71,.50,.51,tint('#a96966'),'#d28b7e');eyes(.47,.16,.46,.15,'#aacfd0');
    for(const s of [-1,1])blade([[-.64,.22,s*.24],[-.76,.30,s*1.02],[.13,.14,s*.49]],'#bd7d70',2);
    for(let i=0;i<8;i++){
      const a=i/8*TAU,b=(i+1)/8*TAU;
      const root=[.39,Math.cos(a)*.36,Math.sin(a)*.36],tip=[1.44,Math.cos(a)*.85,Math.sin(a)*.85];
      limb([root,[.95,Math.cos(a)*.71,Math.sin(a)*.71],tip],.065,'#ba796e',3,a);
      blade([root,tip,[1.0,Math.cos((a+b)/2)*.67,Math.sin((a+b)/2)*.67],[1.44,Math.cos(b)*.85,Math.sin(b)*.85],[.39,Math.cos(b)*.36,Math.sin(b)*.36]],'#aa6263',3,0,a);
      ell(tip,[.035,.035,.035],'#bce9d2',3,.7,8);
    }
  }else if(type==='flapjack'||type==='octopus'){
    const flap=type==='flapjack',color=tint(flap?'#dea084':'#b18a73');
    ell([-.2,.62,0],[.65,.62,.60],color,0,0,26);ell([.25,.38,0],[.44,.34,.48],color);
    eyes(.42,.63,.38,.12,'#edc89c');
    for(let i=0;i<8;i++){
      const a=i/8*TAU,reach=flap?1.18:1.8+(rng()-.5)*.32;
      const tip=[Math.cos(a)*reach,.11,Math.sin(a)*reach];
      limb([[Math.cos(a)*.3,.35,Math.sin(a)*.3],[Math.cos(a)*reach*.67,.15,Math.sin(a)*reach*.67],tip,[tip[0]*1.06,.24,tip[2]*1.04]],flap?.14:.13,color,3,a,.12);
      if(flap){
        const b=a+TAU/8;
        blade([[0,.3,0],tip,[Math.cos((a+b)/2)*.83,.10,Math.sin((a+b)/2)*.83],[Math.cos(b)*reach,.11,Math.sin(b)*reach]],'#d79581',3,0,a);
      }else for(let j=1;j<5;j++)ell([Math.cos(a)*j*.30,.16,Math.sin(a)*j*.30],[.055,.035,.055],'#dac4a4',3,0,8);
    }
    if(flap)for(const s of [-1,1])ell([-.18,.92,s*.62],[.36,.12,.42],'#e3ae8c',2);
  }else if(type==='crab'||type==='isopod'){
    const iso=type==='isopod',color=tint(iso?'#b7b5a4':'#bd967b');
    if(iso){
      for(let i=0;i<8;i++){
        const x=-.84+i*.24,rad=.42+Math.sin(i/7*Math.PI)*.12;
        ell([x,.37,0],[.22,.29,rad],i%2?color:'#8f9f99');
      }
      ell([1.03,.35,0],[.29,.24,.39],color);eyes(1.10,.46,.34,.057);
    }else{
      ell([0,.43,0],[.65,.26,.69],color,0,0,24);
      for(const s of [-1,1]){
        rod([.42,.57,s*.31],[.57,.87,s*.36],.045,.028,color);
        ell([.57,.87,s*.36],[.07,.065,.06],'#263c45');
        limb([[.48,.43,s*.42],[.95,.78,s*.96],[1.34,.52,s*.86]],.10,color,4,s);
        ell([1.33,.52,s*.84],[.25,.15,.21],'#dcc2a0',4);
        limb([[1.46,.55,s*.78],[1.72,.57,s*.70],[1.77,.53,s*.82]],.065,'#d8c4a7',4,s);
        limb([[1.46,.48,s*.99],[1.71,.47,s*1.03],[1.77,.53,s*.87]],.055,'#ccad91',4,s);
      }
    }
    const legs=iso?7:4;
    for(let i=0;i<legs;i++)for(const s of [-1,1]){
      const x=(i/(legs-1)-.5)*(iso?1.6:1.05),z=iso?.42:.53;
      limb([[x,.41,s*z],[x-.18,.60,s*(z+.43)],[x-.40,.085,s*(z+.78)]],iso?.042:.061,color,4,i*Math.PI*.8+s);
    }
    if(iso)for(const s of [-1,1])limb([[1.10,.43,s*.19],[1.64,.50,s*.32],[2.00,.28,s*.64]],.022,'#c8c8b0',4,s);
  }else if(type==='shrimp'||type==='ventshrimp'){
    const vent=type==='ventshrimp',color=tint(vent?'#e4d9bf':'#ca8f79');
    for(let i=0;i<7;i++){
      const x=-.95+i*.24,y=.23+Math.sin(i/6*Math.PI)*.21,r=.12+Math.sin(i/6*Math.PI)*.09;
      ell([x,y,0],[.19,r,r],i%2?color:(vent?'#c1b79e':'#b76f66'),1);
    }
    ell([.57,.33,0],[.35,.24,.24],color);rod([.62,.46,0],[1.17,.50,0],.064,.002,color);
    for(const s of [-1,1]){
      ell([.81,.41,s*.20],[.053,.063,.04],'#354c54');
      limb([[.80,.42,s*.15],[1.33,.79,s*.38],[1.77,.68,s*.78]],.012,color,3,s);
      blade([[-.92,.17,0],[-1.47,.08,s*.42],[-1.29,.2,0]],color,1);
      for(let i=0;i<5;i++)limb([[.56-i*.18,.20,s*.09],[.40-i*.18,.09,s*.30],[.61-i*.19,.03,s*.42]],.014,color,4,i+s);
    }
  }else if(type==='starfish'||type==='brittlestar'){
    const brittle=type==='brittlestar',color=tint(brittle?'#c9bf9f':'#d98b6d'),arms=brittle?6:5;
    ell([0,.14,0],[brittle?.27:.40,.14,brittle?.27:.40],color);
    for(let i=0;i<arms;i++){
      const a=i/arms*TAU,reach=brittle?1.6:1.2;
      limb([[0,.13,0],[Math.cos(a)*reach*.43,.19,Math.sin(a)*reach*.43],[Math.cos(a+.12)*reach,.08,Math.sin(a+.12)*reach]],brittle?.052:.23,color,3,a,.06);
      if(brittle)for(let j=1;j<7;j++)for(const s of [-1,1]){
        const x=Math.cos(a)*j*.2,z=Math.sin(a)*j*.2;
        rod([x,.15,z],[x+Math.cos(a+s*Math.PI/2)*.095,.17,z+Math.sin(a+s*Math.PI/2)*.095],.009,.002,'#e0d6b7',3);
      }
    }
  }else if(type==='urchin'){
    ell([0,.34,0],[.40,.32,.4],tint('#69677e'),0,0,22);
    for(let i=0;i<90;i++){
      const y=i/89*1.3-.3,a=i*2.399963,r=Math.sqrt(1-y*y),d=[Math.cos(a)*r,y,Math.sin(a)*r];
      const len=.36+rng()*.24;
      rod([d[0]*.36,.34+d[1]*.29,d[2]*.36],[d[0]*(.36+len),.34+d[1]*(.29+len),d[2]*(.36+len)],.019,.001,i%3?'#9c94aa':'#d0c5bd');
    }
  }else if(type==='cucumber'){
    const color=tint('#b69a92');ell([0,.35,0],[1.05,.34,.43],color,0,0,26);
    for(let i=0;i<6;i++)for(const s of [-1,1]){
      const x=-.76+i*.3;
      limb([[x,.27,s*.25],[x,.14,s*.5],[x+.08,.05,s*.59]],.054,'#d4b3a0',4,i+s);
      limb([[x,.59,s*.14],[x-.07,.85,s*.23],[x-.13,.99,s*.28]],.06,'#cbb0a3',3,i+s);
    }
    ell([1.02,.36,0],[.06,.15,.17],'#7d7775');
  }else if(type==='seapen'){
    rod([0,0,0],[0,2.1,0],.085,.025,tint('#cab6a7'),3);
    for(let i=0;i<14;i++)for(const s of [-1,1]){
      const y=.36+i*.115,w=Math.sin((i+2)/17*Math.PI)*.67;
      limb([[0,y,0],[s*w*.6,y+.12,0],[s*w,y+.2,.03]],.055,'#d3b9ad',3,i*.2+s);
      for(let j=1;j<5;j++)rod([s*w*j/5,y+j*.03,0],[s*w*j/5,y+.16+j*.03,.04],.02,.005,'#e7d1b9',3);
    }
  }
  const geometry=mergeGeometries(parts,false);
  parts.forEach(g=>g.dispose());
  geometry.scale(.94+rng()*.12,.94+rng()*.12,.94+rng()*.12);
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
  geometry.userData.creature=type;
  return geometry;
}
