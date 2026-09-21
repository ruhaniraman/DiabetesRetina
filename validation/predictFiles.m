function predictFiles(paths, labels, outCsv, ids)
% PREDICTFILES  Run the deployed Stage 3 network over an arbitrary list of image files.
%
%   predictFiles(paths, labels, outCsv)
%   predictFiles(paths, labels, outCsv, ids)
%
%   paths   cell array of image file paths (any size; preprocessing is the app's preprocessStage3Input)
%   labels  cell array of true labels ('No_DR', 'Mild', ...), same length; use '' when unknown
%   outCsv  output: id, label, one probability column per class
%   ids     optional cell array of unique ids. Default: the file name without extension, which is NOT unique when two
%           folders hold files with the same name (IDRiD's training and testing sets both contain IDRiD_001).
%
% Used for images that are not part of the recorded APTOS split: an external dataset (IDRiD) and controlled
% degradations of held-out images.

    net = loadStage3Model();
    classes = cellstr(net.Layers(end).Classes);
    n = numel(paths);
    if nargin < 4 || isempty(ids)
        ids = cell(n, 1);
        for k = 1:n
            [~, ids{k}] = fileparts(paths{k});
        end
    end
    ids = ids(:);                       % a list passed from Python arrives as a row; the output table needs a column
    batch = zeros(224, 224, 3, n, 'uint8');
    for k = 1:n
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
