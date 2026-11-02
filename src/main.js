import * as T from "three";
import "@fontsource/barlow-condensed/latin-800.css";
import "@fontsource/barlow-condensed/latin-600.css";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-600.css";
import "./style.css";
import { route, checkpoints, districts, sideStreets } from "./route.js";
import { makeTruck, trucks, paints } from "./trucks.js";
import { buildWorld, pedestrians } from "./world.js";
import { Sound } from "./audio.js";
import { drive } from "./physics.js";
const app = document.querySelector("#app"),
  renderer = new T.WebGLRenderer({
    canvas: document.querySelector("#scene"),
    antialias: true,
  });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = T.PCFSoftShadowMap;
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
if (new URLSearchParams(location.search).has("low")) {
  renderer.setPixelRatio(0.5);
  renderer.shadowMap.enabled = false;
}
const scene = new T.Scene();
scene.background = new T.Color("#a4bcb1");
scene.fog = new T.FogExp2("#a4bcb1", 0.003);
const camera = new T.PerspectiveCamera(52, innerWidth / innerHeight, 0.08, 700);
const hemi = new T.HemisphereLight("#d4e7df", "#5c6350", 2.5);
scene.add(hemi);
const sun = new T.DirectionalLight("#ffcf94", 3);
sun.position.set(-70, 100, 70);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, {
  left: -65,
  right: 65,
  top: 65,
  bottom: -65,
  far: 260,
});
sun.shadow.bias = -0.001;
scene.add(sun, sun.target);
const world = buildWorld(scene),
  sound = new Sound();
let selected = 0,
  paint = paints[0],
  truck = makeTruck(selected, paint);
scene.add(truck);
let screen = "home",
  mode = "free",
  paused = true,
  cameraMode = 0,
  minimap = true,
  lighting = "Sunset",
  speed = 0,
  yaw = 0,
  steer = 0,
  elapsed = 0,
  cp = 0,
  countdown = 0,
  best = null,
  toastTime = 0;
try {
  best = Number(localStorage.getItem("tokyo-run-best")) || null;
} catch {}
const keys = new Set(),
  position = new T.Vector3(0, 0, 7),
  velocity = new T.Vector2();
const cameraNames = ["CHASE", "INTERIOR", "CINEMATIC"];
const checkpoint = new T.Group();
const gateMat = new T.MeshBasicMaterial({
  color: "#eac980",
  transparent: true,
  opacity: 0.65,
});
for (const x of [-11, 11]) {
  const post = new T.Mesh(new T.CylinderGeometry(0.18, 0.18, 8, 8), gateMat);
  post.position.set(x, 4, 0);
  checkpoint.add(post);
}
const beam = new T.Mesh(new T.BoxGeometry(22, 0.2, 0.2), gateMat);
beam.position.y = 8;
checkpoint.add(beam);
scene.add(checkpoint);
const headlights = [];
for (const x of [-0.5, 0.5]) {
  const l = new T.SpotLight("#ffebba", 15, 65, 0.5, 0.7, 1);
  l.position.set(x, 1.2, -1.6);
  l.target.position.set(x, 0, -30);
  truck.add(l, l.target);
  headlights.push(l);
}
function changeTruck() {
  scene.remove(truck);
  truck = makeTruck(selected, paint);
  scene.add(truck);
  for (const l of headlights) truck.add(l, l.target);
}
function format(t) {
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${(t % 60).toFixed(2).padStart(5, "0")}`;
}
function toast(s) {
  document.querySelector(".toast")?.remove();
  const d = document.createElement("div");
  d.className = "toast";
  d.textContent = s;
  app.append(d);
  toastTime = 3;
}
function reset() {
  const p = cp ? checkpoints[cp - 1] : [0, 7];
  position.set(p[0], 0, p[1]);
  const next = checkpoints[Math.min(cp, checkpoints.length - 1)];
  yaw = Math.atan2(-(next[0] - p[0]), -(next[1] - p[1]));
  speed = 0;
  velocity.set(0, 0);
}
function start(m) {
  mode = m;
  cp = 0;
  elapsed = 0;
  countdown = m === "race" ? 3.5 : 0;
  screen = "drive";
  paused = false;
  reset();
  sound.start();
  renderUI();
  camera.position.copy(position).add(new T.Vector3(0, 5, 10));
}
function setLight(value) {
  lighting = value;
  const night = value === "Night",
    day = value === "Afternoon";
  const color = night ? "#122f3e" : day ? "#b8d5d3" : "#a4bcb1";
  scene.background.set(color);
  scene.fog.color.set(color);
  hemi.intensity = night ? 0.65 : 2.5;
  sun.intensity = night ? 0.3 : day ? 3 : 2.8;
  sun.color.set(day ? "#fff4df" : night ? "#8facd5" : "#ffcc92");
  renderer.toneMappingExposure = night ? 1.4 : 1.15;
}
function button(text, action, primary = false) {
  return `<button data-action="${action}" class="${primary ? "primary" : ""}">${text}</button>`;
}
function renderUI() {
  if (screen === "drive" && !paused) {
    app.innerHTML = `<div class="hud"><div class="hud-top"><div class="location"><span id="mode-label">${mode === "race" ? "TOKYO RUN / CHECKPOINT 01" : "FREE ROAM / NO WRONG TURNS"}</span><strong id="district">Temple District</strong></div><div class="timer"><small>${mode === "race" ? "ELAPSED TIME" : "THE CITY IS YOURS"}</small><span id="timer">${mode === "race" ? "00:00.00" : "東京散歩"}</span></div></div><canvas class="map ${minimap ? "" : "hidden"}" width="380" height="450"></canvas><div class="camera-label">C · <span id="camera-name">${cameraNames[cameraMode]}</span></div><div class="speed"><div class="gear" id="gear">N</div><b id="speed">0</b> <span>KM/H</span></div><div class="hint">WASD DRIVE &nbsp; SPACE HANDBRAKE &nbsp; R RESET &nbsp; ESC PAUSE</div><div class="countdown"></div></div>`;
    return;
  }
  let content = "";
  if (screen === "home")
    content = `<div class="eyebrow">小さなトラック、大きな冒険。</div><h1>TOKYO<br><span>RUN.</span></h1><p class="subtitle">Little truck. Big city.<br>Find your own rhythm through the streets of Tokyo.</p><div class="actions">${button("Start Tokyo Run <span>→</span>", "race", true)}${button("Free Roam <span>→</span>", "free")}${button("The Garage <span>06</span>", "garage")}${button("Settings <span>⚙</span>", "settings")}</div>`;
  if (screen === "garage")
    content = `<div class="eyebrow">THE GARAGE / 0${selected + 1} OF 06</div><h2>${trucks[selected].name}</h2><p class="subtitle">${trucks[selected].year}<br>${trucks[selected].tag}</p><div class="row">${button("←", "prev")}${button("→", "next")}</div><div class="chips">${paints.map((c) => `<button aria-label="Paint ${c}" data-paint="${c}" class="paint ${c === paint ? "selected" : ""}" style="background:${c}"></button>`).join("")}</div>${[
      ["POWER", trucks[selected].power],
      ["GRIP", trucks[selected].grip],
      ["TOP SPEED", trucks[selected].max / 3],
    ]
      .map(
        ([n, v]) =>
          `<div class="stat">${n}<div class="bar"><i style="width:${v * 9}%"></i></div></div>`,
      )
      .join(
        "",
      )}<div class="actions">${button("Take it for a drive ↗", "free", true)}${button("Back", "back")}</div>`;
  if (screen === "settings")
    content = `<div class="eyebrow">MAKE YOURSELF AT HOME</div><h2>City settings</h2><label>Time of day <select id="lighting">${["Afternoon", "Sunset", "Night"].map((x) => `<option ${x === lighting ? "selected" : ""}>${x}</option>`).join("")}</select></label><label>Volume <input id="volume" type="range" min="0" max="1" step=".01" value="${sound.volume}"></label><label>Mute <input id="mute" type="checkbox" ${sound.muted ? "checked" : ""}></label><p class="help">W / ↑ Accelerate · S / ↓ Brake & reverse<br>A D / ← → Steer · Space Handbrake<br>C Camera · R Reset · M Minimap · Esc Pause<br>Controller: RT accelerate · LT brake · Left stick steer<br>A handbrake · Y camera · Start pause</p><div class="actions">${button("Back", "back", true)}</div>`;
  if (screen === "pause")
    content = `<div class="eyebrow">TAKE A BREATHER</div><h2>Parked for a moment.</h2><div class="actions">${button("Resume →", "resume", true)}${button("Restart", "restart")}${mode === "free" ? button("Change vehicle", "garage") : ""}${button("Settings", "settings")}${button("Main menu", "home")}</div>`;
  if (screen === "results")
    content = `<div class="eyebrow">TOKYO RUN / COMPLETE</div><h2>You took the scenic route.</h2><div class="results-time">${format(elapsed)}</div><p class="subtitle">Personal best: ${format(best || elapsed)}<br>Temple District → Skytree District</p><div class="actions">${button("One more run ↗", "race", true)}${button("Explore the city", "free")}${button("Main menu", "home")}</div>`;
  app.innerHTML = `<section class="overlay"><header class="brand"><span class="mark">東</span> TOKYO RUN <span style="color:#829b8a">/</span> KEI TRUCK CLUB</header><div class="edition">VOL. 01 &nbsp; — &nbsp; THE TOKYO EDITION</div><div class="menu-content">${content}</div><footer class="bottom"><div>HANDCRAFTED STREETS. UNHURRIED ADVENTURES.<br><b>浅草 → スカイツリー &nbsp; / &nbsp; ${lighting.toUpperCase()} SESSION</b></div><div class="stamp">JAPANESE SOUL.<br>660cc OF FREEDOM.</div></footer></section>`;
  app
    .querySelectorAll("[data-action]")
    .forEach((b) => (b.onclick = () => action(b.dataset.action)));
  app.querySelectorAll("[data-paint]").forEach(
    (b) =>
      (b.onclick = () => {
        paint = b.dataset.paint;
        changeTruck();
        renderUI();
      }),
  );
  app
    .querySelector("#lighting")
    ?.addEventListener("change", (e) => setLight(e.target.value));
  app
    .querySelector("#volume")
    ?.addEventListener("input", (e) => (sound.volume = +e.target.value));
  app
    .querySelector("#mute")
    ?.addEventListener("change", (e) => (sound.muted = e.target.checked));
}
let returnScreen = "home";
function action(a) {
  sound.start();
  sound.beep(700, 0.045);
  if (a === "race" || a === "free") {
    start(a);
    return;
  }
  if (a === "resume") {
    screen = "drive";
    paused = false;
  } else if (a === "restart") {
    start(mode);
    return;
  } else if (a === "home") {
    screen = "home";
    paused = true;
  } else if (a === "back") {
    screen = returnScreen;
    returnScreen = "home";
  } else if (a === "prev" || a === "next") {
    selected = (selected + (a === "next" ? 1 : 5)) % 6;
    changeTruck();
  } else {
    returnScreen = screen;
    screen = a;
  }
  renderUI();
}
function pause() {
  if (screen === "drive") {
    screen = "pause";
    paused = true;
    keys.clear();
  } else if (screen === "pause") {
    screen = "drive";
    paused = false;
  }
  renderUI();
}
window.addEventListener("keydown", (e) => {
  if (
    ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(
      e.code,
    )
  )
    e.preventDefault();
  keys.add(e.code);
  if (e.repeat) return;
  if (e.code === "Escape") pause();
  if (e.code === "KeyC") {
    cameraMode = (cameraMode + 1) % 3;
    document
      .querySelector("#camera-name")
      ?.replaceChildren(cameraNames[cameraMode]);
  }
  if (e.code === "KeyR" && screen === "drive") reset();
  if (e.code === "KeyM") {
    minimap = !minimap;
    document.querySelector(".map")?.classList.toggle("hidden", !minimap);
  }
});
window.addEventListener("keyup", (e) => keys.delete(e.code));
window.addEventListener("blur", () => {
  keys.clear();
  if (screen === "drive") pause();
});
window.addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
let padButtons = [];
function controls() {
  const pad = navigator.getGamepads?.()[0];
  if (pad) {
    for (const [n, a] of [
      [
        3,
        () => {
          cameraMode = (cameraMode + 1) % 3;
        },
      ],
      [9, pause],
    ])
      if (pad.buttons[n]?.pressed && !padButtons[n]) a();
    padButtons = pad.buttons.map((b) => b.pressed);
  }
  return {
    throttle: Math.max(
      keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0,
      pad?.buttons[7]?.value || 0,
    ),
    brake: Math.max(
      keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0,
      pad?.buttons[6]?.value || 0,
    ),
    turn:
      (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0) -
      (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0) -
      (Math.abs(pad?.axes[0] || 0) > 0.12 ? pad.axes[0] : 0),
    hand: keys.has("Space") || pad?.buttons[0]?.pressed,
  };
}
function mapDraw() {
  const canvas = document.querySelector(".map");
  if (!canvas || !minimap) return;
  const ctx = canvas.getContext("2d"),
    scale = 0.75;
  ctx.clearRect(0, 0, 380, 450);
  ctx.save();
  ctx.translate(190, 250);
  ctx.scale(scale, scale);
  ctx.translate(-position.x, -position.z);
  ctx.strokeStyle = "#526f60";
  ctx.lineWidth = 15;
  for (const [a, b] of sideStreets) {
    ctx.beginPath();
    ctx.moveTo(...a);
    ctx.lineTo(...b);
    ctx.stroke();
  }
  ctx.strokeStyle = "#788e76";
  ctx.lineWidth = 26;
  ctx.lineJoin = "round";
  ctx.beginPath();
  route.forEach((p, i) => (i ? ctx.lineTo(...p) : ctx.moveTo(...p)));
  ctx.stroke();
  ctx.strokeStyle = "#dfbf7f";
  ctx.lineWidth = 5;
  ctx.stroke();
  if (mode === "race" && checkpoints[cp]) {
    ctx.fillStyle = "#ffdc83";
    ctx.beginPath();
    ctx.arc(...checkpoints[cp], 45, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.translate(position.x, position.z);
  ctx.rotate(yaw);
  ctx.fillStyle = "#f7edd0";
  ctx.beginPath();
  ctx.moveTo(0, -55);
  ctx.lineTo(34, 36);
  ctx.lineTo(-34, 36);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = "#e8d5a6";
  ctx.font = "18px sans-serif";
  ctx.fillText("N ↑   FICTIONAL TOKYO", 18, 30);
}
let last = performance.now(),
  time = 0,
  mapTick = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 0.15);
  last = now;
  time += dt;
  const input = controls(),
    active = screen === "drive" && !paused;
  if (active) {
    if (countdown > 0) {
      const old = Math.ceil(countdown);
      countdown -= dt;
      if (Math.ceil(countdown) !== old)
        sound.beep(countdown > 0 ? 550 : 900, 0.15);
      document.querySelector(".countdown").textContent =
        countdown > 0 ? Math.ceil(countdown) : "GO";
    } else {
      document.querySelector(".countdown").textContent = "";
      elapsed += dt;
      const spec = trucks[selected];
      const state = {
        x: position.x,
        z: position.z,
        speed,
        yaw,
        steer,
        vx: velocity.x,
        vz: velocity.y,
      };
      let hit = false;
      for (let step = 0; step < dt; step += 1 / 120)
        hit =
          drive(
            state,
            input,
            Math.min(1 / 120, dt - step),
            spec,
            world.boxes,
          ) || hit;
      ({ speed, yaw, steer } = state);
      position.set(state.x, 0, state.z);
      velocity.set(state.vx, state.vz);
      if (hit) sound.beep(70, 0.08);
      if (
        mode === "race" &&
        cp < checkpoints.length &&
        Math.hypot(
          position.x - checkpoints[cp][0],
          position.z - checkpoints[cp][1],
        ) < 18
      ) {
        cp++;
        sound.beep(900, 0.1);
        if (cp === checkpoints.length) {
          best = best ? Math.min(best, elapsed) : elapsed;
          try {
            localStorage.setItem("tokyo-run-best", String(best));
          } catch {}
          screen = "results";
          paused = true;
          renderUI();
        } else
          toast(
            `CHECKPOINT ${String(cp).padStart(2, "0")} / ${checkpoints.length}`,
          );
      }
    }
    truck.position.copy(position);
    truck.rotation.set(
      Math.sin(time * 8) * Math.abs(speed) * 0.0005,
      yaw,
      -steer * speed * 0.0025,
    );
    truck.rotation.x = -input.throttle * 0.018 + input.brake * 0.025;
    for (const w of truck.userData.wheels) {
      w.tire.rotation.x -= (speed * dt) / 0.32;
      w.hub.rotation.x -= (speed * dt) / 0.32;
      w.pivot.rotation.y = w.front ? steer * 0.36 : 0;
    }
    truck.userData.steering.rotation.z = steer * 0.6;
    for (const tail of truck.userData.rear)
      tail.material.emissiveIntensity = input.brake || input.hand ? 3 : 0.2;
    const local =
      cameraMode === 1
        ? new T.Vector3(
            trucks[selected].width * 0.2,
            (1.66 * trucks[selected].cab) / 1.55,
            -0.4,
          )
        : cameraMode === 2
          ? new T.Vector3(5, 2.6, 7)
          : new T.Vector3(
              0,
              4.4 + Math.abs(speed) * 0.035,
              8 + Math.abs(speed) * 0.1,
            );
    local.applyAxisAngle(new T.Vector3(0, 1, 0), yaw).add(position);
    camera.position.lerp(local, cameraMode === 1 ? 1 : 1 - Math.exp(-5 * dt));
    const target = new T.Vector3(
      0,
      cameraMode === 1 ? (1.62 * trucks[selected].cab) / 1.55 : 1.3,
      cameraMode === 1 ? -25 : -5,
    )
      .applyAxisAngle(new T.Vector3(0, 1, 0), yaw)
      .add(position);
    camera.lookAt(target);
    truck.visible = true;
    const speedEl = document.querySelector("#speed");
    if (speedEl) speedEl.textContent = Math.round(Math.abs(speed) * 3.6);
    const gear = document.querySelector("#gear");
    if (gear)
      gear.textContent =
        speed < -0.5
          ? "R"
          : Math.abs(speed) < 0.5
            ? "N"
            : Math.min(5, 1 + Math.floor(speed / 6));
    if (mode === "race") {
      const timer = document.querySelector("#timer");
      if (timer) timer.textContent = format(elapsed);
      const label = document.querySelector("#mode-label");
      if (label)
        label.textContent = `TOKYO RUN / CHECKPOINT ${String(cp + 1).padStart(2, "0")} OF ${checkpoints.length}`;
    }
    const district = document.querySelector("#district");
    if (district)
      district.textContent =
        districts[Math.min(4, Math.floor(-position.z / 670))];
    if ((mapTick += dt) > 0.1) {
      mapDraw();
      mapTick = 0;
    }
  } else if (
    screen !== "pause" &&
    !(returnScreen === "pause" && ["settings", "garage"].includes(screen)) &&
    screen !== "results"
  ) {
    truck.visible = true;
    truck.position.set(0, 0, 7);
    truck.rotation.set(0, -2.45 + (screen === "garage" ? time * 0.13 : 0), 0);
    camera.position.set(5, 2.6, 12);
    camera.lookAt(-5, 1, 7);
  }
  checkpoint.visible = mode === "race" && active && cp < checkpoints.length;
  if (checkpoint.visible) {
    const p = checkpoints[cp],
      prev = cp ? checkpoints[cp - 1] : [0, 0];
    checkpoint.position.set(p[0], 0, p[1]);
    checkpoint.rotation.y = Math.atan2(p[0] - prev[0], p[1] - prev[1]);
  }
  sun.position.set(position.x - 70, 100, position.z + 70);
  sun.target.position.copy(position);
  for (const l of headlights) l.intensity = lighting === "Night" ? 35 : 3;
  for (const p of pedestrians) {
    p.position.x =
      p.userData.base.x + Math.sin(time * 0.4 + p.userData.phase) * 1.2;
    p.rotation.y =
      Math.cos(time * 0.4 + p.userData.phase) > 0 ? Math.PI / 2 : -Math.PI / 2;
  }
  sound.update(speed, input.throttle, active, input.hand, input.brake);
  if (toastTime > 0 && (toastTime -= dt) <= 0)
    document.querySelector(".toast")?.remove();
  renderer.render(scene, camera);
}
renderUI();
setLight("Sunset");
requestAnimationFrame(frame);
// Explicitly opt-in browser QA hooks, absent from ordinary sessions.
if (new URLSearchParams(location.search).has("qa"))
  window.gameQA = {
    getState: () => ({
      screen,
      mode,
      cp,
      elapsed,
      speed,
      yaw,
      position: position.toArray(),
      cameraMode,
      selected,
      paint,
      countdown,
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
    }),
    teleport: (x, z) => {
      position.set(x, 0, z);
      speed = 0;
      velocity.set(0, 0);
    },
    skipCountdown: () => (countdown = 0),
    route,
    boxes: world.boxes,
  };
