import * as THREE from 'three';
import { seeded, TAU } from './WorldMath.js';
import { oceanFloor } from './OceanDomain.js';
import { BIOME_CELL, biomeAt, cellSeed, nearbyCells } from './BiomeLayout.js';
import { createBiomeForm, highestSurfaceAt } from './ReefGeometry.js';
import { waterMaterial } from './UnderwaterMaterial.js';

const coralColors=['#b7996b','#c4b49b','#b28c77','#968a9b','#8c9473','#ad8b7e'];

export function growBiomeCell(cx,cz,recipe,forms) {
  const rng=seeded(cellSeed(cx,cz,recipe.seed,72013)),instances=[],rocks=[],vents=[];
  const life=recipe.life??1,relief=.5+(recipe.relief??1)*.5;
  const put=(type,variant,x,y,z,sx,sy=sx,sz=sx,color='#ffffff',rotation=rng()*TAU)=>{
    const item={type,variant,key:`${type}:${variant}`,x,y,z,sx,sy,sz,color,rotation};instances.push(item);return item;
  };
  for(let iz=0;iz<8;iz++)for(let ix=0;ix<8;ix++){
    const x=(cx+(ix+.15+rng()*.7)/8)*BIOME_CELL,z=(cz+(iz+.15+rng()*.7)/8)*BIOME_CELL;
    const b=biomeAt(x,z,recipe);if(!b.inside||rng()>b.outer)continue;
    const y=b.y,shallow=b.reef+b.kelp,variant=Math.floor(rng()*4);
    let anchor=null;
    if(rng()<.22+b.coral*.45+b.canopy*.20+b.deep*.12){
      const r=(.6+rng()**2*3.2)*relief,sy=r*(b.deep>.5?.5:.65),sx=r*1.35,sz=r,rotation=rng()*TAU;
      const stone=put('rock',variant,x,y-sy*.25,z,sx,sy,sz,b.deep>.5?'#7b7d73':'#9a9c87',rotation);
      const form=forms('rock',variant),bounds=form.geometry.boundingBox;
      const co=Math.cos(rotation),si=Math.sin(rotation),rx=(bounds.max.x-bounds.min.x)/2*sx,rz=(bounds.max.z-bounds.min.z)/2*sz;
      const feedingPoints=form.anchors.map(p=>({x:x+p.x*sx*co+p.z*sz*si,y:stone.y+p.y*sy,z:z-p.x*sx*si+p.z*sz*co}));
      rocks.push({x,y:stone.y,z,rx:Math.abs(co)*rx+Math.abs(si)*rz,ry:(bounds.max.y-bounds.min.y)/2*sy,rz:Math.abs(si)*rx+Math.abs(co)*rz,feedingPoints});
      anchor=feedingPoints;
    }
    const expected=b.coral*life*(.80+(anchor?.length?3.2:0));
    const colonies=Math.floor(expected)+(rng()<expected%1?1:0);
    for(let c=0;c<colonies;c++){
      const p=anchor?.[c%anchor.length]||{x:x+(rng()-.5)*2,y,z:z+(rng()-.5)*2};
      if(!anchor)p.y=oceanFloor(p.x,p.z,recipe);
      const style=rng(),type=style<.43?'coral':style<.63?'fan':style<.84?'plate':'brain',s=.45+rng()**.7*1.45;
      put(type,variant,p.x,p.y-.012+(type==='brain'?s*.23:0),p.z,s,s*(type==='brain'?.43:1),s,coralColors[Math.floor(rng()*coralColors.length)]);
    }
    if(rng()<b.canopy*life*.48){
      const height=Math.min(-y-1.7,(19+rng()*13)*(recipe.height??1));
      put('kelp',variant,x,y,z,.75+rng()*.65,height/24,.8+rng()*.5);
    }
    if(shallow>.5&&rng()<life*.47){
      const xx=x+3.2,zz=z+1.8;
      put('algae',variant%2,xx,oceanFloor(xx,zz,recipe),zz,.55+rng()*.65);
    }
    if(rng()<b.meadow*life*.85){
      for(let j=0;j<5;j++){
        const a=rng()*TAU,r=Math.sqrt(rng())*2.2,xx=x+Math.cos(a)*r,zz=z+Math.sin(a)*r;
        put('grass',variant%2,xx,oceanFloor(xx,zz,recipe)-.015,zz,.65+rng()*.75);
      }
    }
    if(shallow<.25&&rng()<life*(b.deep>.5?.13:.26)){
      const xx=x+3,zz=z-2;
      put('fan',variant,xx,oceanFloor(xx,zz,recipe),zz,.45+rng()*.95,1+rng()*.8,.55,'#b8b4a0');
    }
    if(b.depth>55&&b.depth<600&&rng()<.035){
      const h=(5+rng()*13)*relief;
      put('rock',variant,x,y+h*.20,z,3+rng()*3,h*.65,3+rng()*3,'#7b8580');
      rocks.push({x,y:y+h*.20,z,rx:6.5,ry:h*.8,rz:6.5,feedingPoints:[]});
    }
    if(rng()<b.vents*.8){
      const height=2.3+rng()*5.5,scale=.65+rng()*.6;
      put('chimney',variant,x,y-.08,z,scale,height/5,scale,'#a3a18f');
      rocks.push({x,y:y+height*.45,z,rx:scale*1.2,ry:height*.56,rz:scale*1.2,feedingPoints:[]});
      vents.push([x,y+height,z]);
      for(let j=0;j<Math.round(6*life);j++){
        const a=rng()*TAU,r=1.1+rng()*2.4,xx=x+Math.cos(a)*r,zz=z+Math.sin(a)*r;
        put('worms',variant%2,xx,oceanFloor(xx,zz,recipe),zz,.7+rng()*.7);
      }
    }
  }
  return {key:`${cx},${cz}`,x:cx,z:cz,instances,rocks,vents};
}

export class BiomeScenery {
  constructor(recipe) {
    this.recipe=recipe;this.group=new THREE.Group();this.group.name='Living biomes';
    this.cells=new Map();this.forms=new Map();this.pools=new Map();this.rocks=[];this.vents=[];
    this.last=new THREE.Vector3(1e7,1e7,1e7);this.focusKey=null;this.revision=0;this.visibleInstances=0;
    this.dummy=new THREE.Object3D();this.color=new THREE.Color();this.range=190;
  }
  form(type,variant) {
    const key=`${type}:${variant}`;
    if(!this.forms.has(key)){
      const form=createBiomeForm(type,variant);form.geometry.computeBoundingBox();
      if(type==='rock')form.anchors=[[0,0],[.40,.20],[-.40,-.20],[.30,-.43],[-.30,.43],[.60,-.1],[-.60,.1]].map(([x,z])=>({x,y:highestSurfaceAt(form.geometry,x,z,0),z}));
      this.forms.set(key,form);
    }
    return this.forms.get(key);
  }
  update(position) {
    const wanted=nearbyCells(position),key=`${Math.floor(position.x/BIOME_CELL)},${Math.floor(position.z/BIOME_CELL)}`;
    let changed=false;
    if(this.focusKey!==key){
      const keep=new Set(wanted.map(c=>c.key));
      for(const c of wanted)if(!this.cells.has(c.key))this.cells.set(c.key,growBiomeCell(c.x,c.z,this.recipe,(t,v)=>this.form(t,v)));
      for(const k of this.cells.keys())if(!keep.has(k))this.cells.delete(k);
      this.rocks=[...this.cells.values()].flatMap(c=>c.rocks);this.vents=[...this.cells.values()].flatMap(c=>c.vents);
      this.focusKey=key;this.revision++;changed=true;
    }
    if(changed||this.packedRange!==this.range||this.last.distanceToSquared(position)>100){this.pack(position);this.last.copy(position);this.packedRange=this.range;}
    return changed;
  }
  pack(position) {
    const groups=new Map();this.visibleInstances=0;
    for(const cell of this.cells.values())for(const item of cell.instances){
      const reach=item.type==='kelp'?28:Math.max(item.sx,item.sy,item.sz)*2;
      const range=this.detailRange(item.type);
      if(Math.hypot(item.x-position.x,item.y+reach*.4-position.y,item.z-position.z)>range+reach+12)continue;
      let list=groups.get(item.key);if(!list)groups.set(item.key,list=[]);list.push(item);
    }
    for(const [key,pool] of this.pools)if(!groups.has(key)){pool.mesh.count=0;pool.mesh.visible=false;}
    for(const [key,items] of groups){
      let pool=this.pools.get(key);
      if(!pool||pool.capacity<items.length){
        const form=this.form(items[0].type,items[0].variant),capacity=2**Math.ceil(Math.log2(Math.max(64,items.length)));
        const material=pool?.mesh.material||waterMaterial(form.kind,{name:`biome-${key}`,pattern:form.pattern,biome:true});
        material.uniforms.uSceneryRange={value:this.detailRange(items[0].type)};
        if(pool){this.group.remove(pool.mesh);pool.mesh.dispose();}
        const mesh=new THREE.InstancedMesh(form.geometry,material,capacity);mesh.name=`Biome ${key}`;mesh.frustumCulled=false;
        pool={mesh,capacity};this.pools.set(key,pool);this.group.add(mesh);
      }
      let count=0;pool.mesh.visible=true;
      pool.mesh.material.uniforms.uSceneryRange.value=this.detailRange(items[0].type);
      for(const item of items){
        this.dummy.position.set(item.x,item.y,item.z);this.dummy.scale.set(item.sx,item.sy,item.sz);this.dummy.rotation.set(0,item.rotation,0);this.dummy.updateMatrix();
        pool.mesh.setMatrixAt(count,this.dummy.matrix);pool.mesh.setColorAt(count,this.color.set(item.color));count++;
      }
      pool.mesh.count=count;pool.mesh.instanceMatrix.needsUpdate=true;pool.mesh.instanceColor.needsUpdate=true;this.visibleInstances+=count;
    }
  }
  detailRange(type) {
    const extent=type==='grass'?82:type==='algae'?105:type==='worms'?120:['coral','fan','plate','brain'].includes(type)?155:190;
    return extent*this.range/190;
  }
}
