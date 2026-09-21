"""Run validation/gradcam_faithfulness.m on held-out APTOS test images and summarise (needs MATLAB, a few minutes).

    python validation/gradcam_faithfulness.py
"""
import csv
import random
from pathlib import Path

import matlab.engine
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
RES = ROOT / "validation" / "results"
APTOS = ROOT / "data" / "aptos2019" / "colored_images"


def main(n_referable=60, n_healthy=30):
    rows = [r for r in csv.DictReader(open(RES / "splits.csv")) if r["split"] == "test"]
    rng = random.Random(1)
    ref = [r for r in rows if r["label"] in ("Moderate", "Severe", "Proliferate_DR")]
    non = [r for r in rows if r["label"] == "No_DR"]
    pick = rng.sample(ref, n_referable) + rng.sample(non, n_healthy)
    eng = matlab.engine.start_matlab()
    for rel in ["utils", "stage_3", "stage1_quality", "stage4_explainability/core", "validation"]:
        eng.addpath(str(ROOT / rel), nargout=0)
    out = RES / "gradcam_faithfulness.csv"
    eng.gradcam_faithfulness([str(APTOS / r["label"] / f"{r['id']}.png") for r in pick], [r["label"] for r in pick], out.as_posix(), nargout=0)
    eng.quit()

    d = list(csv.DictReader(open(out)))
    lines = ["| Group | n | Cells blanked | Referral-score drop, hottest cells | Drop, random cells | Hottest larger than random |", "|---|---|---|---|---|---|"]
    for group, sel in (("Referable eyes", lambda r: r["label"] != "No_DR"), ("Healthy eyes", lambda r: r["label"] == "No_DR")):
        g = [r for r in d if sel(r)]
        for k in (3, 6, 10):
            hot = np.array([float(r[f"drop_hot_{k}"]) for r in g])
            rnd = np.array([float(r[f"drop_random_{k}"]) for r in g])
            lines.append(f"| {group} | {len(g)} | {k} of about 38 | {hot.mean():.3f} | {rnd.mean():.3f} | {np.mean(hot > rnd) * 100:.0f}% of images |")
    text = "\n".join(lines)
    print(text)
    (RES / "gradcam_faithfulness.md").write_text(text + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
