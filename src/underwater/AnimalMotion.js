import { clamp } from './OceanDomain.js';

export const MOTION_STEP=1/30;
const CELL=8,TAU=Math.PI*2;
const angleDelta=(a,b)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));
const mix=(a,b,t)=>a+(b-a)*t;
const cellKey=(x,y,z)=>(x&1023)*1048576+(y&1023)*1024+(z&1023);
const poseKeys=['x','y','z','vx','vy','vz','pitch','roll','stroke','effort','alarm','feeding','turn','speed'];
function alignToFloor(s,floor){
  const e=.35,sx=(floor(s.x+e,s.z)-floor(s.x-e,s.z))/(2*e),sz=(floor(s.x,s.z+e)-floor(s.x,s.z-e))/(2*e);
  s.pitch=clamp(Math.atan(sx*Math.cos(s.heading)-sz*Math.sin(s.heading)),-.6,.6);
  s.roll=clamp(-Math.atan(sx*Math.sin(s.heading)+sz*Math.cos(s.heading)),-.6,.6);
}

class Neighborhood {
  constructor(size=CELL){this.size=size;this.cells=new Map();this.bounds={};}
  build(states){
    this.cells.clear();
    const b=this.bounds;b.minX=b.minY=b.minZ=Infinity;b.maxX=b.maxY=b.maxZ=-Infinity;
    for(let i=0;i<states.length;i++){
      const p=states[i],key=cellKey(Math.floor(p.x/this.size),Math.floor(p.y/this.size),Math.floor(p.z/this.size));
      b.minX=Math.min(b.minX,p.x);b.maxX=Math.max(b.maxX,p.x);b.minY=Math.min(b.minY,p.y);b.maxY=Math.max(b.maxY,p.y);b.minZ=Math.min(b.minZ,p.z);b.maxZ=Math.max(b.maxZ,p.z);
      let cell=this.cells.get(key);if(!cell)this.cells.set(key,cell=[]);cell.push(i);
    }
  }
  visit(p,callback){
    const x=Math.floor(p.x/this.size),y=Math.floor(p.y/this.size),z=Math.floor(p.z/this.size);
    for(let ix=x-1;ix<=x+1;ix++)for(let iy=y-1;iy<=y+1;iy++)for(let iz=z-1;iz<=z+1;iz++){
      const cell=this.cells.get(cellKey(ix,iy,iz));if(cell)for(const i of cell)callback(i);
    }
  }
}

// Ellipsoids conservatively describe the large rocks. Feeding points are
// sampled from the actual mesh separately, so grazing need not hover above it.
export class RockField {
  constructor(rocks=[]){
    this.rocks=rocks;this.cells=new Map();
    for(const rock of rocks){
      for(let x=Math.floor((rock.x-rock.rx-3)/CELL);x<=Math.floor((rock.x+rock.rx+3)/CELL);x++)
      for(let z=Math.floor((rock.z-rock.rz-3)/CELL);z<=Math.floor((rock.z+rock.rz+3)/CELL);z++){
        const key=`${x},${z}`;let cell=this.cells.get(key);if(!cell)this.cells.set(key,cell=[]);cell.push(rock);
      }
    }
  }
  near(x,z){return this.cells.get(`${Math.floor(x/CELL)},${Math.floor(z/CELL)}`)||[];}
  project(p,radius,benthic=false){
    for(let pass=0;pass<2;pass++)for(const rock of this.near(p.x,p.z)){
      const rx=rock.rx+radius,ry=rock.ry+radius,rz=rock.rz+radius;
      const dx=(p.x-rock.x)/rx,dy=(p.y-rock.y)/ry,dz=(p.z-rock.z)/rz;
      const d2=dx*dx+dy*dy+dz*dz;if(d2>=1)continue;
      if(benthic){
        const r=Math.hypot(dx,dz)||.0001,edge=Math.sqrt(Math.max(0,1-dy*dy))+.012;
        p.x=rock.x+(r<.001?1:dx/r)*edge*rx;p.z=rock.z+(r<.001?0:dz/r)*edge*rz;
      }else{
        const r=Math.sqrt(d2)||.0001;
        p.x=rock.x+dx/r*rx*1.012;p.y=rock.y+(r<.001?1:dy/r)*ry*1.012;p.z=rock.z+dz/r*rz*1.012;
      }
    }
  }
}

/** Seeded route-following with inertia, local schooling and bounded avoidance.
 * Fixed simulation steps make ordinary 30/60/144 Hz runs agree. A seek over four
 * seconds starts from its procedural route instead of blocking on missed frames.
 * The camera is only a visibility input; a diver must be supplied explicitly.
 */
export class AnimalMotion {
  constructor(animals,targetAt,{floor,rocks=[],perception=8}={}){
    this.animals=animals;this.targetAt=targetAt;this.floor=floor;
    this.rocks=rocks instanceof RockField?rocks:new RockField(rocks);this.grid=new Neighborhood(perception);this.perception2=perception*perception;
    this.targets=animals.map(()=>({}));this.states=animals.map(()=>({}));this.previous=animals.map(()=>({}));
    this.next=animals.map(()=>({}));this.poses=animals.map(()=>({}));this.social=animals.map(()=>({valid:false}));this.tick=0;this.lastTime=0;
    this.reset(0);
  }
  reset(time){
    this.tick=Math.floor(time/MOTION_STEP);this.lastTime=time;
    for(let i=0;i<this.animals.length;i++){
      const a=this.animals[i],t=this.targetAt(a,this.tick*MOTION_STEP,this.targets[i]),s=this.states[i];
      Object.assign(s,{x:t.x,y:t.y,z:t.z,vx:t.vx||0,vy:t.vy||0,vz:t.vz||0,
        heading:t.heading??a.heading??0,pitch:t.pitch||0,roll:0,stroke:t.stroke??a.phase??0,
        effort:clamp(t.activity??.4,0,1),alarm:0,feeding:t.feeding||0,turn:0,waterX:0,waterY:0,waterZ:0,speed:0});
      if(a.benthic)s.vy=0;
      const initialSpeed=Math.hypot(s.vx,s.vy,s.vz),maxSpeed=a.maxSpeed??.4;
      if(initialSpeed>maxSpeed){const k=maxSpeed/initialSpeed;s.vx*=k;s.vy*=k;s.vz*=k;}
      this.rocks.project(s,a.radius??a.scale*.5,a.benthic);
      const bed=this.floor(s.x,s.z);s.y=a.benthic?bed+.012:Math.max(bed+(a.radius??a.scale*.5)+.14,Math.min(-.45,s.y));
      if(a.benthic)alignToFloor(s,this.floor);
      if(a.behavior==='settled')s.effort=0;
      this.social[i].valid=false;
      Object.assign(this.previous[i],s);Object.assign(this.poses[i],s);
    }
  }
  advance(time,environment={}){
    const targetTick=Math.floor((time+1e-9)/MOTION_STEP);
    if(time<this.lastTime||targetTick-this.tick>120)this.reset(Math.max(0,time-MOTION_STEP*6));
    while(this.tick<targetTick){this.tick++;this.step(this.tick*MOTION_STEP,environment);}
    const alpha=clamp(time/MOTION_STEP-this.tick,0,1);
    for(let i=0;i<this.states.length;i++){
      const s=this.states[i],p=this.previous[i],out=this.poses[i];
      for(const key of poseKeys)out[key]=mix(p[key],s[key],alpha);
      out.heading=p.heading+angleDelta(p.heading,s.heading)*alpha;
    }
    this.lastTime=time;return this.poses;
  }
  step(time,environment){
    const dt=MOTION_STEP,states=this.states,animals=this.animals;
    this.grid.build(states);
    const bounds=this.grid.bounds;
    const hunters=(environment.hunters||[]).filter(p=>p.x>bounds.minX-7&&p.x<bounds.maxX+7&&p.y>bounds.minY-7&&p.y<bounds.maxY+7&&p.z>bounds.minZ-7&&p.z<bounds.maxZ+7);
    for(let i=0;i<animals.length;i++){
      const a=animals[i],s=states[i],next=this.next[i];
      if(a.behavior==='settled')continue;
      const target=this.targetAt(a,time,this.targets[i]);
      const baseSpeed=a.maxSpeed??.4,radius=a.radius??a.scale*.5;
      const response=a.behavior==='hover'?.32:a.benthic?1.1:.68;
      let dx=0,dy=0,dz=0;
      let cx=0,cy=0,cz=0,ax=0,ay=0,az=0,n=0,alarm=0,prey=null,preyD=64;
      const flee=(p,range,strength)=>{
        let x=s.x-p.x,y=s.y-p.y,z=s.z-p.z;const d2=x*x+y*y+z*z;if(d2>=range*range)return;
        if(d2<1e-10){const angle=(a.phase||0)+i*2.4;x=Math.cos(angle)*.12;z=Math.sin(angle)*.12;}
        const d=Math.sqrt(d2),fear=(1-d/range)**2,k=fear*baseSpeed*strength/Math.max(.12,d);
        dx+=x*k;dy+=y*k*.45;dz+=z*k;alarm=Math.max(alarm,fear);
      };
      // Neighbor choices change more slowly than body motion. Stagger their
      // refresh over two fixed ticks; inertia, obstacles and the diver stay 30 Hz.
      const social=this.social[i];
      if(!social.valid||(this.tick+i)%2===0){
        this.grid.visit(s,j=>{
        if(i===j)return;const b=animals[j],p=states[j];
        let x=s.x-p.x,y=s.y-p.y,z=s.z-p.z;const d2=x*x+y*y+z*z;
        if(d2>this.perception2)return;
        if(!a.hunter&&b.hunter&&!a.benthic)flee(p,b.pursuer?7:3.5,6.5);
        if(a.pursuer&&!b.hunter&&!b.benthic&&b.scale<a.scale*.8&&d2<preyD){preyD=d2;prey=p;}
        if(!!a.benthic!==!!b.benthic)return;
        const separation=(a.personalSpace??radius)+(b.personalSpace??b.radius??b.scale*.5)+.10;
        if(d2<separation*separation*2.25){
          if(d2<1e-10){const side=i<j?1:-1;x=side*.08;z=side*.025;}
          const d=Math.sqrt(d2),k=(1-d/(separation*1.5))*baseSpeed*(a.behavior==='hover'?5:2.4)/Math.max(.08,d);
          dx+=x*k;dy+=y*k*.7;dz+=z*k;
        }
        if(a.behavior==='school'&&b.school===a.school&&d2<36){
          cx+=p.x;cy+=p.y;cz+=p.z;ax+=p.vx;ay+=p.vy;az+=p.vz;n++;
          alarm=Math.max(alarm,p.alarm*.75);
        }
        });
        if(n){
          dx+=(cx/n-s.x)*.10+(ax/n-s.vx)*.42;dy+=(cy/n-s.y)*.09+(ay/n-s.vy)*.32;dz+=(cz/n-s.z)*.10+(az/n-s.vz)*.42;
        }
        if(prey&&Math.sin(time*.13+(a.phase||0))>.72){
          const chase=.9*baseSpeed/Math.max(.4,Math.sqrt(preyD));
          dx+=(prey.x+prey.vx*.4-s.x)*chase;dy+=(prey.y-s.y)*chase*.65;dz+=(prey.z+prey.vz*.4-s.z)*chase;
        }
        Object.assign(social,{dx,dy,dz,alarm,valid:true});
      }else{
        dx=social.dx;dy=social.dy;dz=social.dz;alarm=social.alarm;
      }
      dx+=(target.vx||0)+(target.x-s.x)*response;dy+=(target.vy||0)+(target.y-s.y)*response;dz+=(target.vz||0)+(target.z-s.z)*response;
      if(!a.hunter&&!a.benthic)for(const hunter of hunters)flee(hunter,6.5,6);
      if(environment.diver)flee(environment.diver,a.benthic?1.7:a.hunter?2.7:3.8,a.benthic?2:4);
      // Anticipate rocks with the next body-length of travel, then slide around
      // them. A final projection only handles initial overlaps and tiny contacts.
      const px=s.x+s.vx*.9,py=s.y+s.vy*.9,pz=s.z+s.vz*.9;
      for(const rock of this.rocks.near(px,pz)){
        if(a.feedingPoint?.rock===rock&&target.feeding>.25)continue;
        const rx=rock.rx+radius+.25,ry=rock.ry+radius+.2,rz=rock.rz+radius+.25;
        const x=(px-rock.x)/rx,y=(py-rock.y)/ry,z=(pz-rock.z)/rz,r=Math.hypot(x,y,z);
        if(r<1.6){
          const k=Math.max(0,1.4-r)*baseSpeed*4.5/Math.max(.1,r);
          dx+=x*k;dz+=z*k;if(!a.benthic)dy+=y*k*.65;
          const horizontal=Math.hypot(x,z),toward=-(s.vx*x+s.vz*z);
          if(horizontal>.01&&toward>0){
            const side=((a.id??i)%2?1:-1),slide=(1.6-r)*baseSpeed*2.8*side/horizontal;
            dx-=z*slide;dz+=x*slide;
          }
        }
      }
      const flow=environment.flow?.(s,time)||{x:0,y:0,z:0},drift=a.benthic?0:a.behavior==='hover'?.9:.6;
      const relax=1-Math.exp(-dt*2);
      s.waterX+=((flow.x||0)*drift-s.waterX)*relax;s.waterY+=((flow.y||0)*drift-s.waterY)*relax;s.waterZ+=((flow.z||0)*drift-s.waterZ)*relax;
      dx-=s.waterX*.8;dy-=s.waterY*.8;dz-=s.waterZ*.8;
      const maxSpeed=baseSpeed*(1+alarm*1.8),length=Math.hypot(dx,dy,dz);
      if(length>maxSpeed){const k=maxSpeed/length;dx*=k;dy*=k;dz*=k;}
      const dvx=dx-s.vx,dvy=dy-s.vy,dvz=dz-s.vz,dv=Math.hypot(dvx,dvy,dvz);
      const acceleration=(a.benthic?.35:1.6)*baseSpeed*(1+alarm*2),blend=dv>0?Math.min(1,acceleration*dt/dv):1;
      Object.assign(next,{vx:s.vx+dvx*blend,vy:s.vy+dvy*blend,vz:s.vz+dvz*blend,
        alarm:Math.max(alarm,s.alarm*Math.exp(-dt*1.3)),feeding:(target.feeding||0)*clamp(1-Math.hypot(target.x-s.x,target.y-s.y,target.z-s.z)/1.5,0,1)});
      if(a.behavior!=='hover'){
        const horizontal=Math.hypot(next.vx,next.vz),reverse=(a.reverse?Math.PI:0)+(a.sideways?Math.PI/2:0);
        const desired=-Math.atan2(next.vz,next.vx)+reverse,limit=(a.turnRate??1.4)*dt;
        const heading=s.heading+clamp(angleDelta(s.heading,desired),-limit,limit)-reverse;
        next.vx=Math.cos(heading)*horizontal;next.vz=-Math.sin(heading)*horizontal;
      }
    }
    for(let i=0;i<animals.length;i++){
      const a=animals[i],s=states[i],next=this.next[i],target=this.targets[i],previous=this.previous[i];
      Object.assign(previous,s);if(a.behavior==='settled')continue;Object.assign(s,next);
      if(a.behavior!=='settled'){
        s.x+=(s.vx+s.waterX)*dt;s.z+=(s.vz+s.waterZ)*dt;if(!a.benthic)s.y+=(s.vy+s.waterY)*dt;
        this.rocks.project(s,a.radius??a.scale*.5,a.benthic);
      }
      const bed=this.floor(s.x,s.z),clearance=(a.radius??a.scale*.5)+.14;
      if(a.benthic)s.y=bed+.012;
      else if(s.y<bed+clearance){s.y=bed+clearance;s.vy=Math.max(0,s.vy);}
      else if(s.y>-.45){s.y=-.45;s.vy=Math.min(0,s.vy);}
      const speed=Math.hypot(s.vx,a.benthic?0:s.vy,s.vz),horizontal=Math.hypot(s.vx,s.vz);
      s.speed=speed;
      let desired=s.heading;
      if(horizontal>(a.benthic?.00005:.006))desired=-Math.atan2(s.vz,s.vx)+(a.reverse?Math.PI:0)+(a.sideways?Math.PI/2:0);
      const turn=clamp(angleDelta(s.heading,desired),-(a.turnRate??1.4)*dt,(a.turnRate??1.4)*dt);
      s.heading+=turn;s.turn=turn/dt;
      if(a.benthic)alignToFloor(s,this.floor);
      else{
        const desiredPitch=(a.reverse?-1:1)*Math.atan2(s.vy,Math.max(.025,horizontal))*(a.behavior==='hover'?.3:.7)-s.feeding*.55;
        s.pitch=mix(s.pitch,clamp(desiredPitch,-.7,.7),1-Math.exp(-dt*3));
        s.roll=mix(s.roll,clamp(-s.turn*speed*.22,-.28,.28),1-Math.exp(-dt*3));
      }
      const activity=clamp(speed/Math.max(.01,a.maxSpeed??.4),0,1),effort=a.benthic?clamp(activity*1.5,0,1):.12+activity*.75;
      s.effort=mix(s.effort,effort,1-Math.exp(-dt*4));
      if(a.behavior==='jet')s.stroke=target.stroke;
      else if(a.benthic)s.stroke+=speed/Math.max(.015,a.scale*.55)*TAU*dt;
      else s.stroke+=(a.beat??2.5)*TAU*(.25+activity*.85+s.alarm*.35)*dt;
    }
  }
}
