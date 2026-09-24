function lesionFeatures()
% LESIONFEATURES  Per-photograph lesion features from the Stage 2 network, for the benchmark (validation/benchmark.py).
%
% For the Stage 3 validation and test splits (APTOS, full resolution) and IDRiD's validation and test grading photographs, runs the
% calibrated lesion network exactly as the app does (segmentLesionsDL with Stage2_LesionUNet_v2.mat) and records, per photograph:
% region count and share of the retina marked for MA, HE, EX, SE, and the ICDR evidence (haemorrhage quadrants, microaneurysms only,
% exudates near the fovea). Writes validation/results/lesion_features.csv.
    root = fileparts(fileparts(mfilename('fullpath')));
    addpath(fullfile(root, 'utils'), fullfile(root, 'stage1_quality'), fullfile(root, 'stage2_structure', 'dl'));
    S = load(fullfile(root, 'stage2_structure', 'dl', 'Stage2_LesionUNet_v2.mat'), 'model');
    model = S.model;
    M = readtable(fullfile(root, 'stage_3', 'finetune', 'manifest.csv'), 'TextType', 'char', 'Delimiter', ',');
    M = M(ismember(M.split, {'validation', 'test'}) & ismember(M.dataset, {'aptos', 'idrid'}), :);
    names = {'MA', 'HE', 'EX', 'SE'};
    n = height(M);
    out = table(M.id, M.dataset, M.split, M.label, 'VariableNames', {'id', 'dataset', 'split', 'label'});
    for k = 1:4
        out.([names{k} '_count']) = nan(n, 1); out.([names{k} '_area']) = nan(n, 1);
    end
    out.he_quadrants = nan(n, 1); out.he_quadrants20 = nan(n, 1); out.only_ma = nan(n, 1); out.ex_near_fovea = nan(n, 1);
    t0 = tic;
    for i = 1:n
        img = imread(M.path{i});
        if size(img, 3) == 4, img = img(:, :, 1:3); end
        [prob, masks, info] = segmentLesionsDL(img, model);
        nf = max(nnz(info.fov), 1);
        for k = 1:4
            c = find(strcmp(model.channels, names{k}));
            cc = bwconncomp(masks(:, :, c), 8);
            out.([names{k} '_count'])(i) = cc.NumObjects;
            out.([names{k} '_area'])(i) = 100 * nnz(masks(:, :, c)) / nf;
        end
        E = lesionEvidence(masks, prob, info, model.channels);
        out.he_quadrants(i) = E.heQuadrants; out.he_quadrants20(i) = E.heQuadrantsWith20;
        out.only_ma(i) = E.onlyMA; out.ex_near_fovea(i) = E.exNearFovea;
        if mod(i, 100) == 0, fprintf('  %d/%d (%.0f s)\n', i, n, toc(t0)); end
    end
    writetable(out, fullfile(root, 'validation', 'results', 'lesion_features.csv'));
    fprintf('Wrote %d rows\n', n);
end
