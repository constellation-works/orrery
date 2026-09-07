# orrery

> **Archived 2026-09-07.** This repository was folded into
> [constellation-works/observatory](https://github.com/constellation-works/observatory)
> at `experiments/physics/_orrery/` with full history (`git subtree add`). Work continues there;
> nothing here is updated any more.

A cabinet of accumulated physics simulations — interactive canvas/three.js sims
and Python Monte Carlo experiments, mostly born from discussions (gravity models,
Bell tests, field visualizations). Named for the clockwork solar-system models.

## Quickstart

```sh
lab/tools/serve.sh                # static server on :8000
open http://localhost:8000/lab/gallery/    # browsable catalog of all sims

uv run lab/sims/vortex-bell/vortex_bell.py   # python sims run through uv
```

Everything that runs lives under `lab/`. The theory it tests lives in the
sibling repo [principia](../principia) (`theory/`, `studies/`).

## Add a sim

```sh
lab/tools/new-sim.sh my-sim --kind web --title "My Sim"
```

See [CLAUDE.md](CLAUDE.md) for the sim contract (metadata, provenance,
versioning) and repo conventions.

## Research records

Legacy `sim.json` and captured-result JSON bytes remain authoritative for their
own fields. `research/catalog/` is their deterministic research-record mapping;
the gallery is a generated `sim.json` projection. Validate both without running
any simulation:

```sh
uv venv /tmp/orrery-research-env
uv pip install --python /tmp/orrery-research-env/bin/python -r requirements-research.txt
/tmp/orrery-research-env/bin/python scripts/research_records.py check
python3 lab/tools/build-gallery.py --check
```

See [docs/research-records.md](docs/research-records.md) for authority,
registration, cross-repository pin, equivalence, and rollback rules.
