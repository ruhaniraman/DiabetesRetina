"""Compute the shipped image-quality measures (backend/quality.py) for every image, on the 224x224 image the classifier sees.

Measuring at the model's own scale makes the numbers comparable across a 224px APTOS file and a 12-megapixel upload,
and reflects what matters for grading: blur that vanishes when the photo is shrunk to 224 does not hurt the network.
All measures use the green channel inside the retina only (never the black border), as the team's MATLAB Stage 1 did.

    python validation/quality_metrics.py        # writes results/quality_metrics.csv (about 5 minutes)
"""
import csv
from multiprocessing import Pool
from pathlib import Path

import sys

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
RESULTS = ROOT / "validation" / "results"
APTOS = ROOT / "data" / "aptos2019" / "colored_images"
IDRID = ROOT / "data" / "idrid_grading" / "B. Disease Grading" / "B. Disease Grading" / "1. Original Images"
sys.path.insert(0, str(ROOT / "backend"))
from quality import SIZE, measures as _measures, model_view  # noqa: E402  (the shipped code under test)


def measures(img_bgr):
    """The shipped measures (backend/quality.py) plus the OLD gate's own inputs, for comparison."""
    m = _measures(img_bgr)
    gray = cv2.cvtColor(model_view(img_bgr), cv2.COLOR_BGR2GRAY)
    # The app's previous gate: raw Laplacian variance and mean of the whole grey frame (black border included).
    m.update({"cur_lap_224": float(cv2.Laplacian(gray, cv2.CV_64F).var()), "cur_mean_224": float(gray.mean())})
    return m


def current_gate_measures(path):
    """What the app's CURRENT Stage 1 computes, on the file as uploaded (native resolution)."""
    gray = cv2.imread(str(path), cv2.IMREAD_GRAYSCALE)
    return {"cur_lap_native": float(cv2.Laplacian(gray, cv2.CV_64F).var()), "cur_mean_native": float(gray.mean()), "native_width": int(gray.shape[1])}


def one(job):
    dataset, image_id, label, split, path = job
    img = cv2.imread(str(path))
    row = {"dataset": dataset, "id": image_id, "label": label, "split": split}
    row.update(measures(img))
    row.update(current_gate_measures(path))
    return row


def jobs():
    out = []
    for r in csv.DictReader(open(RESULTS / "splits.csv", encoding="utf-8")):
        out.append(("aptos", r["id"], r["label"], r["split"], APTOS / r["label"] / f"{r['id']}.png"))
    idrid_labels = RESULTS / "idrid_splits.csv"
    if idrid_labels.exists():
        for r in csv.DictReader(open(idrid_labels, encoding="utf-8")):
            folder = "a. Training Set" if r["split"] == "train" else "b. Testing Set"
            out.append(("idrid", r["id"], r["label"], r["split"], IDRID / folder / f"{r['id']}.jpg"))
    return out


def main():
    work = jobs()
    print(f"{len(work)} images", flush=True)
    with Pool(3) as pool:
        rows = pool.map(one, work, chunksize=16)
    keys = sorted({k for r in rows for k in r}, key=lambda k: (k not in ("dataset", "id", "label", "split"), k))
    with open(RESULTS / "quality_metrics.csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=keys)
        w.writeheader()
        w.writerows(rows)
    print("wrote", RESULTS / "quality_metrics.csv")


if __name__ == "__main__":
    main()
