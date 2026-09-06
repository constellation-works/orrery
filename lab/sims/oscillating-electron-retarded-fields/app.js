import {
  racetrack,
  hairpin,
  sinusoid,
  field,
  norm,
  cross,
  EXCLUSION
} from './physics.mjs';
import {
  samplePoints,
  sample,
  brightness
} from './sampling.mjs';
import {
  createCanvas2D
} from '../../lib/web/canvas2d.js';
import {
  createLoop
} from '../../lib/web/loop.js';
const $ = id => document.getElementById(id);
const state = {
  time: -4,
  beta: .45,
  motion: 'turn',
  component: 'total',
  vector: 'B',
  density: 'standard',
  gain: 1,
  playing: true
};
const host = $('scene'),
  {
    ctx,
    size,
    onResize
  } = createCanvas2D({
    mount: host
  });
const motionNow = () => ({
  turn: racetrack,
  ellipse: hairpin,
  linear: sinusoid
})[state.motion](state.beta);
let viewport = {
  w: innerWidth,
  h: innerHeight
};
let azimuth = 0,
  zoom = 1,
  points = samplePoints(),
  cached = [],
  fieldKey = '',
  frameIntervals = [],
  renderCosts = [],
  previousFrame = 0;
let clockStart = 0,
  clockTime = -4;
const witnesses = [
  [2, 0, 0],
  [5, 0, 0]
];

function worldScale() {
  const {
    w,
    h
  } = viewport;
  return Math.min(w * .36, h * .55) * .83 / 6 * zoom * (w < 650 ? 1.45 : 1);
}

function project(p) {
  const {
    w,
    h
  } = viewport, s = worldScale();
  const x = p[0] * Math.cos(azimuth) - p[1] * Math.sin(azimuth),
    y = p[0] * Math.sin(azimuth) + p[1] * Math.cos(azimuth);
  return [w / 2 + s * x, h * (w < 650 ? .38 : .28) + s * (.24 * y - .85 * p[2])];
}

function segment(a, b) {
  const p = project(a),
    q = project(b);
  ctx.moveTo(...p);
  ctx.lineTo(...q);
}

function textAt(text, p, color = '#adc7b7', dx = 10, dy = -8) {
  const q = project(p);
  ctx.fillStyle = color;
  ctx.font = '11px ui-monospace,monospace';
  ctx.fillText(text, q[0] + dx, q[1] + dy);
}

function drawPath(motion) {
  ctx.strokeStyle = '#57836a66';
  ctx.lineWidth = 1;
  ctx.beginPath();
  segment([0, 0, -7], [0, 0, .4]);
  for (let z = -7; z <= 0; z++) segment([-.075, 0, z], [.075, 0, z]);
  for (let i = 0; i < 120; i++) {
    const a = i * 2 * Math.PI / 120,
      b = (i + 1) * 2 * Math.PI / 120;
    segment([7 * Math.cos(a), 7 * Math.sin(a), -6.8], [7 * Math.cos(b), 7 * Math.sin(b), -6.8]);
  }
  ctx.stroke();
  ctx.strokeStyle = '#a3b9ac55';
  ctx.setLineDash([3, 4]);
  ctx.beginPath();
  const period = Number.isFinite(motion.period) ? motion.period : 2 * Math.PI;
  for (let i = 1; i <= 240; i++) segment(motion.at(period * (i - 1) / 240).position, motion.at(period * i /
    240).position);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawSamples() {
  const key = [state.time, state.beta, state.motion, state.component, state.vector, state.density].join('/');
  if (key !== fieldKey) {
    const m = motionNow();
    cached = points.map((p, i) => sample(p, state.time, m, state.component, state.vector, cached[i]?.tr));
    fieldKey = key;
  }
  // Quantize ONLY opacity to batch draw calls. Values/directions are unmodified.
  const paths = Array.from({
    length: 32
  }, () => new Path2D());
  let visible = 0;
  for (let index = 0; index < cached.length; index++) {
    const f = cached[index];
    if (f.masked || f.magnitude < 1e-14) continue;
    const b = brightness(f.magnitude, state.gain),
      bin = Math.min(15, Math.floor(b * 16));
    if (bin === 0) continue;
    const p = project(f.p);
    if (p[0] < -15 || p[0] > viewport.w + 15 || p[1] < -15 || p[1] > viewport.h + 15) continue;
    const q = project(f.p.map((v, i) => v + .18 * f.direction[i]));
    const dx = q[0] - p[0],
      dy = q[1] - p[1],
      length = Math.hypot(dx, dy);
    const path = paths[(f.sign >= 0 ? 0 : 16) + bin];
    path.moveTo(p[0] - dx / 2, p[1] - dy / 2);
    path.lineTo(p[0] + dx / 2, p[1] + dy / 2);
    // Arrow tip follows projected physical vector; no animated dash motion.
    if (length > 2.5 && index % 7 === 0) {
      const x = p[0] + dx / 2,
        y = p[1] + dy / 2;
      path.moveTo(x - .35 * dx - .22 * dy, y - .35 * dy + .22 * dx);
      path.lineTo(x, y);
      path.lineTo(x - .35 * dx + .22 * dy, y - .35 * dy - .22 * dx);
    }
    visible++;
  }
  ctx.lineWidth = 1.3;
  for (let i = 0; i < 32; i++) {
    ctx.strokeStyle = i < 16 ? '#6ec8ff' : '#ffd36e';
    ctx.globalAlpha = (i % 16 + .5) / 16;
    ctx.stroke(paths[i]);
  }
  ctx.globalAlpha = 1;
  return visible;
}

function drawGuide() {
  if (!$('guide').checked || state.time <= 0 || state.motion === 'linear' || state.beta === 0) return;
  ctx.strokeStyle = '#dbe4d277';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 6]);
  ctx.beginPath();
  for (let plane = 0; plane < 3; plane++)
    for (let i = 0; i < 120; i++) {
      const p = a => {
        const v = [state.time * Math.cos(a), state.time * Math.sin(a), 0];
        return plane === 0 ? v : plane === 1 ? [v[0], 0, v[1]] : [0, v[0], v[1]];
      };
      segment(p(i * 2 * Math.PI / 120), p((i + 1) * 2 * Math.PI / 120));
    }
  ctx.stroke();
  ctx.setLineDash([]);
  textAt('tᵣ = 0 light sphere · guide', [state.time, 0, 0], '#bdcaba');
}

function drawElectron(motion) {
  const s = motion.at(state.time),
    p = project(s.position),
    g = ctx.createRadialGradient(...p, 0, ...p, 36);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(.18, '#dfffffc0');
  g.addColorStop(.4, '#abdfbf35');
  g.addColorStop(1, '#abdfbf00');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(...p, 36, 0, 2 * Math.PI);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(...p, 9, 0, 2 * Math.PI);
  ctx.fill();
  const v = norm(s.velocity);
  if (v > 0) {
    const tip = project(s.position.map((x, i) => x + .8 * s.velocity[i] / v));
    const dx = tip[0] - p[0],
      dy = tip[1] - p[1];
    ctx.strokeStyle = '#f2fff4';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(...p);
    ctx.lineTo(...tip);
    ctx.lineTo(tip[0] - .22 * dx - .16 * dy, tip[1] - .22 * dy + .16 * dx);
    ctx.moveTo(...tip);
    ctx.lineTo(tip[0] - .22 * dx + .16 * dy, tip[1] - .22 * dy - .16 * dx);
    ctx.stroke();
  }
  textAt('e⁻ now', s.position, '#fff', 12, 5);
  const r = EXCLUSION * worldScale();
  ctx.strokeStyle = '#dae8dd55';
  ctx.beginPath();
  ctx.ellipse(...p, r, r * Math.hypot(.24, .85), 0, 0, 2 * Math.PI);
  ctx.stroke();
}

function renderFrame() {
  const start = performance.now();
  viewport = size();
  const {
    w,
    h
  } = viewport, motion = motionNow();
  ctx.fillStyle = '#04120b';
  ctx.fillRect(0, 0, w, h);
  drawPath(motion);
  const visible = drawSamples();
  drawGuide();
  drawElectron(motion);
  const readings = witnesses.map((p, i) => {
    const f = field(p, state.time, motion),
      v = f.masked ? 0 : f[state.vector + (state.component === 'total' ? '' : state.component === 'near' ?
        'near' : 'rad')][state.vector === 'B' ? 1 : 2];
    const color = v >= 0 ? '#6ec8ff' : '#ffd36e',
      q = project(p);
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.arc(...q, 3, 0, 2 * Math.PI);
    ctx.stroke();
    textAt(i ? 'B' : 'A', p, color, 7, 16);
    return `${i?'B · farther':'A · nearer'}  tᵣ ${f.tr.toFixed(2)}  ${v<0?'−':'+'}${state.vector}${state.vector==='B'?'y':'z'}`;
  });
  $('readout').textContent =
    `β ${norm(motion.at(state.time).velocity).toFixed(2)} / c = 1\n${readings.join('\n')}`;
  $('phase').value = state.time;
  $('phase-value').textContent = state.time.toFixed(2);
  $('moment-detail').textContent = state.motion === 'linear' ? 'A prescribed sinusoid along z.' : state.time <
    -.5 ? 'The electron rises. Watch the tight turn at the top.' : state.time < .5 ?
    'The electron turns. The distant field still sees the approach.' : state.time < 3 ?
    'The changed field spreads through the older field.' :
    'The electron descends; the earlier turn is now farther away.';
  for (const [id, t] of [
      ['before', -3],
      ['during', 0],
      ['delay', 3],
      ['after', 6]
    ]) $(id).classList.toggle('active', !state.playing && Math.abs(state.time - t) < .015);
  if ($('power').checked) {
    const {
      velocity: v,
      acceleration: a
    } = motion.at(state.time);
    const power = (2 / 3) * (norm(a) ** 2 - norm(cross(v, a)) ** 2) / (1 - norm(v) ** 2) ** 3;
    $('power-value').textContent =
      `Full-sphere Liénard power ${power.toExponential(3)} at source t = ${state.time.toFixed(2)}. ${motion.axisymmetric?'Axial symmetry.':'Not axisymmetric; no meridian × 2π shortcut.'}`;
  }
  renderCosts.push(performance.now() - start);
  if (renderCosts.length > 600) renderCosts.shift();
  window.orrery.visible = visible;
}

function render() {
  try {
    renderFrame();
  } catch (error) {
    state.playing = false;
    loop.pause();
    $('fatal').hidden = false;
    $('fatal').textContent = 'Field sampling stopped: ' + error.message;
    throw error;
  }
}
const loop = createLoop({
  step: () => {},
  render: () => {
    const now = performance.now();
    state.time = Math.min(10, clockTime + (now - clockStart) * .0018);
    if (previousFrame) frameIntervals.push(now - previousFrame);
    previousFrame = now;
    if (frameIntervals.length > 600) frameIntervals.shift();
    render();
    if (state.time >= 10) pause();
  }
});

function pause() {
  state.playing = false;
  loop.pause();
  $('play').textContent = '▶ Play';
  $('play').setAttribute('aria-label', 'Play simulation');
  render();
}

function play() {
  if (state.time >= 10) state.time = -4;
  clockTime = state.time;
  clockStart = performance.now();
  previousFrame = 0;
  state.playing = true;
  $('play').textContent = 'Ⅱ Pause';
  $('play').setAttribute('aria-label', 'Pause simulation');
  loop.start();
}

function seek(t) {
  pause();
  state.time = t;
  render();
}
$('play').onclick = () => state.playing ? pause() : play();
$('reset').onclick = () => seek(-4);
$('phase').oninput = () => {
  const t = +$('phase').value;
  seek(t);
};
for (const [id, t] of [
    ['before', -3],
    ['during', 0],
    ['delay', 3],
    ['after', 6]
  ]) $(id).onclick = () => seek(t);
for (const id of ['beta', 'gain']) $(id).oninput = () => {
  state[id] = +$(id).value;
  $(id + '-value').textContent = state[id].toFixed(id === 'beta' ? 2 : 1) + (id === 'beta' ? ' c' : '×');
  render();
};
for (const id of ['component', 'density', 'vector', 'motion']) $(id).onchange = () => {
  state[id] = $(id).value;
  if (id === 'density') points = samplePoints(state.density);
  if (id === 'motion') {
    state.beta = state.motion === 'linear' ? .15 : .45;
    $('beta').value = state.beta;
    $('beta-value').textContent = state.beta.toFixed(2) + ' c';
  }
  $('field-label').textContent = ({
    total: 'TOTAL',
    near: 'VELOCITY',
    rad: 'ACCELERATION'
  })[state.component] + ' ' + state.vector;
  $('color-key').innerHTML = state.vector === 'B' ? '<i class="cyan"></i> +Bφ <i class="gold"></i> −Bφ' :
    '<i class="cyan"></i> +Ez <i class="gold"></i> −Ez';
  render();
};
for (const id of ['guide', 'power']) $(id).onchange = () => {
  $('power-value').hidden = !$('power').checked;
  render();
};
$('home-camera').onclick = () => {
  azimuth = 0;
  zoom = 1;
  render();
};
const pointers = new Map();
let pinch = 0,
  dragged = false;
host.onpointerdown = e => {
  host.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, [e.clientX, e.clientY]);
  pinch = 0;
  dragged = false;
};
host.onpointermove = e => {
  if (!pointers.has(e.pointerId)) return;
  const last = pointers.get(e.pointerId);
  pointers.set(e.pointerId, [e.clientX, e.clientY]);
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    if (pinch) zoom = Math.max(.4, Math.min(3, zoom * d / pinch));
    pinch = d;
  } else {
    azimuth += (e.clientX - last[0]) * .006;
  }
  if (Math.abs(e.clientX - last[0]) + Math.abs(e.clientY - last[1]) > 1) dragged = true;
  if (!state.playing) render();
};
host.onpointerup = e => {
  pointers.delete(e.pointerId);
  pinch = 0;
  if (!dragged && e.pointerType !== 'touch')(state.playing ? pause : play)();
};
for (const event of ['onpointercancel', 'onlostpointercapture']) host[event] = e => {
  pointers.delete(e.pointerId);
  pinch = 0;
};
host.onwheel = e => {
  e.preventDefault();
  zoom = Math.max(.4, Math.min(3, zoom * Math.exp(-e.deltaY * .001)));
  if (!state.playing) render();
};
host.onkeydown = e => {
  if (e.code === 'Space') {
    e.preventDefault();
    state.playing ? pause() : play();
  } else if (['ArrowLeft', 'ArrowRight', '+', '=', '-'].includes(e.key)) {
    e.preventDefault();
    if (e.key === 'ArrowLeft') azimuth -= .1;
    else if (e.key === 'ArrowRight') azimuth += .1;
    else zoom = Math.max(.4, Math.min(3, zoom * (e.key === '-' ? .9 : 1.1)));
    render();
  }
};
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.playing) pause();
});
window.orrery = {
  snapshot: () => ({
    ...state,
    camera: [azimuth, zoom],
    samples: points.length,
    visible: window.orrery.visible,
    electron: motionNow().at(state.time),
    witnesses: witnesses.map(p => field(p, state.time, motionNow())),
    probe: field([3, 1, 1], state.time, motionNow())
  }),
  sampleAt: i => cached[i],
  metrics: () => ({
    frameIntervalsMs: [...frameIntervals],
    cpuRenderMs: [...renderCosts],
    pixelRatio: devicePixelRatio
  }),
  clearMetrics: () => {
    frameIntervals = [];
    renderCosts = [];
    previousFrame = 0;
  }
};
onResize(render);
render();
play();
