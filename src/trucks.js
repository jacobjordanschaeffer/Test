import * as T from "three";
export const trucks = [
  {
    name: "Daihatsu Hijet",
    year: "1998 · S110P",
    tag: "The original little workhorse",
    power: 8.7,
    grip: 7.8,
    max: 27,
    width: 1.48,
    cab: 1.55,
  },
  {
    name: "Suzuki Carry",
    year: "1999 · DA52T",
    tag: "Light feet. Quick corners.",
    power: 9.5,
    grip: 8.1,
    max: 29,
    width: 1.48,
    cab: 1.45,
  },
  {
    name: "Honda Acty",
    year: "1997 · HA4",
    tag: "Mid-engine mountain spirit",
    power: 9.1,
    grip: 9,
    max: 28,
    width: 1.45,
    cab: 1.52,
  },
  {
    name: "Subaru Sambar",
    year: "1998 · KS4",
    tag: "A little more character",
    power: 8.2,
    grip: 8.8,
    max: 28,
    width: 1.5,
    cab: 1.65,
  },
  {
    name: "Mitsubishi Minicab",
    year: "1999 · U62T",
    tag: "Built for the long way home",
    power: 8.8,
    grip: 8.3,
    max: 28,
    width: 1.47,
    cab: 1.5,
  },
  {
    name: "Daihatsu Midget II",
    year: "1996 · K100P",
    tag: "Small truck. Huge personality.",
    power: 7.5,
    grip: 7.6,
    max: 23,
    width: 1.18,
    cab: 1.45,
  },
];
export const paints = [
  "#d4e5da",
  "#e5bd6f",
  "#d95b46",
  "#5b8d9e",
  "#f1eee3",
  "#666c86",
];
export function makeTruck(index = 0, color = paints[0]) {
  const spec = trucks[index],
    g = new T.Group(),
    w = spec.width;
  const paint = new T.MeshStandardMaterial({
    color,
    metalness: 0.35,
    roughness: 0.3,
  });
  const glass = new T.MeshStandardMaterial({
    color: "#28464d",
    metalness: 0.65,
    roughness: 0.17,
    transparent: true,
    opacity: 0.65,
  });
  const dark = new T.MeshStandardMaterial({
      color: "#242c30",
      roughness: 0.75,
    }),
    chrome = new T.MeshStandardMaterial({
      color: "#b3bdb7",
      metalness: 0.8,
      roughness: 0.25,
    });
  function box(s, p, m) {
    const o = new T.Mesh(new T.BoxGeometry(...s), m);
    o.position.set(...p);
    o.castShadow = true;
    g.add(o);
    return o;
  }
  box([w, 0.23, 3.15], [0, 0.58, 0], dark);
  box([w, 0.72, 1.28], [0, 1, -0.85], paint);
  box([w, 0.09, 1.39], [0, 1.99, -0.81], paint);
  box([w - 0.12, 0.56, 1.15], [0, 1.66, -0.82], glass);
  for (const x of [-w / 2 + 0.04, w / 2 - 0.04]) {
    for (const z of [-1.43, -0.21])
      box([0.075, 0.68, 0.075], [x, 1.67, z], paint);
    box([0.055, 0.07, 1.24], [x, 1.4, -0.82], paint);
    box([0.16, 0.13, 0.1], [x * 1.17, 1.62, -1.4], dark);
    box([0.025, 0.035, 0.19], [x * 1.02, 1.15, -0.42], chrome);
  }
  box([w, 0.1, 1.68], [0, 0.81, 0.72], paint);
  for (const x of [-w / 2, w / 2])
    box([0.07, 0.37, 1.72], [x, 1.02, 0.73], paint);
  box([w, 0.38, 0.075], [0, 1.02, 1.57], paint);
  box([w, 0.12, 0.13], [0, 0.65, -1.56], chrome);
  box([w * 0.65, 0.16, 0.04], [0, 0.97, -1.505], dark);
  const rear = [];
  const lamp = new T.MeshStandardMaterial({
    color: "#fff5cf",
    emissive: "#ffdf94",
    emissiveIntensity: 1.5,
  });
  for (const x of [-w * 0.32, w * 0.32]) {
    box([index === 5 ? 0.19 : 0.32, 0.19, 0.05], [x, 1.14, -1.52], lamp);
    rear.push(
      box(
        [0.22, 0.13, 0.04],
        [x, 0.89, 1.62],
        new T.MeshStandardMaterial({
          color: "#d94335",
          emissive: "#ff2300",
          emissiveIntensity: 0.2,
        }),
      ),
    );
  }
  box(
    [0.36, 0.15, 0.035],
    [0, 0.74, -1.64],
    new T.MeshStandardMaterial({ color: "#e7bc42" }),
  );
  box([w - 0.2, 0.12, 0.35], [0, 1.43, -1.2], dark);
  const steering = new T.Mesh(new T.TorusGeometry(0.16, 0.025, 6, 16), dark);
  steering.position.set(w * 0.23, 1.51, -0.98);
  steering.rotation.x = -0.5;
  g.add(steering);
  const wheels = [];
  for (const x of [-w * 0.51, w * 0.51])
    for (const z of [-0.96, 1.02]) {
      const pivot = new T.Group();
      pivot.position.set(x, 0.43, z);
      g.add(pivot);
      const tire = new T.Mesh(
        new T.CylinderGeometry(0.32, 0.32, 0.19, 16),
        dark,
      );
      tire.rotation.z = Math.PI / 2;
      pivot.add(tire);
      const hub = new T.Mesh(
        new T.CylinderGeometry(0.18, 0.18, 0.195, 12),
        chrome,
      );
      hub.rotation.z = Math.PI / 2;
      pivot.add(hub);
      wheels.push({ pivot, tire, hub, front: z < 0 });
    }
  if (index === 5) {
    const spare = new T.Mesh(
      new T.CylinderGeometry(0.27, 0.27, 0.16, 16),
      dark,
    );
    spare.rotation.x = Math.PI / 2;
    spare.position.set(0, 1.25, -1.64);
    g.add(spare);
  }
  if (index === 3) box([w, 0.12, 1.3], [0, 2.08, -0.8], paint);
  // Model-specific fascia, raised bed ribs, and narrow stamped door seams.
  for (let i = 0; i < 4; i++)
    box(
      [w * 0.5, 0.022, 0.03],
      [0, 0.93 + i * 0.05, -1.534],
      index === 1 ? chrome : dark,
    );
  for (const x of [-w * 0.36, 0, w * 0.36])
    box([0.025, 0.025, 1.5], [x, 0.874, 0.72], chrome);
  for (const x of [-w * 0.505, w * 0.505])
    box([0.012, 0.6, 0.016], [x, 1.02, -0.22], dark);
  const badge = new T.Mesh(
    new T.CircleGeometry(0.055, index === 4 ? 3 : 12),
    chrome,
  );
  badge.position.set(0, 1.2, -1.54);
  badge.rotation.y = Math.PI;
  g.add(badge);
  g.scale.y = spec.cab / 1.55;
  g.userData = { wheels, steering, spec, rear };
  return g;
}
