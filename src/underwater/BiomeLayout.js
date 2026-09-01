import { oceanFloor, smooth, SITE_ORIGINS, DOMAIN_RADIUS } from './OceanDomain.js';
import { fieldNoise } from './WorldNoise.js';
export { cellSeed, fieldNoise } from './WorldNoise.js';

export const BIOME_CELL = 64;

// These fields describe places, not the camera. Tile order and exploration
// direction cannot change where a clearing, colony, or forest edge grows.
export function biomeAt(x,z,recipe={}) {
  const seed=recipe.worldSeed??recipe.seed??713,scale=recipe.habitatScale??1;
  const y=oceanFloor(x,z,recipe),depth=-y;
  const nx=x/scale,nz=z/scale;
  const boundary=Math.sin(nz*.0031+.4)*95+(fieldNoise(0,nz/260,seed+37)-.5)*100;
  const shallow=1-smooth(48,90,depth),forest=smooth(-65,90,x-boundary);
  const reef=shallow*(1-forest),kelp=shallow*forest,deep=smooth(950,1330,depth);
  const mosaic=fieldNoise(nx/78,nz/78,seed+151)*.66+fieldNoise(nx/29,nz/29,seed+883)*.34;
  const channel=Math.pow(.5+.5*Math.sin(nx*.040+Math.sin(nz*.016)*1.9+fieldNoise(nx/190,nz/190,seed)*3),10);
  const clearing=smooth(.50,.79,mosaic);
  const coral=reef*(.58+mosaic*.62)*(1-channel*.86);
  const canopy=kelp*(.45+mosaic*.85)*(1-clearing*.82);
  const meadow=shallow*Math.max(channel*.86,clearing*.72,.12);
  const fissure=Math.pow(.5+.5*Math.sin((nx+Math.sin(nz*.012)*42)*.034),14);
  const vents=deep*fissure*(.36+.64*smooth(.32,.64,fieldNoise(nx/130,nz/180,seed+501)));
  let reserve=0;
  for(const [id,[hx,hz]] of Object.entries(SITE_ORIGINS)) {
    const d=Math.hypot(x-hx,z-hz);
    reserve=Math.max(reserve,1-smooth(id==='blue'?55:36,id==='blue'?115:88,d));
  }
  const id=shallow>.5?(kelp>reef?'kelp':'reef'):depth>1100?'deep':'blue';
  return {id,y,depth,reef,kelp,deep,coral,canopy,meadow,vents,channel,clearing,
    outer:1-reserve,mosaic,inside:Math.hypot(x,z)<=DOMAIN_RADIUS+BIOME_CELL};
}

export function regionName(x,z,recipe={}) {
  const b=biomeAt(x,z,recipe);
  if(b.id==='reef')return {id:'reef',name:b.meadow>.65?'The seagrass channels':'The coral ridges',subtitle:'Coral shelves and sandy channels, continuing across the sunlit shelf.'};
  if(b.id==='kelp')return {id:'kelp',name:b.clearing>.55?'A clearing in the kelp':'The kelp forest',subtitle:'Long avenues of kelp open into quiet clearings.'};
  if(b.id==='deep')return {id:'deep',name:b.vents>.18?'The vent belt':'The abyssal plain',subtitle:'Follow the fractured basalt between scattered vent communities.'};
  return {id:'blue',name:'The continental slope',subtitle:'Ridges and cold-water gardens descend into open water.'};
}

// Coordinates are destinations inside the continuous field, never scene swaps.
// The same field used by geometry chooses a suitable nearby clearing or ridge.
export const EXPLORATION_STOPS = [
  {id:'reef-ridges',biome:'reef',name:'Outer coral ridges',x:-410,z:300,kind:'coral',description:'Swim along coral-covered limestone shelves, well beyond the reef entrance.'},
  {id:'reef-channels',biome:'reef',name:'Seagrass channels',x:-700,z:520,kind:'meadow',description:'Sandy channels and seagrass wind between low coral gardens.'},
  {id:'reef-gardens',biome:'reef',name:'Far reef gardens',x:-1040,z:860,kind:'coral',description:'Branching coral gardens, schooling fish and broad sandy channels.'},
  {id:'kelp-avenues',biome:'kelp',name:'Kelp avenues',x:410,z:330,kind:'canopy',description:'Follow the stems through a broad stand of giant kelp.'},
  {id:'kelp-clearings',biome:'kelp',name:'Forest clearings',x:700,z:610,kind:'meadow',description:'Open pockets of seagrass and grazing animals interrupt the forest.'},
  {id:'kelp-outer',biome:'kelp',name:'The outer forest',x:1060,z:960,kind:'canopy',description:'The forest continues across the shelf, far from the arrival point.'},
  {id:'shelf-edge',biome:'blue',name:'Offshore pinnacles',x:-420,z:-160,kind:'slope',description:'Leave the sunlit shelf and follow its weathered stone ridges.'},
  {id:'canyon-wall',biome:'blue',name:'Canyon terraces',x:165,z:-430,kind:'slope',description:'Cold-water colonies cling to terraces along the continental slope.'},
  {id:'vent-belt',biome:'deep',name:'The eastern vent belt',x:330,z:-930,kind:'vents',description:'Mineral chimneys and bottom dwellers occupy a long fractured vent belt.'},
  {id:'basalt-plain',biome:'deep',name:'Western basalt plain',x:-460,z:-1170,kind:'plain',description:'Cross the dark, rolling seabed between isolated deep-sea communities.'},
  {id:'far-vents',biome:'deep',name:'The far vent field',x:790,z:-1430,kind:'vents',description:'Another vent community across the same unbroken abyssal floor.'},
];

export function explorationStops(recipe={}) {
  return EXPLORATION_STOPS.map(stop=>{
    let best={x:stop.x,z:stop.z},score=-Infinity;
    if(['coral','canopy','meadow','vents'].includes(stop.kind)){
      for(const radius of [64,192]){
        if(score>.55)break;
        const step=stop.kind==='vents'?8:16;
        for(let dz=-radius;dz<=radius;dz+=step)for(let dx=-radius;dx<=radius;dx+=step){
          const x=stop.x+dx,z=stop.z+dz,b=biomeAt(x,z,recipe);
          if(b.id!==stop.biome||Math.hypot(x,z)>DOMAIN_RADIUS-96)continue;
          const value=b[stop.kind]-Math.hypot(dx,dz)*.0005;
          if(value>score){score=value;best={x,z};}
        }
      }
    }
    const {x,z}=best;
    const height=stop.biome==='kelp'?8:stop.biome==='blue'?12:4.2;
    return {...stop,x,z,eye:[x,oceanFloor(x,z+18,recipe)+height,z+18],look:[x+6,oceanFloor(x+6,z-18,recipe)+height*.65,z-18]};
  });
}

export function nearbyCells(position,rings=3,size=BIOME_CELL) {
  const x=Math.floor(position.x/size),z=Math.floor(position.z/size),result=[];
  for(let dz=-rings;dz<=rings;dz++)for(let dx=-rings;dx<=rings;dx++){
    const cx=x+dx,cz=z+dz;
    if(Math.hypot((cx+.5)*size,(cz+.5)*size)>DOMAIN_RADIUS+size*2)continue;
    result.push({x:cx,z:cz,key:`${cx},${cz}`,distance:Math.hypot(dx,dz)});
  }
  return result.sort((a,b)=>a.distance-b.distance);
}
