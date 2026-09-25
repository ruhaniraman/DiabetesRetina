function varargout = locateDiscFovea(varargin)
% LOCATEDISCFOVEA  Optic disc centre and fovea of a fundus photograph, from the trained localiser (trainLocaliser).
%
%   L = locateDiscFovea(img)            loads stage2_structure/dl/Stage2_Localiser.mat (cached)
%   L = locateDiscFovea(img, model)
%
%   img   RGB fundus photograph (uint8) or a file path
%   L     .disc, .fovea            [x y] in the photograph's pixels
%         .discConfidence, .foveaConfidence   share of the network's probability within 3 sigma of the peak (0-1); low when the
%                                  landmark is outside the photograph or unclear
%
% Helpers shared with trainLocaliser, so training and use prepare photos the same way:
%   [X, frame] = locateDiscFovea('prepare', img, width, canvas)   crop to the retina, resize to width px wide, normalise, centre on
%                                                                 a canvas x canvas square
%   pts = locateDiscFovea('toCanvas', ptsNative, frame)            Nx2 [x y] conversions
%   pts = locateDiscFovea('toNative', ptsCanvas, frame)
%   [pts, conf] = locateDiscFovea('decode', net, X)                 canvas coordinates of each landmark
    if ischar(varargin{1}) && any(strcmp(varargin{1}, {'prepare', 'toCanvas', 'toNative', 'decode'}))
        args = varargin(2:end);
        switch varargin{1}
            case 'prepare',  [varargout{1:max(nargout, 1)}] = prepare(args{:});
            case 'toCanvas', varargout{1} = toCanvas(args{:});
            case 'toNative', varargout{1} = toNative(args{:});
            case 'decode',   [varargout{1:max(nargout, 1)}] = decode(args{:});
        end
        return
    end
    persistent cached
    img = varargin{1};
    if nargin >= 2 && ~isempty(varargin{2})
        model = varargin{2};
    else
        if isempty(cached)
            S = load(fullfile(fileparts(mfilename('fullpath')), 'Stage2_Localiser.mat'), 'model');
            cached = S.model;
        end
        model = cached;
    end
    if ischar(img) || isstring(img), img = imread(img); end
    [X, frame] = prepare(img, model.width, model.canvas);
    [pts, conf] = decode(model.net, X, model.options.Sigma);
    pts = toNative(pts, frame);
    varargout{1} = struct('disc', pts(1, :), 'fovea', pts(2, :), 'discConfidence', conf(1), 'foveaConfidence', conf(2));
end

function [X, frame] = prepare(img, width, canvas)
    if size(img, 3) == 1, img = repmat(img, 1, 1, 3); elseif size(img, 3) == 4, img = img(:, :, 1:3); end
    [H, W, ~] = size(img);
    fov = getFOVMask(img);
    st = regionprops(fov, 'BoundingBox', 'Area');
    if isempty(st)
        box = [1 1 W H];
    else
        [~, big] = max([st.Area]);
        box = round(st(big).BoundingBox);
        box(1:2) = max(box(1:2), 1);
        box(3) = min(box(3), W - box(1) + 1); box(4) = min(box(4), H - box(2) + 1);
    end
    rows = box(2):box(2) + box(4) - 1; cols = box(1):box(1) + box(3) - 1;
    s = min(width / box(3), canvas / box(4));                  % retina width px wide, never taller than the canvas
    workSize = max(round([box(4) box(3)] * s), 1);
    crop = imresize(img(rows, cols, :), workSize);
    cropFov = imresize(fov(rows, cols), workSize, 'nearest');
    if isempty(st), cropFov = true(workSize); end
    off = floor((canvas - workSize([2 1])) / 2);               % [x y] offset of the photo on the canvas
    X = zeros(canvas, canvas, 3, 'single');
    X(off(2) + (1:workSize(1)), off(1) + (1:workSize(2)), :) = normaliseFundus(crop, cropFov);
    frame = struct('box', box, 'scale', workSize([2 1]) ./ box([3 4]), 'offset', off, 'imageSize', [H W]);
end

function p = toCanvas(p, f)
% imresize maps pixel edges to pixel edges: u = (x - 0.5) * s + 0.5 within the crop.
    p = (p - f.box(1:2) + 0.5) .* f.scale + 0.5 + f.offset;
end

function p = toNative(p, f)
    p = (p - f.offset - 0.5) ./ f.scale + f.box(1:2) - 0.5;
end

function [pts, conf] = decode(net, X, sigma)
    if nargin < 3, sigma = 4; end
    dlX = dlarray(X, 'SSCB');
    if canUseGPU(), dlX = gpuArray(dlX); end
    Z = double(gather(extractdata(predict(net, dlX))));
    [H, W, C] = size(Z);
    [gx, gy] = meshgrid(1:W, 1:H);
    pts = zeros(C, 2); conf = zeros(C, 1);
    r = 3 * sigma;
    for c = 1:C
        z = Z(:, :, c);
        P = exp(z - max(z(:))); P = P / sum(P(:));
        [~, k] = max(P(:));
        [py, px] = ind2sub([H W], k);
        near = (gx - px) .^ 2 + (gy - py) .^ 2 <= r ^ 2;
        w = P .* near;
        pts(c, :) = [sum(w(:) .* gx(:)), sum(w(:) .* gy(:))] / sum(w(:));
        conf(c) = sum(w(:));
    end
end
