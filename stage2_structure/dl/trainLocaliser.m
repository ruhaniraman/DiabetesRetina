function model = trainLocaliser(opts)
% TRAINLOCALISER  Train a network that finds the optic disc centre and the fovea directly (heatmap U-Net), on IDRiD's labelled centres.
%
%   model = trainLocaliser()
%   model = trainLocaliser(struct('Iterations', 100))      quick smoke test
%
% Until now the fovea was not detected: estimateFovea puts it 2.5 disc diameters temporal to the disc. On IDRiD's test set that
% misses by 284 px on average (challenge winner 64.5 px), and the disc centre from the lesion network by 66 px (winner 21.1 px).
%
% Data: IDRiD localisation TRAINING set (413 photographs with expert disc and fovea centres); opts.ValPhotos of them are held out
% to pick the best iteration. The 103 TEST photographs are never used here (validateLocalisation scores them).
% Each photo is cropped to the retina, resized so the retina is opts.Width px wide, normalised per colour channel inside the
% retina (normaliseFundus) and centred on a square canvas. The network (U-Net, depth 5 so it sees the whole retina) outputs
% one map per landmark; a spatial softmax turns each into a probability distribution over positions, trained with
% cross-entropy against a Gaussian at the expert centre. Augmentation: mirror (left/right eyes), rotation, scale, shift,
% brightness/contrast. The centre is read out as the probability-weighted mean near the peak (sub-pixel).
%
% Saves stage2_structure/dl/Stage2_Localiser.mat (use locateDiscFovea to apply it).

    here = fileparts(mfilename('fullpath'));
    root = fileparts(fileparts(here));
    addpath(here, fullfile(root, 'utils'), fullfile(root, 'stage1_quality'));
    defaults = struct('Width', 512, 'Canvas', 512, 'Sigma', 4, 'Batch', 8, 'Iterations', 5000, 'LearnRate', 5e-4, ...
        'Warmup', 200, 'ClipNorm', 5, 'EncoderDepth', 5, 'FirstFilters', 16, 'ValPhotos', 43, 'ValidateEvery', 250, ...
        'Rotation', [-15 15], 'Scale', [0.85 1.15], 'Shift', 40, 'Seed', 11, ...
        'OutFile', fullfile(here, 'Stage2_Localiser.mat'));
    if nargin < 1, opts = struct(); end
    for f = fieldnames(defaults)'
        if ~isfield(opts, f{1}), opts.(f{1}) = defaults.(f{1}); end
    end
    rng(opts.Seed);
    useGPU = canUseGPU();

    D = localisationData(root, 'train', opts.Width, opts.Canvas);
    order = randperm(numel(D));
    va = D(order(1:opts.ValPhotos)); tr = D(order(opts.ValPhotos + 1:end));
    fprintf('Localiser: %d train, %d validation photographs (IDRiD localisation training set), %s\n', numel(tr), numel(va), ...
        ternary(useGPU, 'GPU', 'CPU'));

    lg = unet([opts.Canvas opts.Canvas 3], 2, 'EncoderDepth', opts.EncoderDepth, 'NumFirstEncoderFilters', opts.FirstFilters);
    inName = lg.Layers(1).Name;
    lg = replaceLayer(lg, inName, imageInputLayer([opts.Canvas opts.Canvas 3], 'Normalization', 'none', 'Name', inName));
    lg = removeLayers(lg, lg.Layers(end).Name);          % raw maps; the spatial softmax is in the loss and in decoding
    net = initialize(lg);
    fprintf('U-Net: %.1fM parameters\n', sum(cellfun(@numel, net.Learnables.Value)) / 1e6);

    avgG = []; avgSq = [];
    best = struct('score', Inf, 'net', [], 'iteration', 0, 'err', []);
    history = zeros(0, 4);
    t0 = tic;
    for it = 1:opts.Iterations
        [X, T] = sampleBatch(tr, opts);
        if useGPU, X = gpuArray(X); T = gpuArray(T); end
        [loss, grad] = dlfeval(@modelLoss, net, dlarray(X, 'SSCB'), T);
        grad = clipGradients(grad, opts.ClipNorm);
        lr = opts.LearnRate * min(1, it / opts.Warmup) * 0.5 * (1 + cos(pi * (it - 1) / opts.Iterations)) + 1e-6;
        [net, avgG, avgSq] = adamupdate(net, grad, avgG, avgSq, it, lr);
        if mod(it, 100) == 0
            fprintf('  it %5d  loss %.4f  lr %.2e  %.0f s\n', it, double(gather(extractdata(loss))), lr, toc(t0));
        end
        if mod(it, opts.ValidateEvery) == 0 || it == opts.Iterations
            err = validate(net, va);                           % native px, [disc fovea] per photo
            score = mean(err(:, 1)) + mean(err(:, 2));
            history(end + 1, :) = [it, double(gather(extractdata(loss))), mean(err)]; %#ok<AGROW>
            fprintf('  VALIDATION it %d: mean error disc %.1f px, fovea %.1f px%s\n', it, mean(err), ...
                ternary(score < best.score, '  (best)', ''));
            if score < best.score, best = struct('score', score, 'net', net, 'iteration', it, 'err', err); end
        end
    end

    model = struct('net', best.net, 'landmarks', {{'disc', 'fovea'}}, 'width', opts.Width, 'canvas', opts.Canvas, ...
        'validationError', mean(best.err), 'bestIteration', best.iteration, 'history', history, 'options', opts, ...
        'created', char(datetime('now', 'Format', 'yyyy-MM-dd HH:mm')));
    save(opts.OutFile, 'model', '-v7.3');
    fprintf('Best validation mean error: disc %.1f px, fovea %.1f px (iteration %d). Saved %s\n', mean(best.err), ...
        best.iteration, opts.OutFile);
end

function D = localisationData(root, split, width, canvas)
% IDRiD localisation photos prepared as locateDiscFovea prepares any photo, with expert centres in canvas coordinates.
% Cached in data/stage2_cache.
    cacheFile = fullfile(root, 'data', 'stage2_cache', sprintf('localisation_%s_%d_%d.mat', split, width, canvas));
    if isfile(cacheFile), S = load(cacheFile, 'D'); D = S.D; return; end
    base = fullfile(root, 'data', 'idrid_localization', 'C. Localization', 'C. Localization');
    tag = ternary(strcmp(split, 'test'), {'b. Testing Set', 'Testing'}, {'a. Training Set', 'Training'});
    od = readCentres(fullfile(base, '2. Groundtruths', '1. Optic Disc Center Location', ...
        sprintf('%s. IDRiD_OD_Center_%s Set_Markups.csv', tag{1}(1), tag{2})));
    fv = readCentres(fullfile(base, '2. Groundtruths', '2. Fovea Center Location', sprintf('IDRiD_Fovea_Center_%s Set_Markups.csv', tag{2})));
    D = struct('id', {}, 'X', {}, 'pts', {}, 'frame', {});
    for i = 1:height(od)
        j = find(strcmp(fv.id, od.id{i}), 1);
        if isempty(j), continue; end
        img = imread(fullfile(base, '1. Original Images', tag{1}, [od.id{i} '.jpg']));
        [X, frame] = locateDiscFovea('prepare', img, width, canvas);
        pts = locateDiscFovea('toCanvas', [od.x(i) od.y(i); fv.x(j) fv.y(j)], frame);
        D(end + 1) = struct('id', od.id{i}, 'X', X, 'pts', pts, 'frame', frame); %#ok<AGROW>
        if mod(i, 50) == 0, fprintf('  prepared %d/%d\n', i, height(od)); end
    end
    save(cacheFile, 'D', '-v7.3');
end

function C = readCentres(file)
    raw = readcell(file);
    rows = raw(2:end, 1:3);
    keep = cellfun(@(v) ischar(v) || isstring(v), rows(:, 1)) & ~cellfun(@(v) isempty(v) || (isnumeric(v) && isnan(v)), rows(:, 2));
    rows = rows(keep, :);
    C = table(cellstr(string(rows(:, 1))), cell2mat(rows(:, 2)), cell2mat(rows(:, 3)), 'VariableNames', {'id', 'x', 'y'});
end

function [X, T] = sampleBatch(D, opts)
% Random affine (mirror, rotation, scale, shift) applied to the photo and its landmarks together, then colour jitter.
    N = opts.Canvas; B = opts.Batch;
    X = zeros(N, N, 3, B, 'single'); T = zeros(N, N, 2, B, 'single');
    [gx, gy] = meshgrid(1:N, 1:N);
    for b = 1:B
        d = D(randi(numel(D)));
        a = deg2rad(opts.Rotation(1) + rand * diff(opts.Rotation));
        s = opts.Scale(1) + rand * diff(opts.Scale);
        m = ternary(rand < 0.5, -1, 1);                        % mirror: a right eye looks like a left eye
        c = (N + 1) / 2;
        A = [m * s * cos(a), -s * sin(a); m * s * sin(a), s * cos(a)];
        t = c - A * [c; c] + opts.Shift * (2 * rand(2, 1) - 1);
        tf = affinetform2d([A t; 0 0 1]);
        ref = imref2d([N N]);
        x = imwarp(d.X, tf, 'linear', 'OutputView', ref, 'FillValues', 0);
        x = x .* (0.85 + 0.3 * rand(1, 1, 3, 'single')) + 0.3 * (rand(1, 1, 3, 'single') - 0.5) .* (x ~= 0);
        [px, py] = transformPointsForward(tf, d.pts(:, 1), d.pts(:, 2));
        X(:, :, :, b) = x;
        for k = 1:2
            g = exp(-((gx - px(k)) .^ 2 + (gy - py(k)) .^ 2) / (2 * opts.Sigma ^ 2));
            T(:, :, k, b) = g / max(sum(g, 'all'), eps);
        end
    end
end

function [loss, grad] = modelLoss(net, X, T)
% Cross-entropy between each landmark's spatial softmax and its (normalised) Gaussian target.
    Z = forward(net, X);
    Z = stripdims(Z);
    [H, W, C, B] = size(Z);
    Z = reshape(Z, H * W, C * B);
    logP = Z - max(Z, [], 1);
    logP = logP - log(sum(exp(logP), 1));
    loss = -sum(reshape(T, H * W, C * B) .* logP, 'all') / (C * B);
    grad = dlgradient(loss, net.Learnables);
end

function grad = clipGradients(grad, maxNorm)
    n = sqrt(sum(cellfun(@(g) double(gather(extractdata(sum(g .^ 2, 'all')))), grad.Value)));
    if n > maxNorm
        grad.Value = cellfun(@(g) g * (maxNorm / n), grad.Value, 'UniformOutput', false);
    end
end

function err = validate(net, va)
    err = zeros(numel(va), 2);
    for i = 1:numel(va)
        pts = locateDiscFovea('decode', net, va(i).X);
        truth = locateDiscFovea('toNative', va(i).pts, va(i).frame);
        est = locateDiscFovea('toNative', pts, va(i).frame);
        err(i, :) = sqrt(sum((est - truth) .^ 2, 2))';
    end
end

function out = ternary(cond, a, b)
    if cond, out = a; else, out = b; end
end
