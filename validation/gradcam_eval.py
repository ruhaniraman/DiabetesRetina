"""Run validation/gradcam_eval.m on (a) held-out APTOS test photographs (full resolution) and (b) the 81 lesion-annotated IDRiD photographs
(needs MATLAB; about 30 minutes). Uses the deployed model (stage_3/loadStage3Model.m). Delete results/gradcam_*.mat to re-run.

    python validation/gradcam_eval.py           # writes results/gradcam_aptos.mat and results/gradcam_idrid_seg.mat
    python validation/analyze_gradcam.py        # summarises them
"""
import csv
import random
from pathlib import Path

import matlab.engine

ROOT = Path(__file__).resolve().parent.parent
RES = ROOT / "validation" / "results"
APTOS = ROOT / "data" / "aptos2019_full" / "train_images"
SEG = ROOT / "data" / "idrid_segmentation" / "A. Segmentation" / "A. Segmentation" / "1. Original Images"


def aptos_sample(n_referable=60, n_healthy=30):
    rows = [r for r in csv.DictReader(open(RES / "splits.csv", encoding="utf-8")) if r["split"] == "test"]
    rng = random.Random(1)
    ref = [r for r in rows if r["label"] in ("Moderate", "Severe", "Proliferate_DR")]
    non = [r for r in rows if r["label"] == "No_DR"]
    pick = rng.sample(ref, n_referable) + rng.sample(non, n_healthy)
    return [str(APTOS / f"{r['id']}.png") for r in pick], [r["label"] for r in pick]


def idrid_segmentation_images():
    paths = sorted(list((SEG / "a. Training Set").glob("*.jpg")) + list((SEG / "b. Testing Set").glob("*.jpg")))
    return [str(p) for p in paths], [("train" if "Training" in str(p) else "test") for p in paths]


def main():
    eng = matlab.engine.start_matlab()
    for rel in ["utils", "stage_3", "stage1_quality", "stage4_explainability/core", "validation"]:
        eng.addpath(str(ROOT / rel), nargout=0)
    for name, (paths, labels) in {"aptos": aptos_sample(), "idrid_seg": idrid_segmentation_images()}.items():
        out = RES / f"gradcam_{name}.mat"
        if not out.exists():
            eng.gradcam_eval(paths, labels, out.as_posix(), nargout=0)
        print("done", name, flush=True)
    eng.quit()


if __name__ == "__main__":
    main()
