import * as THREE from 'three';
import { U } from '../core/SharedUniforms.js';
import { FullScreenPass, makeRT } from '../gfx/FullScreenPass.js';
import { OCEAN_SAMPLE_GLSL } from '../ocean/OceanSampleGLSL.js';

const PROBE = /* glsl */ `
${OCEAN_SAMPLE_GLSL}
uniform float uTime;
uniform vec2 uProbePosition;
layout(location=0) out vec4 outColor;
void main(){outColor=vec4(surfaceHeightAt(uProbePosition,uTime),0.0,0.0,1.0);}
`;
const INTERFACE = /* glsl */ `
${OCEAN_SAMPLE_GLSL}
uniform float uTime;
uniform vec3 uCamPos;
uniform mat4 uInvViewProj;
uniform sampler2D uAirColor,uAirDepth,uWaterColor,uWaterDepth;
in vec2 vUv;
layout(location=0) out vec4 outColor;
layout(location=1) out vec4 outVelocity;
void main(){
  vec4 world=uInvViewProj*vec4(vUv*2.0-1.0,1.0,1.0);
  vec3 rd=normalize(world.xyz/world.w-uCamPos);
  vec3 lens=uCamPos+rd*0.68;
  float height=surfaceHeightAt(lens.xz,uTime);
  float distanceToWater=height-lens.y;
  float water=smoothstep(-0.075,0.075,distanceToWater);
  vec2 bend=vec2(sin(vUv.y*38.0+uTime*1.3),cos(vUv.x*32.0-uTime))*0.0015;
  float meniscus=exp(-abs(distanceToWater)*26.0);
  vec2 uv=clamp(vUv+bend*water*(0.3+meniscus),vec2(.001),vec2(.999));
  vec3 air=texture(uAirColor,vUv).rgb,sea=texture(uWaterColor,uv).rgb;
  vec4 airDepth=texture(uAirDepth,vUv),waterDepth=texture(uWaterDepth,uv);
  // At a wave trough the lens can be below mean sea level but still in air.
  // The projected surface grid may then leave downward rays on the sky's
  // ground hemisphere. Those rays enter the water: use the submerged view,
  // not the black atmospheric ground. Surface fragments keep their shading.
  float skyPixel=step(39999.0,airDepth.z)*step(airDepth.z,40001.0);
  float throughWater=skyPixel*(1.0-smoothstep(-0.035,-0.001,rd.y));
  air=mix(air,sea,throughWater);
  airDepth=mix(airDepth,waterDepth,throughWater);
  vec3 color=mix(air,sea,water);
  color=mix(color,color*.65+vec3(.012,.04,.042),meniscus*.55);
  outColor=vec4(color,1.0);
  outVelocity=mix(airDepth,waterDepth,water);
}
`;

export class WaterInterface {
  constructor(app){
    this.app=app;this.samples=new Float32Array(4);this.counter=0;this.height=0;
    this.probeTarget=makeRT(1,1,{type:THREE.FloatType,name:'surface-height-probe'});
    this.probe=new FullScreenPass(PROBE,app.ocean.bind({...U,uProbePosition:{value:new THREE.Vector2()}}),{name:'actual-wave-height'});
    this.pass=new FullScreenPass(INTERFACE,app.ocean.bind({...U,uAirColor:{value:null},uAirDepth:{value:null},uWaterColor:{value:null},uWaterDepth:{value:null}}),{name:'continuous-waterline'});
  }
  sample(camera){
    const app=this.app,p=camera.position;
    const event=(app.director?.eventHeight(p.x,p.z)||0)+(app.underwater?.dynamics.surfaceHeight(p.x,p.z)||0);
    const mean=U.uSeaLevel.value+event;
    if(Math.abs(p.y-mean)>85){this.height=mean;this.counter=0;}
    else if(this.counter++%3===0){
      this.probe.uniforms.uProbePosition.value.set(p.x,p.z);
      this.probe.render(app.renderer,this.probeTarget);
      app.renderer.readRenderTargetPixels(this.probeTarget,0,0,1,1,this.samples);
      if(Number.isFinite(this.samples[0]))this.height=this.samples[0];
    }
    U.uCameraWaterDepth.value=this.height-p.y;
    return this.height;
  }
  render(air,water){
    if(!this.target||this.target.width!==air.width||this.target.height!==air.height){this.target?.dispose();this.target=makeRT(air.width,air.height,{count:2,name:'air-water-interface'});}
    this.pass.set('uAirColor',air.textures[0]).set('uAirDepth',air.textures[1]).set('uWaterColor',water.textures[0]).set('uWaterDepth',water.textures[1]);
    this.pass.render(this.app.renderer,this.target);return this.target;
  }
}
