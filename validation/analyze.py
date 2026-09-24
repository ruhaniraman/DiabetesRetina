"""Analyse the prediction CSVs from run_predictions.py. Needs only numpy (no MATLAB, no images).

    python validation/analyze.py

Writes validation/results/metrics.json and validation/results/tables.md, and prints the tables.
"""
import csv
import json
from pathlib import Path

import numpy as np

RESULTS = Path(__file__).resolve().parent / "results"
CLASSES = ["Mild", "Moderate", "No_DR", "Proliferate_DR", "Severe"]          # column order of the CSVs
GRADE = {"No_DR": 0, "Mild": 1, "Moderate": 2, "Severe": 3, "Proliferate_DR": 4}  # clinical severity order
REFERABLE = ["Moderate", "Severe", "Proliferate_DR"]                          # moderate NPDR or worse
# The DEPLOYED model: fine-tuned run 2 (384 px, full-resolution APTOS + IDRiD; validation/results/stage3_finetune.md). Its predictions are
# results/deployed_<split>.csv (run_deployed_predictions.py: full-resolution photographs, retina crop + mirror averaging, as the app runs).
DEPLOYED_THRESHOLD = 0.0964      # stage3Results.threshold: chosen on the validation split for 99% referable sensitivity
PRED = "deployed"
# The PREVIOUS model (224 px, APTOS 224 px copies only), kept for the record: results/app_<split>_<method>.csv, threshold 0.2.
PREVIOUS_THRESHOLD = 0.2
STORED = {"TP": 206, "TN": 292, "FP": 33, "FN": 17}                           # previous model's stage3Results, test split, threshold 0.2
BOOTSTRAPS = 2000
METHOD = "cropmirror"   # the app's pipeline for the previous model: retina crop + mirror averaging (see results/stage3_pipeline.md)


# ------------------------------------------------------------------ loading
def load(name):
    path = RESULTS / f"{name}.csv"
    rows = list(csv.DictReader(open(path, encoding="utf-8")))
    ids = [r["id"] for r in rows]
    labels = np.array([r["label"] for r in rows])
    probs = np.array([[float(r[f"p_{c}"]) for c in CLASSES] for r in rows])
    return ids, labels, probs


def referable_prob(probs):
    return probs[:, [CLASSES.index(c) for c in REFERABLE]].sum(1)


def is_referable(labels):
    return np.isin(labels, REFERABLE)


# ------------------------------------------------------------------ statistics
def wilson(k, n, z=1.96):
    if n == 0:
        return (float("nan"), float("nan"))
    p = k / n
    d = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / d
    half = z * np.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (float(centre - half), float(centre + half))


def auc(score, positive):
    """Area under the ROC curve via the Mann-Whitney U statistic (ties get half credit)."""
    pos, neg = score[positive], score[~positive]
    if len(pos) == 0 or len(neg) == 0:
        return float("nan")
    order = np.argsort(np.concatenate([pos, neg]), kind="mergesort")
    ranks = np.empty(len(order))
    combined = np.concatenate([pos, neg])[order]
    i = 0
    while i < len(combined):                      # average ranks over ties
        j = i
        while j + 1 < len(combined) and combined[j + 1] == combined[i]:
            j += 1
        ranks[order[i:j + 1]] = (i + j) / 2 + 1
        i = j + 1
    return float((ranks[:len(pos)].sum() - len(pos) * (len(pos) + 1) / 2) / (len(pos) * len(neg)))


def qwk(true_grade, pred_grade, k=5):
    """Quadratic weighted kappa, the standard agreement measure for DR grading (APTOS's own metric)."""
    O = np.zeros((k, k))
    for t, p in zip(true_grade, pred_grade):
        O[t, p] += 1
    W = np.array([[(i - j) ** 2 for j in range(k)] for i in range(k)]) / (k - 1) ** 2
    E = np.outer(O.sum(1), O.sum(0)) / O.sum()
    return float(1 - (W * O).sum() / (W * E).sum())


def confusion(labels, probs, thr):
    truth, pred = is_referable(labels), referable_prob(probs) >= thr
    return {"TP": int((pred & truth).sum()), "FN": int((~pred & truth).sum()),
            "TN": int((~pred & ~truth).sum()), "FP": int((pred & ~truth).sum())}


def rates(c):
    sens = c["TP"] / max(1, c["TP"] + c["FN"])
    spec = c["TN"] / max(1, c["TN"] + c["FP"])
    return {
        **c,
        "sensitivity": sens, "sensitivity_ci": wilson(c["TP"], c["TP"] + c["FN"]),
        "specificity": spec, "specificity_ci": wilson(c["TN"], c["TN"] + c["FP"]),
        "ppv": c["TP"] / max(1, c["TP"] + c["FP"]), "npv": c["TN"] / max(1, c["TN"] + c["FN"]),
    }


def predictive_values(sens, spec, prevalence):
    ppv = sens * prevalence / (sens * prevalence + (1 - spec) * (1 - prevalence))
    npv = spec * (1 - prevalence) / (spec * (1 - prevalence) + (1 - sens) * prevalence)
    return ppv, npv


def boot_ci(labels, probs, fn, seed=7):
    rng = np.random.default_rng(seed)
    n = len(labels)
    vals = [fn(labels[i], probs[i]) for i in (rng.integers(0, n, n) for _ in range(BOOTSTRAPS))]
    return tuple(float(x) for x in np.nanpercentile(vals, [2.5, 97.5]))


def summarise(labels, probs, thr):
    truth = is_referable(labels)
    tg = np.array([GRADE[l] for l in labels])
    pg = np.array([GRADE[CLASSES[i]] for i in probs.argmax(1)])
    a = auc(referable_prob(probs), truth)
    q = qwk(tg, pg)
    out = {
        "n": len(labels), "referable_n": int(truth.sum()),
        "auc": a, "auc_ci": boot_ci(labels, probs, lambda l, p: auc(referable_prob(p), is_referable(l))),
        "qwk": q, "qwk_ci": boot_ci(labels, probs, lambda l, p: qwk(np.array([GRADE[x] for x in l]), np.array([GRADE[CLASSES[i]] for i in p.argmax(1)]))),
        "accuracy_5class": float((tg == pg).mean()), "accuracy_5class_ci": wilson(int((tg == pg).sum()), len(tg)),
        "at_threshold": rates(confusion(labels, probs, thr)),
    }
    return out


def per_class_recall(labels, probs):
    pred = np.array([CLASSES[i] for i in probs.argmax(1)])
    return {c: (float((pred[labels == c] == c).mean()), int((labels == c).sum())) for c in GRADE}


def fmt_ci(v, ci, pct=True):
    return f"{v:.1%} ({ci[0]:.1%}-{ci[1]:.1%})" if pct else f"{v:.3f} ({ci[0]:.3f}-{ci[1]:.3f})"


def sweep(labels, probs, thresholds):
    return {round(t, 4): rates(confusion(labels, probs, t)) for t in thresholds}


# ------------------------------------------------------------------ analysis
def main():
    out, md = {}, []
    P = md.append

    ids_test, y_test, p_test = load(f"{PRED}_test")
    leak = json.loads((RESULTS / "leakage.json").read_text(encoding="utf-8"))
    leaked = set(leak["test_leaked_ids"])
    clean = np.array([i not in leaked for i in ids_test])

    # 1) Which preprocessing reproduces the model's stored results?
    P("## 1. Previous model: which preprocessing reproduces its stored test results?\n")
    P(f"The previous (224 px) model's own record (`stage3Results`, test split, threshold {PREVIOUS_THRESHOLD}): "
      f"TP {STORED['TP']}, TN {STORED['TN']}, FP {STORED['FP']}, FN {STORED['FN']}.\n")
    P("| Preprocessing | TP | TN | FP | FN | Matches stored result? |\n|---|---|---|---|---|---|")
    repro = {}
    for method, title in [("crop", "crop to retina + pad + resize (`preprocessForNetwork`)"), ("resize", "plain resize")]:
        _, y, p = load(f"app_test_{method}")
        c = confusion(y, p, PREVIOUS_THRESHOLD)
        exact = all(c[k] == STORED[k] for k in STORED)
        repro[method] = {**c, "exact_match": exact}
        P(f"| {title} | {c['TP']} | {c['TN']} | {c['FP']} | {c['FN']} | {'**yes, exactly**' if exact else 'no'} |")
    out["reproduction_of_stored_result"] = repro

    ids_b, yb, _ = load("baseline_test_crop")
    saved = {r["id"]: r["saved_prediction"] for r in csv.DictReader(open(RESULTS / "baseline_saved_test.csv", encoding="utf-8"))}
    P("\nControl: the *baseline* network saved its own test predictions. Fresh predictions vs those saved ones:\n")
    P("| Preprocessing | Identical to the saved prediction |\n|---|---|")
    ctrl = {}
    for method in ("crop", "resize"):
        ids_m, _, pm = load(f"baseline_test_{method}")
        same = sum(CLASSES[i] == saved[id_] for id_, i in zip(ids_m, pm.argmax(1)))
        ctrl[method] = same / len(ids_m)
        P(f"| {method} | {same}/{len(ids_m)} ({same / len(ids_m):.1%}) |")
    out["baseline_control_agreement"] = ctrl
    best_method = max(ctrl, key=ctrl.get)
    P(f"\nThe baseline's saved predictions are best reproduced by **{best_method}** preprocessing.\n")

    # 2) Held-out performance of the deployed model
    P("## 2. Held-out performance of the deployed model (full-resolution photographs)\n")
    P(f"Referable = moderate NPDR or worse. Operating point: referable probability >= {DEPLOYED_THRESHOLD}. "
      "95% intervals: Wilson (rates), bootstrap (AUC, kappa).\n")
    P("| Data | n (referable) | Sensitivity | Specificity | AUC | Kappa (5-class) | 5-class accuracy |\n|---|---|---|---|---|---|---|")
    perf = {}
    views = {
        "test (all)": (y_test, p_test),
        "test (excluding images duplicated in train/val)": (y_test[clean], p_test[clean]),
    }
    _, y_val, p_val = load(f"{PRED}_validation")
    views["validation"] = (y_val, p_val)
    _, y_tr, p_tr = load(f"{PRED}_train")
    views["training sample (500)"] = (y_tr, p_tr)
    for name, (y, p) in views.items():
        s = summarise(y, p, DEPLOYED_THRESHOLD)
        perf[name] = s
        r = s["at_threshold"]
        P(f"| {name} | {s['n']} ({s['referable_n']}) | {fmt_ci(r['sensitivity'], r['sensitivity_ci'])} | "
          f"{fmt_ci(r['specificity'], r['specificity_ci'])} | {fmt_ci(s['auc'], s['auc_ci'], False)} | "
          f"{fmt_ci(s['qwk'], s['qwk_ci'], False)} | {fmt_ci(s['accuracy_5class'], s['accuracy_5class_ci'])} |")
    out["performance"] = perf
    P("")

    # 3) Per-class recall and confusion on the test set
    P("## 3. Per-grade behaviour on the test set (5-class argmax)\n")
    P("| True grade | n | Recognised as that grade |\n|---|---|---|")
    pcr = per_class_recall(y_test, p_test)
    for g in GRADE:
        rec, n = pcr[g]
        P(f"| {g} | {n} | {rec:.0%} |")
    out["per_class_recall_test"] = {g: v[0] for g, v in pcr.items()}
    P("\nMisses (referable images called non-referable) by true grade at the deployed threshold:\n")
    truth_ref, pred_ref = is_referable(y_test), referable_prob(p_test) >= DEPLOYED_THRESHOLD
    P("| True grade | Referable images | Missed |\n|---|---|---|")
    for g in REFERABLE:
        m = y_test == g
        P(f"| {g} | {int(m.sum())} | {int((m & ~pred_ref).sum())} |")
    P("")

    # 4) Threshold: was 0.2 a sound choice, and would validation have picked it?
    P("## 4. Threshold behaviour (deployed model and pipeline)\n")
    P("| Threshold | Val sens | Val spec | Test sens | Test spec |\n|---|---|---|---|---|")
    ths = sorted({0.05, DEPLOYED_THRESHOLD, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.7})
    sv, st = sweep(y_val, p_val, ths), sweep(y_test, p_test, ths)
    for t in ths:
        mark = " (deployed)" if abs(t - DEPLOYED_THRESHOLD) < 1e-9 else ""
        k = round(t, 4)
        P(f"| {t:.3g}{mark} | {sv[k]['sensitivity']:.1%} | {sv[k]['specificity']:.1%} | {st[k]['sensitivity']:.1%} | {st[k]['specificity']:.1%} |")
    out["threshold_sweep"] = {"validation": {str(k): v for k, v in sv.items()}, "test": {str(k): v for k, v in st.items()}}
    fine = np.round(np.arange(0.02, 0.96, 0.01), 2)
    vfine = sweep(y_val, p_val, fine)

    def pick(rule):
        ok = [t for t in fine if rule(vfine[t])]
        return None if not ok else ok
    picks = {}
    a = pick(lambda r: r["sensitivity"] >= 0.99)
    picks["highest threshold with validation sensitivity >= 99%"] = float(max(a)) if a else None
    a = pick(lambda r: r["sensitivity"] >= 0.90)
    picks["highest threshold with validation sensitivity >= 90%"] = float(max(a)) if a else None
    a = pick(lambda r: r["sensitivity"] >= 0.95)
    picks["highest threshold with validation sensitivity >= 95%"] = float(max(a)) if a else None
    youden = max(fine, key=lambda t: vfine[t]["sensitivity"] + vfine[t]["specificity"] - 1)
    picks["maximum Youden J on validation"] = float(youden)
    P("\nThresholds chosen using the **validation** set only, then applied unchanged to the **test** set "
      "(the honest way to set an operating point):\n")
    P("| Rule (chosen on validation) | Threshold | Test sensitivity | Test specificity |\n|---|---|---|---|")
    chosen = {}
    for rule, t in picks.items():
        if t is None:
            continue
        r = rates(confusion(y_test, p_test, t))
        chosen[rule] = {"threshold": t, "test": r}
        P(f"| {rule} | {t:.2f} | {fmt_ci(r['sensitivity'], r['sensitivity_ci'])} | {fmt_ci(r['specificity'], r['specificity_ci'])} |")
    out["validation_chosen_thresholds"] = chosen
    P("")

    # 5) Screening prevalence
    P("## 5. What the numbers mean in a real screening population\n")
    P("APTOS is enriched with disease: about 41% of these images are referable. In a general diabetic screening clinic "
      "the share is far lower, which changes what a positive result means (positive/negative predictive value).\n")
    r = perf["test (excluding images duplicated in train/val)"]["at_threshold"]
    P(f"Using the leakage-adjusted test sensitivity ({r['sensitivity']:.1%}) and specificity ({r['specificity']:.1%}):\n")
    P("| Referable prevalence in the screened population | Positive predictive value | Negative predictive value | Of 1,000 patients: flagged | of which truly referable |\n|---|---|---|---|---|")
    pv = {}
    for prev in (0.41, 0.20, 0.10, 0.05):
        ppv, npv = predictive_values(r["sensitivity"], r["specificity"], prev)
        flagged = 1000 * (r["sensitivity"] * prev + (1 - r["specificity"]) * (1 - prev))
        pv[str(prev)] = {"ppv": ppv, "npv": npv, "flagged_per_1000": flagged}
        P(f"| {prev:.0%} | {ppv:.1%} | {npv:.1%} | {flagged:.0f} | {1000 * prev * r['sensitivity']:.0f} |")
    out["predictive_values"] = pv


    # 5b) The app's original rule (most likely grade) versus the tuned referable-probability threshold
    P("\n## 5b. Decision rule: most-likely grade vs the tuned referable-probability threshold\n")
    P("The model was tuned to flag an eye as referable when the summed probability of Moderate, Severe and Proliferate "
      f"is at least {DEPLOYED_THRESHOLD} (the 'high sensitivity' operating point). Deciding instead from the single "
      "most-likely grade (argmax) ignores that tuning.\n")
    argmax_ref = np.isin(np.array([CLASSES[i] for i in p_test.argmax(1)]), REFERABLE)
    truth = is_referable(y_test)
    ca = {"TP": int((argmax_ref & truth).sum()), "FN": int((~argmax_ref & truth).sum()),
          "TN": int((~argmax_ref & ~truth).sum()), "FP": int((argmax_ref & ~truth).sum())}
    ct = confusion(y_test, p_test, DEPLOYED_THRESHOLD)
    P("| Rule (test set) | Referable found | Referable missed | False alarms | Sensitivity | Specificity |\n|---|---|---|---|---|---|")
    rules = {}
    for name, c in (("most-likely grade (argmax)", ca), ("referable probability threshold", ct)):
        r = rates(c)
        rules[name] = r
        shown = f"referable probability >= {DEPLOYED_THRESHOLD:.3g}" if name == "referable probability threshold" else name
        P(f"| {shown} | {c['TP']} | {c['FN']} | {c['FP']} | {fmt_ci(r['sensitivity'], r['sensitivity_ci'])} | {fmt_ci(r['specificity'], r['specificity_ci'])} |")
    out["rule_comparison"] = rules

    # Confusion matrix and the individual serious misses
    P("\n## 5c. Full confusion matrix (test set, rows = true grade, columns = most-likely grade)\n")
    order = ["No_DR", "Mild", "Moderate", "Severe", "Proliferate_DR"]
    P("| True / Predicted | " + " | ".join(order) + " |\n|---|" + "---|" * len(order))
    pred_lbl = np.array([CLASSES[i] for i in p_test.argmax(1)])
    for t in order:
        P(f"| {t} | " + " | ".join(str(int(((y_test == t) & (pred_lbl == q)).sum())) for q in order) + " |")
    rp = referable_prob(p_test)
    P("\nSevere or Proliferate images NOT flagged at the deployed threshold:\n")
    bad = [(ids_test[i], y_test[i], float(rp[i]), pred_lbl[i], ids_test[i] in leaked) for i in range(len(ids_test))
           if y_test[i] in ("Severe", "Proliferate_DR") and rp[i] < DEPLOYED_THRESHOLD]
    if bad:
        P("| Image | True grade | Referable probability | Most likely grade | Has duplicate in train/val |\n|---|---|---|---|---|")
        for i, t, r_, q, dup in bad:
            P(f"| {i} | {t} | {r_:.2f} | {q} | {'yes' if dup else 'no'} |")
    else:
        P("None.")
    out["missed_severe_or_proliferate"] = [{"id": i, "label": t, "referable_probability": r_, "predicted": q} for i, t, r_, q, _ in bad]

    # 5d) crop vs resize on every split, for completeness
    P("\n## 5d. Previous model: preprocessing comparison on held-out data (`cropmirror` is what the app ran; `resize` is what that network was trained with)\n")
    P("| Data | Preprocessing | Sensitivity | Specificity | AUC |\n|---|---|---|---|---|")
    for split in ("test", "validation"):
        for method in ("resize", "crop", "cropmirror"):
            _, yy, pp = load(f"app_{split}_{method}")
            r = rates(confusion(yy, pp, PREVIOUS_THRESHOLD))
            P(f"| {split} | {method} | {r['sensitivity']:.1%} | {r['specificity']:.1%} | {auc(referable_prob(pp), is_referable(yy)):.3f} |")

    # 6) Leakage summary
    L = leak["summary"]
    P("\n## 6. Data-leakage audit\n")
    P(f"- Images audited: {L['images']}. Exact duplicate pairs: {L['exact_pairs']}; duplicate or near-duplicate pairs in total: {L['duplicate_pairs_total']}.")
    P(f"- **Test images with a duplicate in the training or validation data: {L['test_images_with_a_duplicate_in_train_or_validation']} of {len(ids_test)} "
      f"({L['test_images_with_a_duplicate_in_train_or_validation'] / len(ids_test):.1%}).**")
    P(f"- Validation images with a duplicate in training: {L['validation_images_with_a_duplicate_in_train']} of 550.")
    P(f"- Duplicate pairs whose labels *disagree* (same image, different label): {L['duplicate_pairs_with_conflicting_labels']}.\n")
    out["leakage"] = L

    # 7) Deployed vs previous model, like for like (full-resolution photographs, the app's pipeline, each at its own threshold)
    P("\n## 7. Deployed model vs the previous model (full-resolution photographs, each at its own threshold)\n")
    P("The previous model was trained only on 224 px APTOS copies; given the full-resolution photographs a clinic uploads, its specificity is lower "
      "than on those copies. IDRiD: the official test set (103 photographs). The deployed model trained on IDRiD's training set, so IDRiD test is "
      "held out but not an unseen camera for it; for the previous model it is fully external.\n")
    P("| Data | Model | Threshold | Sensitivity | Specificity | AUC |\n|---|---|---|---|---|---|")
    compare = {}
    for data, prev_csv, new_csv in (("APTOS test", "ft_deployed_aptos_test", f"{PRED}_test"),
                                    ("IDRiD test", "ft_deployed_idrid_test", "ft_run2_finetuned_idrid_test")):
        for model, name, thr in (("previous", prev_csv, PREVIOUS_THRESHOLD), ("deployed", new_csv, DEPLOYED_THRESHOLD)):
            _, yy, pp = load(name)
            s = summarise(yy, pp, thr)
            compare[f"{data}, {model}"] = s
            r = s["at_threshold"]
            P(f"| {data} | {model} | {thr:.3g} | {fmt_ci(r['sensitivity'], r['sensitivity_ci'])} | {fmt_ci(r['specificity'], r['specificity_ci'])} | "
              f"{fmt_ci(s['auc'], s['auc_ci'], False)} |")
    out["model_comparison"] = compare
    out["external_idrid_test"] = compare["IDRiD test, deployed"]
    out["deployed_threshold"] = DEPLOYED_THRESHOLD

    (RESULTS / "metrics.json").write_text(json.dumps(out, indent=1, default=float), encoding="utf-8")
    text = "\n".join(md)
    (RESULTS / "tables.md").write_text(text, encoding="utf-8")
    print(text)


if __name__ == "__main__":
    main()
