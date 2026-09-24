# Stage 5: district-scale screening model (Simulink)

The problem statement asks for a Simulink model of acquisition rate, bandwidth, throughput and review capacity, used to plan resources for
**100,000+ patients a year per district**. That is `DistrictScreening.slx` and the scripts around it.

| File | What it does |
|---|---|
| `districtParameters.m` | Every input, marked **MEASURED** (from this project's data and validation) or **ASSUMED** (replace with pilot data and local prices). |
| `buildDistrictModel.m` | Builds `DistrictScreening.slx`: four backlog queues in series, one step per working day. Capture at camera sites → upload over each centre's link → AI grading → specialist review of flagged cases. Core Simulink blocks only. |
| `runDistrictModel.m` | Simulates a year for one set of resources and reports throughput, backlog and utilisation per stage, and whether the targets are met. |
| `optimiseDistrictResources.m` | Finds the cheapest mix of camera sites, uplink, AI servers and reviewers for each scenario, confirms it in Simulink, and writes `results/district_plan.md` / `.json` and `backend/pipeline_results.json` (served at `/api/simulation`). |
| `measureAiSeconds.m` | Times the app's MATLAB pipeline per patient (both eyes: grading, Grad-CAM, lesion overlay) for `aiSecondsPerPatient`. |
| `simulateFullPipeline.m`, `simulateCaptureQueue.m`, `DRScreeningFlow.slx` | The earlier per-patient queue model. `DRScreeningFlow.slx` uses SimEvents blocks; SimEvents is licensed but not installed on the development machine, so it does not run there. |

```matlab
cd stage5_simulink
optimiseDistrictResources()      % about 1 minute; rebuilds the model and runs every scenario
```

**Targets:** no stage may carry more than one working day of backlog, except specialist review, which may carry up to `reviewTurnaroundDays` (2).

**Measured inputs:**
- 0.40 MB per camera JPEG (IDRiD);
- 4.5 s of AI per patient on an RTX 3050 laptop GPU;
- sensitivity 96.9% and specificity 88.3% (`validation/REPORT.md`), which set how many patients a specialist sees.

**Main findings** (`results/district_plan.md`):
- **Camera sites dominate.** A district needs about 8 camera sites for 100,000 patients a year, and 15 for 200,000.
- **The other resources are lightly used:** one GPU server (a few percent busy), one reviewer at 30 s per case, and even 2G-grade links for JPEG photos.
- **Specificity sets the specialist workload:**
  - an uncalibrated IDRiD-like camera more than doubles it;
  - reviewing without the 30-second annotated report quadruples it;
  - at 200,000 patients with both problems, 4 reviewers are needed.

These are planning estimates, not a budget: costs and several inputs are assumptions.
