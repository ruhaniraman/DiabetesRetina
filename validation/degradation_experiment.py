"""Controlled degradations of held-out APTOS test images: what actually hurts the classifier, and does a quality gate see it?

    python validation/degradation_experiment.py        # needs MATLAB; about 5 minutes

Takes 30 test images per grade (150), applies each degradation at several strengths, then records
  * the classifier's output on every degraded image (results/degradation_predictions.csv), and
  * every candidate quality measure on every degraded image (results/degradation_metrics.csv).
Degradations are applied to the 224x224 image, which is what the classifier sees.
"""
import csv
import tempfile
from pathlib import Path

import cv2
import matlab.engine
import numpy as np

import quality_metrics as qm

ROOT = Path(__file__).resolve().parent.parent
RESULTS = ROOT / "validation" / "results"
APTOS = ROOT / "data" / "aptos2019" / "colored_images"
GRADES = ["No_DR", "Mild", "Moderate", "Severe", "Proliferate_DR"]
PER_GRADE = 30


def blur(s):
    return lambda x: cv2.GaussianBlur(x, (0, 0), s)


def scale(k):
    return lambda x: np.clip(x.astype(np.float32) * k, 0, 255).astype(np.uint8)


def noise(s):
    def f(x):
        rng = np.random.default_rng(1)
        return np.clip(x.astype(np.float32) + rng.normal(0, s, x.shape), 0, 255).astype(np.uint8)
    return f


def jpeg(q):
    return lambda x: cv2.imdecode(cv2.imencode(".jpg", x, [cv2.IMWRITE_JPEG_QUALITY, q])[1], cv2.IMREAD_COLOR)


CONDITIONS = (
    [("clean", "none", 0, lambda x: x)]
    + [(f"blur {s}", "blur", s, blur(s)) for s in (0.5, 1, 1.5, 2, 3, 4)]
    + [(f"darken x{k}", "darken", k, scale(k)) for k in (0.7, 0.5, 0.35, 0.25, 0.15)]
    + [(f"brighten x{k}", "brighten", k, scale(k)) for k in (1.5, 2, 3)]
    + [(f"noise {s}", "noise", s, noise(s)) for s in (10, 20, 40)]
    + [(f"jpeg q{q}", "jpeg", q, jpeg(q)) for q in (40, 20, 10)]
)


def main():
    rng = np.random.default_rng(11)
    rows = [r for r in csv.DictReader(open(RESULTS / "splits.csv", encoding="utf-8")) if r["split"] == "test"]
    chosen = []
    for g in GRADES:
        pool = [r for r in rows if r["label"] == g]
        chosen += [pool[i] for i in rng.choice(len(pool), size=min(PER_GRADE, len(pool)), replace=False)]

    metric_rows, paths, labels = [], [], []
    with tempfile.TemporaryDirectory(prefix="degrade_") as tmp:
        for ci, (name, kind, strength, fn) in enumerate(CONDITIONS):
            for r in chosen:
                img = cv2.imread(str(APTOS / r["label"] / f"{r['id']}.png"))
                bad = fn(img)
                stem = f"c{ci:02d}_{r['id']}"
                cv2.imwrite(str(Path(tmp) / f"{stem}.png"), bad)
                paths.append(str(Path(tmp) / f"{stem}.png"))
                labels.append(r["label"])
                metric_rows.append({"condition": name, "kind": kind, "strength": strength, "id": stem, "label": r["label"], **qm.measures(bad)})
        print(f"{len(paths)} degraded images written", flush=True)

        eng = matlab.engine.start_matlab()
        for rel in ["utils", "stage_3", "validation"]:
            eng.addpath(str(ROOT / rel), nargout=0)
        eng.predictFiles(paths, labels, (RESULTS / "degradation_predictions.csv").as_posix(), nargout=0)
        eng.quit()

    keys = sorted({k for r in metric_rows for k in r}, key=lambda k: (k not in ("condition", "kind", "strength", "id", "label"), k))
    with open(RESULTS / "degradation_metrics.csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=keys)
        w.writeheader()
        w.writerows(metric_rows)
    print("done")


if __name__ == "__main__":
    main()
