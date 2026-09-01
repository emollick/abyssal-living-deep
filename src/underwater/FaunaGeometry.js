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
  function skin(g,color,part=0,glow=0,phase=0,tissue=0) {
    paintGeometry(g,color,rng);
    const n=g.attributes.position.count;
    g.setAttribute('aGlow',new THREE.Float32BufferAttribute(new Float32Array(n).fill(glow),1));
    g.setAttribute('aPart',new THREE.Float32BufferAttribute(new Float32Array(n).fill(part),1));
    g.setAttribute('aPhase',new THREE.Float32BufferAttribute(new Float32Array(n).fill(phase),1));
    g.setAttribute('aTissue',new THREE.Float32BufferAttribute(new Float32Array(n).fill(tissue),1));
    if(!g.index)g.setIndex(Array.from({length:n},(_,i)=>i));
    parts.push(g);return g;
  }
  function ell(pos,scale,color,part=0,glow=0,detail=24) {
    const g=new THREE.SphereGeometry(1,detail,Math.max(6,Math.round(detail*.65)));
    g.scale(...scale);g.translate(...pos);return skin(g,color,part,glow);
  }
  function blade(points,color,part=0,glow=0,phase=0) {
    const outline=points.map(p=>new THREE.Vector3(...p));
    const curve=new THREE.CatmullRomCurve3(outline,true,'centripetal');
    const center=outline.reduce((a,p)=>a.add(p),new THREE.Vector3()).multiplyScalar(1/outline.length);
    const normal=new THREE.Vector3().crossVectors(outline[1].clone().sub(outline[0]),outline.at(-1).clone().sub(outline[0])).normalize();
    const p=[],uv=[],idx=[],rows=7,sides=Math.max(36,points.length*9);
    const span=Math.max(...outline.map(v=>v.distanceTo(center)));
    for(let j=0;j<=rows;j++)for(let i=0;i<=sides;i++){
      const t=j/rows,edge=curve.getPoint(i/sides);
      const v=center.clone().lerp(edge,t).addScaledVector(normal,Math.sin(t*Math.PI)*span*.045);
      p.push(v.x,v.y,v.z);uv.push(i/sides,t);
      if(j<rows&&i<sides){const n=j*(sides+1)+i;idx.push(n,n+1,n+sides+1,n+1,n+sides+2,n+sides+1);}
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
    g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();
    return skin(g,color,part,glow,phase,1);
  }
  function limb(points,radius,color,part=0,phase=0,tip=.12) {
    const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
    const rows=28,sides=9,frames=curve.computeFrenetFrames(rows,false),p=[],uv=[],idx=[];
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
  function web(surface,color) {
    const rows=16,sides=128,p=[],uv=[],idx=[];
    for(let j=0;j<=rows;j++)for(let i=0;i<=sides;i++){
      const t=j/rows,a=i/sides*TAU;p.push(...surface(a,t));uv.push(i/sides,t);
      if(j<rows&&i<sides){const n=j*(sides+1)+i;idx.push(n,n+1,n+sides+1,n+1,n+sides+2,n+sides+1);}
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return skin(g,color,3,0,0,1);
  }
  function rod(a,b,ra,rb,color,part=0,glow=0,phase=0) {
    return skin(segment(new THREE.Vector3(...a),new THREE.Vector3(...b),ra,rb,6),color,part,glow,phase);
  }
  function eyes(x,y,z,r=.11,iris='#dfd3a4') {
    r*=['lanternfish','hatchetfish','vampire'].includes(type)?.80:.59;
    const rim=new THREE.Color(iris).lerp(new THREE.Color('#493e2b'),.72);
    for(const s of [-1,1]){
      const irisMesh=ell([x,y,z*s],[r,r*.94,r*.22],rim,0,0,20);
      const eye=ell([x+r*.03,y,z*s+s*r*.17],[r*.79,r*.82,r*.18],'#090c0c',0,0,20);
      for(const g of [irisMesh,eye])g.attributes.aTissue.array.fill(2);
    }
  }
  function loft(profile,color,part=0) {
    const rows=64,sides=36,p=[],uv=[],idx=[];
    const cat=(i,t,k)=>{
      const a=profile[Math.max(0,i-1)][k]||0,b=profile[i][k]||0,c=profile[Math.min(i+1,profile.length-1)][k]||0,d=profile[Math.min(i+2,profile.length-1)][k]||0;
      return .5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t);
    };
    for(let j=0;j<=rows;j++){
      const u=j/rows,f=u*(profile.length-1),i=Math.min(profile.length-2,Math.floor(f)),t=f-i;
      const x=cat(i,t,0),ry=Math.max(.002,cat(i,t,1)),rz=Math.max(.002,cat(i,t,2)),cy=cat(i,t,3);
      for(let k=0;k<=sides;k++){
        const a=k/sides*TAU,soft=1+Math.sin(x*8.2+a*3)*Math.sin(a*5+x*3.7)*.009;
        p.push(x,cy+Math.cos(a)*ry*soft,Math.sin(a)*rz*soft);uv.push(u,k/sides);
        if(j<rows&&k<sides){const n=j*(sides+1)+k;idx.push(n,n+1,n+sides+1,n+1,n+sides+2,n+sides+1);}
      }
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
    g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return skin(g,color,part);
  }
  function body(length,height,width,back,belly,pattern='plain') {
    const h=height*(.97+rng()*.06),mammal=['seal','dolphin'].includes(type),blunt=['parrotfish','sunfish','vampire'].includes(type);
    const profile=type==='reefshark'?[[-1.12,.06,.09],[-.90,.24,.29],[-.55,.7,.7],[-.1,1,1],[.4,.88,.94],[.7,.65,.78],[.91,.37,.66],[1.14,.07,.20]]:mammal?[[-1.15,.045,.07],[-.9,.25,.28],[-.5,.7,.75],[-.1,.99,1],[.35,.97,.98],[.7,.77,.80],[1,.25,.35],[1.05,.02,.03]]:
      [[-1.12,.035,.04],[-.92,.18,.19],[-.65,.54,.50],[-.25,.96,.93],[.12,1,1],[.49,.88,.87],[.79,blunt?.63:.57,blunt?.66:.61],[1,blunt?.29:.13,blunt?.32:.18],[1.06,.025,.035]];
    const g=loft(profile.map(v=>[v[0]*length,v[1]*h,v[2]*width,0]),back);
    const p=g.attributes.position,c=g.attributes.color,b=new THREE.Color(back),light=new THREE.Color(belly);
    for(let i=0;i<p.count;i++){
      const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
      const col=b.clone().lerp(light,THREE.MathUtils.smoothstep(-y/height,-.3,.75));
      if(pattern==='bands')col.multiplyScalar(.18+.82*THREE.MathUtils.smoothstep(Math.cos((x+.11)*9.4),.08,.47));
      if(pattern==='parrot'){
        col.lerp(new THREE.Color('#e5a37e'),THREE.MathUtils.smoothstep(x/length,.3,.9)*.55);
        if(Math.sin(x*18+z*14)>0.7)col.multiplyScalar(.7);
      }
      if(pattern==='spots')col.multiplyScalar(.66+.34*THREE.MathUtils.smoothstep(Math.sin(x*17+z*4)*Math.cos(z*19+y*7)*Math.sin(y*23-x*2),.1,.55));
      if(pattern==='stripes'&&y>0&&Math.sin(x*18+z*8)>0.4)col.multiplyScalar(.53);
      c.setXYZ(i,col.r,col.g,col.b);
    }
    return g;
  }
  function tail(x,h,color,horizontal=false) {
    const upper=type==='reefshark'?h*1.15:h,lower=type==='reefshark'?h*.57:h;
    const p=[[x+.24,0,0],[x-.26,upper*.80,0],[x-.68,upper,0],[x-.45,upper*.30,0],[x-.29,0,0],[x-.46,-lower*.32,0],[x-.68,-lower,0],[x-.22,-lower*.72,0]];
    blade(horizontal?p.map(v=>[v[0],v[2],v[1]]):p,color,1);
  }
  function fins(length,height,width,color) {
    blade([[-length*.55,height*.68,0],[-length*.22,height*2.0,0],[length*.35,height*.72,0]],color,2);
    for(const s of [-1,1])blade([[length*.3,0,s*width*.75],[-length*.16,-height*.55,s*width*3.0],[-length*.34,-height*.2,s*width*.65]],color,2,0,s);
  }
  function photophores(count,x0,x1,y,z,color='#83e6dd',r=.035) {
    for(let i=0;i<count;i++)for(const s of [-1,1])ell([THREE.MathUtils.lerp(x0,x1,i/Math.max(1,count-1)),y,z*s],[r,r,r*.7],color,0,1,8);
  }
  function gape(x,y,ry,rz,depth,color,teeth=21) {
    const cavity=loft([[x-depth,.018,.015,y],[x-depth*.75,ry*.35,rz*.4,y],[x-depth*.3,ry*.78,rz*.83,y],[x,ry,rz,y]],'#0b0908');
    cavity.attributes.aTissue.array.fill(3);
    const lip=Array.from({length:41},(_,i)=>{const a=i/40*TAU;return [x+.008*Math.sin(a*5),y+Math.cos(a)*ry,Math.sin(a)*rz];});
    limb(lip,.025,color,0,0,1);
    for(let i=0;i<teeth;i++){
      const a=(i+.1+rng()*.35)/teeth*TAU,cy=Math.cos(a),sz=Math.sin(a),length=.22+rng()*.27;
      limb([[x+.012,y+cy*ry,sz*rz],[x+.07,y+cy*ry*(1-length*.5),sz*rz*(1-length*.35)],[x+.10,y+cy*ry*(1-length),sz*rz*(1-length*.7)]],.009+rng()*.005,'#c5bca7',0,0,.015);
    }
  }

  if(type==='butterflyfish'){
    body(.75,.72,.14,tint('#e7c45c'),'#fff2be','bands');
    ell([.72,-.08,0],[.25,.11,.1],'#d6b663');tail(-.79,.38,'#ecd870');
    blade([[-.60,.32,0],[-.46,1.18,0],[.17,.70,0],[.57,.4,0]],'#f5dc8a',2);
    blade([[-.51,-.35,0],[-.32,-.95,0],[.46,-.44,0]],'#eaca65',2);
    eyes(.49,.23,.135,.09);
  }else if(type==='parrotfish'){
    body(1,.43,.28,tint('#347e70'),'#a5b8a0','parrot');tail(-1.08,.48,'#789a78');fins(1,.31,.20,'#557e83');
    ell([1.00,-.03,0],[.11,.12,.13],'#a79e83');rod([1.085,-.04,-.105],[1.085,-.04,.105],.009,.009,'#41453a');
    eyes(.70,.19,.245,.105);
  }else if(type==='reefshark'){
    body(1.72,.38,.42,tint('#7f9195'),'#e5e4cd');
    tail(-1.93,.83,'#687777');
    blade([[-.5,.26,0],[-.55,1.2,0],[.5,.27,0]],'#71858a',2);
    for(const s of [-1,1]){
      blade([[.75,-.14,s*.3],[-.18,-.48,s*1.46],[-.6,-.18,s*.32]],'#aebcb2',2);
      blade([[-1.08,-.17,s*.16],[-1.58,-.42,s*.52],[-1.5,-.12,s*.1]],'#71858a',2);
      for(let j=0;j<5;j++)rod([.77-j*.1,.12,s*.365],[.70-j*.1,-.12,s*.375],.014,.012,'#354f58');
    }
    eyes(1.45,.07,.286,.060);
    limb([[1.4,-.15,-.27],[1.6,-.19,0],[1.4,-.15,.27]],.018,'#496265');
  }else if(type==='tuna'){
    body(1.20,.39,.31,tint('#3e6273'),'#c5d4d1');tail(-1.4,.74,'#64777e');fins(1.1,.26,.24,'#9d9c79');
    for(let i=0;i<6;i++)blade([[-.6-i*.1,.18-i*.021,0],[-.71-i*.1,.31-i*.033,0],[-.8-i*.1,.16-i*.021,0]],'#e6cf72',1);
    eyes(.89,.1,.25,.09);
  }else if(type==='sunfish'){
    body(.74,1.13,.36,tint('#7b9294'),'#d6d3b7','spots');
    blade([[-.34,.79,0],[-.40,2.33,0],[.22,1.26,0],[.5,.7,0]],'#afbfbb',2);
    blade([[-.4,-.69,0],[-.45,-2.15,0],[.2,-1.23,0],[.43,-.7,0]],'#c1c4ab',2);
    blade([[-.63,.78,0],[-1.10,.6,0],[-1.13,-.52,0],[-.62,-.86,0]],'#bfc6b1',1);
    ell([.79,-.02,0],[.075,.09,.095],'#9c9f90');eyes(.49,.38,.31,.09);
    for(const s of [-1,1])limb([[.15,.25,s*.36],[.02,.03,s*.37],[.11,-.15,s*.36]],.014,'#526368');
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
    loft([[-.92,.035,.023,.12],[-.64,.17,.044,.08],[-.36,.39,.076,-.12],[.02,.59,.10,-.12],[.40,.57,.13,-.025],[.69,.36,.14,.15],[.86,.045,.043,.28]],tint('#89979c'));
    tail(-.99,.20,'#77878f');eyes(.56,.29,.13,.13,'#9da490');
    photophores(8,-.38,.48,-.54,.072,'#a1ccd5',.019);
  }else if(type==='dragonfish'){
    loft([[-1.18,.025,.02,0],[-.82,.10,.08,0],[-.30,.15,.13,0],[.25,.15,.14,0],[.70,.17,.17,0],[1.05,.18,.18,.01],[1.28,.115,.14,-.025]],tint('#373a38'));
    tail(-1.22,.24,'#535e5d');gape(1.285,-.025,.11,.135,.20,'#5a5c52',17);
    limb([[1.04,-.15,0],[1.24,-.73,.04],[1.78,-.78,0]],.02,'#91b2aa',5);
    ell([1.78,-.78,0],[.034,.038,.033],'#d3e3c7',5,1);
    eyes(1.02,.11,.14,.073);photophores(12,-.94,.7,-.1,.14,'#c9e8ce',.015);
    fins(.85,.10,.10,'#718b91');
  }else if(type==='anglerfish'){
    const color=tint('#38332d');
    loft([[-1.0,.04,.035,.04],[-.73,.14,.12,.07],[-.40,.41,.36,.12],[-.02,.59,.48,.14],[.30,.66,.51,.13],[.58,.58,.46,.075],[.74,.49,.41,.025]],color);
    gape(.748,.025,.48,.40,.48,color,29);
    eyes(.52,.48,.411,.067,'#6b5940');tail(-1.03,.27,'#4b443b');
    for(const s of [-1,1])blade([[-.2,-.08,s*.38],[-.41,-.40,s*.69],[-.78,-.28,s*.46],[-.62,-.10,s*.26]],'#574e43',2);
    blade([[-.72,.20,0],[-.57,.58,0],[-.36,.47,0],[-.30,.36,0]],'#4c443a',2);
    limb([[.18,.76,0],[.28,1.38,.02],[.79,1.46,.035],[1.04,1.08,0]],.013,'#6d6654',5);
    ell([1.04,1.08,0],[.050,.059,.045],'#d8e9d0',5,1);
  }else if(type==='gulpereel'){
    loft([[-4.7,.004,.004,-.15],[-3.4,.025,.020,-.17],[-2.1,.06,.05,-.09],[-.9,.11,.095,-.06],[-.1,.19,.18,-.05],[.5,.32,.32,-.13],[1.06,.37,.35,-.16],[1.49,.32,.31,-.10]],tint('#302e2c'),1);
    gape(1.49,-.10,.315,.30,.67,'#4b4438',13);
    blade([[-.2,.11,0],[-1.1,.22,0],[-3.7,-.04,0],[-4.2,-.17,0],[-1.9,-.10,0]],'#494640',1);
    eyes(1.02,.21,.23,.044);ell([-4.67,-.15,0],[.018,.018,.018],'#b9d9be',1,1,8);
  }else if(type==='squid'){
    body(1.24,.28,.27,tint('#aa8a7c'),'#d3c6b2','spots');
    ell([.96,-.02,0],[.32,.23,.29],'#b8a091');eyes(1.05,.02,.265,.17,'#b3aa8d');
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
    body(.77,.43,.42,tint('#583331'),'#79483e');eyes(.47,.13,.35,.15,'#877d6a');
    for(const s of [-1,1])blade([[-.64,.22,s*.24],[-.83,.30,s*.84],[-.40,.38,s*.91],[.13,.14,s*.38]],'#70443d',2);
    web((a,t)=>{const r=.35+t*(.44+Math.cos(a*8)*.055);return [.36+t*(.91+Math.cos(a*8)*.16),Math.cos(a)*r,Math.sin(a)*r];},'#603834');
    for(let i=0;i<8;i++){
      const a=i/8*TAU,b=(i+1)/8*TAU;
      const root=[.39,Math.cos(a)*.36,Math.sin(a)*.36],tip=[1.44,Math.cos(a)*.85,Math.sin(a)*.85];
      limb([root,[.95,Math.cos(a)*.71,Math.sin(a)*.71],tip],.049,'#75473e',3,a);
      ell(tip,[.017,.017,.017],'#b7ced1',3,.55,8);
    }
  }else if(type==='flapjack'||type==='octopus'){
    const flap=type==='flapjack',color=tint(flap?'#ac6541':'#87735a');
    // The cirrate mantle is a broad, low dome over the web, with the eyes
    // embedded at its front edge. It does not have a separate snout.
    const mantle=flap?[[-.66,.025,.04,.26],[-.51,.21,.38,.30],[-.24,.31,.58,.33],[.06,.29,.59,.32],[.31,.22,.49,.29],[.49,.13,.30,.25],[.57,.025,.04,.20]]:
      [[-1.2,.045,.05,.40],[-.89,.28,.32,.42],[-.29,.38,.52,.42],[.04,.33,.41,.35],[.31,.24,.34,.29],[.56,.17,.25,.26],[.67,.035,.05,.21]];
    loft(mantle,color);
    eyes(flap?.34:.42,flap?.35:.38,flap?.46:.31,.11,'#7d6144');
    if(flap)web((a,t)=>{const r=.24+t*(.74+Math.cos(a*8)*.09);return [Math.cos(a)*r,.20*(1-t)*(1-t)+.068+Math.cos(a*8)*t*.014,Math.sin(a)*r];},'#ac6c49');
    for(let i=0;i<8;i++){
      const a=i/8*TAU+(flap?0:(rng()-.5)*.10),reach=flap?1.10:1.6+rng()*.62;
      const tip=[Math.cos(a)*reach,.055,Math.sin(a)*reach];
      limb([[Math.cos(a)*.29,.19,Math.sin(a)*.29],[Math.cos(a+.025)*reach*.59,.10,Math.sin(a+.025)*reach*.59],tip,[tip[0]*1.015,flap?.073:.10+rng()*.11,tip[2]*1.015]],flap?.062:.12,color,3,a,.055);
      if(!flap)for(let j=1;j<9;j++)for(const s of [-1,1]){
        const d=j*reach*.088,w=.033*(1-j/13);
        ell([Math.cos(a)*d-Math.sin(a)*s*w,.08,Math.sin(a)*d+Math.cos(a)*s*w],[w,.018,w],'#b49e85',3,0,8);
      }
    }
    if(flap)for(const s of [-1,1])blade([[-.35,.46,s*.34],[-.52,.57,s*.62],[-.49,.68,s*.83],[-.25,.70,s*.91],[-.08,.61,s*.71],[-.06,.43,s*.42]],'#b97850',2);
  }else if(type==='crab'||type==='isopod'){
    const iso=type==='isopod',color=tint(iso?'#b7b5a4':'#bd967b');
    if(iso){
      loft([[-1.04,.05,.10,.24],[-.78,.21,.39,.26],[-.23,.27,.49,.27],[.38,.25,.48,.27],[.88,.15,.35,.29],[1.15,.035,.10,.31]],color);
      for(let i=0;i<8;i++){
        const x=-.84+i*.24,rad=.42+Math.sin(i/7*Math.PI)*.12;
        ell([x,.43,0],[.21,.13,rad],i%2?color:'#969589');
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
      limb([[x,iso?.27:.41,s*z],[x-.18,iso?.21:.60,s*(z+(iso?.18:.43))],[x-.32,iso?.035:.085,s*(z+(iso?.38:.78))]],iso?.034:.061,color,4,i*Math.PI*.8+s);
    }
    if(iso)for(const s of [-1,1])limb([[1.10,.43,s*.19],[1.64,.50,s*.32],[2.00,.28,s*.64]],.022,'#c8c8b0',4,s);
  }else if(type==='shrimp'||type==='ventshrimp'){
    const vent=type==='ventshrimp',color=tint(vent?'#e4d9bf':'#ca8f79');
    loft([[-1.09,.025,.025,.16],[-.85,.075,.08,.21],[-.57,.13,.13,.28],[-.26,.17,.15,.35],[.08,.18,.17,.37],[.43,.17,.20,.34],[.73,.13,.18,.33],[.92,.03,.03,.38]],color,1);
    for(let i=0;i<6;i++){
      const x=-.87+i*.25,y=.23+Math.sin(i/6*Math.PI)*.13,r=.08+Math.sin(i/6*Math.PI)*.11;
      const seam=Array.from({length:13},(_,j)=>{const a=j/12*Math.PI;return [x,y+Math.sin(a)*r,Math.cos(a)*r];});
      limb(seam,.009,vent?'#aaa593':'#8d6558',1,0,1);
    }
    rod([.62,.46,0],[1.17,.50,0],.030,.001,color);
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
      limb([[x,.59,s*.14],[x-.04,.71,s*.19],[x-.08,.77,s*.22]],.032,'#b79e8c',3,i+s);
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
