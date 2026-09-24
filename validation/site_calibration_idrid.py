"""Worked example of per-site threshold calibration, with IDRiD playing the "new site".

    python validation/site_calibration_idrid.py

The deployed model's threshold (0.096) was chosen on a validation set that is mostly APTOS; on IDRiD's official test set it gives 90.6%
sensitivity but only 53.8% specificity. A site would fix that by choosing its own threshold on its own graded photographs
(calibration/README.md). Here the site's photographs are IDRiD's 61 VALIDATION photographs (held out of training), the threshold is
chosen with the calibration tool's own rule (calibration/core.py choose_threshold), and the result is measured once on the 103 IDRiD TEST
photographs, which played no part in the choice.

Reads   results/ft_run2_validation.csv (validation scores; the IDRiD rows), results/ft_run2_finetuned_idrid_test.csv
Writes  results/site_calibration_idrid.md, results/site_calibration_idrid.json
"""
import csv
import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
RESULTS = ROOT / "validation" / "results"
sys.path.insert(0, str(ROOT / "calibration"))
import core  # noqa: E402  (the site calibration tool's own rules)

DEPLOYED = core.DEFAULT_THRESHOLD


def load(name, dataset=None):
    rows = [r for r in csv.DictReader(open(RESULTS / f"{name}.csv", encoding="utf-8")) if dataset is None or r.get("dataset") == dataset]
    labels = np.array([r["label"] for r in rows])
    probs = np.array([[float(r[f"p_{c}"]) for c in core.CLASSES] for r in rows])
    return np.isin(labels, sorted(core.REFERABLE)), core.referral_score(probs)


def main():
    tv, sv = load("ft_run2_validation", "idrid")
    tt, st = load("ft_run2_finetuned_idrid_test")
    out = {"site_sample": {"n": len(tv), "referable": int(tv.sum())}, "test": {"n": len(tt), "referable": int(tt.sum())}, "options": []}
    md = ["# Site calibration example: IDRiD as the new site\n",
          f"The site's graded sample is IDRiD's validation split ({len(tv)} photographs, {int(tv.sum())} referable), which the model did not train on. "
          f"Each threshold below is chosen on that sample alone with `calibration/core.py` `choose_threshold`, then measured once on IDRiD's official "
          f"test set ({len(tt)} photographs, {int(tt.sum())} referable). The deployed threshold is {DEPLOYED:.3g}.\n",
          "| Rule (chosen on the site sample) | Threshold | Site sample sens / spec | **IDRiD test sensitivity** | **IDRiD test specificity** | Test photographs flagged |",
          "|---|---|---|---|---|---|"]

    def row(name, t):
        rv, rt = core.rates(core.confusion(tv, sv, t)), core.rates(core.confusion(tt, st, t))
        out["options"].append({"rule": name, "threshold": t, "site": rv, "test": rt})
        ci = lambda r, k: f"{r[k]:.1%} ({r[k + '_ci'][0]:.0%}-{r[k + '_ci'][1]:.0%})"
        md.append(f"| {name} | {t:.3g} | {rv['sensitivity']:.1%} / {rv['specificity']:.1%} | {ci(rt, 'sensitivity')} | {ci(rt, 'specificity')} | {rt['flagged_share']:.0%} |")

    row("deployed model threshold (no site calibration)", DEPLOYED)
    for target in (0.95, 0.90):
        for bound in ("point", "lower"):
            t = core.choose_threshold(tv, sv, target, bound)
            name = f"site sensitivity {'estimate' if bound == 'point' else '95% lower bound'} >= {target:.0%}"
            if t is None:
                md.append(f"| {name} | none | not reachable with {int(tv.sum())} referable photographs | | | |")
                out["options"].append({"rule": name, "threshold": None})
            else:
                row(name, t)
    md += ["",
           "**Reading this.** A threshold chosen on the site's own photographs raises IDRiD specificity well above the deployed threshold's, at some cost in "
           "sensitivity. The site sample is small, so the intervals are wide and the *lower bound* rules (what the tool recommends by default) are more "
           "conservative. Which rule to adopt is the site clinical lead's decision; the tool never picks one. "
           "The specificity target (85%) is still not reached on IDRiD at a sensitivity above 90%: the model separates IDRiD's classes less well "
           "(AUC 0.92 against 0.98 on APTOS), which a threshold cannot fix. More training data from the site's camera would."]
    (RESULTS / "site_calibration_idrid.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    (RESULTS / "site_calibration_idrid.json").write_text(json.dumps(out, indent=1, default=float), encoding="utf-8")
    print("\n".join(md))


if __name__ == "__main__":
    main()
