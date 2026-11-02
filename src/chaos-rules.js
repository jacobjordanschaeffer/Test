import { route } from "./route.js";
export const MONSTER_INTERVAL = 42;
export const MONSTER_FIRST = 18;
export function seedFrom(value) {
  let seed = 2166136261;
  for (const c of String(value))
    seed = Math.imul(seed ^ c.charCodeAt(0), 16777619);
  return seed >>> 0;
}
export function makeHazards(seed = 1) {
  let n = seed >>> 0;
  const random = () =>
    (n = (Math.imul(n, 1664525) + 1013904223) >>> 0) / 4294967296;
  const hazards = [];
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1],
      b = route[i],
      length = Math.hypot(b[0] - a[0], b[1] - a[1]),
      dx = (b[0] - a[0]) / length,
      dz = (b[1] - a[1]) / length,
      angle = Math.atan2(dx, dz);
    const side = random() > 0.5 ? 1 : -1;
    for (const [type, t, lateral] of [
      ["boost", 0.28, -side * 3.8],
      ["pothole", 0.49, side * 3.8],
      ["roadblock", 0.7, side * 4.3],
      ...(i % 3 === 0 ? [["oil", 0.84, -side * 3.5]] : []),
    ]) {
      const x = a[0] + dx * length * t + dz * lateral,
        z = a[1] + dz * length * t - dx * lateral;
      hazards.push({
        id: `${i}-${type}`,
        type,
        x,
        z,
        angle,
        radius: type === "boost" ? 2.4 : type === "oil" ? 2.1 : 1.65,
      });
    }
  }
  return hazards;
}
export function roadblockBoxes(hazards) {
  return hazards
    .filter((h) => h.type === "roadblock")
    .map((h) => ({
      x: h.x,
      z: h.z,
      w: Math.abs(Math.cos(h.angle)) > 0.5 ? 3.6 : 0.9,
      d: Math.abs(Math.cos(h.angle)) > 0.5 ? 0.9 : 3.6,
    }));
}
export function monsterSlot(seconds) {
  return seconds < MONSTER_FIRST
    ? -1
    : Math.floor((seconds - MONSTER_FIRST) / MONSTER_INTERVAL);
}
export function makeMonsterEvent(
  index,
  startAt,
  state = { x: 0, z: 7, cp: 0 },
) {
  const segment = Math.max(1, Math.min(route.length - 1, (state.cp || 0) + 1));
  const a = route[segment - 1],
    b = route[segment],
    dx = b[0] - a[0],
    dz = b[1] - a[1],
    len = Math.hypot(dx, dz),
    t = Math.max(
      0.3,
      Math.min(
        0.85,
        ((state.x - a[0]) * dx + (state.z - a[1]) * dz) / (len * len) +
          65 / len,
      ),
    );
  return {
    id: index,
    startAt,
    x: a[0] + dx * t,
    z: a[1] + dz * t,
    angle: Math.atan2(dx, dz),
    side: index % 2 === 0 ? 1 : -1,
  };
}
export function monsterPhase(event, seconds) {
  if (!event) return { age: -1, warning: false, active: false, wave: -1 };
  const age = seconds - event.startAt;
  return {
    age,
    warning: age >= 0 && age < 3,
    active: age >= 0 && age < 14,
    wave: age >= 6 && age < 8 ? (age - 6) * 12 : -1,
  };
}
export function rubblePoints(event) {
  return [-3, 0, 3].map((offset, i) => {
    const across = event.side * (i === 0 ? 4.5 : i === 1 ? 1 : -2.5),
      along = offset * 1.8;
    return {
      x:
        event.x +
        Math.cos(event.angle) * across +
        Math.sin(event.angle) * along,
      z:
        event.z -
        Math.sin(event.angle) * across +
        Math.cos(event.angle) * along,
      radius: 1.7,
    };
  });
}
export class ChaosEffects {
  constructor() {
    this.reset();
  }
  reset() {
    this.boostUntil = 0;
    this.oilUntil = 0;
    this.bumpUntil = 0;
    this.cooldowns = new Map();
    this.lastHit = "";
  }
  hit(id, type, seconds, s) {
    if ((this.cooldowns.get(id) ?? -Infinity) > seconds) return false;
    this.cooldowns.set(id, seconds + (type === "boost" ? 4 : 2.5));
    this.lastHit = type;
    if (type === "boost") {
      this.boostUntil = seconds + 2.4;
      s.speed = Math.max(s.speed, Math.min(42, s.speed + 11));
      s.vx = -Math.sin(s.yaw) * s.speed;
      s.vz = -Math.cos(s.yaw) * s.speed;
    } else if (type === "oil") {
      this.oilUntil = seconds + 2.5;
    } else {
      this.bumpUntil = seconds + 0.9;
      this.boostUntil = 0;
      s.speed *= type === "pothole" ? 0.52 : 0.35;
      s.vx *= 0.5;
      s.vz *= 0.5;
    }
    return true;
  }
  specification(spec, seconds) {
    return {
      ...spec,
      max: spec.max + (seconds < this.boostUntil ? 14 : 0),
      power: spec.power + (seconds < this.boostUntil ? 13 : 0),
      grip: seconds < this.oilUntil ? 2.2 : spec.grip,
    };
  }
}
