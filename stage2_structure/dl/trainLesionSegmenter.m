function model = trainLesionSegmenter(opts)
% TRAINLESIONSEGMENTER  Train the Stage 2 lesion network (U-Net) on IDRiD's pixel-annotated photographs.
%
%   model = trainLesionSegmenter()
%   model = trainLesionSegmenter(struct('Iterations', 12000))
%
% Replaces the rule-based lesion overlay, which validation showed does not detect lesions (validation/LESIONS.md).
% Outputs, per pixel, an independent probability for: microaneurysm (MA), haemorrhage (HE), hard exudate (EX), soft exudate (SE)
% and optic disc (OD). Independent sigmoids, not one softmax, because lesions can overlap (an MA inside a haemorrhage).
%
% Data: prepareLesionData (IDRiD: 45 train / 9 validation / 27 official test; retina resized to 1792 px wide).
% Training: 256x256 patches, mostly centred on lesions (they cover <2% of the retina), with flips, 90-degree rotations and
% brightness/contrast jitter. Loss: binary cross-entropy + soft Dice per channel (Dice keeps tiny lesions from being ignored).
% Every opts.ValidateEvery iterations the whole validation photos are segmented; the network with the best mean lesion AUPR
% is kept, and each channel's threshold is set to the value that maximises Dice on validation.
%
% Saves stage2_structure/dl/Stage2_LesionUNet.mat (model struct; use segmentLesionsDL to apply it).

    here = fileparts(mfilename('fullpath'));
    root = fileparts(fileparts(here));
    addpath(here, fullfile(root, 'utils'), fullfile(root, 'stage1_quality'));

    % First attempt (LearnRate 1e-3, unweighted BCE, Dice over all channels) was unstable: the optic disc was learned, then lost.
    defaults = struct('TargetWidth', 1792, 'Patch', 256, 'Batch', 12, 'Iterations', 10000, 'LearnRate', 3e-4, ...
        'Warmup', 300, 'ClipNorm', 5, 'PosWeight', [10 3 3 5 1], ...   % BCE weight on lesion pixels: MA HE EX SE OD
        'ValidateEvery', 500, 'EncoderDepth', 4, 'FirstFilters', 32, 'LesionFraction', 0.8, 'Seed', 5, ...
        'HealthyTrain', 0, 'HealthyVal', 0, 'HealthyFraction', 0.2, ...   % APTOS No_DR eyes as negatives (0 = IDRiD only)
        'OutFile', fullfile(here, 'Stage2_LesionUNet.mat'));
    if nargin < 1, opts = struct(); end
    for f = fieldnames(defaults)'
        if ~isfield(opts, f{1}), opts.(f{1}) = defaults.(f{1}); end
    end
    rng(opts.Seed);
    useGPU = canUseGPU();

    %% Data
    D = prepareLesionData(opts.TargetWidth);
    channels = D(1).channels;
    C = numel(channels);
    opts.Channels = channels;
    tr = D(strcmp({D.split}, 'train'));
    va = D(strcmp({D.split}, 'validation'));
    fprintf('Stage 2 lesion network: %d train, %d validation photographs; channels %s\n', numel(tr), numel(va), strjoin(channels, ', '));

    clear D                                                         % test photos are not needed here (memory)
    half = opts.Patch / 2;
    trX = cell(numel(tr), 1); trG = cell(numel(tr), 1); trF = cell(numel(tr), 1);
    trNorm = struct('mu', {cell(numel(tr), 1)}, 'sd', {cell(numel(tr), 1)});   % per-photo colour statistics (normaliseFundus)
    where = cell(numel(tr), C);                                     % lesion pixel indices, per image and channel
    for i = 1:numel(tr)
        [trNorm.mu{i}, trNorm.sd{i}] = colourStats(tr(i).img, tr(i).fov);
        trX{i} = padarray(tr(i).img, [half half], 0);                % uint8, normalised per patch (a quarter of the memory)
        trG{i} = padarray(tr(i).masks, [half half], false);
        trF{i} = padarray(tr(i).fov, [half half], false);
        for c = 1:C
            idx = find(trG{i}(:, :, c));
            if numel(idx) > 50000, idx = idx(randperm(numel(idx), 50000)); end
            where{i, c} = idx;
        end
        where{i, C + 1} = find(trF{i});                             % any retina pixel
    end
    % Lesion types to centre patches on (MA and SE are rare and small, so they get more)
    centreWeights = [0.3 0.2 0.2 0.2 0.1];
    vaX = arrayfun(@(d) normaliseFundus(d.img, d.fov), va, 'UniformOutput', false);

    % Healthy eyes (APTOS No_DR, several cameras) with empty lesion masks. The first model, trained on 45 diseased IDRiD photos
    % from one camera, marked lesions in every healthy APTOS eye, and no threshold or size rule fixed that. Train eyes come from
    % the Stage 3 TRAIN split, validation eyes from its VALIDATION split; the test split is never used. They have an optic disc
    % but no disc mask, so the OD channel is left out of the loss and the validation score for them.
    healthy = struct('X', {{}}, 'F', {{}}, 'mu', {{}}, 'sd', {{}}, 'where', {{}});
    hvX = {}; hvF = {};
    if opts.HealthyTrain > 0 || opts.HealthyVal > 0
        M = readtable(fullfile(root, 'stage_3', 'finetune', 'manifest.csv'), 'TextType', 'char', 'Delimiter', ',');
        noDR = strcmp(M.dataset, 'aptos') & strcmp(M.label, 'No_DR');
        pickTr = find(noDR & strcmp(M.split, 'train')); pickTr = pickTr(randperm(numel(pickTr), min(opts.HealthyTrain, numel(pickTr))));
        pickVa = find(noDR & strcmp(M.split, 'validation')); pickVa = pickVa(randperm(numel(pickVa), min(opts.HealthyVal, numel(pickVa))));
        for k = 1:numel(pickTr)
            [img, fov] = retinaCrop(imread(M.path{pickTr(k)}), opts.TargetWidth);
            [healthy.mu{k}, healthy.sd{k}] = colourStats(img, fov);
            healthy.X{k} = padarray(img, [half half], 0);           % uint8: normalised per patch (memory)
            healthy.F{k} = padarray(fov, [half half], false);
            healthy.where{k} = find(healthy.F{k});
        end
        for k = 1:numel(pickVa)
            [hvX{k}, hvF{k}] = retinaCrop(imread(M.path{pickVa(k)}), opts.TargetWidth);   %#ok<AGROW> uint8; normalised when scored
        end
        fprintf('Healthy APTOS eyes: %d train (%.0f%% of patches), %d validation\n', numel(healthy.X), ...
            100 * opts.HealthyFraction * (numel(healthy.X) > 0), numel(hvX));
    end

    %% Network: U-Net, any input size, sigmoid outputs
    lg = unet([opts.Patch opts.Patch 3], C, 'EncoderDepth', opts.EncoderDepth, 'NumFirstEncoderFilters', opts.FirstFilters);
    inName = lg.Layers(1).Name;
    % No normalisation in the layer (normaliseFundus does it per photo). A dlnetwork built on 256 px patches still predicts on
    % larger tiles, which predictTiles relies on.
    lg = replaceLayer(lg, inName, imageInputLayer([opts.Patch opts.Patch 3], 'Normalization', 'none', 'Name', inName));
    smName = lg.Layers(end).Name;
    lg = replaceLayer(lg, smName, sigmoidLayer('Name', 'lesion_sigmoid'));
    net = initialize(lg);
    fprintf('U-Net: %.1fM parameters, %s\n', sum(cellfun(@numel, net.Learnables.Value)) / 1e6, ternary(useGPU, 'GPU', 'CPU'));

    %% Training loop
    avgG = []; avgSq = [];
    best = struct('score', -Inf, 'net', [], 'iteration', 0, 'summary', []);
    history = zeros(0, 3);
    t0 = tic;
    for it = 1:opts.Iterations
        [X, T, V] = sampleBatch(trX, trNorm, trG, trF, where, centreWeights, opts, C, healthy);
        if useGPU, X = gpuArray(X); T = gpuArray(T); V = gpuArray(V); end
        X = dlarray(X, 'SSCB'); T = dlarray(T, 'SSCB');
        [loss, grad] = dlfeval(@modelLoss, net, X, T, V, opts.PosWeight);
        grad = clipGradients(grad, opts.ClipNorm);
        lr = opts.LearnRate * min(1, it / opts.Warmup) * 0.5 * (1 + cos(pi * (it - 1) / opts.Iterations)) + 1e-6;   % warm-up, cosine decay
        [net, avgG, avgSq] = adamupdate(net, grad, avgG, avgSq, it, lr);

        if mod(it, 100) == 0
            fprintf('  it %5d  loss %.4f  lr %.2e  %.0f s\n', it, double(gather(extractdata(loss))), lr, toc(t0));
        end
        if mod(it, opts.ValidateEvery) == 0 || it == opts.Iterations
            [S, Sidrid] = validate(net, vaX, va, C, hvX, hvF);
            score = mean(S.aupr(1:4), 'omitnan');
            history(end + 1, :) = [it, double(gather(extractdata(loss))), score]; %#ok<AGROW>
            fprintf('  VALIDATION it %d: AUPR MA %.3f HE %.3f EX %.3f SE %.3f OD %.3f | mean lesion AUPR %.3f%s\n', it, ...
                S.aupr, score, ternary(score > best.score, '  (best)', ''));
            if ~isempty(hvX)
                fprintf('    (IDRiD photos only: mean lesion AUPR %.3f; healthy eyes lower the score above by adding false alarms)\n', ...
                    mean(Sidrid.aupr(1:4), 'omitnan'));
            end
            if score > best.score
                best = struct('score', score, 'net', net, 'iteration', it, 'summary', S);
            end
        end
    end

    %% Save
    thresholds = best.summary.bestThreshold;
    thresholds(isnan(thresholds)) = 0.5;
    thresholds = min(max(thresholds, 0.05), 0.95);   % a threshold of 0 (a channel that never learned) would mark every pixel
    model = struct('net', best.net, 'channels', {channels}, 'targetWidth', opts.TargetWidth, 'tile', 512, 'overlap', 64, ...
        'thresholds', thresholds, 'validation', best.summary, 'bestIteration', best.iteration, 'history', history, ...
        'options', opts, 'created', char(datetime('now', 'Format', 'yyyy-MM-dd HH:mm')));
    save(opts.OutFile, 'model', '-v7.3');
    fprintf('\nBest validation mean lesion AUPR %.3f at iteration %d. Thresholds (max Dice on validation): %s\nSaved %s\n', ...
        best.score, best.iteration, mat2str(thresholds, 3), opts.OutFile);
end

function [loss, grad] = modelLoss(net, X, T, V, posWeight)
% Weighted binary cross-entropy + soft Dice. Dice is averaged only over the channels that occur in this batch: for an absent
% channel it can only push every prediction to zero, which (first attempt) made the network unlearn the optic disc.
% V (1x1xCxB) is 0 where a patch has no ground truth for a channel (the optic disc in healthy APTOS eyes), 1 elsewhere.
    Y = forward(net, X);
    Y = min(max(Y, 1e-6), 1 - 1e-6);
    w = reshape(posWeight, 1, 1, []);
    bce = -sum(V .* (w .* T .* log(Y) + (1 - T) .* log(1 - Y)), 'all') / max(sum(V, 'all') * size(Y, 1) * size(Y, 2), 1);
    inter = sum(Y .* T, [1 2 4]);
    dice = 1 - (2 * inter + 1) ./ (sum(V .* Y, [1 2 4]) + sum(T, [1 2 4]) + 1);
    present = extractdata(sum(T, [1 2 4])) > 0;
    loss = bce + sum(dice .* present, 'all') / max(sum(present, 'all'), 1);
    grad = dlgradient(loss, net.Learnables);
end

function grad = clipGradients(grad, maxNorm)
% Scale all gradients down together when their overall size exceeds maxNorm (stops one bad batch wrecking the weights).
    n = sqrt(sum(cellfun(@(g) double(gather(extractdata(sum(g .^ 2, 'all')))), grad.Value)));
    if n > maxNorm
        grad.Value = cellfun(@(g) g * (maxNorm / n), grad.Value, 'UniformOutput', false);
    end
end

function [X, T, V] = sampleBatch(trX, trNorm, trG, trF, where, w, opts, C, healthy)
    P = opts.Patch; half = P / 2; B = opts.Batch;
    X = zeros(P, P, 3, B, 'single'); T = zeros(P, P, C, B, 'single'); V = ones(1, 1, C, B, 'single');
    for b = 1:B
        if ~isempty(healthy.X) && rand < opts.HealthyFraction
            % healthy eye: random retina patch, no lesions; its optic disc is unlabelled, so OD is left out of the loss
            i = randi(numel(healthy.X));
            [r, q] = ind2sub(size(healthy.F{i}), healthy.where{i}(randi(numel(healthy.where{i}))));
            r = min(max(r, half + 1), size(healthy.F{i}, 1) - half); q = min(max(q, half + 1), size(healthy.F{i}, 2) - half);
            rows = r - half:r + half - 1; cols = q - half:q + half - 1;
            f = healthy.F{i}(rows, cols);
            x = (im2single(healthy.X{i}(rows, cols, :)) - healthy.mu{i}) ./ healthy.sd{i} .* f;   % as normaliseFundus
            x = (x .* (0.85 + 0.3 * rand(1, 1, 3, 'single')) + 0.3 * (rand(1, 1, 3, 'single') - 0.5)) .* f;
            x = rot90(x, randi(4) - 1);
            if rand < 0.5, x = fliplr(x); end
            X(:, :, :, b) = x;
            V(1, 1, strcmp(opts.Channels, 'OD'), b) = 0;
            continue
        end
        if rand < opts.LesionFraction
            c = find(rand < cumsum(w), 1);
            cand = find(~cellfun(@isempty, where(:, c)));
            i = cand(randi(numel(cand)));
            idx = where{i, c}(randi(numel(where{i, c})));
        else
            i = randi(numel(trX));
            idx = where{i, end}(randi(numel(where{i, end})));
        end
        [r, q] = ind2sub(size(trF{i}), idx);
        r = min(max(r + randi([-half + 16, half - 16]), half + 1), size(trF{i}, 1) - half);   % lesion somewhere in the patch
        q = min(max(q + randi([-half + 16, half - 16]), half + 1), size(trF{i}, 2) - half);
        rows = r - half:r + half - 1; cols = q - half:q + half - 1;
        f = trF{i}(rows, cols); t = single(trG{i}(rows, cols, :));
        x = (im2single(trX{i}(rows, cols, :)) - trNorm.mu{i}) ./ trNorm.sd{i} .* f;   % as normaliseFundus
        % colour: brightness / contrast per channel, inside the retina only
        x = (x .* (0.85 + 0.3 * rand(1, 1, 3, 'single')) + 0.3 * (rand(1, 1, 3, 'single') - 0.5)) .* f;
        % geometry: flips and 90-degree rotations (lesions have no orientation)
        k = randi(4) - 1;
        x = rot90(x, k); t = rot90(t, k);
        if rand < 0.5, x = fliplr(x); t = fliplr(t); end
        X(:, :, :, b) = x; T(:, :, :, b) = t;
    end
end

function [S, Sidrid] = validate(net, vaX, va, C, hvX, hvF)
% Pooled pixel PR over the IDRiD validation photos plus the healthy validation eyes (every lesion pixel marked there is a false
% alarm). OD is scored on IDRiD only. Sidrid: IDRiD photos alone, comparable with runs trained without healthy eyes.
    H = lesionPR('init', C);
    for i = 1:numel(va)
        P = predictTiles(net, vaX{i});
        H = lesionPR('add', H, P, va(i).masks, va(i).fov);
    end
    Sidrid = lesionPR('summary', H);
    for i = 1:numel(hvX)
        P = predictTiles(net, normaliseFundus(hvX{i}, hvF{i}));
        H = lesionPR('add', H, P(:, :, 1:C - 1), false([size(hvF{i}) C - 1]), hvF{i});   % lesion channels only
    end
    S = lesionPR('summary', H);
end

function [mu, sd] = colourStats(img, fov)
% Per-channel mean and spread inside the retina, as normaliseFundus computes them (1x1x3, for normalising patches).
    v = reshape(im2single(img), [], size(img, 3));
    v = v(fov(:), :);
    mu = reshape(mean(v, 1), 1, 1, []);
    sd = reshape(max(std(v, 0, 1), 1e-3), 1, 1, []);
end

function [img, fov] = retinaCrop(img, targetWidth)
% Crop to the retina and resize it to targetWidth px wide: the same preparation as prepareLesionData / segmentLesionsDL.
    if size(img, 3) == 1, img = repmat(img, 1, 1, 3); elseif size(img, 3) == 4, img = img(:, :, 1:3); end
    [H, W, ~] = size(img);
    fov = getFOVMask(img);
    st = regionprops(fov, 'BoundingBox', 'Area');
    [~, big] = max([st.Area]);
    box = round(st(big).BoundingBox);
    box(3) = min(box(3), W - box(1) + 1); box(4) = min(box(4), H - box(2) + 1);
    rows = box(2):box(2) + box(4) - 1; cols = box(1):box(1) + box(3) - 1;
    outSize = round([box(4) box(3)] * targetWidth / box(3));
    img = imresize(img(rows, cols, :), outSize);
    fov = imresize(fov(rows, cols), outSize, 'nearest');
end

function out = ternary(cond, a, b)
    if cond, out = a; else, out = b; end
end
