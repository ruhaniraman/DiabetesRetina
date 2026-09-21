function gradcam_eval(paths, labels, outMat)
% GRADCAM_EVAL  Everything needed to judge the Stage 4 heatmaps, for a list of photographs (each prepared exactly as the app prepares it).
%
% For each photograph, saved to outMat:
%   referral map (the app's explanation), most-likely-class map (the old explanation), and their referral probability;
%   the crop box and original size (so lesion masks can be mapped into the same 224x224 view);
%   randomised-weights maps (classifier only, and all layers; 2 seeds each) for the sanity check;
%   the drop in the referral probability when the hottest / random / coldest cells are replaced by the retina's mean colour.
    [net, ~, classNames] = loadStage3Model();
    classes = cellstr(classNames);
    refIdx = ismember(classes, {'Moderate', 'Severe', 'Proliferate_DR'});
    nets = {randomisedDlnet(net, 'top', 1), randomisedDlnet(net, 'top', 2), randomisedDlnet(net, 'all', 1), randomisedDlnet(net, 'all', 2)};
    ks = [4 8 12];
    n = numel(paths);
    R.paths = paths; R.labels = labels;
    R.referral = zeros(n, 224, 224, 'single'); R.argmax = zeros(n, 224, 224, 'single'); R.rand = zeros(n, 4, 224, 224, 'single');
    R.refprob = zeros(n, 1); R.bbox = zeros(n, 4); R.origsize = zeros(n, 2); R.fov = false(n, 224, 224);
    R.drop_hot = zeros(n, numel(ks)); R.drop_random = zeros(n, numel(ks)); R.drop_cold = zeros(n, numel(ks));
    rng(0);
    for i = 1:n
        img = imread(paths{i});
        if size(img, 3) == 1, img = repmat(img, 1, 1, 3); elseif size(img, 3) == 4, img = img(:, :, 1:3); end
        [p, info] = preprocessForNetwork(img, [224 224]);
        R.bbox(i, :) = info.bbox; R.origsize(i, :) = [size(img, 1) size(img, 2)];
        [hm, ~, ref] = referralGradCAM(net, p);
        R.referral(i, :, :) = hm; R.refprob(i) = ref;
        [~, scores] = classify(net, p);
        [~, top] = max(scores);
        R.argmax(i, :, :) = generateGradCAM(net, p, top, classNames);
        for r = 1:4
            R.rand(i, r, :, :) = referralGradCAM(net, p, [], nets{r});
        end
        fov = imresize(getFOVMask(p), [224 224], 'nearest') > 0;
        R.fov(i, :, :) = fov;
        heat = zeros(7); inside = false(7);
        for a = 1:7
            for b = 1:7
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
            R.drop_hot(i, kk) = ref - referral(net, fillCells(p, idx(order(1:k)), fillColour), refIdx);
            R.drop_cold(i, kk) = ref - referral(net, fillCells(p, idx(order(end-k+1:end)), fillColour), refIdx);
            d = zeros(20, 1);
            for t = 1:20
                d(t) = ref - referral(net, fillCells(p, idx(randperm(numel(idx), k)), fillColour), refIdx);
            end
            R.drop_random(i, kk) = mean(d);
        end
        if mod(i, 10) == 0, fprintf('  %d/%d\n', i, n); end
    end
    save(outMat, '-struct', 'R', '-v7');
end

function out = fillCells(img, cellIdx, colour)
    out = img;
    for q = cellIdx(:)'
        [r, c] = ind2sub([7 7], q);
        out((r-1)*32+1:r*32, (c-1)*32+1:c*32, :) = repmat(colour, 32, 32, 1);
    end
end

function p = referral(net, img, refIdx)
    [~, probs] = classify(net, img);
    p = double(sum(probs(refIdx)));
end
