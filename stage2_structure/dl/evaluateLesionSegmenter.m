function R = evaluateLesionSegmenter(opts)
% EVALUATELESIONSEGMENTER  Test the Stage 2 lesion network the way validation/LESIONS.md tested the old overlay, and more.
%
%   R = evaluateLesionSegmenter()
%   R = evaluateLesionSegmenter(struct('Classical', false, 'AptosMax', 100))
%
%   A. IDRiD official test set (27 photographs never used for training or thresholds), at FULL resolution against the original
%      masks: pixel AUPR (the IDRiD segmentation challenge's measure) and Dice at the thresholds chosen on validation.
%   B. The classical Stage 2 pipeline (opticDiscLocalization -> vesselSegmentation -> lesionDetection) on the same photographs,
%      scored the same way (Dice; it outputs masks, not probabilities).
%   C. Healthy vs diseased eyes: APTOS held-out test photographs (the Stage 3 test split, full resolution, image-level grades).
%      Share of the retina flagged per lesion type by true grade, how many healthy eyes get anything flagged, and how well the
%      total lesion area separates referable from non-referable eyes (AUC). The old overlay flagged 100% of healthy eyes and
%      had AUC 0.51 here.
%
% Writes validation/results/<OutName>.json and .md (OutName: lesions_dl for Stage2_LesionUNet.mat, else lesions_dl_<model file>).

    here = fileparts(mfilename('fullpath'));
    root = fileparts(fileparts(here));
    addpath(here, fullfile(root, 'utils'), fullfile(root, 'stage1_quality'), fullfile(root, 'stage2_structure'));
    if nargin < 1, opts = struct(); end
    if ~isfield(opts, 'Classical'), opts.Classical = true; end
    if ~isfield(opts, 'AptosMax'), opts.AptosMax = Inf; end
    if ~isfield(opts, 'ModelFile'), opts.ModelFile = fullfile(here, 'Stage2_LesionUNet.mat'); end
    [~, modelName] = fileparts(opts.ModelFile);
    if ~isfield(opts, 'OutName'), opts.OutName = ternaryName(strcmp(modelName, 'Stage2_LesionUNet'), 'lesions_dl', ['lesions_dl_' modelName]); end
    S = load(opts.ModelFile, 'model');
    model = S.model;
    ch = model.channels; C = numel(ch);
    lesions = 1:4;                                                   % MA HE EX SE (OD is anatomy, reported separately)
    R = struct('model', opts.ModelFile, 'thresholds', model.thresholds, 'channels', {ch});

    %% A (+B). IDRiD test, full resolution
    base = fullfile(root, 'data', 'idrid_segmentation', 'A. Segmentation', 'A. Segmentation');
    folders = {'1. Microaneurysms', '2. Haemorrhages', '3. Hard Exudates', '4. Soft Exudates', '5. Optic Disc'};
    files = dir(fullfile(base, '1. Original Images', 'b. Testing Set', '*.jpg'));
    H = lesionPR('init', C);
    classic = zeros(4, 3);                                           % per lesion: tp, fp, fn (pooled pixels)
    classicOk = 0;
    final = zeros(C, 3);                                             % per channel: tp, fp, fn of the final masks (pooled pixels)
    for f = 1:numel(files)
        [~, id] = fileparts(files(f).name);
        imgPath = fullfile(files(f).folder, files(f).name);
        img = imread(imgPath);
        [prob, masks, info] = segmentLesionsDL(img, model);
        G = false(size(prob));
        for c = 1:C
            mf = fullfile(base, '2. All Segmentation Groundtruths', 'b. Testing Set', folders{c}, sprintf('%s_%s.tif', id, ch{c}));
            if isfile(mf), G(:, :, c) = readMask(mf); end
        end
        H = lesionPR('add', H, prob, G, info.fov);
        for c = 1:C                                                  % the masks the app would show (threshold + size rule)
            m = masks(:, :, c); g = G(:, :, c) & info.fov;
            final(c, :) = final(c, :) + [nnz(m & g), nnz(m & ~g), nnz(~m & g)];
        end
        fprintf('  A %2d/%d %s\n', f, numel(files), id);

        if opts.Classical
            try
                od = opticDiscLocalization(imgPath, [], struct('visualize', false, 'verbose', false));
                ves = vesselSegmentation(imgPath, struct('visualize', false, 'verbose', false));
                les = lesionDetection(imgPath, od.pred, 193, ves.vesselMask, struct('visualize', false, 'verbose', false));
                pm = {les.maMask, les.heMask, les.exMask, les.seMask};
                for c = lesions
                    p = pm{c};
                    if ~isequal(size(p), size(G, [1 2])), p = imresize(p, size(G, [1 2]), 'nearest'); end
                    g = G(:, :, c);
                    classic(c, :) = classic(c, :) + [nnz(p & g), nnz(p & ~g), nnz(~p & g)];
                end
                classicOk = classicOk + 1;
            catch err
                fprintf('    classical pipeline failed on %s: %s\n', id, err.message);
            end
        end
    end
    SA = lesionPR('summary', H);
    trainedThr = model.thresholds;
    if isfield(model, 'thresholdsDice'), trainedThr = model.thresholdsDice; end   % best-Dice thresholds from training
    diceAtThr = diceAt(H, trainedThr);
    diceFinal = (2 * final(:, 1) ./ max(2 * final(:, 1) + final(:, 2) + final(:, 3), 1))';
    R.idrid = struct('n', numel(files), 'aupr', SA.aupr, 'diceAtValidationThreshold', diceAtThr, 'diceFinalMasks', diceFinal, ...
        'bestPossibleDice', SA.bestDice);
    if opts.Classical
        R.classical = struct('n', classicOk, 'dice', (2 * classic(:, 1) ./ max(2 * classic(:, 1) + classic(:, 2) + classic(:, 3), 1))');
    end

    %% C. APTOS healthy vs diseased (Stage 3 test split, full-resolution photographs)
    splits = readtable(fullfile(root, 'validation', 'results', 'splits.csv'), 'TextType', 'char');
    te = splits(strcmp(splits.split, 'test'), :);
    if isfinite(opts.AptosMax) && height(te) > opts.AptosMax
        rng(4); te = te(sort(randperm(height(te), opts.AptosMax)), :);
    end
    aptosDir = fullfile(root, 'data', 'aptos2019_full', 'train_images');
    area = nan(height(te), 4);                                      % share of the retina flagged, per lesion type
    anyFlag = false(height(te), 1);
    for i = 1:height(te)
        img = imread(fullfile(aptosDir, [te.id{i} '.png']));
        [~, masks, info] = segmentLesionsDL(img, model);
        nf = max(nnz(info.fov), 1);
        for c = lesions
            m = masks(:, :, c);
            if ~isfield(model, 'minArea'), m = bwareaopen(m, 3); end  % uncalibrated model: ignore single stray pixels
            area(i, c) = nnz(m) / nf;
        end
        anyFlag(i) = any(area(i, :) > 0);
        if mod(i, 50) == 0, fprintf('  C %d/%d\n', i, height(te)); end
    end
    grades = {'No_DR', 'Mild', 'Moderate', 'Severe', 'Proliferate_DR'};
    referable = ismember(te.label, {'Moderate', 'Severe', 'Proliferate_DR'});
    total = sum(area, 2);
    byGrade = struct();
    for g = 1:numel(grades)
        sel = strcmp(te.label, grades{g});
        byGrade.(grades{g}) = struct('n', nnz(sel), 'medianAreaPct', 100 * median(area(sel, :), 1), ...
            'anyFlaggedPct', 100 * mean(anyFlag(sel)));
    end
    aucs = zeros(1, 5);
    for c = lesions, aucs(c) = rocAuc(area(:, c), referable); end
    aucs(5) = rocAuc(total, referable);
    R.aptos = struct('n', height(te), 'byGrade', byGrade, 'aucReferable', ...
        struct('MA', aucs(1), 'HE', aucs(2), 'EX', aucs(3), 'SE', aucs(4), 'total', aucs(5)));

    %% Report
    outDir = fullfile(root, 'validation', 'results');
    fid = fopen(fullfile(outDir, [opts.OutName '.json']), 'w'); fwrite(fid, jsonencode(R, 'PrettyPrint', true)); fclose(fid);
    writeMarkdown(fullfile(outDir, [opts.OutName '.md']), R, model, ch, lesions, grades);
    fprintf('\nRESULT IDRiD test AUPR  MA %.3f HE %.3f EX %.3f SE %.3f OD %.3f\n', SA.aupr);
    fprintf('RESULT IDRiD test Dice  MA %.3f HE %.3f EX %.3f SE %.3f OD %.3f (validation thresholds)\n', diceAtThr);
    fprintf('RESULT IDRiD test Dice  MA %.3f HE %.3f EX %.3f SE %.3f OD %.3f (final masks: threshold + size rule)\n', diceFinal);
    if opts.Classical
        fprintf('RESULT classical Dice    MA %.3f HE %.3f EX %.3f SE %.3f (n=%d)\n', R.classical.dice, classicOk);
    end
    fprintf('RESULT APTOS healthy eyes with anything flagged: %.1f%%; AUC referable (total area) %.3f\n', ...
        byGrade.No_DR.anyFlaggedPct, aucs(5));
end

function d = diceAt(H, thr)
    nb = size(H.pos, 1);
    d = nan(1, size(H.pos, 2));
    for c = 1:size(H.pos, 2)
        k = min(nb, floor(thr(c) * nb) + 1);                        % bins at or above the threshold count as "lesion"
        tp = sum(H.pos(k:end, c)); fp = sum(H.neg(k:end, c)); fn = sum(H.pos(1:k - 1, c));
        d(c) = 2 * tp / max(2 * tp + fp + fn, 1);
    end
end

function a = rocAuc(score, label)
    pos = score(label); neg = score(~label);
    if isempty(pos) || isempty(neg), a = NaN; return; end
    r = tiedrank([pos; neg]);
    a = (sum(r(1:numel(pos))) - numel(pos) * (numel(pos) + 1) / 2) / (numel(pos) * numel(neg));
end

function writeMarkdown(file, R, model, ch, lesions, grades)
    fid = fopen(file, 'w');
    fprintf(fid, '# Stage 2 lesion network (U-Net): evaluation\n\n');
    fprintf(fid, 'Generated by `stage2_structure/dl/evaluateLesionSegmenter.m` on %s. Model trained %s (best validation iteration %d).\n\n', ...
        char(datetime('now', 'Format', 'yyyy-MM-dd HH:mm')), model.created, model.bestIteration);
    fprintf(fid, '## A. IDRiD official test set (%d photographs, full resolution)\n\n', R.idrid.n);
    fprintf(fid, '| | %s |\n|---|%s\n', strjoin(ch, ' | '), repmat('---|', 1, numel(ch)));
    fprintf(fid, '| AUPR (IDRiD challenge measure) |%s\n', sprintf(' %.3f |', R.idrid.aupr));
    trainedThr = model.thresholds;
    if isfield(model, 'thresholdsDice'), trainedThr = model.thresholdsDice; end
    fprintf(fid, '| Dice at the best-Dice validation threshold, no size rule |%s\n', sprintf(' %.3f |', R.idrid.diceAtValidationThreshold));
    fprintf(fid, '| Best-Dice threshold (from validation) |%s\n', sprintf(' %.2f |', trainedThr));
    fprintf(fid, '| Threshold the app uses |%s\n', sprintf(' %.2f |', model.thresholds));
    if isfield(model, 'minArea')
        fprintf(fid, '| Minimum region, px at working resolution (calibrateLesionMasks) |%s\n', sprintf(' %d |', model.minArea));
    end
    fprintf(fid, '| **Dice of the masks the app shows** (threshold + size rule) |%s\n', sprintf(' %.3f |', R.idrid.diceFinalMasks));
    if isfield(R, 'classical')
        fprintf(fid, '| Classical pipeline Dice (n=%d) |%s — |\n', R.classical.n, sprintf(' %.3f |', R.classical.dice));
    end
    fprintf(fid, '\nPixel-level, pooled over all test photographs, inside the retina. AUPR needs no threshold; Dice uses thresholds fixed on validation photographs only. Masks are read from their colour channels (`readMask`): IDRiD_81_EX.tif is RGBA with an all-255 alpha channel, which earlier versions counted as lesion.\n\n');
    fprintf(fid, '## C. Healthy vs diseased eyes (APTOS held-out test photographs, n=%d)\n\n', R.aptos.n);
    fprintf(fid, '| True grade | n | Any lesion flagged | Median %% of retina flagged (%s) |\n|---|---|---|---|\n', strjoin(ch(lesions), ' / '));
    for g = 1:numel(grades)
        b = R.aptos.byGrade.(grades{g});
        fprintf(fid, '| %s | %d | %.1f%% | %s |\n', grades{g}, b.n, b.anyFlaggedPct, strjoin(compose('%.3f', b.medianAreaPct), ' / '));
    end
    a = R.aptos.aucReferable;
    fprintf(fid, '\nAUC for telling referable from non-referable eyes by flagged area: MA %.3f, HE %.3f, EX %.3f, SE %.3f, total %.3f (0.5 = no information).\n', a.MA, a.HE, a.EX, a.SE, a.total);
    fprintf(fid, 'For comparison, the old rule-based overlay flagged 100%% of healthy eyes and had AUC 0.51 (validation/LESIONS.md).\n');
    fclose(fid);
end

function out = ternaryName(cond, a, b)
    if cond, out = a; else, out = b; end
end
