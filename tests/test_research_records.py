from __future__ import annotations

import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts/research_records.py"


def run(*args, ok=True):
    result = subprocess.run([sys.executable, str(SCRIPT), *map(str, args)],
                            cwd=ROOT, capture_output=True, text=True)
    if ok and result.returncode:
        raise AssertionError(result.stderr or result.stdout)
    return result


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
