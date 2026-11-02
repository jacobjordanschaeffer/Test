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
npm test          # Driving physics and lobby protocol checks
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

## Race with friends

Choose **Race with friends**, enter a driver name, and **Create a lobby**. Share **Copy invite link** or the seven-character code. Friends open the same website and join the room. Everyone selects **Ready to race**, then the host selects **Start race**. Up to six drivers share the same course, countdown, visible trucks, minimap markers, and live standings. Choose a truck and paint in the Garage before joining.

Trucks pass through each other to keep casual racing smooth despite network latency. Race time continues if you pause. The host can return everyone to the lobby for a rematch; leaving the host's browser closes the room. Rooms cannot be joined after a race has started. Results update while the remaining drivers finish. This is casual, client-simulated racing, not cheat-resistant ranked competition.

Single-player remains offline-capable after assets load. Multiplayer needs the public PeerJS signaling service (`0.peerjs.com`) and browser WebRTC connections, with Google's public STUN service used for NAT discovery. No player accounts or API keys are needed. The service has no guaranteed uptime, and some school/work networks, VPNs, firewalls, or NAT configurations block peer connections. There is no configured TURN relay or host migration; if a connection times out, use another network or play solo. Keep room codes between your friends.

### Multiplayer validation

Start `npm run dev -- --port 5173` and `npm run signal:test` in separate terminals. Then run `npm run test:multiplayer` with an installed Chromium browser (`CHROMIUM_PATH` can override its path). The test uses independent browser contexts, a real local PeerServer, and real WebRTC data channels to check joining, readiness, shared countdown, remote motion/rendering, pause timing, finishing, rematch, and host departure. The QA `simulation` flag skips repeated GPU rendering during network simulation; one explicit frame verifies the remote truck can render. Normal gameplay always renders.

The GitHub Pages workflow runs the multiplayer browser suite on GitHub's hosted runner with both local and public signaling before deploying. The managed cloud onboarding browser disables non-proxied WebRTC UDP by policy, so it cannot complete this end-to-end test locally; its passing unit checks are distinct from the hosted browser result. Set `TEST_PUBLIC_PEER=1` to test the same browser flow using the public signaling service instead of the local server, where network policy permits.

## Arcade chaos update

Drivers can type their own name before creating or joining a room, or change it with **Your driver name → Save name** inside the lobby. Names are remembered in that browser and synchronized to the roster and standings. Names can be edited until the race starts.

Every district now has interactive arcade hazards:

- **Cyan boost pads:** a temporary acceleration and top-speed boost.
- **Potholes:** a speed penalty and suspension/camera bounce.
- **Oil slicks:** reduced tire grip for a short period; ease off the steering.
- **Striped roadblocks:** solid partial-lane barriers with room to pass.
- **Godzilla events:** an original procedural kaiju appears alongside the road. Amber rings warn where rubble will fall. Dodge the rubble and expanding atomic shockwave. The event clears after fourteen seconds, and another can happen about forty-two seconds later.

Chaos is enabled in both solo modes and friend races. Multiplayer uses a shared course seed and host-broadcast monster event positions/timestamps. The host targets the leading checkpoint area, and every browser sees the same attack; vehicle impacts are simulated locally as part of casual racing. Boosts, oil, and impacts expire; warnings give drivers a chance to dodge, and roadblocks leave a passing lane.

`npm test` includes deterministic hazard generation, effect duration/cooldown, host scheduling, name editing, and network message checks. With Vite running, `npm run test:chaos` exercises actual truck boost speed, pothole/oil effects, roadblock collision, monster warnings, and rubble rendering/impact. The hosted multiplayer suite also checks name changes and identical hazard/event data across independent browsers before deployment.

## Connection stability and graphics

The guest handshake timeout is cleared as soon as the data channel opens; a connected racer no longer gets disconnected by that eighteen-second timer. Temporary signaling-service loss triggers a reconnect while established driver connections remain active. Actual host departure or a failed direct data connection still ends that connection; this does not add a TURN relay or solve every restrictive-network problem.

Idle lobbies send a heartbeat once per second instead of ten times per second. Movement coordinates are rounded for smaller packets; redundant snapshots are skipped when the outgoing channel is backed up, while checkpoint transitions are sent reliably. The standings DOM updates only when its displayed values or order change.

In **Settings → Graphics**, choose **Performance** for lower resolution and no shadows, **High** for visual quality, or **Auto** (default) to lower rendering cost when frame rates are poor. The choice is remembered in your browser. Hosts should keep the game tab active while racing.

Regression checks include a guest staying in the lobby for more than twenty seconds, reconnecting the host's signaling service during a race, queue backpressure without lost checkpoint transitions, and saved performance settings.
