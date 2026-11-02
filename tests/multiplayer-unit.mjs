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

test("lobby renaming and host-controlled monster schedule preserve shared race state", () => {
  const room = new Lobby();
  room.isHost = true;
  room.id = "host";
  room.phase = "lobby";
  room.players = {
    host: {
      id: "host",
      name: "Host",
      ready: true,
      state: { x: 0, z: -30, cp: 0 },
    },
    guest: {
      id: "guest",
      name: "Friend",
      ready: true,
      state: { x: 0, z: 7, cp: 0 },
    },
  };
  const connection = new Connection("guest");
  try {
    room.attach(connection);
    connection.emit("open");
    room.rename("Road Captain");
    assert.equal(room.players.host.name, "Road Captain");
    connection.emit("data", { type: "rename", name: "<New Friend>" });
    assert.equal(room.players.guest.name, "New Friend");
    assert.equal(room.players.guest.ready, true);
    assert.ok(room.begin());
    room.race.startAt = Date.now() - 20000;
    room.players.host.state = { x: 0, z: -30, cp: 0 };
    room.triggerMonster();
    assert.equal(room.race.chaos.id, 0);
    const event = room.race.chaos;
    room.triggerMonster();
    assert.deepEqual(room.race.chaos, event);
    connection.emit("data", { type: "rename", name: "During race" });
    assert.equal(room.players.guest.name, "New Friend");
    room.race.startAt = Date.now() - 62000;
    room.triggerMonster();
    assert.equal(room.race.chaos.id, 1);
  } finally {
    room.close();
    connection.close();
  }
});

test("healthy guest connection survives the 18-second handshake deadline", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const room = new Lobby();
  room.isHost = false;
  room.id = "guest";
  room.localProfile = profile({ name: "Friend" });
  room.phase = "connecting";
  const c = new Connection("host");
  try {
    room.attach(c);
    c.emit("open");
    c.emit("data", {
      type: "room",
      phase: "lobby",
      race: null,
      players: [
        { id: "host", name: "Host", ready: true },
        { id: "guest", name: "Friend", ready: false },
      ],
    });
    t.mock.timers.tick(18001);
    assert.equal(c.open, true);
    assert.equal(room.phase, "lobby");
    assert.equal(room.closed, false);
  } finally {
    room.close();
  }
});

test("congested channels drop redundant movement but retain checkpoint transitions", () => {
  const room = new Lobby();
  room.isHost = false;
  room.id = "guest";
  room.phase = "race";
  room.race = { id: "race" };
  room.players.guest = { id: "guest" };
  room.lastSync = Date.now();
  const c = new Connection("host");
  c.bufferSize = 10;
  room.connections.set(c.peer, c);
  try {
    const s = {
      x: 1.123456,
      z: 7.123456,
      yaw: 0.123456,
      speed: 20.123456,
      cp: 0,
    };
    room.update(s);
    assert.equal(c.messages.length, 1);
    assert.equal(c.messages[0].state.x, 1.12);
    room.update({ ...s, x: 2 });
    room.tick();
    assert.equal(c.messages.length, 1);
    room.update({ ...s, cp: 1 });
    assert.equal(c.messages.length, 2);
    c.bufferSize = 0;
    room.tick();
    assert.equal(c.messages.length, 3);
  } finally {
    room.close();
  }
});
test("idle lobby heartbeats are reduced while roster edits remain immediate", () => {
  const room = new Lobby();
  room.isHost = true;
  room.id = "host";
  room.phase = "lobby";
  room.players = {
    host: { id: "host", ready: true },
    guest: { id: "guest", ready: false },
  };
  const c = new Connection("guest");
  room.connections.set(c.peer, c);
  try {
    room.lastBroadcast = Date.now();
    room.tick();
    assert.equal(c.messages.length, 0);
    room.lastBroadcast = Date.now() - 1001;
    room.tick();
    assert.equal(c.messages.length, 1);
    room.rename("Captain");
    assert.equal(c.messages.length, 2);
  } finally {
    room.close();
  }
});
test("temporary signaling loss retries without closing existing racers", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const room = new Lobby();
  room.isHost = true;
  room.phase = "race";
  let attempts = 0;
  room.peer = {
    disconnected: true,
    reconnect() {
      attempts++;
      this.disconnected = false;
    },
    destroy() {},
  };
  const c = new Connection("guest");
  room.connections.set(c.peer, c);
  try {
    room.reconnectSignaling();
    t.mock.timers.tick(1000);
    assert.equal(attempts, 1);
    assert.equal(c.open, true);
    assert.equal(room.phase, "race");
    assert.equal(room.closed, false);
  } finally {
    room.close();
  }
});

test("heartbeat watchdog tolerates live traffic and detects a vanished host", () => {
  const room = new Lobby();
  room.isHost = false;
  room.phase = "race";
  room.id = "guest";
  const c = new Connection("host");
  room.connections.set(c.peer, c);
  const now = Date.now();
  room.lastSeen.set(c.peer, now);
  room.checkPeerTimeouts(now + 19000);
  assert.equal(room.closed, false);
  room.lastSeen.set(c.peer, now + 19000);
  room.checkPeerTimeouts(now + 30000);
  assert.equal(room.closed, false);
  room.checkPeerTimeouts(now + 40001);
  assert.equal(room.closed, true);
  assert.equal(c.open, false);
});
