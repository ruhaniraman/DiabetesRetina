function buildNvDataset()
% BUILDNVDATASET  NV features (nvFeatures) for the photographs the NV suspicion model is trained and tested on.
%
% Train: from the Stage 3 TRAIN split (stage_3/finetune/manifest.csv), every Proliferative and Severe photograph of APTOS and IDRiD (the
% contrast that matters) plus a fixed random sample of the other grades. Test: all of the held-out APTOS test (548) and IDRiD test (103)
% photographs. Writes validation/results/nv_features.csv (one row per photograph; split says train or test). About 90 minutes on a GPU.
    root = fileparts(fileparts(fileparts(mfilename('fullpath'))));
    addpath(fullfile(root, 'utils'), fullfile(root, 'stage1_quality'), fullfile(root, 'stage2_structure'), ...
        fullfile(root, 'stage2_structure', 'dl'), fullfile(root, 'stage2_structure', 'nv'));
    S = load(fullfile(root, 'stage2_structure', 'dl', 'Stage2_LesionUNet_v2.mat'), 'model');
    M = readtable(fullfile(root, 'stage_3', 'finetune', 'manifest.csv'), 'TextType', 'char', 'Delimiter', ',');
    M = M(ismember(M.dataset, {'aptos', 'idrid'}), :);

    rng(17);
    take = false(height(M), 1);
    others = struct('aptos', struct('Moderate', 100, 'Mild', 60, 'No_DR', 100), 'idrid', struct('Moderate', 15, 'Mild', 10, 'No_DR', 15));
    for d = {'aptos', 'idrid'}
        tr = strcmp(M.split, 'train') & strcmp(M.dataset, d{1});
        take = take | (tr & ismember(M.label, {'Proliferate_DR', 'Severe'}));
        for g = fieldnames(others.(d{1}))'
            idx = find(tr & strcmp(M.label, g{1}));
            k = min(others.(d{1}).(g{1}), numel(idx));
            take(idx(randperm(numel(idx), k))) = true;
        end
    end
    take = take | strcmp(M.split, 'test');
    M = M(take, :);
    fprintf('NV dataset: %d photographs (%d train, %d test)\n', height(M), nnz(strcmp(M.split, 'train')), nnz(strcmp(M.split, 'test')));

    rowsOut = cell(height(M), 1);
    t0 = tic;
    for i = 1:height(M)
        try
            f = nvFeatures(M.path{i}, S.model);
            f.id = M.id{i}; f.dataset = M.dataset{i}; f.split = M.split{i}; f.label = M.label{i};
            rowsOut{i} = f;
        catch err
            fprintf('  skipped %s: %s\n', M.id{i}, err.message);
        end
        if mod(i, 50) == 0, fprintf('  %d/%d (%.0f s)\n', i, height(M), toc(t0)); end
    end
    rowsOut = rowsOut(~cellfun(@isempty, rowsOut));
    T = struct2table([rowsOut{:}]);
    T = movevars(T, {'id', 'dataset', 'split', 'label'}, 'Before', 1);
    writetable(T, fullfile(root, 'validation', 'results', 'nv_features.csv'));
    fprintf('Wrote %d rows\n', height(T));
end
