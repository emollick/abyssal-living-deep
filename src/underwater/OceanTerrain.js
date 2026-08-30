import * as THREE from 'three';
import { oceanFloor, transectPose } from './OceanDomain.js';
import { seeded, TAU } from './WorldMath.js';
import { Batch, rockGeometry, paintGeometry, segment } from './ReefGeometry.js';
import { jellyGeometry } from './MarineLife.js';
import { waterMaterial } from './UnderwaterMaterial.js';

export function createOceanTerrain(recipe) {
  const group=new THREE.Group();group.name='Continuous continental shelf and trench';
  const xs=[-2600,-1900,-1300,-850,-600];
  for(let x=-450;x<=450;x+=3)xs.push(x);
  xs.push(600,850,1300,1900,2600);
  const zs=[-2600,-1900,-1300,-1080];
  for(let z=-980;z<=420;z+=3)zs.push(z);
  zs.push(600,850,1300,1900,2600);
  const positions=[],colors=[],uv=[],index=[];
  const sand=new THREE.Color('#b9b29a'),basalt=new THREE.Color('#85857a');
  for(let j=0;j<zs.length;j++)for(let i=0;i<xs.length;i++) {
    const x=xs[i],z=zs[j],y=oceanFloor(x,z,recipe),depth=-y;
    positions.push(x,y,z);uv.push(x*.01,z*.01);
    const c=sand.clone().lerp(basalt,THREE.MathUtils.smoothstep(depth,70,420));
    const patch=Math.sin(x*.11)*Math.cos(z*.12)*.045;
    c.multiplyScalar(.93+patch);colors.push(c.r,c.g,c.b);
    if(i<xs.length-1&&j<zs.length-1){const n=j*xs.length+i;index.push(n,n+xs.length,n+1,n+1,n+xs.length,n+xs.length+1);}
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geometry.setAttribute('aFlex',new THREE.Float32BufferAttribute(new Float32Array(positions.length/3),1));
  geometry.setIndex(index);geometry.computeVertexNormals();
  const terrain=new THREE.Mesh(geometry,waterMaterial(0,{name:'continental-bathymetry'}));
  terrain.name='Unbroken seabed';group.add(terrain);

  const rng=seeded(recipe.seed+918);
  const stone=new Batch(waterMaterial(1,{name:'basalt-escarpment'}));
  const polyps=new Batch(waterMaterial(2,{name:'cold-water-colonies'}));
  const rock=rockGeometry(recipe.seed);
  for(let i=0;i<160;i++) {
    const z=-210-rng()*435,x=(rng()-.5)*260;
    const y=oceanFloor(x,z,recipe),height=(4+rng()**2*32)*(.6+(recipe.relief??1)*.4);
    const g=rock.clone();g.scale(3+rng()*7,height,3+rng()*6);g.rotateY(rng()*TAU);g.translate(x,y+height*.35,z);
    stone.add(g,'#53686d',rng);
    if(i%3===0)for(let k=0;k<Math.round(7*(recipe.life??1));k++) {
      const a=rng()*TAU,px=x+Math.cos(a)*4,pz=z+Math.sin(a)*4;
      const bottom=new THREE.Vector3(px,y+height*.8,pz);
      const top=bottom.clone().add(new THREE.Vector3((rng()-.5)*2,2+rng()*3,(rng()-.5)*2));
      polyps.add(segment(bottom,top,.06,.025,5),i%2?'#95b8b8':'#e4c79f',rng);
      const bud=new THREE.SphereGeometry(.14,6,4);bud.translate(top.x,top.y,top.z);polyps.add(bud,'#d6e9d5',rng);
    }
  }
  for(let depth=135;depth<1320;depth+=48)for(let colony=0;colony<Math.round(4*(recipe.life??1));colony++){
    const pose=transectPose(depth,recipe),z=pose.eye[2]-12+(rng()-.5)*22;
    let lo=14,hi=90;
    for(let k=0;k<20;k++){const x=(lo+hi)/2;if(oceanFloor(x,z,recipe)<-depth)lo=x;else hi=x;}
    const x=(lo+hi)/2,y=oceanFloor(x,z,recipe),size=.9+rng()*1.4;
    const root=new THREE.Vector3(x-.1,y+.15,z),stem=root.clone().add(new THREE.Vector3(-size*1.6,size*.5,0));
    polyps.add(segment(root,stem,.1,.045,6),depth<350?'#cdbfb0':'#759f9e',rng);
    for(let k=0;k<6;k++){
      const angle=(k/5-.5)*2.3,tip=stem.clone().add(new THREE.Vector3(-Math.cos(angle)*size,Math.sin(angle)*size*.5,Math.sin(angle)*size));
      polyps.add(segment(stem,tip,.04,.012,5),depth<350?'#e5c3b1':'#9bcebf',rng);
      const bud=new THREE.SphereGeometry(.10,7,5);bud.translate(tip.x,tip.y,tip.z);polyps.add(bud,'#c9dcca',rng);
    }
  }
  rock.dispose();stone.finish(group,'Weathered canyon walls');polyps.finish(group,'Cold-water polyps');
  return group;
}

export function createPelagicLife(recipe) {
  const group=new THREE.Group();group.name='Life between the surface and the abyss';
  const rng=seeded(recipe.seed+611),gel=(recipe.shoal??1)*(recipe.jellies??.65),canyonCount=Math.round(14*gel),columnCount=Math.round(18*gel),count=canyonCount+columnCount;
  const g=jellyGeometry(rng,.65),m=waterMaterial(5,{name:'twilight-jellies',motion:3,glow:.85,opacity:.8,transparent:true});
  const jellies=new THREE.InstancedMesh(g,m,Math.max(1,count));jellies.count=count;
  const dummy=new THREE.Object3D(),data=[];
  for(let i=0;i<count;i++){
    const column=i>=canyonCount;
    const depth=column?85+(i-canyonCount)/Math.max(1,columnCount-1)*1255+(rng()-.5)*5:100+rng()*1240;
    const pose=column?{eye:[0,-depth,-738]}:transectPose(depth,recipe);
    const a=rng()*TAU,r=8+rng()*22;
    const x=column?(rng()-.5)*24:pose.eye[0]+Math.cos(a)*r+8,z=column?-749+(rng()-.5)*15:pose.eye[2]+Math.sin(a)*r-12;
    data.push({x,y:Math.max(-depth,oceanFloor(x,z,recipe)+5),z,phase:rng()*TAU,size:.14+rng()*.24});
  }
  group.add(jellies);jellies.frustumCulled=false;
  const chain=new Batch(waterMaterial(5,{name:'siphonophores',glow:.9,opacity:.7,transparent:true}));
  const bells=new Batch(waterMaterial(2,{name:'siphonophore-bells',glow:.8}));
  const chainCount=Math.round(4*gel),chainStops=[[330,0],[740,0],[1140,1]];
  for(let c=0;c<chainCount;c++) {
    const [depth,column]=chainStops[c]||[180+(c*137)%1100,c%2];
    const pose=column?{eye:[0,-depth,-738]}:transectPose(depth,recipe),points=[];
    const offset=14+rng()*8;
    for(let i=0;i<65;i++) {
      const t=i/64,p=new THREE.Vector3(pose.eye[0]+offset+Math.sin(t*5.7)*4, -depth+8-t*17,pose.eye[2]-16+Math.cos(t*5.7)*3);
      for(let k=0;k<30&&p.y<oceanFloor(p.x,p.z,recipe)+2;k++)p.x-=.7;
      points.push(p);
      if(i%2===0){const b=new THREE.SphereGeometry(.18+Math.sin(t*Math.PI)*.16,9,7);b.scale(1,1.7,1);b.translate(p.x,p.y,p.z);bells.add(b,i%4?'#9edbd7':'#ebc3a5',rng);}
    }
    const tube=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),96,.055,5,false);chain.add(tube,'#90cfd4',rng);
  }
  chain.finish(group,'Drifting siphonophore ribbons');bells.finish(group,'Living lantern chains');
  return {group,count:count+chainCount,jellyCount:count,chainCount,update(time,cameraPosition){
    let visible=0;
    for(let i=0;i<count;i++){
      const d=data[i];
      if(cameraPosition&&(Math.abs(d.y-cameraPosition.y)>150||Math.hypot(d.x-cameraPosition.x,d.z-cameraPosition.z)>145))continue;
      dummy.position.set(d.x+Math.sin(time*.08+d.phase)*1.6,d.y+Math.sin(time*.21+d.phase)*1.2,d.z);
      dummy.rotation.set(.05*Math.sin(time*.2+d.phase),d.phase+time*.01,0);dummy.scale.setScalar(d.size);dummy.updateMatrix();jellies.setMatrixAt(visible++,dummy.matrix);
    }
    jellies.count=visible;
    jellies.instanceMatrix.needsUpdate=true;
  }};
}
