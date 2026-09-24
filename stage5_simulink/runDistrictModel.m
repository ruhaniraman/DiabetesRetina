function R = runDistrictModel(p, res, opts)
% RUNDISTRICTMODEL  Simulate one year of a district's screening with DistrictScreening.slx.
%
%   R = runDistrictModel(p, res)
%   R = runDistrictModel(p, res, struct('Seed', 3))
%
%   p     districtParameters()
%   res   resources: .cameraSites, .uplinkMbps (per centre), .aiServers, .reviewers
%   R     per stage (capture, upload, ai, review): daily served, backlog, capacity, utilisation, worst backlog in days of work;
%         R.meetsTargets and R.reasons (which target failed)
%
% Targets: no stage may carry more than one day of work into the next day, except specialist review, which may carry up to
% p.reviewTurnaroundDays (the service target). Patients are assumed to be spread evenly over the camera sites.

    if nargin < 3, opts = struct(); end
    if ~isfield(opts, 'Seed'), opts.Seed = 1; end
    here = fileparts(mfilename('fullpath'));
    model = 'DistrictScreening';
    if ~isfile(fullfile(here, [model '.slx'])), buildDistrictModel(here); end
    load_system(fullfile(here, [model '.slx']));

    D = derived(p, res);
    rng(opts.Seed);
    days = p.workingDaysPerYear;
    arrivals = max(0, round(D.patientsPerDay * (1 + p.dailyVariation * randn(days, 1))));

    in = Simulink.SimulationInput(model);
    in = in.setVariable('arrivals', [(0:days - 1)' arrivals]);
    for f = {'capCapture', 'capUploadMB', 'capAI', 'capReview', 'mbPerPatient', 'reviewFraction'}
        in = in.setVariable(f{1}, D.(f{1}));
    end
    in = in.setModelParameter('StopTime', num2str(days - 1));
    out = sim(in);

    R = struct('resources', res, 'derived', D, 'arrivals', arrivals, 'meetsTargets', true, 'reasons', {{}});
    stages = {'capture', 'capCapture', 1; 'upload', 'capUploadMB', 1; 'ai', 'capAI', 1; 'review', 'capReview', p.reviewTurnaroundDays};
    for s = 1:size(stages, 1)
        name = stages{s, 1}; cap = D.(stages{s, 2});
        served = out.get([name '_out']); backlog = out.get([name '_backlog']);
        st.served = served(:); st.backlog = backlog(:); st.capacity = cap;
        st.utilisation = sum(served) / (cap * days);
        st.worstBacklogDays = max(backlog) / cap;
        st.finalBacklogDays = backlog(end) / cap;
        st.limitDays = stages{s, 3};
        R.(name) = st;
        if st.worstBacklogDays > st.limitDays
            R.meetsTargets = false;
            R.reasons{end + 1} = sprintf('%s backlog reaches %.1f days of work (limit %g)', name, st.worstBacklogDays, st.limitDays);
        end
    end
    R.patientsScreened = sum(R.capture.served);
    R.casesReviewed = sum(R.review.served);
    R.cost = resourceCost(p, res);
end

function D = derived(p, res)
    calendarPerWorking = 365 / p.workingDaysPerYear;       % servers and store-and-forward links also run on non-working days
    D.patientsPerDay = p.patientsPerYear / p.workingDaysPerYear;
    D.capCapture = res.cameraSites * p.cameraHoursPerDay * 60 / (p.captureMinutesPerPatient + p.retakeRate * p.retakeMinutes);
    D.mbPerPatient = p.imagesPerPatient * p.imageMB * (1 + p.retakeRate) * p.protocolOverhead;
    D.capUploadMB = res.cameraSites * res.uplinkMbps * p.usableLinkFraction / 8 * 3600 * p.uploadHoursPerDay * calendarPerWorking;
    D.capAI = res.aiServers * p.aiHoursPerDay * 3600 * p.aiUtilisationTarget / p.aiSecondsPerPatient * calendarPerWorking;
    D.flaggedFraction = p.referablePrevalence * p.sensitivity + (1 - p.referablePrevalence) * (1 - p.specificity);
    D.reviewFraction = D.flaggedFraction + p.reviewAllUngradable * p.ungradableAfterRetake;
    D.capReview = res.reviewers * p.reviewerHoursPerDay * 3600 / p.reviewSecondsPerCase;
end

function c = resourceCost(p, res)
    c = res.cameraSites * (p.cost.cameraSite + res.uplinkMbps * p.cost.uplinkPerMbps) + res.aiServers * p.cost.aiServer + res.reviewers * p.cost.reviewer;
end
