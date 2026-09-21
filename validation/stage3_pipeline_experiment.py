"""Stage 3 input pipeline: does cropping the retina (and averaging with the mirror image) help, and why? (needs MATLAB; about 20 minutes)

Runs the deployed network with several ways of preparing the image, on
  * APTOS validation and test splits (the split the model was trained with; the test split is untouched by any tuning), and
  * IDRiD, all 516 photographs.
Methods: resize (today's app), crop, crop_mirror, and two IDRiD-only experiments that separate WHY cropping helps: pad (keep the wide frame,
pad to a square, no crop) and cropsquash (crop then stretch to a square).

    python validation/stage3_pipeline_experiment.py     # writes results/s3_<method>_<set>.csv
"""
import csv
from pathlib import Path

import matlab.engine

ROOT = Path(__file__).resolve().parent.parent
RES = ROOT / "validation" / "results"
APTOS = ROOT / "data" / "aptos2019" / "colored_images"
IDRID = ROOT / "data" / "idrid_grading" / "B. Disease Grading" / "B. Disease Grading" / "1. Original Images"


def sets():
    aptos = list(csv.DictReader(open(RES / "splits.csv", encoding="utf-8")))
    out = {f"aptos_{s}": [(r["id"], r["label"], APTOS / r["label"] / f"{r['id']}.png") for r in aptos if r["split"] == s] for s in ("validation", "test")}
    out["idrid"] = [(r["id"], r["label"], IDRID / ("a. Training Set" if r["split"] == "train" else "b. Testing Set") / f"{r['name']}.jpg")
                    for r in csv.DictReader(open(RES / "idrid_splits.csv", encoding="utf-8"))]
    return out


PLAN = {
    "aptos_validation": ["resize", "crop", "crop_mirror"],
    "aptos_test": ["resize", "crop", "crop_mirror"],
    "idrid": ["resize", "crop", "crop_mirror", "pad", "cropsquash"],
}


def main():
    data = sets()
    eng = matlab.engine.start_matlab()
    for rel in ["utils", "stage_3", "stage1_quality", "validation"]:
        eng.addpath(str(ROOT / rel), nargout=0)
    for name, methods in PLAN.items():
        items = data[name]
        for method in methods:
            out = RES / f"s3_{method}_{name}.csv"
            if out.exists():
                continue
            eng.predictFiles([str(p) for _, _, p in items], [l for _, l, _ in items], out.as_posix(), [i for i, _, _ in items], method, nargout=0)
            print("done", name, method, flush=True)
    eng.quit()


if __name__ == "__main__":
    main()
