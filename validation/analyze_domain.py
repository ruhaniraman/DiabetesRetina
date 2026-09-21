"""Summarise domain_experiment.py: for each preprocessing variant, AUC, sensitivity/specificity at the deployed 0.20 threshold, and the
specificity available at 90% and 95% sensitivity (the threshold-free view: does the ranking of eyes improve, or only the operating point?).

    python validation/analyze_domain.py
"""
import csv
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "calibration"))
import core  # noqa: E402

RESULTS = HERE / "results"
VARIANTS = ["area", "crop", "crop_clahe", "crop_norm", "crop_flip_avg"]


def load(variant, dataset):
    if variant == "crop_flip_avg":
        a, b = load("crop", dataset), load("crop_flip", dataset)
        return {k: (a[k][0], (a[k][1] + b[k][1]) / 2) for k in a}
    rows = list(csv.DictReader(open(RESULTS / f"domain_{variant}_{dataset}.csv", encoding="utf-8")))
    return {r["id"]: (r["label"], np.array([float(r[f"p_{c}"]) for c in core.CLASSES])) for r in rows}


def auc(truth, score):
    order = np.argsort(score)
    ranks = np.empty(len(score))
    ranks[order] = np.arange(1, len(score) + 1)
    for v in np.unique(score):                      # average ranks over ties
        m = score == v
        if m.sum() > 1:
            ranks[m] = ranks[m].mean()
    n1, n0 = truth.sum(), (~truth).sum()
    return (ranks[truth].sum() - n1 * (n1 + 1) / 2) / (n1 * n0)


def spec_at_sens(truth, score, target):
    best = 0.0
    for t in np.unique(score):
        c = core.confusion(truth, score, t)
        r = core.rates(c)
        if r["sensitivity"] >= target:
            best = max(best, r["specificity"])
    return best


def main():
    out = ["| Set | Variant | AUC | Sens @0.20 | Spec @0.20 | Spec at 90% sens | Spec at 95% sens |", "|---|---|---|---|---|---|---|"]
    for dataset in ("aptos", "idrid"):
        for v in VARIANTS:
            d = load(v, dataset)
            truth = np.array([lab in core.REFERABLE for lab, _ in d.values()], dtype=bool)
            score = core.referral_score(np.array([p for _, p in d.values()]))
            r = core.rates(core.confusion(truth, score, core.DEFAULT_THRESHOLD))
            out.append(f"| {dataset} ({len(d)}) | {v} | {auc(truth, score):.3f} | {r['sensitivity'] * 100:.1f}% | {r['specificity'] * 100:.1f}% | "
                       f"{spec_at_sens(truth, score, 0.90) * 100:.1f}% | {spec_at_sens(truth, score, 0.95) * 100:.1f}% |")
    text = "\n".join(out)
    print(text)
    (RESULTS / "domain.md").write_text(text + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
