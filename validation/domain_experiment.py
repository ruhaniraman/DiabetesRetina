"""Can INFERENCE-ONLY changes reduce the over-referral on IDRiD without hurting APTOS? (needs MATLAB; about 10 minutes)

The deployed model was trained on APTOS photographs shrunk to 224 px. IDRiD photographs are 3:2 with wide black borders and a different
camera/colour balance, and about half of its healthy eyes are flagged. Ideas that need no retraining, all diagnostic (nothing here changes the app):

  area           baseline: whole image shrunk to 224 px (what the app does)
  crop           crop the black border around the retina, keep the aspect ratio (pad to square), then shrink
  crop_clahe     crop + local contrast equalisation of the lightness channel
  crop_norm      crop + per-channel mean/std matched to the typical APTOS retina
  crop_flip      crop, average the score of the image and its mirror image (test-time augmentation)

Each variant is scored on IDRiD (all 516 images) and on the held-out APTOS test split (548), the data the model was validated on: a change is only
worth having if it helps IDRiD and leaves APTOS alone.

    python validation/domain_experiment.py        # writes results/domain_<variant>_<set>.csv
"""
import csv
import tempfile
from pathlib import Path

import cv2
import matlab.engine
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
RESULTS = ROOT / "validation" / "results"
APTOS = ROOT / "data" / "aptos2019" / "colored_images"
IDRID = ROOT / "data" / "idrid_grading" / "B. Disease Grading" / "B. Disease Grading" / "1. Original Images"


def retina_box(img, thresh=12):
    grey = cv2.GaussianBlur(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY), (0, 0), 3)
    ys, xs = np.where(grey > thresh)
    if len(ys) < 0.05 * grey.size:
        return 0, img.shape[0], 0, img.shape[1]
    return ys.min(), ys.max() + 1, xs.min(), xs.max() + 1


def crop_square(img):
    y0, y1, x0, x1 = retina_box(img)
    c = img[y0:y1, x0:x1]
    h, w = c.shape[:2]
    s = max(h, w)
    out = np.zeros((s, s, 3), c.dtype)
    out[(s - h) // 2:(s - h) // 2 + h, (s - w) // 2:(s - w) // 2 + w] = c
    return out


def shrink(x):
    return cv2.resize(x, (224, 224), interpolation=cv2.INTER_AREA)


def clahe(img):
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    lab[..., 0] = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(lab[..., 0])
    return cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)


def retina_stats(img):
    m = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) > 12
    px = img[m].astype(np.float64)
    return px.mean(0), px.std(0) + 1e-6


def match(img, target):
    """Shift/scale each channel inside the retina so its mean/std equal the target's; black border stays black."""
    m = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) > 12
    mu, sd = retina_stats(img)
    out = img.astype(np.float64)
    out[m] = (out[m] - mu) / sd * target[1] + target[0]
    return np.clip(out, 0, 255).astype(np.uint8)


def main():
    aptos = [(r["id"], r["label"], APTOS / r["label"] / f"{r['id']}.png") for r in csv.DictReader(open(RESULTS / "splits.csv")) if r["split"] == "test"]
    idrid = [(r["id"], r["label"], IDRID / ("a. Training Set" if r["split"] == "train" else "b. Testing Set") / f"{r['name']}.jpg")
             for r in csv.DictReader(open(RESULTS / "idrid_splits.csv", encoding="utf-8"))]
    train = [ROOT / "data" / "aptos2019" / "colored_images" / r["label"] / f"{r['id']}.png"
             for r in csv.DictReader(open(RESULTS / "splits.csv")) if r["split"] == "train"][::13]
    stats = [retina_stats(shrink(cv2.imread(str(p)))) for p in train]
    target = (np.mean([s[0] for s in stats], 0), np.mean([s[1] for s in stats], 0))
    print("APTOS retina mean/std (BGR):", target[0].round(1), target[1].round(1), flush=True)

    variants = {
        "area": lambda x: shrink(x),
        "crop": lambda x: shrink(crop_square(x)),
        "crop_clahe": lambda x: shrink(clahe(crop_square(x))),
        "crop_norm": lambda x: shrink(match(crop_square(x), target)),
        "crop_flip": lambda x: shrink(crop_square(x))[:, ::-1].copy(),     # scored separately, averaged with "crop" in the analysis
    }
    sets = {"aptos": aptos, "idrid": idrid}
    with tempfile.TemporaryDirectory(prefix="domain_") as tmp:
        tmp = Path(tmp)
        for sname, items in sets.items():
            for v in variants:
                (tmp / f"{v}_{sname}").mkdir()
            for k, (uid, label, path) in enumerate(items):
                img = cv2.imread(str(path))
                for v, fn in variants.items():
                    cv2.imwrite(str(tmp / f"{v}_{sname}" / f"{uid}.png"), fn(img))
                if k % 100 == 0:
                    print(f"  prepared {sname} {k}/{len(items)}", flush=True)
        eng = matlab.engine.start_matlab()
        for rel in ["utils", "stage_3", "validation"]:
            eng.addpath(str(ROOT / rel), nargout=0)
        for sname, items in sets.items():
            label_of = {u: l for u, l, _ in items}
            for v in variants:
                files = sorted((tmp / f"{v}_{sname}").glob("*.png"))
                eng.predictFiles([str(f) for f in files], [label_of[f.stem] for f in files], (RESULTS / f"domain_{v}_{sname}.csv").as_posix(), [f.stem for f in files], nargout=0)
                print("done", v, sname, flush=True)
        eng.quit()


if __name__ == "__main__":
    main()
