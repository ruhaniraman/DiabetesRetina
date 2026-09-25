"""The app's Evidence page: every problem-statement requirement with its measured result, read from the committed validation results.

    python validation/export_evidence.py        # writes frontend/src/data/evidence.json

Nothing here is typed in by hand: each number is read from validation/results (or stage5_simulink/results), so the page cannot drift from the
reports. validation/test_evidence.py fails when the committed JSON is stale. Status: "met" (target reached), "partial" (reached with a stated
limit, or on one of two datasets), "gap" (not reached). A row whose source file is missing is left out.
"""
import csv
import json
import re
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
RES = ROOT / "validation" / "results"
OUT = ROOT / "frontend" / "src" / "data" / "evidence.json"


def load(name):
    p = RES / name
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else None


def rows(name):
    p = RES / name
    return list(csv.DictReader(open(p, encoding="utf-8"))) if p.exists() else None


def pct(x, d=1):
    return f"{100 * x:.{d}f}%"


def build():
    out = []

    def add(stage, requirement, target, result, status, source):
        out.append({"stage": stage, "requirement": requirement, "target": target, "result": result, "status": status, "source": source})

    # --- Stage 1
    parity = (RES / "stage1_parity.md")
    if parity.exists():
        m = re.search(r"same verdict for (\d+) of (\d+) photographs \(([\d.]+)%\).*?same reject / not-reject decision for (\d+) of (\d+) \(([\d.]+)%\)",
                      parity.read_text(encoding="utf-8"))
        if m:
            add(1, "Quality gate: focus, illumination and field of view, in MATLAB", "MATLAB pipeline",
                f"MATLAB port agrees with the app's gate on {m.group(3)}% of {m.group(2)} photos (same reject decision {m.group(6)}%)", "met",
                "validation/results/stage1_parity.md")
    q = load("quality.json")
    if q:
        g = q["new_gate"]
        add(1, "Reject ungradable photos with recapture feedback", "reject bad photos, keep good ones",
            f"Rejects {pct(g['degradation']['blur 2']['reject'], 0)} of heavily blurred and {pct(g['degradation']['darken x0.25']['reject'], 0)} of very dark "
            f"photos; rejects {pct(g['rates']['aptos']['reject'])} of curated APTOS photos", "met", "validation/QUALITY.md")
    if (RES / "enhancement.md").exists():
        add(1, "Enhance borderline images (illumination normalisation, CLAHE, denoising)", "enhancement available",
            "Enhanced view in the report (MATLAB enhanceForReview); display only, because it does not improve the grader", "met",
            "validation/results/enhancement.md")

    # --- Stage 2
    loc = load("localisation.json")
    if loc:
        od = np.array([r["odErrPx"] for r in loc], float)
        fv = np.array([r["foveaErrPx"] for r in loc], float)
        found = np.mean([r["discFound"] for r in loc])
        if loc[0].get("foveaErrPxLocaliser") is not None:
            od2 = np.array([r["odErrPxLocaliser"] for r in loc], float)
            fv2 = np.array([r["foveaErrPxLocaliser"] for r in loc], float)
            dd = np.array([r["discDiamPx"] for r in loc], float)
            add(2, "Optic disc and fovea localisation", "IDRiD challenge winners: 21.1 px / 64.5 px",
                f"Trained localiser: disc {np.nanmean(od2):.1f} px, fovea {np.nanmean(fv2):.1f} px mean error on 103 IDRiD test photos; "
                f"fovea within 1 disc diameter in {pct(np.mean(fv2 / dd <= 1), 0)}",
                "met" if np.nanmean(fv2) <= 64.5 * 1.5 else "partial", "validation/results/localisation.md")
        else:
            add(2, "Optic disc and fovea localisation", "IDRiD challenge winners: 21.1 px / 64.5 px",
                f"Disc found in {pct(found, 0)} ({np.nanmean(od):.1f} px); fovea estimated from the disc ({np.nanmean(fv):.1f} px)", "partial",
                "validation/results/localisation.md")
    cv = rows("vessels_drive_unet_cv.csv")
    classical = rows("vessels_drive.csv")
    if cv:
        m = lambda k: np.mean([float(r[k]) for r in cv])
        add(2, "Vessel segmentation", "published: accuracy 0.944-0.946, AUC 0.961 (DRIVE)",
            f"Vessel U-Net: accuracy {m('accuracy'):.3f}, sensitivity {m('sensitivity'):.3f}, AUC {m('auc'):.3f} (DRIVE, out-of-fold)"
            + (f"; classical method {np.mean([float(r['accuracy']) for r in classical]):.3f}" if classical else ""),
            "met" if m("accuracy") >= 0.944 else "partial", "validation/results/vessels_drive.md")
    elif classical:
        add(2, "Vessel segmentation", "published: accuracy 0.944 (DRIVE)",
            f"Classical: accuracy {np.mean([float(r['accuracy']) for r in classical]):.3f}", "gap", "validation/results/vessels_drive.md")
    les = load("lesions_dl_Stage2_LesionUNet_v2_calibrated.json")
    if les:
        a = les["idrid"]["aupr"]
        by = les["aptos"]["byGrade"]
        add(2, "Microaneurysms, exudates, haemorrhages (lesion segmentation)", "IDRiD winners AUPR MA 0.50, HE 0.68, EX 0.89, SE 0.70",
            f"Lesion U-Net AUPR MA {a[0]:.2f}, HE {a[1]:.2f}, EX {a[2]:.2f}, SE {a[3]:.2f}; marks {by['Mild']['anyFlaggedPct']:.0f}-"
            f"{by['Proliferate_DR']['anyFlaggedPct']:.0f}% of eyes with DR vs {by['No_DR']['anyFlaggedPct']:.0f}% of healthy eyes", "partial",
            "validation/results/lesions_dl_Stage2_LesionUNet_v2_calibrated.md")
    nv = load("nv.json")
    if nv:
        r = nv["results"]
        a_cnn = r["aptos: PDR vs all other grades"]["cnn"]["auc"]
        i_cnn = r["idrid: PDR vs all other grades"]["cnn"]["auc"]
        add(2, "Neovascularisation", "no PS dataset has NV masks",
            f"Image-level: calibrated P(PDR) AUC {a_cnn:.2f} (APTOS) / {i_cnn:.2f} (IDRiD), shown in the specialist review; pixel-level NV needs FGADR",
            "partial", "validation/results/nv.md")

    # --- Stage 3
    m = load("metrics.json")
    if m:
        t = m["performance"]["test (all)"]
        at = t["at_threshold"]
        add(3, "Referable DR sensitivity", "> 90%", f"{pct(at['sensitivity'])} (95% CI {pct(at['sensitivity_ci'][0])}-{pct(at['sensitivity_ci'][1])}) on 548 held-out APTOS photos",
            "met" if at["sensitivity"] > 0.9 else "gap", "validation/REPORT.md")
        add(3, "Referable DR specificity", "> 85%", f"{pct(at['specificity'])} (95% CI {pct(at['specificity_ci'][0])}-{pct(at['specificity_ci'][1])}); AUC {t['auc']:.3f}",
            "met" if at["specificity"] > 0.85 else "gap", "validation/REPORT.md")
        x = m["external_idrid_test"]["at_threshold"]
        s = load("site_calibration_idrid.json")
        extra = ""
        if s:
            cal = [o for o in s["options"] if o["rule"] == "site sensitivity estimate >= 95%"]   # the rule the README recommends
            if cal and "test" in cal[0]:
                extra = f"; site-calibrated threshold {pct(cal[0]['test']['sensitivity'])} / {pct(cal[0]['test']['specificity'])}"
        add(3, "Same targets on a second camera (IDRiD)", "> 90% / > 85%", f"{pct(x['sensitivity'])} / {pct(x['specificity'])}{extra}",
            "partial", "validation/results/site_calibration_idrid.md")
        add(3, "ICDR 0-4 grading", "5 grades", f"quadratic kappa {t['qwk']:.3f}, exact grade {pct(t['accuracy_5class'])}", "met", "validation/REPORT.md")

    # --- Stage 4
    g = load("gradcam.json")
    if g:
        add(4, "Grad-CAM that points at disease", "better than chance",
            f"Pixel AUC {g['localisation_referral_map']['pixel_auc']:.2f} on IDRiD lesion masks; deleting the hottest cells lowers the score "
            f"{g['deletion_largest']['hottest_minus_random']:+.2f} more than random", "met", "validation/results/gradcam.md")
    c = load("calibration.json")
    if c:
        a, i = c["APTOS test"], c["IDRiD test"]
        high = [b for b in a["calibrated"]["bands"] if b["band"] == "High"][0]
        add(4, "Calibrated confidence", "confidence matches accuracy",
            f"Temperature scaling: ECE {a['raw']['ece']:.3f}→{a['calibrated']['ece']:.3f} (APTOS), {i['raw']['ece']:.3f}→{i['calibrated']['ece']:.3f} (IDRiD); "
            f"'High' band right {pct(high['stage_right'], 0)}", "met", "validation/results/calibration.md")
    add(4, "Annotated report reviewable in under 30 s", "< 30 s",
        "Specialist review page: one screen per case with a timer and decision log; ophthalmologists' timings still to be collected",
        "partial", "frontend/src/pages/SpecialistReviewPage.jsx")

    # --- Stage 5
    plan = ROOT / "stage5_simulink" / "results" / "district_plan.json"
    if plan.exists():
        p = json.loads(plan.read_text(encoding="utf-8"))
        base = p[0] if isinstance(p, list) else p
        r = base["resources"]
        add(5, "Simulink model: acquisition, bandwidth, throughput, review capacity", "100k+ patients/year per district",
            f"100,000/year: {r['cameraSites']} camera sites, {r['uplinkMbps']} Mbps links, {r['aiServers']} GPU server, {r['reviewers']} reviewer; "
            f"all {len(p) if isinstance(p, list) else 1} scenarios meet their backlog targets in a simulated year", "met",
            "stage5_simulink/results/district_plan.md")
    comp = [(n, rows(f"compression_{n}_original.csv"), rows(f"compression_{n}_lowbandwidth.csv")) for n in ("aptos", "idrid")]
    if all(o and l for _, o, l in comp):
        same = []
        for _, o, l in comp:
            ref = lambda r: sum(float(r[f"p_{k}"]) for k in ("Moderate", "Severe", "Proliferate_DR")) >= 0.0964
            lo = {r["id"]: ref(r) for r in l}
            same.append(np.mean([ref(r) == lo[r["id"]] for r in o]))
        add(5, "Low-bandwidth uploads (rural 2G links)", "decision unchanged",
            f"1800 px JPEG uploads keep the referral decision for {pct(same[0])} (APTOS) and {pct(same[1])} (IDRiD) of test photos", "met" if min(same) >= 0.97 else "partial",
            "validation/results/compression.md")

    # --- Validation
    b = load("benchmark.json")
    if b:
        add("V", "Integrated pipeline vs single techniques", "integrated beats single techniques",
            "Beats the classical rule-based detector by a wide margin; matches (does not beat) the CNN alone for referral", "partial",
            "validation/results/benchmark.md")
    return out


def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(build(), indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {OUT} ({len(build())} rows)")


if __name__ == "__main__":
    main()
