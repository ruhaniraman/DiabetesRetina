function model = buildDistrictModel(saveDir)
% BUILDDISTRICTMODEL  Create DistrictScreening.slx: a district's year of screening as four queues in series, one step per working day.
%
%   buildDistrictModel()            writes stage5_simulink/DistrictScreening.slx
%
%   Arrivals (patients) -> Capture (camera sites) -> Upload (MB over each centre's uplink) -> AI (servers) -> Specialist review (flagged cases)
%
% Each stage is a backlog queue: what can be served today is today's input plus yesterday's backlog, up to the stage's daily capacity;
% the rest waits (Unit Delay). The model uses only core Simulink blocks (no SimEvents), so it runs on any Simulink installation.
% runDistrictModel sets the capacities and the arrivals and simulates it; optimiseDistrictResources searches resources with it.
%
% Workspace variables the model reads (runDistrictModel sets them with Simulink.SimulationInput):
%   arrivals            [day, patients] per working day
%   capCapture          patients per working day (all camera sites)
%   capUploadMB         MB per working day (all centres' uplinks, including nights for store and forward)
%   capAI               patients per working day (all servers, at the utilisation target)
%   capReview           cases per working day (all reviewers)
%   mbPerPatient        MB uploaded per patient
%   reviewFraction      share of patients sent to a specialist (flagged + ungradable)

    if nargin < 1, saveDir = fileparts(mfilename('fullpath')); end
    model = 'DistrictScreening';
    if bdIsLoaded(model), close_system(model, 0); end
    target = fullfile(saveDir, [model '.slx']);
    if isfile(target), delete(target); end              % rebuilt from scratch (avoids the model shadowing its own file)
    new_system(model);
    set_param(model, 'Solver', 'FixedStepDiscrete', 'FixedStep', '1', 'StopTime', 'arrivals(end,1)', ...
        'SaveOutput', 'off', 'SaveTime', 'off', 'ReturnWorkspaceOutputs', 'on');

    add_block('simulink/Sources/From Workspace', [model '/Arrivals'], 'VariableName', 'arrivals', ...
        'SampleTime', '1', 'Interpolate', 'off', 'OutputAfterFinalValue', 'Setting to zero', 'Position', [30 100 110 130]);

    stages = {'Capture', 'capCapture'; 'Upload', 'capUploadMB'; 'AI', 'capAI'; 'Review', 'capReview'};
    x = 220;
    for s = 1:size(stages, 1)
        addQueue(model, stages{s, 1}, stages{s, 2}, x);
        x = x + 260;
    end
    % conversions between stages: patients -> MB -> patients -> review cases
    add_block('simulink/Math Operations/Gain', [model '/toMB'], 'Gain', 'mbPerPatient', 'Position', [390 95 430 125]);
    add_block('simulink/Math Operations/Gain', [model '/toPatients'], 'Gain', '1/mbPerPatient', 'Position', [650 95 690 125]);
    add_block('simulink/Math Operations/Gain', [model '/toReview'], 'Gain', 'reviewFraction', 'Position', [910 95 950 125]);

    add_line(model, 'Arrivals/1', 'Capture/1');
    add_line(model, 'Capture/1', 'toMB/1');       add_line(model, 'toMB/1', 'Upload/1');
    add_line(model, 'Upload/1', 'toPatients/1');  add_line(model, 'toPatients/1', 'AI/1');
    add_line(model, 'AI/1', 'toReview/1');        add_line(model, 'toReview/1', 'Review/1');

    % log every stage's daily throughput (port 1) and end-of-day backlog (port 2)
    y = 250;
    for s = 1:size(stages, 1)
        name = stages{s, 1};
        for k = 1:2
            tag = {'out', 'backlog'};
            blk = sprintf('%s/log_%s_%s', model, name, tag{k});
            add_block('simulink/Sinks/To Workspace', blk, 'VariableName', sprintf('%s_%s', lower(name), tag{k}), ...
                'SaveFormat', 'Array', 'SampleTime', '1', 'Position', [200 + 260 * (s - 1) + 90 * (k - 1), y, 280 + 260 * (s - 1) + 90 * (k - 1), y + 30]);
            add_line(model, sprintf('%s/%d', name, k), sprintf('log_%s_%s/1', name, tag{k}), 'autorouting', 'on');
        end
    end
    annotate(model);
    save_system(model, fullfile(saveDir, [model '.slx']));
    close_system(model, 0);
end

function addQueue(model, name, capVar, x)
% Subsystem: in -> [served today, backlog left]. served = min(in + backlog_yesterday, capacity).
    sub = [model '/' name];
    add_block('built-in/Subsystem', sub, 'Position', [x 90 x + 110 150]);
    add_block('built-in/Inport', [sub '/in'], 'Position', [20 50 50 70]);
    add_block('simulink/Math Operations/Sum', [sub '/available'], 'Inputs', '++', 'Position', [100 45 130 75]);
    add_block('simulink/Discrete/Unit Delay', [sub '/yesterday'], 'SampleTime', '1', 'InitialCondition', '0', ...
        'Orientation', 'left', 'Position', [150 130 190 160]);
    add_block('simulink/Sources/Constant', [sub '/capacity'], 'Value', capVar, 'SampleTime', '1', 'Position', [100 90 150 110]);
    add_block('simulink/Math Operations/MinMax', [sub '/served'], 'Function', 'min', 'Inputs', '2', 'Position', [190 50 220 90]);
    add_block('simulink/Math Operations/Sum', [sub '/left'], 'Inputs', '+-', 'Position', [260 110 290 140]);
    add_block('built-in/Outport', [sub '/served_out'], 'Position', [340 60 370 80]);
    add_block('built-in/Outport', [sub '/backlog_out'], 'Port', '2', 'Position', [340 120 370 140]);
    add_line(sub, 'in/1', 'available/1');
    add_line(sub, 'yesterday/1', 'available/2', 'autorouting', 'on');
    add_line(sub, 'available/1', 'served/1');
    add_line(sub, 'capacity/1', 'served/2');
    add_line(sub, 'available/1', 'left/1', 'autorouting', 'on');
    add_line(sub, 'served/1', 'left/2', 'autorouting', 'on');
    add_line(sub, 'served/1', 'served_out/1');
    add_line(sub, 'left/1', 'backlog_out/1');
    add_line(sub, 'left/1', 'yesterday/1', 'autorouting', 'on');
end

function annotate(model)
    note = Simulink.Annotation([model '/District screening, one step per working day']);
    note.Text = sprintf(['District DR screening (Stage 5). Four backlog queues in series, one step per working day:\n' ...
        'capture at camera sites -> upload over each centre''s link -> AI grading -> specialist review of flagged cases.\n' ...
        'Built by buildDistrictModel.m; parameters in districtParameters.m; run with runDistrictModel.m.']);
    note.Position = [30 20 700 60];
end
