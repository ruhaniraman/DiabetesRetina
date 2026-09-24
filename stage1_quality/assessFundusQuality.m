function [verdict, message, reasons, m] = assessFundusQuality(img)
% ASSESSFUNDUSQUALITY  Stage 1 quality gate in MATLAB: a port of backend/quality.py (the gate the app runs), same measures and thresholds.
%
%   [verdict, message, reasons, m] = assessFundusQuality(img)      img: RGB uint8 array or file path
%
%   verdict   "reject" (ask for a retake) | "warn" (accept; results may be less reliable) | "accept"
%   message   the text shown to the user (identical to quality.py MESSAGES)
%   reasons   every problem found, most serious first (quality.py reason codes)
%   m         the measures
%
% Checks (thresholds and the evidence for them: validation/QUALITY.md):
%   focus         contrast-normalised Laplacian variance of the green channel inside the retina, on the 224 px view the grader uses
%   illumination  retina brightness and saturated share
%   noise         fine-to-mid detail energy (grain or heavy compression)
%   field of view the retina's bounding box must have a whole-retina shape (partial_reject), the picture must be a colour fundus
%                 photograph (not_colour_reject), and an optic disc should stand out (disc_warn)
% Nothing is changed in the photograph: the classifier was validated on unprocessed photos. enhanceForReview.m makes an enhanced copy
% for a human reviewer only. Agreement with quality.py: validation/results/stage1_parity.md.
    if ischar(img) || isstring(img), img = imread(img); end
    if size(img, 3) == 1, img = repmat(img, 1, 1, 3); elseif size(img, 3) == 4, img = img(:, :, 1:3); end
    m = qualityMeasures(img);
    reasons = reasonCodes(m);
    msgs = messages();
    rejectOrder = ["no_retina", "not_colour_reject", "partial_reject", "blur_reject", "dark_reject", "bright_reject", "noise_reject"];
    warnOrder = ["colour_warn", "blur_warn", "dark_warn", "bright_warn", "disc_warn"];
    if any(ismember(reasons, rejectOrder))
        verdict = "reject";
        message = msgs.(rejectOrder(find(ismember(rejectOrder, reasons), 1)));
    elseif ~isempty(reasons)
        verdict = "warn";
        message = msgs.(warnOrder(find(ismember(warnOrder, reasons), 1)));
    else
        verdict = "accept";
        message = msgs.accept;
    end
end

function t = thresholds()
    t = struct('blur_reject', 0.03, 'blur_warn', 0.08, 'dark_reject', 0.10, 'dark_warn', 0.13, 'bright_reject', 0.70, 'bright_warn', 0.55, ...
        'over_reject', 0.10, 'noise_reject', 0.55, 'colour_reject', 0.03, 'grey_reject', 0.10, 'colour_warn', 0.35, ...
        'aspect_min', 0.65, 'aspect_max', 1.45, 'disc_warn', 3.0);
end

function M = messages()
    M = struct( ...
        'no_retina', "No retina could be found in this image. Please upload a fundus photograph.", ...
        'blur_reject', "Image rejected: too blurry for a reliable assessment. Please retake the photo.", ...
        'dark_reject', "Image rejected: too dark for a reliable assessment. Please retake the photo with better illumination.", ...
        'bright_reject', "Image rejected: overexposed. Please retake the photo.", ...
        'noise_reject', "Image rejected: it looks grainy or heavily compressed. Please retake the photo or upload the original file.", ...
        'not_colour_reject', "Image rejected: this does not look like a colour retinal photograph. Please upload a colour fundus photograph.", ...
        'partial_reject', "Image rejected: only part of the retina is visible. Please retake the photo with the whole retina in the frame.", ...
        'colour_warn', "Image has an unusual colour balance for a retinal photograph; results may be less reliable. Check that it is a fundus photograph.", ...
        'disc_warn', "Image may not show the optic disc clearly. Make sure the photograph is centred on the optic disc and macula; results may be less reliable.", ...
        'blur_warn', "Image is slightly soft; results may be less reliable.", ...
        'dark_warn', "Image is dark; results may be less reliable.", ...
        'bright_warn', "Image is very bright; results may be less reliable.", ...
        'accept', "Quality check passed.");
end

function found = reasonCodes(m)
    if m.no_retina, found = "no_retina"; return; end
    t = thresholds();
    found = strings(1, 0);
    if m.warm_share < t.colour_reject || m.mean_saturation < t.grey_reject, found(end + 1) = "not_colour_reject"; end
    if m.retina_aspect < t.aspect_min || m.retina_aspect > t.aspect_max, found(end + 1) = "partial_reject"; end
    if m.lap_var_norm < t.blur_reject, found(end + 1) = "blur_reject"; end
    if m.brightness < t.dark_reject, found(end + 1) = "dark_reject"; end
    if m.brightness > t.bright_reject || m.over_fraction > t.over_reject, found(end + 1) = "bright_reject"; end
    if m.hf_ratio > t.noise_reject, found(end + 1) = "noise_reject"; end
    if isempty(found)
        if m.warm_share < t.colour_warn, found(end + 1) = "colour_warn"; end
        if m.lap_var_norm < t.blur_warn, found(end + 1) = "blur_warn"; end
        if m.brightness >= t.dark_reject && m.brightness < t.dark_warn, found(end + 1) = "dark_warn"; end
        if m.brightness > t.bright_warn && m.brightness <= t.bright_reject, found(end + 1) = "bright_warn"; end
        if m.disc_score < t.disc_warn, found(end + 1) = "disc_warn"; end
    end
end

function m = qualityMeasures(img)
    f = fundusMeasures(img);
    view = imresize(img, [224 224], 'box');        % quality.py model_view: cv2 INTER_AREA (box averaging) when shrinking
    gray = double(rgb2gray(view));
    green = double(view(:, :, 2));
    fov = imclose(gray > 15, strel('disk', 4));
    inner = imerode(fov, strel('disk', 7));
    m = f;
    m.fov_fraction = mean(fov(:));
    if nnz(fov) < 500 || nnz(inner) < 300
        m.no_retina = 1;
        return
    end
    m.no_retina = 0;
    gFov = green(fov); gIn = green(inner);
    lap = imfilter(green, [0 1 0; 1 -4 1; 0 1 0], 'symmetric');
    fine = green - gauss(green, 1.5);
    mid = green - gauss(green, 6.0);
    gx = imfilter(green, [-1 0 1; -2 0 2; -1 0 1], 'symmetric');
    gy = imfilter(green, [-1 -2 -1; 0 0 0; 1 2 1], 'symmetric');
    contrast = std(gIn, 1);
    m.brightness = mean(gFov) / 255;
    m.under_fraction = mean(gFov < 25);
    m.over_fraction = mean(gFov > 235);
    m.contrast = contrast / 255;
    m.range_p5_p95 = (prctile(gIn, 95) - prctile(gIn, 5)) / 255;
    m.lap_var = var(lap(inner), 1);
    m.lap_var_norm = m.lap_var / max(contrast ^ 2, 1);
    g = hypot(gx, gy);
    m.tenengrad_norm = mean(g(inner)) / max(contrast, 1);
    m.hf_ratio = mean(fine(inner) .^ 2) / max(mean(mid(inner) .^ 2), 1e-6);
end

function f = fundusMeasures(img)
    [h, w, ~] = size(img);
    scale = 256 / max(h, w);
    small = imresize(img, [max(1, round(h * scale)) max(1, round(w * scale))], 'box');
    gray = double(rgb2gray(small));
    tissue = imclose(gauss(gray, 2) > 15, strel('disk', 4));
    f = struct('retina_aspect', 0, 'warm_share', 0, 'mean_saturation', 0, 'disc_score', 0, 'disc_x', 0, 'disc_y', 0);
    cc = bwconncomp(tissue, 8);
    if cc.NumObjects == 0, return; end
    [~, big] = max(cellfun(@numel, cc.PixelIdxList));
    region = false(size(tissue)); region(cc.PixelIdxList{big}) = true;
    st = regionprops(region, 'BoundingBox');
    boxW = st.BoundingBox(3); boxH = st.BoundingBox(4);
    hsv = rgb2hsv(small);
    hue = hsv(:, :, 1) * 180; sat = hsv(:, :, 2) * 255;                        % OpenCV's 8-bit HSV scale
    hue = hue(region); sat = sat(region);
    warm = (hue <= 25 | hue >= 170) & sat > 60;
    f.retina_aspect = boxW / max(boxH, 1);
    f.warm_share = mean(warm);
    f.mean_saturation = mean(sat) / 255;
    [f.disc_score, f.disc_x, f.disc_y] = findDisc(small, region, round(boxW));
end

function [score, x, y] = findDisc(small, region, retinaWidth)
    s = double(small);
    channel = 0.5 * (s(:, :, 1) + s(:, :, 2));
    channel(~region) = mean(channel(region));
    local = channel - gauss(channel, retinaWidth * 0.12);
    smooth = gauss(local, retinaWidth * 0.02);
    k = bitor(round(retinaWidth * 0.06), 1);
    inner = imerode(region, strel('disk', floor(k / 2)));
    score = 0; x = 0; y = 0;
    if nnz(inner) < 100, return; end
    masked = smooth; masked(~inner) = -Inf;
    [~, idx] = max(masked(:));
    [yy, xx] = ind2sub(size(masked), idx);
    score = masked(idx) / max(std(local(inner), 1), 1e-6);
    x = (xx - 1) / size(masked, 2); y = (yy - 1) / size(masked, 1);
end

function out = gauss(img, sigma)
% OpenCV GaussianBlur with ksize (0,0): kernel radius about 3 sigma (4 sigma for float images), reflect-101 borders.
    r = max(1, ceil(4 * sigma));
    out = imgaussfilt(img, sigma, 'FilterSize', 2 * r + 1, 'Padding', 'symmetric');
end
