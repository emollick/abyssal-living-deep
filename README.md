# ABYSSAL — The Living Deep

A procedural expansion of [ABYSSAL by Token-Gremlin](https://github.com/Token-Gremlin/natural-disasters). Begin at sea level, floating with the waves. Dive into a sunlit reef, a kelp forest, the continental slope and a 1,400-metre trench, all grown together from one seed. Swim through the waterline into the sky, or follow the canyon into the dark.

[**Explore the living deep**](https://abyssal-living-deep.netlify.app/)

![The sea-level opening, with a direct route into the reef](docs/media/living-surface.jpg)

## One ocean, four habitats

| Dive site | Landscape and life |
| --- | --- |
| Coral cathedral | Weathered limestone shelves, coral colonies and sandy channels; striped butterflyfish, parrotfish, reef sharks and manta rays above octopuses, crabs, sea stars and urchins. |
| The sunken forest | A seeded canopy of giant kelp, seals, silver shoals and turtles; crabs, octopuses, sea stars and urchins on the sandy floor. |
| Into the blue | A continental drop-off, stone pinnacles, a passing humpback whale, dolphins, tuna, ocean sunfish and jetting squid. |
| The midnight garden | Mineral chimneys, vent plumes and tube worms; anglerfish, gulper eels and flapjack octopuses above isopods, brittle stars, sea cucumbers and vent shrimp. |

All four habitats exist together in one generated landscape. **Dive into the reef** begins the first descent from the opening view. The site buttons travel between habitats; they do not replace the scene or reset the weather. **Ascend** returns to a floating view at sea level. **Descend** follows the canyon from the shelf, or dives directly when you are already over the trench. Choose a depth stop, interrupt a journey with **Stop here**, or swim freely with **Q / E** to descend and ascend.

**World lab** has four control tabs: **World** for seeds, terrain and living cover; **Life** for animal populations; **Water** for visibility, currents, dive lighting and upwelling; and **Weather** for sky, wind, waves and ocean events. It opens to Weather at sea level and keeps the selected tab during your visit. Arrow keys move between tabs; Escape closes the lab.

Numeric and text seeds are reproducible; **New seed** grows another landscape. **Reset recipe** restores the seed, world, weather and automatic dive-light defaults. **Copy world link** includes the seed, starting view, procedural dials, weather settings, dive-light override and any explicit quality choice. **View & controls**, beneath each tab, contains the waterline view, rendering quality and help.

![Generated coral colonies rooted in irregular limestone shelves](docs/media/living-reef.jpg)

| The sunken forest | Into the blue |
| --- | --- |
| ![Seals above a procedural kelp forest](docs/media/living-kelp.jpg) | ![Sunfish, tuna and squid near a whale](docs/media/living-blue.jpg) |

The descent has overlapping animal communities. Around **200 metres**, lanternfish, hatchetfish, squid and midwater shrimp gather beside the canyon. At **600 metres**, vampire squid and dragonfish join them. At **1,000 metres**, anglerfish, gulper eels and flapjack octopuses appear. Sea pens and brittle stars occupy the slope; the vent garden has a separate community on the bottom. The **Nearby** line names animals close to your position.

![Vampire squid, dragonfish and hatchetfish in the lower twilight](docs/media/living-twilight.jpg)

![Anglerfish, octopuses, isopods and brittle stars in the midnight garden](docs/media/living-deep.jpg)

The 25 creature types have generated anatomy, seeded proportions and markings, and movement suited to their bodies. Fish turn and bank into their direction of travel; tail and fin strokes respond to swimming effort. Sunfish paddle with their tall fins, seals sweep their hindquarters sideways, and squid contract their mantles as they jet backward. Rays, turtles and the whale alternate stronger strokes with quieter gliding. Jellies and long drifting chains are sparse at the default settings.

Schools keep space between neighbors, turn around large rocks, and scatter around nearby hunters or a swimming diver before regrouping. Reef fish approach feeding patches on the generated rock surfaces and pause with their heads lowered. Bottom dwellers move in short bouts, with crabs walking sideways and legs settling during pauses. The steering runs at a fixed time step, with smooth rendering between updates; pausing holds both animal positions and appendages. The camera does not disturb animals in Drift mode.

Choose **Observe** to study wildlife in the actual camera view. The marker follows the selected animal; **Next in view** cycles between visible animal groups, and tapping an animal selects it. **Follow animal** eases the camera toward a comfortable viewing distance and tracks its movement. Swimming, changing habitats, or closing observation releases the camera. The observation camera does not frighten animals.

After a moment in view, the animal is recorded in the **Field journal**, which keeps the first sighting's depth and seed in this browser. Identification respects distance, the camera frame, rock and terrain occlusion, and available light; unlit animals in the dark do not count. The journal describes the generated animal groups, with natural-history links for selected entries. It does not identify exact biological species.

The shallow sandy margins grow irregular patches of **seagrass**, with rooted blades that bend in the current. Living cover controls their density. Dolphins, seals, sea turtles and the humpback make gradual **surface excursions** on staggered cycles, returning to their cruising depths. These animation cycles use compressed time, not measured breathing intervals.

**Ocean sound**, in World lab → Water, is optional and off at the start of each visit. Synthesized surf and water change with weather and depth; sparse reef crackle fades away from the reef, and distant whale-like calls occur near the whale. The volume dial and **M** shortcut control sound. Pausing or hiding the tab silences it. No sound recordings or microphone access are used.

The interface keeps the dive title, nearby animals and depth in view. Routine actions stay quiet. Observation replaces the title only when requested; the journal is opened separately. The seed and population count are in the lab, with performance details under **View & controls**.

## Procedural dials

- **Terrain relief** changes the seeded seafloor and rock formations.
- **Living cover** rebuilds the density of coral, kelp and benthic life.
- **Kelp height** rebuilds the forest canopy, wherever you are in the ocean.
- **Animal abundance** scales the animal population, including swimmers and bottom dwellers. Zero removes them all.
- **Hunters** changes the abundance of sharks, tuna, dragonfish, anglerfish and gulper eels.
- **Bottom dwellers** changes octopuses, crabs, sea stars, urchins, isopods, sea cucumbers, sea pens and vent shrimp independently of swimming animals.
- **Jellies & drifters** changes jellyfish and siphonophore chains. Zero removes both.
- **Water clarity** changes wavelength-dependent extinction and visibility.
- **Current strength** controls water advection, swimming drift, kelp and particles. Surface weather and disaster currents weaken with depth.
- **Bioluminescence** controls living light, especially at night and in the deep.
- **Dive light** switches between automatic depth-based lighting, on and off. The toolbar light button provides a quick manual override.
- **Deep upwelling** changes the vent plumes and upward flow. Its nutrients gradually feed a surface bloom, which glows when waves disturb it at night.
- **Sun elevation, cloud cover, wind, swell and storm intensity** drive shared weather. Expand **More weather dials** for direction, swell period, choppiness, amplitude, rain, haze and cloud density. Day, dusk, storm and night provide starting conditions.

**Trigger a seafloor tremor** stirs sediment around the deep vents and sends an expanding wave train across the surface. The event continues while you ascend, descend or visit another habitat. The original rogue waves, whirlpools, tsunamis, lightning, waterspouts and hurricanes are available in the same lab.

Geometry dials rebuild on release. Population dials replace the animal communities without regrowing the scenery. Water and weather dials respond while dragging. Use the arrow keys for small changes and Home/End for the limits.

## Explore

| Control | Action |
| --- | --- |
| **Ascend / Descend** | Continuous travel to the surface / abyss |
| **Depth stops** | Travel to the surface, 200 m, 600 m, 1,000 m or the vent garden |
| **Drift / Swim** | Drift in place / manual exploration |
| **W A S D** | Swim in the direction you look |
| **Drag** | Look around |
| **Q / E** | Down / up |
| **Shift** | Swim faster |
| **Mouse wheel** | Zoom in Swim mode |
| **1–4** | Travel to a habitat in the same ocean |
| **G / R** | Open world lab / generate a new seed |
| **O / J** | Observe wildlife / open the field journal |
| **M** | Enable or mute ocean sound |
| **F / P / H** | Toggle swimming / pause simulation / hide controls |
| **L** | Override the automatic deep-water light |
| **Camera button** | Save a PNG without the interface |
| **Float at the waterline** | Follow the actual waves at the boundary between air and water; in World lab → View & controls |

Touch layouts provide hold-to-swim buttons and drag-to-look. Desktop graphics are recommended. The scene requires WebGL2 and floating-point render targets; automatic quality scaling and lower presets help slower devices. Phone hardware performance is not guaranteed.

## The original ocean is still here

The surface retains the original multi-cascade FFT waves, volumetric atmosphere and clouds, rain, lightning, waterspouts, whirlpools, hurricanes, rogue waves and tsunamis. Both sides share a clock and the same live weather and disaster fields. Storms stir the shallows, whirlpools draw water down, and long waves transfer momentum below the surface. Upwelling and seafloor tremors affect the sea above.

The waterline samples all three FFT cascades and live event displacement. Clear water reveals the generated reef from above; the underwater window refracts the actual sky environment. Crossing the surface blends the two views at the moving wave boundary. Sunlight, water colour, exposure and the dive light change gradually through the descent.

Below the surface are a continuous seeded seabed, a steep canyon, cold-water colonies, drifting siphonophore chains, wavelength-dependent attenuation, wave-driven caustics, shadows, light shafts, marine snow, kelp, instanced schools and generated animals. Cloud-volume baking preserves every depth slice, and the night sky includes procedural stars and a moon. Everything is generated from JavaScript and GLSL. There are no downloaded textures, models, fonts or audio files. Repository screenshots are documentation only.

The shallow habitats use wavelength-dependent sunlight, textured sediment, weathered rock, branching coral and clustered kelp fronds. In the deep, paired dive lights reveal mineral chimneys, tube worms and small animals near the floor; the water beyond the lights is dark. Coral and tube worms do not emit light. Bioluminescence belongs to luminous animal organs and the surface bloom.

Travel speeds and transport times are compressed for exploration. Animal sizes are approximate, and these habitats combine species from different oceans. Anatomy, lighting and materials are procedural approximations, not scanned specimens. This is an artistic simulation, not an ecological, oceanographic or disaster-prediction model.

Deep-water anatomy and broad habitat choices were informed by MBARI's profiles of [gulper eels](https://www.mbari.org/animal/whiptail-gulper-eel/), [flapjack octopuses](https://www.mbari.org/animal/flapjack-octopus/), [vampire squid](https://www.mbari.org/animal/vampire-squid/) and [anglerfish](https://www.mbari.org/animal/deep-sea-anglerfish/), and [NOAA's bioluminescence overview](https://oceanexplorer.noaa.gov/education/bioluminescence/). Movement references include NOAA's [harbor-seal anatomy](https://oceantoday.noaa.gov/sealanatomy/) and [parrotfish grazing](https://oceanservice.noaa.gov/facts/sand.html). Swimming speeds, encounter distances and feeding cycles are composed for exploration, as are the populations and depth boundaries; they are not measured behavior or distribution data. No source images or models are used by the app.

## Run locally

Requires Node.js 20.19+ or 22.12+.

```sh
npm ci
npm run dev
```

```sh
npm test        # quality, terrain, journeys, flow, generation, anatomy and animal behavior
npm run build  # static site in dist/
npm run preview
```

Deploy `dist/` to any static host. `netlify.toml` contains the Netlify build settings. The GitHub Pages workflow is available for manual use; it does not deploy automatically.

### Reproducible URLs

```text
?site=reef&seed=713
?seed=713
?site=kelp&seed=5819&life=1.3&height=1.2&current=1.5
?site=deep&seed=82017&glow=1.5
?site=reef&seed=713&depth=200
?site=reef&seed=713&depth=600&predators=1.4&jellies=0
?site=deep&seed=713&benthos=1.5&shoal=1.2
?site=deep&seed=713&surface=1&light=night&upwelling=3
?site=reef&seed=713&surface=waterline
?site=deep&seed=713&lamp=off
?site=reef&seed=713&light=storm&preset=high&adaptive=0
```

Supported sites: `reef`, `kelp`, `blue`, `deep`. A fresh visit, including a seed-only link, starts floating at sea level. An explicit `site` link starts inside that habitat; `surface=1` instead starts at sea level above it, and `surface=waterline` puts the lens at the air/water boundary. `depth=200` starts on the canyon route. The default world seed is 713. Numeric recipes are clamped to the supported dial ranges, and text seeds become a stable 32-bit seed. The original quality and profiling parameters continue to work; see the [upstream documentation](docs/UPSTREAM.md).

## Code

The existing rendering pipeline remains in `src/core`, `src/ocean`, `src/sky`, `src/weather` and `src/post`. The underwater extension is in `src/underwater`:

| File | Purpose |
| --- | --- |
| `WorldMath.js` | Seeded randomness, recipes, floor field, current attenuation and swimming bounds |
| `OceanDomain.js` | Continuous bathymetry, initial view, floating eye height, habitat placement, depth stops and safe routes |
| `OceanDynamics.js` | Depth-dependent currents, upwelling, nutrient transport and seafloor pulses |
| `OceanTerrain.js` | Continuous shelf and canyon, wall colonies and midwater life |
| `WaterInterface.js` | Actual-wave probe and continuous air/water compositing |
| `ReefGeometry.js` | Generated terrain, reef shelves, coral, kelp, sponges and mineral chimneys |
| `MarineLife.js` | Shoals, rays, turtles, whales and jellyfish |
| `FaunaGeometry.js` | Generated anatomy, markings and light organs for 25 added creature types |
| `OceanFauna.js` | Seeded animal communities, population dials, schooling, avoidance and terrain-following movement |
| `AnimalMotion.js` | Fixed-step steering, neighborhood spacing, rock avoidance, encounters and movement-driven animation phases |
| `OceanEcology.js` | Staggered surface excursions and depth-dependent sound mixing |
| `WildlifeWatch.js` | Visible-animal selection, follow camera, and field journal interface |
| `FieldNotes.js` | Animal descriptions, sightline checks, and local journal persistence |
| `OceanSound.js` | Optional procedural surf, water, reef transients and distant calls |
| `UnderwaterMaterial.js` | Surface shading, caustics, absorption, fog and water ceiling |
| `UnderwaterWorld.js` | World generation, light shafts, shadows, particles and render integration |
| `Expedition.js` | World lab, sharing, exploration controls and habitat selection |

Logic tests cover the sea-level entry, explicit dive links, floating-camera behavior, coral attachment, all habitat-to-habitat routes across multiple seeds and terrain settings, agreement between rendered terrain and collision height, pause invariants, and effects in both directions. Fauna checks cover distinct anatomy, finite geometry, repeatable seeds, population controls, encounters inside the actual view at depth stops, seafloor clearance and continuous motion. They do not replace visual testing. Inspect all habitats and depth communities, complete ascent/descent journeys, the waterline, and clear/dusk/storm/night conditions. Keep the source free of external art assets.

## Credits and license

Based on **ABYSSAL / natural-disasters**, created by **Davi (Token-Gremlin)**. The original authorship, Git history and MIT license are retained. This fork adds the procedural underwater world. Three.js is the sole runtime dependency.

[MIT license](LICENSE) · [Original project](https://github.com/Token-Gremlin/natural-disasters) · [Original documentation and references](docs/UPSTREAM.md)
