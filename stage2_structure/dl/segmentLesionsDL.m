function [prob, masks, info] = segmentLesionsDL(img, model)
% SEGMENTLESIONSDL  Apply the trained Stage 2 lesion network to one fundus photograph (any camera, any size).
%
%   [prob, masks, info] = segmentLesionsDL(img)            loads stage2_structure/dl/Stage2_LesionUNet_v2.mat (cached)
%   [prob, masks, info] = segmentLesionsDL(img, model)
%
%   img    RGB fundus photograph (uint8), or a file path
%   prob   HxWxC single, per-pixel probability for each channel in model.channels (MA, HE, EX, SE, OD), at the input's size
%   masks  HxWxC logical: prob >= model.thresholds, then connected regions smaller than model.minArea (pixels at the working
%          resolution) removed. Both are set by calibrateLesionMasks, which keeps healthy eyes clear (without minArea,
%          thresholds are the best-Dice ones from training).
%   info   .fov (retina mask), .cropBox, .scale, .channels, .workProb / .workFov (probabilities and retina at working resolution)
%
% The photo is prepared exactly as in training: crop to the retina, resize so the retina is model.targetWidth pixels wide,
% normalise each colour channel inside the retina (normaliseFundus). Outside the retina every probability is 0.
    persistent cached
    if nargin < 2 || isempty(model)
        if isempty(cached)
            S = load(fullfile(fileparts(mfilename('fullpath')), 'Stage2_LesionUNet_v2.mat'), 'model');
            cached = S.model;
        end
        model = cached;
    end
    if ischar(img) || isstring(img), img = imread(img); end
    if size(img, 3) == 1, img = repmat(img, 1, 1, 3); elseif size(img, 3) == 4, img = img(:, :, 1:3); end

    [H, W, ~] = size(img);
    fov = getFOVMask(img);
    st = regionprops(fov, 'BoundingBox', 'Area');
    C = numel(model.channels);
    if isempty(st)
        prob = zeros(H, W, C, 'single'); masks = false(H, W, C);
        info = struct('fov', fov, 'cropBox', [], 'scale', NaN, 'channels', {model.channels});
        return
    end
    [~, big] = max([st.Area]);
    box = round(st(big).BoundingBox);
    box(3) = min(box(3), W - box(1) + 1); box(4) = min(box(4), H - box(2) + 1);
    rows = box(2):box(2) + box(4) - 1; cols = box(1):box(1) + box(3) - 1;
    scale = model.targetWidth / box(3);
    workSize = round([box(4) box(3)] * scale);

    crop = imresize(img(rows, cols, :), workSize);
    cropFov = imresize(fov(rows, cols), workSize, 'nearest');
    P = predictTiles(model.net, normaliseFundus(crop, cropFov), model.tile, model.overlap);
    P = P .* cropFov;

    % Masks at the working resolution, so model.minArea means the same lesion size for every camera
    M = P >= reshape(model.thresholds, 1, 1, []);
    if isfield(model, 'minArea')
        for c = 1:C, M(:, :, c) = bwareaopen(M(:, :, c), model.minArea(c)); end
    end

    prob = zeros(H, W, C, 'single');
    prob(rows, cols, :) = imresize(P, [numel(rows) numel(cols)], 'bilinear');
    prob = max(min(prob, 1), 0) .* fov;
    masks = false(H, W, C);
    masks(rows, cols, :) = imresize(M, [numel(rows) numel(cols)], 'nearest');
    masks = masks & fov;
    info = struct('fov', fov, 'cropBox', box, 'scale', scale, 'channels', {model.channels}, ...
        'workProb', P, 'workFov', cropFov);
end
