function out = enhanceForReview(img, opts)
% ENHANCEFORREVIEW  Enhanced copy of a fundus photograph for a HUMAN reviewer: illumination normalisation, CLAHE and denoising.
%
%   out = enhanceForReview(img)
%   out = enhanceForReview(img, struct('Denoise', true, 'ClipLimit', 0.01))
%
% Steps, on the L channel of CIELAB inside the retina only (colour is kept, the black border stays black):
%   1. illumination normalisation: divide out the slowly varying background (Gaussian, sigma = 1/8 of the retina width), so a dark
%      periphery or an uneven flash no longer hides detail;
%   2. CLAHE (adapthisteq) for local contrast;
%   3. denoising with an edge-preserving bilateral filter (imbilatfilt), so CLAHE does not amplify grain.
%
% The grading network is NOT given this image: it was trained and validated on unprocessed photographs, and on degraded photos this
% enhancement does not improve its referral decision (validation/results/enhancement.md). It is for display and review.
    if nargin < 2, opts = struct(); end
    if ~isfield(opts, 'Denoise'), opts.Denoise = true; end
    if ~isfield(opts, 'ClipLimit'), opts.ClipLimit = 0.01; end
    if ischar(img) || isstring(img), img = imread(img); end
    if size(img, 3) == 1, img = repmat(img, 1, 1, 3); elseif size(img, 3) == 4, img = img(:, :, 1:3); end

    fov = getFOVMask(img);
    st = regionprops(fov, 'BoundingBox', 'Area');
    [~, big] = max([st.Area]);
    width = max(st(big).BoundingBox(3), 16);
    lab = rgb2lab(img);
    L = lab(:, :, 1) / 100;

    % 1. illumination: background from the retina only (outside is filled with the retina mean so the rim does not darken)
    Lfill = L; Lfill(~fov) = mean(L(fov));
    background = imgaussfilt(Lfill, width / 8);
    Ln = L ./ max(background, 0.02) * mean(L(fov));
    Ln = min(max(Ln, 0), 1);

    % 2. CLAHE
    Lc = adapthisteq(Ln, 'ClipLimit', opts.ClipLimit, 'NumTiles', [8 8]);

    % 3. denoise
    if opts.Denoise
        Lc = imbilatfilt(Lc, 0.02, max(1, width / 400));
    end
    Lc(~fov) = 0;
    lab(:, :, 1) = Lc * 100;
    ab = lab(:, :, 2:3); ab(repmat(~fov, 1, 1, 2)) = 0; lab(:, :, 2:3) = ab;
    out = im2uint8(lab2rgb(lab));
end
