import { resolveCollision, isPavedSurface } from "./route.js";
export function drive(s, input, dt, spec, boxes) {
  const grass = isPavedSurface(s.x, s.z) ? 0 : 1;
  s.offroad =
    (s.offroad || 0) + (grass - (s.offroad || 0)) * (1 - Math.exp(-6 * dt));
  s.speed +=
    (input.throttle * spec.power * (1 - 0.28 * s.offroad) -
      input.brake * (s.speed > 1 ? 17 : spec.power * 0.65) -
      s.speed * (0.12 + 0.7 * s.offroad)) *
    dt;
  if (!input.throttle && !input.brake) s.speed *= Math.exp(-0.25 * dt);
  if (input.hand) s.speed *= Math.exp(-1.8 * dt);
  const max = spec.max * (1 - s.offroad) + Math.min(8.5, spec.max) * s.offroad;
  s.speed = Math.max(-8, Math.min(max, s.speed));
  s.steer += (input.turn - s.steer) * (1 - Math.exp(-9 * dt));
  s.yaw +=
    ((s.steer * s.speed * 0.07) / (1 + Math.abs(s.speed) * 0.025)) *
    dt *
    (input.hand ? 1.5 : 1);
  const grip = 1 - Math.exp(-(input.hand ? 2 : spec.grip) * dt);
  s.vx += (-Math.sin(s.yaw) * s.speed - s.vx) * grip;
  s.vz += (-Math.cos(s.yaw) * s.speed - s.vz) * grip;
  const x = s.x + s.vx * dt,
    z = s.z + s.vz * dt;
  if (
    resolveCollision(x, z, 1.05, boxes) ||
    x > 560 ||
    x < -420 ||
    z > 130 ||
    z < -3400
  ) {
    s.speed *= -0.2;
    s.vx *= -0.2;
    s.vz *= -0.2;
    return true;
  }
  s.x = x;
  s.z = z;
  return false;
}
