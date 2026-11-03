// Original fictional route; units are metres. A deliberately winding 6.54 km run.
export const route = [
  [0, 0],
  [0, -170],
  [-130, -170],
  [-130, -390],
  [110, -390],
  [110, -600],
  [-170, -600],
  [-170, -850],
  [180, -850],
  [180, -1180],
  [-180, -1180],
  [-180, -1480],
  [250, -1480],
  [250, -1840],
  [-170, -1840],
  [-170, -2190],
  [300, -2190],
  [300, -2540],
  [-60, -2540],
  [-60, -2880],
  [220, -2880],
  [220, -3220],
];
export const districts = [
  "Temple District",
  "Asakusa Backstreets",
  "Downtown Express",
  "Riverside Drive",
  "Skytree District",
];
export const checkpoints = route.slice(1);
export function distanceToSegment(x, z, a, b) {
  const dx = b[0] - a[0],
    dz = b[1] - a[1];
  const t = Math.max(
    0,
    Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)),
  );
  return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
}
export function onRoad(x, z, margin = 0) {
  return route.some(
    (p, i) => i && distanceToSegment(x, z, route[i - 1], p) < 13 + margin,
  );
}
export function resolveCollision(x, z, r, boxes) {
  let candidates = boxes;
  if (boxes.spatial) {
    const { grid, cell } = boxes.spatial;
    const near = new Set();
    for (
      let xx = Math.floor((x - r) / cell);
      xx <= Math.floor((x + r) / cell);
      xx++
    )
      for (
        let zz = Math.floor((z - r) / cell);
        zz <= Math.floor((z + r) / cell);
        zz++
      )
        for (const b of grid.get(xx + "," + zz) || []) near.add(b);
    candidates = near;
  }
  for (const b of candidates) {
    const nx = Math.max(b.x - b.w / 2, Math.min(x, b.x + b.w / 2)),
      nz = Math.max(b.z - b.d / 2, Math.min(z, b.z + b.d / 2));
    if (Math.hypot(x - nx, z - nz) < r) return true;
  }
  return false;
}
export const routeLength = route.reduce(
  (s, p, i) =>
    s + (i ? Math.hypot(p[0] - route[i - 1][0], p[1] - route[i - 1][1]) : 0),
  0,
);

export const sideStreets = [
  ...[-280, -495, -725, -1020, -1330, -1650, -2020, -2370, -2700, -3050].map(
    (z) => [
      [-275, z],
      [375, z],
    ],
  ),
  [
    [250, -1840],
    [520, -1840],
  ],
  [
    [250, -2540],
    [520, -2540],
  ],
  [
    [515, -1840],
    [515, -2540],
  ],
];
export function indexCollisions(boxes, cell = 40) {
  const grid = new Map();
  for (const b of boxes)
    for (
      let x = Math.floor((b.x - b.w / 2) / cell);
      x <= Math.floor((b.x + b.w / 2) / cell);
      x++
    )
      for (
        let z = Math.floor((b.z - b.d / 2) / cell);
        z <= Math.floor((b.z + b.d / 2) / cell);
        z++
      ) {
        const k = x + "," + z;
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(b);
      }
  boxes.spatial = { grid, cell };
  return boxes;
}

export function mainRoadWidth(segment) {
  return segment < 7 ? 16 : segment < 12 ? 23 : 21;
}
function surfaceRect(a, b, width, endPadding = width / 2) {
  const horizontal = a[1] === b[1],
    ex = horizontal ? endPadding : width / 2,
    ez = horizontal ? width / 2 : endPadding;
  return {
    minX: Math.min(a[0], b[0]) - ex,
    maxX: Math.max(a[0], b[0]) + ex,
    minZ: Math.min(a[1], b[1]) - ez,
    maxZ: Math.max(a[1], b[1]) + ez,
  };
}
const pavedSurfaces = [
  ...route
    .slice(1)
    .map((b, i) => surfaceRect(route[i], b, mainRoadWidth(i + 1) + 6)),
  ...sideStreets.map(([a, b], i) =>
    surfaceRect(a, b, i < 10 ? 13 : i < 12 ? 16 : 18, i === 12 ? 8 : 0),
  ),
];
export function isPavedSurface(x, z) {
  return pavedSurfaces.some(
    (r) => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ,
  );
}
