# ABYSSAL — The Living Deep

A fully procedural underwater expansion of [ABYSSAL by Token-Gremlin](https://github.com/Token-Gremlin/natural-disasters). Grow an ocean from a seed, swim through it, and change the conditions above and below the surface.

[**Explore the living deep**](https://abyssal-living-deep.netlify.app/)

![A generated coral reef](docs/media/living-reef.jpg)

## Four starting worlds

| Dive site | Landscape and life |
| --- | --- |
| Coral cathedral | Eroded limestone arches, layered reef shelves, branching and plate coral, barrel sponges, brain coral, shoals and manta rays. |
| The sunken forest | A seeded canopy of giant kelp, individually modeled ribbons, sandy channels, silver fish and swimming turtles. |
| Into the blue | A continental drop-off, stone pinnacles, a passing humpback whale, shoals and drifting jellies. |
| The midnight garden | Mineral chimneys, rising vent plumes, tube worms, luminous colonies and pulsing jellyfish. |

These are recipes, not fixed backdrops. **World lab** changes the generated world. A numeric or text seed is reproducible; **New seed** grows a different landscape. **Copy world link** includes the seed, habitat, procedural dials, weather settings and any explicit quality choice.

| The sunken forest | Into the blue |
| --- | --- |
| ![Procedural kelp forest](docs/media/living-kelp.jpg) | ![A whale above a silver shoal](docs/media/living-blue.jpg) |

![Bioluminescent jellyfish in the midnight garden](docs/media/living-deep.jpg)

## Procedural dials

- **Terrain relief** changes the seeded seafloor and rock formations.
- **Living cover** rebuilds the density of coral, kelp and benthic life.
- **Kelp height** changes the forest canopy; enabled at the kelp site.
- **Fish abundance** rebuilds shoals and changes jellyfish abundance. Zero removes all swimming animals.
- **Water clarity** changes wavelength-dependent extinction and visibility.
- **Current strength** controls kelp motion and particle advection. Storm-driven currents weaken with depth.
- **Bioluminescence** controls living light, especially at night and in the deep.
- **Sun elevation, cloud cover, wind, swell and storm intensity** drive the shared weather state. Day, dusk, storm and night presets provide starting conditions.

Geometry dials rebuild on release. Water and weather dials respond while dragging. Use the arrow keys for small changes and Home/End for the limits.

## Explore

| Control | Action |
| --- | --- |
| **Drift / Swim** | Guided camera / manual exploration |
| **W A S D** | Swim in the direction you look |
| **Drag** | Look around |
| **Q / E** | Down / up |
| **Shift** | Swim faster |
| **Mouse wheel** | Zoom |
| **1–4** | Choose a dive site |
| **G / R** | Open world lab / generate a new seed |
| **F / P / H** | Toggle swimming / pause simulation / hide controls |
| **L** | Toggle the dive light |
| **Camera button** | Save a PNG without the interface |
| **Surface** | Return to the original ocean and extreme-weather sandbox |

Touch layouts provide hold-to-swim buttons and drag-to-look. Desktop graphics are recommended. The scene requires WebGL2 and floating-point render targets; automatic quality scaling and lower presets help slower devices. Phone hardware performance is not guaranteed.

## The original ocean is still here

The surface retains the original multi-cascade FFT waves, volumetric atmosphere and clouds, rain, lightning, waterspouts, whirlpools, hurricanes, rogue waves and tsunamis. The underwater renderer shares its clock, sunlight, weather and wave textures. The ceiling samples the actual FFT displacement and slopes; cloud cover darkens the water, storms stir shallow currents, and lightning illuminates the shallows.

Below the surface, the extension adds procedural geometry, wavelength-dependent water attenuation, moving caustics, shadow maps, volumetric light shafts, marine snow, vertex-driven kelp motion, instanced schools, generated animal meshes, and a separate exposure treatment for the deep. Everything is generated from JavaScript and GLSL. There are no downloaded textures, models, fonts or audio files. Repository screenshots are documentation only.

This is an artistic simulation, not an ecological, oceanographic or disaster-prediction model.

## Run locally

Requires Node.js 20.19+ or 22.12+.

```sh
npm ci
npm run dev
```

```sh
npm test        # quality controller, reproducible generation, geometry and movement checks
npm run build  # static site in dist/
npm run preview
```

Deploy `dist/` to any static host. `netlify.toml` contains the Netlify build settings. The GitHub Pages workflow is available for manual use; it does not deploy automatically.

### Reproducible URLs

```text
?site=reef&seed=713
?site=kelp&seed=5819&life=1.3&height=1.2&current=1.5
?site=deep&seed=82017&glow=1.5
?site=reef&seed=713&light=storm&preset=high&adaptive=0
```

Supported sites: `reef`, `kelp`, `blue`, `deep`. Numeric recipes are clamped to the supported dial ranges. Text seeds are converted into a stable 32-bit seed. `surface=1` starts above water. The original quality and profiling parameters continue to work; see the [upstream documentation](docs/UPSTREAM.md).

## Code

The existing rendering pipeline remains in `src/core`, `src/ocean`, `src/sky`, `src/weather` and `src/post`. The underwater extension is in `src/underwater`:

| File | Purpose |
| --- | --- |
| `WorldMath.js` | Seeded randomness, recipes, floor field, current attenuation and swimming bounds |
| `ReefGeometry.js` | Generated terrain, arches, coral, kelp, sponges and vents |
| `MarineLife.js` | Generated animal anatomy and instanced schooling motion |
| `UnderwaterMaterial.js` | Surface shading, caustics, absorption, fog and water ceiling |
| `UnderwaterWorld.js` | World generation, light shafts, shadows, particles and render integration |
| `Expedition.js` | World lab, sharing, exploration controls and habitat selection |

Logic tests do not replace visual testing. Rendering changes should be inspected across all four habitats, multiple seeds, clear/dusk/storm/night conditions, and the original surface mode. Keep the source free of external art assets.

## Credits and license

Based on **ABYSSAL / natural-disasters**, created by **Davi (Token-Gremlin)**. The original authorship, Git history and MIT license are retained. This fork adds the procedural underwater world. Three.js is the sole runtime dependency.

[MIT license](LICENSE) · [Original project](https://github.com/Token-Gremlin/natural-disasters) · [Original documentation and references](docs/UPSTREAM.md)
