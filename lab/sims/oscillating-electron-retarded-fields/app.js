import {
  sinusoid,
  hairpin,
  add,
  sub,
  field,
  angularPower,
  EXCLUSION,
  norm,
  cross,
  scale
} from './physics.mjs';
import {trace, seeds, selected as selectField} from './streamlines.mjs';
import {
  createLoop
} from '../../lib/web/loop.js';

const $ = id => document.getElementById(id),
  TAU = 2 * Math.PI,
  T = window.THREE;
const state = {
  time: -4,
  beta: .72,
  motion: 'turn',
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
let azimuth = 1.08,
  elevation = .32,
  distance = 21;
const motionNow = () => state.motion === 'turn' ? hairpin(state.beta) : sinusoid(state.beta);

function updateCamera() {
  const d = distance * Math.max(1, 1.05 / camera.aspect);
  camera.position.set(d * Math.cos(elevation) * Math.cos(azimuth), d * Math.cos(elevation) * Math.sin(
    azimuth), d * Math.sin(elevation) - 1);
  camera.lookAt(0, 0, -1);
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
// Cartesian ruler in the motion plane; no field geometry is inferred from it.
for (let x = -6; x <= 6; x += 2) line([[x, 0, -6], [x, 0, 4]], 0x44586a, .11);
for (let z = -6; z <= 4; z += 2) line([[-6, 0, z], [6, 0, z]], 0x44586a, .11);

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
const electron = sphere(.16, 0xf1f7f6),
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
// Procedural marker halo: an enlarged source glyph, never a field shell.
const glowCanvas = document.createElement('canvas'); glowCanvas.width = glowCanvas.height = 64;
const glowContext = glowCanvas.getContext('2d');
const gradient = glowContext.createRadialGradient(32, 32, 2, 32, 32, 32);
gradient.addColorStop(0, 'rgba(230,255,255,.8)'); gradient.addColorStop(.25, 'rgba(150,235,255,.25)'); gradient.addColorStop(1, 'rgba(100,200,255,0)');
glowContext.fillStyle = gradient; glowContext.fillRect(0, 0, 64, 64);
const glow = new T.Sprite(new T.SpriteMaterial({map: new T.CanvasTexture(glowCanvas), transparent: true, depthWrite: false}));
glow.scale.set(1.3, 1.3, 1); scene.add(glow);
const witnesses = [[2, 0, 1], [5, 0, 1]].map((p, i) => ({p, marker: sphere(.08, 0xffffff), id: ['local', 'distant'][i]}));
let fieldSeeds = [],
  electric = [],
  flow = [];
const Ecolor = 0xe9c28a,
  Scolor = 0xa9d6ac,
  positive = new T.Color(0x63d9e7),
  negative = new T.Color(0xf2cd78);

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

function dynamicGeometry(capacity) {
  const geometry = new T.BufferGeometry();
  for (const name of ['position', 'color']) geometry.setAttribute(name,
    new T.Float32BufferAttribute(new Float32Array(capacity * 3), 3).setUsage(T.DynamicDrawUsage));
  return geometry;
}
function updateGeometry(geometry, positions, colors) {
  for (const [name, values] of [['position', positions], ['color', colors]]) {
    const attribute = geometry.getAttribute(name);
    attribute.array.set(values);
    attribute.updateRange.count = values.length;
    attribute.needsUpdate = true;
  }
  geometry.setDrawRange(0, positions.length / 3);
  geometry.computeBoundingSphere();
}
// Reuse GPU buffers: replacing BufferAttributes each frame leaks old GL buffers.
const streamGeometry = dynamicGeometry(10000);
const streams = new T.LineSegments(streamGeometry, new T.LineBasicMaterial({vertexColors: true}));
scene.add(streams);
const directionGeometry = dynamicGeometry(1024);
const directions = new T.LineSegments(directionGeometry, new T.LineBasicMaterial({vertexColors: true}));
scene.add(directions);
const velocityArrow = arrow([0, 0, 0], 0xffffff);
let cachedTraces = [], fieldKey = '', pathKey = '', lastFieldCost = 0;

function buildSamples() {
  electric.forEach(a => dispose(a.arrow));
  flow.forEach(a => dispose(a.arrow));
  electric = []; flow = [];
  fieldSeeds = seeds(state.density);
  fieldKey = '';
  for (let z = -4; z <= 4; z += 2)
    for (const x of [-5, -3, -1, 1, 3, 5]) {
      const p = [x, 0, z];
      electric.push({p, arrow: arrow(p, Ecolor)});
      flow.push({p, arrow: arrow(p, Scolor)});
    }
}

function drawStreams(motion, t) {
  streams.visible = directions.visible = $('magnetic').checked;
  if (!streams.visible) return;
  const key = [t, state.beta, state.motion, state.component, state.density].join('/');
  if (key !== fieldKey) {
    const start = performance.now();
    cachedTraces = fieldSeeds.map(p => trace(p, t, motion, state.component));
    fieldKey = key;
    lastFieldCost = performance.now() - start;
  }
  const positions = [], colors = [], arrowPositions = [], arrowColors = [];
  for (const points of cachedTraces) {
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      positions.push(...a.p, ...b.p);
      for (const v of [a, b]) {
        const color = v.B[1] >= 0 ? positive : negative;
        const brightness = .12 + .88 * compress(v.magnitude, 120);
        colors.push(color.r * brightness, color.g * brightness, color.b * brightness);
      }
      if (i % 24 === 12) {
        // Arrowheads use the computed 3-D B tangent, not screen motion.
        const side0 = cross(b.direction, [0, 0, 1]);
        const side = norm(side0) > .01 ? scale(side0, 1 / norm(side0)) : [1, 0, 0];
        const tip = add(b.p, scale(b.direction, .12));
        const back = add(b.p, scale(b.direction, -.10));
        arrowPositions.push(...add(back, scale(side, .10)), ...tip, ...tip, ...add(back, scale(side, -.10)));
        const c = b.B[1] >= 0 ? positive : negative;
        for (let j = 0; j < 4; j++) arrowColors.push(c.r, c.g, c.b);
      }
    }
  }
  updateGeometry(streamGeometry, positions, colors);
  updateGeometry(directionGeometry, arrowPositions, arrowColors);
}
const compress = (m, factor) => Math.min(1, Math.log1p(factor * state.gain * m) / Math.log(13));

const selected = f => selectField(f, state.component);

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
  const motion = motionNow(),
    t = state.time;
  electron.position.fromArray(motion.at(t).position);
  exclusion.position.copy(electron.position);
  glow.position.copy(electron.position);
  const newPathKey = `${state.motion}/${state.beta}`;
  if (pathKey !== newPathKey) {
    const pathPoints = state.motion === 'turn'
      ? Array.from({length: 181}, (_, i) => new T.Vector3(1.4 * Math.sin(i * TAU / 180), 0, 3 * (Math.cos(i * TAU / 180) - 1)))
      : [new T.Vector3(0, 0, -state.beta), new T.Vector3(0, 0, state.beta)];
    path.geometry.dispose();
    path.geometry = new T.BufferGeometry().setFromPoints(pathPoints);
    pathKey = newPathKey;
  }
  path.material.color.setHex(0xa7b4bd); path.material.opacity = .6;
  velocityArrow.position.copy(electron.position);
  drawArrow(velocityArrow, motion.at(t).velocity, 4);
  if (norm(motion.at(t).velocity) > 0) velocityArrow.setLength(1.1, .23, .16);
  drawStreams(motion, t);
  for (const witness of witnesses) {
    const f = field(witness.p, t, motion);
    const B = f.masked ? [0, 0, 0] : selected(f)[1];
    witness.marker.position.fromArray(witness.p);
    witness.marker.material.color.copy(B[1] >= 0 ? positive : negative);
    const el = $(witness.id + '-readout');
    el.textContent = `${Math.abs(B[1]) < 1e-14 ? 'By = 0' : B[1] >= 0 ? '+By' : '−By'} · tᵣ ${f.tr.toFixed(2)}`;
    el.style.color = B[1] >= 0 ? '#63d9e7' : '#f2cd78';
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
  const lightPositions = lightPath.geometry.getAttribute('position');
  lightPositions.setXYZ(0, ...past.position.toArray());
  lightPositions.setXYZ(1, ...probe.position.toArray());
  lightPositions.needsUpdate = true;
  lightPath.geometry.computeBoundingSphere();
  const distances = lightPath.geometry.getAttribute('lineDistance');
  distances.setX(0, 0); distances.setX(1, past.position.distanceTo(probe.position));
  distances.needsUpdate = true;
  if (performance.now() - lastReadout > 100 || !state.playing) {
    lastReadout = performance.now();
    const num = v => v.toExponential(3);
    const entries = [
      ['t / tᵣ', `${t.toFixed(3)} / ${f.tr.toFixed(3)}`],
      ['Delay / R', f.R.toFixed(4)],
      ['z now / retarded', `${electron.position.z.toFixed(3)} / ${past.position.z.toFixed(3)}`],
      ['βx / βz retarded', `${f.source.velocity[0].toFixed(3)} / ${f.source.velocity[2].toFixed(3)}`],
      ['Solve residual', num(f.residual)]
    ];
    if (f.masked) entries.push(['Field', 'EXCLUDED']);
    else entries.push(['|E| / |B|', `${num(norm(f.E))} / ${num(norm(f.B))}`], ['|E near| / |E rad|',
      `${num(norm(f.Enear))} / ${num(norm(f.Erad))}`
    ], ['By near / rad', `${num(f.Bnear[1])} / ${num(f.Brad[1])}`], ['|S total|', num(norm(f.S))]);
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
  $('phase').value = t;
  $('phase-value').textContent = `${t.toFixed(2)} t`;
  $('moment-label').textContent = state.motion === 'linear' ? 'LINEAR COMPARISON' : t < -1.5 ? '01 / APPROACHING THE TURN' : t < 1.5 ? '02 / THE ELECTRON TURNS' : t < 3 ? '03 / FOLLOW THE DELAY' : '04 / THE RESPONSE SPREADS';
  $('moment-detail').textContent = state.motion === 'linear' ? 'Sinusoidal motion along z' : t < -1.5 ? 'Watch the white velocity arrow rotate.' : t < 1.5 ? 'Near and distant samples see different source times.' : 'Compare A and B: their fields sample different moments of the turn.';
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
  if (!motion.axisymmetric) {
    ctx.fillStyle = '#95a7b8'; ctx.font = '15px system-ui';
    ctx.fillText('Turning motion is not axisymmetric.', 55, 135);
    ctx.fillText('Choose Linear comparison for the meridian power plot.', 55, 163);
    const source = motion.at(state.time), v = source.velocity, a = source.acceleration;
    const total = (2 / 3) * (norm(a) ** 2 - norm(cross(v, a)) ** 2) / (1 - norm(v) ** 2) ** 3;
    $('power-value').textContent = `Full-sphere Liénard power ${total.toExponential(3)} · emission t = ${state.time.toFixed(3)}`;
    return;
  }
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
  const p = new T.Vector3(0, 0, -5.8).project(camera),
    box = host.getBoundingClientRect();
  $('axis-label').style.left = `${(p.x+1)*box.width/2+8}px`;
  $('axis-label').style.top = `${host.offsetTop+(1-p.y)*box.height/2}px`;
  for (const [id, position] of [['electron-label', electron.position], ...witnesses.map(w => [w.id + '-label', w.marker.position])]) {
    const projected = position.clone().project(camera), el = $(id);
    el.style.left = `${(projected.x + 1) * box.width / 2 + 10}px`;
    el.style.top = `${host.offsetTop + (1 - projected.y) * box.height / 2 - 14}px`;
    el.hidden = Math.abs(projected.x) > .95 || Math.abs(projected.y) > .95 || projected.z > 1;
  }
  work.push(performance.now() - start);
  if (work.length > 600) work.shift();
}
// This trajectory is analytic, so physical time comes from a playback clock,
// not a frame counter. Fixed-step shared loop schedules rendering only. A slow
// frame skips displayed instants, never changes the field at a given t.
let clockStart = 0, clockTime = state.time;
const loop = createLoop({
  step: () => {},
  render: () => {
    const now = performance.now();
    state.time = Math.min(10, clockTime + (now - clockStart) * .00125);
    if (previousFrame) frames.push(now - previousFrame);
    previousFrame = now;
    if (frames.length > 600) frames.shift();
    render();
    if (state.time >= 10) pause();
  }
});
document.addEventListener('visibilitychange', () => { if (document.hidden && state.playing) pause(); });

function pause() {
  state.playing = false;
  loop.pause();
  $('play').textContent = '▶ Play';
  $('play').setAttribute('aria-label', 'Play simulation');
  render();
}

function play() {
  if (state.time >= 10) state.time = -4;
  clockStart = performance.now(); clockTime = state.time;
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
  state.time = -4;
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
function homeCamera() { distance = 21; azimuth = 1.08; elevation = .32; updateCamera(); }
$('home-camera').onclick = () => { homeCamera(); render(); };
$('motion').onchange = () => {
  state.motion = $('motion').value;
  state.beta = state.motion === 'turn' ? .72 : .15;
  $('beta').value = state.beta;
  $('beta').oninput();
  render();
};
for (const [id, time] of [['before', -4], ['during', 0], ['delay', 2], ['after', 5.5]]) $(id).onclick = () => {
  pause(); loop.reset(); state.time = time; render();
};
$('preset').onchange = () => {
  const v = $('preset').value;
  if (v === 'stationary') { state.beta = 0; $('beta').value = 0; $('beta-value').textContent = '0.00 c'; }
  $('component').value = v === 'radiation' ? 'rad' : v === 'near' ? 'near' : 'total';
  state.component = $('component').value;
  $('component-label').textContent = ({total: 'TOTAL B', near: 'VELOCITY B', rad: 'RADIATION B'})[state.component];
  $('electric').checked = v === 'near' || v === 'stationary';
  $('magnetic').checked = true;
  $('poynting').checked = false;
  $('power').checked = v === 'power';
  $('power-panel').hidden = v !== 'power';
  homeCamera(); render();
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
    streamlines: fieldSeeds.length,
    vertices: cachedTraces.reduce((n, points) => n + points.length, 0),
    electron: motionNow().at(state.time),
    witnesses: witnesses.map(w => field(w.p, state.time, motionNow())),
    probe: field([+$('probe-radius').value * Math.sin(+$('probe-angle').value * Math.PI / 180), 0, +$(
        'probe-radius').value * Math.cos(+$('probe-angle').value * Math.PI / 180)], state.time,
      motionNow())
  }),
  metrics: () => ({
    lastFieldCostMs: lastFieldCost,
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
