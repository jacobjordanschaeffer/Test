// Host-resolved oriented truck bodies. Clients only apply host-issued impulses.
export function validBump(b) {
  return (
    b &&
    ["dx", "dz", "dvx", "dvz", "dyaw"].every((k) => Number.isFinite(b[k])) &&
    Math.abs(b.dx) <= 6 &&
    Math.abs(b.dz) <= 6 &&
    Math.hypot(b.dvx, b.dvz) <= 50.01 &&
    Math.abs(b.dyaw) <= 0.2
  );
}
function velocity(s) {
  return {
    x: s.vx ?? -Math.sin(s.yaw) * s.speed,
    z: s.vz ?? -Math.cos(s.yaw) * s.speed,
  };
}
export function truckContact(a, b, previousA, previousB) {
  const sa = a.state,
    sb = b.state;
  if (!sa || !sb) return null;
  const dx = sb.x - sa.x,
    dz = sb.z - sa.z,
    axes = [
      { x: Math.cos(sa.yaw), z: -Math.sin(sa.yaw) },
      { x: -Math.sin(sa.yaw), z: -Math.cos(sa.yaw) },
      { x: Math.cos(sb.yaw), z: -Math.sin(sb.yaw) },
      { x: -Math.sin(sb.yaw), z: -Math.cos(sb.yaw) },
    ];
  const wa = a.vehicle === 5 ? 0.64 : 0.8,
    wb = b.vehicle === 5 ? 0.64 : 0.8;
  let sweptTargets = null;
  let depth = Infinity,
    normal = null;
  for (const axis of axes) {
    const extent = (s, w) =>
      Math.abs(axis.x * Math.cos(s.yaw) - axis.z * Math.sin(s.yaw)) * w +
      Math.abs(-axis.x * Math.sin(s.yaw) - axis.z * Math.cos(s.yaw)) * 1.68;
    const overlap =
      extent(sa, wa) + extent(sb, wb) - Math.abs(dx * axis.x + dz * axis.z);
    if (overlap <= 0) {
      normal = null;
      break;
    }
    if (overlap < depth) {
      depth = overlap;
      const sign = dx * axis.x + dz * axis.z >= 0 ? 1 : -1;
      normal = { x: axis.x * sign, z: axis.z * sign };
    }
  }
  // Catch fast head-on crossings between network samples; ignore teleports/reset jumps.
  if (
    !normal &&
    previousA &&
    previousB &&
    Math.hypot(sa.x - previousA.x, sa.z - previousA.z) < 12 &&
    Math.hypot(sb.x - previousB.x, sb.z - previousB.z) < 12
  ) {
    const ox = previousB.x - previousA.x,
      oz = previousB.z - previousA.z,
      vx = dx - ox,
      vz = dz - oz,
      den = vx * vx + vz * vz,
      t = den ? Math.max(0, Math.min(1, -(ox * vx + oz * vz) / den)) : 0;
    if (t > 0 && t < 1 && Math.hypot(ox + vx * t, oz + vz * t) < wa + wb) {
      const length = Math.hypot(ox, oz) || 1;
      normal = { x: ox / length, z: oz / length };
      depth = 0.3;
      const ax = previousA.x + (sa.x - previousA.x) * t,
        az = previousA.z + (sa.z - previousA.z) * t,
        bx = previousB.x + (sb.x - previousB.x) * t,
        bz = previousB.z + (sb.z - previousB.z) * t;
      const extent = (s, w) =>
        Math.abs(normal.x * Math.cos(s.yaw) - normal.z * Math.sin(s.yaw)) * w +
        Math.abs(-normal.x * Math.sin(s.yaw) - normal.z * Math.cos(s.yaw)) *
          1.68;
      const ra = extent(sa, wa) + 0.04,
        rb = extent(sb, wb) + 0.04;
      sweptTargets = {
        a: {
          x: (ax + bx) / 2 - normal.x * ra,
          z: (az + bz) / 2 - normal.z * ra,
        },
        b: {
          x: (ax + bx) / 2 + normal.x * rb,
          z: (az + bz) / 2 + normal.z * rb,
        },
      };
    }
  }
  if (!normal) return null;
  const va = velocity(sa),
    vb = velocity(sb),
    closing = (vb.x - va.x) * normal.x + (vb.z - va.z) * normal.z;
  const impulse = Math.min(45, Math.max(0, -closing * 0.65)),
    separation = Math.min(2, depth * 0.5 + 0.03);
  function impact(s, sign) {
    const dvx = normal.x * impulse * sign,
      dvz = normal.z * impulse * sign;
    return {
      dx: sweptTargets
        ? Math.max(-6, Math.min(6, sweptTargets[sign < 0 ? "a" : "b"].x - s.x))
        : normal.x * separation * sign,
      dz: sweptTargets
        ? Math.max(-6, Math.min(6, sweptTargets[sign < 0 ? "a" : "b"].z - s.z))
        : normal.z * separation * sign,
      dvx,
      dvz,
      dyaw: Math.max(
        -0.12,
        Math.min(0.12, (dvx * Math.cos(s.yaw) - dvz * Math.sin(s.yaw)) * 0.004),
      ),
    };
  }
  return { [a.id]: impact(sa, -1), [b.id]: impact(sb, 1) };
}
export function applyTruckBump(s, b, boxes, blocked) {
  if (!validBump(b)) return false;
  const x = s.x + b.dx,
    z = s.z + b.dz;
  if (
    x >= -420 &&
    x <= 560 &&
    z >= -3400 &&
    z <= 130 &&
    !blocked(x, z, 1.05, boxes)
  ) {
    s.x = x;
    s.z = z;
  }
  s.vx = Math.max(
    -50,
    Math.min(50, (s.vx ?? -Math.sin(s.yaw) * s.speed) + b.dvx),
  );
  s.vz = Math.max(
    -50,
    Math.min(50, (s.vz ?? -Math.cos(s.yaw) * s.speed) + b.dvz),
  );
  s.yaw += b.dyaw;
  s.speed = Math.max(
    -12,
    Math.min(46, -s.vx * Math.sin(s.yaw) - s.vz * Math.cos(s.yaw)),
  );
  return true;
}
