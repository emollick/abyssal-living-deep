import { clamp, smooth } from './OceanDomain.js';

// Composed, compressed dive cycles. These are animation rhythms, not measured
// breath-hold limits. A quintic curve makes both velocity and acceleration meet
// the cruise smoothly at either end of a surface excursion.
const cycleSettings = {
  dolphin: [118, .33, .91], seal: [164, .37, .93],
  turtle: [212, .46, .94], whale: [240, .34, .94],
};
const ease = value => { const t = clamp(value, 0, 1); return t*t*t*(t*(t*6-15)+10); };

export function surfaceExcursion(type, time, phase = 0) {
  const settings = cycleSettings[type];
  if (!settings) return 0;
  const [period, start, end] = settings;
  const t = ((time / period + phase * .037) % 1 + 1) % 1;
  return ease((t-start)/.25) * (1-ease((t-(end-.25))/.25));
}

export function excursionDepth(type, time, phase, cruiseDepth) {
  const surface = type === 'whale' ? -1.15 : type === 'turtle' ? -.28 : -.35;
  return cruiseDepth + (surface-cruiseDepth)*surfaceExcursion(type,time,phase);
}

// The mix is also used by the sound engine's offline check. It follows the
// current habitat and depth, never a looping scene soundtrack.
export function soundscapeMix({depth=0, wind=5, storm=0, reef=0, whale=0, paused=false, hidden=false, volume=.35}={}) {
  const wet = smooth(-.4, 1.3, depth), shallow = Math.exp(-Math.max(0, depth)/42);
  const active = paused || hidden ? 0 : clamp(volume,0,1);
  return {
    master: active * .65,
    surf: (1-wet)*(.065+clamp(wind,0,60)*.003+clamp(storm,0,1)*.07)+wet*shallow*.024,
    water: wet*(.028+shallow*.016),
    cutoff: 220+shallow*780+(1-wet)*3300,
    reef: wet*clamp(reef,0,1)*shallow,
    whale: wet*clamp(whale,0,1),
  };
}
