// Dimensionless Lienard–Wiechert fields. c = omega = |q|/(4 pi epsilon0) = 1.
// Sources and conventions: README.md. No rendering state enters this module.
export const MAX_BETA = 0.8;
export const EXCLUSION = 0.18;
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const add = (a, b) => a.map((v, i) => v + b[i]);
export const sub = (a, b) => a.map((v, i) => v - b[i]);
export const scale = (a, s) => a.map(v => v * s);
export const norm = a => Math.hypot(...a);
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[
  0]];
export function sinusoid(beta = 0.15) {
  if (!Number.isFinite(beta) || beta < 0 || beta > MAX_BETA) throw new RangeError(
    'Peak beta must be in [0, 0.8]');
  return {
    maxBeta: beta,
    at: t => ({
      position: [0, 0, beta * Math.sin(t)],
      velocity: [0, 0, beta * Math.cos(t)],
      acceleration: [0, 0, -beta * Math.sin(t)]
    })
  };
}
export function retarded(point, time, motion) {
  if (!Number.isFinite(time) || point.length !== 3 || !point.every(Number.isFinite) || !(motion.maxBeta >=
      0 && motion.maxBeta <= MAX_BETA)) throw new RangeError(
    'Finite coordinates and subluminal speed bound required');
  const distance = norm(sub(point, motion.at(time).position));
  // Speed bound: delay <= present distance/(1-beta_max). f'(tr)=1-n.beta >= .2.
  let lo = time - distance / (1 - motion.maxBeta),
    hi = time,
    tr = (lo + hi) / 2;
  const tolerance = 2e-12 * Math.max(1, distance);
  for (let iterations = 1; iterations <= 64; iterations++) {
    const source = motion.at(tr),
      displacement = sub(point, source.position),
      R = norm(displacement);
    const residual = tr + R - time;
    if (Math.abs(residual) <= tolerance) return {
      tr,
      R,
      source,
      residual,
      iterations,
      n: R ? scale(displacement, 1 / R) : [0, 0, 0]
    };
    if (residual > 0) hi = tr;
    else lo = tr;
    const derivative = R ? 1 - dot(displacement, source.velocity) / R : 1;
    const next = tr - residual / derivative;
    tr = next > lo && next < hi ? next : (lo + hi) / 2;
  }
  throw new Error('Retarded solve did not converge');
}
export function field(point, time, motion = sinusoid(), charge = -1) {
  if (charge !== -1 && charge !== 1) throw new RangeError('Charge sign must be -1 or +1');
  const solved = retarded(point, time, motion);
  // A fixed physical sphere about the present source: no softened/fabricated field.
  if (norm(sub(point, motion.at(time).position)) <= EXCLUSION) return {
    ...solved,
    masked: true
  };
  const {
    n,
    R,
    source
  } = solved, beta = source.velocity, k = 1 - dot(n, beta), nb = sub(n, beta);
  const Enear = scale(nb, charge * (1 - dot(beta, beta)) / (k ** 3 * R ** 2));
  const Erad = scale(cross(n, cross(nb, source.acceleration)), charge / (k ** 3 * R));
  const Bnear = cross(n, Enear),
    Brad = cross(n, Erad),
    E = add(Enear, Erad),
    B = add(Bnear, Brad);
  return {
    ...solved,
    masked: false,
    k,
    Enear,
    Erad,
    Bnear,
    Brad,
    E,
    B,
    S: scale(cross(E, B), 1 / (4 * Math.PI))
  };
}
// Radiation power per SOURCE time and solid angle, on a sphere about source(tr).
// dt_observer = k dt_source supplies one power of k relative to R² S_rad.
export function angularPower(theta, tr, motion) {
  const R = 100,
    source = motion.at(tr),
    n = [Math.sin(theta), 0, Math.cos(theta)];
  const f = field(add(source.position, scale(n, R)), tr + R, motion);
  return R * R * dot(f.Erad, f.Erad) * f.k / (4 * Math.PI);
}
