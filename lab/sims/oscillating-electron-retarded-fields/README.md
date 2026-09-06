# Turning electron — retarded fields

A prescribed electron takes a smooth hairpin turn. The scene integrates the actual
instantaneous magnetic field in 3-D, so nearby and distant curves can point in
different directions because they see different retarded source times.

```sh
lab/tools/serve.sh 8765
# http://localhost:8765/lab/sims/oscillating-electron-retarded-fields/
node lab/sims/oscillating-electron-retarded-fields/checks.mjs
```

Plain ES modules, vendored three.js r128, no build step or network assets.

## Watch the turn

The default plays from t = −4 to 10 at 1.25 model time units per wall second,
then pauses. **Before / Turn / Delay / After** pause at −4, 0, 2, and 5.5.
Reset pauses at −4 and keeps experiment settings; Play at the end restarts the
sequence. Scrub to any observation time in this window. Drag/touch or arrow keys
orbit, wheel/pinch or +/− zoom; View restores the camera.

The white electron and its velocity arrow climb the x < 0 leg, turn toward +x at t = 0,
and descend the x > 0 leg. A = (2,0,1) and B = (5,0,1) are fixed observers.
At default beta 0.72 and t = 2, A samples tᵣ = −0.34 and has By ≈ +0.189;
B samples tᵣ = −4.91 and still has By ≈ −0.007. By t = 5.5 both have positive By.
These are computed total-field values, not an imposed wavefront. The source turns
continuously, so there is no unique sudden turn signal or sharp shell.

Motion selects the hairpin (beta 0.72) or linear comparison (beta 0.15). Contribution,
gain and sampling retain the motion/time. Curated views select contributions and
layers; Stationary also sets beta to zero. Choose a motion again or move the speed
slider to resume a driven source. The displayed sign and probe values remain
meaningful when the specific default near/far reversal no longer applies.

## Trajectory, units and physics

Choose time unit T, length cT, E unit |e|/(4πε₀c²T²), B unit E/c, and power unit
e²/(4πε₀cT²). Thus c = 1 and the electron's charge sign is q = −1.
For the hairpin let a = 3, b = 1.4, w = β₀/a:

```text
r(t) = (b sin wt, 0, a(cos wt − 1))
v(t) = (bw cos wt, 0, −aw sin wt)
a(t) = (−bw² sin wt, 0, −aw² cos wt)
|v|² = w²(b² cos² wt + a² sin² wt) ≤ β₀²
```

This bounded, smooth elongated ellipse is defined for all positive and negative
times. It has rounded ends, rather than the historical racetrack's abrupt
straight/semicircle acceleration transitions. Speed varies along it: the default
peak is 0.72 c, and speed at the upper turn is 0.336 c. The source repeats every
2π/w ≈ 26.18 time units; older turns are part of the exact retarded field.
Beta zero gives the stationary origin. The retained linear comparison is
r = (0,0,β₀ sin t), with derivatives (0,0,β₀ cos t), (0,0,−β₀ sin t).
Both expose an honest global speed bound β₀ ≤ 0.8.

At each observation point x and displayed time t solve tᵣ + |x − r(tᵣ)| = t.
All source quantities in the following expression are retarded:

```text
R = |x − r(tᵣ)|; n = (x − r(tᵣ))/R; κ = 1 − n·v
E_velocity  = q (1 − v²)(n − v)/(κ³R²)
E_radiation = q n × ((n − v) × a)/(κ³R)
B_velocity = n × E_velocity; B_radiation = n × E_radiation
E = E_velocity + E_radiation; B = B_velocity + B_radiation
S = E × B/(4π)
```

The source is an externally driven classical net charge. The external apparatus's
fields, radiation reaction and quantum structure are omitted. No photon, electron
vortex, or topological folding claim follows from the rendered curves.

Verified against [Feynman II.21](https://www.feynmanlectures.caltech.edu/II_21.html),
§§21–1 and 21–5 (retardation, B = n × E/c and moving-charge potentials), and
[Tong's radiation chapter](https://www.damtp.cam.ac.uk/user/tong/em/el5.pdf),
(6.42), (6.45), (6.55)–(6.56), inspected 2026-09-06. Tong's PDF is internally
chapter 6 despite the `el5.pdf` filename. Its emitted power per source time is
|n × ((n − v) × a)|²/(4πκ⁵); the extra κ relative to observer flux is essential.

The power panel reports the full-sphere Liénard result
P = (2/3)(a² − |v × a|²)/(1 − v²)³ in turning mode. **It disables the meridian
plot for that mode**: the pattern generally depends on both polar and azimuthal
angles. The linear comparison alone plots the axisymmetric meridian and integrates
160 midpoints in cos θ. Plot radius is normalized power, with absolute maximum and
integral printed. Zero acceleration gives zero power and no nonzero normalized
curve. The dashed sin²θ reference is only a comparison. Power uses source time t,
while the main scene uses observation time t.

## Computed geometry versus guides

- **Magnetic curves:** `streamlines.mjs` integrates dx/ds = ±B/|B| in full 3-D at
  one observation time, using the selected total/velocity/radiation contribution.
  Each vertex and midpoint requires its own retarded solve. There is no axial
  sample shortcut, emission history, or connection to curves in another frame.
  Arrowheads follow actual B, even on the branch integrated against B.
- **Colors:** cyan/yellow = positive/negative component along the fixed +y axis,
  not handedness about an assumed drive axis. Arrows give the complete vector.
  Vertex brightness is 0.12 + 0.88 min(1, log(1+120g|B|)/log 13), where g is
  display gain. Arrowheads use the full palette color. Seeding is not proportional
  to magnetic flux; neither curve count nor brightness represents emitted power.
- **Guides:** the gray oval is the prescribed trajectory and the faint grid is a
  ruler in its xz plane. The enlarged glowing electron and white velocity arrow
  identify the present source. The halo is a marker, not a field shell. The amber
  source and dashed light path belong only to the adjustable white probe. A and B
  are fixed point markers with selected-contribution By and retarded-time readouts.
- **Optional arrows:** gold E and green S are 30 independent samples in the xz
  plane. For separated contributions S uses that contribution's E × B. Total S
  includes interference and need not equal the sum of separated S. Their length
  is 0.12+0.65b, opacity 0.2+0.8b, with compression factors 15 and 600. The probe
  always reports uncompressed total fields and both contributions.

The wire exclusion sphere has radius 0.18 about the **present** source. Inside it
no field is assigned; it is numerical exclusion, not electron size or softening.
Present distance d and global speed bound b give bracket [t−d/(1−b),t]. The
safeguarded Newton/bisection solver uses residual tolerance 2e−12 max(1,d) and a
64-iteration cap. Its derivative κ ≥ 0.2 ensures a unique root. Failure throws.

The rendering uses explicit midpoint integration with step 0.16 and at most 72
steps each way (11.52 arclength units per branch). It stops at the exclusion,
|B| ≤ 1e−10, radius 10 about (0,0,−1), an approximate loop return, or a direction
change exceeding 60° between substeps. This prevents blindly bridging nulls but
can truncate curves. Sparse/standard/dense use 16/24/32 fixed seeds in y = 0;
they change coverage, **not integration step**. Small loops and near-null geometry
may be missed. Apparent crossings in projection are not proof of 3-D intersections
or topology. Short-path refinement is tested; long-curve topology is not certified.

The entire scene is sampled at the current displayed t, with no field-time cache
quantization or interpolation. Paused camera/gain changes reuse the same computed
vertices. Playback derives t from elapsed wall time; a slow frame skips displayed
instants rather than slowing the source. The shared fixed-step loop schedules
rendering; it does not numerically integrate this analytic trajectory. Hiding the
tab pauses playback. The optional text/power readouts refresh at most every 100 ms
while playing; all geometry and the A/B readings use the current frame's t.

## Reproducible validation

[checks.mjs](checks.mjs) uses only Node built-ins. The captured
[numerical report](assets/numerical-report.json) retains 37,440 linear field samples,
stationary Coulomb, boosted uniform-motion fields, independent linear potential
derivatives, charge reversal, far-field 1/R and wave relations, low-beta sin²θ and
cycle-averaged Larmor, and relativistic linear power controls.

Turning checks add 5,025 samples across beta 0–0.8, varied times and radii through
10,000; trajectory derivative and bound checks; independent 90-step bisection
potentials with finite differences; full-sphere two-angle power quadrature; power
versus radiation field; and short streamline step refinement.

| Turning control | Observed maximum error | Required |
|---|---:|---:|
| Position/velocity derivative agreement | 1.12e−10 absolute | <2e−9 |
| Retarded residual / max(1,d) | 1.94e−12 | <2.1e−12 |
| E and B from independent potential derivatives | 6.69e−9 relative | <2e−6 |
| Full-sphere power vs Liénard | 3.84e−5 relative | <2e−4 |
| Streamline endpoint, h=.16 vs .04, arclength 1.28 | 0.0134 | <0.02 |
| Streamline endpoint, h=.08 vs .04 | 0.00177 | <half the coarse error |

The power quadrature uses 800 polar × 160 azimuthal midpoints. A coarser polar
quadrature was insufficient near relativistic beaming; refining resolves it.
The numerical tests explicitly show azimuth dependence in turning mode.

Browser test tooling is external to the checkout:

```sh
UV_CACHE_DIR=/tmp/orrery-uv uv venv /tmp/orrery-browser
UV_CACHE_DIR=/tmp/orrery-uv uv pip install --python /tmp/orrery-browser/bin/python playwright==1.62.0
PLAYWRIGHT_BROWSERS_PATH=/tmp/orrery-playwright /tmp/orrery-browser/bin/playwright install chromium
# Chromium's Linux shared libraries must be available.
PLAYWRIGHT_BROWSERS_PATH=/tmp/orrery-playwright /tmp/orrery-browser/bin/python lab/sims/oscillating-electron-retarded-fields/browser-check.py
```

Keep the static server running; `ORRERY_URL` overrides http://localhost:8765.
The script checks mouse, keyboard, touch and pinch, all layers/contributions,
comparison/power restrictions, probe exclusion, time and end behavior, injected
slow-frame timing, display/field invariance, responsive bounds, catalog and
historical navigation. Screenshots are actual Chromium output at DPR 1, paused
with identical default camera and physical parameters. They are intentionally
versioned, reproducible review artifacts:

| Moment | Desktop 1440×1000 | Narrow 390×844 |
|---|---|---|
| Before, t=−4 | [frame](assets/desktop-before.png) | [frame](assets/narrow-before.png) |
| Turn, t=0 | [frame](assets/desktop-during.png) | [frame](assets/narrow-during.png) |
| Delay, t=2 | [frame](assets/desktop-delay.png) | [frame](assets/narrow-delay.png) |
| After, t=5.5 | [frame](assets/desktop-after.png) | [frame](assets/narrow-after.png) |

[Linear power frame](assets/desktop-power.png) ·
[Browser report, hardware and timings](assets/browser-report.json).
Screenshots include the full scrollable explanation. The current source supersedes
the previous atlas evidence; the historical sim itself is unchanged and runnable.

## Measured performance and limits

Final frames were visually inspected on desktop and narrow layouts: approach
curves, the strongly bent turn view, near/far opposite signs at Delay, and the
later reversal are legible. The enlarged electron, labeled observers and restored
camera help distinguish source motion from computed field geometry. The narrow
title/badge overlap found in the first browser run was corrected before capture.
No page, console or load errors remained. SwiftShader's screenshot-related
`GPU stall due to ReadPixels` warnings are retained in the report.

Measured on an Intel i5-13500H (14 logical CPUs exposed), Linux 6.8.0-138,
Chromium 151.0.7922.34, ANGLE/Vulkan SwiftShader, DPR 1:

| Viewport / density | Frame median / p95 | CPU update + submit median / p95 |
|---|---:|---:|
| 1440×1000 / standard | 39.6 / 59.7 ms | 21.8 / 33.5 ms |
| 1440×1000 / dense | 67.8 / 102.9 ms | 39.4 / 60.0 ms |
| 390×844 / standard | 45.9 / 66.6 ms | 29.7 / 49.7 ms |

Each sample uses one second warm-up
and five seconds playback across the upper turn, default beta 0.72 and gain 1.
CPU time includes integration, buffer updates and render submission, not GPU
completion. Frame intervals include browser scheduling; screenshots are excluded.
These observations use software rendering and are not physical-GPU or mobile-device
performance promises. Safari, Firefox and physical touch devices were not tested.

## Lineage

ORB-11364 corrects ORB-11350 in place, retaining the general physical model and
linear comparison. [swirl-ball-far-field](../swirl-ball-far-field/) is the original
illustrative racetrack and remains runnable. The `swirl-photon` family records
historical lineage only. No sister-repository write or theory-status change is
part of this implementation. The user's reference image was described in the task;
its later named /tmp path was absent from this executor, so no direct reference
image inspection is claimed.
