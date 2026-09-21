"""How much fine detail does each way of shrinking an IDRiD photograph to 224 px keep? (100 images; needs data/idrid_grading.)

    python validation/downscale_sharpness.py      # writes results/idrid_variant_sharpness.json

Compares the median sharpness (lap_var_norm) and fine-detail ratio (hf_ratio) of each variant in downscale_experiment.py
with APTOS's natural values, to test the idea that IDRiD looks 'soft' to a network trained on APTOS's 224 px images.
"""
import csv
import json
import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import downscale_experiment as dx  # noqa: E402

sys.path.insert(0, str(dx.ROOT / "backend"))
import quality  # noqa: E402


def main():
    items = [(r["name"], r["split"]) for r in csv.DictReader(open(dx.RESULTS / "idrid_splits.csv", encoding="utf-8"))]
    rng = np.random.default_rng(2)
    pick = [items[i] for i in rng.choice(len(items), size=100, replace=False)]
    acc = {name: {"lap_var_norm": [], "hf_ratio": []} for name in dx.VARIANTS}
    for image_id, split in pick:
        folder = "a. Training Set" if split == "train" else "b. Testing Set"
        native = cv2.imread(str(dx.BASE / folder / f"{image_id}.jpg"))
        for name, fn in dx.VARIANTS.items():
            m = quality.measures(fn(native))
            for k in acc[name]:
                acc[name][k].append(m[k])
    out = {name: {k: float(np.median(v)) for k, v in d.items()} for name, d in acc.items()}
    q = [r for r in csv.DictReader(open(dx.RESULTS / "quality_metrics.csv", encoding="utf-8")) if r["dataset"] == "aptos" and r["split"] == "train"]
    out["_aptos_train_natural"] = {k: float(np.median([float(r[k]) for r in q])) for k in ("lap_var_norm", "hf_ratio")}
    (dx.RESULTS / "idrid_variant_sharpness.json").write_text(json.dumps(out, indent=1), encoding="utf-8")
    for name, d in out.items():
        print(f"{name:22s} lap_var_norm={d['lap_var_norm']:.3f}  hf_ratio={d['hf_ratio']:.3f}")


if __name__ == "__main__":
    main()
