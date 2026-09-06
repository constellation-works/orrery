// Run: node lab/sims/oscillating-electron-retarded-fields/checks.mjs
import assert from 'node:assert/strict';
import {
  field,
  hairpin,
  directionalPower,
  sinusoid,
  retarded,
  norm,
  sub,
  scale,
  add,
  dot,
  cross,
  EXCLUSION,
  angularPower
} from './physics.mjs';
import {trace} from './streamlines.mjs';
const results = {},
  close = (actual, expected, tol, label) => assert.ok(Math.abs(actual - expected) <= tol,
    `${label}: ${actual} vs ${expected}, tolerance ${tol}`);
const vectorClose = (a, b, tol, label) => close(norm(sub(a, b)), 0, tol, label);
let count = 0,
  maxResidual = 0,
  maxIterations = 0,
  maxWaveError = 0;
for (const beta of [0, .001, .01, .15, .3, .5, .65, .79, .8])
  for (let j = 0; j < 32; j++)
    for (let k = 0; k <= 12; k++)
      for (const radius of [.180001, .2, .5, 1, 2, 5, 8, 12, 100, 10000]) {
        const t = j * 2 * Math.PI / 32,
          m = sinusoid(beta),
          theta = k * Math.PI / 12,
          phi = j * 2.399963;
        const p = add(m.at(t).position, scale([Math.sin(theta) * Math.cos(phi), Math.sin(theta) * Math.sin(
          phi), Math.cos(theta)], radius));
        const f = field(p, t, m);
        assert.equal(f.masked, false);
        assert.ok(f.tr <= t + 1e-12);
        assert.ok(f.k >= .2 - 1e-12);
        const residual = Math.abs(f.tr + norm(sub(p, m.at(f.tr).position)) - t);
        maxResidual = Math.max(maxResidual, residual);
        maxIterations = Math.max(maxIterations, f.iterations);
        assert.ok(residual <= 2.1e-12 * Math.max(1, radius));
        for (const key of ['E', 'B', 'Enear', 'Erad', 'Bnear', 'Brad', 'S']) assert.ok(f[key].every(Number
          .isFinite));
        vectorClose(f.E, add(f.Enear, f.Erad), 1e-12, 'E decomposition');
        const waveError = Math.abs(norm(f.Erad) - norm(f.Brad)) / Math.max(1e-20, norm(f.Erad));
        maxWaveError = Math.max(maxWaveError, waveError);
        assert.ok(waveError < 1e-9);
        if (j === 0 && k === 4) assert.deepEqual(f, field(p, t, m));
        count++;
      }
results.sweep = {
  count,
  maxResidual,
  maxIterations,
  maxRelativeEradMinusCBrad: maxWaveError
};
for (const beta of [0, .15, .8])
  for (const t of [0, 1, Math.PI / 2, 5]) {
    const m = sinusoid(beta),
      center = m.at(t).position;
    for (const r of [0, EXCLUSION / 2, EXCLUSION - 1e-10]) assert.equal(field(add(center, [r, 0, 0]), t, m)
      .masked, true);
    assert.equal(field(add(center, [EXCLUSION + 1e-10, 0, 0]), t, m).masked, false);
  }
for (const beta of [-1, .800001, 1, Infinity, NaN]) assert.throws(() => sinusoid(beta), RangeError);
for (const t of [-10000, -100, 100, 10000]) assert.ok(Math.abs(retarded([3, 4, 2], t, sinusoid(.8))
  .residual) < 2e-11);
results.boundaryControls =
  'pass: invalid beta rejected; mask fixed at present-source radius 0.18; long/negative times finite';
let stationaryError = 0,
  uniformError = 0;
for (const p of [
    [1, 0, 0],
    [0, 0, 3],
    [-2, 3, 4]
  ]) {
  const f = field(p, 2, sinusoid(0)),
    expected = scale(p, -1 / norm(p) ** 3);
  stationaryError = Math.max(stationaryError, norm(sub(f.E, expected)));
  vectorClose(f.E, expected, 1e-12, 'Coulomb negative charge');
  vectorClose(f.B, [0, 0, 0], 1e-12, 'static B');
  vectorClose(f.Erad, [0, 0, 0], 0, 'static radiation');
  assert.ok(dot(f.E, p) < 0);
}
for (const beta of [0, .15, .6, .8])
  for (const t of [-5, 0, 4])
    for (const p of [
        [2, 1, 3],
        [-4, 2, -1],
        [1, 0, 9]
      ]) {
      const velocity = [0, 0, beta],
        m = {
          maxBeta: beta,
          at: t => ({
            position: [0, 0, beta * t],
            velocity,
            acceleration: [0, 0, 0]
          })
        };
      const f = field(p, t, m),
        r = sub(p, m.at(t).position),
        expected = scale(r, -(1 - beta ** 2) / (dot(r, r) - norm(cross(velocity, r)) ** 2) ** 1.5);
      const err = norm(sub(f.E, expected)) / norm(expected);
      uniformError = Math.max(uniformError, err);
      assert.ok(err < 1e-10);
      vectorClose(f.B, cross(velocity, expected), 1e-11, 'uniform B = beta cross E');
      vectorClose(f.Erad, [0, 0, 0], 0, 'uniform zero radiation');
    }
results.analyticControls = {
  stationaryError,
  uniformRelativeError: uniformError
};
// Independent finite-difference check of E=-grad phi-dA/dt and B=curl A.
// Retardation here is pure 80-step bisection, independent of the production solver.
function potentials(p, t, beta) {
  let lo = t - norm(p) - beta - 1,
    hi = t;
  for (let i = 0; i < 80; i++) {
    const tr = (lo + hi) / 2,
      R = Math.hypot(p[0], p[1], p[2] - beta * Math.sin(tr));
    if (tr + R > t) hi = tr;
    else lo = tr;
  }
  const tr = (lo + hi) / 2,
    z = beta * Math.sin(tr),
    v = beta * Math.cos(tr),
    R = Math.hypot(p[0], p[1], p[2] - z),
    phi = -1 / (R - (p[2] - z) * v);
  return [phi, 0, 0, phi * v];
}
let potentialError = 0;
for (const beta of [.15, .8])
  for (const t of [0, .7, 2.4])
    for (const p of [
        [1, .3, 2],
        [-2, 1, -1],
        [7, -4, 3]
      ]) {
      const h = 1e-4,
        spatial = [0, 1, 2].map(i => {
          const plus = [...p],
            minus = [...p];
          plus[i] += h;
          minus[i] -= h;
          return scale(sub(potentials(plus, t, beta), potentials(minus, t, beta)), 1 / (2 * h));
        });
      const temporal = scale(sub(potentials(p, t + h, beta), potentials(p, t - h, beta)), 1 / (2 * h));
      const E = spatial.map((d, i) => -d[0] - temporal[i + 1]),
        B = [spatial[1][3] - spatial[2][2], spatial[2][1] - spatial[0][3], spatial[0][2] - spatial[1][1]],
        f = field(p, t, sinusoid(beta));
      const err = Math.max(norm(sub(E, f.E)) / norm(f.E), norm(sub(B, f.B)) / norm(f.B));
      potentialError = Math.max(potentialError, err);
      assert.ok(err < 2e-6);
    }
results.potentialDerivativeRelativeError = potentialError;
let angularError = 0,
  radialError = 0;
const m = sinusoid(.01),
  tr = Math.PI / 2;
for (let i = 0; i <= 100; i++) {
  const theta = i * Math.PI / 100,
    expected = .01 ** 2 * Math.sin(theta) ** 2 / (4 * Math.PI),
    actual = angularPower(theta, tr, m);
  angularError = Math.max(angularError, Math.abs(actual - expected) / (.01 ** 2 / (4 * Math.PI)));
  close(actual, expected, 1e-12, 'sin squared at zero velocity');
}
for (const tr of [.4, Math.PI / 2, 2.8])
  for (const theta of [.3, 1, 2.2]) {
    const m = sinusoid(.8),
      s = m.at(tr),
      n = [Math.sin(theta), 0, Math.cos(theta)];
    const a = field(add(s.position, scale(n, 20)), tr + 20, m),
      b = field(add(s.position, scale(n, 200)), tr + 200, m);
    const err = Math.abs(norm(a.Erad) / norm(b.Erad) - 10) / 10;
    radialError = Math.max(radialError, err);
    assert.ok(err < 1e-9);
    vectorClose(a.E, scale(field(add(s.position, scale(n, 20)), tr + 20, m, 1).E, -1), 1e-12,
      'charge reversal');
  }
// Fixed observer sphere, common observation times: cycle-averaged far-field pattern.
let farCyclePatternError = 0;
for (let j = 0; j <= 24; j++) {
  const theta = j * Math.PI / 24,
    n = [Math.sin(theta), 0, Math.cos(theta)],
    R = 1000;
  let measured = 0;
  for (let i = 0; i < 128; i++) {
    const f = field(scale(n, R), R + i * 2 * Math.PI / 128, sinusoid(.01));
    measured += R * R * dot(cross(f.Erad, f.Brad), n) / (4 * Math.PI * 128);
  }
  const peak = .01 ** 2 / (8 * Math.PI),
    expected = peak * Math.sin(theta) ** 2;
  const error = Math.abs(measured - expected) / peak;
  farCyclePatternError = Math.max(farCyclePatternError, error);
  assert.ok(error < .001);
}
results.farObserverCycleSinSquaredNormalizedError = farCyclePatternError;

function cyclePower(beta, nMu = 240, nPhase = 96) {
  let sum = 0;
  const m = sinusoid(beta);
  for (let j = 0; j < nPhase; j++)
    for (let i = 0; i < nMu; i++) sum += angularPower(Math.acos(-1 + (i + .5) * 2 / nMu), j * 2 * Math.PI /
      nPhase, m) * 4 * Math.PI / (nMu * nPhase);
  return sum;
}
const larmor = [.1, .03, .01].map(beta => {
  const measured = cyclePower(beta),
    prediction = beta ** 2 / 3;
  return {
    beta,
    measured,
    prediction,
    relativeError: Math.abs(measured / prediction - 1)
  };
});
assert.ok(larmor[0].relativeError < .01);
assert.ok(larmor[1].relativeError < .001);
assert.ok(larmor[2].relativeError < .0002);
assert.ok(larmor[2].relativeError < larmor[1].relativeError && larmor[1].relativeError < larmor[0]
  .relativeError);
const refined = cyclePower(.01, 480, 192);
assert.ok(Math.abs(refined / larmor[2].measured - 1) < 1e-5);
// Relativistic instantaneous Lienard power for collinear acceleration.
let relativisticPowerError = 0;
for (const tr of [.3, .8, 1.5, 2.7]) {
  const beta = .8,
    m = sinusoid(beta),
    v = beta * Math.cos(tr),
    a = -beta * Math.sin(tr);
  let P = 0;
  const n = 2000;
  for (let i = 0; i < n; i++) P += angularPower(Math.acos(-1 + (i + .5) * 2 / n), tr, m) * 4 * Math.PI / n;
  const prediction = (2 / 3) * a * a / (1 - v * v) ** 3;
  const error = Math.abs(P / prediction - 1);
  relativisticPowerError = Math.max(relativisticPowerError, error);
  assert.ok(error < 1e-4);
}
results.radiation = {
  sinSquaredAbsoluteNormalizedError: angularError,
  inverseRadiusRelativeError: radialError,
  larmor,
  refinedLowBetaPower: refined,
  relativisticPowerError
};
// Non-collinear trajectory and field controls. Finite-difference potentials below
// use their own ellipse formulas and pure bisection, not hairpin()/retarded().
let derivativeError = 0, turnPotentialError = 0, turnResidual = 0, turnCount = 0;
for (const beta of [0, .01, .15, .72, .8]) {
  const m = hairpin(beta), h = 1e-4;
  for (let i = -100; i <= 100; i++) {
    const t = i * .47, a = m.at(t), left = m.at(t-h), right = m.at(t+h);
    const error = Math.max(norm(sub(scale(sub(right.position,left.position),1/(2*h)),a.velocity)),
      norm(sub(scale(sub(right.velocity,left.velocity),1/(2*h)),a.acceleration)));
    derivativeError = Math.max(derivativeError,error);
    assert.ok(error < 2e-9);
    assert.ok(norm(a.velocity) <= m.maxBeta + 1e-14);
    assert.ok(Math.abs(a.position[0]) <= 1.4 && a.position[2] >= -6 && a.position[2] <= 0);
    for (const radius of [.180001,.5,2,8,10000]) {
      const n = scale([Math.sin(i), Math.cos(i), .4],1/Math.sqrt(1.16));
      const p = add(a.position,scale(n,radius)), f = field(p,t,m);
      assert.ok(!f.masked && f.E.every(Number.isFinite) && f.B.every(Number.isFinite));
      const residual = Math.abs(f.residual)/Math.max(1,radius);
      turnResidual = Math.max(turnResidual,residual); turnCount++;
      assert.ok(residual < 2.1e-12);
      vectorClose(f.B,add(f.Bnear,f.Brad),1e-11,'turn B decomposition');
      vectorClose(f.B,scale(field(p,t,m,1).B,-1),1e-11,'turn electron sign');
    }
  }
}
for (const beta of [-1,.81,NaN,Infinity]) assert.throws(()=>hairpin(beta),RangeError);
function turnPotentials(p,t,beta) {
  const w = beta/3;
  let lo = t - Math.hypot(...p) - 8, hi = t;
  for (let i=0;i<90;i++) {
    const tr=(lo+hi)/2;
    const R=Math.hypot(p[0]-1.4*Math.sin(w*tr),p[1],p[2]-3*(Math.cos(w*tr)-1));
    if(tr+R>t) hi=tr; else lo=tr;
  }
  const tr=(lo+hi)/2, d=[p[0]-1.4*Math.sin(w*tr),p[1],p[2]-3*(Math.cos(w*tr)-1)];
  const v=[1.4*w*Math.cos(w*tr),0,-3*w*Math.sin(w*tr)];
  const phi=-1/(Math.hypot(...d)-d.reduce((s,x,i)=>s+x*v[i],0));
  return [phi,...v.map(x=>phi*x)];
}
for(const beta of [.15,.72,.8]) for(const t of [-4,0,2,5.5,10])
  for(const p of [[1,.4,2],[-2,1,-1],[7,-4,3],[-.4,.6,-3]]) {
    const h=1e-4;
    const spatial=[0,1,2].map(i=>{
      const plus=[...p],minus=[...p];plus[i]+=h;minus[i]-=h;
      return scale(sub(turnPotentials(plus,t,beta),turnPotentials(minus,t,beta)),1/(2*h));
    });
    const temporal=scale(sub(turnPotentials(p,t+h,beta),turnPotentials(p,t-h,beta)),1/(2*h));
    const E=spatial.map((d,i)=>-d[0]-temporal[i+1]);
    const B=[spatial[1][3]-spatial[2][2],spatial[2][1]-spatial[0][3],spatial[0][2]-spatial[1][1]];
    const f=field(p,t,hairpin(beta));
    const err=Math.max(norm(sub(E,f.E))/norm(f.E),norm(sub(B,f.B))/norm(f.B));
    turnPotentialError=Math.max(turnPotentialError,err);assert.ok(err<2e-6,`turn potentials ${err}`);
  }
let turnPowerError=0, azimuthDifference=0;
for (const t of [-4,0,2,5.5]) {
  const m=hairpin(.8), s=m.at(t), nMu=800,nPhi=160;
  let P=0;
  for(let i=0;i<nMu;i++) for(let j=0;j<nPhi;j++) {
    const mu=-1+(i+.5)*2/nMu, phi=(j+.5)*2*Math.PI/nPhi;
    const n=[Math.sqrt(1-mu*mu)*Math.cos(phi),Math.sqrt(1-mu*mu)*Math.sin(phi),mu];
    P+=directionalPower(n,t,m)*4*Math.PI/(nMu*nPhi);
  }
  const exact=(2/3)*(dot(s.acceleration,s.acceleration)-norm(cross(s.velocity,s.acceleration))**2)/(1-dot(s.velocity,s.velocity))**3;
  const err=Math.abs(P/exact-1);turnPowerError=Math.max(turnPowerError,err);assert.ok(err<2e-4,`sphere power ${err}`);
  for(const n of [[1,0,0],[0,1,0],[0,0,1]]) {
    const f=field(add(s.position,scale(n,100)),t+100,m);
    close(directionalPower(n,t,m),10000*dot(f.Erad,f.Erad)*f.k/(4*Math.PI),1e-10,'power vs field');
  }
  azimuthDifference=Math.max(azimuthDifference,Math.abs(directionalPower([1,0,0],t,m)-directionalPower([0,1,0],t,m)));
}
assert.ok(azimuthDifference>1e-4,'turning cannot use an axial meridian integral');
assert.equal(directionalPower([1,0,0],0,hairpin(0)),0);
assert.equal(hairpin(.72).axisymmetric,false);assert.equal(sinusoid(.15).axisymmetric,true);
// Spatial convergence: matched short arclength at .16, .08, .04. Include all
// components; no closed-loop/topology assertion for the sparse visual seeding.
let streamlineError=0, streamlineRefinedError=0;
for(const component of ['total','near','rad']) for(const t of [-4,0,5.5]) for(const seed of [[-3,0,2],[3,0,2],[-3,0,-2]]) {
  const runs=[.16,.08,.04].map(h=>trace(seed,t,hairpin(.72),component,h,Math.round(1.28/h)));
  if(runs.some((r,i)=>r.length!==2*Math.round(1.28/[.16,.08,.04][i])+1)) continue;
  const coarse=norm(sub(runs[0].at(-1).p,runs[2].at(-1).p));
  const fine=norm(sub(runs[1].at(-1).p,runs[2].at(-1).p));
  streamlineError=Math.max(streamlineError,coarse);streamlineRefinedError=Math.max(streamlineRefinedError,fine);
  assert.ok(coarse<.02 && fine<coarse*.5,`streamline refinement ${coarse} ${fine}`);
}
assert.ok(streamlineError>0,'nonempty streamline convergence sample');
results.turning={samples:turnCount,derivativeAbsoluteError:derivativeError,normalizedRetardedResidual:turnResidual,
  potentialDerivativeRelativeError:turnPotentialError,fullSpherePowerRelativeError:turnPowerError,
  nonAxisymmetricPowerDifference:azimuthDifference,streamlineCoarseVsFine:streamlineError,streamlineHalfStepVsFine:streamlineRefinedError};

console.log(JSON.stringify({
  status: 'pass',
  ...results
}, null, 2));
