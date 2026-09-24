function gradcam_eval(paths, labels, outMat)
% GRADCAM_EVAL  Everything needed to judge the Stage 4 heatmaps, for a list of photographs (each prepared exactly as the app prepares it).
%
% For each photograph, saved to outMat:
%   referral map (the app's explanation), most-likely-class map (the old explanation), and their referral probability;
%   the crop box and original size (so lesion masks can be mapped into the same 224x224 view; maps are computed at the network's
%   input size and stored resized to 224x224, so the analysis is the same for any model);
%   randomised-weights maps (classifier only, and all layers; 2 seeds each) for the sanity check;
%   the drop in the referral probability when the hottest / random / coldest cells are replaced by the retina's mean colour.
%   Cells are 32 px (one cell of the network's final feature map): a 7x7 grid at 224 px, 12x12 at 384 px. The number of cells
%   deleted is scaled with the grid (4/8/12 of 49 at 224 px), so the same share of the retina is removed.
    [net, ~, classNames] = loadStage3Model();
    classes = cellstr(classNames);
    refIdx = ismember(classes, {'Moderate', 'Severe', 'Proliferate_DR'});
    nets = {randomisedDlnet(net, 'top', 1), randomisedDlnet(net, 'top', 2), randomisedDlnet(net, 'all', 1), randomisedDlnet(net, 'all', 2)};
    S = net.Layers(1).InputSize(1);                 % network input size (square)
    G = S / 32;                                      % cells per side
    ks = round([4 8 12] * G^2 / 49);
    n = numel(paths);
    R.paths = paths; R.labels = labels;
    R.referral = zeros(n, 224, 224, 'single'); R.argmax = zeros(n, 224, 224, 'single'); R.rand = zeros(n, 4, 224, 224, 'single');
    R.refprob = zeros(n, 1); R.bbox = zeros(n, 4); R.origsize = zeros(n, 2); R.fov = false(n, 224, 224);
    R.inputSize = S; R.gridCells = G; R.ks = ks;
    R.drop_hot = zeros(n, numel(ks)); R.drop_random = zeros(n, numel(ks)); R.drop_cold = zeros(n, numel(ks));
    rng(0);
    for i = 1:n
        img = imread(paths{i});
        if size(img, 3) == 1, img = repmat(img, 1, 1, 3); elseif size(img, 3) == 4, img = img(:, :, 1:3); end
        [p, info] = preprocessForNetwork(img, [S S]);
        R.bbox(i, :) = info.bbox; R.origsize(i, :) = [size(img, 1) size(img, 2)];
        [hm, ~, ref] = referralGradCAM(net, p);
        R.referral(i, :, :) = to224(hm); R.refprob(i) = ref;
        [~, scores] = classify(net, p);
        [~, top] = max(scores);
        R.argmax(i, :, :) = to224(generateGradCAM(net, p, top, classNames));
        for r = 1:4
            R.rand(i, r, :, :) = to224(referralGradCAM(net, p, [], nets{r}));
        end
        fov = getFOVMask(p) > 0;                                     % at the network's size
        R.fov(i, :, :) = imresize(fov, [224 224], 'nearest');
        heat = zeros(G); inside = false(G);
        for a = 1:G
            for b = 1:G
                ra = (a-1)*32+1:a*32; cb = (b-1)*32+1:b*32;
                inside(a, b) = mean(fov(ra, cb), 'all') > 0.5;
                heat(a, b) = mean(hm(ra, cb), 'all');
            end
        end
        idx = find(inside(:));
        [~, order] = sort(heat(idx), 'descend');
        fillColour = reshape(uint8(mean(reshape(double(p), [], 3) .* repmat(double(fov(:)), 1, 3), 1) ./ mean(double(fov(:)))), 1, 1, 3);
        for kk = 1:numel(ks)
            k = min(ks(kk), floor(numel(idx) / 2));
            R.drop_hot(i, kk) = ref - referral(net, fillCells(p, idx(order(1:k)), fillColour, G), refIdx);
            R.drop_cold(i, kk) = ref - referral(net, fillCells(p, idx(order(end-k+1:end)), fillColour, G), refIdx);
            d = zeros(20, 1);
            for t = 1:20
                d(t) = ref - referral(net, fillCells(p, idx(randperm(numel(idx), k)), fillColour, G), refIdx);
            end
            R.drop_random(i, kk) = mean(d);
        end
        if mod(i, 10) == 0, fprintf('  %d/%d\n', i, n); end
    end
    save(outMat, '-struct', 'R', '-v7');
end

function m = to224(map)
    m = imresize(single(map), [224 224], 'bilinear');
end

function out = fillCells(img, cellIdx, colour, G)
    out = img;
    for q = cellIdx(:)'
        [r, c] = ind2sub([G G], q);
        out((r-1)*32+1:r*32, (c-1)*32+1:c*32, :) = repmat(colour, 32, 32, 1);
    end
end

function p = referral(net, img, refIdx)
    [~, probs] = classify(net, img);
    p = double(sum(probs(refIdx)));
end
