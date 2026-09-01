const ease=t=>t*t*(3-2*t);

export function cellSeed(x,z,seed=713,salt=0) {
  let h=Math.imul(x^0x9e3779b9,0x85ebca6b)^Math.imul(z^salt,0xc2b2ae35)^(seed>>>0);
  h=Math.imul(h^(h>>>16),0x7feb352d);h=Math.imul(h^(h>>>15),0x846ca68b);
  return (h^(h>>>16))>>>0;
}

export function fieldNoise(x,z,seed=713) {
  const ix=Math.floor(x),iz=Math.floor(z),tx=ease(x-ix),tz=ease(z-iz);
  const h=(dx,dz)=>cellSeed(ix+dx,iz+dz,seed)/4294967295;
  const a=h(0,0)*(1-tx)+h(1,0)*tx,b=h(0,1)*(1-tx)+h(1,1)*tx;
  return a*(1-tz)+b*tz;
}
