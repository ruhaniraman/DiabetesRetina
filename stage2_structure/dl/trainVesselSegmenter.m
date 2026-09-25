function model = trainVesselSegmenter(opts)
% TRAINVESSELSEGMENTER  Train the Stage 2 vessel network (U-Net) on DRIVE's manually traced vessel maps.
%
%   model = trainVesselSegmenter()
%   model = trainVesselSegmenter(struct('Iterations', 200, 'Folds', 0))     quick smoke test, no cross-validation
%
% Replaces the classical vesselSegmentation.m, which scores accuracy 0.896 / AUC 0.887 on DRIVE (validation/results/vessels_drive.md),
% against about 0.944 / 0.96 for published methods. One sigmoid output: probability that a pixel is vessel.
%
% Data: the Kaggle mirror of DRIVE in data/drive/DRIVE has manual maps for the 20 TRAINING photographs only. So the network is
% judged by cross-validation: opts.Folds folds of 5 photos, each predicted by a network that never saw it (out-of-fold). Each
% fold's threshold is the one with the best Dice on that fold's own training photos. The model that is saved is then trained on all 20,
% with the mean fold threshold, and carries the out-of-fold metrics in model.crossValidation (vesselDriveEval reports them).
%
% Preparation is the same as for the lesion network: crop to the retina, resize it to opts.TargetWidth px wide (about DRIVE's
% own scale), normalise each colour channel inside the retina (normaliseFundus). Training: 128x128 patches from anywhere in the
% retina, flips, 90-degree rotations, scale 0.8-1.25 and brightness/contrast jitter (other cameras). Loss: BCE + soft Dice.
%
% opts.Enhance (default true): after resizing to the working width, the photo is enhanced (enhanceForReview: illumination normalisation,
% CLAHE, denoising) before normalisation, in training and in use. The first network (raw photos) found only the main arcades on dark,
% low-contrast IDRiD photos; enhancement makes other cameras look more like DRIVE.
%
% Saves stage2_structure/dl/Stage2_VesselUNet.mat (model struct; use segmentVesselsDL to apply it).

    here = fileparts(mfilename('fullpath'));
    root = fileparts(fileparts(here));
    addpath(here, fullfile(root, 'utils'), fullfile(root, 'stage1_quality'));

    defaults = struct('TargetWidth', 560, 'Patch', 128, 'Batch', 16, 'Iterations', 4000, 'LearnRate', 5e-4, ...
        'Warmup', 200, 'ClipNorm', 5, 'EncoderDepth', 4, 'FirstFilters', 32, 'ScaleRange', [0.8 1.25], ...
        'Folds', 4, 'Seed', 7, 'Enhance', true, 'OutFile', fullfile(here, 'Stage2_VesselUNet.mat'));
    if nargin < 1, opts = struct(); end
    for f = fieldnames(defaults)'
        if ~isfield(opts, f{1}), opts.(f{1}) = defaults.(f{1}); end
    end

    D = loadDrive(root, opts.TargetWidth, opts.Enhance);
    n = numel(D);
    fprintf('Stage 2 vessel network: %d DRIVE photographs, retina %d px wide, %s\n', n, opts.TargetWidth, ...
        ternary(canUseGPU(), 'GPU', 'CPU'));

    %% Cross-validation (out-of-fold metrics on all 20 photos)
    cv = table();
    foldThresholds = [];
    if opts.Folds > 1
        rng(opts.Seed);
        fold = mod(randperm(n) - 1, opts.Folds) + 1;
        for k = 1:opts.Folds
            fprintf('\n== Fold %d/%d: training on %d photos, testing on %d ==\n', k, opts.Folds, nnz(fold ~= k), nnz(fold == k));
            net = trainOne(D(fold ~= k), opts, opts.Seed + k);
            thr = bestThreshold(net, D(fold ~= k));
            foldThresholds(end + 1) = thr; %#ok<AGROW>
            for i = find(fold == k)
                prob = predictPhoto(net, D(i));
                cv = [cv; scorePhoto(D(i), prob, thr, k)]; %#ok<AGROW>
            end
            fprintf('   fold %d threshold %.2f; out-of-fold accuracy %.4f, sensitivity %.4f, AUC %.4f\n', k, thr, ...
                mean(cv.accuracy(cv.fold == k)), mean(cv.sensitivity(cv.fold == k)), mean(cv.auc(cv.fold == k)));
        end
        cv = sortrows(cv, 'image');
        fprintf('\nOut-of-fold over %d photos: accuracy %.4f, sensitivity %.4f, specificity %.4f, Dice %.3f, AUC %.4f\n', ...
            height(cv), mean(cv.accuracy), mean(cv.sensitivity), mean(cv.specificity), mean(cv.dice), mean(cv.auc));
    end

    %% Final network on all photos
    fprintf('\n== Final network: all %d photos ==\n', n);
    net = trainOne(D, opts, opts.Seed);
    if isempty(foldThresholds), thr = bestThreshold(net, D); else, thr = mean(foldThresholds); end

    model = struct('net', net, 'channels', {{'vessel'}}, 'targetWidth', opts.TargetWidth, 'tile', 256, 'overlap', 32, ...
        'threshold', thr, 'foldThresholds', foldThresholds, 'crossValidation', cv, 'options', opts, ...
        'created', char(datetime('now', 'Format', 'yyyy-MM-dd HH:mm')));
    save(opts.OutFile, 'model', '-v7.3');
    fprintf('Threshold %.3f. Saved %s\n', thr, opts.OutFile);
end

function D = loadDrive(root, targetWidth, enhance)
% DRIVE training photos with manual vessel maps and FOV masks, cropped to the retina and resized to targetWidth.
% Keeps the originals too, so metrics are computed on DRIVE's own pixel grid.
    base = fullfile(root, 'data', 'drive', 'DRIVE', 'training');
    files = dir(fullfile(base, 'images', '*.tif'));
    D = struct('stem', {}, 'img', {}, 'gt', {}, 'fov', {}, 'X', {}, 'G', {}, 'F', {}, 'rows', {}, 'cols', {});
    for i = 1:numel(files)
        stem = erase(files(i).name, '_training.tif');
        img = imread(fullfile(files(i).folder, files(i).name));
        gt = imread(fullfile(base, '1st_manual', [stem '_manual1.gif'])) > 0;
        fov = imread(fullfile(base, 'mask', [stem '_training_mask.gif'])) > 0;
        st = regionprops(fov, 'BoundingBox', 'Area');
        [~, big] = max([st.Area]);
        box = round(st(big).BoundingBox);
        box(1:2) = max(box(1:2), 1);
        box(3) = min(box(3), size(img, 2) - box(1) + 1); box(4) = min(box(4), size(img, 1) - box(2) + 1);
        rows = box(2):box(2) + box(4) - 1; cols = box(1):box(1) + box(3) - 1;
        workSize = round([box(4) box(3)] * targetWidth / box(3));
        crop = imresize(img(rows, cols, :), workSize);
        if enhance, crop = enhanceForReview(crop); end
        F = imresize(fov(rows, cols), workSize, 'nearest');
        G = imresize(single(gt(rows, cols)), workSize, 'bilinear');   % soft at vessel edges after resizing
        D(end + 1) = struct('stem', stem, 'img', img, 'gt', gt, 'fov', fov, 'X', normaliseFundus(crop, F), ... %#ok<AGROW>
            'G', G, 'F', F, 'rows', rows, 'cols', cols);
    end
end

function net = trainOne(D, opts, seed)
    rng(seed);
    useGPU = canUseGPU();
    % unet needs at least 2 classes: build it with 2, then make the last 1x1 convolution a single output
    lg = unet([opts.Patch opts.Patch 3], 2, 'EncoderDepth', opts.EncoderDepth, 'NumFirstEncoderFilters', opts.FirstFilters);
    inName = lg.Layers(1).Name;
    lg = replaceLayer(lg, inName, imageInputLayer([opts.Patch opts.Patch 3], 'Normalization', 'none', 'Name', inName));
    convs = find(arrayfun(@(l) isa(l, 'nnet.cnn.layer.Convolution2DLayer'), lg.Layers));
    lg = replaceLayer(lg, lg.Layers(convs(end)).Name, convolution2dLayer(1, 1, 'Name', lg.Layers(convs(end)).Name));
    lg = replaceLayer(lg, lg.Layers(end).Name, sigmoidLayer('Name', 'vessel_sigmoid'));
    net = initialize(lg);

    where = arrayfun(@(d) find(d.F), D, 'UniformOutput', false);
    avgG = []; avgSq = [];
    t0 = tic;
    for it = 1:opts.Iterations
        [X, T, M] = sampleBatch(D, where, opts);
        if useGPU, X = gpuArray(X); T = gpuArray(T); M = gpuArray(M); end
        X = dlarray(X, 'SSCB'); T = dlarray(T, 'SSCB');
        [loss, grad] = dlfeval(@modelLoss, net, X, T, M);
        grad = clipGradients(grad, opts.ClipNorm);
        lr = opts.LearnRate * min(1, it / opts.Warmup) * 0.5 * (1 + cos(pi * (it - 1) / opts.Iterations)) + 1e-6;
        [net, avgG, avgSq] = adamupdate(net, grad, avgG, avgSq, it, lr);
        if mod(it, 500) == 0 || it == opts.Iterations
            fprintf('  it %5d  loss %.4f  lr %.2e  %.0f s\n', it, double(gather(extractdata(loss))), lr, toc(t0));
        end
    end
end

function [X, T, M] = sampleBatch(D, where, opts)
% Random patches from the retina. A random scale (a crop of s*P pixels resized to P) mimics cameras with a different
% resolution; colour jitter mimics different exposure.
    P = opts.Patch; B = opts.Batch;
    X = zeros(P, P, 3, B, 'single'); T = zeros(P, P, 1, B, 'single'); M = zeros(P, P, 1, B, 'single');
    for b = 1:B
        i = randi(numel(D));
        s = exp(log(opts.ScaleRange(1)) + rand * diff(log(opts.ScaleRange)));
        S = round(P * s); h = floor(S / 2);
        [r, q] = ind2sub(size(D(i).F), where{i}(randi(numel(where{i}))));
        [H, W] = size(D(i).F);
        rows = min(max((r - h:r - h + S - 1), 1), H); cols = min(max((q - h:q - h + S - 1), 1), W);   % replicate at the border
        x = D(i).X(rows, cols, :); t = D(i).G(rows, cols); f = single(D(i).F(rows, cols));
        if S ~= P
            x = imresize(x, [P P], 'bilinear'); t = imresize(t, [P P], 'bilinear'); f = single(imresize(f, [P P], 'nearest'));
        end
        x = (x .* (0.85 + 0.3 * rand(1, 1, 3, 'single')) + 0.3 * (rand(1, 1, 3, 'single') - 0.5)) .* f;
        k = randi(4) - 1;
        x = rot90(x, k); t = rot90(t, k); f = rot90(f, k);
        if rand < 0.5, x = fliplr(x); t = fliplr(t); f = fliplr(f); end
        X(:, :, :, b) = x; T(:, :, 1, b) = t; M(:, :, 1, b) = f;
    end
end

function [loss, grad] = modelLoss(net, X, T, M)
% Binary cross-entropy + soft Dice, both inside the retina only (M).
    Y = forward(net, X);
    Y = min(max(Y, 1e-6), 1 - 1e-6);
    bce = -sum(M .* (T .* log(Y) + (1 - T) .* log(1 - Y)), 'all') / max(sum(M, 'all'), 1);
    dice = 1 - (2 * sum(M .* Y .* T, 'all') + 1) / (sum(M .* Y, 'all') + sum(M .* T, 'all') + 1);
    loss = bce + dice;
    grad = dlgradient(loss, net.Learnables);
end

function grad = clipGradients(grad, maxNorm)
    n = sqrt(sum(cellfun(@(g) double(gather(extractdata(sum(g .^ 2, 'all')))), grad.Value)));
    if n > maxNorm
        grad.Value = cellfun(@(g) g * (maxNorm / n), grad.Value, 'UniformOutput', false);
    end
end

function prob = predictPhoto(net, d)
% Probability on DRIVE's own pixel grid (0 outside the retina).
    P = predictTiles(net, d.X, 256, 32) .* d.F;
    prob = zeros(size(d.fov), 'single');
    prob(d.rows, d.cols) = imresize(P, [numel(d.rows) numel(d.cols)], 'bilinear');
    prob = max(min(prob, 1), 0) .* d.fov;
end

function thr = bestThreshold(net, D)
% Threshold with the best pooled Dice over these (training) photos, on a 0.01 grid.
    grid = 0.05:0.01:0.95;
    tp = zeros(size(grid)); fp = tp; fn = tp;
    for i = 1:numel(D)
        p = predictPhoto(net, D(i)); p = p(D(i).fov); g = D(i).gt(D(i).fov);
        for j = 1:numel(grid)
            m = p >= grid(j);
            tp(j) = tp(j) + nnz(m & g); fp(j) = fp(j) + nnz(m & ~g); fn(j) = fn(j) + nnz(~m & g);
        end
    end
    [~, j] = max(2 * tp ./ (2 * tp + fp + fn));
    thr = grid(j);
end

function row = scorePhoto(d, prob, thr, fold)
    p = prob(d.fov) >= thr; g = d.gt(d.fov); s = double(prob(d.fov));
    tp = nnz(p & g); tn = nnz(~p & ~g); fp = nnz(p & ~g); fn = nnz(~p & g);
    row = table(string(d.stem), fold, thr, (tp + tn) / numel(g), tp / (tp + fn), tn / (tn + fp), 2 * tp / (2 * tp + fp + fn), ...
        rocAuc(s, g), 'VariableNames', {'image', 'fold', 'threshold', 'accuracy', 'sensitivity', 'specificity', 'dice', 'auc'});
end

function a = rocAuc(score, label)
    pos = score(label); neg = score(~label);
    r = tiedrank([pos; neg]);
    a = (sum(r(1:numel(pos))) - numel(pos) * (numel(pos) + 1) / 2) / (numel(pos) * numel(neg));
end

function out = ternary(cond, a, b)
    if cond, out = a; else, out = b; end
end
