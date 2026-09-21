# validation/

Held-out validation of the Stage 3 model (**[`REPORT.md`](REPORT.md)**) and an evaluation of the Stage 2 lesion overlay (**[`LESIONS.md`](LESIONS.md)**).

The train/validation/test split is read from `stage_3/Stage3_checkpoint.mat`, so the "test" images are exactly the ones the
model never trained on.

| Step | Command | Needs | Produces |
|---|---|---|---|
| 1. Export the split | `python validation/export_splits.py` | MATLAB | `results/splits.csv`, `results/baseline_saved_test.csv` |
| 2. Predict on the splits | `python validation/run_predictions.py` (about 15 min; `--quick` for the test set only) | MATLAB + `data/aptos2019/` | `results/<model>_<split>_<method>.csv` |
| 3. Leakage audit | `python validation/leakage_audit.py` | `data/aptos2019/` | `results/leakage.json` |
| 4. Analyse | `python validation/analyze.py` | numpy only | `results/metrics.json`, `results/tables.md` |
| Lesion overlay | `python validation/evaluate_lesions.py` (about 5 minutes) | `data/idrid_segmentation/`, `data/aptos2019/` | `results/lesions.json`, `results/lesions.md` |

The committed `results/` files are enough to re-run step 4 (and read the report) without MATLAB or the images.

Files:
- `predictSplit.m`: runs a network over one split and writes class probabilities. `method` is `resize` (what the model was
  trained with) or `crop` (the older crop-and-pad preprocessing; kept only to show it differs).
- `analyze.py`: sensitivity/specificity with confidence intervals, AUC, quadratic weighted kappa, threshold sweep, decision-rule
  comparison, predictive values at realistic prevalence, and the preprocessing comparison.
- `test_metrics.py`: unit tests for the statistics (`python -m pytest validation`).

To evaluate a **new** model or dataset: produce a CSV with the columns `id,label,p_Mild,p_Moderate,p_No_DR,p_Proliferate_DR,p_Severe`,
put it in `results/`, and point `analyze.py` at it.
