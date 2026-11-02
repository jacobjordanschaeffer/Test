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
import { ChaosCourse } from "./chaos.js";
import { seedFrom, makeMonsterEvent, monsterSlot } from "./chaos-rules.js";
import { indexCollisions } from "./route.js";
import { Lobby, cleanCode, cleanName, MAX_PLAYERS } from "./multiplayer.js";
import { RemoteTrucks } from "./remote-trucks.js";
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
let preferredName = "Driver";
try {
  preferredName = cleanName(localStorage.getItem("tokyo-run-name"));
} catch {}
function rememberName(name) {
  preferredName = cleanName(name);
  try {
    localStorage.setItem("tokyo-run-name", preferredName);
  } catch {}
}
const chaos = new ChaosCourse(scene);
let collisionBoxes = indexCollisions([...world.boxes, ...chaos.blocks]),
  monsterNotice = -1;
function rebuildChaos(seed) {
  chaos.build(seed);
  collisionBoxes = indexCollisions([...world.boxes, ...chaos.blocks]);
  monsterNotice = -1;
}
function chaosTime() {
  return lobby?.race ? Math.max(0, (lobby.now - raceStartAt) / 1000) : elapsed;
}
function hazardFeedback(type) {
  const messages = {
    boost: "BOOST! + SPEED",
    pothole: "POTHOLE! Hold your line",
    oil: "OIL SLICK! Ease off the steering",
    rubble: "GODZILLA RUBBLE!",
    shockwave: "ATOMIC SHOCKWAVE!",
  };
  toast(messages[type] || type);
  sound.beep(type === "boost" ? 1000 : 75, 0.18);
}
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
const remotes = new RemoteTrucks(scene);
let lobby = null,
  onlineError = "",
  onlineStatus = "",
  raceStartAt = 0,
  multiplayerFinished = false;
const inviteCode = cleanCode(
  new URLSearchParams(location.hash.slice(1)).get("room"),
);
const escapeHTML = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
function leaveLobby() {
  lobby?.close();
  lobby = null;
  remotes.clear();
  raceStartAt = 0;
  multiplayerFinished = false;
  onlineError = "";
  keys.clear();
}
function lobbyChanged() {
  if (["online", "lobby"].includes(screen)) renderUI();
  else updateStandings();
}
function connectLobby(host) {
  const name = cleanName(document.querySelector("#driver-name")?.value);
  const code = cleanCode(document.querySelector("#room-code")?.value);
  rememberName(name);
  leaveLobby();
  screen = "lobby";
  paused = true;
  onlineStatus = host ? "Creating your room…" : "Finding the host…";
  // Only local QA sessions may select a local signaling server.
  const params = new URLSearchParams(location.search);
  const options =
    params.has("qa") && params.has("localPeer")
      ? {
          host: location.hostname,
          port: 9000,
          path: "/peerjs",
          secure: false,
          config: { iceServers: [] },
        }
      : {};
  lobby = new Lobby({
    options,
    onChange: lobbyChanged,
    onRace: beginOnlineRace,
    onEnd: () => {
      if (lobby?.active) {
        screen = "lobby";
        paused = true;
        remotes.clear();
        renderUI();
      }
    },
    onError: (message) => {
      onlineError = message;
      screen = "online";
      paused = true;
      remotes.clear();
      raceStartAt = 0;
      renderUI();
    },
  });
  try {
    if (host) lobby.create({ name, vehicle: selected, paint });
    else lobby.join(code, { name, vehicle: selected, paint });
  } catch (e) {
    leaveLobby();
    onlineError = e.message;
    screen = "online";
  }
  renderUI();
}
function beginOnlineRace(race) {
  const ids = lobby.roster.map((p) => p.id).sort(),
    slot = ids.indexOf(lobby.id);
  multiplayerFinished = false;
  raceStartAt = race.startAt;
  start("race");
  setLight(race.lighting);
  countdown = Math.max(0, (raceStartAt - lobby.now) / 1000);
  position.x = ((slot % 3) - 1) * 3;
  position.z = 7 + Math.floor(slot / 3) * 5;
  keys.clear();
}
function ranking() {
  return (lobby?.roster || []).slice().sort((a, b) => {
    if (a.finish && b.finish) return a.finish - b.finish;
    if (a.finish) return -1;
    if (b.finish) return 1;
    const progress = (b.state?.cp || 0) - (a.state?.cp || 0);
    if (progress) return progress;
    const next = checkpoints[Math.min(a.state?.cp || 0, 20)];
    const distance = (p) =>
      p.state ? Math.hypot(p.state.x - next[0], p.state.z - next[1]) : Infinity;
    return distance(a) - distance(b);
  });
}
function updateStandings() {
  const list = document.querySelector("#standings");
  if (!list || !lobby?.active) return;
  list.replaceChildren(
    ...ranking().map((p, i) => {
      const row = document.createElement("div");
      row.className = "standing" + (p.id === lobby.id ? " me" : "");
      const name = document.createElement("span");
      name.textContent = `${i + 1}. ${p.name}${p.id === lobby.id ? " (you)" : ""}`;
      const result = document.createElement("b");
      result.textContent = p.finish
        ? format(p.finish)
        : `${p.state?.cp || 0} / ${checkpoints.length}`;
      row.append(name, result);
      return row;
    }),
  );
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
  chaos.effects.reset();
}
function start(m) {
  mode = m;
  rebuildChaos(lobby?.race?.seed ?? seedFrom(Date.now()));
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
  const nameDraft =
    document.activeElement?.id === "lobby-name"
      ? {
          value: document.activeElement.value,
          caret: document.activeElement.selectionStart,
        }
      : null;
  if (screen === "drive" && !paused) {
    app.innerHTML = `<div class="hud"><div class="hud-top"><div class="location"><span id="mode-label">${mode === "race" ? "TOKYO RUN / CHECKPOINT 01" : "FREE ROAM / NO WRONG TURNS"}</span><strong id="district">Temple District</strong></div><div class="timer"><small>${mode === "race" ? "ELAPSED TIME" : "THE CITY IS YOURS"}</small><span id="timer">${mode === "race" ? "00:00.00" : "東京散歩"}</span></div></div><canvas class="map ${minimap ? "" : "hidden"}" width="380" height="450"></canvas><div class="camera-label">C · <span id="camera-name">${cameraNames[cameraMode]}</span></div><div class="speed"><div class="gear" id="gear">N</div><b id="speed">0</b> <span>KM/H</span></div><div class="hint">WASD DRIVE &nbsp; SPACE HANDBRAKE &nbsp; R RESET &nbsp; ESC PAUSE</div><div class="countdown"></div><div class="chaos-status" id="chaos-status"></div>${lobby?.active ? '<aside class="standings-panel"><div class="eyebrow">FRIENDS / LIVE STANDINGS</div><div id="standings"></div></aside>' : ""}</div>`;
    return;
  }
  let content = "";
  if (screen === "home")
    content = `<div class="eyebrow">小さなトラック、大きな冒険。</div><h1>TOKYO<br><span>RUN.</span></h1><p class="subtitle">Little truck. Big city.<br>Find your own rhythm through the streets of Tokyo.</p><div class="actions">${button("Start Tokyo Run <span>→</span>", "race", true)}${button("Free Roam <span>→</span>", "free")}${button("Race with friends <span>ONLINE</span>", "online")}${button("The Garage <span>06</span>", "garage")}${button("Settings <span>⚙</span>", "settings")}</div>`;
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
  if (screen === "online")
    content = `<div class="eyebrow">KEI TRUCK CLUB / UP TO ${MAX_PLAYERS} DRIVERS</div><h2>Bring your crew.</h2><p class="subtitle">Create a room, share the link, and race from the temple to the tower together.</p><label class="field">Your name<input id="driver-name" maxlength="18" value="${escapeHTML(preferredName)}" autocomplete="nickname"></label><div class="actions">${button("Create a lobby →", "create-room", true)}</div><div class="join-row"><input id="room-code" maxlength="7" placeholder="ROOM CODE" aria-label="Room code" value="${inviteCode}">${button("Join room", "join-room")}</div><p class="online-error" role="status">${escapeHTML(onlineError)}</p><p class="help">Choose your truck and paint in the Garage first.<br>Host stays online. The race continues while paused.<br>Players pass through each other for smooth, casual racing.</p><div class="actions">${button("Back", "home")}</div>`;
  if (screen === "lobby") {
    const connected = lobby?.phase === "lobby";
    const roster = lobby?.roster || [];
    const ready = roster.length >= 2 && roster.every((p) => p.ready);
    const me = lobby?.players[lobby.id];
    content = `<div class="eyebrow">PRIVATE LOBBY / ${roster.length} OF ${MAX_PLAYERS}</div><h2>${connected ? "Your crew is gathering." : onlineStatus}</h2>${connected ? `<div class="room-code">${lobby.code}</div><p class="help">Share this room code or send your friends an invite.</p><div class="row">${button("Copy invite link", "copy-invite")}${button("Copy code", "copy-code")}</div><div class="lobby-name-row"><label for="lobby-name">Your driver name</label><div class="join-row"><input id="lobby-name" maxlength="18" value="${escapeHTML(me?.name || preferredName)}" aria-label="Your lobby name">${button("Save name", "save-name")}</div></div><div class="lobby-roster">${roster.map((p) => `<div class="lobby-player"><i style="background:${p.paint}"></i><span>${escapeHTML(p.name)}${p.id === lobby.id ? " (you)" : ""}<small>${trucks[p.vehicle].name}</small></span><b>${p.id === Object.keys(lobby.players)[0] ? "HOST" : p.ready ? "READY" : "WAITING"}</b></div>`).join("")}</div><div class="actions">${lobby.host ? `<button class="primary" data-action="start-online" ${ready ? "" : "disabled"}>Start race →</button>` : button(me?.ready ? "Not ready" : "Ready to race →", "ready", !me?.ready)}</div><p class="help">${lobby.host ? "At least two drivers must be ready to start." : "The host starts when everyone is ready."}</p>` : ""}<div class="actions">${button("Leave lobby", "leave-room")}</div>`;
  }
  if (screen === "settings")
    content = `<div class="eyebrow">MAKE YOURSELF AT HOME</div><h2>City settings</h2><label>Time of day <select id="lighting">${["Afternoon", "Sunset", "Night"].map((x) => `<option ${x === lighting ? "selected" : ""}>${x}</option>`).join("")}</select></label><label>Volume <input id="volume" type="range" min="0" max="1" step=".01" value="${sound.volume}"></label><label>Mute <input id="mute" type="checkbox" ${sound.muted ? "checked" : ""}></label><p class="help">W / ↑ Accelerate · S / ↓ Brake & reverse<br>A D / ← → Steer · Space Handbrake<br>C Camera · R Reset · M Minimap · Esc Pause<br>Controller: RT accelerate · LT brake · Left stick steer<br>A handbrake · Y camera · Start pause</p><div class="actions">${button("Back", "back", true)}</div>`;
  if (screen === "pause")
    content = `<div class="eyebrow">TAKE A BREATHER</div><h2>Parked for a moment.</h2><div class="actions">${button("Resume →", "resume", true)}${lobby?.active ? "" : button("Restart", "restart")}${mode === "free" ? button("Change vehicle", "garage") : ""}${button("Settings", "settings")}${button(lobby?.active ? "Leave race" : "Main menu", "home")}</div>`;
  if (screen === "results")
    content = `<div class="eyebrow">TOKYO RUN / COMPLETE</div><h2>You took the scenic route.</h2><div class="results-time">${format(elapsed)}</div><p class="subtitle">Personal best: ${format(best || elapsed)}<br>Temple District → Skytree District</p><div class="actions">${button("One more run ↗", "race", true)}${button("Explore the city", "free")}${button(lobby?.active ? "Leave race" : "Main menu", "home")}</div>`;
  if (screen === "results" && lobby?.active)
    content = `<div class="eyebrow">FRIENDS / TOKYO RUN</div><h2>Across the line.</h2><div class="results-time">${format(elapsed)}</div><aside class="results-standings"><div id="standings"></div></aside><p class="help">Results update as the rest of the crew finishes.</p><div class="actions">${lobby.host ? button("Return everyone to lobby", "return-lobby", true) : '<p class="help">Wait for the host to return to the lobby.</p>'}${button("Leave room", "leave-room")}</div>`;
  app.innerHTML = `<section class="overlay"><header class="brand"><span class="mark">東</span> TOKYO RUN <span style="color:#829b8a">/</span> KEI TRUCK CLUB</header><div class="edition">VOL. 01 &nbsp; — &nbsp; THE TOKYO EDITION</div><div class="menu-content">${content}</div><footer class="bottom"><div>HANDCRAFTED STREETS. UNHURRIED ADVENTURES.<br><b>浅草 → スカイツリー &nbsp; / &nbsp; ${lighting.toUpperCase()} SESSION</b></div><div class="stamp">JAPANESE SOUL.<br>660cc OF FREEDOM.</div></footer></section>`;
  if (nameDraft) {
    const field = app.querySelector("#lobby-name");
    if (field) {
      field.value = nameDraft.value;
      field.focus();
      field.setSelectionRange(nameDraft.caret, nameDraft.caret);
    }
  }
  app.querySelector("#lobby-name")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      action("save-name");
    }
  });
  updateStandings();
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
  if (a === "save-name") {
    const value = cleanName(document.querySelector("#lobby-name")?.value);
    rememberName(value);
    lobby?.rename(value);
    return;
  }
  if (a === "create-room" || a === "join-room") {
    sound.start();
    connectLobby(a === "create-room");
    return;
  }
  if (a === "leave-room") {
    leaveLobby();
    screen = "home";
    paused = true;
    renderUI();
    return;
  }
  if (a === "ready") {
    lobby.ready(!lobby.players[lobby.id]?.ready);
    return;
  }
  if (a === "start-online") {
    lobby?.begin(lighting);
    return;
  }
  if (a === "return-lobby") {
    lobby?.back();
    return;
  }
  if (a === "copy-code" || a === "copy-invite") {
    const url = new URL(location.href);
    url.search = "";
    url.hash = "room=" + lobby.code;
    const value = a === "copy-code" ? lobby.code : url.href;
    if (navigator.clipboard?.writeText)
      navigator.clipboard
        .writeText(value)
        .then(() => toast("Copied!"))
        .catch(() => window.prompt("Copy and share this invite:", value));
    else window.prompt("Copy and share this invite:", value);
    return;
  }
  if (a === "home" && lobby?.active) leaveLobby();
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
    e.target instanceof HTMLInputElement ||
    e.target instanceof HTMLSelectElement
  )
    return;
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
  if (lobby?.phase === "race")
    for (const p of lobby.roster) {
      if (p.id === lobby.id || !p.state) continue;
      ctx.fillStyle = p.paint;
      ctx.beginPath();
      ctx.arc(p.state.x, p.state.z, 10, 0, Math.PI * 2);
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
  if (lobby?.phase === "race" && !multiplayerFinished) {
    elapsed = Math.max(0, (lobby.now - raceStartAt) / 1000);
    countdown = Math.max(0, (raceStartAt - lobby.now) / 1000);
  }
  const input = controls(),
    active = screen === "drive" && !paused;
  if (active) {
    if (countdown > 0) {
      const old = Math.ceil(countdown);
      if (!lobby?.active) countdown -= dt;
      if (Math.ceil(countdown) !== old)
        sound.beep(countdown > 0 ? 550 : 900, 0.15);
      document.querySelector(".countdown").textContent =
        countdown > 0 ? Math.ceil(countdown) : "GO";
    } else {
      document.querySelector(".countdown").textContent = "";
      if (!lobby?.active) elapsed += dt;
      const clock = chaosTime();
      let spec = chaos.effects.specification(trucks[selected], clock);
      const state = {
        x: position.x,
        z: position.z,
        speed,
        yaw,
        steer,
        vx: velocity.x,
        vz: velocity.y,
      };
      chaos.apply(state, clock, hazardFeedback);
      spec = chaos.effects.specification(trucks[selected], clock);
      let hit = false;
      for (let step = 0; step < dt; step += 1 / 120)
        hit =
          drive(
            state,
            input,
            Math.min(1 / 120, dt - step),
            spec,
            collisionBoxes,
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
          multiplayerFinished = !!lobby?.active;
          if (lobby?.active)
            lobby.update({
              x: position.x,
              z: position.z,
              yaw,
              speed,
              cp,
              brake: true,
            });
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
    const bump = Math.max(0, chaos.effects.bumpUntil - chaosTime());
    truck.position.y = Math.sin(time * 28) * bump * 0.3;
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
    if (bump > 0) {
      camera.position.x += Math.sin(time * 53) * bump * 0.12;
      camera.position.y += Math.sin(time * 67) * bump * 0.1;
    }
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
    screen !== "results" &&
    !lobby?.race
  ) {
    truck.visible = true;
    truck.position.set(0, 0, 7);
    truck.rotation.set(0, -2.45 + (screen === "garage" ? time * 0.13 : 0), 0);
    camera.position.set(5, 2.6, 12);
    camera.lookAt(-5, 1, 7);
  }
  const chaosClock = chaosTime();
  if (lobby?.race) chaos.setEvent(lobby.race.chaos || null);
  else if (
    active &&
    monsterSlot(chaosClock) >= 0 &&
    monsterSlot(chaosClock) > (chaos.event?.id ?? -1)
  )
    chaos.setEvent(
      makeMonsterEvent(monsterSlot(chaosClock), chaosClock, {
        x: position.x,
        z: position.z,
        cp,
      }),
    );
  chaos.update(chaosClock, ["drive", "pause", "results"].includes(screen));
  if (chaos.event && chaos.event.id !== monsterNotice) {
    monsterNotice = chaos.event.id;
    if (active) {
      toast("GODZILLA ALERT! Avoid the marked impact zones");
      sound.beep(65, 0.45);
    }
  }
  const chaosStatus = document.querySelector("#chaos-status");
  if (chaosStatus) {
    const age = chaos.event ? chaosClock - chaos.event.startAt : -1;
    chaosStatus.textContent =
      age >= 0 && age < 3
        ? "GODZILLA INCOMING · WATCH THE AMBER RINGS"
        : chaosClock < chaos.effects.boostUntil
          ? "BOOST ACTIVE"
          : chaosClock < chaos.effects.oilUntil
            ? "OIL SLICK · LOW GRIP"
            : age >= 3 && age < 14
              ? "GODZILLA ATTACK · DODGE THE RUBBLE"
              : "";
    chaosStatus.classList.toggle("danger", age >= 0 && age < 14);
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
  sound.update(
    speed,
    input.throttle,
    active,
    input.hand || chaosTime() < chaos.effects.oilUntil,
    input.brake,
  );
  if (toastTime > 0 && (toastTime -= dt) <= 0)
    document.querySelector(".toast")?.remove();
  if (lobby?.phase === "race") {
    lobby.update({
      x: position.x,
      z: position.z,
      yaw,
      speed,
      cp,
      brake: !!input.brake || input.hand,
    });
    remotes.update(lobby.roster, lobby.id, dt, true);
    updateStandings();
  } else remotes.update([], null, dt, false);
  if (!(
    new URLSearchParams(location.search).has("qa") &&
    new URLSearchParams(location.search).has("simulation")
  ))
    renderer.render(scene, camera);
}
if (inviteCode) screen = "online";
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
      chaos: {
        hazards: chaos.hazards,
        boostUntil: chaos.effects.boostUntil,
        oilUntil: chaos.effects.oilUntil,
        lastHit: chaos.effects.lastHit,
        event: chaos.event,
        clock: chaosTime(),
      },
      online: lobby
        ? {
            phase: lobby.phase,
            code: lobby.code,
            players: lobby.roster,
            host: lobby.host,
            race: lobby.race,
            remotes: remotes.models.size,
          }
        : null,
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
    }),
    teleport: (x, z) => {
      position.set(x, 0, z);
      speed = 0;
      velocity.set(0, 0);
    },
    skipCountdown: () => {
      countdown = 0;
      if (lobby?.race) raceStartAt = lobby.now;
    },
    advanceChaos: (seconds) => {
      if (!lobby?.active) elapsed += seconds;
    },
    monster: () => {
      if (lobby?.host) lobby.triggerMonster(true);
      else
        chaos.setEvent(
          makeMonsterEvent(0, chaosTime(), {
            x: position.x,
            z: position.z,
            cp,
          }),
        );
    },
    hazard: (type) => {
      const h = chaos.hazards.find((h) => h.type === type);
      chaos.effects.reset();
      const behind = type === "roadblock" ? 7 : 0;
      position.set(
        h.x - Math.sin(h.angle) * behind,
        0,
        h.z - Math.cos(h.angle) * behind,
      );
      yaw = Math.atan2(-Math.sin(h.angle), -Math.cos(h.angle));
      speed = 15;
      velocity.set(-Math.sin(yaw) * speed, -Math.cos(yaw) * speed);
    },
    renderFrame: () => renderer.render(scene, camera),
    route,
    boxes: world.boxes,
  };
