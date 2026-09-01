import * as THREE from 'three';
import { biomeAt, explorationStops } from './BiomeLayout.js';
import { DOMAIN_RADIUS, routeBetween } from './OceanDomain.js';

export class ExpeditionChart {
  constructor(expedition) {
    this.exp=expedition;this.world=expedition.world;this.recipeKey=null;this.stops=[];this.direction=new THREE.Vector3();
    const dialog=document.createElement('dialog');dialog.className='dive-help expedition-chart';dialog.setAttribute('aria-labelledby','chart-title');
    dialog.innerHTML=`<button class="guide-close" aria-label="Close exploration chart" autofocus>×</button><h2 id="chart-title">Explore the ocean</h2>
      <p class="chart-intro">The dive sites are entrances. Reef, forest and deep-sea habitats continue far beyond them. Choose a destination, or swim your own route.</p>
      <div class="chart-layout"><div><canvas width="640" height="640" aria-label="Ocean habitat chart with your position and eleven exploration destinations"></canvas><p class="chart-legend"><span>Reef</span><span>Kelp</span><span>Slope</span><span>Abyss</span></p></div>
      <div class="chart-details"><label for="chart-destination">Explore further</label><select id="chart-destination" aria-label="Exploration destination"></select>
      <h3 id="chart-name"></h3><p id="chart-description"></p><p id="chart-distance" class="chart-readout"></p><button id="chart-travel">Travel there</button>
      <p class="chart-note">Travel stays in the same ocean. Stop anywhere and choose Swim to explore. The World lab controls cover, terrain, animals and habitat scale.</p><p id="chart-position" class="chart-readout"></p></div></div>`;
    document.body.appendChild(dialog);this.dialog=dialog;this.canvas=dialog.querySelector('canvas');this.context=this.canvas.getContext('2d');
    this.select=dialog.querySelector('select');this.name=dialog.querySelector('#chart-name');this.description=dialog.querySelector('#chart-description');this.distance=dialog.querySelector('#chart-distance');this.position=dialog.querySelector('#chart-position');
    dialog.querySelector('.guide-close').onclick=()=>dialog.close();
    dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
    dialog.addEventListener('close',()=>document.getElementById('dive-chart').focus());
    this.select.onchange=()=>this.update();
    this.canvas.onclick=e=>{
      const r=this.canvas.getBoundingClientRect(),x=(e.clientX-r.left)/r.width*640,y=(e.clientY-r.top)/r.height*640;
      const nearest=this.stops.map(s=>({s,d:Math.hypot(this.map(s.x)-x,this.map(s.z)-y)})).sort((a,b)=>a.d-b.d)[0];
      if(nearest?.d<30){this.select.value=nearest.s.id;this.update();}
    };
    dialog.querySelector('#chart-travel').onclick=()=>{
      const stop=this.stops.find(s=>s.id===this.select.value);if(!stop)return;
      dialog.close();this.exp.travelTo(stop,stop.name,stop.biome);
    };
  }
  map(value){return 320+value/DOMAIN_RADIUS*300;}
  open() {
    this.exp.watch?.toggle(false);this.exp.toggleLab(false);this.refresh();
    this.dialog.showModal();this.update();
  }
  refresh() {
    const key=JSON.stringify([this.world.seed,this.world.settings.relief,this.world.settings.habitatScale]);
    if(key===this.recipeKey)return;
    const previous=this.select.value;this.stops=explorationStops(this.world.recipe);
    this.select.innerHTML=this.stops.map((s,i)=>`<option value="${s.id}">${i+1}. ${s.name}</option>`).join('');
    this.select.value=this.stops.some(s=>s.id===previous)?previous:(this.stops.find(s=>s.biome===this.world.habitat.id)||this.stops[0]).id;
    const background=document.createElement('canvas');background.width=background.height=640;
    const c=background.getContext('2d');c.fillStyle='#071b24';c.fillRect(0,0,640,640);c.save();c.beginPath();c.arc(320,320,300,0,Math.PI*2);c.clip();
    const step=55;
    for(let z=-DOMAIN_RADIUS;z<DOMAIN_RADIUS;z+=step)for(let x=-DOMAIN_RADIUS;x<DOMAIN_RADIUS;x+=step){
      const b=biomeAt(x+step/2,z+step/2,this.world.recipe),col=b.depth<80?[
        70*b.reef+94*b.kelp,117*b.reef+114*b.kelp,107*b.reef+68*b.kelp
      ]:b.depth<500?[44,80,88]:b.depth<1100?[32,59,75]:[22,43,59];
      const detail=.80+b.mosaic*.36;c.fillStyle=`rgb(${col.map(v=>Math.round(v*detail)).join(',')})`;c.fillRect(this.map(x),this.map(z),step/DOMAIN_RADIUS*300+1,step/DOMAIN_RADIUS*300+1);
    }
    c.strokeStyle='#c2dbc01a';c.lineWidth=1;
    for(let v=-2000;v<=2000;v+=500){c.beginPath();c.moveTo(this.map(v),20);c.lineTo(this.map(v),620);c.stroke();c.beginPath();c.moveTo(20,this.map(v));c.lineTo(620,this.map(v));c.stroke();}
    c.restore();c.strokeStyle='#a4c8ba66';c.beginPath();c.arc(320,320,300,0,Math.PI*2);c.stroke();c.fillStyle='#cee0d0';c.font='16px sans-serif';c.textAlign='center';c.fillText('N',320,17);
    c.textAlign='left';c.font='13px monospace';c.fillText('500 m',48,610);c.beginPath();c.moveTo(48,588);c.lineTo(48+500/DOMAIN_RADIUS*300,588);c.strokeStyle='#cee0d0';c.stroke();
    this.background=background;this.recipeKey=key;
  }
  update() {
    if(!this.dialog.open)return;this.refresh();
    const stop=this.stops.find(s=>s.id===this.select.value),p=this.exp.app.camera.position,c=this.context;
    this.name.textContent=stop.name;this.description.textContent=stop.description;
    const d=Math.hypot(p.x-stop.eye[0],p.y-stop.eye[1],p.z-stop.eye[2]);
    this.distance.textContent=`${d>=1000?(d/1000).toFixed(2)+' km':Math.round(d)+' m'} away · ${Math.round(-stop.eye[1]).toLocaleString()} m deep`;
    this.position.textContent=`${Math.round(Math.abs(p.x))} m ${p.x<0?'west':'east'} · ${Math.round(Math.abs(p.z))} m ${p.z<0?'north':'south'} of centre`;
    c.drawImage(this.background,0,0);
    const route=routeBetween(p,stop,this.world.recipe);c.beginPath();route.forEach((a,i)=>i?c.lineTo(this.map(a[0]),this.map(a[2])):c.moveTo(this.map(a[0]),this.map(a[2])));c.setLineDash([5,7]);c.strokeStyle='#e8e9c393';c.lineWidth=1.6;c.stroke();c.setLineDash([]);
    for(const [i,s] of this.stops.entries()){
      const x=this.map(s.x),y=this.map(s.z),active=s.id===stop.id;c.beginPath();c.arc(x,y,active?15:12,0,Math.PI*2);c.fillStyle=active?'#e0e5bc':'#17323d';c.fill();c.strokeStyle='#cedbbc';c.lineWidth=1;c.stroke();
      c.fillStyle=active?'#132d33':'#e0e5ce';c.font='13px sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(String(i+1),x,y);
    }
    const x=this.map(p.x),y=this.map(p.z);this.exp.app.camera.getWorldDirection(this.direction);
    c.beginPath();c.moveTo(x,y);c.lineTo(x+this.direction.x*20,y+this.direction.z*20);c.strokeStyle='#ffffff';c.lineWidth=2;c.stroke();
    c.beginPath();c.arc(x,y,5,0,Math.PI*2);c.fillStyle='#ffffff';c.fill();c.strokeStyle='#122830';c.stroke();
  }
}
