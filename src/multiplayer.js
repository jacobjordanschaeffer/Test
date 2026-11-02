import PeerModule from "peerjs";
const Peer = PeerModule.Peer || PeerModule;

export const MAX_PLAYERS = 6;
const PREFIX = "tokyo-run-v1-";
export const cleanName = (value) =>
  String(typeof value === "string" ? value : "Driver")
    .replace(/[<>\x00-\x1f]/g, "")
    .trim()
    .slice(0, 18) || "Driver";
export const cleanCode = (value) =>
  String(typeof value === "string" ? value : "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 7);
export function validState(s) {
  return (
    s &&
    ["x", "z", "yaw", "speed"].every((k) => Number.isFinite(s[k])) &&
    Math.abs(s.x) < 600 &&
    s.z > -3500 &&
    s.z < 150 &&
    Math.abs(s.speed) < 60 &&
    Number.isInteger(s.cp) &&
    s.cp >= 0 &&
    s.cp <= 21
  );
}
export function profile(p = {}) {
  if (!p || typeof p !== "object") p = {};
  return {
    name: cleanName(p.name),
    vehicle:
      Number.isInteger(p.vehicle) && p.vehicle >= 0 && p.vehicle < 6
        ? p.vehicle
        : 0,
    paint: /^#[0-9a-f]{6}$/i.test(p.paint) ? p.paint : "#d4e5da",
  };
}
export class Lobby {
  constructor({
    onChange = () => {},
    onRace = () => {},
    onEnd = () => {},
    onError = () => {},
    options = {},
  } = {}) {
    Object.assign(this, { onChange, onRace, onEnd, onError, options });
    this.players = {};
    this.connections = new Map();
    this.phase = "offline";
    this.race = null;
    this.offset = 0;
    this.closed = false;
  }
  get active() {
    return !!this.peer && !this.closed;
  }
  get host() {
    return this.isHost;
  }
  get now() {
    return Date.now() + this.offset;
  }
  get roster() {
    return Object.values(this.players);
  }
  create(p) {
    this.isHost = true;
    this.code = Array.from(
      crypto.getRandomValues(new Uint8Array(7)),
      (n) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[n % 32],
    ).join("");
    return this.open(PREFIX + this.code, p);
  }
  join(code, p) {
    this.isHost = false;
    this.code = cleanCode(code);
    if (this.code.length !== 7)
      throw new Error("Enter the seven-character room code.");
    return this.open(undefined, p);
  }
  open(id, p) {
    this.closed = false;
    this.phase = "connecting";
    this.localProfile = profile(p);
    this.peer = new Peer(id, this.options);
    this.timeout = setTimeout(
      () =>
        this.fail(
          "Connection timed out. Check the room code and try another network.",
        ),
      20000,
    );
    this.peer.on("open", (peerId) => {
      if (this.closed) return;
      this.id = peerId;
      if (this.isHost) {
        this.players[this.id] = {
          id: this.id,
          ...this.localProfile,
          ready: true,
          state: null,
        };
        this.phase = "lobby";
        clearTimeout(this.timeout);
        this.onChange();
      } else
        this.attach(
          this.peer.connect(PREFIX + this.code, {
            reliable: true,
            serialization: "json",
          }),
        );
    });
    this.peer.on("connection", (c) => {
      if (!this.isHost) {
        c.close();
        return;
      }
      this.attach(c);
    });
    this.peer.on("error", (e) =>
      this.fail(
        e.type === "unavailable-id"
          ? "Room code is in use. Create another lobby."
          : e.type === "peer-unavailable"
            ? "Room not found. Check the code and make sure the host is online."
            : "Multiplayer connection failed. Try another network or create a new lobby.",
      ),
    );
    this.peer.on("disconnected", () => {
      if (!this.closed)
        this.fail(
          "The connection service disconnected. Create or join a new lobby.",
        );
    });
    this.timer = setInterval(() => this.tick(), 100);
    this.onChange();
  }
  attach(c) {
    let accepted = false;
    const timer = setTimeout(() => {
      if (!accepted) c.close();
    }, 18000);
    c.on("open", () => {
      if (this.closed) return c.close();
      if (this.isHost) {
        if (
          this.phase !== "lobby" ||
          this.connections.size >= MAX_PLAYERS - 1
        ) {
          c.send({
            type: "reject",
            message:
              this.phase !== "lobby"
                ? "The race has started. Join the next lobby."
                : "This lobby is full.",
          });
          setTimeout(() => c.close(), 150);
          return;
        }
        this.connections.set(c.peer, c);
      } else {
        this.connections.set(c.peer, c);
        c.send({ type: "hello", profile: this.localProfile });
        this.sync();
      }
    });
    c.on("data", (message) => {
      if (
        !message ||
        typeof message !== "object" ||
        JSON.stringify(message).length > 16000
      )
        return;
      if (this.isHost) {
        if (this.connections.get(c.peer) !== c) return;
        if (
          message.type === "hello" &&
          this.phase === "lobby" &&
          !this.players[c.peer]
        ) {
          accepted = true;
          clearTimeout(timer);
          this.players[c.peer] = {
            id: c.peer,
            ...profile(message.profile),
            ready: false,
            state: null,
          };
          this.broadcast();
          this.onChange();
        }
        if (message.type === "sync")
          c.send({ type: "clock", sent: message.sent, now: Date.now() });
        const player = this.players[c.peer];
        if (!player) return;
        if (message.type === "ready" && this.phase === "lobby") {
          player.ready = !!message.ready;
          this.broadcast();
          this.onChange();
        }
        if (
          message.type === "state" &&
          this.phase === "race" &&
          message.race === this.race.id &&
          validState(message.state)
        ) {
          const old = player.state;
          if (
            !old
              ? message.state.cp === 0
              : message.state.cp >= old.cp && message.state.cp <= old.cp + 1
          ) {
            player.state = { ...message.state, cp: message.state.cp };
            if (player.state.cp === 21 && !player.finish)
              player.finish = Math.max(
                0,
                (Date.now() - this.race.startAt) / 1000,
              );
          }
        }
      } else {
        if (message.type === "reject")
          return this.fail(String(message.message).slice(0, 100));
        if (
          message.type === "clock" &&
          Number.isFinite(message.now) &&
          Number.isFinite(message.sent)
        ) {
          const rtt = Date.now() - message.sent;
          if (rtt >= 0 && rtt < 5000)
            this.offset = message.now + rtt / 2 - Date.now();
        }
        if (
          message.type === "room" &&
          Array.isArray(message.players) &&
          message.players.length <= MAX_PLAYERS
        ) {
          const previous = this.phase;
          const raceId = this.race?.id;
          this.players = Object.fromEntries(
            message.players
              .filter((p) => p && typeof p.id === "string")
              .map((p) => [
                p.id,
                {
                  ...p,
                  ...profile(p),
                  state: validState(p.state) ? p.state : null,
                },
              ]),
          );
          if (message.race?.id !== raceId) this.localState = null;
          this.race = message.race;
          this.phase = message.phase;
          if (this.phase === "lobby") {
            clearTimeout(this.timeout);
            if (previous !== "lobby") this.onEnd();
          }
          if (this.phase === "race" && this.race?.id !== raceId)
            this.onRace(this.race);
          const rosterKey = JSON.stringify(
            this.roster.map((p) => [p.id, p.name, p.ready, p.vehicle, p.paint]),
          );
          if (previous !== this.phase || rosterKey !== this.rosterKey) {
            this.rosterKey = rosterKey;
            this.onChange();
          }
        }
      }
    });
    c.on("close", () => {
      clearTimeout(timer);
      if (this.closed) return;
      if (this.isHost && this.connections.get(c.peer) !== c) return;
      this.connections.delete(c.peer);
      if (this.isHost) {
        delete this.players[c.peer];
        this.broadcast();
        this.onChange();
      } else
        this.fail(
          "The host left or the connection was lost. Return to the menu to create or join another lobby.",
        );
    });
    c.on("error", () => {
      clearTimeout(timer);
      if (!this.isHost && !this.closed)
        this.fail("Could not reach the host. Try another network.");
    });
  }
  sync() {
    for (const c of this.connections.values())
      if (c.open) c.send({ type: "sync", sent: Date.now() });
  }
  ready(value) {
    if (this.isHost) return;
    for (const c of this.connections.values())
      if (c.open) c.send({ type: "ready", ready: value });
  }
  begin(lighting = "Sunset") {
    if (
      !this.isHost ||
      this.phase !== "lobby" ||
      this.roster.length < 2 ||
      !this.roster.every((p) => p.ready)
    )
      return false;
    this.race = {
      id: crypto.randomUUID(),
      startAt: Date.now() + 4500,
      lighting,
    };
    this.phase = "race";
    for (const p of this.roster) {
      p.state = null;
      p.finish = null;
    }
    this.broadcast();
    this.onRace(this.race);
    this.onChange();
    return true;
  }
  back() {
    if (!this.isHost) return;
    this.phase = "lobby";
    this.race = null;
    for (const p of this.roster) {
      p.ready = p.id === this.id;
      p.state = null;
      p.finish = null;
    }
    this.broadcast();
    this.onEnd();
    this.onChange();
  }
  update(state) {
    if (this.phase !== "race" || !validState(state)) return;
    this.localState = state;
    const p = this.players[this.id];
    if (p) {
      p.state = state;
      if (this.isHost && state.cp === 21 && !p.finish)
        p.finish = Math.max(0, (Date.now() - this.race.startAt) / 1000);
    }
  }
  tick() {
    if (this.closed) return;
    if (this.isHost) this.broadcast();
    else if (this.phase === "race" && this.localState)
      for (const c of this.connections.values())
        if (c.open)
          c.send({ type: "state", race: this.race.id, state: this.localState });
    if (!this.lastSync || Date.now() - this.lastSync > 5000) {
      this.lastSync = Date.now();
      if (!this.isHost) this.sync();
    }
  }
  broadcast() {
    const room = {
      type: "room",
      players: this.roster,
      phase: this.phase,
      race: this.race,
    };
    for (const c of this.connections.values())
      if (c.open && this.players[c.peer]) c.send(room);
  }
  fail(message) {
    if (this.closed) return;
    this.close();
    this.onError(message);
  }
  close() {
    this.closed = true;
    clearInterval(this.timer);
    clearTimeout(this.timeout);
    for (const c of this.connections.values()) c.close();
    this.connections.clear();
    this.peer?.destroy();
    this.players = {};
    this.phase = "offline";
    this.race = null;
  }
}
