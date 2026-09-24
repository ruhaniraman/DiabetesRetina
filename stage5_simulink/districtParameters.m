function p = districtParameters()
% DISTRICTPARAMETERS  Inputs of the district screening model (Stage 5). Every value says where it comes from.
%
%   p = districtParameters();   then change fields and pass p to runDistrictModel / optimiseDistrictResources
%
% MEASURED values come from this project's own data or validation and are re-measured by the scripts named.
% ASSUMED values are placeholders for a real district: replace them with figures from a pilot and local price quotes.

    %% Demand
    p.patientsPerYear   = 100000;   % problem statement: 100k+ patients per year per district
    p.workingDaysPerYear = 250;     % ASSUMED: 5-day weeks less public holidays
    p.dailyVariation    = 0.15;     % ASSUMED: day-to-day arrivals vary by +/-15% (coefficient of variation)

    %% Capture (primary health centres)
    p.captureMinutesPerPatient = 6;   % ASSUMED: both eyes, non-mydriatic, including positioning and entering details
    p.cameraHoursPerDay = 7;          % ASSUMED: one technician shift
    p.retakeRate = 0.10;              % ASSUMED: share of patients needing a retake. The Stage 1 gate rejects 0.1-1.0% of the
                                      % curated APTOS/IDRiD photos (validation/QUALITY.md); field images are worse, so set from a pilot.
    p.retakeMinutes = 3;              % ASSUMED: one extra photograph

    %% Upload (store and forward from each centre)
    p.imagesPerPatient = 2;           % one per eye
    p.imageMB = 0.40;                 % MEASURED: median camera JPEG in IDRiD (12 MP fundus camera), data/idrid_grading
                                      % (a lossless PNG of the same photo is ~5x larger: APTOS full-resolution median 1.93 MB)
    p.protocolOverhead = 1.10;        % ASSUMED: HTTPS, retries, metadata
    p.usableLinkFraction = 0.6;       % ASSUMED: share of the nominal uplink actually available (shared, rural mobile data)
    p.uploadHoursPerDay = 24;         % store and forward: uploads continue after clinic hours

    %% AI (backend: Stage 1 + Stage 2 + Stage 3 + Stage 4 per patient)
    p.aiSecondsPerPatient = 4.5;      % MEASURED 2026-09-24 on an RTX 3050 laptop GPU by measureAiSeconds.m (both eyes: grading, Grad-CAM,
                                      % lesion overlay); update after running it on the deployment server
    p.aiHoursPerDay = 24;
    p.aiUtilisationTarget = 0.7;      % keep servers below 70% busy so bursts do not queue

    %% Specialist review (central hub)
    p.referablePrevalence = 0.10;     % ASSUMED: share of screened patients with referable DR in the district
    p.sensitivity = 0.969;            % MEASURED: deployed model, APTOS held-out test (validation/REPORT.md)
    p.specificity = 0.883;            % MEASURED: same; use 0.538 for an IDRiD-like camera without site calibration
    p.reviewSecondsPerCase = 30;      % problem statement: an ophthalmologist reviews an annotated report in under 30 s
    p.reviewAllUngradable = true;     % photos still ungradable after a retake go to a specialist too
    p.ungradableAfterRetake = 0.02;   % ASSUMED
    p.reviewerHoursPerDay = 4;        % ASSUMED: tele-ophthalmology hours per reviewer per working day
    p.reviewTurnaroundDays = 2;       % service target: every flagged case reviewed within 2 working days

    %% Costs (ASSUMED, Indian rupees per year; replace with local quotes)
    p.cost.cameraSite = 450000;       % fundus camera amortised over 5 years plus one technician
    p.cost.uplinkPerMbps = 12000;     % per centre per Mbps of uplink per year
    p.cost.aiServer = 250000;         % one GPU server, amortised, with power and maintenance
    p.cost.reviewer = 900000;         % one part-time tele-ophthalmologist (the hours above)

    %% Options searched by optimiseDistrictResources
    p.options.cameraSites = 5:60;
    p.options.uplinkMbps = [0.1 0.25 0.5 1 2 5];   % 0.1 is 2G-grade, 1+ is 3G/4G
    p.options.aiServers = 1:4;
    p.options.reviewers = 1:10;
end
