function [counts, areaPct, evidence] = lesionOverlayToFile(src, dst, compositeDst)
% LESIONOVERLAYTOFILE  Stage 2 for the web app: run the lesion network on one photograph and write the overlay.
%
%   [counts, areaPct, evidence] = lesionOverlayToFile(src, dst)
%   [counts, areaPct, evidence] = lesionOverlayToFile(src, dst, compositeDst)
%
%   src           fundus photograph (any size, any camera)
%   dst           PNG written with an alpha channel, same size as src: possible lesions coloured, everything else transparent
%   compositeDst  optional PNG: the photograph with the overlay drawn on it, cropped to the retina and padded to a 448 px square
%                 (for the PDF report)
%   counts        1x4 number of marked regions:  MA, HE, EX, SE
%   areaPct       1x4 share of the retina marked, in percent (same order)
%   evidence      the marks summarised against ICDR criteria (lesionEvidence): haemorrhage quadrants, microaneurysms only,
%                 hard exudates near the estimated fovea
%
% Uses the calibrated v2 network (Stage2_LesionUNet_v2.mat: trained with healthy eyes as negatives, thresholds and minimum region
% sizes set by calibrateLesionMasks so most healthy eyes stay clear). On held-out APTOS test photographs it still marked
% something in 34% of eyes without retinopathy, so the overlay shows POSSIBLE lesions for review, not findings
% (validation/results/lesions_dl_Stage2_LesionUNet_v2_calibrated.md). The optic disc channel is not drawn.
    persistent model
    if isempty(model)
        S = load(fullfile(fileparts(mfilename('fullpath')), 'Stage2_LesionUNet_v2.mat'), 'model');
        model = S.model;
    end

    img = imread(src);
    if size(img, 3) == 1, img = repmat(img, 1, 1, 3); elseif size(img, 3) == 4, img = img(:, :, 1:3); end
    [prob, masks, info] = segmentLesionsDL(img, model);
    evidence = lesionEvidence(masks, prob, info, model.channels);

    % Colours match the web app's legend (frontend Dashboard): MA amber, HE rose, EX emerald, SE violet
    colours = uint8([251 191 36; 244 63 94; 52 211 153; 167 139 250]);
    alphas = uint8([255 200 200 200]);
    [H, W, ~] = size(img);
    rgb = zeros(H, W, 3, 'uint8'); alpha = zeros(H, W, 'uint8');
    counts = zeros(1, 4); areaPct = zeros(1, 4);
    nf = max(nnz(info.fov), 1);
    for c = 1:4                                                     % later channels drawn on top: SE, EX over HE over MA
        m = masks(:, :, c);
        cc = bwconncomp(m, 8);
        counts(c) = cc.NumObjects;
        areaPct(c) = 100 * nnz(m) / nf;
        if c == 1, m = imdilate(m, strel('disk', max(1, round(W / 1500)))); end   % microaneurysms are tiny: keep them visible
        for k = 1:3
            ch = rgb(:, :, k); ch(m) = colours(c, k); rgb(:, :, k) = ch;
        end
        alpha(m) = alphas(c);
    end
    imwrite(rgb, dst, 'Alpha', alpha);

    if nargin >= 3 && ~isempty(compositeDst)
        a = single(alpha) / 255 * 0.85;
        comp = uint8(single(img) .* (1 - a) + single(rgb) .* a);
        if ~isempty(info.cropBox)
            b = info.cropBox;
            comp = comp(b(2):b(2) + b(4) - 1, b(1):b(1) + b(3) - 1, :);
        end
        s = max(size(comp, 1), size(comp, 2));
        sq = zeros(s, s, 3, 'uint8');
        r0 = floor((s - size(comp, 1)) / 2); c0 = floor((s - size(comp, 2)) / 2);
        sq(r0 + 1:r0 + size(comp, 1), c0 + 1:c0 + size(comp, 2), :) = comp;
        imwrite(imresize(sq, [448 448]), compositeDst);
    end
end
