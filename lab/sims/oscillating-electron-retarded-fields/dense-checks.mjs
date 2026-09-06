// Additional independent controls for the narrow trajectory and dense sampler.
// Run with Node; no browser or third-party numerical library required.
import assert from 'node:assert/strict';
import {
  racetrack,
  field,
  retarded,
  norm,
  sub,
  scale,
  dot,
  cross,
  directionalPower
} from './physics.mjs';
import {
  samplePoints,
  sample
} from './sampling.mjs';
let derivatives = 0,
  residual = 0,
  iterations = 0,
  samples = 0,
  potentialError = 0,
  powerError = 0;
for (const beta of [0, .01, .15, .72, .8]) {
  const m = racetrack(beta),
    h = 1e-5;
  for (let i = -200; i <= 200; i++) {
    const t = i * .071,
      s = m.at(t),
      l = m.at(t - h),
      r = m.at(t + h);
    const error = Math.max(norm(sub(scale(sub(r.position, l.position), .5 / h), s.velocity)), norm(sub(scale(
      sub(r.velocity, l.velocity), .5 / h), s.acceleration)));
    derivatives = Math.max(derivatives, error);
    assert.ok(error < 2e-8, `derivatives ${error}`);
    assert.ok(norm(s.velocity) <= beta + 1e-13 && Math.abs(s.position[0]) < .25 && s.position[2] >= -6 -
      1e-14 && s.position[2] <= 1e-14);
    if (beta) assert.ok(norm(sub(s.position, m.at(t + m.period).position)) < 1e-12);
  }
}
for (const beta of [-1, .81, NaN, Infinity]) assert.throws(() => racetrack(beta), RangeError);
// Regression: in-bracket Newton previously alternated across almost the whole
// bracket for 64 iterations on this perfectly subluminal trajectory.
const regression = retarded([5.749999185989418, -7.520324935725769, 3.814285714285715], -1.1979, racetrack());
assert.ok(Math.abs(regression.residual) < 3e-11 && regression.iterations < 30);
for (const density of ['light', 'standard', 'dense'])
  for (const t of [-3, -1.5, -.3, 0, .3, 1, 2, 4, 7]) {
    const m = racetrack(.8);
    for (const p of samplePoints(density)) {
      const f = field(p, t, m);
      samples++;
      iterations = Math.max(iterations, f.iterations);
      const err = Math.abs(f.residual) / Math.max(1, norm(sub(p, m.at(t).position)));
      residual = Math.max(residual, err);
      assert.ok(err < 2.1e-12);
      if (!f.masked) {
        assert.ok(f.E.every(Number.isFinite) && f.B.every(Number.isFinite));
        assert.ok(norm(sub(f.B, f.Bnear.map((v, i) => v + f.Brad[i]))) < 1e-10);
      }
    }
  }
// Independent trajectory expression and finite-difference velocity. Potentials
// use 90 bisections with a bound on position, never the production root solver.
function position(t, beta) {
  const e = .12,
    a = 3 / Math.atan(1 / e),
    u = beta * t / a,
    s = Math.sin(u),
    c = Math.cos(u);
  return [a * e * s / Math.sqrt(e * e + s * s), 0, a * (Math.atan2(c, Math.sqrt(e * e + s * s)) - Math.atan(
    1 / e))];
}

function velocity(t, beta) {
  const h = 2e-4;
  return [0, 1, 2].map(i => (-position(t + 2 * h, beta)[i] + 8 * position(t + h, beta)[i] - 8 * position(t -
    h, beta)[i] + position(t - 2 * h, beta)[i]) / (12 * h));
}

function potentials(p, t, beta) {
  let lo = t - Math.hypot(...p) - 7,
    hi = t;
  for (let j = 0; j < 90; j++) {
    const tr = (lo + hi) / 2;
    if (tr + norm(sub(p, position(tr, beta))) > t) hi = tr;
    else lo = tr;
  }
  const tr = (lo + hi) / 2,
    d = sub(p, position(tr, beta)),
    v = velocity(tr, beta),
    phi = -1 / (norm(d) - dot(d, v));
  return [phi, ...v.map(x => phi * x)];
}
for (const beta of [.15, .72, .8])
  for (const t of [-3, 0, .2, 2, 4, 7])
    for (const p of [
        [1, .4, 2],
        [-2, 1, -1],
        [7, -4, 3],
        [-.4, .6, -3]
      ]) {
      const h = 2e-4,
        spatial = [0, 1, 2].map(i => {
          const a = [...p],
            b = [...p];
          a[i] += h;
          b[i] -= h;
          return scale(sub(potentials(a, t, beta), potentials(b, t, beta)), .5 / h);
        });
      const dt = scale(sub(potentials(p, t + h, beta), potentials(p, t - h, beta)), .5 / h),
        E = spatial.map((d, i) => -d[0] - dt[i + 1]),
        B = [spatial[1][3] - spatial[2][2], spatial[2][1] - spatial[0][3], spatial[0][2] - spatial[1][1]],
        f = field(p, t, racetrack(beta));
      const err = Math.max(norm(sub(E, f.E)) / norm(f.E), norm(sub(B, f.B)) / norm(f.B));
      potentialError = Math.max(potentialError, err);
      assert.ok(err < 2e-5, `independent potentials ${err}`);
    }
for (const t of [-1, 0, .2, 2]) {
  const m = racetrack(.8),
    s = m.at(t);
  let power = 0;
  const nMu = 800,
    nPhi = 160;
  for (let i = 0; i < nMu; i++)
    for (let j = 0; j < nPhi; j++) {
      const mu = -1 + (i + .5) * 2 / nMu,
        phi = (j + .5) * 2 * Math.PI / nPhi;
      power += directionalPower([Math.sqrt(1 - mu * mu) * Math.cos(phi), Math.sqrt(1 - mu * mu) * Math.sin(
        phi), mu], t, m) * 4 * Math.PI / (nMu * nPhi);
    }
  const exact = (2 / 3) * (norm(s.acceleration) ** 2 - norm(cross(s.velocity, s.acceleration)) ** 2) / (1 -
    norm(s.velocity) ** 2) ** 3;
  const err = Math.abs(power / exact - 1);
  powerError = Math.max(powerError, err);
  assert.ok(err < 2e-4, `power ${err}`);
}
// Same past, different future: observers outside the light cone cannot tell.
const m = racetrack(),
  continuation = {
    maxBeta: .72,
    at: t => t <= 0 ? m.at(t) : {
      position: [.72 * t, 0, 0],
      velocity: [.72, 0, 0],
      acceleration: [0, 0, 0]
    }
  };
let outsideDifference = 0;
for (const p of [
    [2, 0, 0],
    [5, 0, 0],
    [3, 2, -1]
  ])
  for (const fraction of [.1, .5, .99]) {
    const t = norm(p) * fraction,
      a = field(p, t, m),
      b = field(p, t, continuation);
    assert.ok(a.tr < 0 && b.tr < 0);
    outsideDifference = Math.max(outsideDifference, norm(sub(a.E, b.E)), norm(sub(a.B, b.B)));
  }
assert.ok(outsideDifference < 2e-9);
assert.ok(norm(sub(field([2, 0, 0], 4, m).B, field([2, 0, 0], 4, continuation).B)) > .01);
const witnesses = [2, 5].map(x => field([x, 0, 0], 2, m));
assert.ok(witnesses[0].B[1] > 0 && witnesses[1].B[1] < 0);
for (const component of ['total', 'near', 'rad'])
  for (const vector of ['B', 'E']) {
    for (const p of samplePoints('light').filter((_, i) => i % 53 === 0)) {
      const s = sample(p, 2, m, component, vector),
        f = field(p, 2, m);
      if (s.masked) continue;
      const v = f[vector + (component === 'total' ? '' : component === 'near' ? 'near' : 'rad')];
      assert.deepEqual(s.v, v);
      assert.ok(norm(sub(s.direction, scale(v, 1 / norm(v)))) < 1e-12);
      assert.ok(norm(sub(v, scale(field(p, 2, m, 1)[vector + (component === 'total' ? '' : component ===
        'near' ? 'near' : 'rad')], -1))) < 1e-12);
    }
  }
// Warm starts change convergence cost, not the root or field to solver accuracy.
let warmRelativeError = 0;
for (const beta of [.45, .8])
  for (const p of samplePoints('light').filter((_, i) => i % 31 === 0)) {
    let tr;
    for (let t = -4; t <= 10; t += .137) {
      const m = racetrack(beta),
        cold = field(p, t, m),
        warm = field(p, t, m, -1, tr);
      tr = warm.tr;
      if (cold.masked) continue;
      const err = norm(sub(cold.B, warm.B)) / Math.max(1e-6, norm(cold.B));
      warmRelativeError = Math.max(warmRelativeError, err);
      assert.ok(err < 2e-8);
    }
  }
assert.equal(sample([2, 0, 0], 0, racetrack(0)).magnitude, 0);
console.log(JSON.stringify({
  status: 'pass',
  trajectoryDerivativeAbsoluteError: derivatives,
  warmRelativeError,
  denseSweep: {
    samples,
    maxNormalizedResidual: residual,
    maxIterations: iterations
  },
  newtonStagnationRegression: regression.iterations,
  independentPotentialRelativeError: potentialError,
  fullSpherePowerRelativeError: powerError,
  causality: {
    outsideLightConeDifference: outsideDifference,
    nearFarAtTwo: witnesses.map(f => ({
      tr: f.tr,
      By: f.B[1]
    }))
  },
  renderedVectors: 'exact kernel selection; normalized physical direction; electron sign checked'
}, null, 2));
