import { test } from "node:test";
import assert from "node:assert/strict";
import { validState, profile, cleanCode, Lobby } from "../src/multiplayer.js";
test("network profiles constrain names, vehicle and color", () => {
  assert.deepEqual(profile({ name: "<Host>", vehicle: 99, paint: "red" }), {
    name: "Host",
    vehicle: 0,
    paint: "#d4e5da",
  });
  assert.equal(profile(null).name, "Driver");
  assert.equal(profile({ name: { toString: "bad" } }).name, "Driver");
  assert.equal(cleanCode(" ab-c!1234 "), "ABC1234");
});
test("network snapshots reject invalid coordinates, speed, and progress", () => {
  const s = { x: 0, z: 7, yaw: 0, speed: 10, cp: 0 };
  assert.ok(validState(s));
  for (const patch of [
    { x: Infinity },
    { z: -10000 },
    { yaw: NaN },
    { speed: 100 },
    { cp: 22 },
    { cp: -1 },
    { cp: 0.5 },
  ])
    assert.ok(!validState({ ...s, ...patch }));
});
test("only host can start and all players must be ready", () => {
  const room = new Lobby();
  room.isHost = false;
  assert.equal(room.begin(), false);
  room.isHost = true;
  room.phase = "lobby";
  room.id = "host";
  room.players = {
    host: { id: "host", ready: true },
    guest: { id: "guest", ready: false },
  };
  assert.equal(room.begin(), false);
  room.players.guest.ready = true;
  assert.equal(room.begin(), true);
  assert.equal(room.phase, "race");
  assert.ok(room.race.startAt > Date.now() + 4000);
  room.back();
  assert.equal(room.phase, "lobby");
  assert.equal(room.players.guest.ready, false);
  assert.equal(room.players.host.ready, true);
});

import { EventEmitter } from "node:events";
class Connection extends EventEmitter {
  constructor(id) {
    super();
    this.peer = id;
    this.open = true;
    this.messages = [];
  }
  send(data) {
    this.messages.push(data);
  }
  close() {
    if (!this.open) return;
    this.open = false;
    this.emit("close");
  }
}
test("lobby admits six drivers, rejects overflow, and locks after race starts", () => {
  const room = new Lobby();
  room.isHost = true;
  room.id = "host";
  room.phase = "lobby";
  room.players.host = { id: "host", ready: true };
  const connections = [];
  try {
    for (let i = 0; i < 5; i++) {
      const c = new Connection("guest" + i);
      connections.push(c);
      room.attach(c);
      c.emit("open");
      c.emit("data", { type: "hello", profile: { name: "Friend" + i } });
    }
    assert.equal(room.roster.length, 6);
    const extra = new Connection("overflow");
    connections.push(extra);
    room.attach(extra);
    extra.emit("open");
    assert.equal(extra.messages.at(-1).type, "reject");
    assert.equal(room.roster.length, 6);
    for (const c of connections.slice(0, 5))
      c.emit("data", { type: "ready", ready: true });
    assert.equal(room.begin(), true);
    const late = new Connection("late");
    connections.push(late);
    room.attach(late);
    late.emit("open");
    assert.match(late.messages.at(-1).message, /started/);
    const c = connections[0];
    const snapshot = { x: 0, z: 7, yaw: 0, speed: 0, cp: 0 };
    c.emit("data", { type: "state", race: room.race.id, state: snapshot });
    c.emit("data", {
      type: "state",
      race: room.race.id,
      state: { ...snapshot, cp: 2 },
    });
    assert.equal(room.players[c.peer].state.cp, 0);
    c.emit("data", {
      type: "state",
      race: room.race.id,
      state: { ...snapshot, cp: 1 },
    });
    assert.equal(room.players[c.peer].state.cp, 1);
    c.emit("data", {
      type: "state",
      race: "old-race",
      state: { ...snapshot, cp: 2 },
    });
    assert.equal(room.players[c.peer].state.cp, 1);
  } finally {
    room.close();
    for (const c of connections) c.close();
  }
});
