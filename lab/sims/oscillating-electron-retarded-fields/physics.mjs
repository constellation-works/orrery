// Dimensionless Lienard–Wiechert fields. c = |q|/(4 pi epsilon0) = 1.
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
    axisymmetric: true,
    maxBeta: beta,
    at: t => ({
      position: [0, 0, beta * Math.sin(t)],
      velocity: [0, 0, beta * Math.cos(t)],
      acceleration: [0, 0, -beta * Math.sin(t)]
    })
  };
}
// A smooth closed hairpin: elongated ellipse in xz, upper turn at t=0.
// |v|² = w²(b² cos²(wt) + a² sin²(wt)) <= (a w)² = beta².
// Scale time with beta; beta=0 is the stationary source at the origin.
export function hairpin(beta = 0.72) {
  if (!Number.isFinite(beta) || beta < 0 || beta > MAX_BETA)
    throw new RangeError('Peak beta must be in [0, 0.8]');
  const a = 3, b = 1.4, w = beta / a;
  return {
    maxBeta: beta, axisymmetric: false, period: w ? 2 * Math.PI / w : Infinity,
    at: t => {
      const s = Math.sin(w * t), c = Math.cos(w * t);
      return {
        position: [b * s, 0, a * (c - 1)],
        velocity: [b * w * c, 0, -a * w * s],
        acceleration: [-b * w * w * s, 0, -a * w * w * c]
      };
    }
  };
}
// Smooth, bounded narrow racetrack. Analytic at all times, including turns.
// e controls rounding; |v| <= a*w = beta (proof in README).
export function racetrack(beta = 0.72) {
  if (!Number.isFinite(beta) || beta < 0 || beta > MAX_BETA)
    throw new RangeError('Peak beta must be in [0, 0.8]');
  const e = .12, a = 3 / Math.atan(1 / e), w = beta / a;
  return {
    maxBeta: beta, axisymmetric: false, period: w ? 2 * Math.PI / w : Infinity,
    at: t => {
      const s = Math.sin(w * t), c = Math.cos(w * t), d = e * e + s * s;
      return {
        position: [a * e * s / Math.sqrt(d), 0,
          a * (Math.asin(c / Math.sqrt(1 + e * e)) - Math.atan(1 / e))],
        velocity: [a * e ** 3 * w * c / d ** 1.5, 0, -a * w * s / Math.sqrt(d)],
        acceleration: [-a * e ** 3 * w * w * s * (d + 3 * c * c) / d ** 2.5,
          0, -a * w * w * e * e * c / d ** 1.5]
      };
    }
  };
}
export function retarded(point, time, motion, initialTr) {
  if (!Number.isFinite(time) || point.length !== 3 || !point.every(Number.isFinite) || !(motion.maxBeta >=
      0 && motion.maxBeta <= MAX_BETA)) throw new RangeError(
    'Finite coordinates and subluminal speed bound required');
  const distance = norm(sub(point, motion.at(time).position));
  // Speed bound: delay <= present distance/(1-beta_max). f'(tr)=1-n.beta >= .2.
  let lo = time - distance / (1 - motion.maxBeta),
    hi = time,
    tr = Number.isFinite(initialTr) && initialTr > lo && initialTr < hi
      ? initialTr : (lo + hi) / 2;
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
    // An in-bracket Newton step alone can alternate near opposite endpoints
    // on a tight periodic turn. Require progress as well as containment.
    tr = next > lo && next < hi && Math.abs(next - tr) < (hi - lo) / 2
      ? next : (lo + hi) / 2;
  }
  throw new Error('Retarded solve did not converge');
}
export function field(point, time, motion = sinusoid(), charge = -1, initialTr) {
  if (charge !== -1 && charge !== 1) throw new RangeError('Charge sign must be -1 or +1');
  const solved = retarded(point, time, motion, initialTr);
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
export function directionalPower(n, tr, motion) {
  const {velocity: beta, acceleration: a} = motion.at(tr);
  const v = cross(n, cross(sub(n, beta), a));
  return dot(v, v) / (4 * Math.PI * (1 - dot(n, beta)) ** 5);
}
// A meridian sample only. Multiplication by 2pi requires axial symmetry.
export function angularPower(theta, tr, motion) {
  return directionalPower([Math.sin(theta), 0, Math.cos(theta)], tr, motion);
}
