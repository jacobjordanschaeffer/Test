import { test } from "node:test";
import assert from "node:assert/strict";
import { drive } from "../src/physics.js";
import {
  routeLength,
  resolveCollision,
  indexCollisions,
} from "../src/route.js";
const spec = { power: 8.7, grip: 7.8, max: 27 };
const fresh = () => ({ x: 0, z: 7, speed: 0, yaw: 0, steer: 0, vx: 0, vz: 0 });
const forward = { throttle: 1, brake: 0, turn: 0, hand: false };
function steps(s, input, seconds, boxes = []) {
  for (let i = 0; i < seconds * 120; i++) drive(s, input, 1 / 120, spec, boxes);
}
test("route is a full-length run", () =>
  assert.ok(routeLength > 6000 && routeLength < 8000));
test("accelerates, brakes, reverses, and resets without vertical simulation", () => {
  const s = fresh();
  steps(s, forward, 5);
  assert.ok(s.z < -60);
  assert.ok(s.speed > 20);
  steps(s, { ...forward, throttle: 0, brake: 1 }, 5);
  assert.ok(s.speed < 0);
  assert.equal(s.y, undefined);
});
test("steering is progressive and handbrake slows truck", () => {
  const s = fresh();
  steps(s, forward, 3);
  steps(s, { ...forward, turn: 1 }, 1);
  assert.ok(s.yaw > 0.2 && s.x < 0);
  const before = s.speed;
  steps(s, { ...forward, throttle: 0, hand: true }, 1);
  assert.ok(s.speed < before * 0.3);
});
test("solid obstacles stop a moving truck", () => {
  const s = fresh();
  const boxes = [{ x: 0, z: -20, w: 20, d: 5 }];
  steps(s, forward, 5, boxes);
  assert.ok(s.z > -17);
  assert.equal(resolveCollision(s.x, s.z, 1, boxes), false);
});
test("fixed-step integration is stable over different time partitions", () => {
  const a = fresh(),
    b = fresh();
  steps(a, forward, 2);
  for (let i = 0; i < 120; i++) drive(b, forward, 1 / 60, spec, []);
  assert.ok(Math.abs(a.z - b.z) < 0.5);
});

test("spatial collision index agrees with direct obstacle tests", () => {
  const boxes = [
      { x: 40, z: -80, w: 20, d: 30 },
      { x: -20, z: 15, w: 6, d: 8 },
    ],
    indexed = indexCollisions([...boxes]);
  for (let x = -40; x < 80; x += 3)
    for (let z = -120; z < 40; z += 3)
      assert.equal(
        resolveCollision(x, z, 1.05, indexed),
        resolveCollision(x, z, 1.05, boxes),
      );
});

test("grass reduces speed and acceleration while paved side streets stay fast", () => {
  const a = { ...fresh(), x: 30, z: -60, speed: 24, vz: -24 },
    b = { ...fresh(), x: 0, z: -60, speed: 24, vz: -24 };
  steps(a, forward, 3);
  steps(b, forward, 3);
  assert.ok(a.speed < 10);
  assert.ok(a.offroad > 0.9);
  assert.ok(b.speed > 20);
  const side = {
    ...fresh(),
    x: 50,
    z: -280,
    yaw: -Math.PI / 2,
    speed: 20,
    vx: 20,
  };
  steps(side, forward, 2);
  assert.ok(side.speed > 20);
  assert.ok(side.offroad < 0.1);
});
