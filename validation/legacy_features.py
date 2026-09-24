"""Per-photograph features from the RETIRED rule-based lesion detector (validation/legacy_overlay.py), for the benchmark's
"classical single technique" row (validation/benchmark.py).

    python validation/legacy_features.py        # CPU only, about 20-30 minutes for 1,262 photographs

Same photographs as lesionFeatures.m (Stage 3 validation + test splits of APTOS at full resolution, IDRiD validation + test).
Writes results/legacy_features.csv: id, dataset, split, label, and the region counts per type (0 when no retina is found).
"""
import csv
import sys
from multiprocessing import Pool
from pathlib import Path

import cv2

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "validation"))
import legacy_overlay  # noqa: E402


def one(row):
    img = cv2.imread(row["path"])
    try:
        _, counts = legacy_overlay.segment_lesions(img)
    except ValueError:
        counts = {"microaneurysms": 0, "hemorrhages": 0, "exudates": 0}
    return {"id": row["id"], "dataset": row["dataset"], "split": row["split"], "label": row["label"],
            "legacy_ma": counts["microaneurysms"], "legacy_he": counts["hemorrhages"], "legacy_ex": counts["exudates"]}


def main():
    rows = [r for r in csv.DictReader(open(ROOT / "stage_3" / "finetune" / "manifest.csv", encoding="utf-8"))
            if r["split"] in ("validation", "test") and r["dataset"] in ("aptos", "idrid")]
    with Pool(6) as pool:
        out = pool.map(one, rows, chunksize=8)
    with open(ROOT / "validation" / "results" / "legacy_features.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(out[0]))
        w.writeheader()
        w.writerows(out)
    print("wrote", len(out))


if __name__ == "__main__":
    main()
