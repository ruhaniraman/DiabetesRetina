"""Capture the Stage 4 (MATLAB) report wording for every scenario into docs/clinical_text_stage4.json.

The text lives in stage4_explainability/report/formatReportText.m. This script runs that real function for each case so
docs/CLINICAL_REVIEW.md shows exactly what a report says, not a paraphrase. Needs MATLAB. Re-run it whenever formatReportText.m changes:

    python docs/tools/export_stage4_text.py
"""
import hashlib
import io
import json
from pathlib import Path

import matlab.engine

ROOT = Path(__file__).resolve().parent.parent.parent
OUT = ROOT / "docs" / "clinical_text_stage4.json"
SOURCE = ROOT / "stage4_explainability" / "report" / "formatReportText.m"


def source_hash():
    """Hash of the MATLAB source with line endings normalised, so tests can tell when the captured text is stale."""
    return hashlib.sha256(SOURCE.read_bytes().replace(bytes([13, 10]), bytes([10]))).hexdigest()

# (label, predicted grade, confidence, referable probability, isReferable)
CASES = [
    ("No DR, high confidence, not flagged", "No_DR", 0.97, 0.03, False),
    ("Mild, high confidence, not flagged", "Mild", 0.95, 0.06, False),
    ("Mild grade but referral threshold reached (the escalation case)", "Mild", 0.62, 0.35, True),
    ("Moderate, high confidence, flagged", "Moderate", 0.96, 0.97, True),
    ("Moderate, moderate confidence, flagged", "Moderate", 0.81, 0.90, True),
    ("Moderate, low confidence, flagged", "Moderate", 0.52, 0.66, True),
    ("Severe, high confidence, flagged", "Severe", 0.95, 0.99, True),
    ("Proliferative, moderate confidence, flagged", "Proliferate_DR", 0.78, 0.93, True),
    ("Proliferative missed by the model (Mild grade, low referral score)", "Mild", 0.85, 0.02, False),
]


def main():
    eng = matlab.engine.start_matlab()
    for rel in ["utils", "stage_3", "stage4_explainability/core", "stage4_explainability/report"]:
        eng.addpath(str(ROOT / rel), nargout=0)
    rows = []
    for label, grade, conf, ref, flagged in CASES:
        out = io.StringIO()
        eng.eval(
            f"r = struct('predictedGrade','{grade}','confidence',{conf},'referableProb',{ref},"
            f"'isReferable',{'true' if flagged else 'false'},'threshold',0.2); "
            "t = formatReportText(r); disp(jsonencode(t));",
            nargout=0, stdout=out,
        )
        text = json.loads(out.getvalue().strip().splitlines()[-1])
        rows.append({"case": label, "grade": grade, "confidence": conf, "referableProb": ref, "isReferable": flagged, "text": text})
    eng.quit()
    OUT.write_text(json.dumps({"source_sha256": source_hash(), "cases": rows}, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"wrote {len(rows)} cases to {OUT}")
    for r in rows[:2]:
        print("\n==", r["case"], "\n", r["text"]["referralLine"])


if __name__ == "__main__":
    main()
