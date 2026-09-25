"""The app's Evidence page (frontend/src/data/evidence.json) must match the committed validation results."""
import json

import export_evidence


def test_the_committed_evidence_is_up_to_date():
    committed = json.loads(export_evidence.OUT.read_text(encoding="utf-8"))
    assert committed == export_evidence.build(), "Stale: run python validation/export_evidence.py"


def test_every_row_has_a_known_status_and_an_existing_source():
    for row in export_evidence.build():
        assert row["status"] in {"met", "partial", "gap"}
        assert (export_evidence.ROOT / row["source"]).exists(), row["source"]


def test_the_headline_targets_are_read_from_the_report():
    rows = {r["requirement"]: r for r in export_evidence.build()}
    assert rows["Referable DR sensitivity"]["status"] == "met" and "96.9%" in rows["Referable DR sensitivity"]["result"]
    assert rows["Referable DR specificity"]["status"] == "met" and "88.3%" in rows["Referable DR specificity"]["result"]
