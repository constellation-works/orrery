# Turning electron — dense retarded field

The computed page fills the window with **8,064 stationary vector samples** around
an electron taking a tight, smooth turn. Cyan grows out of the near-source region
while the distant field still points the other way. The original illustration
remains one click away, with its animation intact.

**Visual limitation:** the computed response is a bent, spreading volume of field
samples. It is materially different from the original's broad sheet/funnel. This
implementation does not reproduce or establish that illustrative folding topology,
and the validation below is not a claim of user acceptance.

```sh
bash lab/tools/serve.sh 8765
# http://localhost:8765/lab/sims/oscillating-electron-retarded-fields/
node lab/sims/oscillating-electron-retarded-fields/checks.mjs
node lab/sims/oscillating-electron-retarded-fields/dense-checks.mjs
```

Plain ES modules and shared canvas/loop helpers; no build step or network assets.
Only these two electron pages and their gallery entries change (ORB-11374).

## Playback and what the marks mean

The default plays t = −4 through 10 at **1.8 model units per wall second**, then
pauses. Before / Turn / Outward / After pause at −3, 0, 3, 6. Scrubbing pauses;
Reset returns to −4; Play at the end restarts. The electron rises on the narrow
left leg, turns toward +x at t = 0, and descends on the right. Its default peak
speed is 0.45 c; the upper turn's curvature radius is about 0.248 length units.

- **Colored strokes** are instantaneous 3-D B vectors at fixed locations, projected
  into the view. Every seventh sample has an arrowhead; other strokes show the
  tangent axis. They are not emitted rings, connected field lines, particle paths,
  or stored history. E can be selected instead of B. Total, velocity and acceleration
  contributions use the kernel's exact corresponding vectors.
- **The cutaway** samples the fixed y ≥ 0 half-volume: cylindrical radii approximately
  0.3–10.3 and z = −7.5…4.5. The unsampled half is omitted to reduce projected
  front/back overlap. Orbiting rotates this same physical cutaway, not the field or
  sampling locations. Finite coverage is a drawing choice, not magnetic flux.
- **Color** is the sign of Bφ = B·(−y/r, x/r, 0), about the fixed z axis, even though
  the motion is not axisymmetric. Cyan is positive, yellow negative. In E mode it
  is the sign of Ez. No velocity-based coloring or assumed circulation is used.
- **Brightness** compresses magnitude: b = min(1, ln(1 + 100 g |F|)/ln 21). Opacity
  is quantized into 16 bins for drawing; the lowest bin is omitted. Nonzero bins
  use their midpoint opacity. Stroke length is 0.18 physical units before
  projection, independent of magnitude. A projected vector can foreshorten nearly
  to a dot. Values below 1e−14 are omitted. Gain, glyph density and brightness are
  not power or flux measurements.
- **White electron and arrow** show the present position and velocity; the glow
  is an enlarged marker. The faint ellipse around it projects the exclusion
  sphere. Gray dashes are the prescribed trajectory; green is a spatial ruler.
- **A = (2,0,0), B = (5,0,0)** are fixed observers. Their always-visible readings
  give tᵣ and the selected vector's By (or Ez). With defaults at t = 3, A has
  changed sign and B has not; by t = 6 both have changed. These are computed values.
- **Optional dashed light sphere** is explicitly labeled tᵣ = 0 and has radius t
  about the turn position. It marks reception of the source event at t = 0;
  it is neither a B field line nor a claim of a sharp radiation front. It is off
  by default. The source accelerates smoothly before and after the turn.

Light / standard / dense select 4,608 / 8,064 / 23,040 points. Sampling is fixed
in model units and independent of screen size. Each displayed instant gets a new
retarded solve at every sample. Previous roots are initial guesses only: there is
no time interpolation, quantized field-time cache, or temporal smoothing. Camera
and gain changes while paused reuse the same values. Playback uses elapsed wall
time; a slow frame skips displayed instants instead of slowing the source. Hiding
the tab pauses. Drag/touch or left/right arrows rotate about z; wheel/pinch or +/−
zoom. The original's shallow depth projection (0.24 y − 0.85 z) is retained.

## Smooth bounded trajectory and field

Dimensionless c = 1 and q = −1. Length unit cT, E unit |e|/(4πε₀c²T²), B unit E/c,
power unit e²/(4πε₀cT²). Let ε = 0.12, a = 3/atan(1/ε), ω = β₀/a,
s = sin(ωt), C = cos(ωt), D = ε² + s². The default racetrack is:

```text
x = a ε s / sqrt(D)
y = 0
z = a [asin(C / sqrt(1 + ε²)) − atan(1/ε)]
vx = a ε³ ω C / D^(3/2)       vz = −a ω s / sqrt(D)
ax = −a ε³ ω² s (D + 3C²) / D^(5/2)
az = −a ω² ε² C / D^(3/2)
```

It is smooth for all times, bounded by |x| < 0.25 and −6 ≤ z ≤ 0, and repeats
with period 2π/ω (about 28.86 at the default). It has nearly straight legs and a
smooth reversal rather than the illustration's abrupt acceleration changes at
straight/semicircle joins. Its global speed bound is exact:

```text
|v|²/β₀² = s²/D + ε⁶ C²/D³ ≤ 1
because ε⁶ C² ≤ ε²(ε² + s²)².
```

β₀ is constrained to 0…0.8; zero gives the stationary origin to floating-point
roundoff. The earlier ellipse remains an optional comparison:
r = (1.4 sin ωt, 0, 3(cos ωt − 1)), ω = β₀/3. The linear comparison is
r = (0,0,β₀ sin t), with its analytic derivatives. Neither comparison changes the
kernel. Field controls select β₀ = 0.45 for turning modes and 0.15 for linear.

At every point solve tᵣ + |x − r(tᵣ)| = t. With all source quantities at tᵣ:

```text
R = |x − r(tᵣ)|; n = (x − r(tᵣ))/R; κ = 1 − n·v
Enear = q (1 − v²)(n − v)/(κ³ R²)
Erad  = q n × ((n − v) × a)/(κ³ R)
Bnear = n × Enear; Brad = n × Erad
E = Enear + Erad; B = Bnear + Brad; S = E × B/(4π)
```

The charge sign and both field terms are preserved. Present-source distances
≤ 0.18 are excluded; no softened or fabricated field is assigned there. This
region is numerical exclusion, not electron size. From present distance d and
speed bound β₀, the solver brackets [t − d/(1−β₀), t], with κ ≥ 0.2, residual
≤ 2e−12 max(1,d) and a 64-iteration cap. A warm start must lie inside the bracket.
Newton steps must also be smaller than half the remaining bracket; otherwise
bisection prevents endpoint-to-endpoint stagnation on the narrow trajectory.
Warm and cold evaluations agree within solver tolerance, not necessarily bitwise.

The optional power readout evaluates full-sphere Liénard power per **source** time,
P = (2/3)(a² − |v × a|²)/(1 − v²)³. Turning is not axisymmetric, so no meridian
plot or multiplication of one meridian by 2π is offered. Its independent check
integrates both polar and azimuthal angles. Power is not inferred from display
brightness. The drive supplies energy; its own fields, radiation reaction,
quantum structure and the driving apparatus are omitted.

The field conventions retained from ORB-11364 follow
[Feynman II.21](https://www.feynmanlectures.caltech.edu/II_21.html) and
[Tong, radiation chapter](https://www.damtp.cam.ac.uk/user/tong/em/el5.pdf).
No new literature or theory verdict is asserted by changing the trajectory/view.

## Before / turn / outward / after evidence

[Side-by-side comparison](assets/comparison.html) shows the original and candidate
at four comparable phases, desktop and narrow, with links to the full frames.
The worker ran the actual original page before design, inspected its live rising
and post-turn envelopes, then iterated the candidate using actual Chromium frames.
A full-volume first pass produced excessive front/back overlap; the fixed cutaway
and fewer arrowheads make the direction texture and growing reversal clearer.
The former 24 sparse loops and large sidebar are no longer the default view.

The final original comparison is generated by executing its actual animation
through a full period before capture. A seeded pseudorandom sequence gives ordinary
varied dash offsets; the harness alone controls requestAnimationFrame time and
pause for reproducible phases. Default original camera, controls and physics
parameters remain unchanged. Candidate frames use its actual phase buttons.
On desktop both use approximately 71.71 horizontal pixels per model unit, the
same 0.24 depth / 0.85 vertical projection and a nearly matched upper turn height
(original ≈266 px, candidate 280 px). Original time offsets are candidate offsets
multiplied by this scale / 240, matching the nominal light-travel distance. Exact
turn source positions/speeds differ because the trajectories differ. All actual
times and states are recorded in [browser-report.json](assets/browser-report.json).

Narrow frames use the same viewport, but the candidate deliberately zooms 1.45×
and shifts the origin to 38% height for readability below its header. The original
retains its own responsive framing. Original narrow offsets retain the desktop
fraction of its circuit, so all four phases span the turnaround; they are not
shrunk with viewport width. Their pixel propagation distances consequently differ
from the candidate. This is not a pixel-identical camera comparison;
no physical value or time changes on resize. On narrow, the dense texture still
spans the available scene; the turn and expanding cyan region are visible. Open
controls overlay the left scene and can be collapsed. Far field outside the finite
volume/screen is absent. Projected overlap and missing small structures remain
limitations. **There is no claim that the sampled geometry equals the original
illustrative sheet, that a topological fold was verified, or that Daniel accepted
this visual result.**

The original animation's inline JavaScript is byte-identical to the pre-task
version (SHA-256 `0b7cfda2940ef0ac42a7951222b7593dd23510442f3c74044e466950fcc0e7ae`).
Only its comparison notice and metadata change: no superseded label, direct link
back to the computed view. Existing URLs and the original experience remain.
Earlier `desktop-*`, `narrow-*` and atlas assets are retained historical evidence;
**the current candidate frames have the `dense-` prefix**.

## Numerical and browser validation

[Prior-model controls](assets/numerical-report.json) rerun the existing 37,440-sample
linear sweep, 5,025-sample ellipse sweep, stationary/boosted fields, independent
potential derivatives, charge reversal, radiation scaling, angular power and
streamline refinement. [New controls](assets/dense-numerical-report.json) add:

| Control | Maximum observed error / result |
|---|---:|
| Analytic trajectory derivatives vs finite differences | 3.70e−9 absolute |
| 321,408 dense spacetime samples at β₀ = 0.8 | normalized residual 2.00e−12; ≤10 iterations |
| Independent bisection potentials and numerical source velocity | 3.41e−6 relative E/B error |
| Warm vs cold field solves | 5.21e−10 relative B error |
| Two-angle full-sphere power vs Liénard | 4.21e−5 relative |
| Same source past, different future, outside light cone | E/B difference ≤1.25e−10 absolute |
| Former Newton stagnation point | converges in 5 iterations |

The independent potentials use an alternative atan2 position formula, numerical
velocity and 90 pure bisections, not the production derivatives/root solver.
The causality check compares two trajectories identical through t = 0 but different
afterwards; fields outside that event's light cone agree within solver accuracy,
and a point inside distinguishes them. The rendered sampler is checked against
both exact field contributions, both vector selections and electron charge sign.

`browser-check.py` checks actual desktop/narrow playback, pause/scrub/reset/end,
all contributions and both vectors, speed-zero control, comparison motions and
power, mouse/keyboard/touch/pinch, field invariance under display changes, the
labeled optional guide, reciprocal original links, and absence of browser errors.
An injected 240 ms stall tests elapsed-time playback. Timings exclude screenshots.
See the JSON report for hardware, actual observation-time coverage and full results.

Measured on 13th Gen Intel(R) Core(TM) i5-13500H, 14 logical CPUs exposed, Chromium
151.0.7922.34, Linux headless Canvas2D, DPR 1. Fresh default pages,
one-second warm-up, five seconds measured across the turn and outward response:

| Viewport | Frame interval median / p95 | CPU compute + canvas submit median / p95 |
|---|---:|---:|
| 1440×1000 | 75.7 / 171.4 ms | 44.9 / 108.9 ms |
| 390×844 | 67.0 / 114.4 ms | 48.9 / 92.3 ms |

This run gives roughly 13 desktop / 15 narrow frames per second, with visible
stutter during slower frames. It is not a 60 fps result. An isolated early run
was faster (~25 fps); the full captured run is the evidence reported here.
A separate [measurement after exercising all controls](assets/browser-report-after-controls.json)
recorded median intervals of 88.1 ms desktop and 59.5 ms narrow. Thus cadence is
sensitive to this executor and browser workload; no causal conclusion about that
variation is established. Light sampling is available when speed matters more
than texture density. Dense sampling costs more. Neither changes the physical
clock or field values. CPU times omit final raster/compositing completion, while
frame intervals include browser scheduling. Physical GPUs, actual phones,
Safari and Firefox were not tested. Browser emulation is not a mobile performance
promise. The original's small-screen beta/framing depend on its viewport; the
computed field's do not.


Browser tooling and caches stay outside the checkout:

```sh
UV_CACHE_DIR=/tmp/orrery-uv uv venv /tmp/orrery-browser
UV_CACHE_DIR=/tmp/orrery-uv uv pip install --python /tmp/orrery-browser/bin/python playwright==1.62.0
PLAYWRIGHT_BROWSERS_PATH=/tmp/orrery-playwright /tmp/orrery-browser/bin/playwright install chromium
PLAYWRIGHT_BROWSERS_PATH=/tmp/orrery-playwright /tmp/orrery-browser/bin/python lab/sims/oscillating-electron-retarded-fields/browser-check.py
```

On this executor Chromium lacked libatk, libatk-bridge, libatspi, libXdamage and
libasound. These Ubuntu packages were downloaded with `apt-get download` into
`/tmp/orrery-debs`, extracted with `dpkg-deb -x` to `/tmp/orrery-libs`, and the run
used `LD_LIBRARY_PATH=/tmp/orrery-libs/usr/lib/x86_64-linux-gnu`. No host package or
repository dependency was installed. `ORRERY_URL` overrides localhost:8765.
