# Tokyo Run — Kei Truck Club

A browser driving game built with Three.js, JavaScript, and Vite. Explore an original, fictional Tokyo-inspired city or race the 6.54 km temple-to-tower route through 21 ordered checkpoints. All buildings, vehicles, street details, textures, and audio are generated locally. No map services, backend, accounts, or API keys are needed.

## Run locally

Use Node.js 22.12+ (Node 24 is also supported).

```sh
npm ci
npm run dev
```

Open the URL Vite prints in a current desktop Chrome or Edge browser. WebGL and a keyboard are required. Click a menu button to enable browser audio.

```sh
npm test          # Six driving-physics and collision checks
npm run build    # Production output in dist/
npm run preview  # Serve the production build
```

For automated browser checks, start the development server on port 5173, then run `npm run test:browser`. The test uses `/usr/bin/chromium`; set `CHROMIUM_PATH` to use a different Chromium executable. It checks vehicle and paint selection, driving, all camera modes, pause/reset/minimap controls, route clearance, checkpoint order, finish results, best-time persistence, and restarts. Test screenshots are written under `/tmp/tokyo-*.png`.

## Play

- **Tokyo Run:** follow the gold route and checkpoint gates from the temple to the tower. Checkpoints must be visited in order. Brake before the tight corners. The timer starts after the countdown; your best finish is stored in this browser.
- **Free Roam:** explore the same city, connecting side streets, and the riverside bridge loop. Change trucks through the pause menu's garage.
- **Garage:** choose one of six stylized kei trucks and six paint colors. Each has different acceleration, grip, and top speed.
- **Settings:** choose afternoon, sunset, or night; set volume or mute.

| Control          | Action                                                    |
| ---------------- | --------------------------------------------------------- |
| W / Up           | Accelerate                                                |
| S / Down         | Brake, then reverse                                       |
| A D / Left Right | Steer                                                     |
| Space            | Handbrake                                                 |
| C                | Chase / interior / cinematic camera                       |
| R                | Return to your last checkpoint, or the start in free roam |
| M                | Toggle local route minimap                                |
| Escape           | Pause / resume                                            |

A standard mapped controller also supports RT acceleration, LT braking/reverse, left-stick steering, A handbrake, Y camera, and Start pause. Keyboard remains available. Gamepad behavior depends on browser/controller mapping.

## Implementation

`src/main.js` manages the renderer, camera, interface, input, and race state. `world.js` builds and batches the city; `trucks.js` builds the selectable vehicles; `physics.js` runs the shared fixed-step driving simulation; `route.js` contains the fictional route and collision helpers; `audio.js` synthesizes sound through Web Audio.

The city uses instanced architectural details and merged static props, atmospheric fog, soft directional shadows, local procedural asphalt, illuminated signs, and generated vehicle lights. Physics uses a flat driving plane with momentum, speed-sensitive steering, body roll, handbrake grip changes, and obstacle collisions. This is a stylized arcade game: trucks are procedural interpretations rather than licensed photorealistic models, and suspension movement is visual rather than a wheel-by-wheel simulation.

For software-rendered/headless machines, append `?low` to reduce render resolution and disable shadows. Browser QA uses `?qa&low`; only `?qa` enables the explicit testing hooks. The hooks are absent in ordinary sessions.

## Assets and licensing

Vehicle and world geometry, procedural textures, and synthesized audio were created for this project. Three.js and Vite are MIT-licensed. Locally bundled Inter and Barlow Condensed fonts are distributed through Fontsource under the SIL Open Font License; their license files are included in `public/licenses/` and copied into production builds. No remote fonts, images, or audio are requested at runtime.

## Play in a browser with GitHub Pages

No local applications are needed once the site is deployed. In this repository's **Settings → Pages**, choose **GitHub Actions** as the build source. Then open **Actions → Deploy Tokyo Run to GitHub Pages → Run workflow** (branch `main`). Subsequent pushes to `main` deploy automatically. The workflow runs the physics tests, builds the game, and publishes only `dist/`.

The expected URL after a successful deployment is `https://jacobjordanschaeffer.github.io/Test/`. Check the deployment's output for the actual URL; the address is not live until Pages is enabled and deployment succeeds. GitHub Pages for private repositories requires an eligible paid GitHub plan. This setup does not change repository visibility or purchase a plan.
