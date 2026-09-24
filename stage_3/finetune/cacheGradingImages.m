function T = cacheGradingImages(T, inputSize)
% CACHEGRADINGIMAGES  Prepare every manifest image once, exactly as the app does, and store it as a PNG at the network's input size.
%
%   T = cacheGradingImages()                 stage_3/finetune/manifest.csv, 224 px
%   T = cacheGradingImages(T, inputSize)     a manifest table from buildGradingManifest; inputSize e.g. 384 or [384 384]
%
% Adds a column `cached`: data/stage3_cache/<N>px/<source folder>/<id>.png, where <source folder> is the dataset folder under data/
% (aptos2019 = the 224x224 copy, aptos2019_full = the original competition images), so different sizes and sources never mix.
% Decoding a full-resolution photo takes far longer than a training step, so doing it once makes every epoch fast.
% Existing cache files are reused.
%
% Uses preprocessStage3Input (crop the retina, pad square, resize), so the network is trained on what the app feeds it.

    if nargin < 1 || isempty(T)
        T = readtable(fullfile(fileparts(mfilename('fullpath')), 'manifest.csv'), 'TextType', 'char', 'Delimiter', ',');
    end
    if nargin < 2 || isempty(inputSize), inputSize = 224; end
    sz = inputSize(1) * [1 1];

    dataRoot = fullfile(projectRoot(), 'data');
    cacheRoot = fullfile(dataRoot, 'stage3_cache', sprintf('%dpx', sz(1)));
    n = height(T);
    T.cached = cell(n, 1);
    for i = 1:n
        rel = strrep(T.path{i}, [dataRoot filesep], '');
        source = strtok(rel, '\/');                    % first folder under data/
        T.cached{i} = fullfile(cacheRoot, source, [T.id{i} '.png']);
    end
    for d = unique(cellfun(@fileparts, T.cached, 'UniformOutput', false))'
        if ~isfolder(d{1}), mkdir(d{1}); end
    end

    todo = find(~cellfun(@isfile, T.cached));
    fprintf('%d of %d images already cached at %d px; preparing %d.\n', n - numel(todo), n, sz(1), numel(todo));
    paths = T.path(todo);
    outs = T.cached(todo);
    parfor k = 1:numel(todo)      % runs serially without Parallel Computing Toolbox
        imwrite(preprocessStage3Input(imread(paths{k}), sz), outs{k});
    end
    fprintf('Cache ready: %s\n', cacheRoot);
end
