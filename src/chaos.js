import * as T from "three";
import {
  makeHazards,
  roadblockBoxes,
  monsterPhase,
  rubblePoints,
  ChaosEffects,
} from "./chaos-rules.js";
function dispose(root) {
  root.traverse((o) => {
    if (o.isMesh) {
      o.geometry.dispose();
      for (const m of Array.isArray(o.material) ? o.material : [o.material])
        m.dispose();
    }
  });
}
export class ChaosCourse {
  constructor(scene) {
    this.scene = scene;
    this.root = new T.Group();
    scene.add(this.root);
    this.effects = new ChaosEffects();
    this.event = null;
    this.clock = 0;
    this.lastEvent = -1;
    this.build(1);
  }
  build(seed) {
    for (const c of [...this.root.children]) {
      dispose(c);
      this.root.remove(c);
    }
    this.hazards = makeHazards(seed);
    this.blocks = roadblockBoxes(this.hazards);
    this.effects.reset();
    this.event = null;
    this.lastEvent = -1;
    this.monster = null;
    this.markers = [];
    this.boosts = [];
    const mat = (color, glow = 0) =>
      new T.MeshStandardMaterial({
        color,
        roughness: 0.7,
        metalness: 0.12,
        emissive: color,
        emissiveIntensity: glow,
      });
    const cube = (group, w, h, d, x, y, z, m) => {
      const o = new T.Mesh(new T.BoxGeometry(w, h, d), m);
      o.position.set(x, y, z);
      o.castShadow = true;
      o.receiveShadow = true;
      group.add(o);
      return o;
    };
    for (const h of this.hazards) {
      const g = new T.Group();
      g.position.set(h.x, 0, h.z);
      g.rotation.y = h.angle;
      this.root.add(g);
      if (h.type === "boost") {
        cube(g, 4.4, 0.045, 8, 0, 0.15, 0, mat("#1b7e86", 0.7));
        for (const z of [-2, 0, 2])
          for (const side of [-1, 1]) {
            const arrow = cube(
              g,
              0.18,
              0.06,
              1.6,
              side * 0.5,
              0.2,
              z,
              mat("#c1fff1", 1.2),
            );
            arrow.rotation.y = side * 0.65;
          }
        this.boosts.push(g);
      } else if (h.type === "roadblock") {
        cube(g, 3.6, 0.8, 0.85, 0, 0.55, 0, mat("#ece2bd"));
        for (let x = -1.4; x < 1.8; x += 0.65)
          for (const face of [-1, 1]) {
            const stripe = cube(
              g,
              0.32,
              0.85,
              0.025,
              x,
              0.55,
              face * 0.445,
              mat("#d75b35"),
            );
            stripe.rotation.z = -0.25;
          }
        for (const x of [-1.25, 1.25]) {
          cube(g, 0.35, 1.5, 0.35, x, 0.75, 0, mat("#b25c32"));
          const lamp = new T.Mesh(
            new T.SphereGeometry(0.17, 8, 6),
            mat("#ffbd48", 2),
          );
          lamp.position.set(x, 1.6, 0);
          g.add(lamp);
        }
      } else {
        const patch = new T.Mesh(
          new T.CircleGeometry(h.radius, 16),
          mat(
            h.type === "oil" ? "#162632" : "#151b1b",
            h.type === "oil" ? 0.08 : 0,
          ),
        );
        patch.rotation.x = -Math.PI / 2;
        patch.position.y = 0.16;
        g.add(patch);
        const rim = new T.Mesh(
          new T.TorusGeometry(h.radius, 0.14, 5, 20),
          mat(h.type === "oil" ? "#476c8c" : "#81745a"),
        );
        rim.rotation.x = Math.PI / 2;
        rim.position.y = 0.16;
        g.add(rim);
        if (h.type === "pothole")
          for (let i = 0; i < 5; i++) {
            const rubble = new T.Mesh(
              new T.IcosahedronGeometry(0.19, 0),
              mat("#6e6c5e"),
            );
            rubble.position.set(
              Math.cos(i) * h.radius,
              0.22,
              Math.sin(i) * h.radius,
            );
            g.add(rubble);
          }
      }
    }
    // Original procedural Godzilla-like kaiju: heavy silhouette, dorsal plates, tail, glowing eyes.
    const monster = new T.Group();
    this.root.add(monster);
    this.monster = monster;
    const green = mat("#324a3b"),
      belly = mat("#748478"),
      spine = mat("#75d6c3", 0.6);
    const ellipsoid = (r, s, x, y, z, m) => {
      const o = new T.Mesh(new T.SphereGeometry(r, 12, 10), m);
      o.scale.set(...s);
      o.position.set(x, y, z);
      monster.add(o);
      return o;
    };
    this.body = ellipsoid(5, [1, 1.9, 0.8], 0, 15, 0, green);
    ellipsoid(4, [0.8, 1.6, 0.6], -2, 15, 0, belly);
    this.head = ellipsoid(3.1, [1.1, 0.8, 0.85], -2, 26, 0, green);
    ellipsoid(2, [1.8, 0.65, 0.8], -4.2, 25, 0, green);
    for (const z of [-2, 2]) {
      ellipsoid(2, [1, 2.6, 1], 0, 5, z, green);
      ellipsoid(2, [1.8, 0.65, 1], -1, 1, z, green);
      ellipsoid(1, [2.4, 0.8, 1], -4, 18, z * 1.6, green);
      ellipsoid(0.35, [1, 1, 1], -4, 27, z * 1.1, mat("#b9ffde", 3));
    }
    for (let i = 0; i < 9; i++) {
      const plate = new T.Mesh(new T.ConeGeometry(1.7, 4, 3), spine);
      plate.position.set(3.5, 8 + i * 2, 0);
      plate.rotation.z = -Math.PI / 2;
      monster.add(plate);
    }
    for (let i = 0; i < 8; i++)
      ellipsoid(
        2.4 - i * 0.23,
        [1.3, 1, 1],
        4 + i * 2.1,
        8 - i * 0.8,
        Math.sin(i * 0.4) * 2,
        green,
      );
    const warningMaterial = new T.MeshBasicMaterial({
      color: "#ffbd57",
      transparent: true,
      opacity: 0.65,
      side: T.DoubleSide,
    });
    for (let i = 0; i < 3; i++) {
      const ring = new T.Mesh(
        new T.RingGeometry(1.7, 2.1, 24),
        warningMaterial,
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.23;
      const rock = new T.Mesh(
        new T.IcosahedronGeometry(1.7, 0),
        mat("#6b7165"),
      );
      this.root.add(ring, rock);
      this.markers.push({ ring, rock });
    }
    this.wave = new T.Mesh(
      new T.RingGeometry(0.93, 1, 48),
      new T.MeshBasicMaterial({
        color: "#6df6e0",
        transparent: true,
        opacity: 0.65,
        side: T.DoubleSide,
      }),
    );
    this.wave.rotation.x = -Math.PI / 2;
    this.root.add(this.wave);
    monster.visible = false;
    this.wave.visible = false;
    this.markers.forEach((m) => {
      m.ring.visible = m.rock.visible = false;
    });
  }
  setEvent(event) {
    this.event = event;
  }
  update(seconds, visible) {
    this.clock = seconds;
    this.root.visible = visible;
    for (const g of this.boosts)
      g.children[0].material.emissiveIntensity =
        0.6 + Math.sin(seconds * 5) * 0.2;
    const e = this.event,
      phase = monsterPhase(e, seconds);
    this.monster.visible = visible && phase.active;
    this.wave.visible = visible && phase.wave >= 0;
    for (const m of this.markers) m.ring.visible = m.rock.visible = false;
    if (!e || !phase.active) return;
    this.monster.position.set(
      e.x + Math.cos(e.angle) * e.side * 22,
      -Math.max(0, 2 - phase.age) * 16 - Math.max(0, phase.age - 11) * 12,
      e.z - Math.sin(e.angle) * e.side * 22,
    );
    this.monster.rotation.y = e.angle + (e.side < 0 ? Math.PI : 0);
    this.body.rotation.z = Math.sin(phase.age * 2) * 0.05;
    this.head.rotation.z = Math.sin(phase.age * 3) * 0.08;
    const points = rubblePoints(e);
    this.markers.forEach((m, i) => {
      const p = points[i];
      m.ring.position.set(p.x, 0.24, p.z);
      m.ring.visible = phase.age < 4;
      m.ring.material.opacity = 0.35 + Math.sin(seconds * 10) * 0.2;
      m.rock.visible = phase.age >= 3 && phase.age < 13;
      m.rock.position.set(p.x, Math.max(1.1, 30 - (phase.age - 3) * 29), p.z);
    });
    if (this.wave.visible) {
      this.wave.position.set(e.x, 0.3, e.z);
      this.wave.scale.setScalar(Math.max(0.1, phase.wave));
    }
  }
  apply(state, seconds, onHit = () => {}) {
    for (const h of this.hazards) {
      if (h.type === "roadblock") continue;
      const dx = state.x - h.x,
        dz = state.z - h.z;
      const inside =
        h.type === "boost"
          ? Math.abs(dx * Math.cos(h.angle) - dz * Math.sin(h.angle)) < 2.5 &&
            Math.abs(dx * Math.sin(h.angle) + dz * Math.cos(h.angle)) < 4.5
          : Math.hypot(dx, dz) < h.radius + 0.5;
      if (
        inside &&
        Math.abs(state.speed) > 2 &&
        this.effects.hit(h.id, h.type, seconds, state)
      )
        onHit(h.type);
    }
    const phase = monsterPhase(this.event, seconds);
    if (!this.event || !phase.active) return;
    if (phase.age >= 4 && phase.age < 13)
      for (const [i, p] of rubblePoints(this.event).entries())
        if (
          Math.hypot(state.x - p.x, state.z - p.z) < p.radius + 1 &&
          this.effects.hit(
            `monster-${this.event.id}-${i}`,
            "rubble",
            seconds,
            state,
          )
        )
          onHit("rubble");
    if (
      phase.wave >= 0 &&
      Math.abs(
        Math.hypot(state.x - this.event.x, state.z - this.event.z) - phase.wave,
      ) < 2 &&
      this.effects.hit(`wave-${this.event.id}`, "shockwave", seconds, state)
    )
      onHit("shockwave");
  }
}
