import * as T from "three";
import { makeHazards, roadblockBoxes, ChaosEffects } from "./chaos-rules.js";
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
    this.clock = 0;
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
  }
  update(seconds, visible) {
    this.root.visible = visible;
    for (const g of this.boosts)
      g.children[0].material.emissiveIntensity =
        0.6 + Math.sin(seconds * 5) * 0.2;
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
  }
}
