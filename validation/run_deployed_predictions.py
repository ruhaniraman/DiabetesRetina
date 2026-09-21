"""Predictions of the DEPLOYED pipeline (retina crop + mirror averaging, the app's own MATLAB code) on the recorded APTOS splits.

    python validation/run_deployed_predictions.py     # writes results/app_<split>_cropmirror.csv (about 15 minutes, needs MATLAB)

The training split is the same 500-image sample the earlier runs used (ids taken from app_train_resize.csv).
"""
import csv
from pathlib import Path

import matlab.engine

ROOT = Path(__file__).resolve().parent.parent
RES = ROOT / "validation" / "results"
APTOS = ROOT / "data" / "aptos2019" / "colored_images"


def main():
    splits = list(csv.DictReader(open(RES / "splits.csv", encoding="utf-8")))
    label_of = {r["id"]: r["label"] for r in splits}
    plan = {
        "validation": [r["id"] for r in splits if r["split"] == "validation"],
        "test": [r["id"] for r in splits if r["split"] == "test"],
        "train": [r["id"] for r in csv.DictReader(open(RES / "app_train_resize.csv", encoding="utf-8"))],
    }
    eng = matlab.engine.start_matlab()
    for rel in ["utils", "stage_3", "stage1_quality", "validation"]:
        eng.addpath(str(ROOT / rel), nargout=0)
    for split, ids in plan.items():
        out = RES / f"app_{split}_cropmirror.csv"
        eng.predictFiles([str(APTOS / label_of[i] / f"{i}.png") for i in ids], [label_of[i] for i in ids], out.as_posix(), ids, "crop_mirror", nargout=0)
        print("done", split, len(ids), flush=True)
    eng.quit()


if __name__ == "__main__":
    main()
