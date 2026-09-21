function predictFiles(paths, labels, outCsv, ids, method)
% PREDICTFILES  Run the deployed Stage 3 network over an arbitrary list of image files.
%
%   predictFiles(paths, labels, outCsv)
%   predictFiles(paths, labels, outCsv, ids)
%   predictFiles(paths, labels, outCsv, ids, method)
%
%   paths   cell array of image file paths (any size)
%   labels  cell array of true labels ('No_DR', 'Mild', ...), same length; use '' when unknown
%   outCsv  output: id, label, one probability column per class
%   ids     optional cell array of unique ids. Default: the file name without extension, which is NOT unique when two
%           folders hold files with the same name (IDRiD's training and testing sets both contain IDRiD_001).
%   method  how each image is prepared (default 'resize', what the app does today):
%             'resize'        plain resize to 224x224 (what the network was trained with; the app used this before the crop change)
%             'crop'          crop the black border around the retina, pad to a square, resize (preprocessStage3Input)
%             'crop_mirror'   what the app runs today: 'crop', scored as the average of the image and its mirror image (stage3Scores)
%             'pad'           no crop: pad the whole frame to a square (keeps proportions), resize   [experiment]
%             'cropsquash'    crop the black border, then stretch to a square (distorts)              [experiment]
%
% Used for images that are not part of the recorded APTOS split: an external dataset (IDRiD) and controlled
% degradations of held-out images.

    if nargin < 5 || isempty(method), method = 'resize'; end
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
        batch(:, :, :, k) = prepare(imread(paths{k}), method);
        if mod(k, 100) == 0, fprintf('  preprocessed %d/%d\n', k, n); end
    end
    if strcmp(method, 'crop_mirror')
        [~, scores] = stage3Scores(net, batch);   % exactly what the app runs
    else
        [~, scores] = classify(net, batch, 'MiniBatchSize', 32);
    end

    T = table(ids, labels(:), 'VariableNames', {'id', 'label'});
    for c = 1:numel(classes)
        T.(['p_' classes{c}]) = double(scores(:, c));
    end
    outDir = fileparts(outCsv);
    if ~isempty(outDir) && ~exist(outDir, 'dir'), mkdir(outDir); end
    writetable(T, outCsv);
    fprintf('Wrote %d rows to %s\n', n, outCsv);
end

function out = prepare(img, method)
    if size(img, 3) == 1
        img = repmat(img, 1, 1, 3);
    elseif size(img, 3) == 4
        img = img(:, :, 1:3);
    end
    switch method
        case 'resize'
            out = imresize(img, [224 224]);        % what the network was trained with (the app no longer does this)
        case {'crop', 'crop_mirror'}
            out = preprocessStage3Input(img);      % the app's own preparation
        case 'pad'
            [h, w, ~] = size(img);
            s = max(h, w);
            canvas = zeros(s, s, 3, 'like', img);
            y = floor((s - h) / 2); x = floor((s - w) / 2);
            canvas(y+1:y+h, x+1:x+w, :) = img;
            out = imresize(canvas, [224 224]);
        case 'cropsquash'
            mask = getFOVMask(img);
            st = regionprops(mask, 'BoundingBox');
            if isempty(st)
                out = imresize(img, [224 224]);
            else
                b = st(1).BoundingBox;
                x = max(1, floor(b(1))); y = max(1, floor(b(2)));
                w = min(size(img, 2) - x, ceil(b(3))); h = min(size(img, 1) - y, ceil(b(4)));
                out = imresize(img(y:y+h-1, x:x+w-1, :), [224 224]);
            end
        otherwise
            error('predictFiles:method', 'Unknown method "%s".', method);
    end
end
