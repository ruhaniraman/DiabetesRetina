function P = predictTiles(net, X, tile, overlap)
% PREDICTTILES  Run the lesion network over a whole (normalised) photo in overlapping tiles and blend the results.
%
%   P = predictTiles(net, X)                 tile 512, overlap 64
%   P = predictTiles(net, X, tile, overlap)
%
%   X   HxWx3 single from normaliseFundus
%   P   HxWxC single probabilities (sigmoid outputs, one channel per lesion type)
%
% Tiles overlap and are averaged with a weight that falls off towards the tile edge, where a U-Net sees the least context.
    if nargin < 3 || isempty(tile), tile = 512; end
    if nargin < 4 || isempty(overlap), overlap = 64; end
    [H, W, ~] = size(X);
    step = tile - overlap;
    Hp = max(tile, ceil((H - overlap) / step) * step + overlap);
    Wp = max(tile, ceil((W - overlap) / step) * step + overlap);
    Xp = zeros(Hp, Wp, size(X, 3), 'single');
    Xp(1:H, 1:W, :) = X;

    ramp = min(1, (1:tile) / overlap);
    wt = single(min(ramp, fliplr(ramp))' * min(ramp, fliplr(ramp)));   % tile x tile blending weight
    useGPU = canUseGPU();

    ys = 1:step:Hp - tile + 1;
    xs = 1:step:Wp - tile + 1;
    acc = []; wsum = zeros(Hp, Wp, 'single');
    batch = zeros(tile, tile, size(X, 3), numel(xs), 'single');
    for y = ys
        for i = 1:numel(xs)
            batch(:, :, :, i) = Xp(y:y + tile - 1, xs(i):xs(i) + tile - 1, :);
        end
        dlX = dlarray(batch, 'SSCB');
        if useGPU, dlX = gpuArray(dlX); end
        Y = gather(extractdata(predict(net, dlX)));
        if isempty(acc), acc = zeros(Hp, Wp, size(Y, 3), 'single'); end
        for i = 1:numel(xs)
            r = y:y + tile - 1; c = xs(i):xs(i) + tile - 1;
            acc(r, c, :) = acc(r, c, :) + Y(:, :, :, i) .* wt;
            wsum(r, c) = wsum(r, c) + wt;
        end
    end
    P = acc(1:H, 1:W, :) ./ max(wsum(1:H, 1:W), eps('single'));
end
