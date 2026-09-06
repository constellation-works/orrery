from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts/research_records.py"


def run(*args, ok=True):
    return run_at(ROOT, *args, ok=ok)


def run_at(root, *args, ok=True):
    result = subprocess.run([sys.executable, str(root / "scripts/research_records.py"), *map(str, args)],
                            cwd=root, capture_output=True, text=True)
    if ok and result.returncode:
        raise AssertionError(result.stderr or result.stdout)
    return result


def git(root, *args):
    result = subprocess.run(["git", "-C", str(root), *args], capture_output=True, text=True)
    if result.returncode:
        raise AssertionError(result.stderr or result.stdout)
    return result.stdout.strip()


def load_checker(root):
    spec = importlib.util.spec_from_file_location("isolated_research_records", root / "scripts/research_records.py")
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class ResearchRecordMigrationTests(unittest.TestCase):
    def manifest(self):
        return json.loads((ROOT / "research/catalog/migration.json").read_text())

    def record(self, reference):
        manifest = self.manifest()
        row = next(item for item in manifest["records"]
                   if item["id"] == reference["id"] and item["revision_id"] == reference["revision_id"])
        return json.loads((ROOT / "research/catalog" / row["path"]).read_text())

    def test_authority_is_exact_and_complete(self):
        result = json.loads(run("check").stdout)
        self.assertEqual(result["catalogs"], 39)
        self.assertEqual(result["captured_results"], 44)
        self.assertEqual(result["units"], 16653)
        self.assertEqual(result["anonymous_collision_sources"], 8)

    def test_isolated_migration_is_byte_identical(self):
        with tempfile.TemporaryDirectory() as parent:
            output = Path(parent) / "migration"
            missing_p = Path(parent) / "no-principia"
            missing_a = Path(parent) / "no-astrolabe"
            run("migrate", "--output", output,
                "--principia-root", missing_p, "--astrolabe-root", missing_a)
            expected = {p.relative_to(ROOT / "research/catalog"): p.read_bytes()
                        for p in (ROOT / "research/catalog").rglob("*") if p.is_file()}
            actual = {p.relative_to(output): p.read_bytes()
                      for p in output.rglob("*") if p.is_file()}
            self.assertEqual(actual, expected)

    def test_rollback_restores_every_legacy_json_byte(self):
        with tempfile.TemporaryDirectory() as parent:
            output = Path(parent) / "legacy"
            result = json.loads(run("rollback", "--output", output).stdout)
            self.assertEqual(result["legacy_files"], 83)
            manifest = json.loads((ROOT / "research/catalog/migration.json").read_text())
            for item in manifest["inventory"]["files"]:
                self.assertEqual((output / item["path"]).read_bytes(),
                                 (ROOT / item["path"]).read_bytes())

    def test_tampered_authority_fails_closed(self):
        with tempfile.TemporaryDirectory() as parent:
            output = Path(parent) / "migration"
            run("migrate", "--output", output)
            path = output / "migration.json"
            path.write_bytes(path.read_bytes() + b" ")
            result = run("check", "--authority", output, ok=False)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("authority drift", result.stderr)

    def test_landed_migration_survives_head_advance_and_refuses_source_drift(self):
        with tempfile.TemporaryDirectory() as parent:
            checkout = Path(parent) / "orrery"
            git(ROOT.parent, "clone", "--no-hardlinks", str(ROOT), str(checkout))
            shutil.copyfile(SCRIPT, checkout / "scripts/research_records.py")
            git(checkout, "add", "scripts/research_records.py")
            git(checkout, "-c", "user.name=Research test", "-c", "user.email=test@example.invalid",
                "commit", "-m", "test: land research migration repair")
            marker = checkout / "post-migration-marker.txt"
            marker.write_text("unrelated commit proving HEAD may advance\n")
            git(checkout, "add", marker.name)
            git(checkout, "-c", "user.name=Research test", "-c", "user.email=test@example.invalid",
                "commit", "-m", "test: advance HEAD after research migration")

            self.assertEqual(json.loads(run_at(checkout, "check").stdout)["catalogs"], 39)
            checker = load_checker(checkout)
            baseline_report = checker.import_source(checkout, "orrery", "orrery")
            baseline_catalogs = [(item["path"], checker.strict_json((checkout / item["path"]).read_bytes()))
                                 for item in baseline_report["files"] if Path(item["path"]).name == "sim.json"]
            baseline_supporting = checker.supporting_paths(checkout, baseline_catalogs)

            source = checkout / "lab/sims/solar-system-nbody/sim.json"
            original = source.read_bytes()
            source.write_bytes(original + b" ")
            with self.assertRaisesRegex(ValueError, "source drift from migration baseline"):
                checker.require_live_source_matches_baseline(baseline_report, baseline_supporting)


    def test_source_addition_and_deletion_fail_closed(self):
        with tempfile.TemporaryDirectory() as parent:
            checkout = Path(parent) / "orrery"
            git(ROOT.parent, "clone", "--no-hardlinks", str(ROOT), str(checkout))
            shutil.copyfile(SCRIPT, checkout / "scripts/research_records.py")
            checker = load_checker(checkout)
            baseline_report = checker.import_source(checkout, "orrery", "orrery")
            baseline_catalogs = [(item["path"], checker.strict_json((checkout / item["path"]).read_bytes()))
                                 for item in baseline_report["files"] if Path(item["path"]).name == "sim.json"]
            baseline_supporting = checker.supporting_paths(checkout, baseline_catalogs)

            source = checkout / "lab/sims/solar-system-nbody/sim.json"
            added = checkout / "lab/sims/post-migration-added/sim.json"
            added.parent.mkdir()
            added.write_bytes(source.read_bytes())
            with self.assertRaisesRegex(ValueError, "source inventory differs"):
                checker.require_live_source_matches_baseline(baseline_report, baseline_supporting)
            added.unlink()
            added.parent.rmdir()

            source.unlink()
            with self.assertRaisesRegex(ValueError, "source inventory differs"):
                checker.require_live_source_matches_baseline(baseline_report, baseline_supporting)

    def test_wide_binary_failures_missingness_and_diagnosis_survive(self):
        chain = self.manifest()["wide_binary"]
        original = self.record(chain["original_run"])
        diagnosis = self.record(chain["diagnosis_run"])
        self.assertEqual(original["payload"]["controls"], "failed")
        self.assertEqual(original["legacy"]["scientific_assessment"], "pending")
        self.assertIn("44", original["legacy"]["deviations"][0])
        self.assertIn("47", original["legacy"]["deviations"][0])
        self.assertEqual(diagnosis["payload"]["controls"], "not-applicable")
        self.assertEqual(len(diagnosis["legacy"]["deviations"]), 4)
        self.assertEqual(sum(row["availability"] == "missing"
                             for row in original["legacy"]["historical_inputs"]), 4)
        self.assertTrue(all(row["historical_consumption"] == "unknown"
                            for row in original["legacy"]["historical_inputs"]))

    def test_every_catalog_entry_and_figure_is_available(self):
        manifest = self.manifest()
        supporting = manifest["supporting_artifacts"]
        self.assertEqual(sum(row["scientific_role"] == "apparatus-entry" for row in supporting), 39)
        self.assertEqual(sum(row["scientific_role"] == "figure" for row in supporting), 43)
        for row in supporting:
            self.assertEqual(row["availability"], "available")
            self.assertTrue((ROOT / row["path"]).is_file())


class NativeRegistrationTests(unittest.TestCase):
    def test_cancelled_fixture_registers_without_science(self):
        with tempfile.TemporaryDirectory() as parent:
            output = Path(parent) / "owner"
            result = subprocess.run(
                [sys.executable, str(ROOT / "scripts/native_registration_fixture.py"), str(output)],
                cwd=ROOT, capture_output=True, text=True,
            )
            if result.returncode:
                self.fail(result.stderr or result.stdout)
            summary = json.loads(result.stdout)
            self.assertEqual(summary["run_status"], "cancelled")
            self.assertEqual(summary["result_artifacts"], 0)
            self.assertEqual(summary["assessment_records"], 0)


if __name__ == "__main__":
    unittest.main()
