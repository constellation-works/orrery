#!/usr/bin/env python3
"""Build and validate Orrery's lossless research-record migration.

The existing sim.json and captured JSON files remain the metadata authority for
their own fields.  This adapter creates deterministic, checked research records;
it never runs a simulation or infers an experiment from catalog presence.
"""
from __future__ import annotations

import argparse
from collections import defaultdict
from copy import deepcopy
from hashlib import sha256
from importlib.metadata import distribution
import json
import mimetypes
import os
from pathlib import Path
import subprocess
import sys
import tempfile

from orbit_research import make_record, validate
from orbit_research.contract import canonical, reference, revision_digest
from orbit_research.importers import import_source, strict_json


ROOT = Path(__file__).resolve().parents[1]
AUTHORITY = Path("research/catalog")
BASELINE = "a1c430db54d585048ec85c4e7c47141db634f398"
FRAMEWORK = "0a9cf756e1c2522b9d5ee71c1cf462b8676f4281"
PRINCIPIA_DELIVERY = "4e3b02c59b694d85016915177ef1ae157895ed7b"
ASTROLABE_DELIVERY = "1642b4ba2f75e16091692e280932363a6a4f0343"
ORIGINAL_RUN = "28dd5c72bb670517b93b556f1d2483402c8e8655"
DIAGNOSIS_RUN = "2e097e606bc751ba1a8b29ebdc5aab6bbd961c43"
LIMIT = "Historical simulation evidence only; no observational or nature-level inference."
EXTERNAL_DOCUMENTS = {
    "principia": [
        "research/wide-binary/migration.json",
        "research/wide-binary/freeze-manifest.json",
        "research/wide-binary/source-manifest.json",
    ],
    "astrolabe": [
        "research/datasets/migration.json",
        "research/datasets/inventory.json",
        "research/datasets/dataset-manifest.json",
        "research/datasets/wide-binary-chain-manifest.json",
    ],
}


def encoded(value):
    return (json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n").encode()


def digest(data):
    return "sha256:" + sha256(data).hexdigest()


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sibling_checkout(name):
    for parent in (ROOT, *ROOT.parents):
        candidate = parent / name
        if candidate != ROOT and candidate.is_dir() and (candidate / ".git").exists():
            return candidate
    return ROOT.parent / name


def git(root, *args, binary=False):
    result = subprocess.run(
        ["git", "-C", str(root), *args], capture_output=True, check=False,
        text=not binary, env={**os.environ, "GIT_OPTIONAL_LOCKS": "0"},
    )
    require(result.returncode == 0, result.stderr.strip() or f"git {' '.join(args)} failed")
    return result.stdout if binary else result.stdout.strip()


def package_check():
    dist = distribution("orbit-research")
    direct = json.loads(dist.read_text("direct_url.json") or "{}")
    commit = direct.get("vcs_info", {}).get("commit_id")
    require(dist.version == "0.2.0" and commit == FRAMEWORK,
            "Install requirements-research.txt: exact orbit-research 0.2.0 Git revision required")


def blob_pin(root, revision, path):
    data = git(root, "show", f"{revision}:{path}", binary=True)
    return {
        "repository": "orrery" if root == ROOT else root.name,
        "git_revision": revision,
        "path": path,
        "blob_oid": git(root, "rev-parse", f"{revision}:{path}"),
        "sha256": digest(data),
        "bytes": len(data),
    }


def provenance(path, data, selector="$", revision=BASELINE):
    return {
        "repository": "orrery",
        "git_revision": revision,
        "blob_oid": git(ROOT, "rev-parse", f"{revision}:{path}"),
        "sha256": digest(data),
        "path": path,
        "selector": selector,
        "historical": True,
        "working_tree": False,
    }


def finish_record(record, aliases, *, references=()):
    record["aliases"] = list(aliases)
    record["references"] = list(references)
    record["revision_id"] = revision_digest(record)
    return record


def record_path(record):
    return f"records/{record['kind']}-{record['revision_id'].split(':')[1]}.json"


def external_index(root, delivery):
    listing = git(root, "ls-tree", "-r", "--name-only", delivery, "--", "research").splitlines()
    index = defaultdict(list)
    for path in listing:
        if not path.endswith(".json"):
            continue
        try:
            data = git(root, "show", f"{delivery}:{path}", binary=True)
            candidate = strict_json(data)
        except (ValueError, UnicodeError):
            continue
        if isinstance(candidate, dict) and candidate.get("id") and candidate.get("revision_id"):
            index[(candidate["id"], candidate["revision_id"])].append((path, data, candidate))
    return index


def external_record(repository, root, delivery, index, ident, revision):
    matches = index.get((ident, revision), [])
    require(len(matches) == 1, f"external record missing or ambiguous at {repository}@{delivery}: {ident}")
    path, data, record = matches[0]
    record = deepcopy(record)
    record["provenance"].update(
        git_revision=delivery,
        blob_oid=git(root, "rev-parse", f"{delivery}:{path}"),
        sha256=digest(data),
        path=path,
        selector="$",
        working_tree=False,
    )
    require(record["provenance"]["repository"] == repository, "external namespace mismatch")
    require(not validate(record, _structural=True), f"invalid external record: {ident}")
    return record, {
        "repository": repository,
        "delivery_revision": delivery,
        "record_path": path,
        "record_blob_oid": git(root, "rev-parse", f"{delivery}:{path}"),
        "record_sha256": digest(data),
        "id": ident,
        "revision_id": revision,
    }


def load_external(principia_root, astrolabe_root):
    p_migration = strict_json(git(principia_root, "show", f"{PRINCIPIA_DELIVERY}:research/wide-binary/migration.json", binary=True))
    p_refs = [p_migration["protocol"], *p_migration["phases"]["freeze"]["claims"]]
    a_manifest = strict_json(git(astrolabe_root, "show", f"{ASTROLABE_DELIVERY}:research/datasets/wide-binary-chain-manifest.json", binary=True))
    a_refs = [r for r in a_manifest["references"] if r["repository"] == "astrolabe"]
    p_index = external_index(principia_root, PRINCIPIA_DELIVERY)
    a_index = external_index(astrolabe_root, ASTROLABE_DELIVERY)
    records, pins = [], []
    for ref in p_refs:
        record, pin = external_record("principia", principia_root, PRINCIPIA_DELIVERY, p_index,
                                      ref["id"], ref["revision_id"])
        records.append(record); pins.append(pin)
    for ref in a_refs:
        record, pin = external_record("astrolabe", astrolabe_root, ASTROLABE_DELIVERY, a_index,
                                      ref["id"], ref["revision_id"])
        records.append(record); pins.append(pin)
    documents = [blob_pin(principia_root, PRINCIPIA_DELIVERY, path)
                 for path in EXTERNAL_DOCUMENTS["principia"]]
    documents += [blob_pin(astrolabe_root, ASTROLABE_DELIVERY, path)
                  for path in EXTERNAL_DOCUMENTS["astrolabe"]]
    return (records, pins, p_migration["protocol"],
            p_migration["phases"]["freeze"]["claims"], a_refs, documents)


def load_cached_external():
    directory = ROOT / AUTHORITY
    manifest_path = directory / "migration.json"
    require(manifest_path.is_file(), "exact sibling checkouts are required to create the initial external snapshot cache")
    manifest = strict_json(manifest_path.read_bytes())
    chain = manifest["wide_binary"]
    records = [strict_json(path.read_bytes()) for path in sorted((directory / "external").glob("*.json"))]
    expected = {(row["id"], row["revision_id"]) for row in chain["external_pins"]}
    actual = {(row["id"], row["revision_id"]) for row in records}
    require(actual == expected and len(records) == len(actual), "external snapshot cache is incomplete or ambiguous")
    for record in records:
        require(not validate(record, _structural=True), f"invalid cached external record: {record.get('id')}")
    return (records, chain["external_pins"], chain["protocol"], chain["claims"],
            chain["inputs"], chain["external_documents"])


def source_unit_summary(report):
    grouped = defaultdict(list)
    for unit in report["inventory"]:
        grouped[unit["path"]].append({
            "selector": unit["selector"],
            "value_sha256": digest(canonical(unit["raw"])),
        })
    return {
        path: {"unit_count": len(units), "unit_map_sha256": digest(canonical(units))}
        for path, units in grouped.items()
    }


def supporting_paths(root, catalogs):
    roles = {}
    for path, raw in catalogs:
        entry = (root / path).parent / raw["entry"]
        require(entry.is_file(), f"catalog entry is missing: {entry.relative_to(root)}")
        roles[entry.relative_to(root).as_posix()] = "apparatus-entry"
    for path in sorted((root / "lab/sims").glob("**/*")):
        if not path.is_file() or path.suffix.lower() not in {".png", ".parquet", ".csv"}:
            continue
        relative = path.relative_to(root).as_posix()
        roles.setdefault(relative, "figure" if path.suffix.lower() == ".png" else "captured-data")
    comparison = root / "lab/sims/oscillating-electron-retarded-fields/assets/comparison.html"
    if comparison.is_file():
        roles[comparison.relative_to(root).as_posix()] = "comparison-view"
    return sorted(roles.items())


def baseline_source_report():
    """Import the immutable migration source from its own historical checkout."""
    with tempfile.TemporaryDirectory(prefix="orrery-research-baseline-") as parent:
        checkout = Path(parent) / "source"
        git(ROOT.parent, "clone", "--no-hardlinks", str(ROOT), str(checkout))
        git(checkout, "checkout", "--detach", BASELINE)
        report = import_source(checkout, "orrery", "orrery", expected_revision=BASELINE)
        catalogs = []
        for item in report["files"]:
            path = item["path"]
            if Path(path).name == "sim.json":
                catalogs.append((path, strict_json((checkout / path).read_bytes())))
        return report, supporting_paths(checkout, catalogs)


def require_live_source_matches_baseline(baseline_report, baseline_supporting):
    """Reject live selected-source or supporting-artifact drift before rebuilding."""
    live_report = import_source(ROOT, "orrery", "orrery")
    baseline_paths = [item["path"] for item in baseline_report["files"]]
    live_paths = [item["path"] for item in live_report["files"]]
    require(live_paths == baseline_paths, "source inventory differs from migration baseline")
    require(source_unit_summary(live_report) == source_unit_summary(baseline_report),
            "source selector inventory differs from migration baseline")
    for item in baseline_report["files"]:
        path = item["path"]
        require((ROOT / path).read_bytes() == git(ROOT, "show", f"{BASELINE}:{path}", binary=True),
                f"source drift from migration baseline: {path}")
    live_catalogs = [(item["path"], strict_json((ROOT / item["path"]).read_bytes()))
                     for item in live_report["files"] if Path(item["path"]).name == "sim.json"]
    require(supporting_paths(ROOT, live_catalogs) == baseline_supporting,
            "supporting artifact inventory differs from migration baseline")
    return baseline_report


def build(principia_root, astrolabe_root):
    baseline_report, baseline_supporting = baseline_source_report()
    report = require_live_source_matches_baseline(baseline_report, baseline_supporting)
    unit_summary = source_unit_summary(report)
    source_files = []
    catalogs, captures = [], []
    for item in sorted(report["files"], key=lambda row: row["path"]):
        path = item["path"]
        data = (ROOT / path).read_bytes()
        require(data == git(ROOT, "show", f"{BASELINE}:{path}", binary=True), f"source drift from migration baseline: {path}")
        raw = strict_json(data)
        kind = "catalog" if Path(path).name == "sim.json" else "captured-result"
        row = {
            "path": path,
            "kind": kind,
            "sha256": digest(data),
            "bytes": len(data),
            "blob_oid": git(ROOT, "rev-parse", f"{BASELINE}:{path}"),
            **unit_summary[path],
        }
        source_files.append(row)
        (catalogs if kind == "catalog" else captures).append((path, raw))

    records = []
    by_source = {}
    for path, raw in catalogs:
        status = raw.get("status") if raw.get("status") in {"active", "paused", "retired", "resolved"} else "unknown"
        record = make_record(
            "orrery", "program", raw["slug"],
            {"role": "program", "title": raw.get("title") or raw["slug"]},
            provenance(path, (ROOT / path).read_bytes()),
            legacy={"source_path": path, "source_sha256": digest((ROOT / path).read_bytes()),
                    "catalog_status": raw.get("status"), "catalog_is_execution": False},
            activity=status, scope="simulation-under-assumptions",
            limitations=["Catalog describes runnable apparatus; it is not an execution or scientific verdict."],
            missingness=[] if status != "unknown" else ["activity-mapping"],
        )
        finish_record(record, [raw["slug"], path])
        records.append(record); by_source[path] = record

    anonymous = defaultdict(list)
    for path, raw in captures:
        data = (ROOT / path).read_bytes()
        legacy_alias = digest((digest(data) + "$").encode()).split(":", 1)[1]
        anonymous[legacy_alias].append(path)
        record = make_record(
            "orrery", "artifact", f"captured-result:{path}",
            {"role": "result", "availability": "available", "snapshot_digest": digest(data),
             "locator": path, "media_type": "application/json"},
            provenance(path, data),
            legacy={"source_path": path, "source_selector": "$", "source_sha256": digest(data),
                    "legacy_anonymous_alias": legacy_alias,
                    "execution_mapping": "explicit" if path.startswith("lab/sims/wide-binary-") else "artifact-only"},
            activity="unknown", scope="simulation-under-assumptions",
            limitations=["Captured result bytes are retained; no distinct execution or verdict is inferred unless explicitly mapped."],
            missingness=["activity", "execution-identity"],
        )
        selector_alias = f"{path}#$"
        finish_record(record, [path, selector_alias])
        records.append(record); by_source[path] = record

    supporting = []
    for path, scientific_role in supporting_paths(ROOT, catalogs):
        data = (ROOT / path).read_bytes()
        require(data == git(ROOT, "show", f"{BASELINE}:{path}", binary=True),
                f"supporting artifact drift from migration baseline: {path}")
        role = "source" if scientific_role == "apparatus-entry" else "result"
        media = mimetypes.guess_type(path)[0] or "application/octet-stream"
        record = make_record(
            "orrery", "artifact", f"support:{path}",
            {"role": role, "availability": "available", "snapshot_digest": digest(data),
             "locator": path, "media_type": media},
            provenance(path, data),
            legacy={"source_path": path, "scientific_role": scientific_role},
            activity="unknown", scope="simulation-under-assumptions",
            limitations=["Presentation/output artifact; digest does not establish a scientific verdict."],
            missingness=["activity"],
        )
        finish_record(record, [path])
        records.append(record)
        supporting.append({"path": path, "scientific_role": scientific_role,
                           "availability": "available", "sha256": digest(data),
                           "record": reference(record, "resolved")})

    if principia_root.is_dir() and astrolabe_root.is_dir():
        (external, external_pins, protocol_lead, claim_leads,
         input_leads, external_documents) = load_external(principia_root, astrolabe_root)
    else:
        (external, external_pins, protocol_lead, claim_leads,
         input_leads, external_documents) = load_cached_external()
    ext_by_id = {r["id"]: r for r in external}
    protocol = ext_by_id[protocol_lead["id"]]
    claims = [ext_by_id[lead["id"]] for lead in claim_leads]
    inputs = [ext_by_id[lead["id"]] for lead in input_leads]
    protocol_ref = reference(protocol, "resolved")
    claim_refs = [reference(record, "resolved") for record in claims]
    input_refs = [reference(record, "resolved") for record in inputs]

    original_path = "lab/sims/wide-binary-selection-bias/assets/results.json"
    diagnosis_path = "lab/sims/wide-binary-control-diagnosis/assets/results.json"
    original_raw = strict_json((ROOT / original_path).read_bytes())
    diagnosis_raw = strict_json((ROOT / diagnosis_path).read_bytes())
    original_pin = blob_pin(ROOT, ORIGINAL_RUN, original_path)
    diagnosis_pin = blob_pin(ROOT, DIAGNOSIS_RUN, diagnosis_path)
    require(original_pin["sha256"] == digest((ROOT / original_path).read_bytes()), "original result changed after its historical run")
    require(diagnosis_pin["sha256"] == digest((ROOT / diagnosis_path).read_bytes()), "diagnosis result changed after its historical run")

    def run_record(alias, path, raw, historical_pin, controls, deviations, extra_refs):
        result_ref = reference(by_source[path], "resolved")
        payload = {"execution_status": "completed", "controls": controls,
                   "protocol": protocol_ref, "result_artifacts": [result_ref]}
        code_path = str(Path(path).parents[1] / "main.py")
        code_pin = blob_pin(ROOT, historical_pin["git_revision"], code_path)
        legacy = {
            "source_path": path,
            "source_selector": "$",
            "historical_result_pin": historical_pin,
            "code": code_pin,
            "environment": raw.get("environment", "unknown"),
            "invocation": raw.get("rerun_commands", "unknown"),
            "run_date": raw.get("run_date"),
            "deviations": deviations,
            "historical_inputs": [
                {"reference": reference(record, "resolved"),
                 "availability": record["payload"]["availability"],
                 "historical_consumption": (record.get("legacy") or {}).get("historical_consumption", "unknown")}
                for record in inputs
            ],
            "scientific_assessment": "pending",
        }
        record = make_record(
            "orrery", "experiment", alias, payload,
            provenance(path, (ROOT / path).read_bytes()), legacy=legacy,
            activity="resolved", scope="synthetic-calibration",
            limitations=[LIMIT, "Historical execution has no native start receipt and cannot establish primary confirmation."],
            missingness=["native-start-receipt", "independent-prospective-freeze-evidence"],
        )
        finish_record(record, [alias, path + "#$"], references=[*claim_refs, *input_refs, *extra_refs])
        return record

    original_deviations = [
        f"Protocol declared {original_raw['protocol_matrix_arithmetic']['declared_in_protocol_text']} realizations but enumerated {original_raw['protocol_matrix_arithmetic']['enumerated_by_12_frozen_rows']}; unchanged.",
        "Frozen controls failed; the historical unresolved verdict is unchanged.",
    ]
    original = run_record("wide-binary-selection-bias:2026-09-05", original_path, original_raw,
                          original_pin, "failed", original_deviations, [])
    records.append(original)
    diagnosis_deviations = [row["detail"] for row in diagnosis_raw["protocol_deviations_recorded"]]
    diagnosis = run_record("wide-binary-control-diagnosis:2026-09-05", diagnosis_path, diagnosis_raw,
                           diagnosis_pin, "not-applicable", diagnosis_deviations,
                           [reference(original, "resolved")])
    records.append(diagnosis)

    outputs = {record_path(record): encoded(record) for record in records}
    require(len(outputs) == len(records), "record file collision")
    external_outputs = {}
    for record in external:
        path = f"external/{record['provenance']['repository']}-{record['kind']}-{record['revision_id'].split(':')[1]}.json"
        require(path not in external_outputs, "external snapshot collision")
        external_outputs[path] = encoded(record)
    outputs.update(external_outputs)

    record_rows = [{"path": record_path(r), "id": r["id"], "revision_id": r["revision_id"],
                    "source_path": (r.get("legacy") or {}).get("source_path"),
                    "sha256": digest(encoded(r))} for r in records]
    collisions = [{"legacy_anonymous_alias": alias, "sources": paths,
                   "resolution": "Each source/selector has a distinct path-qualified artifact identity; no winner selected."}
                  for alias, paths in sorted(anonymous.items()) if len(paths) > 1]
    manifest = {
        "schema_version": 1,
        "migration": "ORB-11393",
        "authority": {
            "legacy_fields": "lab/sims/**/sim.json and captured JSON source bytes",
            "research_mapping": "research/catalog/migration.json plus generated records/",
            "gallery_projection": "lab/gallery/index.html generated only from sim.json",
            "rule": "Never edit a generated record or gallery copy independently; change its owning source and regenerate.",
        },
        "framework": {"version": "0.2.0", "git_revision": FRAMEWORK, "record_contract": 1},
        "source_revision": BASELINE,
        "inventory": {
            "json_sources": len(source_files), "catalogs": len(catalogs),
            "captured_results": len(captures), "units": report["counts"]["discovered"],
            "files": source_files,
        },
        "records": record_rows,
        "supporting_artifacts": supporting,
        "anonymous_collisions": collisions,
        "anonymous_collision_sources": sum(len(row["sources"]) for row in collisions),
        "wide_binary": {
            "protocol": protocol_ref,
            "claims": claim_refs,
            "original_run": reference(original, "resolved"),
            "diagnosis_run": reference(diagnosis, "resolved"),
            "inputs": input_refs,
            "external_deliveries": {"principia": PRINCIPIA_DELIVERY, "astrolabe": ASTROLABE_DELIVERY},
            "external_pins": external_pins,
            "external_documents": external_documents,
            "limits": [
                "Original failed controls and unresolved verdict are unchanged.",
                "Diagnosis deviations annotate later evidence; they do not rewrite the frozen protocol or original run.",
                "Four historical Astrolabe datasets remain missing and historical consumption remains unknown.",
                "No assessment record is emitted; this migration cannot imply confirmation.",
            ],
        },
        "rollback": "Consumer/gallery cutover may be reverted while immutable records remain; rollback exports every legacy JSON byte unchanged.",
    }
    outputs["migration.json"] = encoded(manifest)
    owner_manifest = {
        "schema_version": 1, "kind": "manifest",
        "repositories": [{"id": "orrery", "git_revision": BASELINE}],
        "references": [reference(record, "resolved") for record in records],
    }
    outputs["owner-manifest.json"] = encoded(owner_manifest)
    cross_records = [original, diagnosis, *claims, protocol, *inputs]
    cross_manifest = {
        "schema_version": 1, "kind": "manifest",
        "repositories": [
            {"id": "orrery", "git_revision": BASELINE},
            {"id": "principia", "git_revision": PRINCIPIA_DELIVERY},
            {"id": "astrolabe", "git_revision": ASTROLABE_DELIVERY},
        ],
        "references": [reference(record, "resolved") for record in cross_records],
    }
    outputs["wide-binary-chain-manifest.json"] = encoded(cross_manifest)

    targets = records + external
    for record in records:
        errors = validate(record, _structural=True)
        require(not errors, f"record validation {record['id']}: {'; '.join(errors)}")
    for record in (original, diagnosis):
        errors = validate(record, targets=[r for r in targets if r is not record])
        require(not errors, f"chain validation {record['id']}: {'; '.join(errors)}")
    for document in (owner_manifest, cross_manifest):
        errors = validate(document, targets=targets)
        require(not errors, "manifest validation: " + "; ".join(errors))
    require(sum(len(row["sources"]) for row in collisions) == 8,
            "expected eight explicitly disambiguated anonymous collision sources")
    return outputs


def read_outputs(directory):
    return {p.relative_to(directory).as_posix(): p.read_bytes()
            for p in sorted(directory.rglob("*")) if p.is_file()}


def write_new(outputs, destination):
    destination = Path(destination).resolve()
    require(not destination.exists(), "output already exists")
    require(not destination.is_relative_to(ROOT), "isolated migration output must be outside the checkout")
    destination.mkdir(parents=True, exist_ok=True)
    for relative, data in outputs.items():
        path = destination / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)


def refresh(outputs):
    destination = ROOT / AUTHORITY
    if destination.exists():
        marker = destination / "migration.json"
        require(marker.is_file() and json.loads(marker.read_text()).get("migration") == "ORB-11393",
                "refusing to replace an unrecognized authority directory")
        for path in sorted((p for p in destination.rglob("*") if p.is_file()), reverse=True):
            if path.relative_to(destination).as_posix() not in outputs:
                path.unlink()
    destination.mkdir(parents=True, exist_ok=True)
    for relative, data in outputs.items():
        path = destination / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_name("." + path.name + ".new")
        temporary.write_bytes(data)
        temporary.replace(path)


def check(outputs, authority):
    authority = Path(authority).resolve()
    actual = read_outputs(authority)
    require(set(actual) == set(outputs), "authority file inventory differs from deterministic migration")
    for path, expected in outputs.items():
        require(actual[path] == expected, f"authority drift: {path}")
    return json.loads(outputs["migration.json"])


def rollback(outputs, destination):
    destination = Path(destination).resolve()
    require(not destination.exists(), "rollback output already exists")
    require(not destination.is_relative_to(ROOT), "rollback output must be outside the checkout")
    check(outputs, ROOT / AUTHORITY)
    destination.mkdir(parents=True)
    manifest = json.loads(outputs["migration.json"])
    for item in manifest["inventory"]["files"]:
        target = destination / item["path"]
        target.parent.mkdir(parents=True, exist_ok=True)
        data = (ROOT / item["path"]).read_bytes()
        require(digest(data) == item["sha256"], "legacy source changed during rollback")
        target.write_bytes(data)


def verify_history(manifest, principia_root, astrolabe_root):
    require(principia_root.is_dir() and astrolabe_root.is_dir(),
            "verify-history requires explicit readable Principia and Astrolabe checkouts")
    for pin in manifest["wide_binary"]["external_pins"]:
        root = principia_root if pin["repository"] == "principia" else astrolabe_root
        require(blob_pin(root, pin["delivery_revision"], pin["record_path"])["sha256"] == pin["record_sha256"],
                f"external record bytes changed: {pin['record_path']}")
    for pin in manifest["wide_binary"]["external_documents"]:
        root = principia_root if pin["repository"] == "principia" else astrolabe_root
        require(blob_pin(root, pin["git_revision"], pin["path"])["sha256"] == pin["sha256"],
                f"external manifest bytes changed: {pin['path']}")
    for name, revision, path in [
        ("orrery", ORIGINAL_RUN, "lab/sims/wide-binary-selection-bias/assets/results.json"),
        ("orrery", DIAGNOSIS_RUN, "lab/sims/wide-binary-control-diagnosis/assets/results.json"),
    ]:
        require(blob_pin(ROOT, revision, path)["sha256"] == digest((ROOT / path).read_bytes()),
                f"historical {name} source differs: {path}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["refresh", "check", "migrate", "rollback", "verify-history"])
    parser.add_argument("--output", type=Path)
    parser.add_argument("--authority", type=Path, default=ROOT / AUTHORITY)
    parser.add_argument("--principia-root", type=Path, default=sibling_checkout("principia"))
    parser.add_argument("--astrolabe-root", type=Path, default=sibling_checkout("astrolabe"))
    args = parser.parse_args()
    package_check()
    principia = args.principia_root.resolve()
    astrolabe = args.astrolabe_root.resolve()
    outputs = build(principia, astrolabe)
    if args.command == "refresh":
        refresh(outputs)
        result = {"authority": str(ROOT / AUTHORITY)}
    elif args.command == "check":
        manifest = check(outputs, args.authority)
        result = {"catalogs": manifest["inventory"]["catalogs"],
                  "captured_results": manifest["inventory"]["captured_results"],
                  "units": manifest["inventory"]["units"],
                  "records": len(manifest["records"]),
                  "anonymous_collision_sources": manifest["anonymous_collision_sources"]}
    elif args.command == "migrate":
        require(args.output is not None, "migrate requires --output")
        write_new(outputs, args.output)
        result = {"output": str(args.output), "files": len(outputs)}
    elif args.command == "rollback":
        require(args.output is not None, "rollback requires --output")
        rollback(outputs, args.output)
        result = {"output": str(args.output), "legacy_files": len(json.loads(outputs["migration.json"])["inventory"]["files"])}
    else:
        manifest = check(outputs, args.authority)
        verify_history(manifest, principia, astrolabe)
        result = {"verified": True, "external_records": len(manifest["wide_binary"]["external_pins"])}
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, subprocess.SubprocessError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        raise SystemExit(1)
