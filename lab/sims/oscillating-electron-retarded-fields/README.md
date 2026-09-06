# Oscillating electron — retarded fields

An externally driven classical electron with prescribed linear motion, rendered as
instantaneous field samples in 3-D. Open `index.html` through a static server:

```sh
lab/tools/serve.sh 8765
# http://localhost:8765/lab/sims/oscillating-electron-retarded-fields/
node lab/sims/oscillating-electron-retarded-fields/checks.mjs
```

No build step, network assets, or application dependencies beyond the repository's
vendored three.js r128. The shared fixed-step loop advances at 1/120 dimensionless
time units, at playback speed 0.65. Pause, scrub (one period), and reset affect time;
reset pauses at zero and retains experiment settings. Drag / touch orbit, pinch /
wheel zoom, or focus the scene and use arrows / + / −. All presets reset beta to
0.15 except the stationary control (zero); they retain phase, gain and density.

## Model and conventions

Choose length unit c/ω, time unit 1/ω, E unit |e|ω²/(4πε₀c²), B unit E/c,
and power unit e²ω²/(4πε₀c). Thus c = ω = 1 and charge sign q = −1.
The trajectory is **r(t) = (0, 0, β₀ sin t)**, with β₀ ∈ [0, 0.8], default 0.15.
Motion is prescribed for all positive and negative times: there is no startup pulse.
The source is a net charge, not a neutral electric dipole. External drive fields,
radiation reaction, and quantum electron structure are outside the model.

At observation point x and time t, solve **tᵣ + |x − r(tᵣ)| = t**. Define
R = |x − r(tᵣ)|, n = (x − r(tᵣ))/R, β = dr/dtᵣ, a = dβ/dtᵣ,
and κ = 1 − n·β. All source quantities below are retarded:

```text
E_velocity  = q (1 − β²)(n − β) / (κ³ R²)
E_radiation = q n × ((n − β) × a) / (κ³ R)
E = E_velocity + E_radiation
B_velocity = n × E_velocity; B_radiation = n × E_radiation
B = B_velocity + B_radiation
S = (E × B)/(4π)
```

Negative q reverses E and B, but not S. Radiation E is transverse and satisfies
|E_radiation| = |B_radiation| (in SI: |E_rad| = c|B_rad|).
“Near” labels the velocity term; it does not imply that this term has compact support.

Source verification: [Feynman II.21, §§21–1, 21–4, 21–5](https://www.feynmanlectures.caltech.edu/II_21.html)
provides the retarded field relation, small-motion limit, and moving-charge potentials.
[Tong, electromagnetic radiation](https://www.damtp.cam.ac.uk/user/tong/em/el5.pdf)
(download inspected 2026-09-06; its current internal chapter numbering is **6**)
gives the decomposed fields in (6.42), (6.45), Larmor controls in (6.18)–(6.20),
and emitted angular power in (6.55)–(6.56). His [course index](https://www.damtp.cam.ac.uk/user/tong/em.html)
still labels the linked radiation chapter 5. The implementation uses these
conventions, including n from the retarded source **toward the observer**.

The angular plot samples the radiation field on a radius-100 sphere centered at
r(tᵣ), evaluated at observer time tᵣ + 100. Its slider phase is **emission** time
(equal numerically to the scene's current t), whereas the main scene samples a
common **observation** time. Power per source time is
**dP/dΩ = κ R² |E_rad|²/(4π)**. The extra κ converts observer time to source time;
the plot is not R² times flux alone. It normalizes radius to the current maximum,
with an independently calculated numerical maximum and solid-angle integral printed
below. At zero acceleration, power vanishes and no normalized curve is drawn.

## Solver and exclusion

Present distance d and global speed bound b give a root bracket
[t − d/(1−b), t]. The derivative 1−n·β ≥ 0.2 ensures a unique root. Safeguarded
Newton steps stay in the bracket, falling back to bisection, with a 64-step cap and
residual tolerance 2×10⁻¹² max(1,d). A failed solve throws instead of displaying
fabricated data. No state depends on viewport, camera, density, or display gain.

Points at present-source distance ≤ **0.18** are explicitly masked (no assigned
field, no artificial softening). The wire sphere marks this fixed physical radius;
it is a numerical exclusion, not electron size. Outside the sphere, R is bounded
below by d/(1+b). The probe can enter the sphere and reports `EXCLUDED`.
The kernel validates finite point/time inputs and beta bounds; its arbitrary-motion
interface requires a truthful global speed bound and consistent source derivatives.
The user interface exposes only the validated sinusoidal trajectory.

## Visual encoding and limits

- Magnetic rings have fixed cylindrical radii 0.65–7 and z planes −5–5.
  Axial symmetry makes one calculated Bφ sample exact along each ring; four tangent
  arrows show its sign. Cyan is +φ, coral is −φ, about +z. These guides are not
  propagating shells, material trajectories, photons, or an electron vortex.
- Standard sampling uses 63 rings (7 radii × 9 planes); sparse 35, dense 99.
  Density changes spatial sampling only. The E / S meridian always has 54 samples.
- Ring brightness uses b = min(1, log(1 + 120 g |B|)/log 13), opacity 0.08+0.82b.
  Exactly zero/tiny fields (|B| ≤ 10⁻¹⁴) hide guides. Gold E and green S arrows use
  compression factors 15 and 600. Arrow lengths are 0.12+0.65b, opacity 0.2+0.8b;
  lengths and brightness clip. All lengths describe the drawing, not physical values.
- Contribution selection affects B, E, and S; for a separated contribution, S uses
  that contribution's E × B only. **Total S includes interference terms** and can
  point inward locally. It is not simply the sum of the two separated S values.
  The probe always reports full, uncompressed totals and both decompositions.
- Present source is white; the amber source and dashed light path belong only to
  the selected white probe. Source spheres are enlarged glyphs; only the wire
  exclusion sphere has the stated physical radius. Camera fitting changes on narrow
  viewports without changing sample coordinates or field values.

The finite sampling can miss small structures at large beta; it is not a field-line
integrator or a convergence claim for a continuum picture. The dense atlas can be
visually busy. Zooming close intentionally clips distant guides. The normalized power
curve hides absolute amplitude unless its numeric readout is consulted. The shared
loop clamps long tab stalls and drops backlog when overloaded; playback can slow on a
slow renderer, while fields remain deterministic functions of the displayed t.

## Reproducible validation

`checks.mjs` uses Node's built-in assertions and no installed packages. Its output is
captured in [assets/numerical-report.json](assets/numerical-report.json).

| Independent control | Scope / required tolerance | Observed |
|---|---|---|
| Retarded solve and finite field | 37,440 points; beta 0–0.8, 32 phases, 13 polar angles, rotated azimuths; present radii 0.180001–10,000; residual ≤ 2.1e−12 max(1,d) | max residual 2.00e−8 at large radius; ≤39 iterations |
| Stationary electron | Coulomb E and zero B / radiation; negative-charge inward direction; absolute error <1e−12 | E error 3.88e−18 |
| Uniform motion | Independent instantaneous boosted-Coulomb field; beta ≤0.8, varied times and points; relative error <1e−10; zero radiation | 3.93e−12 |
| Potential derivatives | Independent 80-step bisection potentials, centered finite differences of −∇φ−∂A/∂t and ∇×A; beta 0.15 and 0.8; relative error <2e−6 | 1.09e−7 |
| Radiation wave relation | All sweep points; relative E_rad vs cB_rad magnitude error <1e−9 | 7.35e−16 |
| Angular pattern | Low-beta sinusoid at a turning point, absolute normalized sin²θ error <1.3e−7 | 3.39e−12 |
| Far observer angular pattern | Fixed origin-centered R=1,000 sphere, 25 angles × 128 observation phases, beta 0.01; cycle-average sin²θ normalized error <0.001 | 9.38e−5 |
| 1/R amplitude | Matched emission event at R=20 and 200, beta=0.8; relative error <1e−9 | 5.44e−11 |
| Cycle-averaged Larmor | 240 midpoint samples in cos θ × 96 phases; β₀=0.1, 0.03, 0.01; respective error limits 1%, 0.1%, 0.02% | 0.7585%, 0.0684%, 0.00837% |
| Quadrature refinement | Double both angular and temporal resolution at beta 0.01; relative change <1e−5 | 6.52e−6 |
| Relativistic emitted power | 2,000 angular midpoints at four phases, beta=0.8, compare (2/3)γ⁶a²; relative error <1e−4 | 6.18e−6 |

The Larmor cycle prediction is β₀²/3 in these units. Its decreasing discrepancy
includes the expected finite-beta correction; it is not solely integration error.
Boundary checks cover the inside/outside singular mask, invalid beta, deterministic
repeated values, and observation times ±100 and ±10,000. Analytic controls and
finite-difference potentials are deliberately different calculation paths.

Browser reproduction (Python Playwright is **test tooling only**):

```sh
# Put tooling outside the checkout; use an existing installation if available.
UV_CACHE_DIR=/tmp/orrery-uv-cache uv venv /tmp/orrery-browser-venv
UV_CACHE_DIR=/tmp/orrery-uv-cache uv pip install --python /tmp/orrery-browser-venv/bin/python playwright==1.62.0
PLAYWRIGHT_BROWSERS_PATH=/tmp/orrery-playwright /tmp/orrery-browser-venv/bin/playwright install chromium
# Chromium's standard Linux runtime libraries must be available.
PLAYWRIGHT_BROWSERS_PATH=/tmp/orrery-playwright /tmp/orrery-browser-venv/bin/python lab/sims/oscillating-electron-retarded-fields/browser-check.py
```

The script serves no content itself: keep the static server above running.
`ORRERY_URL` optionally changes its base URL. It exercises real Chromium rendering,
mouse/keyboard/touch controls, all presets and toggles, probe exclusion, and field
invariance under display changes; it checks both historical and new catalog paths.
Screenshots are at a fixed paused phase 1.571. Desktop is 1440×1000, narrow 390×844,
DPR 1. See [browser-report.json](assets/browser-report.json) for timing arrays'
summary, hardware, browser version, and driver warnings; see the screenshot files
for the actual inspected layouts. CPU timings measure field update plus render
submission, **not** GPU completion; animation-frame intervals include browser scheduling.

## Browser evidence and measured performance

Inspected artifacts: [desktop atlas](assets/desktop-atlas.png),
[near-field view](assets/desktop-near.png), [angular power](assets/desktop-power.png),
and [narrow atlas](assets/narrow-atlas.png). The final run passed all scripted
interactions, including a requested-phase assertion, single-touch orbit and two-touch
pinch, singular probe masking, and a narrow heading/badge separation check. No
page errors, console errors, or failed loads were recorded. SwiftShader emitted
`GPU stall due to ReadPixels` performance warnings, retained in the report.

Measured on a 13th Gen Intel Core i5-13500H (14 logical CPUs exposed), Linux
6.8.0-138, Chromium 151.0.7922.34, ANGLE/Vulkan **SwiftShader software rendering**,
DPR 1. Each sample uses one second warm-up then five seconds without interaction
or screenshot capture, beta 0.15 and gain 1. These are observations on this runner,
not a frame-rate promise or physical-GPU benchmark.

| Viewport / density / preset | Frame intervals | Frame median / p95 | CPU update + submit median / p95 |
|---|---:|---:|---:|
| 1440×1000 / standard / overview | 243 | 20.3 / 24.1 ms | 2.7 / 4.4 ms |
| 1440×1000 / dense / radiation | 191 | 25.9 / 29.4 ms | 3.6 / 6.0 ms |
| 390×844 / standard / overview | 301 | 16.7 / 17.7 ms | 2.8 / 4.1 ms |

The larger dense radiation view also enables S arrows; it is intentionally a
heavier preset, not an isolated density benchmark. Narrow measurements use the
same physical samples. Timing is subject to concurrent host load and scheduler
variation. Physical mobile devices, Safari, Firefox and physical GPU drivers were
not exercised. Static Chromium browser checks were run on the final candidate.

## Lineage

Task ORB-11350 supersedes the *model* in
[swirl-ball-far-field](../swirl-ball-far-field/), whose animation and original almanac
provenance remain runnable. Both catalog entries retain the `swirl-photon` family
for historical grouping only; the new model makes no photon or vortex claim.
No almanac provenance is invented for this new implementation. The old catalog
summary names this successor and its page links here. No sibling repository or
theory verdict is changed. This is a candidate for Daniel's review.
