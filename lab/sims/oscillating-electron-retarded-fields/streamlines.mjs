import {field, norm, add, sub, scale, dot} from './physics.mjs';

export const selected = (f, component) => component === 'near' ? [f.Enear, f.Bnear]
  : component === 'rad' ? [f.Erad, f.Brad] : [f.E, f.B];

// Integrate dx/ds = ±B/|B| at ONE observation time. No emission history,
// symmetry assumption, time interpolation or connectivity between frames.
export function trace(seed, time, motion, component = 'total', step = .16, steps = 72) {
  const sample = p => {
    if (norm(sub(p, [0, 0, -1])) > 10) return null;
    const f = field(p, time, motion);
    if (f.masked) return null;
    const B = selected(f, component)[1], magnitude = norm(B);
    return magnitude > 1e-10 ? {p, B, direction: scale(B, 1 / magnitude), magnitude} : null;
  };
  const origin = sample(seed);
  if (!origin) return [];
  function branch(sign) {
    const points = [];
    let current = origin;
    for (let i = 0; i < steps; i++) {
      // Explicit midpoint with curvature/mask rejection. Do not bridge a null.
      const h = sign * step;
      const mid = sample(add(current.p, scale(current.direction, h / 2)));
      if (!mid || dot(current.direction, mid.direction) < .5) break;
      const next = sample(add(current.p, scale(mid.direction, h)));
      if (!next || dot(mid.direction, next.direction) < .5) break;
      points.push(next);
      current = next;
      if (i > 12 && norm(sub(current.p, seed)) < step * .7) break;
    }
    return points;
  }
  return [...branch(-1).reverse(), origin, ...branch(1)];
}

export function seeds(density) {
  const xs = density === 'sparse' ? [-3.6, -1.8, 1.8, 3.6]
    : density === 'dense' ? [-5, -3.6, -2.2, -.8, .8, 2.2, 3.6, 5]
    : [-4.6, -2.8, -1, 1, 2.8, 4.6];
  return [-4, -2, 0, 2].flatMap(z => xs.map(x => [x, 0, z]));
}
