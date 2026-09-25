function out = simulateScenarioJson(scenarioJson)
% SIMULATESCENARIOJSON  For the web app's District Planner: simulate one working year of a district in DistrictScreening.slx.
%
%   out = simulateScenarioJson('{"overrides":{"patientsPerYear":150000,"specificity":0.744},
%                                "resources":{"cameraSites":12,"uplinkMbps":0.1,"aiServers":1,"reviewers":1}}')
%
%   overrides  fields of districtParameters() to change. Only the numeric fields listed in ALLOWED are accepted; anything else is ignored.
%   resources  the plan to test (the planner's quick estimate)
%   out        JSON text: meetsTargets, reasons, patientsScreened, casesReviewed, cost, and per stage (capture, upload, ai, review)
%              the utilisation, worst and final backlog in days of work, the limit, and the daily backlog in days of work (for a chart)
    ALLOWED = {'patientsPerYear', 'sensitivity', 'specificity', 'reviewSecondsPerCase', 'imageMB', 'uploadHoursPerDay', ...
        'retakeRate', 'referablePrevalence', 'aiSecondsPerPatient', 'captureMinutesPerPatient', 'reviewerHoursPerDay'};
    S = jsondecode(scenarioJson);
    p = districtParameters();
    if isfield(S, 'overrides')
        for f = fieldnames(S.overrides)'
            v = S.overrides.(f{1});
            if any(strcmp(f{1}, ALLOWED)) && isnumeric(v) && isscalar(v) && isfinite(v) && v >= 0
                p.(f{1}) = double(v);
            end
        end
    end
    r = S.resources;
    res = struct('cameraSites', max(1, round(double(r.cameraSites))), 'uplinkMbps', max(0.01, double(r.uplinkMbps)), ...
        'aiServers', max(1, round(double(r.aiServers))), 'reviewers', max(1, round(double(r.reviewers))));
    R = runDistrictModel(p, res);

    stages = struct();
    for name = {'capture', 'upload', 'ai', 'review'}
        st = R.(name{1});
        stages.(name{1}) = struct('utilisation', st.utilisation, 'worstBacklogDays', st.worstBacklogDays, ...
            'finalBacklogDays', st.finalBacklogDays, 'limitDays', st.limitDays, 'backlogDays', round(st.backlog' / st.capacity, 3));
    end
    out = jsonencode(struct('meetsTargets', R.meetsTargets, 'reasons', {R.reasons}, 'patientsScreened', R.patientsScreened, ...
        'casesReviewed', R.casesReviewed, 'cost', R.cost, 'resources', res, 'stages', stages, 'days', p.workingDaysPerYear));
end
