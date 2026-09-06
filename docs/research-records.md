# Orrery research records

`lab/sims/**/sim.json` and the captured JSON files beside simulations remain
the sole authority for their legacy fields. The v1 records under
`research/catalog/records/` are deterministic mappings, not independently
editable copies. `research/catalog/migration.json` owns only mapping decisions,
aliases, exceptions, and cross-repository pins. `lab/gallery/index.html` is a
generated `sim.json` projection.

This boundary matters: a catalog describes apparatus. It is not an execution,
protocol, assessment, or scientific verdict. Generic captured results become
immutable result artifacts. They become experiment records only when source
evidence establishes a distinct execution. The initial migration therefore
creates explicit experiment records only for the original wide-binary run and
its later diagnosis; every other capture says why it remains artifact-only.

## Inventory and compatibility

Install the exact reviewed framework into an environment outside the checkout:

```sh
UV_CACHE_DIR=/tmp/orrery-research-cache uv venv /tmp/orrery-research-env
UV_CACHE_DIR=/tmp/orrery-research-cache uv pip install \
  --python /tmp/orrery-research-env/bin/python -r requirements-research.txt
export PYTHONDONTWRITEBYTECODE=1
/tmp/orrery-research-env/bin/python scripts/research_records.py check
python3 lab/tools/build-gallery.py --check
```

The checker re-runs the shared Orrery importer at source baseline
`a1c430db54d585048ec85c4e7c47141db634f398`, inventories every selected JSON
container and nested selector, verifies source bytes against their Git blobs,
rebuilds every record, and byte-compares the complete generated authority. The
committed manifest contains per-source unit-map digests instead of duplicating
large result arrays. All 83 JSON sources and 16,653 units are still checked.

Eight source roots formerly collided under four content-derived anonymous
identities. They retain those legacy aliases in metadata, but each now has a
path-and-selector-qualified record identity. No source wins and no bytes are
discarded. Figures, Parquet/CSV outputs, the electron comparison view, and all
39 runnable entry paths are separate available artifacts with digests and
scientific roles. Their existence and bytes are checked without opening a
browser or running physics.

To reproduce the complete authority in a new directory, or recover every
legacy JSON byte:

```sh
/tmp/orrery-research-env/bin/python scripts/research_records.py migrate \
  --output /tmp/orrery-candidate
/tmp/orrery-research-env/bin/python scripts/research_records.py rollback \
  --output /tmp/orrery-legacy
```

Both destinations must not exist and must be outside the checkout. `migrate`
is byte-identical to the checked-in authority. `rollback` validates that
authority first, then exports exactly the original source tree. To reverse a
consumer cutover, revert the consumer/gallery change while retaining immutable
records. Do not delete evidence to roll back a view.

When an owning legacy source intentionally changes, update the reviewed source
baseline and regenerate the mapping in a scoped task. Never edit a record,
manifest hash, or gallery card by hand to conceal drift.

## Wide-binary historical chain

`wide-binary-chain-manifest.json` validates a typed chain at immutable delivered
history:

- Principia owner pilot `4e3b02c59b694d85016915177ef1ae157895ed7b`
  supplies the exact historical protocol and five frozen claims.
- Orrery original run `28dd5c72bb670517b93b556f1d2483402c8e8655`
  supplies the result and code pins. Its 44-enumerated/47-declared discrepancy,
  failed controls, and unresolved verdict are unchanged.
- Orrery diagnosis `2e097e606bc751ba1a8b29ebdc5aab6bbd961c43`
  supplies a separate later execution and its four recorded deviations. It
  annotates; it does not repair the protocol or overwrite the original run.
- Astrolabe delivery `1642b4ba2f75e16091692e280932363a6a4f0343`
  supplies exact source and dataset records. The two code sources are
  available. All four historical dataset outputs remain missing, and their
  historical consumption remains unknown.

The owner pilot migration, inventory, dataset manifest, and wide-binary chain
manifest are separately blob- and byte-pinned, as are Principia's migration and
two framework manifests. The shared typed `ArtifactResolver` seam is therefore
not used to promote these four missing historical inputs: it can verify current
retained non-Git bytes only when an owner supplies a `VerifiedArtifact` and
schema check, and cannot prove what this historical run consumed.

The `external/` files are deterministic exact-snapshot compatibility objects
whose owner remains the pinned sibling repository. Run read-only history
verification when those checkouts are available:

```sh
/tmp/orrery-research-env/bin/python scripts/research_records.py verify-history \
  --principia-root /path/to/principia --astrolabe-root /path/to/astrolabe
```

No assessment is minted by this migration. Historical records have no native
start receipt, and pending/missing evidence cannot imply confirmation.

## Native registration boundary

New work uses orbit-research 0.2's `program`, `claim`, `artifact`,
`preregister`, `begin-run`, `record-run`, and `assess` boundary. Registration
does not launch a simulation; Orbit owns execution. Commit each immutable
receipt before obtaining an exact reference, preserve complete code/input/
environment/invocation/output/deviation provenance, and never use a completed
task as scientific support.

The repository fixture exercises the installed CLI without scientific work:

```sh
parent=$(mktemp -d /tmp/orrery-native-fixture.XXXXXX)
/tmp/orrery-research-env/bin/python scripts/native_registration_fixture.py \
  "$parent/owner"
```

It creates a disposable Git owner, registers a program, claim, seed artifact,
protocol and start receipt, then records the run as cancelled. `fixture.py` is
never executed, no result or assessment is created, and the final export must
validate. This is an API fixture, not retrospective preregistration or evidence.
