function predictFiles(paths, labels, outCsv)
% PREDICTFILES  Run the deployed Stage 3 network over an arbitrary list of image files.
%
%   predictFiles(paths, labels, outCsv)
%
%   paths   cell array of image file paths (any size; preprocessing is the app's preprocessStage3Input)
%   labels  cell array of true labels ('No_DR', 'Mild', ...), same length; use '' when unknown
%   outCsv  output: id (file name without extension), label, one probability column per class
%
% Used for images that are not part of the recorded APTOS split: an external dataset (IDRiD) and controlled
% degradations of held-out images.

    net = loadStage3Model();
    classes = cellstr(net.Layers(end).Classes);
    n = numel(paths);
    ids = cell(n, 1);
    batch = zeros(224, 224, 3, n, 'uint8');
    for k = 1:n
        [~, ids{k}] = fileparts(paths{k});
        batch(:, :, :, k) = preprocessStage3Input(imread(paths{k}));
        if mod(k, 100) == 0, fprintf('  preprocessed %d/%d\n', k, n); end
    end
    [~, scores] = classify(net, batch, 'MiniBatchSize', 32);

    T = table(ids, labels(:), 'VariableNames', {'id', 'label'});
    for c = 1:numel(classes)
        T.(['p_' classes{c}]) = double(scores(:, c));
    end
    outDir = fileparts(outCsv);
    if ~isempty(outDir) && ~exist(outDir, 'dir'), mkdir(outDir); end
    writetable(T, outCsv);
    fprintf('Wrote %d rows to %s\n', n, outCsv);
end
