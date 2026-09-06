import {
  field,
  norm,
  scale,
  dot
} from './physics.mjs';

// Fixed physical lattice, not emitted rings or field-line geometry. Staggering
// avoids projection aliasing. All settings sample the SAME spacetime field.
export function samplePoints(density = 'standard') {
  const [nr, nz, na] = density === 'dense' ? [24, 48, 20] : density === 'light' ? [12, 32, 12] : [16, 42, 12];
  const points = [];
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nr; i++)
      for (let k = 0; k < na; k++) {
        const r = .3 + (i + .5 * (j % 2)) * 10 / nr;
        const phi = (k + (.381966 * j + .618034 * i) % 1) * Math.PI / na;
        points.push([r * Math.cos(phi), r * Math.sin(phi), -7.5 + 12 * j / (nz - 1)]);
      }
  return points.sort((a, b) => b[1] - a[1]);
}
export function sample(p, time, motion, component = 'total', vector = 'B', initialTr) {
  const f = field(p, time, motion, -1, initialTr);
  if (f.masked) return {
    p,
    masked: true
  };
  const suffix = component === 'total' ? '' : component === 'near' ? 'near' : 'rad';
  const v = f[vector + suffix],
    magnitude = norm(v);
  const r = Math.hypot(p[0], p[1]);
  // Azimuth about the FIXED z axis; this scalar does not assume axial symmetry.
  const sign = vector === 'B' ? dot(v, [-p[1] / r, p[0] / r, 0]) : v[2];
  return {
    p,
    v,
    magnitude,
    sign,
    direction: magnitude ? scale(v, 1 / magnitude) : [0, 0, 0],
    tr: f.tr
  };
}
export const brightness = (magnitude, gain) => Math.min(1, Math.log1p(100 * gain * magnitude) / Math.log(21));
