"""Two questions about full-resolution uploads, answered with the IDRiD photographs (needs MATLAB; about 5 minutes).

  1. Why does the classifier over-refer on IDRiD? Hypothesis: shrunk to 224 px, IDRiD photographs carry less fine detail than the
     APTOS images it was trained on, and (see degradation_experiment.py) blurred images are over-referred. If so, ways of shrinking that
     keep more fine detail should raise specificity. Diagnostic only: nothing here changes the app.
  2. Does heavy JPEG compression really wreck grading? The degradation experiment compressed AFTER shrinking to 224 px, which is
     harsher than a real upload (compressed at full size, then shrunk, which averages the artifacts away). Here JPEG is applied at
     native resolution first.

    python validation/downscale_experiment.py      # writes results/idrid_variant_<name>.csv
"""
import csv
import tempfile
from pathlib import Path

import cv2
import matlab.engine
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
RESULTS = ROOT / "validation" / "results"
BASE = ROOT / "data" / "idrid_grading" / "B. Disease Grading" / "B. Disease Grading" / "1. Original Images"
JPEG_SUBSET = 120       # images used for the native-resolution JPEG question (same images for its own baseline)


def unsharp(img, sigma, amount):
    blur = cv2.GaussianBlur(img, (0, 0), sigma)
    return cv2.addWeighted(img, 1 + amount, blur, -amount, 0)


VARIANTS = {
    # name: function(native_bgr) -> 224x224 bgr
    "area": lambda x: cv2.resize(x, (224, 224), interpolation=cv2.INTER_AREA),
    "lanczos": lambda x: cv2.resize(x, (224, 224), interpolation=cv2.INTER_LANCZOS4),
    "linear_noAA": lambda x: cv2.resize(x, (224, 224), interpolation=cv2.INTER_LINEAR),
    "nearest": lambda x: cv2.resize(x, (224, 224), interpolation=cv2.INTER_NEAREST),
    "area_unsharp": lambda x: unsharp(cv2.resize(x, (224, 224), interpolation=cv2.INTER_AREA), 1.2, 1.0),
    "area_unsharp_strong": lambda x: unsharp(cv2.resize(x, (224, 224), interpolation=cv2.INTER_AREA), 1.2, 2.0),
}


def main():
    items = [(r["id"], r["label"], r["split"]) for r in csv.DictReader(open(RESULTS / "idrid_splits.csv", encoding="utf-8"))]
    rng = np.random.default_rng(5)
    subset = set(rng.choice(len(items), size=JPEG_SUBSET, replace=False).tolist())

    with tempfile.TemporaryDirectory(prefix="idrid_variants_") as tmp:
        tmp = Path(tmp)
        for name in list(VARIANTS) + ["subset_area", "subset_jpeg20_native", "subset_jpeg60_native"]:
            (tmp / name).mkdir()
        for k, (image_id, label, split) in enumerate(items):
            folder = "a. Training Set" if split == "train" else "b. Testing Set"
            native = cv2.imread(str(BASE / folder / f"{image_id}.jpg"))
            for name, fn in VARIANTS.items():
                cv2.imwrite(str(tmp / name / f"{image_id}.png"), fn(native))
            if k in subset:
                cv2.imwrite(str(tmp / "subset_area" / f"{image_id}.png"), VARIANTS["area"](native))
                for q in (20, 60):
                    coded = cv2.imdecode(cv2.imencode(".jpg", native, [cv2.IMWRITE_JPEG_QUALITY, q])[1], cv2.IMREAD_COLOR)
                    cv2.imwrite(str(tmp / f"subset_jpeg{q}_native" / f"{image_id}.png"), VARIANTS["area"](coded))
            if k % 100 == 0:
                print(f"  prepared {k}/{len(items)}", flush=True)

        eng = matlab.engine.start_matlab()
        for rel in ["utils", "stage_3", "validation"]:
            eng.addpath(str(ROOT / rel), nargout=0)
        for name in list(VARIANTS) + ["subset_area", "subset_jpeg20_native", "subset_jpeg60_native"]:
            files = sorted((tmp / name).glob("*.png"))
            label_of = {i: l for i, l, _ in items}
            eng.predictFiles([str(f) for f in files], [label_of[f.stem] for f in files], (RESULTS / f"idrid_variant_{name}.csv").as_posix(), nargout=0)
            print("done", name, flush=True)
        eng.quit()


if __name__ == "__main__":
    main()
