function enhancedImg = enhanceImage(img, mask)
% ENHANCEIMAGE  Apply illumination normalization + CLAHE to a
% borderline-quality fundus image (one that got an "enhance" verdict
% from assessImageQuality).
%
%   enhancedImg = enhanceImage(img)
%   enhancedImg = enhanceImage(img, mask)
%
%   Two-step process:
%     1. Illumination normalization -- corrects uneven/global lighting
%        by estimating the slow-varying background illumination and
%        flattening it out, while preserving overall brightness.
%     2. CLAHE -- boosts local contrast so fine detail (vessels, small
%        lesions) becomes more visible.
%
%   Both steps operate on the L (lightness) channel of LAB color space
%   (see earlier version's comments for why -- keeps true color intact).
%
%   FIX (2026-09-13): the background-illumination blur was bleeding the
%   black background (outside the retina) into the estimate near the
%   FOV boundary, producing a fake noisy/bright ring artifact right at
%   the edge of the retina circle -- clinically risky, since that's
%   exactly where peripheral vessels/lesions live. Fixed with a
%   "mask-normalized" blur: blur the masked image AND a blurred version
%   of the mask itself, then divide -- this is a standard trick for
%   blurring only using real data near a hard edge, instead of treating
%   the masked-out region as if it were valid zero-brightness data.
%
%   NOTE (MATLAB basics):
%   - double(mask) converts the true/false mask into 1.0/0.0 numbers so
%     it can be blurred like an image (imgaussfilt needs numeric input).
%   - The "+ eps" in the division below prevents divide-by-zero: eps is
%     MATLAB's name for the smallest representable positive number,
%     used here purely as a safety net for pixels far outside the mask
%     where the blurred mask value could be exactly 0.

    if nargin < 2
        mask = getFOVMask(img);
    end

    % FIX (2026-09-13, round 2): the raw FOV mask has a jagged boundary,
    % and CLAHE creates a "ringing" halo artifact at hard, sudden
    % intensity transitions -- forcing everything outside the mask
    % straight to black created exactly that kind of jagged hard edge.
    % Fix: smooth the mask boundary, then fade the enhancement out
    % gradually near the edge (a "soft" mask) instead of a sudden cutoff.
    mask = imopen(mask, strel('disk', 5));   % smooth away small jagged bumps
    softMask = imgaussfilt(double(mask), 3); % gradual fade-out over ~3px, not a hard edge

    labImg = rgb2lab(im2double(img));
    L = labImg(:,:,1) / 100;

    % --- Step 1: illumination normalization (mask-aware) ---
    backgroundSigma = 50;
    maskD = double(mask);

    blurredMaskedL = imgaussfilt(L .* maskD, backgroundSigma);
    blurredMaskWeight = imgaussfilt(maskD, backgroundSigma);

    % Dividing out the blurred mask weight cancels out the influence of
    % the zero-valued background pixels, leaving a background estimate
    % based only on real retina content -- even right at the edge.
    background = blurredMaskedL ./ (blurredMaskWeight + eps);

    targetBrightness = mean(L(mask));
    normalizedL = L - background + targetBrightness;
    normalizedL = max(0, min(1, normalizedL));

    % --- Step 2: CLAHE for local contrast ---
    enhancedL = adapthisteq(normalizedL, 'ClipLimit', 0.01, 'Distribution', 'rayleigh');
    enhancedL = enhancedL .* softMask;   % smooth fade to black, no hard boundary

    labImg(:,:,1) = enhancedL * 100;
    enhancedImg = im2uint8(lab2rgb(labImg));
end