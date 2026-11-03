import { route, sideStreets } from "./route.js";
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
  const segments = [
    ...route
      .slice(1)
      .map((b, i) => ({ a: route[i], b, id: String(i + 1), main: true })),
    ...sideStreets
      .slice(0, 10)
      .map(([a, b], i) => ({ a, b, id: `side-${i}`, main: false })),
  ];
  for (const { a, b, id, main } of segments) {
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]),
      dx = (b[0] - a[0]) / length,
      dz = (b[1] - a[1]) / length,
      angle = Math.atan2(dx, dz),
      side = random() > 0.5 ? 1 : -1;
    const types = main
      ? ["boost", "pothole", "roadblock", ...(random() > 0.65 ? ["oil"] : [])]
      : ["boost", "pothole"];
    // Shuffle separated slots so longitudinal position, lane, and order all change per run.
    const slots = types.map(
      (_, i) => (i + 1) / (types.length + 1) + (random() - 0.5) * 0.08,
    );
    for (let i = slots.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [slots[i], slots[j]] = [slots[j], slots[i]];
    }
    types.forEach((type, i) => {
      const t = Math.max(30 / length, Math.min(1 - 30 / length, slots[i]));
      const lateral =
        type === "roadblock"
          ? side * 4.3
          : (random() > 0.5 ? 1 : -1) *
            (main ? 2.9 + random() * 0.9 : 1.8 + random() * 0.4);
      hazards.push({
        id: `${id}-${type}`,
        type,
        x: a[0] + dx * length * t + dz * lateral,
        z: a[1] + dz * length * t - dx * lateral,
        angle,
        radius: type === "boost" ? 2.4 : type === "oil" ? 2.1 : 1.65,
      });
    });
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
