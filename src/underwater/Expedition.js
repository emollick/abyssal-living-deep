import * as THREE from 'three';
import { U } from '../core/SharedUniforms.js';
import { CONDITIONS } from '../ui/Sandbox.js';
import { HABITATS, GENERATOR_DEFAULTS, parseSeed } from './WorldMath.js';
import { constrainToOcean, transectPose, routeBetween, travelSpeed, depthZone, smooth } from './OceanDomain.js';
import './expedition.css';

const icons = {
  lab: '<path d="M3 5h14M3 10h14M3 15h14M7 3v4M13 8v4M8 13v4"/>',
  up: '<path d="M10 16V4m-5 5 5-5 5 5"/>',
  pause: '<path d="M7 4v12M13 4v12"/>',
  camera: '<path d="M3 6h4l1-2h4l1 2h4v10H3z"/><circle cx="10" cy="11" r="3"/>',
  sound: '<path d="m3 8 3 0 4-4v12l-4-4H3zm10-2q5 4 0 8"/>',
  lamp: '<path d="m7 4 7 3-4 10-7-3zM13 5l3-2m-1 5 3-1m-8-3 1-3"/>',
};
const icon = name => `<svg viewBox="0 0 20 20" aria-hidden="true">${icons[name] || ''}</svg>`;
const $ = id => document.getElementById(id);

export class Expedition {
  constructor(app) {
    this.app=app;this.world=app.underwater;this.active=false;this.started=app.time;
    this.surfacePost={...app.post.settings};this.weatherMode='day';this.dials={};this.lastReadout=0;
    this.lampMode='auto';this.travel=null;this.driftPose=null;this.lookTarget=new THREE.Vector3();this.viewQuaternion=new THREE.Quaternion();this.viewMatrix=new THREE.Matrix4();this.up=new THREE.Vector3(0,1,0);
    this.buildUI();this.bindKeys();
    const after=app.afterUpdate;
    app.afterUpdate=(scaled,dt)=>{after?.(scaled,dt);this.updateUI(scaled,dt);};
    this.setWeather(app.params.get('light')||'day',true);
    const custom={};
    const weatherRanges={sunElevation:[-0.35,1.40],sunAzimuth:[-6.29,6.29],sunIntensity:[0,40],cloudCoverage:[0,1],cloudDensity:[0,2],cloudBottom:[250,5000],cloudTop:[600,15000],cloudAnvil:[0,1],windSpeed:[0,60],windAngle:[-6.29,6.29],gustiness:[0,1],swellHs:[0,22],swellAngle:[-6.29,6.29],swellPeriod:[3,30],storm:[0,1],rain:[0,1],fog:[0,1],spray:[0,2],lightningRate:[0,3],turbidity:[1,14],mieG:[0,0.95],choppiness:[0,2.5],amplitude:[0,2],spread:[0,2],starIntensity:[0,2],foamStrength:[0,3]};
    this.weatherRanges=weatherRanges;
    for(const [key,[min,max]] of Object.entries(weatherRanges)) {
      if(app.params.has(key)&&Number.isFinite(+app.params.get(key)))custom[key]=Math.max(min,Math.min(max,+app.params.get(key)));
    }
    if(Object.keys(custom).length){app.weather.set(custom,true);this.weatherMode='custom';}
    this.enterDive();
    if(app.params.has('depth')&&Number.isFinite(+app.params.get('depth'))){const pose=transectPose(+app.params.get('depth'),this.world.recipe);this.resetView(pose);}
    if(app.params.get('surface')==='1'){const h=this.world.habitat;this.resetView({eye:[h.eye[0],9,h.eye[2]],look:[h.look[0],1,h.look[2]-100]});}
    if(app.params.get('lab')==='1')this.toggleLab(true);
    if(app.params.get('still')==='1'||matchMedia('(prefers-reduced-motion: reduce)').matches)this.setSwim(true);
    this.syncDials();
    this.writeURL();
  }

  buildUI() {
    const root=document.createElement('div');root.id='expedition';
    root.innerHTML=`
      <div class="dive-shade"></div>
      <header class="dive-header">
        <div class="dive-brand"><span class="dive-wordmark">ABYSSAL</span><span class="dive-edition">THE LIVING DEEP<br>PROCEDURAL OCEAN EXPLORER</span></div>
        <nav class="dive-actions" aria-label="Explorer tools">
          <button class="dive-action" id="dive-surface" aria-label="Ascend to the surface">${icon('up')}<span>Ascend</span></button>
          <button class="dive-action" id="dive-descend" aria-label="Descend to the abyss"><span aria-hidden="true">↓</span><span>Descend</span></button>
          <button class="dive-action" id="dive-lab-toggle" aria-expanded="false" aria-controls="dive-lab">${icon('lab')}<span>World lab</span></button>
          <button class="dive-action help-action" id="dive-help-toggle" aria-label="Help and credits">?</button>
        </nav>
      </header>
      <div class="dive-status"><b></b><span id="dive-status-text">LIVING WORLD · SEED 713</span></div>
      <div class="dive-journey" id="dive-journey" hidden><span id="journey-label"></span><button id="journey-stop">Stop here</button><progress id="journey-progress" max="1" value="0" aria-label="Journey progress"></progress></div>
      <section class="dive-caption" aria-label="Current dive site"><div class="dive-eyebrow" id="dive-site-label">01 / THE SUNLIT ZONE</div><h1 id="dive-title">Coral cathedral</h1><p id="dive-subtitle">A world beneath the waves.</p><div class="dive-fauna" id="fauna-readout" aria-label="Nearby animal life"></div></section>
      <div class="dive-depth"><strong id="dive-depth-value">13.0</strong> m<small id="depth-reference">BELOW THE SURFACE</small><nav class="depth-stops" aria-label="Depth stops">${[[0,'Surface'],[200,'Twilight'],[600,'Lower twilight'],[1000,'Midnight'],[1419,'The abyss']].map(([d,l])=>`<button data-depth="${d}" aria-label="Travel to ${d===0?'the surface':`${d} metres`}"><i></i><span>${d===0?'0':d.toLocaleString()}<small>${l}</small></span></button>`).join('')}</nav></div>
      <footer class="dive-bottom">
        <nav class="dive-sites" aria-label="Dive sites">${HABITATS.map(h=>`<button class="dive-site" data-site="${h.id}" aria-label="Visit ${h.name}" aria-pressed="${h.id==='reef'}"><span class="site-number">${h.number}</span><span class="site-name">${h.short}</span></button>`).join('')}</nav>
        <div class="dive-transport"><div class="dive-transport-buttons">
          <button class="dive-action" id="dive-drift" aria-pressed="true">Drift</button>
          <button class="dive-action" id="dive-swim" aria-pressed="false">Swim</button>
          <button class="dive-action" id="dive-pause" aria-label="Pause simulation" title="Pause simulation (P)">${icon('pause')}</button>
          <button class="dive-action" id="dive-lamp" aria-label="Dive light" aria-pressed="false" title="Dive light (L)">${icon('lamp')}</button>
          <button class="dive-action" id="dive-photo" aria-label="Save a photograph" title="Save a photograph">${icon('camera')}</button>
        </div><span class="dive-keyhint" id="dive-keyhint">Choose <kbd>Swim</kbd> to explore · <kbd>G</kbd> world lab · <kbd>H</kbd> hide controls</span></div>
      </footer>
      <aside class="dive-lab" id="dive-lab" aria-label="Procedural world lab" hidden>
        <h2>One living ocean.</h2><p class="dive-lab-intro">One seed grows the reef, the forest and the entire trench. Travel between them without leaving the water.</p>
        <label for="world-seed">World seed</label><div class="dive-seed-row"><input id="world-seed" type="text" value="713" maxlength="40" spellcheck="false" aria-label="World seed"><button id="grow-seed" class="lab-button">Generate</button></div>
        <div class="lab-button-row"><button id="new-seed" class="lab-quiet">↻ New seed</button><button id="share-world" class="lab-quiet">Copy world link</button></div>
        <h3>SHAPE & LIFE</h3><div id="generator-dials"></div>
        <h3>ANIMAL COMMUNITIES</h3><div id="fauna-dials"></div><p class="lab-note">Animal abundance scales the whole population. Hunters, bottom dwellers and jellies shape its balance. Nearby animals are named beside the dive title.</p>
        <details class="lab-more"><summary>Life by depth</summary><p class="lab-note"><strong>Reef & forest</strong><br>Butterflyfish, parrotfish, sharks and seals; octopuses, crabs, sea stars and urchins on the bottom.</p><p class="lab-note"><strong>Open water</strong><br>Whales, dolphins, tuna, sunfish, rays and squid.</p><p class="lab-note"><strong>Twilight</strong><br>Lanternfish and hatchetfish give way to vampire squid, dragonfish and midwater shrimp.</p><p class="lab-note"><strong>Midnight & seafloor</strong><br>Anglerfish, gulper eels and flapjack octopuses above isopods, brittle stars, sea cucumbers, sea pens and vent shrimp.</p><p class="lab-note">Some small animals are enlarged. These habitats combine species from different oceans for exploration.</p></details>
        <h3>THROUGH THE WATER</h3><div id="water-dials"></div>
        <h3>FROM THE DEEP</h3><div id="deep-dials"></div><button id="seafloor-tremor" class="lab-button lab-wide">Trigger a seafloor tremor</button><p class="lab-note">Deep upwelling feeds a green surface bloom, luminous at night. A tremor stirs the bottom and sends a wave out across the sea.</p><p class="lab-stat" id="coupling-status"></p>
        <h3>WEATHER ABOVE</h3><div class="lab-weather">${[['day','Day'],['dusk','Dusk'],['storm','Storm'],['night','Night']].map(([id,label])=>`<button data-weather="${id}" aria-pressed="${id==='day'}">${label}</button>`).join('')}</div><div id="weather-dials"></div>
        <details class="lab-more"><summary>More weather dials</summary><div id="weather-more"></div></details>
        <p class="lab-note" id="weather-depth-note">Storms carry motion and suspended particles into the shallows. Their energy fades with depth; the deep continues on its own currents.</p><div class="lab-events" aria-label="Ocean events">${[['rogue','Rogue wave'],['whirlpool','Whirlpool'],['tsunami','Tsunami'],['lightning','Lightning'],['waterspout','Waterspout'],['hurricane','Hurricane']].map(([id,label])=>`<button data-event="${id}" class="lab-quiet">${label}</button>`).join('')}<button id="clear-ocean-events" class="lab-quiet">Clear events</button></div>
        <h3>VIEW</h3><button id="float-waterline" class="lab-quiet lab-wide">Float at the waterline</button><label for="dive-quality" style="display:block;margin-top:18px">Rendering quality</label><select id="dive-quality"><option value="auto">Automatic</option><option value="high">High</option><option value="ultra">Ultra</option><option value="medium">Medium</option><option value="low">Low</option><option value="potato">Lightest</option></select>
        <div class="lab-finish"><p class="lab-stat" id="world-stats"></p><p class="lab-stat" id="world-performance"></p><p class="lab-note">The same seed and dials reproduce the same world. Geometry dials rebuild when you release them.</p><div class="lab-button-row" style="margin-top:14px"><button class="lab-quiet" id="reset-world">Reset recipe</button><button class="lab-quiet" id="lab-help">Controls & credits</button></div></div>
      </aside>
      <div class="dive-mobile" aria-label="Swimming controls"><button data-move="KeyW" aria-label="Swim forward">↑</button><button data-move="KeyE" aria-label="Swim up">＋</button><button data-move="KeyS" aria-label="Swim backward">↓</button><button data-move="KeyQ" aria-label="Swim down">−</button></div>
      <div class="dive-toast" id="dive-toast" role="status"></div>
      <button class="show-dive-ui" id="show-dive-ui">Show controls · H</button>
    `;
    document.body.appendChild(root);this.root=root;
    const guide=document.createElement('dialog');guide.className='dive-help';guide.id='dive-guide';
    guide.innerHTML=`<h2>Sky to abyss.</h2><p>This is one continuous ocean. Ascend vertically into the air, descend along the continental slope, or choose a depth stop. The four habitats are places in the same world. Stop a journey anywhere and take control.</p><dl><dt>Ascend / Descend</dt><dd>Travel to the surface or the 1,400-metre trench</dd><dt>W A S D</dt><dd>Swim in the direction you look</dd><dt>Drag</dt><dd>Look around; wheel to zoom</dd><dt>Q / E</dt><dd>Swim down / up, through the waterline</dd><dt>Shift</dt><dd>Move faster</dd><dt>1 – 4</dt><dd>Travel to a habitat</dd><dt>G / R</dt><dd>World lab / new seed</dd><dt>F / P / H</dt><dd>Swim or drift / pause / hide controls</dd><dt>L</dt><dd>Override the automatic deep-water light</dd></dl><p>Weather remains active at every depth. Waves, rain and storms stir the upper ocean; their motion fades as you descend. Deep upwelling carries nutrients into a surface bloom. Trigger a seafloor tremor and watch its expanding wave from above or below.</p><p>On touchscreens, drag to look and use the swimming buttons. Desktop graphics are recommended; lower the quality if your device struggles.</p><p>Everything is generated here. Travel speeds and transport times are compressed for exploration. This is an artistic simulation, not a predictive oceanographic model.</p><p>Built on <a href="https://github.com/Token-Gremlin/natural-disasters" target="_blank" rel="noopener">ABYSSAL by Token-Gremlin</a>, preserving its FFT ocean, atmosphere and extreme weather. MIT licensed.</p><button id="close-dive-guide">Back to the water</button>`;
    document.body.appendChild(guide);this.guide=guide;
    guide.setAttribute('aria-labelledby','dive-guide-title');guide.querySelector('h2').id='dive-guide-title';
    const guideClose=document.createElement('button');guideClose.className='guide-close';guideClose.textContent='×';guideClose.setAttribute('aria-label','Close help');guideClose.autofocus=true;guideClose.onclick=()=>guide.close();guide.prepend(guideClose);
    $('dive-surface').onclick=()=>this.surface();$('dive-descend').onclick=()=>this.visit('deep');$('dive-lab-toggle').onclick=()=>this.toggleLab();
    $('journey-stop').onclick=()=>this.setSwim(true);
    $('float-waterline').onclick=()=>this.waterline();
    root.querySelectorAll('[data-depth]').forEach(b=>b.onclick=()=>+b.dataset.depth===0?this.surface():this.travelTo(transectPose(+b.dataset.depth,this.world.recipe),`${(+b.dataset.depth).toLocaleString()} m`));
    $('seafloor-tremor').onclick=()=>{this.world.tremor();this.toast('The seabed shifts. A wave is travelling to the surface.');};
    root.querySelectorAll('[data-event]').forEach(b=>b.onclick=()=>this.triggerEvent(b.dataset.event));
    $('clear-ocean-events').onclick=()=>{this.app.director.clearEvents();this.world.dynamics.pulseStrength=0;this.toast('Ocean events cleared.');};
    $('dive-help-toggle').onclick=$('lab-help').onclick=()=>guide.showModal();$('close-dive-guide').onclick=()=>guide.close();
    guide.addEventListener('click',e=>{if(e.target===guide){const r=guide.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)guide.close();}});
    root.querySelectorAll('[data-site]').forEach(b=>b.onclick=()=>this.visit(b.dataset.site));
    root.querySelectorAll('[data-weather]').forEach(b=>b.onclick=()=>this.setWeather(b.dataset.weather));
    $('dive-drift').onclick=()=>this.setSwim(false);$('dive-swim').onclick=()=>this.setSwim(true);
    $('dive-pause').onclick=()=>this.pause();$('dive-lamp').onclick=()=>this.lamp();$('dive-photo').onclick=()=>this.photograph();
    $('grow-seed').onclick=()=>this.regenerate(parseSeed($('world-seed').value));
    $('world-seed').addEventListener('keydown',e=>{if(e.key==='Enter')this.regenerate(parseSeed(e.target.value));});
    $('new-seed').onclick=()=>this.newSeed();$('reset-world').onclick=()=>{this.world.settings={...GENERATOR_DEFAULTS};this.regenerate(713);this.syncDials();};
    $('share-world').onclick=()=>this.share();$('show-dive-ui').onclick=()=>this.setControlsHidden(false);
    $('dive-quality').value=this.app.quality.adaptive?'auto':this.app.quality.presetName;
    $('dive-quality').onchange=e=>{const auto=e.target.value==='auto';this.app.quality.adaptive=auto;if(!auto)this.app.setQualityPreset(e.target.value);this.writeURL();};
    const shape=[['relief','Terrain relief',0.2,2.2],['life','Living cover',0,1.8],['height','Kelp height',0.3,1.4],['shoal','Animal abundance',0,2]];
    const water=[['clarity','Water clarity',0.35,2],['current','Current strength',0,3],['glow','Bioluminescence',0,3]];
    for(const [key,label,min,max] of shape)this.addDial('generator-dials',key,label,min,max,0.05,false);
    for(const [key,label] of [['predators','Hunters'],['benthos','Bottom dwellers'],['jellies','Jellies & drifters']])this.addDial('fauna-dials',key,label,0,2,.05,false);
    for(const [key,label,min,max] of water)this.addDial('water-dials',key,label,min,max,0.05,true);
    this.addDial('deep-dials','upwelling','Deep upwelling',0,3,0.05,true);
    for(const [key,label,min,max,step] of [['sunElevation','Sun elevation',-20,80,1],['cloudCoverage','Cloud cover',0,1,0.01],['windSpeed','Wind speed',0,60,0.5],['swellHs','Swell height',0,22,0.1],['storm','Storm intensity',0,1,0.05]])this.addDial('weather-dials',key,label,min,max,step,true,true);
    for(const [key,label,min,max,step] of [['sunAzimuth','Sun direction',-180,180,1],['windAngle','Wind direction',-180,180,1],['swellAngle','Swell direction',-180,180,1],['swellPeriod','Swell period',3,30,.5],['choppiness','Wave choppiness',0,2.5,.05],['amplitude','Wave amplitude',0,2,.05],['rain','Rainfall',0,1,.05],['fog','Atmospheric haze',0,1,.05],['cloudDensity','Cloud density',0,2,.05]])this.addDial('weather-more',key,label,min,max,step,true,true);
    root.querySelectorAll('[data-move]').forEach(b=>{
      b.addEventListener('pointerdown',e=>{e.preventDefault();this.setSwim(true);this.app.cine.keys.add(b.dataset.move);b.setPointerCapture(e.pointerId);});
      const end=()=>this.app.cine.keys.delete(b.dataset.move);
      b.addEventListener('pointerup',end);b.addEventListener('pointercancel',end);b.addEventListener('lostpointercapture',end);
    });
  }

  addDial(parent,key,label,min,max,step,live,weather=false) {
    const row=document.createElement('div');row.className='dial';
    row.innerHTML=`<div class="dial-heading"><label for="dial-${key}">${label}</label><output id="out-${key}" for="dial-${key}"></output></div><input id="dial-${key}" aria-label="${label}" type="range" min="${min}" max="${max}" step="${step}">`;
    $(parent).appendChild(row);const input=$(`dial-${key}`),out=$(`out-${key}`);
    const angle=['sunElevation','sunAzimuth','windAngle','swellAngle'].includes(key);
    const fmt=v=>angle?`${v.toFixed(0)}°`:key==='windSpeed'?`${v.toFixed(1)} m/s`:key==='swellHs'?`${v.toFixed(1)} m`:key==='swellPeriod'?`${v.toFixed(1)} s`:weather?`${Math.round(v*100)}%`:`${v.toFixed(2)}×`;
    const apply=()=>{
      const value=+input.value;out.textContent=fmt(value);
      if(weather){this.app.weather.set({[key]:angle?value*Math.PI/180:value});this.weatherMode='custom';this.syncWeatherButtons();}
      else this.world.settings[key]=value;
      if(live)this.writeURL();
    };
    input.addEventListener('input',apply);
    const commit=()=>{apply();if(!live)this.regenerate(this.world.seed,false);};
    input.addEventListener('change',commit);
    // Explicit pointer/keyboard handling keeps the dials consistent in embedded
    // browsers, where native range dragging can otherwise lose its capture.
    let dragging=false;
    const point=e=>{
      const bounds=input.getBoundingClientRect();
      const t=Math.max(0,Math.min(1,(e.clientX-bounds.left-5)/Math.max(1,bounds.width-10)));
      input.value=Math.max(min,Math.min(max,min+Math.round(t*(max-min)/step)*step));apply();
    };
    input.addEventListener('pointerdown',e=>{if(input.disabled)return;e.preventDefault();input.focus();dragging=true;input.setPointerCapture(e.pointerId);point(e);});
    input.addEventListener('pointermove',e=>{if(dragging)point(e);});
    const finish=e=>{if(!dragging)return;dragging=false;try{input.releasePointerCapture(e.pointerId);}catch{}commit();};
    input.addEventListener('pointerup',finish);input.addEventListener('pointercancel',finish);
    input.addEventListener('keydown',e=>{
      const delta={ArrowLeft:-step,ArrowDown:-step,ArrowRight:step,ArrowUp:step,PageDown:-step*10,PageUp:step*10};
      if(!(e.key in delta)&&e.key!=='Home'&&e.key!=='End')return;
      e.preventDefault();input.value=e.key==='Home'?min:e.key==='End'?max:Math.max(min,Math.min(max,+input.value+delta[e.key]));commit();
    });
    this.dials[key]={input,out,fmt,weather,angle};
  }

  bindKeys() {
    window.addEventListener('keydown',e=>{
      if(!this.active)return;
      if(this.guide.open)return;
      if(e.target.matches?.('input,textarea,select,button')||e.code==='Tab')return;
      if(e.repeat&&['KeyG','KeyR','KeyH','KeyP','KeyL','KeyF'].includes(e.code))return;
      const actions={KeyG:()=>this.toggleLab(),KeyR:()=>this.newSeed(),KeyH:()=>this.setControlsHidden(!document.body.classList.contains('dive-clean')),KeyP:()=>this.pause(),KeyF:()=>this.setSwim(!this.app.cine.free),KeyL:()=>this.lamp(),Slash:()=>this.guide.showModal(),Digit1:()=>this.visit('reef'),Digit2:()=>this.visit('kelp'),Digit3:()=>this.visit('blue'),Digit4:()=>this.visit('deep'),Escape:()=>this.toggleLab(false)};
      if(actions[e.code]){e.preventDefault();e.stopImmediatePropagation();actions[e.code]();}
      // Surface-only cinematic shortcuts must not change the submerged director.
      if(['KeyN','KeyB','KeyC'].includes(e.code))e.stopImmediatePropagation();
    },true);
  }

  enterDive() {
    this.app.sandbox.setActive(false);this.app.director.enabled=false;
    this.active=true;this.app.cine.diveController=this;this.app.cine.freeze=false;this.app.cine.freeSpeed=7;
    document.body.classList.add('diving');document.body.classList.remove('cine','sandbox');
    Object.assign(this.app.post.settings,{taa:true,taaBlend:0.17,dof:false,motionBlur:false,grain:0.008,chromatic:0.10,vignette:0.20,bloom:true,bloomStrength:0.09,bloomThreshold:0.65,saturation:1.22,contrast:1.04,exposureCompensation:-0.55,wetLens:0});
    this.started=this.app.time;this.setSwim(false);this.resetView();this.app.post.reset=true;
    this.hasEntered=true;this.syncLabels();this.syncDials();this.syncWeatherButtons();this.writeURL();
  }

  surface() {
    const p=this.app.camera.position,dir=this.app.camera.getWorldDirection(new THREE.Vector3());
    const horizon=new THREE.Vector3(dir.x,0,dir.z).normalize();if(horizon.lengthSq()<.1)horizon.set(0,0,-1);
    const y=U.uSeaLevel.value+Math.max(9,(this.app.ocean.significantWaveHeight||0)*1.25);
    this.travelTo({eye:[p.x,y,p.z],look:[p.x+horizon.x*300,y-8,p.z+horizon.z*300]},'the surface',null,true);
  }

  visit(id) {
    const h=this.world.sites.get(id)?.habitat;if(!h)return;
    const p=this.app.camera.position,vertical=Math.hypot(p.x-h.eye[0],p.z-h.eye[2])<60;
    this.travelTo(h,h.name,id,vertical);this.syncLabels();
  }

  waterline() {
    const p=this.app.camera.position,dir=this.app.camera.getWorldDirection(new THREE.Vector3());
    const r=Math.hypot(dir.x,dir.z)||1;
    this.travelTo({eye:[p.x,U.uSeaLevel.value+.08,p.z],look:[p.x+dir.x/r*200,U.uSeaLevel.value+.08,p.z+dir.z/r*200]},'the waterline',null,true);
    this.travel.floatSurface=true;
  }

  travelTo(destination,title,id=null,vertical=false) {
    this.toggleLab(false);
    this.floatAtSurface=false;
    const cam=this.app.camera,c=this.app.cine;
    const route=routeBetween(cam.position,destination,this.world.recipe);
    const points=route.map(p=>new THREE.Vector3(...p));
    let total=0;for(let i=1;i<points.length;i++)total+=points[i].distanceTo(points[i-1]);
    c.setFree(false);c.keys.clear();this.started=this.app.time;
    this.travel={points,index:1,total,done:0,speed:0,destination,title,id,vertical,ascending:destination.eye[1]>cam.position.y};
    $('dive-journey').hidden=false;document.body.classList.remove('dive-swimming');
    $('dive-swim').setAttribute('aria-pressed','false');$('dive-drift').setAttribute('aria-pressed','false');
    $('dive-keyhint').textContent='Continuous travel · Stop here or use WASD to take control';
  }

  triggerEvent(type) {
    const d=this.app.director,p=this.app.camera.position,dir=this.app.camera.getWorldDirection(new THREE.Vector3());
    const norm=Math.hypot(dir.x,dir.z)||1,x=p.x+dir.x/norm*160,z=p.z+dir.z/norm*160;
    if(type==='rogue')d.spawnRogue({height:14,distance:300});
    if(type==='whirlpool')d.spawnWhirlpool(x,z,20,58);
    if(type==='tsunami')d.spawnTsunami({height:32});
    if(type==='lightning'){this.app.sandbox.lightning();this.weatherMode='custom';this.syncDials();this.syncWeatherButtons();this.writeURL();}
    if(type==='waterspout')d.spawnWaterspout(x,z,26);
    if(type==='hurricane'){this.setWeather('storm');d.spawnHurricane(x,z,18);}
    this.toast(`${type[0].toUpperCase()+type.slice(1)} active across the connected ocean.`);
  }

  async regenerate(seed,reset=true) {
    const id=this.world.habitat.id;
    const request=(this.pendingGeneration||0)+1;this.pendingGeneration=request;
    this.toast('Growing the world…');$('dive-lab').setAttribute('aria-busy','true');
    await new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));
    if(this.pendingGeneration!==request)return;
    try {
      this.world.generate(id,seed,this.world.settings);
      this.travel=null;$('dive-journey').hidden=true;this.constrain(this.app.camera.position);this.captureDrift();
      this.syncLabels();this.syncDials();this.writeURL();this.toast(`World ${this.world.seed} generated · all four habitats`);
    } catch(error){console.error('World generation failed',error);this.toast('That world could not be generated. Try a lower living cover.');}
    finally{$('dive-lab').setAttribute('aria-busy','false');}
  }

  newSeed() { const a=new Uint32Array(1);crypto.getRandomValues(a);this.regenerate(a[0]%1000000); }

  resetView(pose=this.world.habitat) {
    const h=pose,c=this.app.cine,cam=this.app.camera;
    cam.position.fromArray(h.eye);cam.lookAt(...h.look);cam.fov=56;cam.updateProjectionMatrix();
    c._smoothLook.fromArray(h.look);c._smoothPos.copy(cam.position);c._freePos.copy(cam.position);c._lastCamPos.copy(cam.position);c.focusDistance=40;c.freeFov=56;c.fovTarget=56;
    if(c.free)c.setFree(true);
    this.captureDrift();
  }

  updateCamera(dt,time) {
    const c=this.app.cine,cam=this.app.camera;
    if([...c.keys].some(k=>['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(k))){this.setSwim(true);return;}
    dt=this.app.paused?0:dt;
    if(this.travel){
      const trip=this.travel,remaining=trip.total-trip.done;
      const speed=Math.max(remaining>100&&cam.position.y>-70?22:0,travelSpeed(-cam.position.y,remaining));
      trip.speed+=(speed-trip.speed)*(1-Math.exp(-dt*1.8));
      let distance=trip.speed*dt;
      while(distance>0&&trip.index<trip.points.length){
        const target=trip.points[trip.index],d=cam.position.distanceTo(target),step=Math.min(distance,d);
        if(d>.0001)cam.position.lerp(target,step/d);
        trip.done+=step;distance-=step;
        if(d<=step+.0001)trip.index++;else break;
      }
      this.constrain(cam.position);
      const ahead=trip.points[Math.min(trip.points.length-1,trip.index+2)];
      const direction=new THREE.Vector3().subVectors(ahead,cam.position);
      if(trip.vertical){cam.getWorldDirection(direction);direction.y=trip.ascending?.18:-.18;}
      else{const horizontal=Math.hypot(direction.x,direction.z)||1;direction.x/=horizontal;direction.z/=horizontal;direction.y=trip.ascending?.15:-.25;
        const cliff=smooth(95,200,-cam.position.y)*(1-smooth(1260,1390,-cam.position.y));
        direction.lerp(new THREE.Vector3(.55,-.31,-.83),cliff);
      }
      this.lookTarget.copy(cam.position).addScaledVector(direction,50);
      const arrival=smooth(65,0,remaining);
      this.lookTarget.lerp(new THREE.Vector3(...trip.destination.look),arrival);
      this.viewMatrix.lookAt(cam.position,this.lookTarget,this.up);
      this.viewQuaternion.setFromRotationMatrix(this.viewMatrix);cam.quaternion.slerp(this.viewQuaternion,1-Math.exp(-dt*2.5));
      if(trip.index>=trip.points.length){
        if(trip.id)this.world.select(trip.id);
        this.floatAtSurface=trip.floatSurface||false;
        this.travel=null;$('dive-journey').hidden=true;this.captureDrift();this.syncLabels();this.setSwim(false);this.writeURL();
      }
    }else{
      if(!this.driftPose)this.captureDrift();
      const t=(time-this.started)*.035,pose=this.driftPose,previousY=cam.position.y;
      cam.position.fromArray(pose.eye).add(new THREE.Vector3(Math.sin(t)*1.5,Math.sin(t*1.3)*.45,Math.sin(t*.7)*.7));
      if(this.floatAtSurface){cam.position.y=THREE.MathUtils.lerp(previousY,this.app.waterInterface.height+.08,1-Math.exp(-dt*14));pose.look[1]=cam.position.y;}
      this.constrain(cam.position);cam.lookAt(...pose.look);
    }
    cam.getWorldDirection(this.lookTarget);c._smoothLook.copy(cam.position).addScaledVector(this.lookTarget,45);c._smoothPos.copy(cam.position);
    cam.fov=56;cam.updateProjectionMatrix();c.focusDistance=cam.position.distanceTo(c._smoothLook);
  }

  captureDrift() {
    const cam=this.app.camera,dir=cam.getWorldDirection(new THREE.Vector3());
    this.driftPose={eye:cam.position.toArray(),look:cam.position.clone().addScaledVector(dir,45).toArray()};this.started=this.app.time;
  }
  constrain(position) { constrainToOcean(position,{...this.world.settings,seed:this.world.seed}); }
  applyFlow(position,dt) {
    if(this.app.paused||position.y>this.app.waterInterface.height)return;
    const flow=this.world.flow(position);position.x+=flow.x*dt;position.y+=flow.y*dt;position.z+=flow.z*dt;
  }

  setSwim(on) {
    const c=this.app.cine;
    if(on)this.floatAtSurface=false;
    this.travel=null;$('dive-journey').hidden=true;
    if(c.free!==on)c.setFree(on);
    if(!on)this.captureDrift();
    document.body.classList.toggle('dive-swimming',on);
    $('dive-swim').setAttribute('aria-pressed',String(on));$('dive-drift').setAttribute('aria-pressed',String(!on));
    $('dive-keyhint').innerHTML=on?'<kbd>WASD</kbd> swim · <kbd>Drag</kbd> look · <kbd>Q / E</kbd> down / up · <kbd>Shift</kbd> faster':'Choose <kbd>Swim</kbd> to explore · <kbd>G</kbd> world lab · <kbd>H</kbd> hide controls';
  }

  setWeather(mode,immediate=false) {
    const presets={day:{...CONDITIONS.clear.w,sunElevation:0.91,sunAzimuth:2.3},dusk:CONDITIONS.golden.w,storm:CONDITIONS.storm.w,night:{...CONDITIONS.clear.w,sunElevation:-0.17,sunIntensity:9,cloudCoverage:0.035,starIntensity:1}};
    if(!presets[mode])mode='day';this.weatherMode=mode;this.weatherBaseMode=mode;this.app.weather.set(presets[mode],immediate);
    this.syncDials();this.syncWeatherButtons();if(this.active)this.writeURL();
  }

  syncWeatherButtons() { this.root.querySelectorAll('[data-weather]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.weather===this.weatherMode))); }

  syncDials() {
    for(const [key,d] of Object.entries(this.dials)) {
      let v=d.weather?this.app.weather.target[key]:this.world.settings[key];
      if(d.angle)v*=180/Math.PI;
      d.input.value=v;d.out.textContent=d.fmt(v);
    }
    $('world-seed').value=this.world.seed;
  }

  syncLabels() {
    const h=this.world.habitat;
    $('dive-title').textContent=h.name;$('dive-subtitle').textContent=h.subtitle;
    $('dive-site-label').textContent=`${h.number} / ${h.id==='deep'?'THE MIDNIGHT ZONE':h.id==='blue'?'THE OPEN WATER':'THE SUNLIT ZONE'}`;
    this.root.querySelectorAll('[data-site]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.site===h.id)));
    $('dive-status-text').textContent=`ONE OCEAN · SEED ${this.world.seed}`;
    $('world-stats').textContent=`SEED ${this.world.seed} · ${(this.world.stats.fish+this.world.stats.animals).toLocaleString()} ANIMALS · ${this.world.stats.forms} FORMS`;
    $('world-stats').dataset.forms=this.world.stats.forms;
    $('world-stats').dataset.animals=this.world.stats.fish+this.world.stats.animals;
    $('world-stats').dataset.generation=this.world.generation;$('world-stats').dataset.vertices=this.world.stats.vertices;
    $('world-seed').value=this.world.seed;
  }

  toggleLab(force) {
    const on=force??$('dive-lab').hidden;$('dive-lab').hidden=!on;
    $('dive-lab-toggle').setAttribute('aria-expanded',String(on));document.body.classList.toggle('lab-open',on);
    this.root.querySelector('.dive-depth').inert=on;
  }

  setControlsHidden(on) {
    document.body.classList.toggle('dive-clean',on);
    for(const element of this.root.children)if(element.id!=='show-dive-ui')element.inert=on;
    if(!on)this.root.querySelector('.dive-depth').inert=!$('dive-lab').hidden;
  }

  pause() { this.app.paused=!this.app.paused;this.updatePause(); }
  updatePause() {
    $('dive-pause').setAttribute('aria-label',this.app.paused?'Resume simulation':'Pause simulation');
    $('dive-pause').setAttribute('aria-pressed',String(this.app.paused));
    $('dive-pause').innerHTML=this.app.paused?'<span aria-hidden="true">▶</span>':icon('pause');
  }
  lamp() { this.lampMode=U.uLamp.value>0?'off':'on'; }

  updateUI() {
    if(!this.active)return;
    const a=this.app;
    const depth=U.uCameraWaterDepth.value,deep=smooth(70,350,depth),water=smooth(-2,3,depth);
    if(depth>0)this.lastWetTime=a.time;
    U.uLamp.value=this.lampMode==='auto'?smooth(150,380,depth):this.lampMode==='on'?1:0;
    a.cine.freeSpeed=7+smooth(40,400,depth)*18+(1-smooth(-20,-2,depth))*29;
    a.post.settings.exposureBias=(1-deep)*(1-U.uDiveNight.value*.45)*(1-a.weather.state.storm*.26)+deep*.80;
    a.post.settings.fixedExposure=2.6-deep*.9;a.post.settings.fixedExposureMix=Math.max(deep,U.uDiveNight.value*.98);
    a.post.settings.tonemap=1;
    a.post.settings.contrast=1.04-deep*.04;
    a.post.settings.saturation=1.06+water*.16;
    a.post.settings.exposureCompensation=(1-water)*(this.surfacePost.exposureCompensation??.4)-water*.55;
    a.post.settings.wetLens=(1-water)*Math.exp(-(a.time-(this.lastWetTime??-100))/5)*.6;
    a.post.settings.dof=false;a.post.settings.motionBlur=false;
    if(performance.now()-this.lastReadout<150)return;this.lastReadout=performance.now();
    $('dive-depth-value').textContent=Math.abs(depth).toFixed(1);
    $('depth-reference').textContent=depth>=0?'BELOW THE SURFACE':'ABOVE THE SURFACE';
    $('dive-depth-value').dataset.depth=depth.toFixed(3);
    $('dive-depth-value').dataset.position=a.camera.position.toArray().map(v=>v.toFixed(3)).join(',');
    $('dive-depth-value').dataset.medium=Math.abs(depth)<.4?'waterline':depth>0?'water':'air';
    $('dive-depth-value').dataset.floor=this.world.floor(a.camera.position.x,a.camera.position.z).toFixed(3);
    const zone=depthZone(Math.round(depth/5)*5);
    let closest=null,dist=Infinity;
    for(const site of this.world.sites.values()){const d=a.camera.position.distanceTo(new THREE.Vector3(...site.habitat.eye));if(d<dist){dist=d;closest=site.habitat;}}
    const atSite=depth>1&&dist<85&&Math.abs(a.camera.position.y-closest.eye[1])<45;
    $('dive-title').textContent=atSite?closest.name:zone.name;
    $('dive-subtitle').textContent=atSite?closest.subtitle:zone.subtitle;
    $('dive-site-label').textContent=atSite?`${closest.number} / ${zone.label}`:zone.label;
    const neighbors=this.world.fauna.nearbySpecies;
    $('fauna-readout').textContent=neighbors.length?'Nearby · '+neighbors.join(' · '):'';
    $('fauna-readout').dataset.count=this.world.fauna.visibleCount;
    this.root.querySelectorAll('[data-site]').forEach(b=>b.setAttribute('aria-pressed',String(atSite&&b.dataset.site===closest.id)));
    $('dive-status-text').textContent=`${a.paused?'PAUSED':this.travel?(this.travel.ascending?'ASCENDING':'DESCENDING'):a.cine.free?'FREE SWIM':'SLOW DRIFT'} · ONE OCEAN · SEED ${this.world.seed}`;
    if(this.travel){
      const t=this.travel;$('journey-label').textContent=`${t.ascending?'Ascending to':'Travelling to'} ${t.title}`;
      $('journey-progress').value=t.total>0?t.done/t.total:1;
    }
    const flow=this.world.flow(a.camera.position),speed=Math.hypot(flow.x,flow.y,flow.z),state=this.world.dynamics;
    $('coupling-status').textContent=`LOCAL FLOW ${speed.toFixed(2)} m/s · SURFACE NUTRIENTS ${state.nutrients.toFixed(2)}×${state.waveActive?' · SEAFLOOR WAVE ACTIVE':''}`;
    $('coupling-status').dataset.flow=speed.toFixed(4);$('coupling-status').dataset.bloom=state.nutrients.toFixed(4);$('coupling-status').dataset.wave=String(state.waveActive);$('coupling-status').dataset.pulseAge=state.pulseAge.toFixed(3);$('coupling-status').dataset.mixing=state.mixing.toFixed(4);
    $('dive-lamp').setAttribute('aria-pressed',String(U.uLamp.value>0));
    $('world-performance').textContent=`${Math.min(240,Math.round(1000/Math.max(1,a.frameMs)))} FPS · ${a.quality.presetName.toUpperCase()} · ${a.time.toFixed(1)} s`;
    $('world-performance').dataset.time=a.time.toFixed(3);
    $('world-performance').dataset.fps=(1000/Math.max(1,a.frameMs)).toFixed(1);
    this.updatePause();
  }

  writeURL() {
    if(!this.world?.habitat)return;
    const p=new URLSearchParams();p.set('site',this.world.habitat.id);p.set('seed',this.world.seed);
    for(const [key,value] of Object.entries(this.world.settings))if(value!==GENERATOR_DEFAULTS[key])p.set(key,Number(value.toFixed(3)));
    p.set('light',this.weatherMode==='custom'?this.weatherBaseMode:this.weatherMode);
    if(this.weatherMode==='custom')for(const key of Object.keys(this.weatherRanges))p.set(key,Number(this.app.weather.target[key].toFixed(4)));
    if(this.app.camera.position.y>0)p.set('surface','1');
    else if(Math.abs(this.app.camera.position.y-this.world.habitat.eye[1])>45)p.set('depth',Math.round(-this.app.camera.position.y));
    if(!this.app.quality.adaptive){p.set('preset',this.app.quality.presetName);p.set('adaptive','0');}
    if(this.app.params.get('profile')==='1')p.set('profile','1');
    history.replaceState(null,'',`${location.pathname}?${p}`);
  }

  async share() {
    this.writeURL();try{await navigator.clipboard.writeText(location.href);this.toast('World link copied. Same seed, same ocean.');}
    catch{this.toast('The world link is in your address bar. Copy it to share.');}
  }

  photograph() {
    this.app.render(0);const a=document.createElement('a');a.download=`abyssal-${Math.round(Math.max(0,-this.app.camera.position.y))}m-${this.world.seed}.png`;a.href=this.app.canvas.toDataURL('image/png');a.click();this.toast('Photograph saved without the controls.');
  }

  toast(message) { $('dive-toast').textContent=message;$('dive-toast').classList.add('show');clearTimeout(this.toastTimer);this.toastTimer=setTimeout(()=>$('dive-toast').classList.remove('show'),2800); }
}
