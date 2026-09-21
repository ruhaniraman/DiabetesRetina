function predictSplit(modelSpec, splitName, method, outCsv, maxN)
% PREDICTSPLIT  Run a Stage 3 network over one recorded split and save class probabilities to CSV.
%
%   predictSplit(modelSpec, splitName, method, outCsv)
%   predictSplit(modelSpec, splitName, method, outCsv, maxN)
%
%   modelSpec  'app'      the deployed high-sensitivity network (Stage3_Final_HighSensitivity_Model.mat)
%              'baseline' the earlier baseline network (Stage3_final_baseline.mat)
%   splitName  'train' | 'validation' | 'test' -- the split recorded in Stage3_checkpoint.mat, so the
%              held-out images are exactly the ones the model never trained on
%   method     'crop'   preprocessForNetwork (crop to retina, pad square, resize): NOT what the model was trained with
%              'resize' plain imresize to 224x224 (what the model was trained with; the app no longer uses it)
%   outCsv     output file: id, label, then one probability column per class (network class order)
%   maxN       optional: use a reproducible random subset of this many images (handy for 'train')
%
% The checkpoint stores image paths from the machine that trained the model, so each file is re-located
% from its id and label under data/aptos2019/colored_images/<Label>/<id>.png.

    if nargin < 5, maxN = Inf; end
    root = projectRoot();
    datasetRoot = fullfile(root, 'data', 'aptos2019', 'colored_images');

    switch modelSpec
        case 'app'
            net = loadStage3Model();
        case 'baseline'
            M = load(fullfile(root, 'stage_3', 'Stage3_final_baseline.mat'), 'trainedNet');
            net = M.trainedNet;
        otherwise
            error('predictSplit:modelSpec', 'Unknown modelSpec "%s".', modelSpec);
    end
    classes = cellstr(net.Layers(end).Classes);

    C = load(fullfile(root, 'stage_3', 'Stage3_checkpoint.mat'), 'imdsTrain', 'imdsValidation', 'imdsTest');
    switch splitName
        case 'train',      imds = C.imdsTrain;
        case 'validation', imds = C.imdsValidation;
        case 'test',       imds = C.imdsTest;
        otherwise
            error('predictSplit:splitName', 'Unknown split "%s".', splitName);
    end

    files = imds.Files;
    labels = cellstr(imds.Labels);
    n = numel(files);
    order = 1:n;
    if maxN < n
        rng(1);                       % fixed seed: the same subset every run
        order = sort(randperm(n, maxN));
        n = maxN;
    end

    ids = cell(n, 1);
    lab = cell(n, 1);
    batch = zeros(224, 224, 3, n, 'uint8');
    for k = 1:n
        i = order(k);
        [~, id] = fileparts(strrep(files{i}, char(92), '/'));   % the stored paths use Windows separators
        img = imread(fullfile(datasetRoot, labels{i}, [id '.png']));
        if size(img, 3) == 1
            img = repmat(img, 1, 1, 3);
        elseif size(img, 3) == 4
            img = img(:, :, 1:3);
        end
        switch method
            case 'crop',   batch(:, :, :, k) = preprocessForNetwork(img, [224 224]);
            case 'resize', batch(:, :, :, k) = imresize(img, [224 224]);
            otherwise,     error('predictSplit:method', 'Unknown method "%s".', method);
        end
        ids{k} = id;
        lab{k} = labels{i};
        if mod(k, 100) == 0, fprintf('  [%s/%s/%s] preprocessed %d/%d\n', modelSpec, splitName, method, k, n); end
    end

    [~, scores] = classify(net, batch, 'MiniBatchSize', 32);

    T = table(ids, lab, 'VariableNames', {'id', 'label'});
    for c = 1:numel(classes)
        T.(['p_' classes{c}]) = double(scores(:, c));
    end
    outDir = fileparts(outCsv);
    if ~isempty(outDir) && ~exist(outDir, 'dir'), mkdir(outDir); end
    writetable(T, outCsv);
    fprintf('Wrote %d rows to %s\n', n, outCsv);
end
