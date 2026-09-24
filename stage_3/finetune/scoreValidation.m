function scoreValidation(modelFile)
% SCOREVALIDATION  Write a fine-tuned Stage 3 network's scores on the VALIDATION split, for choosing a referral threshold.
%
%   scoreValidation('Stage3_Finetuned_run2.mat')   % file in stage_3/
%
% Same images and scoring as finetuneStage3 uses for its own threshold (cached at the network's input size, mirror average).
% Writes validation/results/ft_<name>_validation.csv (id, dataset, label, p_<class> ...), where <name> is the file name without
% the Stage3_Finetuned_ prefix, e.g. ft_run2_validation.csv. Test images are not touched.

    here = fileparts(mfilename('fullpath'));
    root = fileparts(fileparts(here));
    addpath(fullfile(root, 'utils'), fullfile(root, 'stage1_quality'), fullfile(root, 'stage_3'), here);

    F = load(fullfile(root, 'stage_3', modelFile), 'trainedNetWeighted', 'stage3Results');
    net = F.trainedNetWeighted;
    sz = net.Layers(1).InputSize(1:2);

    T = buildGradingManifest(F.stage3Results.options.AptosSource);
    va = cacheGradingImages(T(strcmp(T.split, 'validation'), :), sz);

    batch = zeros(sz(1), sz(2), 3, height(va), 'uint8');
    for k = 1:height(va), batch(:, :, :, k) = imread(va.cached{k}); end
    classes = cellstr(net.Layers(end).Classes);
    [~, scores] = stage3Scores(net, batch);

    out = table(va.id, va.dataset, va.label, 'VariableNames', {'id', 'dataset', 'label'});
    for c = 1:numel(classes)
        out.(['p_' classes{c}]) = double(scores(:, c));
    end
    [~, name] = fileparts(modelFile);
    name = regexprep(name, '^Stage3_Finetuned_', '');
    outFile = fullfile(root, 'validation', 'results', sprintf('ft_%s_validation.csv', name));
    writetable(out, outFile);
    fprintf('Wrote %d validation rows to %s (stored threshold %.3f)\n', height(out), outFile, F.stage3Results.threshold);
end
