"""Analyse the Stage 1 quality-gate validation. Needs only numpy and the committed results/ files.

    python validation/analyze_quality.py

Produces validation/results/quality.md and quality.json. Sections:
  E  external validation of the classifier on IDRiD (full-resolution images it never saw)
  1  the old gate: how often it fires, and whether that predicts classifier errors
  2  do the candidate quality measures predict classifier errors on natural images?
  3  controlled degradations: what damages the classifier, and what each gate does about it
  4  the shipped gate (backend/quality.py): rejection rates, error rates, and how it treats each degradation
"""
import csv
import json
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent / "backend"))
import analyze as A  # noqa: E402

RESULTS = HERE / "results"
THRESHOLD = A.PREVIOUS_THRESHOLD   # the quality experiments (QUALITY.md) scored the previous 224 px model
OLD_GATE = {"blur": 12.0, "dark": 45.0, "bright": 210.0}       # the previous Stage 1 constants
MEASURES = ["brightness", "under_fraction", "over_fraction", "contrast", "range_p5_p95", "lap_var", "lap_var_norm",
            "tenengrad_norm", "hf_ratio", "fov_fraction", "cur_lap_native", "cur_mean_native"]


def num(v):
    if v == "":
        return float("nan")          # a measure that could not be computed (for example, no retina found)
    try:
        return float(v)
    except (TypeError, ValueError):
        return v


def read_rows(name):
    return [{k: num(v) for k, v in r.items()} for r in csv.DictReader(open(RESULTS / name, encoding="utf-8"))]


def prediction_table(name):
    ids, labels, probs = A.load(name)
    return {i: (l, p) for i, l, p in zip(ids, labels, probs)}


def outcome(label, probs):
    truth = label in A.REFERABLE
    flagged = probs[[A.CLASSES.index(c) for c in A.REFERABLE]].sum() >= THRESHOLD
    return {"wrong": bool(truth != flagged), "missed": bool(truth and not flagged), "truth": truth, "flagged": bool(flagged)}


def pct(x, d=1):
    return f"{x:.{d}%}"


def old_gate_verdict(lap, mean):
    if lap < OLD_GATE["blur"]:
        return "reject"
    if mean < OLD_GATE["dark"] or mean > OLD_GATE["bright"]:
        return "enhance"
    return "accept"


# ------------------------------------------------------------------------------------------------------ sections
def section_external(md, out):
    if not (RESULTS / "idrid_app.csv").exists():
        return
    md.append("## E. External validation on IDRiD (full-resolution images the model never saw)\n")
    md.append(f"516 photographs (4288 x 2848) with expert DR grades, read exactly as the app receives them. Referral threshold {THRESHOLD}. "
              "'app' = MATLAB resize to 224 (what the app does); 'area' = OpenCV area-averaged to 224 first.\n")
    md.append("| Data | n (referable) | Sensitivity | Specificity | AUC | Kappa (5-class) | 5-class accuracy |\n|---|---|---|---|---|---|---|")
    ext = {}
    sets = {"APTOS test (for reference)": A.load("app_test_resize")[1:]}
    for variant in ("app", "area"):
        _, y, p = A.load(f"idrid_{variant}")
        sets[f"IDRiD, variant '{variant}'"] = (y, p)
    for name, (y, p) in sets.items():
        s = A.summarise(y, p, THRESHOLD)
        r = s["at_threshold"]
        ext[name] = s
        md.append(f"| {name} | {s['n']} ({s['referable_n']}) | {A.fmt_ci(r['sensitivity'], r['sensitivity_ci'])} | {A.fmt_ci(r['specificity'], r['specificity_ci'])} | "
                  f"{A.fmt_ci(s['auc'], s['auc_ci'], False)} | {A.fmt_ci(s['qwk'], s['qwk_ci'], False)} | {A.fmt_ci(s['accuracy_5class'], s['accuracy_5class_ci'])} |")
    out["external"] = ext
    y, p = sets["IDRiD, variant 'app'"]
    pcr = A.per_class_recall(y, p)
    md.append("\nPer-grade recognition on IDRiD ('app'): " + ", ".join(f"{g} {v[0]:.0%} (n={v[1]})" for g, v in pcr.items()) + ".\n")
    pred_ref = A.referable_prob(p) >= THRESHOLD
    truth = A.is_referable(y)
    argmax_ref = np.isin(np.array([A.CLASSES[i] for i in p.argmax(1)]), A.REFERABLE)
    md.append(f"Referable found: threshold rule {int((pred_ref & truth).sum())} of {int(truth.sum())} "
              f"({pct((pred_ref & truth).sum() / truth.sum())}); most-likely-grade rule {int((argmax_ref & truth).sum())} ({pct((argmax_ref & truth).sum() / truth.sum())}).\n")


def section_old_gate(md, out, metrics, table):
    md.append("## 1. The previous gate\n")
    md.append("Rule: reject if the Laplacian variance of the whole grey image is below 12; flag 'poorly lit' if its mean is below 45 or above 210. "
              "APTOS files are already 224 px; IDRiD files are 12 megapixels, so the same rule behaves very differently on them.\n")
    md.append("| Data | Images | Reject | 'Poor lighting' | Accept | Median Laplacian variance | Median grey mean |\n|---|---|---|---|---|---|---|")
    old = {}
    for ds, label in (("aptos", "APTOS (224 px files)"), ("idrid", "IDRiD (12 MP files)")):
        rows = [r for r in metrics if r["dataset"] == ds]
        if not rows:
            continue
        v = [old_gate_verdict(r["cur_lap_native"], r["cur_mean_native"]) for r in rows]
        old[ds] = {k: v.count(k) / len(v) for k in ("reject", "enhance", "accept")}
        md.append(f"| {label} | {len(rows)} | {pct(old[ds]['reject'])} | {pct(old[ds]['enhance'])} | {pct(old[ds]['accept'])} | "
                  f"{np.median([r['cur_lap_native'] for r in rows]):.0f} | {np.median([r['cur_mean_native'] for r in rows]):.0f} |")
    out["old_gate"] = old

    md.append("\nDoes the old gate's 'poor lighting' flag point at images the classifier gets wrong? (APTOS validation+test, and IDRiD)\n")
    md.append("| Data | Flagged | Referral decision wrong when flagged | when not flagged |\n|---|---|---|---|")
    for ds, label in (("aptos", "APTOS"), ("idrid", "IDRiD")):
        rows = [r for r in metrics if r["dataset"] == ds and (ds == "idrid" or r["split"] in ("validation", "test")) and (ds, r["id"]) in table]
        flag = np.array([old_gate_verdict(r["cur_lap_native"], r["cur_mean_native"]) != "accept" for r in rows])
        wrong = np.array([table[(ds, r["id"])]["wrong"] for r in rows])
        if flag.sum():
            md.append(f"| {label} | {int(flag.sum())} of {len(rows)} | {pct(wrong[flag].mean())} | {pct(wrong[~flag].mean())} |")
    md.append("")


def natural_frame(metrics, table):
    rows = []
    for r in metrics:
        key = (r["dataset"], r["id"])
        if key in table and r.get("no_retina", 0) == 0 and (r["dataset"] == "idrid" or r["split"] in ("validation", "test")):
            rows.append((r, table[key]))
    return rows


def section_predictive(md, out, metrics, table):
    md.append("## 2. Do the quality measures predict where the classifier fails? (natural images)\n")
    md.append("AUC of each measure for spotting images whose referral decision is wrong (0.5 = no information; the direction that works best is shown). "
              "Classifier errors also come from genuinely ambiguous disease, so even a perfect quality measure would not reach 1.0.\n")
    md.append("| Measure | APTOS val+test AUC (direction) | IDRiD AUC (direction) |\n|---|---|---|")
    res = {}
    for m in MEASURES:
        cells = []
        for ds in ("aptos", "idrid"):
            frame = [(r, o) for r, o in natural_frame(metrics, table) if r["dataset"] == ds and m in r and isinstance(r[m], float)]
            if len(frame) < 50:
                cells.append("n/a")
                continue
            x = np.array([r[m] for r, _ in frame])
            wrong = np.array([o["wrong"] for _, o in frame])
            low, high = A.auc(-x, wrong), A.auc(x, wrong)
            best, direction = (low, "lower = worse") if low >= high else (high, "higher = worse")
            res.setdefault(m, {})[ds] = {"auc": best, "direction": direction}
            cells.append(f"{best:.3f} ({direction})")
        md.append(f"| {m} | {cells[0]} | {cells[1]} |")
    out["predictive"] = res
    md.append("")


def section_degradation(md, out):
    if not (RESULTS / "degradation_predictions.csv").exists():
        return None
    md.append("## 3. Controlled degradations (150 held-out APTOS test images, 30 per grade)\n")
    md.append("Each degradation is applied to the 224x224 image the classifier sees. 'Damage' compares the classifier on the same 150 images before and after.\n")
    preds = {r["id"]: r for r in read_rows("degradation_predictions.csv")}
    mets = read_rows("degradation_metrics.csv")
    by_cond = defaultdict(list)
    for r in mets:
        by_cond[r["condition"]].append(r)
    order = list(dict.fromkeys(r["condition"] for r in mets))
    table = {}
    md.append("| Condition | Sensitivity | Specificity | AUC | Sensitivity change | Old gate: rejected / flagged | Median sharpness (lap_var_norm) | Median brightness |\n|---|---|---|---|---|---|---|---|")
    clean_sens = None
    for cond in order:
        rows = by_cond[cond]
        y = np.array([r["label"] for r in rows])
        p = np.array([[preds[r["id"]][f"p_{c}"] for c in A.CLASSES] for r in rows])
        c = A.confusion(y, p, THRESHOLD)
        rt = A.rates(c)
        auc_v = A.auc(A.referable_prob(p), A.is_referable(y))
        clean_sens = rt["sensitivity"] if clean_sens is None else clean_sens
        verdicts = [old_gate_verdict(r["cur_lap_224"], r["cur_mean_224"]) for r in rows]
        table[cond] = {"sens": rt["sensitivity"], "spec": rt["specificity"], "auc": auc_v, "sens_drop": clean_sens - rt["sensitivity"],
                       "old_reject": verdicts.count("reject") / len(rows), "old_flag": verdicts.count("enhance") / len(rows), "rows": rows, "p": p, "y": y}
        sharp = np.median([r.get("lap_var_norm", np.nan) for r in rows])
        bright = np.median([r.get("brightness", np.nan) for r in rows])
        md.append(f"| {cond} | {pct(rt['sensitivity'])} | {pct(rt['specificity'])} | {auc_v:.3f} | {(rt['sensitivity'] - clean_sens) * 100:+.1f} pts | "
                  f"{pct(table[cond]['old_reject'], 0)} / {pct(table[cond]['old_flag'], 0)} | {sharp:.3f} | {bright:.3f} |")
    out["degradation"] = {k: {kk: vv for kk, vv in v.items() if kk not in ("rows", "p", "y")} for k, v in table.items()}
    md.append("")
    return table


def section_new_gate(md, out, metrics, table, degradation):
    try:
        import quality
        verdict = quality.verdict
    except (ImportError, AttributeError):
        return
    md.append("## 4. The shipped gate (`backend/quality.py`)\n")
    md.append("Verdicts: **reject** (ask for a new photo), **warn** (accept, but results may be less reliable), **accept**.\n")
    md.append("| Data | Images | Reject | Warn | Accept |\n|---|---|---|---|---|\n")
    gate = {}
    for ds, label in (("aptos", "APTOS (all)"), ("idrid", "IDRiD")):
        rows = [r for r in metrics if r["dataset"] == ds]
        if not rows:
            continue
        v = [verdict({k: x for k, x in r.items() if isinstance(x, float)})["verdict"] for r in rows]
        gate[ds] = {k: v.count(k) / len(v) for k in ("reject", "warn", "accept")}
        md.append(f"| {label} | {len(rows)} | {pct(gate[ds]['reject'])} | {pct(gate[ds]['warn'])} | {pct(gate[ds]['accept'])} |")
    md.append("\nClassifier errors, by what the gate said (natural images):\n")
    md.append("| Data | Verdict | Images | Referral decision wrong | Referable cases missed |\n|---|---|---|---|---|")
    for ds, label in (("aptos", "APTOS val+test"), ("idrid", "IDRiD")):
        frame = [(r, o) for r, o in natural_frame(metrics, table) if r["dataset"] == ds]
        for name in ("reject", "warn", "accept"):
            sel = [o for r, o in frame if verdict({k: x for k, x in r.items() if isinstance(x, float)})["verdict"] == name]
            if sel:
                truth = sum(o["truth"] for o in sel)
                md.append(f"| {label} | {name} | {len(sel)} | {pct(np.mean([o['wrong'] for o in sel]))} | {sum(o['missed'] for o in sel)} of {truth} |")
    out["new_gate"] = {"rates": gate}
    if degradation:
        md.append("\nHow the shipped gate treats each degradation (share of the 150 images per verdict), beside the damage to the classifier:\n")
        md.append("| Condition | Sensitivity change | AUC | Reject | Warn | Accept |\n|---|---|---|---|---|---|")
        per = {}
        for cond, t in degradation.items():
            v = [verdict({k: x for k, x in r.items() if isinstance(x, float)})["verdict"] for r in t["rows"]]
            share = {k: v.count(k) / len(v) for k in ("reject", "warn", "accept")}
            per[cond] = share
            md.append(f"| {cond} | {(t['sens'] - degradation['clean']['sens']) * 100:+.1f} pts | {t['auc']:.3f} | {pct(share['reject'], 0)} | {pct(share['warn'], 0)} | {pct(share['accept'], 0)} |")
        out["new_gate"]["degradation"] = per
    md.append("")


def section_downscale(md, out):
    names = ["area", "lanczos", "linear_noAA", "nearest", "area_unsharp", "area_unsharp_strong"]
    if not all((RESULTS / f"idrid_variant_{n}.csv").exists() for n in names):
        return
    sharp = json.loads((RESULTS / "idrid_variant_sharpness.json").read_text(encoding="utf-8")) if (RESULTS / "idrid_variant_sharpness.json").exists() else {}
    splits = {r["id"]: r["split"] for r in read_rows("idrid_splits.csv")}
    md.append("## 5. Why IDRiD is over-referred: how much detail survives the shrink to 224 px\n")
    md.append("Hypothesis: shrunk to 224 px, IDRiD photographs carry less fine detail than the APTOS images the classifier was trained on, and blurred images are over-referred "
              "(section 3). Test: shrink the same 516 photographs in ways that keep more detail and see whether specificity recovers. **Diagnostic only; the app is unchanged.**\n")
    aptos = sharp.get("_aptos_train_natural", {})
    md.append(f"For scale, APTOS training images have median sharpness {aptos.get('lap_var_norm', float('nan')):.2f}. Split rows separate the 413 IDRiD training images from the 103 test images.\n")
    md.append("| Shrink method | Median sharpness | Sensitivity | Specificity | AUC | Specificity, IDRiD train (413) | Specificity, IDRiD test (103) |\n|---|---|---|---|---|---|---|")
    table = {}
    for n in ["app"] + names:
        f = "idrid_app" if n == "app" else f"idrid_variant_{n}"
        ids, y, p = A.load(f)
        s = A.summarise(y, p, THRESHOLD)["at_threshold"]
        a = A.auc(A.referable_prob(p), A.is_referable(y))
        specs = {}
        for part in ("train", "test"):
            m = np.array([splits[i] == part for i in ids])
            c = A.confusion(y[m], p[m], THRESHOLD)
            specs[part] = c["TN"] / max(1, c["TN"] + c["FP"])
        sh = sharp.get(n, {}).get("lap_var_norm")
        table[n] = {"sens": s["sensitivity"], "spec": s["specificity"], "auc": a, "spec_train": specs["train"], "spec_test": specs["test"], "sharpness": sh}
        label = "app (MATLAB bicubic, what the app does)" if n == "app" else n
        md.append(f"| {label} | {'' if sh is None else f'{sh:.2f}'} | {pct(s['sensitivity'])} | {pct(s['specificity'])} | {a:.3f} | {pct(specs['train'])} | {pct(specs['test'])} |")
    out["downscale"] = table
    md.append("")


def section_jpeg(md, out):
    names = ["subset_area", "subset_jpeg60_native", "subset_jpeg20_native"]
    if not all((RESULTS / f"idrid_variant_{n}.csv").exists() for n in names):
        return
    md.append("## 6. Heavy JPEG compression at full resolution (120 IDRiD photographs)\n")
    md.append("Section 3 compressed *after* shrinking to 224 px, which is harsher than reality: an upload is compressed at full size and then shrunk, "
              "which averages the artifacts away. Here JPEG is applied at native resolution first.\n")
    md.append("| Version | Sensitivity | Specificity | AUC | Same referral decision as uncompressed |\n|---|---|---|---|---|")
    base_ids, base_y, base_p = A.load("idrid_variant_subset_area")
    base_flag = dict(zip(base_ids, A.referable_prob(base_p) >= THRESHOLD))
    res = {}
    for n, label in (("subset_area", "no extra compression"), ("subset_jpeg60_native", "JPEG quality 60 at full size"), ("subset_jpeg20_native", "JPEG quality 20 at full size")):
        ids, y, p = A.load(f"idrid_variant_{n}")
        s = A.summarise(y, p, THRESHOLD)["at_threshold"]
        flag = A.referable_prob(p) >= THRESHOLD
        same = np.mean([bool(f) == bool(base_flag[i]) for i, f in zip(ids, flag)])
        res[n] = {"sens": s["sensitivity"], "spec": s["specificity"], "auc": A.auc(A.referable_prob(p), A.is_referable(y)), "same": float(same)}
        md.append(f"| {label} | {pct(s['sensitivity'])} | {pct(s['specificity'])} | {res[n]['auc']:.3f} | {pct(same, 0)} |")
    out["jpeg_native"] = res
    md.append("")


def main():
    md, out = [], {}
    metrics = read_rows("quality_metrics.csv") if (RESULTS / "quality_metrics.csv").exists() else []
    table = {}
    for ds, files in (("aptos", ("app_validation_resize", "app_test_resize")), ("idrid", ("idrid_app",))):
        for f in files:
            if (RESULTS / f"{f}.csv").exists():
                for i, (l, p) in prediction_table(f).items():
                    table[(ds, i)] = outcome(l, p)
    section_external(md, out)
    if metrics:
        section_old_gate(md, out, metrics, table)
        section_predictive(md, out, metrics, table)
    degradation = section_degradation(md, out)
    if metrics:
        section_new_gate(md, out, metrics, table, degradation)
    section_downscale(md, out)
    section_jpeg(md, out)
    text = "\n".join(md)
    (RESULTS / "quality.md").write_text(text, encoding="utf-8")
    (RESULTS / "quality.json").write_text(json.dumps(out, indent=1, default=float), encoding="utf-8")
    print(text)


if __name__ == "__main__":
    main()
