"""Turn core.analyse() output into the calibration report (Markdown). Plain text in, plain text out; no MATLAB."""
import datetime as _dt

from core import (COMFORTABLE_NEGATIVES, COMFORTABLE_POSITIVES, GRADE_NAMES, MAX_RECOMMENDED_THRESHOLD, MIN_POSITIVES_TO_RECOMMEND,
                  SENSITIVITY_TARGETS, positives_needed)


def pct(x, digits=1):
    return "n/a" if x != x else f"{x * 100:.{digits}f}%"


def ci(r, key):
    lo, hi = r[f"{key}_ci"]
    return f"{pct(r[key])} ({pct(lo)} to {pct(hi)})"


def render_markdown(result, meta=None):
    """`meta` (all optional): site, model_threshold, quality (counts), missing_images, label_problems, missed_ids, generated."""
    meta = meta or {}
    r = result
    L = []
    add = L.append
    dep = r["at_deployed"]
    rec = r["recommendation"]

    add(f"# Referral-threshold calibration report{(': ' + meta['site']) if meta.get('site') else ''}\n")
    add(f"Generated {meta.get('generated') or _dt.date.today().isoformat()}. "
        f"Model threshold in use: **{r['deployed_threshold']:.2f}** (referral score; an eye is flagged at or above it).\n")
    add("> **This report is evidence, not approval.** The acceptable miss rate is a clinical decision, and changing the threshold changes the balance "
        "between missed disease and false referrals. A qualified clinician must choose the sensitivity target and approve any change. "
        "It describes only the images analysed here; it does not show the tool is suitable for patients.\n")

    add("## 1. The data\n")
    add(f"- **{r['n']} graded images**: {r['positives']} referable (moderate or worse) and {r['negatives']} not referable "
        f"({pct(r['observed_prevalence'])} referable).")
    counts = r["class_counts"]
    if sum(counts.values()) == r["n"] and any(counts[g] for g in ("Mild", "Severe", "Proliferate_DR")):
        add("- By grade: " + ", ".join(f"{g} {counts[g]}" for g in GRADE_NAMES) + ".")
    if meta.get("quality"):
        q = meta["quality"]
        add(f"- Photo-quality check: {q['accept']} accepted, {q['warn']} accepted with a warning, {q['reject']} rejected"
            f"{' (rejected photos are excluded from every figure below)' if q.get('excluded_rejected') else ''}.")
    if meta.get("missing_images"):
        add(f"- **{len(meta['missing_images'])} labelled images were not found and were skipped** (first few: {', '.join(meta['missing_images'][:5])}).")
    for problem in meta.get("label_problems", [])[:5]:
        add(f"- Label problem, {problem}")
    add(f"- Ability of the score to separate referable from non-referable eyes (AUC): **{r['auc']:.3f}**.\n")
    for w in r["warnings"]:
        add(f"> **Warning:** {w}\n")

    add("## 2. Result at the threshold now in use\n")
    add(f"At {r['deployed_threshold']:.2f}: sensitivity **{ci(dep, 'sensitivity')}**, specificity **{ci(dep, 'specificity')}**; "
        f"{dep['FN']} of {dep['TP'] + dep['FN']} referable cases not flagged, {dep['FP']} of {dep['TN'] + dep['FP']} non-referable eyes flagged "
        f"({pct(dep['flagged_share'], 0)} of all images flagged).\n")

    add("## 3. What each sensitivity target would cost on this data\n")
    add("Each row is the highest threshold (fewest false referrals) whose sensitivity reaches the target"
        f"{', with the LOWER end of its 95% confidence interval reaching it' if r['bound'] == 'lower' else ''}. "
        "These figures are measured on the same images the threshold was chosen on, so they are optimistic (see section 4).\n")
    add("| Sensitivity target | Threshold | Sensitivity (95% CI) | Specificity (95% CI) | Images flagged |\n|---|---|---|---|---|")
    for tgt in SENSITIVITY_TARGETS:
        o = r["options"][tgt]
        if o is None:
            add(f"| {pct(tgt, 0)} | not reachable | | | |")
        else:
            add(f"| {pct(tgt, 0)} | {o['threshold']:.2f} | {ci(o, 'sensitivity')} | {ci(o, 'specificity')} | {pct(o['flagged_share'], 0)} |")
    add("")

    add("## 4. Recommendation\n")
    if rec is None:
        add(f"**No threshold recommended.** {r['recommendation_note']}\n")
    else:
        h = rec["holdout"]
        if rec.get("capped"):
            add(f"> The data would allow an even higher threshold, but the app accepts at most {MAX_RECOMMENDED_THRESHOLD:.2f}. That value still meets the target (a lower threshold can only flag more eyes), at the cost of more false referrals.\n")
        add(f"For a sensitivity target of **{pct(rec['target'], 0)}**: threshold **{rec['threshold']:.2f}** (currently {r['deployed_threshold']:.2f}).\n")
        add("| | On all the data (optimistic) | On images not used to choose it (fair) |\n|---|---|---|")
        if h:
            add(f"| Sensitivity | {ci(rec, 'sensitivity')} | {pct(h['held_out_sensitivity_mean'])} on average; the worst 5% of splits were below {pct(h['held_out_sensitivity_p5'])} |")
            add(f"| Specificity | {ci(rec, 'specificity')} | {pct(h['held_out_specificity_mean'])} on average |")
            add(f"| Reached the target on unseen images | | {pct(h['share_reaching_target'], 0)} of {h['usable_repeats']} repeated splits |")
            add(f"\nThe threshold that would be chosen varies with the sample: median {h['threshold_median']:.2f} "
                f"(middle 80% of splits: {h['threshold_p10']:.2f} to {h['threshold_p90']:.2f}). "
                "A wide spread means the sample is too small to pin the threshold down.\n")
        else:
            add(f"| Sensitivity | {ci(rec, 'sensitivity')} | could not be estimated |\n| Specificity | {ci(rec, 'specificity')} | |\n")
        need = positives_needed(rec["target"])
        add(f"To know a sensitivity of {pct(rec['target'], 0)} to within about 5 points, roughly {need} referable cases are needed; this sample has {r['positives']}.\n")

    add("## 5. What a flag means at your prevalence\n")
    add(f"Using {'the prevalence you supplied' if r['prevalence_used'] != r['observed_prevalence'] else 'the prevalence in this sample'} "
        f"({pct(r['prevalence_used'])} referable). A graded sample is usually enriched with disease; a screening clinic is not, and the "
        "chance that a flag is a true referral falls as disease gets rarer.\n")
    add("| Threshold | Chance a flag is truly referable | Chance a non-flag is truly fine | Flagged per 1,000 patients |\n|---|---|---|---|")
    for label, name in (("deployed", f"{r['deployed_threshold']:.2f} (in use)"), ("recommended", f"{rec['threshold']:.2f} (recommended)" if rec else None)):
        v = r["predictive_values"].get(label)
        if v and name:
            add(f"| {name} | {pct(v['ppv'], 0)} | {pct(v['npv'], 1)} | {v['flagged_per_1000']:.0f} |")
    add("")

    if meta.get("missed_ids") is not None:
        which = "recommended" if rec else "current"
        add(f"## 6. Referable cases NOT flagged at the {which} threshold\n")
        if meta["missed_ids"]:
            add("Have a clinician look at these: they are the cases the tool would miss.\n")
            add("| Image | Grade | Referral score |\n|---|---|---|")
            for image_id, grade, s in meta["missed_ids"][:40]:
                add(f"| {image_id} | {grade} | {s:.2f} |")
            if len(meta["missed_ids"]) > 40:
                add(f"\n... and {len(meta['missed_ids']) - 40} more (see the JSON file).")
        else:
            add("None in this sample.")
        add("")

    add("## 7. If you decide to change the threshold\n")
    if rec:
        add(f"1. Get written sign-off from your clinical lead for a sensitivity target and the resulting threshold ({rec['threshold']:.2f}).")
    else:
        add("1. Get written sign-off from your clinical lead for a sensitivity target and the resulting threshold.")
    add("2. Set it in `backend/.env` as `REFERRAL_THRESHOLD=<value>` (accepted range 0.02 to "
        f"{MAX_RECOMMENDED_THRESHOLD}) and restart the backend. Every result then shows the effective threshold, and `/api/health` reports it.")
    add("3. Keep this report and the graded sample with your records, and repeat the calibration when the camera, the operator, or the patient population changes.")
    add(f"4. The minimum for any recommendation is {MIN_POSITIVES_TO_RECOMMEND} referable cases; {COMFORTABLE_POSITIVES} referable and {COMFORTABLE_NEGATIVES} non-referable are comfortable.")
    add("")
    return "\n".join(L)
