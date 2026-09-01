import * as THREE from 'three';
import { FIELD_NOTES, projectWildlife, sightlineClear, wildlifeState, readJournal, recordObservation, followFraming } from './FieldNotes.js';
import { U } from '../core/SharedUniforms.js';
import { smooth } from './OceanDomain.js';

const up=new THREE.Vector3(0,1,0);
const across=new THREE.Vector3(1,0,0);
function readPosition(s){
  if(s.mesh){const p=s.mesh.position;s.x=p.x+s.origin[0];s.y=p.y;s.z=p.z+s.origin[1];}
  else if(s.pose){s.x=s.pose.x;s.y=s.pose.y+(s.centerY||0);s.z=s.pose.z;}
  return s;
}

export function collectWildlife(world) {
  const result=[];
  for(const a of world.fauna.population)result.push(readPosition({...a,id:`fauna-${a.id}`,pose:world.fauna.poses[a.id]}));
  for(const [id,site] of world.sites){
    if(!site.group.visible)continue;
    for(const a of site.life.animals){
      const g=a.mesh.geometry;if(!g.boundingBox)g.computeBoundingBox();
      const size=g.boundingBox.getSize(new THREE.Vector3());
      result.push(readPosition({...a,id:`${id}-${a.type}-${a.index}`,origin:site.habitat.origin,span:Math.max(size.x,size.y,size.z)*a.mesh.scale.x}));
    }
    // A few actual members let the shoal be observed without asking the picker
    // to walk thousands of indistinguishable fish on every UI refresh.
    for(let i=0;i<Math.min(10,site.life.fishData.length);i++){
      const a=site.life.fishData[i];
      result.push(readPosition({...a,id:`${id}-shoal-${i}`,type:'shoal',span:a.scale*2,pose:site.life.schoolMotion.poses[i]}));
    }
  }
  for(const s of world.pelagic.observables||[])if(s.visible)result.push({...s});
  return result;
}

export class WildlifeWatch {
  constructor(expedition) {
    this.exp=expedition;this.app=expedition.app;this.world=expedition.world;
    this.open=false;this.following=false;this.selected=null;this.candidates=[];this.generation=this.world.generation;
    this.forward=new THREE.Vector3();this.right=new THREE.Vector3();this.cameraUp=new THREE.Vector3();
    this.point=new THREE.Vector3();this.destination=new THREE.Vector3();this.matrix=new THREE.Matrix4();this.rotation=new THREE.Quaternion();this.framingRotation=new THREE.Quaternion();
    try{this.storage=window.localStorage;}catch{this.storage=null;}
    this.entries=readJournal(this.storage);
    const panel=document.createElement('aside');panel.id='wildlife-watch';panel.className='wildlife-watch';panel.hidden=true;
    panel.setAttribute('aria-label','Wildlife observation');
    panel.innerHTML=`<div class="watch-heading"><h2 id="watch-name">Look into the water</h2><button id="watch-close" aria-label="Close wildlife observation">×</button></div>
      <p class="watch-status" id="watch-status"></p><p class="watch-note" id="watch-note"></p>
      <div class="watch-actions"><button id="watch-follow" class="lab-button" disabled>Follow animal</button><button id="watch-next" class="lab-quiet" disabled>Next in view</button></div>
      <div class="watch-foot"><span id="watch-record"></span><button id="watch-journal" class="watch-link">Field journal</button></div>`;
    expedition.root.appendChild(panel);this.panel=panel;
    const marker=document.createElement('div');marker.className='watch-marker';marker.hidden=true;marker.setAttribute('aria-hidden','true');expedition.root.appendChild(marker);this.marker=marker;
    this.name=panel.querySelector('#watch-name');this.status=panel.querySelector('#watch-status');this.note=panel.querySelector('#watch-note');
    this.followButton=panel.querySelector('#watch-follow');this.nextButton=panel.querySelector('#watch-next');this.record=panel.querySelector('#watch-record');
    panel.querySelector('#watch-close').onclick=()=>{this.toggle(false);document.getElementById('dive-observe').focus();};
    this.followButton.onclick=()=>this.following?this.stopFollowing():this.startFollowing();
    this.nextButton.onclick=()=>this.next();panel.querySelector('#watch-journal').onclick=()=>this.showJournal();
    const journal=document.createElement('dialog');journal.className='dive-help field-journal';journal.setAttribute('aria-labelledby','journal-title');
    journal.innerHTML=`<button class="guide-close" aria-label="Close field journal" autofocus>×</button><h2 id="journal-title">Field journal</h2><p id="journal-intro"></p><div id="journal-entries"></div><p class="journal-caveat">These are procedural animal groups, with approximate anatomy and scale. Surface excursions and feeding cycles use compressed time. This journal is saved only in this browser.</p><button id="journal-close">Back to the water</button>`;
    document.body.appendChild(journal);this.journal=journal;
    journal.querySelector('.guide-close').onclick=journal.querySelector('#journal-close').onclick=()=>journal.close();
    journal.addEventListener('click',e=>{if(e.target===journal){const r=journal.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)journal.close();}});
    this.canvasDown=null;
    this.app.canvas.addEventListener('pointerdown',e=>{if(this.open)this.canvasDown={x:e.clientX,y:e.clientY};});
    this.app.canvas.addEventListener('pointerup',e=>{
      const p=this.canvasDown;this.canvasDown=null;
      if(!this.open||!p||Math.hypot(e.clientX-p.x,e.clientY-p.y)>6)return;
      const r=this.app.canvas.getBoundingClientRect(),aim={x:(e.clientX-r.left)/r.width*2-1,y:1-(e.clientY-r.top)/r.height*2};
      this.refreshCandidates(aim);
      const picked=this.candidates.find(c=>Math.hypot(c.x-aim.x,c.y-aim.y)<Math.max(.06,c.apparent*.52));
      if(picked)this.select(picked.sample);
    });
  }

  toggle(on=!this.open) {
    this.open=on;this.panel.hidden=!on;this.marker.hidden=true;
    document.body.classList.toggle('observing',on);
    document.getElementById('dive-observe').setAttribute('aria-expanded',String(on));
    if(on){this.exp.toggleLab(false);this.refreshCandidates();this.select(this.candidates[0]?.sample||null);this.update(performance.now());}
    else this.stopFollowing();
  }
  view(){
    const c=this.app.camera,p=c.position;c.getWorldDirection(this.forward);
    this.right.crossVectors(this.forward,up).normalize();this.cameraUp.crossVectors(this.right,this.forward).normalize();
    return {x:p.x,y:p.y,z:p.z,fx:this.forward.x,fy:this.forward.y,fz:this.forward.z,rx:this.right.x,ry:this.right.y,rz:this.right.z,
      ux:this.cameraUp.x,uy:this.cameraUp.y,uz:this.cameraUp.z,tan:Math.tan(c.fov*Math.PI/360),aspect:c.aspect,range:Math.min(95,55*this.world.settings.clarity),
      daylight:(1-U.uDiveNight.value)*(1-smooth(90,220,-p.y)),lamp:U.uLamp.value,glow:this.world.settings.glow};
  }
  refreshCandidates(aim){
    this.samples=collectWildlife(this.world);this.currentView=this.view();
    const rocks=this.world.fauna.motion.rocks.rocks;
    const projected=this.samples.map(s=>projectWildlife(s,this.currentView,aim)).filter(Boolean).sort((a,b)=>a.score-b.score);
    const panel=this.panel.getBoundingClientRect(),canvas=this.app.canvas.getBoundingClientRect();
    this.candidates=projected.slice(0,60).filter(c=>{
      const x=canvas.left+(c.x+1)*canvas.width*.5,y=canvas.top+(1-c.y)*canvas.height*.5;
      if(x>panel.left&&x<panel.right&&y>panel.top&&y<panel.bottom)return false;
      return sightlineClear(this.currentView,c.sample,(x,z)=>this.world.floor(x,z),rocks);
    });
  }
  select(sample){
    this.stopFollowing();this.selected=sample;this.seenSince=0;this.marker.hidden=true;
  }
  next(){
    this.refreshCandidates();const types=new Set(),choices=[];
    for(const c of this.candidates)if(!types.has(c.sample.type)){types.add(c.sample.type);choices.push(c.sample);}
    const order=Object.keys(FIELD_NOTES);choices.sort((a,b)=>order.indexOf(a.type)-order.indexOf(b.type));
    const i=choices.findIndex(s=>s.type===this.selected?.type);
    this.select(choices[(i+1)%choices.length]||null);this.update(performance.now());
  }
  startFollowing(){
    if(!this.selected)return;
    const s=readPosition(this.selected),cam=this.app.camera;
    this.exp.setSwim(false);this.exp.floatAtSurface=false;
    this.point.set(s.x,s.y,s.z);this.offset=cam.position.clone().sub(this.point);
    const desired=followFraming(cam.aspect,s.span).distance;
    this.offset.normalize().multiplyScalar(desired);
    this.offset.y=Math.max(this.offset.y,Math.min(4,desired*.18));
    this.following=true;this.world.shadowDirty=true;this.followButton.textContent='Stop following';this.followButton.setAttribute('aria-pressed','true');
    document.getElementById('dive-drift').setAttribute('aria-pressed','false');
    document.getElementById('dive-keyhint').textContent='Following wildlife · WASD or Swim takes control';
  }
  stopFollowing(){
    if(this.following){
      this.following=false;this.world.shadowDirty=true;this.exp.captureDrift();document.getElementById('dive-drift').setAttribute('aria-pressed',String(!this.app.cine.free));
      document.getElementById('dive-keyhint').textContent='Choose Swim to explore · G world lab · H hide controls';
    }
    this.followButton.textContent='Follow animal';this.followButton.setAttribute('aria-pressed','false');
  }
  updateCamera(dt){
    if(!this.following||!this.selected)return false;
    const s=readPosition(this.selected),cam=this.app.camera;
    this.point.set(s.x,s.y,s.z);
    if(cam.position.distanceTo(this.point)>120){this.stopFollowing();return false;}
    const framing=followFraming(cam.aspect,s.span),length=this.offset.length();
    if(length>.01)this.offset.multiplyScalar(1+(framing.distance/length-1)*(1-Math.exp(-dt*.8)));
    this.destination.copy(this.point).add(this.offset);
    const step=this.destination.clone().sub(cam.position).multiplyScalar(1-Math.exp(-dt*.85));
    step.clampLength(0,dt*7);cam.position.add(step);
    this.exp.constrain(cam.position);this.world.fauna.motion.rocks.project(cam.position,1.05);
    this.exp.constrain(cam.position);
    this.matrix.lookAt(cam.position,this.point,up);this.rotation.setFromRotationMatrix(this.matrix);
    this.rotation.multiply(this.framingRotation.setFromAxisAngle(across,framing.pitch));
    cam.quaternion.slerp(this.rotation,1-Math.exp(-dt*2.3));
    cam.fov+=(45-cam.fov)*(1-Math.exp(-dt*1.5));cam.updateProjectionMatrix();
    this.app.cine._smoothPos.copy(cam.position);this.app.cine._smoothLook.copy(this.point);
    return true;
  }
  update(now){
    if(this.generation!==this.world.generation){this.generation=this.world.generation;this.select(null);}
    if(!this.open)return;
    if(document.querySelector('dialog[open]')){this.seenSince=0;this.marker.hidden=true;return;}
    this.refreshCandidates();
    if(this.selected){this.selected=this.samples.find(s=>s.id===this.selected.id)||null;if(!this.selected)this.stopFollowing();}
    if(!this.selected&&this.candidates.length)this.select(this.candidates[0].sample);
    const s=this.selected,candidate=this.candidates.find(c=>c.sample.id===s?.id);
    this.nextButton.disabled=this.candidates.length===0;
    // A known animal can be followed after briefly leaving the frame. Only new
    // identification and journal entries require a currently clear sightline.
    this.followButton.disabled=!this.following&&(!s||Math.hypot(s.x-this.currentView.x,s.y-this.currentView.y,s.z-this.currentView.z)>this.currentView.range+15);
    this.marker.hidden=!candidate;
    if(candidate){this.marker.style.left=`${(candidate.x+1)*50}%`;this.marker.style.top=`${(1-candidate.y)*50}%`;}
    if(s){
      const [name,group,note]=FIELD_NOTES[s.type];
      this.name.textContent=name;this.note.textContent=note;
      const dist=Math.hypot(s.x-this.currentView.x,s.y-this.currentView.y,s.z-this.currentView.z);
      this.status.textContent=`${candidate?wildlifeState(s):'Out of view'} · ${dist.toFixed(1)} m away`;
      this.panel.dataset.animal=s.type;this.panel.dataset.following=String(this.following);
      if(candidate){
        if(!this.seenSince)this.seenSince=now;
        if(now-this.seenSince>900)recordObservation(this.entries,s,this.world.seed,Math.max(0,-s.y),this.storage);
      }else this.seenSince=0;
      this.record.textContent=this.entries.some(n=>n.type===s.type)?`${group} · Recorded`:`${group} · Observing…`;
    }else{
      this.name.textContent='No animal in view';this.status.textContent='Observe what is in front of you.';
      this.note.textContent=this.world.settings.shoal===0?'This world has no animals. Increase Animal abundance in World lab → Life.':
        this.app.camera.position.y>0?'Dive below the surface to find wildlife.':
        this.currentView.daylight<.08&&this.currentView.lamp<.1?'Switch on the dive light to see nearby animals, or look for bioluminescence.':
        'Choose Swim and look around, or visit another habitat. While observing, you can tap an animal to select it.';
      this.record.textContent='';this.panel.dataset.animal='';this.panel.dataset.following='false';
    }
    document.getElementById('journal-count').textContent=this.entries.length?`Field journal · ${this.entries.length} observed`:'Open field journal';
  }
  showJournal(){
    this.app.cine.keys.clear();
    const list=this.journal.querySelector('#journal-entries');list.replaceChildren();
    this.journal.querySelector('#journal-intro').textContent=this.entries.length?`${this.entries.length} animal ${this.entries.length===1?'group':'groups'} observed. Keep looking: small details become visible when you slow down.`:'Your observations will appear here. Choose Observe, keep an animal in view for a moment, and it will be recorded automatically.';
    for(const entry of this.entries){
      const [name,group,note,source]=FIELD_NOTES[entry.type],item=document.createElement('article');
      const heading=document.createElement('h3');heading.textContent=name;
      const meta=document.createElement('p');meta.className='journal-meta';meta.textContent=`${group} · First seen at ${entry.depth.toLocaleString()} m · Seed ${entry.seed}`;
      const text=document.createElement('p');text.textContent=note;item.append(heading,meta,text);
      if(source){const link=document.createElement('a');link.href=source;link.target='_blank';link.rel='noopener';link.textContent='Natural history';item.appendChild(link);}
      list.appendChild(item);
    }
    this.journal.showModal();
  }
}
