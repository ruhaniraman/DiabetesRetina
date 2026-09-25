function [prob, mask, info] = segmentVesselsDL(img, model)
% SEGMENTVESSELSDL  Apply the trained Stage 2 vessel network to one fundus photograph (any camera, any size).
%
%   [prob, mask, info] = segmentVesselsDL(img)            loads stage2_structure/dl/Stage2_VesselUNet.mat (cached)
%   [prob, mask, info] = segmentVesselsDL(img, model)
%
%   img    RGB fundus photograph (uint8), or a file path
%   prob   HxW single, per-pixel vessel probability at the input's size (0 outside the retina)
%   mask   HxW logical, prob >= model.threshold
%   info   .fov (retina mask), .cropBox, .scale, .workProb / .workFov (at the working resolution)
%
% Prepared as in training (trainVesselSegmenter): crop to the retina, resize it to model.targetWidth px wide (about DRIVE's
% scale, so vessel widths match what the network learned), normalise each colour channel inside the retina.
    persistent cached
    if nargin < 2 || isempty(model)
        if isempty(cached)
            S = load(fullfile(fileparts(mfilename('fullpath')), 'Stage2_VesselUNet.mat'), 'model');
            cached = S.model;
        end
        model = cached;
    end
    if ischar(img) || isstring(img), img = imread(img); end
    if size(img, 3) == 1, img = repmat(img, 1, 1, 3); elseif size(img, 3) == 4, img = img(:, :, 1:3); end

    [H, W, ~] = size(img);
    fov = getFOVMask(img);
    st = regionprops(fov, 'BoundingBox', 'Area');
    if isempty(st)
        prob = zeros(H, W, 'single'); mask = false(H, W);
        info = struct('fov', fov, 'cropBox', [], 'scale', NaN);
        return
    end
    [~, big] = max([st.Area]);
    box = round(st(big).BoundingBox);
    box(1:2) = max(box(1:2), 1);
    box(3) = min(box(3), W - box(1) + 1); box(4) = min(box(4), H - box(2) + 1);
    rows = box(2):box(2) + box(4) - 1; cols = box(1):box(1) + box(3) - 1;
    scale = model.targetWidth / box(3);
    workSize = round([box(4) box(3)] * scale);

    crop = imresize(img(rows, cols, :), workSize);
    if isfield(model, 'options') && isfield(model.options, 'Enhance') && model.options.Enhance
        crop = enhanceForReview(crop);                                % as in training (trainVesselSegmenter, opts.Enhance)
    end
    cropFov = imresize(fov(rows, cols), workSize, 'nearest');
    P = predictTiles(model.net, normaliseFundus(crop, cropFov), model.tile, model.overlap) .* cropFov;

    prob = zeros(H, W, 'single');
    prob(rows, cols) = imresize(P, [numel(rows) numel(cols)], 'bilinear');
    prob = max(min(prob, 1), 0) .* fov;
    % the bright rim of the field of view can look like a vessel: ignore a band of 1% of the retina width along its edge
    mask = prob >= model.threshold & imerode(fov, strel('disk', max(1, round(box(3) / 100))));
    info = struct('fov', fov, 'cropBox', box, 'scale', scale, 'workProb', P, 'workFov', cropFov);
end
