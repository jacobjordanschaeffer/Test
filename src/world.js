import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { route, onRoad, indexCollisions } from "./route.js";
import { makeTruck } from "./trucks.js";
export function buildWorld(scene) {
  const boxes = [],
    lamps = [],
    staticBoxes = [],
    wires = [];
  let seed = 42;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const materials = {};
  function mat(c) {
    return (materials[c] ??= new T.MeshStandardMaterial({
      color: c,
      roughness: 0.85,
      emissive: c === "#edd9a0" ? c : "#000000",
      emissiveIntensity: 0.35,
    }));
  }
  function box(w, h, d, x, y, z, c, collision = false) {
    const o = new T.Mesh(new T.BoxGeometry(w, h, d), mat(c));
    o.position.set(x, y, z);
    o.receiveShadow = true;
    if (h < 30) o.castShadow = true;
    scene.add(o);
    staticBoxes.push(o);
    if (collision) boxes.push({ x, z, w, d });
    return o;
  }
  box(1800, 0.5, 4100, 0, -0.35, -1600, "#536d60");
  box(150, 0.1, 1000, 430, -0.05, -2140, "#548c99");
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1],
      b = route[i],
      len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const width = i < 7 ? 16 : i < 12 ? 23 : 21;
    const walk = box(
      width + 6,
      0.15,
      len + width + 6,
      (a[0] + b[0]) / 2,
      0,
      (a[1] + b[1]) / 2,
      "#a7ab98",
    );
    walk.rotation.y = Math.atan2(b[0] - a[0], b[1] - a[1]);
    const road = box(width, 0.12, len + width, 0, 0, 0, "#394449");
    road.position.set((a[0] + b[0]) / 2, 0.035, (a[1] + b[1]) / 2);
    road.rotation.y = Math.atan2(b[0] - a[0], b[1] - a[1]);
    for (let k = 12; k < len; k += 20) {
      const t = k / len,
        x = a[0] + (b[0] - a[0]) * t,
        z = a[1] + (b[1] - a[1]) * t;
      const stripe = box(0.2, 0.015, 6, x, 0.105, z, "#d9cd9c");
      stripe.rotation.y = road.rotation.y;
    }
  }
  // Crosswalks, curb paint, and stop lines give every district a readable street scale.
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1],
      b = route[i],
      angle = Math.atan2(b[0] - a[0], b[1] - a[1]),
      len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let side of [-1, 1]) {
      const curb = box(
        0.22,
        0.13,
        len - 24,
        (a[0] + b[0]) / 2 + Math.cos(angle) * side * 8.6,
        0.12,
        (a[1] + b[1]) / 2 - Math.sin(angle) * side * 8.6,
        "#c8c2a9",
      );
      curb.rotation.y = angle;
    }
    for (let n = -5; n <= 5; n++) {
      const mark = box(
        0.7,
        0.02,
        4,
        b[0] + Math.cos(angle) * n,
        b[1] * 0 + 0.11,
        b[1] - Math.sin(angle) * n,
        "#d5d3bb",
      );
      mark.rotation.y = angle;
    }
  }
  // Side streets join neighbouring route legs, giving free-roam loops and race shortcuts.
  for (const z of [
    -280, -495, -725, -1020, -1330, -1650, -2020, -2370, -2700, -3050,
  ])
    box(650, 0.1, 13, 50, -0.01, z, "#434e50");
  const signTextures = [];
  const words = [
    "喫茶 ミドリ",
    "浅草商店",
    "ラーメン",
    "東京 日和",
    "居酒屋 はな",
    "珈琲",
    "小さな旅",
    "自転車",
    "お弁当",
    "TOKYO RUN",
  ];
  function sign(text, bg = "#e9ddbb") {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 80;
    const ctx = c.getContext("2d");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 256, 80);
    ctx.fillStyle = "#253d3b";
    ctx.font = "bold 34px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(text, 128, 53);
    const tex = new T.CanvasTexture(c);
    signTextures.push(tex);
    return new T.MeshBasicMaterial({ map: tex });
  }
  for (let z = 70; z > -3350; z -= 38) {
    for (let x = -255; x < 405; x += 39) {
      if (
        (x > 325 && z < -1600 && z > -2680) ||
        onRoad(x, z, 24) ||
        [
          -280, -495, -725, -1020, -1330, -1650, -2020, -2370, -2700, -3050,
        ].some((v) => Math.abs(z - v) < 25)
      )
        continue;
      const h = 7 + rand() * (z < -850 ? 48 : 14),
        w = 19 + rand() * 10,
        d = 20 + rand() * 9;
      const colors = [
        "#b7b4a0",
        "#808f88",
        "#d7c9aa",
        "#8d9b97",
        "#a1a8a0",
        "#b6a390",
      ];
      box(
        w,
        h,
        d,
        x,
        h / 2,
        z,
        colors[Math.floor(rand() * colors.length)],
        true,
      );
      box(w + 1, 0.5, d + 1, x, h + 0.25, z, "#4d6662");
      for (let yy = 3; yy < h - 1; yy += 4)
        for (let xx = -w / 2 + 3; xx < w / 2 - 1; xx += 5)
          box(
            2.4,
            1.6,
            0.08,
            x + xx,
            yy,
            z + d / 2 + 0.05,
            rand() > 0.35 ? "#edd9a0" : "#536e72",
          );
      if (h < 24 && rand() > 0.4) {
        const s = new T.Mesh(
          new T.PlaneGeometry(w * 0.85, 2.4),
          sign(words[Math.floor(rand() * words.length)]),
        );
        s.position.set(x, 3.6, z + d / 2 + 0.1);
        scene.add(s);
        box(w * 0.95, 0.2, 2.8, x, 4.9, z + d / 2 + 1, "#ae584a");
      }
    }
  }
  // Signal lamps and district name plates at intersections.
  for (let i = 1; i < route.length; i += 2) {
    const [x, z] = route[i];
    box(0.25, 6, 0.25, x + 12, 3, z + 10, "#53665c");
    box(8, 0.18, 0.18, x + 8, 6, z + 10, "#53665c");
    box(2.1, 0.7, 0.5, x + 5, 5.7, z + 10, "#273a36");
    for (let k = 0; k < 3; k++) {
      const bulb = new T.Mesh(
        new T.SphereGeometry(0.21, 8, 6),
        new T.MeshBasicMaterial({
          color: ["#b04f42", "#baa867", "#84ddc0"][k],
        }),
      );
      bulb.position.set(x + 4.3 + k * 0.65, 5.7, z + 10.3);
      scene.add(bulb);
    }
    const plate = new T.Mesh(
      new T.PlaneGeometry(4, 0.9),
      sign(i < 7 ? "浅草通り" : "東京 東町", "#bcd0c2"),
    );
    plate.position.set(x + 12, 4.5, z + 10.2);
    scene.add(plate);
  }
  // Two bridges and the far-bank promenade make a continuous riverside exploration loop.
  for (const z of [-1840, -2540]) {
    box(270, 0.13, 16, 385, 0.08, z, "#566163");
    for (const side of [-1, 1]) {
      box(270, 0.4, 0.3, 385, 1, z + side * 8, "#c7bda2");
      for (let x = 260; x < 520; x += 15)
        box(0.25, 1.2, 0.25, x, 0.6, z + side * 8, "#bdc5b4");
    }
  }
  box(18, 0.12, 716, 515, 0.04, -2190, "#465559");
  // Roadside details are positioned outside the drivable asphalt.
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1],
      b = route[i],
      dx = b[0] - a[0],
      dz = b[1] - a[1],
      len = Math.hypot(dx, dz),
      nx = -dz / len,
      nz = dx / len;
    for (let k = 25; k < len; k += 58) {
      const x = a[0] + (dx * k) / len + nx * 15,
        z = a[1] + (dz * k) / len + nz * 15;
      if (onRoad(x, z, -1)) continue;
      box(0.22, 8, 0.22, x, 4, z, "#596c68");
      wires.push(new T.Vector3(x, 7.6, z));
      if (k % 116 < 60) {
        box(2.8, 0.6, 2.8, x + nx * 5, 0.3, z + nz * 5, "#697b65");
        const trunk = new T.Mesh(
          new T.CylinderGeometry(0.15, 0.23, 3, 6),
          mat("#665e46"),
        );
        trunk.position.set(x + nx * 5, 1.8, z + nz * 5);
        scene.add(trunk);
        const crown = new T.Mesh(
          new T.IcosahedronGeometry(2.2, 1),
          mat("#6e8d6b"),
        );
        crown.position.set(x + nx * 5, 4, z + nz * 5);
        scene.add(crown);
      }
      box(2, 0.12, 0.6, x - nx, 8, z - nz, "#d5c7a2");
      const glow = box(0.7, 0.08, 0.5, x - nx, 7.9, z - nz, "#fff2bb");
      glow.material = new T.MeshBasicMaterial({ color: "#ffe3a2" });
      lamps.push(glow);
      box(1.2, 2.2, 0.9, x + 2, 1.1, z, "#c64e42", true);
      box(0.8, 1.2, 0.03, x + 2, 1.4, z + 0.47, "#acdfdb");
      if (k % 3 < 1) {
        const car = makeTruck(i % 6, "#909e9e");
        car.position.set(x + nx * 3, 0, z + nz * 3);
        scene.add(car);
        boxes.push({ x: car.position.x, z: car.position.z, w: 2, d: 3.5 });
      }
      const person = new T.Group();
      const body = new T.Mesh(
        new T.CapsuleGeometry(0.27, 0.65, 3, 6),
        mat(["#cc8a65", "#6e8590", "#ccbb8a"][i % 3]),
      );
      body.position.y = 1;
      person.add(body);
      const head = new T.Mesh(new T.SphereGeometry(0.22, 8, 6), mat("#d8b699"));
      head.position.y = 1.8;
      person.add(head);
      person.position.set(x + nx * 1.5, 0, z + nz * 1.5);
      person.userData.base = person.position.clone();
      person.userData.phase = k;
      scene.add(person);
      pedestrians.push(person);
    }
  }
  function temple(x, z, scale = 1) {
    for (let step = 0; step < 3; step++)
      box(
        (23 - step) * scale,
        0.25 * scale,
        (3 - step * 0.4) * scale,
        x,
        (step * 0.25 + 0.1) * scale,
        z + (8 + step * 0.4) * scale,
        "#a6a38a",
      );
    for (const offset of [-7, -3, 3, 7]) {
      box(
        0.5 * scale,
        6 * scale,
        0.5 * scale,
        x + offset * scale,
        3 * scale,
        z + 7.2 * scale,
        "#d09a56",
      );
      box(
        2.6 * scale,
        3.4 * scale,
        0.1 * scale,
        x + offset * scale,
        2.3 * scale,
        z + 7.1 * scale,
        "#5c4334",
      );
    }
    box(20 * scale, 6 * scale, 14 * scale, x, 3 * scale, z, "#a54b3c", true);
    for (const y of [7, 10]) {
      const roof = new T.Mesh(
        new T.ConeGeometry(17 * scale, 3 * scale, 4),
        mat("#3a5654"),
      );
      roof.rotation.y = Math.PI / 4;
      roof.scale.z = 0.75;
      roof.position.set(x, y * scale, z);
      scene.add(roof);
    }
    for (const xx of [-8, 8])
      box(
        0.7 * scale,
        7 * scale,
        0.7 * scale,
        x + xx * scale,
        3.5 * scale,
        z + 8 * scale,
        "#ba4935",
      );
  }
  temple(-48, -45, 2);
  temple(-65, 30, 0.7);
  for (const x of [-10, 10]) {
    box(0.5, 7, 0.5, x, 3.5, -28, "#af4b39");
  }
  box(23, 0.8, 1.1, 0, 7, -28, "#a84032");
  box(25, 0.45, 1.5, 0, 7.7, -28, "#344d48");
  for (let z = -10; z > -145; z -= 15)
    for (const x of [-11, 11]) {
      const lantern = new T.Mesh(
        new T.SphereGeometry(0.7, 10, 8),
        new T.MeshBasicMaterial({ color: "#ff9a63" }),
      );
      lantern.position.set(x, 3, z);
      scene.add(lantern);
      box(0.15, 3, 0.15, x, 1.5, z, "#4c5b52");
    }
  for (let i = 1; i < wires.length; i++) {
    if (wires[i].distanceTo(wires[i - 1]) > 90) continue;
    const a = wires[i - 1],
      b = wires[i],
      mid = a.clone().lerp(b, 0.5);
    mid.y -= 0.6;
    const curve = new T.QuadraticBezierCurve3(a, mid, b);
    const line = new T.Line(
      new T.BufferGeometry().setFromPoints(curve.getPoints(10)),
      new T.LineBasicMaterial({ color: "#374b43" }),
    );
    scene.add(line);
  }
  // Lattice tower at the destination: tapered steel silhouette with observation rings.
  const tower = new T.Group();
  tower.position.set(260, 0, -3275);
  for (let i = 0; i < 12; i++) {
    const y = i * 16,
      r = 22 * (1 - i / 14);
    for (let j = 0; j < 6; j++) {
      const a = (j * Math.PI) / 3,
        b = ((j + 1) * Math.PI) / 3;
      const pts = [
        new T.Vector3(Math.cos(a) * r, y, Math.sin(a) * r),
        new T.Vector3(Math.cos(b) * (r - 1.5), y + 16, Math.sin(b) * (r - 1.5)),
      ];
      const beam = new T.Mesh(
        new T.CylinderGeometry(0.5, 0.5, pts[0].distanceTo(pts[1]), 5),
        mat("#c3dad4"),
      );
      beam.position.copy(pts[0]).add(pts[1]).multiplyScalar(0.5);
      beam.quaternion.setFromUnitVectors(
        new T.Vector3(0, 1, 0),
        pts[1].clone().sub(pts[0]).normalize(),
      );
      tower.add(beam);
    }
  }
  for (const y of [155, 183]) {
    const disk = new T.Mesh(
      new T.CylinderGeometry(15, 12, 7, 24),
      mat("#b1d6cf"),
    );
    disk.position.y = y;
    tower.add(disk);
  }
  const needle = new T.Mesh(
    new T.CylinderGeometry(0.5, 3, 90, 8),
    mat("#bcd5d1"),
  );
  needle.position.y = 225;
  tower.add(needle);
  scene.add(tower);
  for (const x of [204, 236]) box(1, 12, 1, x, 6, -3220, "#d3bd88");
  const finish = new T.Mesh(
    new T.PlaneGeometry(31, 3),
    sign("FINISH   終点", "#ebd8a2"),
  );
  finish.position.set(220, 10, -3220);
  scene.add(finish);
  // Batch thousands of architectural details into a handful of draw calls.
  const batches = new Map();
  for (const o of staticBoxes) {
    const key =
      o.material.uuid +
      ":" +
      Math.floor(o.position.z / 180) +
      ":" +
      Math.floor(o.position.x / 180);
    if (!batches.has(key)) batches.set(key, []);
    batches.get(key).push(o);
  }
  const asphalt = document.createElement("canvas");
  asphalt.width = 128;
  asphalt.height = 128;
  const ac = asphalt.getContext("2d");
  ac.fillStyle = "#51585a";
  ac.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 5500; i++) {
    ac.fillStyle = rand() > 0.5 ? "#5b6263" : "#464f51";
    ac.fillRect(rand() * 128, rand() * 128, 1, 1);
  }
  const roadTexture = new T.CanvasTexture(asphalt);
  roadTexture.wrapS = roadTexture.wrapT = T.RepeatWrapping;
  roadTexture.repeat.set(4, 30);
  if (materials["#394449"]) {
    materials["#394449"].map = roadTexture;
    materials["#394449"].color.set("#b8c0b8");
  }
  const unit = new T.BoxGeometry(1, 1, 1),
    matrix = new T.Matrix4();
  for (const items of batches.values()) {
    const batch = new T.InstancedMesh(unit, items[0].material, items.length);
    batch.receiveShadow = true;
    batch.castShadow = items[0].geometry.parameters.height > 2;
    items.forEach((o, i) => {
      const p = o.geometry.parameters;
      o.scale.set(p.width, p.height, p.depth);
      o.updateMatrix();
      matrix.copy(o.matrix);
      batch.setMatrixAt(i, matrix);
      scene.remove(o);
      o.geometry.dispose();
    });
    batch.computeBoundingSphere();
    scene.add(batch);
  }
  // Merge static props, parked trucks, and tower struts by cell and material.
  scene.updateMatrixWorld(true);
  const propGroups = new Map(),
    props = [];
  scene.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh) return;
    let p = o;
    while (p) {
      if (pedestrians.includes(p)) return;
      p = p.parent;
    }
    props.push(o);
  });
  for (const o of props) {
    const m = o.material,
      key = [
        m.type,
        m.color?.getHex(),
        m.emissive?.getHex(),
        m.map?.uuid,
        m.metalness,
        m.roughness,
        m.opacity,
        Math.floor(o.getWorldPosition(new T.Vector3()).z / 180),
      ].join(":");
    if (!propGroups.has(key))
      propGroups.set(key, { material: m, geometries: [] });
    const geometry = o.geometry.clone().applyMatrix4(o.matrixWorld);
    if (geometry.index)
      propGroups.get(key).geometries.push(geometry.toNonIndexed());
    else propGroups.get(key).geometries.push(geometry);
    o.removeFromParent();
  }
  for (const { material, geometries } of propGroups.values()) {
    const geometry = mergeGeometries(geometries, false);
    if (!geometry) continue;
    const mesh = new T.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    for (const g of geometries) g.dispose();
  }
  indexCollisions(boxes);
  return { boxes, lamps };
}
export const pedestrians = [];
