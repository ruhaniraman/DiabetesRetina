function T = validateLocalisation(split)
% VALIDATELOCALISATION  How accurately the optic disc and fovea are found, against IDRiD's expert centre labels.
%
%   T = validateLocalisation()            IDRiD localisation TEST set (103 photographs)
%   T = validateLocalisation('train')     its training set (413)
%
% Two methods: (1) the disc from the lesion network's optic-disc output (segmentLesionsDL) with the fovea estimated from the disc
% (estimateFovea); (2) the trained localiser (locateDiscFovea, trainLocaliser), which detects both, when Stage2_Localiser.mat exists.
% Baseline for the fovea: the centre of the retina (what the report falls back to when no disc is found). Errors are Euclidean distances
% in the photograph's native pixels and in disc diameters (the expert disc-to-fovea distance / 2.5, per photograph).
% Writes validation/results/localisation.{md,json} for the test set.
    if nargin < 1, split = 'test'; end
    here = fileparts(mfilename('fullpath'));
    root = fileparts(fileparts(here));
    addpath(here, fullfile(root, 'utils'), fullfile(root, 'stage1_quality'));
    base = fullfile(root, 'data', 'idrid_localization', 'C. Localization', 'C. Localization');
    tag = ternary(strcmp(split, 'test'), {'b. Testing Set', 'Testing'}, {'a. Training Set', 'Training'});
    od = readCentres(fullfile(base, '2. Groundtruths', '1. Optic Disc Center Location', sprintf('%s. IDRiD_OD_Center_%s Set_Markups.csv', tag{1}(1), tag{2})));
    fv = readCentres(fullfile(base, '2. Groundtruths', '2. Fovea Center Location', sprintf('IDRiD_Fovea_Center_%s Set_Markups.csv', tag{2})));
    S = load(fullfile(here, 'Stage2_LesionUNet_v2.mat'), 'model');
    model = S.model;
    odCh = find(strcmp(model.channels, 'OD'));
    locFile = fullfile(here, 'Stage2_Localiser.mat');
    loc = [];
    if isfile(locFile), S = load(locFile, 'model'); loc = S.model; end

    n = height(od);
    T = table(od.id, nan(n, 1), nan(n, 1), nan(n, 1), nan(n, 1), false(n, 1), nan(n, 1), nan(n, 1), nan(n, 1), ...
        'VariableNames', {'id', 'odErrPx', 'foveaErrPx', 'foveaBaselineErrPx', 'discDiamPx', 'discFound', ...
        'odErrPxLocaliser', 'foveaErrPxLocaliser', 'foveaConfidence'});
    for i = 1:n
        img = imread(fullfile(base, '1. Original Images', tag{1}, [od.id{i} '.jpg']));
        [prob, ~, info] = segmentLesionsDL(img, model);
        L = estimateFovea(prob(:, :, odCh), info.fov);
        j = find(strcmp(fv.id, od.id{i}), 1);
        trueOd = [od.x(i) od.y(i)]; trueFv = [fv.x(j) fv.y(j)];
        T.discDiamPx(i) = norm(trueFv - trueOd) / 2.5;                      % expert disc-fovea distance is ~2.5 disc diameters
        T.discFound(i) = L.found;
        if L.found, T.odErrPx(i) = norm(L.odCentre - trueOd); end
        T.foveaErrPx(i) = norm(L.fovea - trueFv);
        st = regionprops(info.fov, 'BoundingBox', 'Area'); [~, b] = max([st.Area]); bb = st(b).BoundingBox;
        T.foveaBaselineErrPx(i) = norm([bb(1) + bb(3) / 2, bb(2) + bb(4) / 2] - trueFv);
        if ~isempty(loc)
            Q = locateDiscFovea(img, loc);
            T.odErrPxLocaliser(i) = norm(Q.disc - trueOd);
            T.foveaErrPxLocaliser(i) = norm(Q.fovea - trueFv);
            T.foveaConfidence(i) = Q.foveaConfidence;
        end
        if mod(i, 20) == 0, fprintf('  %d/%d\n', i, n); end
    end
    if strcmp(split, 'test'), writeReport(root, T); end
end

function C = readCentres(file)
    raw = readcell(file);
    rows = raw(2:end, 1:3);
    keep = cellfun(@(v) ischar(v) || isstring(v), rows(:, 1)) & ~cellfun(@(v) isempty(v) || (isnumeric(v) && isnan(v)), rows(:, 2));
    rows = rows(keep, :);
    C = table(cellstr(string(rows(:, 1))), cell2mat(rows(:, 2)), cell2mat(rows(:, 3)), 'VariableNames', {'id', 'x', 'y'});
end

function writeReport(root, T)
    dd = T.discDiamPx;
    f = @(e) sprintf('%.0f px (%.2f DD)', median(e, 'omitnan'), median(e ./ dd, 'omitnan'));
    within = @(e, k) 100 * mean(e ./ dd <= k);
    locRows = {}; locNote = {};
    if any(~isnan(T.foveaErrPxLocaliser))
        locRows = {sprintf('| **Optic disc centre, trained localiser** | %s | %.0f%% | %.0f%% | %d |', f(T.odErrPxLocaliser), ...
                within(T.odErrPxLocaliser, 0.5), within(T.odErrPxLocaliser, 1), height(T)), ...
            sprintf('| **Fovea, trained localiser (detected)** | %s | %.0f%% | %.0f%% | %d |', f(T.foveaErrPxLocaliser), ...
                within(T.foveaErrPxLocaliser, 0.5), within(T.foveaErrPxLocaliser, 1), height(T))};
        locNote = {'', sprintf(['Trained localiser (`trainLocaliser.m`, applied with `locateDiscFovea.m`): a heatmap U-Net trained on IDRiD''s ' ...
            'localisation TRAINING photographs only. Mean error on these test photographs: disc %.1f px, fovea %.1f px ' ...
            '(the lesion network''s disc %.1f px, the fovea estimated from the disc %.1f px; IDRiD challenge winners 21.1 px and 64.5 px).'], ...
            mean(T.odErrPxLocaliser), mean(T.foveaErrPxLocaliser), mean(T.odErrPx, 'omitnan'), mean(T.foveaErrPx))};
    end
    lines = {
        '# Optic disc and fovea localisation (IDRiD localisation test set)', '', ...
        sprintf(['Generated by `stage2_structure/dl/validateLocalisation.m`. %d photographs (4288x2848) with expert centre labels. ' ...
        'The disc is the largest confident region of the lesion network''s optic-disc output; the fovea is estimated 2.5 disc diameters ' ...
        'temporal to the disc (`estimateFovea.m`), which the report uses to centre the quadrants and to find the macula. ' ...
        'DD = disc diameter, taken per photograph as the expert disc-to-fovea distance / 2.5.'], height(T)), '', ...
        '| | Median error | Within 0.5 DD | Within 1 DD | Photographs |', '|---|---|---|---|---|', ...
        sprintf('| Optic disc centre | %s | %.0f%% | %.0f%% | %d with a disc found (%.0f%%) |', f(T.odErrPx), within(T.odErrPx(T.discFound), 0.5), ...
            within(T.odErrPx(T.discFound), 1), nnz(T.discFound), 100 * mean(T.discFound)), ...
        sprintf('| Fovea, estimated from the disc | %s | %.0f%% | %.0f%% | %d |', f(T.foveaErrPx), within(T.foveaErrPx, 0.5), within(T.foveaErrPx, 1), height(T)), ...
        sprintf('| Fovea baseline: centre of the retina | %s | %.0f%% | %.0f%% | %d |', f(T.foveaBaselineErrPx), within(T.foveaBaselineErrPx, 0.5), ...
            within(T.foveaBaselineErrPx, 1), height(T)), locRows{:}, '', ...
        'The fovea estimate is used only to split the retina into quadrants and to say whether possible hard exudates lie near the macula; both are', ...
        'labelled as estimates in the report. The disc channel was trained on IDRiD''s segmentation photographs, a different subset from these.', locNote{:}};
    fid = fopen(fullfile(root, 'validation', 'results', 'localisation.md'), 'w'); fprintf(fid, '%s\n', lines{:}); fclose(fid);
    fid = fopen(fullfile(root, 'validation', 'results', 'localisation.json'), 'w'); fwrite(fid, jsonencode(T, 'PrettyPrint', true)); fclose(fid);
    fprintf('%s\n', lines{:});
end

function out = ternary(c, a, b)
    if c, out = a; else, out = b; end
end
