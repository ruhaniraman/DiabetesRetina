function finetuneStage3(opts)
% FINETUNESTAGE3  Fine-tune the deployed Stage 3 network on APTOS + IDRiD (+ Messidor-2 when downloaded).
%
%   finetuneStage3()                      defaults below
%   finetuneStage3(struct('MaxEpochs', 20, 'InitialLearnRate', 5e-5))
%   finetuneStage3(struct('InputSize', 224, 'AptosSource', '224'))   % the original 224 px setup
%
% Default: full-resolution APTOS (the original competition images) and IDRiD, prepared at 384x384. The deployed network was
% trained on 224x224 copies, where microaneurysms (a few pixels wide in the original) mostly disappear. ResNet-18 ends in global
% average pooling and its input normalisation is per colour channel, so the same weights run at a larger input size; only the
% input layer is replaced (keeping the trained normalisation statistics).
%
% Run from anywhere; needs Deep Learning Toolbox (and a GPU for reasonable speed). Steps:
%   1. buildGradingManifest   fixed train / validation / test split per dataset (test images are never trained on)
%   2. cacheGradingImages     every image prepared once with preprocessStage3Input, as the app does
%   3. trainNetwork           starting from Stage3_Final_HighSensitivity_Model.mat, class-weighted loss, best validation loss kept
%   4. On the VALIDATION split only: pick the referral threshold and fit a temperature for calibrated probabilities
%
% Writes stage_3/Stage3_Finetuned_Model.mat with the same variables as the deployed model (trainedNetWeighted,
% stage3Results.threshold) plus stage3Results.temperature and training metadata. The deployed model is NOT overwritten:
% compare the two with evaluateFinetuned first.
%
% trainNetwork (not trainnet) is used on purpose: the app calls classify() and reads net.Layers(end).Classes, and Grad-CAM
% rebuilds the graph with layerGraph(net). A DAGNetwork keeps all of that working unchanged.

    here = fileparts(mfilename('fullpath'));
    root = fileparts(fileparts(here));
    addpath(fullfile(root, 'utils'), fullfile(root, 'stage1_quality'), fullfile(root, 'stage_3'), here);   % stage1_quality: getFOVMask, used by the retina crop

    defaults = struct( ...
        'InitialLearnRate', 5e-5, ...     % small: we adapt a trained network. Run 1 used 1e-4 and overfit by epoch ~3
        'LearnRateDropPeriod', 4, ...     % epochs between x0.3 learning-rate drops
        'L2Regularization', 5e-4, ...     % run 1: 1e-4
        'Dropout', 0.3, ...               % inserted before the classifier (0 = none)
        'ColourJitter', true, ...         % random brightness / contrast / saturation / hue per training image
        'MaxEpochs', 15, ...
        'InputSize', 384, ...             % square input in pixels; the app reads it from the saved network
        'AptosSource', 'full', ...        % 'full' = original competition images, '224' = the 224x224 copy
        'IdridOversample', 3, ...         % each IDRiD training image is seen this many times per epoch (IDRiD is ~12% of the data)
        'MiniBatchSize', [], ...          % default: 32 at 224 px, 16 above (fits a 6 GB GPU with ResNet-18)
        'ValidationPatience', 4, ...
        'TargetSensitivity', 0.97, ...    % referral threshold reaches this on the validation split (run 1: 0.95, too many Moderate misses)
        'Seed', 7, ...
        'Plots', 'training-progress');   % 'none' when running headless (matlab -batch)
    if nargin < 1, opts = struct(); end
    for f = fieldnames(defaults)'
        if ~isfield(opts, f{1}), opts.(f{1}) = defaults.(f{1}); end
    end
    if isempty(opts.MiniBatchSize), opts.MiniBatchSize = 32 - 16 * (opts.InputSize > 224); end
    rng(opts.Seed);
    sz = opts.InputSize * [1 1];

    %% Data
    T = buildGradingManifest(opts.AptosSource);
    T = cacheGradingImages(T, sz);

    [base, oldThreshold, classes] = loadStage3Model();
    classes = cellstr(classes);                            % network class order; kept unchanged
    T.label = categorical(T.label, classes);

    tr = T(strcmp(T.split, 'train'), :);
    va = T(strcmp(T.split, 'validation'), :);
    idridTrain = tr(strcmp(tr.dataset, 'idrid'), :);
    tr = [tr; repmat(idridTrain, opts.IdridOversample - 1, 1)];   % duplicates; augmentation makes each pass differ
    fprintf('Training rows: %d (IDRiD %d images x %d)\n', height(tr), height(idridTrain), opts.IdridOversample);
    imdsTrain = imageDatastore(tr.cached, 'Labels', tr.label);
    imdsVal   = imageDatastore(va.cached, 'Labels', va.label);

    % Geometric + colour augmentation (colour matters: cameras differ in exposure and tint, which is where the model transfers badly)
    augTrain = transform(imdsTrain, @(img, info) augmentStage3Image(img, info, sz, opts.ColourJitter), 'IncludeInfo', true);
    augVal   = augmentedImageDatastore([sz 3], imdsVal);

    %% Network: same graph, fresh class weights for the new mix of data
    counts = countcats(tr.label);
    weights = sum(counts) ./ (numel(counts) * max(counts, 1));
    fprintf('Training images per class (%s): %s\n', strjoin(classes, ', '), mat2str(counts'));
    fprintf('Class weights: %s\n', mat2str(weights', 3));

    lgraph = layerGraph(base);
    inLayer = base.Layers(1);
    if ~isequal(inLayer.InputSize(1:2), sz)
        lgraph = replaceLayer(lgraph, inLayer.Name, imageInputLayer([sz 3], 'Name', inLayer.Name, ...
            'Normalization', 'zscore', 'Mean', inLayer.Mean, 'StandardDeviation', inLayer.StandardDeviation));
        fprintf('Input layer: %s -> %s (normalisation statistics kept)\n', mat2str(inLayer.InputSize), mat2str([sz 3]));
    end
    if opts.Dropout > 0 && ~any(arrayfun(@(l) isa(l, 'nnet.cnn.layer.DropoutLayer'), lgraph.Layers))
        % Dropout between global pooling and the classifier: the first run overfit from epoch ~3 (training loss -> 0)
        % replaceLayer with [dropout; fc] keeps the layer ORDER (addLayers would append the dropout at the end, and the app reads
        % the class names from net.Layers(end))
        fcIdx = find(arrayfun(@(l) isa(l, 'nnet.cnn.layer.FullyConnectedLayer'), lgraph.Layers), 1, 'last');
        fc = lgraph.Layers(fcIdx);
        lgraph = replaceLayer(lgraph, fc.Name, [dropoutLayer(opts.Dropout, 'Name', 'drop_before_fc'); fc]);
        fprintf('Added dropout %.2f before %s\n', opts.Dropout, fc.Name);
    end
    outName = base.Layers(end).Name;
    lgraph = replaceLayer(lgraph, outName, ...
        classificationLayer('Name', outName, 'Classes', classes, 'ClassWeights', weights));

    itersPerEpoch = floor(height(tr) / opts.MiniBatchSize);
    options = trainingOptions('adam', ...
        'InitialLearnRate', opts.InitialLearnRate, ...
        'LearnRateSchedule', 'piecewise', 'LearnRateDropPeriod', opts.LearnRateDropPeriod, 'LearnRateDropFactor', 0.3, ...
        'L2Regularization', opts.L2Regularization, ...
        'DispatchInBackground', canUseParallelPool(), ...          % augmentation runs on the pool workers, not in the training loop
        'MaxEpochs', opts.MaxEpochs, ...
        'MiniBatchSize', opts.MiniBatchSize, ...
        'Shuffle', 'every-epoch', ...
        'ValidationData', augVal, ...
        'ValidationFrequency', max(1, floor(itersPerEpoch / 2)), ...
        'ValidationPatience', opts.ValidationPatience * 2, ...   % counted in validations (two per epoch)
        'OutputNetwork', 'best-validation-loss', ...
        'ResetInputNormalization', false, ...                     % keep the trained per-channel mean / std
        'CheckpointPath', ensureDir(fullfile(root, 'data', 'stage3_checkpoints')), ...
        'Plots', opts.Plots, ...
        'Verbose', true, 'VerboseFrequency', 50);

    [trainedNetWeighted, trainInfo] = trainNetwork(augTrain, lgraph, options);
    if ~isa(trainedNetWeighted.Layers(end), 'nnet.cnn.layer.ClassificationOutputLayer')
        error('finetuneStage3:layerOrder', 'The classification layer must be the last layer (the app reads net.Layers(end).Classes).');
    end
    % Save straight away, so nothing after this point can lose a trained network
    outFile = fullfile(root, 'stage_3', 'Stage3_Finetuned_Model.mat');
    stage3Results = struct('threshold', oldThreshold, 'note', 'provisional: saved before threshold selection');
    save(outFile, 'trainedNetWeighted', 'stage3Results', 'trainInfo', 'opts', '-v7.3');

    %% Threshold and temperature, from the validation split only
    [vaScores, vaLogP] = scoresFor(trainedNetWeighted, va.cached, sz);
    referable = ismember(va.label, {'Moderate', 'Severe', 'Proliferate_DR'});
    refCols = ismember(classes, {'Moderate', 'Severe', 'Proliferate_DR'});
    threshold = pickThreshold(sum(vaScores(:, refCols), 2), referable, opts.TargetSensitivity);

    [~, trueIdx] = ismember(cellstr(va.label), classes);
    temperature = fitTemperature(vaLogP, trueIdx);

    fprintf('\nValidation-chosen referral threshold: %.3f (deployed model: %.3f)\n', threshold, oldThreshold);
    fprintf('Fitted temperature: %.3f (1 = the network was already calibrated; >1 = it was over-confident)\n', temperature);
    reportRates('Validation', sum(vaScores(:, refCols), 2) >= threshold, referable, va.dataset);

    stage3Results = struct( ...
        'threshold', threshold, ...
        'temperature', temperature, ...
        'targetSensitivity', opts.TargetSensitivity, ...
        'classNames', {classes}, ...
        'trainedOn', {unique(tr.dataset)'}, ...
        'inputSize', sz, ...
        'splitCounts', groupsummary(T, {'dataset', 'split'}), ...
        'options', opts, ...
        'trainingInfo', trainInfo, ...
        'created', char(datetime('now', 'Format', 'yyyy-MM-dd HH:mm')));
    save(outFile, 'trainedNetWeighted', 'stage3Results', '-v7.3');           % final: replaces the provisional save
    fprintf('\nSaved %s\nNext: evaluateFinetuned() to compare it with the deployed model on the held-out test splits.\n', outFile);
end

function [scores, logP] = scoresFor(net, files, sz)
% What the app computes: average of the image and its mirror image (stage3Scores). logP feeds temperature scaling.
    batch = zeros(sz(1), sz(2), 3, numel(files), 'uint8');
    for k = 1:numel(files), batch(:, :, :, k) = imread(files{k}); end
    [~, scores] = stage3Scores(net, batch);
    logP = log(max(double(scores), 1e-12));
end

function t = pickThreshold(p, isRef, target)
% Highest threshold that still flags at least `target` of the referable validation eyes (fewest false alarms at that sensitivity).
    cands = sort(unique(p), 'descend');
    t = cands(end);
    for c = cands'
        if mean(p(isRef) >= c) >= target
            t = c;
            return
        end
    end
end

function T = fitTemperature(logP, trueIdx)
% Temperature scaling (Guo et al. 2017) on log-probabilities: softmax(logP / T). log p differs from the logits only by a
% per-image constant, which softmax ignores, so this is the standard method. It changes confidence, not the ranking.
    n = numel(trueIdx);
    idx = sub2ind(size(logP), (1:n)', trueIdx(:));
    nll = @(T) -mean(logP(idx) / T - logsumexp(logP / T));
    T = fminbnd(nll, 0.2, 10);
end

function s = logsumexp(X)
    m = max(X, [], 2);
    s = m + log(sum(exp(X - m), 2));
end

function reportRates(name, flagged, referable, dataset)
    for d = [{'all'}; unique(dataset)]'
        sel = strcmp(d{1}, 'all') | strcmp(dataset, d{1});
        fprintf('%s %-9s n=%4d  sensitivity %.1f%%  specificity %.1f%%\n', name, d{1}, sum(sel), ...
            100 * mean(flagged(sel & referable)), 100 * mean(~flagged(sel & ~referable)));
    end
end

function d = ensureDir(d)
    if ~isfolder(d), mkdir(d); end
end
