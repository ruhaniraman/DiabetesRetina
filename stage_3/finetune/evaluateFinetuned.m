function evaluateFinetuned()
% EVALUATEFINETUNED  Compare the deployed and fine-tuned Stage 3 networks on the held-out TEST split of every dataset.
%
% Both networks see the same cached images (prepared as the app prepares them) and are scored with the mirror average the app
% uses, each at its own stored threshold. Writes, for validation/analyze.py-style analysis:
%   validation/results/ft_<model>_<dataset>_test.csv   id, label, p_<class> ... (network class order)
% and prints sensitivity / specificity for referable DR per dataset.
%
% Note: the deployed model was trained on APTOS only, so for it IDRiD and Messidor-2 are external data; for the fine-tuned model
% only their test splits are unseen. Both are evaluated on exactly those test splits, so the comparison is fair.
% Each network gets the images prepared at its own input size (224 for the deployed one), from the sources in manifest.csv
% (with the default fine-tune, APTOS test images come from the full-resolution originals, as a clinic would upload them).

    here = fileparts(mfilename('fullpath'));
    root = fileparts(fileparts(here));
    addpath(fullfile(root, 'utils'), fullfile(root, 'stage1_quality'), fullfile(root, 'stage_3'), here);   % stage1_quality: getFOVMask, used by the retina crop

    [deployed, deployedThr] = loadStage3Model();
    F = load(fullfile(root, 'stage_3', 'Stage3_Finetuned_Model.mat'), 'trainedNetWeighted', 'stage3Results');
    % Rebuilt every time (same fixed split), so test-only data added after training -- Messidor-2 -- is evaluated without retraining.
    T = buildGradingManifest(F.stage3Results.options.AptosSource);
    te = T(strcmp(T.split, 'test'), :);
    models = {'deployed', deployed, deployedThr; 'finetuned', F.trainedNetWeighted, F.stage3Results.threshold};

    referable = ismember(te.label, {'Moderate', 'Severe', 'Proliferate_DR'});
    outDir = fullfile(root, 'validation', 'results');

    fprintf('\n%-10s %-9s %5s %6s   %-12s %-12s\n', 'model', 'dataset', 'n', 'thr', 'sensitivity', 'specificity');
    for m = 1:size(models, 1)
        net = models{m, 2};
        sz = net.Layers(1).InputSize(1:2);
        tm = cacheGradingImages(te, sz);
        batch = zeros(sz(1), sz(2), 3, height(tm), 'uint8');
        for k = 1:height(tm), batch(:, :, :, k) = imread(tm.cached{k}); end
        classes = cellstr(net.Layers(end).Classes);
        [~, scores] = stage3Scores(net, batch);
        pRef = sum(scores(:, ismember(classes, {'Moderate', 'Severe', 'Proliferate_DR'})), 2);
        flagged = pRef >= models{m, 3};

        for d = unique(te.dataset)'
            sel = strcmp(te.dataset, d{1});
            out = table(te.id(sel), te.label(sel), 'VariableNames', {'id', 'label'});
            for c = 1:numel(classes)
                out.(['p_' classes{c}]) = double(scores(sel, c));
            end
            writetable(out, fullfile(outDir, sprintf('ft_%s_%s_test.csv', models{m, 1}, d{1})));
            fprintf('%-10s %-9s %5d %6.3f   %10.1f%%  %10.1f%%\n', models{m, 1}, d{1}, sum(sel), models{m, 3}, ...
                100 * mean(flagged(sel & referable)), 100 * mean(~flagged(sel & ~referable)));
        end
    end
    fprintf('\nTargets (problem statement): sensitivity > 90%%, specificity > 85%%. CSVs in %s\n', outDir);
end
