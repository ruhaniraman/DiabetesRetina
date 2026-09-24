"""Predictions of the DEPLOYED Stage 3 pipeline (retina crop + mirror averaging, the app's own MATLAB code) on the recorded APTOS splits.

    python validation/run_deployed_predictions.py     # writes results/deployed_<split>.csv (about 20 minutes, needs MATLAB)

Uses the full-resolution APTOS photographs (data/aptos2019_full/train_images, the competition originals), as a clinic would upload them.
The model is whatever stage_3/loadStage3Model.m loads, prepared at its own input size (net.Layers(1).InputSize).
The training split is the same 500-image sample the earlier runs used (ids taken from app_train_resize.csv).

The earlier results/app_<split>_<method>.csv files are the PREVIOUS model (224 px, trained on the 224 px copies in data/aptos2019/colored_images);
they are kept as the record of that model and of the preprocessing investigation in REPORT.md.
"""
import csv
from pathlib import Path

import matlab.engine

ROOT = Path(__file__).resolve().parent.parent
RES = ROOT / "validation" / "results"
APTOS = ROOT / "data" / "aptos2019_full" / "train_images"


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
        out = RES / f"deployed_{split}.csv"
        eng.predictFiles([str(APTOS / f"{i}.png") for i in ids], [label_of[i] for i in ids], out.as_posix(), ids, "crop_mirror", nargout=0)
        print("done", split, len(ids), flush=True)
    eng.quit()


if __name__ == "__main__":
    main()
