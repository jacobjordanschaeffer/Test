import * as T from "three";
import { makeTruck } from "./trucks.js";
export class RemoteTrucks {
  constructor(scene) {
    this.scene = scene;
    this.models = new Map();
  }
  clear() {
    for (const { mesh } of this.models.values()) {
      this.scene.remove(mesh);
      mesh.traverse((o) => {
        if (o.isMesh) {
          o.geometry.dispose();
          for (const m of Array.isArray(o.material) ? o.material : [o.material])
            m.dispose();
        }
      });
    }
    this.models.clear();
  }
  update(players, localId, dt, visible) {
    const ids = new Set(
      players.filter((p) => p.id !== localId).map((p) => p.id),
    );
    for (const [id, obj] of this.models)
      if (!ids.has(id)) {
        this.scene.remove(obj.mesh);
        this.models.delete(id);
      }
    for (const p of players) {
      if (p.id === localId) continue;
      let obj = this.models.get(p.id);
      if (!obj) {
        const mesh = makeTruck(p.vehicle, p.paint);
        this.scene.add(mesh);
        obj = { mesh, initialized: false };
        this.models.set(p.id, obj);
      }
      const s = p.state;
      obj.mesh.visible = visible && !!s;
      if (!s) continue;
      const target = new T.Vector3(s.x, 0, s.z);
      if (!obj.initialized || obj.mesh.position.distanceTo(target) > 30) {
        obj.mesh.position.copy(target);
        obj.initialized = true;
      } else obj.mesh.position.lerp(target, 1 - Math.exp(-12 * dt));
      const difference = Math.atan2(
        Math.sin(s.yaw - obj.mesh.rotation.y),
        Math.cos(s.yaw - obj.mesh.rotation.y),
      );
      obj.mesh.rotation.y += difference * (1 - Math.exp(-12 * dt));
      for (const w of obj.mesh.userData.wheels) {
        w.tire.rotation.x -= (s.speed * dt) / 0.32;
        w.hub.rotation.x -= (s.speed * dt) / 0.32;
      }
      for (const light of obj.mesh.userData.rear)
        light.material.emissiveIntensity = s.brake ? 3 : 0.2;
    }
  }
}
