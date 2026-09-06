#!/usr/bin/env python3
"""Exercise native CLI run registration in a disposable synthetic owner.

The fixture registers and cancels a metadata-only run.  It executes no model,
produces no scientific result artifact, and emits no assessment.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timedelta, timezone
from hashlib import sha256
import json
from pathlib import Path
import subprocess
import sys
import time


def git(root, *args):
    return subprocess.check_output(["git", "-C", str(root), *args], text=True).strip()


def cli(root, command, *args):
    argv = [sys.executable, "-m", "orbit_research", command]
    if command not in {"validate"}:
        argv += ["--owner-root", str(root), "--repository", "orrery-fixture"]
    result = subprocess.run([*argv, *args], capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(result.stderr or result.stdout)
    return json.loads(result.stdout)


def commit(root, message):
    git(root, "add", "research/records")
    git(root, "-c", "user.name=Orrery fixture", "-c", "user.email=fixture@example.invalid",
        "commit", "-qm", message)


def publish(root, record):
    commit(root, "register synthetic metadata")
    return cli(root, "ref", "--id", record["id"], "--revision", record["revision_id"],
               "--source-revision", git(root, "rev-parse", "HEAD"))


def append(root, sequence, operation, ident, payload, *, expected=(), references=()):
    request = {
        "request_id": f"orrery-fixture-{sequence}",
        "id": ident,
        "scope": "synthetic-calibration",
        "payload": payload,
        "expected_heads": list(expected),
        "reason": "Disposable metadata registration fixture; no experiment is executed.",
        "orbit_links": [{"host": "fixture-host", "workspace": "ws_fixture",
                         "task": "ORB-fixture", "run": "jrun-fixture"}],
        "references": list(references),
        "limitations": ["Synthetic metadata-only fixture; cancelled before execution."],
    }
    path = root / "requests" / f"{sequence:02d}-{operation}.json"
    path.write_text(json.dumps(request, indent=2) + "\n")
    first = cli(root, operation, "--request", str(path))
    second = cli(root, operation, "--request", str(path))
    if first != second:
        raise RuntimeError("native request was not idempotent")
    return first


def run(destination):
    root = destination.resolve()
    root.mkdir(parents=True, exist_ok=False)
    (root / "requests").mkdir()
    (root / "fixture.py").write_text("# Metadata fixture only; intentionally never executed.\n")
    (root / "seed-plan.json").write_text('{"seeds":[42],"purpose":"registration-only"}\n')
    git(root, "init", "-q")
    git(root, "add", "fixture.py", "seed-plan.json")
    git(root, "-c", "user.name=Orrery fixture", "-c", "user.email=fixture@example.invalid",
        "commit", "-qm", "synthetic fixture apparatus")
    code = {"repository": "orrery-fixture", "git_revision": git(root, "rev-parse", "HEAD")}

    program = append(root, 1, "program", "synthetic-registration",
                     {"role": "program", "title": "Synthetic run registration fixture",
                      "question": "Can metadata be registered and cancelled without executing science?"})
    program_ref = publish(root, program)
    claim = append(root, 2, "claim", "registration-only",
                   {"role": "hypothesis", "statement": "Native registration preserves a cancelled run receipt.",
                    "domain": "model"}, references=[program_ref])
    claim_ref = publish(root, claim)
    seed_bytes = (root / "seed-plan.json").read_bytes()
    seed = append(root, 3, "artifact", "seed-plan",
                  {"role": "dataset", "availability": "available",
                   "snapshot_digest": "sha256:" + sha256(seed_bytes).hexdigest(),
                   "locator": "seed-plan.json", "media_type": "application/json"})
    seed_ref = publish(root, seed)

    # Leave room for a cold installed CLI import before the framework observes
    # its own registration timestamp; then wait only the remainder before start.
    boundary = (datetime.now(timezone.utc) + timedelta(seconds=2)).isoformat()
    semantic = {
        "question": "Can the registration API capture a cancelled synthetic run?",
        "assumptions": "Metadata-only fixture; fixture.py is never executed.",
        "analysis": "Inspect immutable receipts only.",
        "exclusions": "No scientific measurements or assessments.",
        "stopping_rule": "Cancel immediately after registering the start receipt.",
        "claims": [claim_ref], "inputs": [seed_ref], "code": code,
        "holdout": {"digest": seed["payload"]["snapshot_digest"],
                    "information_cutoff": "2026-01-01T00:00:00Z",
                    "evaluation_not_before": boundary,
                    "policy": "Use only the committed synthetic seed-plan metadata."},
        "design": {"kind": "synthetic", "samples": {"total": 1, "groups": [{"name": "fixture", "count": 1}]},
                   "baseline": "No execution", "controls": ["registration"],
                   "resource_budget": {"planned": 1, "limit": 1, "unit": "metadata receipt"},
                   "decision": {"metric": "receipt validation", "operator": ">=", "threshold": 1,
                                "attainable_min": 0, "attainable_max": 1}},
    }
    protocol = append(root, 4, "preregister", "synthetic-registration-protocol", {"semantic": semantic})
    protocol_ref = publish(root, protocol)
    time.sleep(max(0, (datetime.fromisoformat(boundary) - datetime.now(timezone.utc)).total_seconds()))

    def run_payload(status, start=None):
        return {"execution_status": status, "controls": "not-run",
                "control_results": {"registration": "not-run"}, "protocol": protocol_ref,
                "result_artifacts": [], "inputs": [seed_ref], "code": code,
                "environment": {"fixture": True, "python": sys.version.split()[0]},
                "invocation": ["not-executed", "fixture.py"], "deviations": [],
                "start": start, "holdout_digest": semantic["holdout"]["digest"]}

    started = append(root, 5, "begin-run", "synthetic-cancelled-run", run_payload("running"))
    started_ref = publish(root, started)
    cancelled = append(root, 6, "record-run", "synthetic-cancelled-run",
                       run_payload("cancelled", started_ref), expected=[started["revision_id"]])
    publish(root, cancelled)
    export_path = root / "export.json"
    exported = cli(root, "export", "--source-revision", git(root, "rev-parse", "HEAD"),
                   "--output", str(export_path))
    valid = cli(root, "validate", str(export_path))
    if not valid["valid"]:
        raise RuntimeError("native fixture export did not validate")
    document = json.loads(export_path.read_text())
    if any(r["kind"] == "assessment" for r in document["records"]):
        raise RuntimeError("registration fixture must not create an assessment")
    return {"owner": str(root), "records": len(document["records"]),
            "run_status": cancelled["payload"]["execution_status"],
            "result_artifacts": len(cancelled["payload"]["result_artifacts"]),
            "assessment_records": 0, "export": exported}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()
    print(json.dumps(run(args.destination), sort_keys=True))


if __name__ == "__main__":
    main()
