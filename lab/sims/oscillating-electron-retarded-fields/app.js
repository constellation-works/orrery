import {
  sinusoid,
  field,
  angularPower,
  EXCLUSION,
  norm,
  cross,
  scale
} from './physics.mjs';
import {
  createLoop
} from '../../lib/web/loop.js';

const $ = id => document.getElementById(id),
  TAU = 2 * Math.PI,
  T = window.THREE;
const state = {
  time: 0,
  beta: .15,
  component: 'total',
  density: 'standard',
  gain: 1,
  playing: true
};
const host = $('scene'),
  scene = new T.Scene(),
  camera = new T.PerspectiveCamera(40, 1, .05, 150);
camera.up.set(0, 0, 1);
let renderer;
try {
  renderer = new T.WebGLRenderer({
    antialias: true,
    alpha: true
  });
} catch (error) {
  $('fatal').hidden = false;
  $('fatal').textContent = 'This 3-D experiment needs WebGL. ' + error.message;
  throw error;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
host.append(renderer.domElement);
let azimuth = .72,
  elevation = .34,
  distance = 26;

function updateCamera() {
  const d = distance * Math.max(1, 1.4 / camera.aspect);
  camera.position.set(d * Math.cos(elevation) * Math.cos(azimuth), d * Math.cos(elevation) * Math.sin(
    azimuth), d * Math.sin(elevation));
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
}

function resize() {
  const {
    width,
    height
  } = host.getBoundingClientRect();
  renderer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  updateCamera();
  render();
}

function line(points, color, opacity = 1, dashed = false) {
  const geometry = new T.BufferGeometry().setFromPoints(points.map(p => new T.Vector3(...p)));
  const material = dashed ? new T.LineDashedMaterial({
    color,
    transparent: true,
    opacity,
    dashSize: .13,
    gapSize: .1
  }) : new T.LineBasicMaterial({
    color,
    transparent: true,
    opacity
  });
  const object = new T.Line(geometry, material);
  if (dashed) object.computeLineDistances();
  scene.add(object);
  return object;
}
line([
  [0, 0, -7],
  [0, 0, 7]
], 0x8498a6, .3, true);
line([
  [-8, 0, 0],
  [8, 0, 0]
], 0x41586a, .2);
line([
  [0, -8, 0],
  [0, 8, 0]
], 0x41586a, .2);
// Subtle fixed equatorial ruler, not a propagating shell.
for (let r = 2; r <= 8; r += 2) line(Array.from({
  length: 97
}, (_, i) => [r * Math.cos(i * TAU / 96), r * Math.sin(i * TAU / 96), 0]), 0x44586a, .13);

function sphere(radius, color, wireframe = false) {
  const m = new T.Mesh(new T.SphereGeometry(radius, 20, 12), new T.MeshBasicMaterial({
    color,
    wireframe,
    transparent: true,
    opacity: wireframe ? .28 : 1
  }));
  scene.add(m);
  return m;
}
const electron = sphere(.075, 0xf1f7f6),
  exclusion = sphere(EXCLUSION, 0x91a0ad, true),
  past = sphere(.065, 0xe9c28a),
  probe = sphere(.065, 0xffffff);
const path = line([
  [0, 0, -.15],
  [0, 0, .15]
], 0xe9c28a, .8);
const lightPath = line([
  [0, 0, 0],
  [1, 0, 0]
], 0xe9c28a, .65, true);
let rings = [],
  electric = [],
  flow = [];
const Ecolor = 0xe9c28a,
  Scolor = 0xa9d6ac,
  positive = new T.Color(0x63d9e7),
  negative = new T.Color(0xf68f82);

function arrow(position, color) {
  const a = new T.ArrowHelper(new T.Vector3(0, 1, 0), new T.Vector3(...position), .3, color, .1, .06);
  scene.add(a);
  return a;
}

function dispose(object) {
  scene.remove(object);
  object.traverse(o => {
    o.geometry?.dispose();
    if (o.material)
      for (const m of [o.material].flat()) m.dispose();
  });
}

function buildSamples() {
  for (const r of rings) {
    dispose(r.line);
    r.arrows.forEach(dispose);
  }
  electric.forEach(a => dispose(a.arrow));
  flow.forEach(a => dispose(a.arrow));
  rings = [];
  electric = [];
  flow = [];
  const [nz, nr] = ({
    sparse: [7, 5],
    standard: [9, 7],
    dense: [11, 9]
  })[state.density];
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nr; i++) {
      const z = -5 + 10 * j / (nz - 1),
        rho = .65 + 6.35 * i / (nr - 1);
      const points = Array.from({
        length: 97
      }, (_, k) => [rho * Math.cos(k * TAU / 96), rho * Math.sin(k * TAU / 96), z]);
      const guide = line(points, 0x63d9e7, .4);
      const arrows = Array.from({
        length: 4
      }, (_, k) => arrow([rho * Math.cos(k * TAU / 4), rho * Math.sin(k * TAU / 4), z], 0x63d9e7));
      rings.push({
        rho,
        z,
        line: guide,
        arrows
      });
    }
  // Sparse meridian: actual samples at fixed points, separate from magnetic density.
  for (let z = -5; z <= 5; z += 1.25)
    for (const x of [-6, -4, -2, 2, 4, 6]) {
      const p = [x, 0, z];
      electric.push({
        p,
        arrow: arrow(p, Ecolor)
      });
      flow.push({
        p,
        arrow: arrow(p, Scolor)
      });
    }
}
const compress = (m, factor) => Math.min(1, Math.log1p(factor * state.gain * m) / Math.log(13));

function selected(f) {
  return state.component === 'near' ? [f.Enear, f.Bnear] : state.component === 'rad' ? [f.Erad, f.Brad] : [f
    .E, f.B
  ];
}

function drawArrow(a, v, factor) {
  const m = norm(v);
  a.visible = m > 1e-14;
  if (!a.visible) return;
  const b = compress(m, factor);
  a.setDirection(new T.Vector3(...scale(v, 1 / m)));
  a.setLength(.12 + .65 * b, .07 + .15 * b, .055 + .07 * b);
  a.line.material.transparent = true;
  a.cone.material.transparent = true;
  a.line.material.opacity = a.cone.material.opacity = .2 + .8 * b;
}
let lastPlot = -Infinity,
  lastReadout = -Infinity;

function updateFields() {
  const motion = sinusoid(state.beta),
    t = state.time;
  electron.position.fromArray(motion.at(t).position);
  exclusion.position.copy(electron.position);
  path.geometry.setFromPoints([new T.Vector3(0, 0, -state.beta), new T.Vector3(0, 0, state.beta)]);
  for (const r of rings) {
    // Axial symmetry is exact: one evaluation determines Bφ around this ring.
    const f = field([r.rho, 0, r.z], t, motion),
      B = f.masked ? [0, 0, 0] : selected(f)[1],
      signed = B[1];
    const color = signed >= 0 ? positive : negative,
      b = compress(Math.abs(signed), 120);
    r.line.visible = $('magnetic').checked && Math.abs(signed) > 1e-14;
    r.line.material.color.copy(color);
    r.line.material.opacity = .08 + .82 * b;
    r.arrows.forEach((a, k) => {
      a.visible = r.line.visible;
      if (!a.visible) return;
      const phi = k * TAU / 4;
      drawArrow(a, [-signed * Math.sin(phi), signed * Math.cos(phi), 0], 120);
      a.setColor(color);
    });
  }
  for (let i = 0; i < electric.length; i++) {
    const e = electric[i],
      s = flow[i];
    e.arrow.visible = $('electric').checked;
    s.arrow.visible = $('poynting').checked;
    if (!e.arrow.visible && !s.arrow.visible) continue;
    const f = field(e.p, t, motion);
    if (f.masked) {
      e.arrow.visible = s.arrow.visible = false;
      continue;
    }
    const [E, B] = selected(f);
    if (e.arrow.visible) drawArrow(e.arrow, E, 15);
    if (s.arrow.visible) drawArrow(s.arrow, scale(cross(E, B), 1 / (4 * Math.PI)), 600);
  }
  const radius = +$('probe-radius').value,
    theta = +$('probe-angle').value * Math.PI / 180;
  const p = [radius * Math.sin(theta), 0, radius * Math.cos(theta)],
    f = field(p, t, motion);
  probe.position.fromArray(p);
  past.position.fromArray(f.source.position);
  lightPath.geometry.setFromPoints([past.position, probe.position]);
  lightPath.computeLineDistances();
  if (performance.now() - lastReadout > 100 || !state.playing) {
    lastReadout = performance.now();
    const num = v => v.toExponential(3);
    const entries = [
      ['t / tᵣ', `${t.toFixed(3)} / ${f.tr.toFixed(3)}`],
      ['Delay / R', f.R.toFixed(4)],
      ['z now / retarded', `${electron.position.z.toFixed(3)} / ${past.position.z.toFixed(3)}`],
      ['βz retarded', f.source.velocity[2].toFixed(4)],
      ['Solve residual', num(f.residual)]
    ];
    if (f.masked) entries.push(['Field', 'EXCLUDED']);
    else entries.push(['|E| / |B|', `${num(norm(f.E))} / ${num(norm(f.B))}`], ['|E near| / |E rad|',
      `${num(norm(f.Enear))} / ${num(norm(f.Erad))}`
    ], ['Bφ near / rad', `${num(f.Bnear[1])} / ${num(f.Brad[1])}`], ['|S total|', num(norm(f.S))]);
    $('probe-readout').replaceChildren(...entries.flatMap(([key, value]) => {
      const dt = document.createElement('dt'),
        dd = document.createElement('dd');
      dt.textContent = key;
      dd.textContent = value;
      return [dt, dd];
    }));
  }
  if ($('power').checked && (performance.now() - lastPlot > 100 || !state.playing)) {
    drawPower(motion);
    lastPlot = performance.now();
  }
  $('phase').value = ((t % TAU) + TAU) % TAU;
  $('phase-value').textContent = `${(t/TAU%1).toFixed(2)} τ`;
}

function drawPower(motion) {
  const canvas = $('power-chart'),
    ctx = canvas.getContext('2d'),
    w = canvas.width,
    h = canvas.height,
    cx = w / 2,
    cy = h / 2,
    rad = 115;
  ctx.clearRect(0, 0, w, h);
  const n = 180,
    values = Array.from({
      length: n + 1
    }, (_, i) => angularPower(i * TAU / n, state.time, motion)),
    max = Math.max(...values);
  ctx.strokeStyle = '#344654';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx, 15);
  ctx.lineTo(cx, h - 15);
  ctx.moveTo(40, cy);
  ctx.lineTo(w - 40, cy);
  ctx.stroke();

  function curve(reference) {
    ctx.beginPath();
    values.forEach((v, i) => {
      const angle = i * TAU / n,
        r = rad * (reference ? Math.sin(angle) ** 2 : (max > 1e-24 ? v / max : 0));
      const x = cx + r * Math.sin(angle),
        y = cy - r * Math.cos(angle);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.closePath();
    ctx.stroke();
  }
  ctx.setLineDash([4, 5]);
  ctx.strokeStyle = '#72818d';
  curve(true);
  ctx.setLineDash([]);
  ctx.strokeStyle = '#e9c28a';
  ctx.lineWidth = 2;
  curve(false);
  ctx.fillStyle = '#95a7b8';
  ctx.font = '12px monospace';
  ctx.fillText('+z', cx + 8, 18);
  ctx.fillText('θ = 90°', w - 120, cy - 10);
  ctx.fillText('−z', cx + 8, h - 10);
  // Midpoint integration in mu = cos(theta), independent of display normalization.
  let total = 0;
  for (let i = 0; i < 160; i++) total += angularPower(Math.acos(-1 + (i + .5) * 2 / 160), state.time,
    motion) * 4 * Math.PI / 160;
  $('power-value').textContent =
    `Peak ${max.toExponential(3)} / sr · P(t) ${total.toExponential(3)} · emission phase ${(state.time%TAU).toFixed(3)}`;
}
const frames = [],
  work = [];
let previousFrame = 0;

function render() {
  const start = performance.now();
  updateFields();
  renderer.render(scene, camera);
  const p = new T.Vector3(0, 0, 7).project(camera),
    box = host.getBoundingClientRect();
  $('axis-label').style.left = `${(p.x+1)*box.width/2+8}px`;
  $('axis-label').style.top = `${host.offsetTop+(1-p.y)*box.height/2}px`;
  work.push(performance.now() - start);
  if (work.length > 600) work.shift();
}
const loop = createLoop({
  step: dt => {
    state.time += dt;
  },
  render: () => {
    const now = performance.now();
    if (previousFrame) frames.push(now - previousFrame);
    previousFrame = now;
    if (frames.length > 600) frames.shift();
    render();
  },
  speed: .65
});

function pause() {
  state.playing = false;
  loop.pause();
  $('play').textContent = '▶ Play';
  $('play').setAttribute('aria-label', 'Play simulation');
  render();
}

function play() {
  state.playing = true;
  previousFrame = 0;
  loop.start();
  $('play').textContent = 'Ⅱ Pause';
  $('play').setAttribute('aria-label', 'Pause simulation');
}
$('play').onclick = () => state.playing ? pause() : play();
$('reset').onclick = () => {
  pause();
  loop.reset();
  state.time = 0;
  render();
};
$('phase').oninput = () => {
  const time = +$('phase').value;
  pause();
  state.time = time;
  loop.reset();
  render();
};
$('beta').oninput = () => {
  state.beta = +$('beta').value;
  $('beta-value').textContent = state.beta.toFixed(2) + ' c';
  render();
};
$('gain').oninput = () => {
  state.gain = +$('gain').value;
  $('gain-value').textContent = state.gain.toFixed(1) + '×';
  render();
};
$('component').onchange = () => {
  state.component = $('component').value;
  $('component-label').textContent = ({
    total: 'TOTAL FIELD',
    near: 'VELOCITY FIELD',
    rad: 'RADIATION FIELD'
  })[state.component];
  render();
};
$('density').onchange = () => {
  state.density = $('density').value;
  buildSamples();
  render();
};
for (const id of ['magnetic', 'electric', 'poynting', 'power']) $(id).onchange = () => {
  $('power-panel').hidden = !$('power').checked;
  render();
};
for (const id of ['probe-radius', 'probe-angle']) $(id).oninput = () => {
  $('radius-value').textContent = (+$('probe-radius').value).toFixed(1);
  $('angle-value').textContent = $('probe-angle').value + '°';
  render();
};
$('preset').onchange = () => {
  const v = $('preset').value;
  state.beta = v === 'stationary' ? 0 : .15;
  $('beta').value = state.beta;
  $('beta').oninput();
  $('component').value = v === 'radiation' || v === 'power' ? 'rad' : v === 'near' ? 'near' : 'total';
  $('component').onchange();
  $('electric').checked = v === 'near' || v === 'stationary';
  $('magnetic').checked = true;
  $('poynting').checked = v === 'radiation';
  $('power').checked = v === 'power';
  $('power-panel').hidden = v !== 'power';
  distance = v === 'near' ? 10 : 26;
  azimuth = v === 'power' ? Math.PI / 2 : .72;
  elevation = v === 'power' ? .02 : .34;
  updateCamera();
  render();
};
const pointers = new Map();
let pinchDistance = 0;
host.onpointerdown = e => {
  host.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, [e.clientX, e.clientY]);
  pinchDistance = 0;
};
host.onpointermove = e => {
  if (!pointers.has(e.pointerId)) return;
  const previous = pointers.get(e.pointerId);
  pointers.set(e.pointerId, [e.clientX, e.clientY]);
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    if (pinchDistance) distance = Math.max(4, Math.min(55, distance * pinchDistance / d));
    pinchDistance = d;
  } else {
    azimuth -= (e.clientX - previous[0]) * .007;
    elevation = Math.max(-1.45, Math.min(1.45, elevation + (e.clientY - previous[1]) * .007));
  }
  updateCamera();
  if (!state.playing) render();
};
for (const name of ['onpointerup', 'onpointercancel', 'onlostpointercapture']) host[name] = e => {
  pointers.delete(e.pointerId);
  pinchDistance = 0;
};
host.onwheel = e => {
  e.preventDefault();
  distance = Math.max(4, Math.min(55, distance * Math.exp(e.deltaY * .001)));
  updateCamera();
  if (!state.playing) render();
};
host.onkeydown = e => {
  const actions = {
    ArrowLeft: () => azimuth -= .12,
    ArrowRight: () => azimuth += .12,
    ArrowUp: () => elevation = Math.min(1.45, elevation + .1),
    ArrowDown: () => elevation = Math.max(-1.45, elevation - .1),
    '+': () => distance = Math.max(4, distance * .9),
    '=': () => distance = Math.max(4, distance * .9),
    '-': () => distance = Math.min(55, distance / .9)
  };
  if (actions[e.key]) {
    e.preventDefault();
    actions[e.key]();
    updateCamera();
    render();
  }
};
// Read-only diagnostics for reproducible browser validation; no alternate physics path.
window.orrery = {
  snapshot: () => ({
    ...state,
    camera: [azimuth, elevation, distance],
    rings: rings.length,
    probe: field([+$('probe-radius').value * Math.sin(+$('probe-angle').value * Math.PI / 180), 0, +$(
        'probe-radius').value * Math.cos(+$('probe-angle').value * Math.PI / 180)], state.time,
      sinusoid(state.beta))
  }),
  metrics: () => ({
    frameIntervalsMs: [...frames],
    cpuRenderMs: [...work],
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    pixelRatio: renderer.getPixelRatio()
  }),
  clearMetrics: () => {
    frames.length = 0;
    work.length = 0;
    previousFrame = 0;
  }
};
buildSamples();
new ResizeObserver(resize).observe(host);
resize();
play();
