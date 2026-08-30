import { oceanFloor, constrainToOcean } from './OceanDomain.js';
export const TAU = Math.PI * 2;

export const GENERATOR_DEFAULTS = { relief: 1, life: 1, height: 1, shoal: 1, clarity: 1, current: 1, glow: 1, upwelling: 0.65, predators: 1, benthos: 1, jellies: 0.65 };

export function normalizeGenerator(input = {}) {
  const ranges = { relief: [0.2, 2.2], life: [0, 1.8], height: [0.3, 1.4], shoal: [0, 2], clarity: [0.35, 2], current: [0, 3], glow: [0, 3], upwelling: [0, 3], predators: [0, 2], benthos: [0, 2], jellies: [0, 2] };
  const out = {};
  for (const [key, fallback] of Object.entries(GENERATOR_DEFAULTS)) {
    const n = Number(input[key]);
    out[key] = input[key] !== undefined && Number.isFinite(n) ? Math.max(ranges[key][0], Math.min(ranges[key][1], n)) : fallback;
  }
  return out;
}

export function parseSeed(value, fallback = 713) {
  if (value == null || value === '') return fallback;
  if (/^\d+$/.test(String(value))) return Number(value) >>> 0;
  let h = 2166136261;
  for (const c of String(value)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function seeded(seed = 73129) {
  let s = seed >>> 0;
  return () => {
    s += 0x6D2B79F5;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export const HABITATS = [
  {
    id: 'reef', name: 'Coral cathedral', short: 'The reef', number: '01',
    subtitle: 'A world beneath the waves.',
    description: 'Follow a sandy channel between weathered limestone shelves. Shoals turn above branching coral, sponges and encrusted rock.',
    depth: 28, color: '#c9e4d7', tint: [0.006, 0.105, 0.145], extinction: [0.027, 0.016, 0.011],
    eye: [-1, -19, 28], look: [3, -20, -17], seed: 713,
    species: 'ANTHIAS · BUTTERFLYFISH · MANTA RAYS',
  },
  {
    id: 'kelp', name: 'The sunken forest', short: 'Kelp forest', number: '02',
    subtitle: 'The forest moves with the sea.',
    description: 'Long ribbons of kelp reach for the surface. Swim between the stems as the whole forest leans into the current.',
    depth: 34, color: '#e5d6a0', tint: [0.025, 0.085, 0.065], extinction: [0.032, 0.021, 0.028],
    eye: [2, -18, 33], look: [0, -17, -8], seed: 5819,
    species: 'GIANT KELP · SILVER SHOALS · SEA TURTLES',
  },
  {
    id: 'blue', name: 'Into the blue', short: 'Open ocean', number: '03',
    subtitle: 'Small, in the company of giants.',
    description: 'The reef falls away. A whale crosses the open water, and a river of silver fish folds around the last stone pinnacles.',
    depth: 91, color: '#b4dcf3', tint: [0.003, 0.055, 0.14], extinction: [0.030, 0.012, 0.008],
    eye: [0, -43, 41], look: [0, -42, -18], seed: 991,
    species: 'HUMPBACK WHALE · SARDINE SHOALS · JELLYFISH',
  },
  {
    id: 'deep', name: 'The midnight garden', short: 'The deep', number: '04',
    subtitle: 'Life, after the light.',
    description: 'Anglerfish wait above the mineral chimneys. Pale octopuses paddle through the dark, while crabs, isopods and sea cucumbers work the seafloor.',
    depth: 1434, color: '#a2e7de', tint: [0.002, 0.008, 0.018], extinction: [0.039, 0.025, 0.020],
    eye: [0, -1419, 36], look: [0, -1432, -11], seed: 82017,
    species: 'ANGLERFISH · FLAPJACK OCTOPUSES · VENT SHRIMP',
  },
];

export function habitatFor(id) {
  return HABITATS.find(h => h.id === id) || HABITATS[0];
}

export function floorHeight(x, z, habitat = HABITATS[0]) {
  const h = typeof habitat === 'string' ? habitatFor(habitat) : habitat;
  if (h.connected) return oceanFloor(x+h.origin[0],z+h.origin[1],h);
  const phase = ((h.seed ?? 713) % 997) * 0.003;
  const relief = h.relief ?? 1;
  const broad = Math.sin(x * 0.039 + phase) * Math.cos(z * 0.036 + phase * 0.5) * 2.0 * relief;
  const dunes = Math.sin(x * 0.105 + Math.sin(z * 0.075 + phase) * 1.3) * 0.72 * relief;
  const fine = Math.sin(x * 0.22 + z * 0.09) * Math.cos(z * 0.16) * 0.25;
  if (h.id === 'blue') return -h.depth + broad * 3 + Math.max(0, 1 - Math.hypot(x + 31, z + 15) / 39) ** 2 * 30;
  if (h.id === 'deep') return -h.depth + broad * 1.6 + dunes * 1.5 + fine;
  // A sandy channel gives the eye a route through the reef instead of an even scatter of props.
  const channel = Math.exp(-Math.pow((x - Math.sin(z * 0.055) * 5) / 10, 2));
  return -h.depth + broad + dunes + fine - channel * 1.7 * relief;
}

export function currentAt(time, depth, wind, storm = 0) {
  const shelter = Math.exp(-Math.max(0, depth) / 48);
  return (0.22 + wind * 0.022 + storm * 0.7) * (0.22 + shelter * 0.78)
    * (0.88 + Math.sin(time * 0.23) * 0.12);
}

export function cameraPose(habitat, elapsed) {
  const h = typeof habitat === 'string' ? habitatFor(habitat) : habitat;
  const t = elapsed * 0.028;
  return {
    eye: [h.eye[0] + Math.sin(t) * 4, h.eye[1] + Math.sin(t * 1.31) * 1.1, h.eye[2] - (1 - Math.cos(t * 0.83)) * 3],
    look: [h.look[0] + Math.sin(t * 0.67) * 4, h.look[1] + Math.sin(t * 0.78) * 1.0, h.look[2]],
  };
}

export function constrainSwimmer(position, habitat, clearance = 1.6) {
  if (habitat.connected) return constrainToOcean(position, habitat, clearance);
  const radius = Math.hypot(position.x, position.z);
  if (radius > 125) { position.x *= 125 / radius; position.z *= 125 / radius; }
  position.y = Math.max(floorHeight(position.x, position.z, habitat) + clearance, position.y);
  position.y = Math.min(position.y, 3600);
  return position;
}
