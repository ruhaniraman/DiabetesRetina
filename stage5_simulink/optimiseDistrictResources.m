function plans = optimiseDistrictResources(outDir)
% OPTIMISEDISTRICTRESOURCES  Cheapest mix of camera sites, uplink, AI servers and reviewers that screens a district, checked in Simulink.
%
%   plans = optimiseDistrictResources()     runs every scenario and writes stage5_simulink/results/district_plan.{md,json}
%                                           and backend/pipeline_results.json (served by /api/simulation)
%
% For one scenario: the smallest number of each resource whose capacity covers a busy day (95th percentile of daily arrivals) is
% worked out first; a few camera counts above the minimum are tried (more centres can allow a cheaper uplink); the cheapest plan is
% then simulated for a year with DistrictScreening.slx (runDistrictModel) and, if a stage misses its target, that resource is raised
% and the year simulated again. Costs and several inputs are ASSUMED (districtParameters.m): the plan shows the method and what
% drives the resources, not a budget.

    here = fileparts(mfilename('fullpath'));
    if nargin < 1, outDir = fullfile(here, 'results'); end
    if ~isfolder(outDir), mkdir(outDir); end
    buildDistrictModel(here);

    base = districtParameters();
    sc = {};
    sc{end + 1} = {'Base: 100,000 patients/year, APTOS-level specificity, 30 s review', base};
    p = base; p.patientsPerYear = 200000;                    sc{end + 1} = {'200,000 patients/year', p};
    p = base; p.specificity = 0.538;                         sc{end + 1} = {'Camera like IDRiD without site calibration (specificity 53.8%)', p};
    p = base; p.specificity = 0.744; p.sensitivity = 0.891;  sc{end + 1} = {'IDRiD-like camera after site calibration (89.1% / 74.4%)', p};
    p = base; p.reviewSecondsPerCase = 120;                  sc{end + 1} = {'Review without the annotated report (120 s per case)', p};
    p = base; p.uploadHoursPerDay = 7; p.options.uplinkMbps = [0.1 0.25]; sc{end + 1} = {'2G-grade links, uploads only in clinic hours', p};
    p = base; p.imageMB = 1.93;                              sc{end + 1} = {'Lossless PNG uploads (1.93 MB per photo) instead of JPEG', p};
    p = base; p.retakeRate = 0.25;                           sc{end + 1} = {'25% of patients need a retake', p};
    p = base; p.patientsPerYear = 200000; p.specificity = 0.538; p.reviewSecondsPerCase = 120;
    sc{end + 1} = {'Stress: 200,000/year, uncalibrated IDRiD-like camera, 120 s review', p};
    p = base; p.imageMB = 1.93; p.uploadHoursPerDay = 7; p.options.uplinkMbps = [0.1 0.25 0.5 1];
    sc{end + 1} = {'Stress: PNG uploads over 2G-grade links in clinic hours only', p};

    plans = struct('scenario', {}, 'resources', {}, 'cost', {}, 'costPerPatient', {}, 'meetsTargets', {}, 'utilisation', {}, ...
        'worstBacklogDays', {}, 'reviewCasesPerDay', {}, 'uploadMBPerDay', {}, 'binding', {}, 'iterations', {});
    for i = 1:numel(sc)
        [name, p] = sc{i}{:};
        fprintf('\n== %s\n', name);
        plans(end + 1) = planFor(name, p); %#ok<AGROW>
    end
    writeReport(outDir, plans, base);
    backendJson = fullfile(fileparts(here), 'backend', 'pipeline_results.json');
    fid = fopen(backendJson, 'w'); fwrite(fid, jsonencode(struct('generatedBy', 'stage5_simulink/optimiseDistrictResources.m', ...
        'created', char(datetime('now', 'Format', 'yyyy-MM-dd HH:mm')), 'plans', plans), 'PrettyPrint', true)); fclose(fid);
    fprintf('\nWrote %s and %s\n', fullfile(outDir, 'district_plan.md'), backendJson);
end

function plan = planFor(name, p)
    busy = p.patientsPerYear / p.workingDaysPerYear * (1 + 1.645 * p.dailyVariation);     % 95th percentile day
    one = struct('cameraSites', 1, 'uplinkMbps', 1, 'aiServers', 1, 'reviewers', 1);
    D1 = probe(p, one);
    minCams = max(p.options.cameraSites(1), ceil(busy / D1.capCapture));
    best = []; bestCost = Inf;
    for cams = minCams:min(minCams + 10, p.options.cameraSites(end))
        r = one; r.cameraSites = cams;                 % other fields filled in below
        r.uplinkMbps = firstThat(p.options.uplinkMbps, @(m) probe(p, setf(r, 'uplinkMbps', m)).capUploadMB >= busy * D1.mbPerPatient);
        r.aiServers = firstThat(p.options.aiServers, @(n) probe(p, setf(r, 'aiServers', n)).capAI >= busy);
        r.reviewers = firstThat(p.options.reviewers, @(n) probe(p, setf(r, 'reviewers', n)).capReview * p.reviewTurnaroundDays >= busy * D1.reviewFraction * 1.0);
        if any(isnan([r.uplinkMbps r.aiServers r.reviewers])), continue; end
        c = cost(p, r);
        if c < bestCost, best = r; bestCost = c; end
    end
    if isempty(best)
        plan = struct('scenario', name, 'resources', [], 'cost', NaN, 'costPerPatient', NaN, 'meetsTargets', false, 'utilisation', [], ...
            'worstBacklogDays', [], 'reviewCasesPerDay', NaN, 'uploadMBPerDay', NaN, 'binding', 'no option in districtParameters.m is enough', 'iterations', 0);
        fprintf('   no feasible option\n');
        return
    end
    % confirm in Simulink; raise whatever fails
    for it = 1:12
        R = runDistrictModel(p, best);
        fprintf('   sim %d: sites %d, %g Mbps, %d servers, %d reviewers -> %s\n', it, best.cameraSites, best.uplinkMbps, best.aiServers, best.reviewers, ...
            ternary(R.meetsTargets, 'meets targets', strjoin(R.reasons, '; ')));
        if R.meetsTargets, break; end
        if R.capture.worstBacklogDays > R.capture.limitDays, best.cameraSites = best.cameraSites + 1; end
        if R.upload.worstBacklogDays > R.upload.limitDays, best.uplinkMbps = nextOption(p.options.uplinkMbps, best.uplinkMbps); end
        if R.ai.worstBacklogDays > R.ai.limitDays, best.aiServers = best.aiServers + 1; end
        if R.review.worstBacklogDays > R.review.limitDays, best.reviewers = best.reviewers + 1; end
    end
    u = [R.capture.utilisation R.upload.utilisation R.ai.utilisation R.review.utilisation];
    names = {'camera sites', 'uplink', 'AI servers', 'reviewers'};
    [~, k] = max(u);
    plan = struct('scenario', name, 'resources', best, 'cost', R.cost, 'costPerPatient', R.cost / p.patientsPerYear, ...
        'meetsTargets', R.meetsTargets, 'utilisation', struct('capture', u(1), 'upload', u(2), 'ai', u(3), 'review', u(4)), ...
        'worstBacklogDays', struct('capture', R.capture.worstBacklogDays, 'upload', R.upload.worstBacklogDays, 'ai', R.ai.worstBacklogDays, 'review', R.review.worstBacklogDays), ...
        'reviewCasesPerDay', mean(R.review.served), 'uploadMBPerDay', mean(R.upload.served), 'binding', names{k}, 'iterations', it);
end

function D = probe(p, r)
    % capacities only (no simulation): same formulas as runDistrictModel
    calendarPerWorking = 365 / p.workingDaysPerYear;
    D.capCapture = r.cameraSites * p.cameraHoursPerDay * 60 / (p.captureMinutesPerPatient + p.retakeRate * p.retakeMinutes);
    D.mbPerPatient = p.imagesPerPatient * p.imageMB * (1 + p.retakeRate) * p.protocolOverhead;
    D.capUploadMB = r.cameraSites * r.uplinkMbps * p.usableLinkFraction / 8 * 3600 * p.uploadHoursPerDay * calendarPerWorking;
    D.capAI = r.aiServers * p.aiHoursPerDay * 3600 * p.aiUtilisationTarget / p.aiSecondsPerPatient * calendarPerWorking;
    D.reviewFraction = p.referablePrevalence * p.sensitivity + (1 - p.referablePrevalence) * (1 - p.specificity) + p.reviewAllUngradable * p.ungradableAfterRetake;
    D.capReview = r.reviewers * p.reviewerHoursPerDay * 3600 / p.reviewSecondsPerCase;
end

function c = cost(p, r)
    c = r.cameraSites * (p.cost.cameraSite + r.uplinkMbps * p.cost.uplinkPerMbps) + r.aiServers * p.cost.aiServer + r.reviewers * p.cost.reviewer;
end

function v = firstThat(options, ok)
    v = NaN;
    for o = options(:)'
        if ok(o), v = o; return; end
    end
end

function s = setf(s, f, v), s.(f) = v; end

function v = nextOption(options, current)
    k = find(options > current, 1);
    if isempty(k), v = current * 2; else, v = options(k); end
end

function out = ternary(c, a, b)
    if c, out = a; else, out = b; end
end

function writeReport(outDir, plans, base)
    fid = fopen(fullfile(outDir, 'district_plan.md'), 'w');
    fprintf(fid, '# District screening plan (Stage 5, Simulink)\n\n');
    fprintf(fid, 'Generated by `stage5_simulink/optimiseDistrictResources.m` on %s. Each plan is the cheapest mix of resources found that keeps every stage ', ...
        char(datetime('now', 'Format', 'yyyy-MM-dd HH:mm')));
    fprintf(fid, 'within one day of backlog (specialist review within %d working days), confirmed by simulating a year in `DistrictScreening.slx`.\n\n', base.reviewTurnaroundDays);
    fprintf(fid, '> Costs and several inputs are **assumptions** (`districtParameters.m` marks each one). The plan shows the method and what drives the resources, not a budget.\n\n');
    fprintf(fid, '| Scenario | Camera sites | Uplink per centre | AI servers | Reviewers | Cost per patient (INR, assumed) | Utilisation: capture / upload / AI / review | Specialist cases per day | Upload per day |\n');
    fprintf(fid, '|---|---|---|---|---|---|---|---|---|\n');
    for i = 1:numel(plans)
        q = plans(i);
        if isempty(q.resources)
            fprintf(fid, '| %s | - | - | - | - | - | %s | - | - |\n', q.scenario, q.binding);
            continue
        end
        r = q.resources;
        u = q.utilisation;
        fprintf(fid, '| %s | %d | %g Mbps | %d | %d | %.0f | %.0f%% / %.0f%% / %.0f%% / %.0f%% | %.0f | %.2f GB |\n', q.scenario, r.cameraSites, r.uplinkMbps, r.aiServers, r.reviewers, ...
            q.costPerPatient, 100 * u.capture, 100 * u.upload, 100 * u.ai, 100 * u.review, q.reviewCasesPerDay, q.uploadMBPerDay / 1000);
    end
    fprintf(fid, '\nBase inputs: %d patients/year over %d working days; capture %g min per patient (+%g%% retakes); %g MB per photo; ', ...
        base.patientsPerYear, base.workingDaysPerYear, base.captureMinutesPerPatient, 100 * base.retakeRate, base.imageMB);
    fprintf(fid, 'AI %g s per patient; review %g s per case; referable prevalence %g%%; sensitivity %.1f%%, specificity %.1f%% (validation/REPORT.md).\n', ...
        base.aiSecondsPerPatient, base.reviewSecondsPerCase, 100 * base.referablePrevalence, 100 * base.sensitivity, 100 * base.specificity);
    fprintf(fid, ['\n**Reading this.** Camera sites (and the technicians at them) are what a district mostly has to provide; every other stage is lightly used. ' ...
        'With JPEG photographs even 2G-grade links carry a day''s uploads (store and forward overnight). One GPU server grades a district''s patients in ' ...
        'a few percent of its time. Specialist time grows with the share of patients flagged, so specificity matters: an uncalibrated camera like IDRiD ' ...
        'more than doubles the review load, and review without the 30-second annotated report (120 s per case) nearly quadruples it. ' ...
        'The stress rows show when reviewers and bandwidth start to need more than the minimum.\n']);
    fclose(fid);
    fid = fopen(fullfile(outDir, 'district_plan.json'), 'w'); fwrite(fid, jsonencode(plans, 'PrettyPrint', true)); fclose(fid);
end
