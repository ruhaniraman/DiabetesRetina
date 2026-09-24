# Site calibration: choosing the referral threshold on your own images

The app flags an eye for referral when its referral score (probability of Moderate + Severe + Proliferate DR) reaches a
threshold. The deployed model's own threshold is **0.096**, chosen on validation data that is mostly APTOS for 99% sensitivity. On IDRiD's
official test set it keeps sensitivity (90.6%) but flags 74% of all photographs, because specificity is only 53.8% (`validation/REPORT.md`).
Choosing the threshold on IDRiD's own validation photographs instead gives 89.1% / 74.4% on its test set
(`validation/results/site_calibration_idrid.md`). A clinic's camera and patients differ from both datasets, so this tool measures the trade-off on
**your** graded photographs and shows what a different threshold would cost.

> **This produces evidence, not approval.** How many referable cases a screening programme may miss is a clinical decision.
> The tool never picks a target for you: without `--target-sensitivity` it only shows the table of options. Any change to the
> threshold needs the sign-off of a qualified clinician, and the result describes only the images you supplied.

## What you need

1. **A folder of fundus photographs** (JPG/PNG/TIFF/BMP, searched recursively), taken with the camera and workflow you will really use.
2. **A labels file (CSV)**: one row per image. The first column is the image name (extension optional), and a column called
   `grade`, `label`, `diagnosis` (or `retinopathy grade`, or name it with `--label-col`) holds the **clinician's DR grade**:
   `0-4` or `No_DR / Mild / Moderate / Severe / Proliferate_DR`. For plain yes/no referral labels use `--label-type binary` (1 = referable).
   See `example/labels.csv`.
3. **MATLAB with the model** (`Stage3_Final_HighSensitivity_Model.mat`, same setup as the backend). Or pass `--predictions` from an earlier run.

Rules the tool enforces rather than guesses:

- Every image name must be unique. If two rows share a name it stops. When the same file name exists in several folders, put a relative path in the labels
  file (`a. Training Set/IDRiD_001.jpg`). The public IDRiD set needs this: its training and testing folders both contain `IDRiD_001`.
- Images the labels file names but the folder lacks are listed in the report and skipped.
- Photos the Stage 1 quality gate rejects are excluded from every figure (`--include-rejected` keeps them; `--skip-quality` skips the check).
- Grade every image independently of the app's output. Do not label photos after seeing what the tool said about them.

## How much data

| | |
|---|---|
| Absolute minimum for any recommendation | 30 referable cases (fewer: the tool refuses to recommend) |
| Comfortable | about 140 referable and 140 non-referable |
| Why | 140 referable cases pins a 90% sensitivity to within about 5 percentage points; with 30 the interval is very wide |

Both kinds of eye are needed. If a sample has no referable, or no non-referable, eyes the tool says so and stops.

## Run it

```bash
python calibration/calibrate_site.py --images D:/site_images --labels D:/site_grades.csv --site "Clinic name"
```
This shows the options table. After your clinical lead names a target:
```bash
python calibration/calibrate_site.py --images D:/site_images --labels D:/site_grades.csv \
    --target-sensitivity 0.95 --prevalence 0.08 --site "Clinic name"
```

| Option | Meaning |
|---|---|
| `--target-sensitivity` | the sensitivity the clinical lead requires (0.5 to 1). Without it nothing is recommended |
| `--bound lower` (default) / `point` | `lower`: the 95% **lower** confidence limit must reach the target (conservative). `point`: the estimate must |
| `--prevalence` | the share of referable eyes in your real screening population. A graded sample is usually enriched with disease, so this changes how many flags are true referrals |
| `--current-threshold` | the threshold in use now (default: the deployed model's, 0.096) |
| `--predictions <csv>` | reuse `predictions.csv` from an earlier run, skipping the slow model run |
| `--limit N` | first N labelled images, for a quick trial only (a prefix may contain only one kind of eye) |
| `--out` | output folder (default `calibration/output/<time>`, git-ignored) |

Output: `calibration_report.md` (read this), `calibration_results.json`, `threshold_sweep.csv`, `predictions.csv`.
`example/` holds a real run: the whole IDRiD set (511 usable images) standing in for a clinic.

## Reading the report

- **Section 3** lists, for each sensitivity target, the *highest* threshold that meets it, with confidence intervals. These use the same images the threshold was chosen on, so they are **optimistic**.
- **Section 4** repeats the choice many times: pick the threshold on part of the data, measure it on the rest. The right-hand column is the honest estimate. If "reached the target on unseen images" is well below 100%, or the middle 80% of thresholds is wide, the sample is too small or too unlike the future patients.
- **Section 5** converts the result to your prevalence: at low prevalence most flags are false referrals even when sensitivity is excellent.
- **Section 6** lists the referable cases the recommended threshold would miss. Have a clinician look at them.
- The recommendation is capped at **0.60**. A lower threshold only flags more eyes, so a capped value still meets the target, at the cost of more false referrals.

## Applying a threshold

1. Written sign-off from your clinical lead for the target and the resulting threshold.
2. Put `REFERRAL_THRESHOLD=0.36` (your value; allowed range 0.02 to 0.60) in `backend/.env` and restart the backend. An invalid value stops the server at startup, and startup logs a warning that a site threshold is in force.
3. Every result carries `referralThresholdSource` (`site` or `model`) and the threshold used; `/api/health` reports `referralThresholdOverride`.
4. Keep the report and the graded sample. Repeat the calibration when the camera, operator or patient population changes, and after any model change.

To go back to the model's own threshold, delete the line and restart.

## What this does not do

- It does not make the model safe for patients. It checks one camera and one grader against one target.
- Grader disagreement is not modelled. A single grader's labels are treated as the truth.
- It does not check that each patient contributes one image. Several images from the same patient (or both eyes) make the intervals too narrow.
- The confidence intervals assume the sample resembles your future patients. A sample taken from a specialist clinic will not describe a community screening.

## Tests

```bash
python -m pytest calibration      # numpy only; synthetic data, no MATLAB
```
