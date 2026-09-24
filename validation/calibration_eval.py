"""Is the deployed Stage 3 model's confidence calibrated? Reliability diagrams and expected calibration error (ECE), before and after
temperature scaling.

    python validation/calibration_eval.py

The temperature (stage3Results.temperature) was fitted on the VALIDATION split by stage_3/finetune/finetuneStage3.m; here it is applied
unchanged to the held-out TEST sets. Calibrated probabilities are softmax(log p / T), exactly what the app computes
(stage_3/assessBilateralFromFiles.m). Needs only numpy and matplotlib.

Reads   results/deployed_test.csv (APTOS test, full resolution), results/ft_run2_finetuned_idrid_test.csv (IDRiD official test set)
Writes  results/calibration.md, results/calibration.json, results/calibration_reliability.png
"""
import csv
import json
from pathlib import Path

import numpy as np

RESULTS = Path(__file__).resolve().parent / "results"
CLASSES = ["Mild", "Moderate", "No_DR", "Proliferate_DR", "Severe"]          # column order of the CSVs
REFERABLE = ["Moderate", "Severe", "Proliferate_DR"]
TEMPERATURE = 1.21726          # stage3Results.temperature of the deployed model (fitted on validation)
THRESHOLD = 0.0964             # stage3Results.threshold (referral decision; made on the raw, uncalibrated score)
BANDS = (("High", 0.90, 1.01), ("Moderate", 0.70, 0.90), ("Low", 0.0, 0.70))   # clinical_text.CONFIDENCE_BANDS
DATASETS = (("APTOS test", "deployed_test"), ("IDRiD test", "ft_run2_finetuned_idrid_test"))


def load(name):
    rows = list(csv.DictReader(open(RESULTS / f"{name}.csv", encoding="utf-8")))
    return np.array([r["label"] for r in rows]), np.array([[float(r[f"p_{c}"]) for c in CLASSES] for r in rows])


def temperature_scale(p, t):
    z = np.log(np.clip(p, 1e-12, 1)) / t
    z -= z.max(1, keepdims=True)
    e = np.exp(z)
    return e / e.sum(1, keepdims=True)


def ece(conf, correct, bins=10):
    """Expected calibration error: the average gap between claimed confidence and accuracy, weighted by bin size."""
    edges = np.linspace(0, 1, bins + 1)
    total = 0.0
    for lo, hi in zip(edges[:-1], edges[1:]):
        m = (conf > lo) & (conf <= hi)
        if m.any():
            total += m.mean() * abs(conf[m].mean() - correct[m].mean())
    return float(total)


def reliability(conf, correct, bins=10):
    edges = np.linspace(0, 1, bins + 1)
    out = []
    for lo, hi in zip(edges[:-1], edges[1:]):
        m = (conf > lo) & (conf <= hi)
        if m.any():
            out.append({"bin": [float(lo), float(hi)], "n": int(m.sum()), "confidence": float(conf[m].mean()), "accuracy": float(correct[m].mean())})
    return out


def band_table(conf, correct, referral_wrong):
    rows = []
    for name, lo, hi in BANDS:
        m = (conf >= lo) & (conf < hi)
        rows.append({"band": name, "n": int(m.sum()), "claims": float(conf[m].mean()) if m.any() else None,
                     "stage_right": float(correct[m].mean()) if m.any() else None,
                     "referral_wrong": float(referral_wrong[m].mean()) if m.any() else None})
    return rows


def main():
    out, md = {"temperature": TEMPERATURE, "threshold": THRESHOLD}, []
    P = md.append
    P("# Stage 3 confidence calibration (deployed model)\n")
    P(f"Temperature T = {TEMPERATURE:.3f}, fitted on the validation split and applied unchanged here (held-out test sets). "
      "T > 1 means the raw network is over-confident. The referral decision is unaffected: it is made on the raw referral score "
      f"at the threshold {THRESHOLD} chosen on validation. What changes is the confidence the app reports (the band).\n")
    curves = {}
    for data, name in DATASETS:
        y, p_raw = load(name)
        truth = np.isin(y, REFERABLE)
        flagged = p_raw[:, [CLASSES.index(c) for c in REFERABLE]].sum(1) >= THRESHOLD
        res = {}
        for kind, p in (("raw", p_raw), ("calibrated", temperature_scale(p_raw, TEMPERATURE))):
            conf = p.max(1)
            correct = np.array([CLASSES[i] for i in p.argmax(1)]) == y
            nll = float(-np.mean(np.log(np.clip(p[np.arange(len(y)), [CLASSES.index(l) for l in y]], 1e-12, 1))))
            res[kind] = {"n": len(y), "ece": ece(conf, correct), "nll": nll, "mean_confidence": float(conf.mean()), "accuracy": float(correct.mean()),
                         "reliability": reliability(conf, correct), "bands": band_table(conf, correct, truth != flagged)}
            curves[(data, kind)] = res[kind]["reliability"]
        out[data] = res
        P(f"## {data} ({len(y)} photographs)\n")
        P("| Probabilities | ECE (lower is better) | Log loss | Mean confidence | Exact stage right |\n|---|---|---|---|---|")
        for kind in ("raw", "calibrated"):
            r = res[kind]
            P(f"| {kind} | {r['ece']:.3f} | {r['nll']:.3f} | {r['mean_confidence']:.1%} | {r['accuracy']:.1%} |")
        P("\nConfidence bands with calibrated probabilities (what the app shows):\n")
        P("| Band | Photographs | Claims (mean) | Exact stage right | Referral decision wrong |\n|---|---|---|---|---|")
        for b in res["calibrated"]["bands"]:
            if b["n"]:
                P(f"| {b['band']} | {b['n']} | {b['claims']:.0%} | {b['stage_right']:.0%} | {b['referral_wrong']:.1%} |")
            else:
                P(f"| {b['band']} | 0 | - | - | - |")
        P("")
    P("Reliability diagram: `calibration_reliability.png` (points on the diagonal = confidence matches accuracy).\n")

    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    fig, axes = plt.subplots(1, 2, figsize=(10, 4.6))
    for ax, (data, _) in zip(axes, DATASETS):
        ax.plot([0, 1], [0, 1], color="#9ca3af", lw=1, ls="--", label="perfect calibration")
        for kind, colour in (("raw", "#dc4a4a"), ("calibrated", "#2563eb")):
            pts = curves[(data, kind)]
            ax.plot([q["confidence"] for q in pts], [q["accuracy"] for q in pts], "o-", color=colour, ms=4,
                    label=f"{kind} (ECE {out[data][kind]['ece']:.3f})")
        ax.set_title(data)
        ax.set_xlabel("Claimed confidence (top-class probability)")
        ax.set_ylabel("Exact stage actually right")
        ax.set_xlim(0, 1); ax.set_ylim(0, 1); ax.grid(alpha=0.25); ax.legend(loc="upper left", fontsize=8)
    fig.suptitle(f"Stage 3 reliability, deployed model, T = {TEMPERATURE:.2f} (fitted on validation)")
    fig.tight_layout()
    fig.savefig(RESULTS / "calibration_reliability.png", dpi=120)

    (RESULTS / "calibration.json").write_text(json.dumps(out, indent=1), encoding="utf-8")
    (RESULTS / "calibration.md").write_text("\n".join(md), encoding="utf-8")
    print("\n".join(md))


if __name__ == "__main__":
    main()
