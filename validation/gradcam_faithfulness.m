function gradcam_faithfulness(paths, labels, outCsv)
% GRADCAM_FAITHFULNESS  Does deleting what Grad-CAM highlights change the network's answer more than deleting the same amount elsewhere?
%
%   The 224x224 view is cut into the 7x7 grid Grad-CAM works on (32 px cells). For each image the cells inside the retina are ranked by
%   Grad-CAM heat (for the class the app explains: the most likely one). We blank the k hottest cells, and separately k RANDOM retina cells
%   (average of 20 draws), and record the referral score (P(Moderate)+P(Severe)+P(Proliferate)) each time.
%   A faithful explanation makes the "hottest" drop clearly bigger than the "random" drop.

    [net, ~, classNames] = loadStage3Model();
    cls = cellstr(classNames);
    refIdx = ismember(cls, {'Moderate', 'Severe', 'Proliferate_DR'});
    ks = [3 6 10];
    rng(0);
    n = numel(paths);
    rows = zeros(n, 2 + numel(ks) * 2);
    for i = 1:n
        img = preprocessStage3Input(imread(paths{i}));
        [~, probs] = classify(net, img);
        [~, top] = max(probs);
        hm = generateGradCAM(net, img, top, classNames);
        fov = getFOVMask(img);  fov = imresize(fov, [224 224], 'nearest') > 0;
        heat = zeros(7); inside = false(7);
        for r = 1:7
            for c = 1:7
                rr = (r-1)*32+1:r*32; cc = (c-1)*32+1:c*32;
                inside(r, c) = mean(fov(rr, cc), 'all') > 0.5;
                heat(r, c) = mean(hm(rr, cc), 'all');
            end
        end
        idx = find(inside(:));
        [~, order] = sort(heat(idx), 'descend');
        base = sum(probs(refIdx));
        row = [base, double(top)];
        for k = ks
            kk = min(k, numel(idx));
            hot = idx(order(1:kk));
            row(end+1) = base - referral(net, blank(img, hot), refIdx); %#ok<AGROW>
            drops = zeros(20, 1);
            for t = 1:20
                pick = idx(randperm(numel(idx), kk));
                drops(t) = base - referral(net, blank(img, pick), refIdx);
            end
            row(end+1) = mean(drops); %#ok<AGROW>
        end
        rows(i, :) = row;
        if mod(i, 10) == 0, fprintf('  %d/%d\n', i, n); end
    end
    names = {'base_referral', 'top_class'};
    for k = ks, names = [names, {sprintf('drop_hot_%d', k), sprintf('drop_random_%d', k)}]; end %#ok<AGROW>
    T = array2table(rows, 'VariableNames', names);
    T.label = labels(:);
    writetable(T, outCsv);
end

function out = blank(img, cellIdx)
    out = img;
    for q = cellIdx(:)'
        [r, c] = ind2sub([7 7], q);
        out((r-1)*32+1:r*32, (c-1)*32+1:c*32, :) = 0;
    end
end

function p = referral(net, img, refIdx)
    [~, probs] = classify(net, img);
    p = sum(probs(refIdx));
end
