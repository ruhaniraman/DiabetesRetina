function model = calibrateLesionMasks(opts)
% CALIBRATELESIONMASKS  Choose, per lesion type, a mask threshold and a minimum region size that keep healthy eyes clear.
%
%   calibrateLesionMasks()                                  grid search, then pick with QuietTarget 0.95
%   calibrateLesionMasks(struct('QuietTarget', 0.97))       re-pick from the cached grid (fast)
%
% Trained thresholds maximise Dice on 9 IDRiD photographs, all with disease; on APTOS every healthy eye then had something
% marked. Here, for each lesion type (MA, HE, EX, SE) and every (threshold, minimum area) pair on a grid:
%   - Dice on the IDRiD VALIDATION photographs (working resolution, cached masks), and
%   - the share of APTOS VALIDATION-split No_DR eyes (the Stage 3 split; never the test split) with nothing marked.
% The pair with the best Dice among those keeping at least QuietTarget of healthy eyes clear is chosen. Test photographs are
% not used; evaluateLesionSegmenter reports the result on them.
%
% Sizes are in pixels at the working resolution (retina 1792 px wide), so they mean the same on every camera.
% Saves the grid to data/stage2_cache/mask_grid_<model>.mat and writes model.thresholds / model.minArea into the model file
% (the training thresholds are kept as model.thresholdsDice).

    here = fileparts(mfilename('fullpath'));
    root = fileparts(fileparts(here));
    addpath(here, fullfile(root, 'utils'), fullfile(root, 'stage1_quality'));
    if nargin < 1, opts = struct(); end
    if ~isfield(opts, 'QuietTarget'), opts.QuietTarget = 0.95; end
    if ~isfield(opts, 'ModelFile'), opts.ModelFile = fullfile(here, 'Stage2_LesionUNet.mat'); end
    [~, modelName] = fileparts(opts.ModelFile);
    gridFile = fullfile(root, 'data', 'stage2_cache', ['mask_grid_' modelName '.mat']);

    S = load(opts.ModelFile, 'model');
    model = S.model;
    if ~isfield(model, 'thresholdsDice'), model.thresholdsDice = model.thresholds; end
    lesions = 1:4;
    T = [0.30 0.40 0.50 0.60 0.70 0.80 0.85 0.90 0.93 0.95 0.97 0.98 0.99];
    A = [1 3 5 10 20 40 80 160 320];

    if isfile(gridFile) && ~isfield(opts, 'Recompute')
        G = load(gridFile);
    else
        base = model; base.thresholds = zeros(1, numel(model.channels)); base = rmfieldIf(base, 'minArea');

        % IDRiD validation: pooled tp / predicted / truth pixels per (lesion, threshold, min area)
        D = prepareLesionData(model.targetWidth);
        va = D(strcmp({D.split}, 'validation'));
        tp = zeros(4, numel(T), numel(A)); pred = tp; truth = zeros(4, 1);
        for i = 1:numel(va)
            P = predictTiles(model.net, normaliseFundus(va(i).img, va(i).fov), model.tile, model.overlap) .* va(i).fov;
            for c = lesions
                g = va(i).masks(:, :, c) & va(i).fov;
                truth(c) = truth(c) + nnz(g);
                for t = 1:numel(T)
                    [areas, hit] = regions(P(:, :, c) >= T(t), g);
                    for a = 1:numel(A)
                        keep = areas >= A(a);
                        tp(c, t, a) = tp(c, t, a) + sum(hit(keep));
                        pred(c, t, a) = pred(c, t, a) + sum(areas(keep));
                    end
                end
            end
            fprintf('  IDRiD validation %d/%d\n', i, numel(va));
        end

        % APTOS validation split: marked area (share of retina) per eye, lesion, threshold, min area
        M = readtable(fullfile(root, 'stage_3', 'finetune', 'manifest.csv'), 'TextType', 'char', 'Delimiter', ',');
        ap = M(strcmp(M.dataset, 'aptos') & strcmp(M.split, 'validation'), :);
        area = zeros(height(ap), 4, numel(T), numel(A), 'single');
        for i = 1:height(ap)
            [~, ~, info] = segmentLesionsDL(imread(ap.path{i}), base);
            P = info.workProb; nf = max(nnz(info.workFov), 1);
            for c = lesions
                for t = 1:numel(T)
                    areas = regions(P(:, :, c) >= T(t), []);
                    for a = 1:numel(A)
                        area(i, c, t, a) = sum(areas(areas >= A(a))) / nf;
                    end
                end
            end
            if mod(i, 50) == 0, fprintf('  APTOS validation %d/%d\n', i, height(ap)); end
        end
        G = struct('T', T, 'A', A, 'tp', tp, 'pred', pred, 'truth', truth, 'area', area, ...
            'label', {ap.label}, 'id', {ap.id}, 'created', char(datetime('now', 'Format', 'yyyy-MM-dd HH:mm')));
        save(gridFile, '-struct', 'G', '-v7.3');
    end

    %% Pick, per lesion
    dice = 2 * G.tp ./ max(G.pred + reshape(G.truth, 4, 1, 1), 1);
    healthy = strcmp(G.label, 'No_DR');
    quiet = squeeze(mean(G.area(healthy, :, :, :) == 0, 1));          % 4 x nT x nA
    names = model.channels;
    thr = model.thresholds; minArea = ones(1, numel(names));
    fprintf('\nQuiet target %.0f%% of %d healthy APTOS validation eyes, per lesion type\n', 100 * opts.QuietTarget, nnz(healthy));
    fprintf('%-3s  %6s %6s  %9s %9s   (at the trained threshold, no size rule: Dice, quiet)\n', 'ch', 'thr', 'area', 'valDice', 'quiet');
    for c = lesions
        d = squeeze(dice(c, :, :)); q = squeeze(quiet(c, :, :));
        d(q < opts.QuietTarget) = -Inf;
        [best, k] = max(d(:));
        [t, a] = ind2sub(size(d), k);
        if ~isfinite(best)                                          % nothing reaches the target: take the quietest setting
            [~, k] = max(q(:)); [t, a] = ind2sub(size(q), k);
        end
        thr(c) = G.T(t); minArea(c) = G.A(a);
        [~, t0] = min(abs(G.T - model.thresholdsDice(c)));
        fprintf('%-3s  %6.2f %6d  %9.3f %8.1f%%   (%.3f, %.1f%%)\n', names{c}, thr(c), minArea(c), dice(c, t, a), 100 * q(t, a), ...
            dice(c, t0, 1), 100 * quiet(c, t0, 1));
    end
    % Whole-eye: nothing of any lesion type marked, at the chosen settings
    anyMarked = false(nnz(healthy), 1);
    hi = find(healthy);
    for c = lesions
        t = find(G.T == thr(c)); a = find(G.A == minArea(c));
        anyMarked = anyMarked | G.area(hi, c, t, a) > 0;
    end
    fprintf('Healthy validation eyes with nothing marked at all: %.1f%%\n', 100 * mean(~anyMarked));

    if isfield(opts, 'DryRun') && opts.DryRun, return; end
    model.thresholds(lesions) = thr(lesions);
    model.minArea = minArea;
    model.maskCalibration = struct('quietTarget', opts.QuietTarget, 'healthyQuietValidation', mean(~anyMarked), ...
        'created', char(datetime('now', 'Format', 'yyyy-MM-dd HH:mm')));
    save(opts.ModelFile, 'model', '-v7.3');
    fprintf('Saved thresholds %s and minArea %s to %s\n', mat2str(model.thresholds, 3), mat2str(model.minArea), opts.ModelFile);
end

function [areas, hit] = regions(bw, g)
% Area of each connected region, and (if g is given) how many of its pixels are true lesion.
    cc = bwconncomp(bw, 8);
    areas = cellfun(@numel, cc.PixelIdxList)';
    if nargout > 1
        hit = cellfun(@(p) nnz(g(p)), cc.PixelIdxList)';
    end
end

function s = rmfieldIf(s, f)
    if isfield(s, f), s = rmfield(s, f); end
end
