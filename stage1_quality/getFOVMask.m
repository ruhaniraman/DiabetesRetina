function mask = getFOVMask(img)
% GETFOVMASK  Find the circular retina region in a fundus image, as a
% mask separating it from the black rectangular background.
%
%   mask = getFOVMask(img)
%
%   Returns a logical (true/false) image, same height/width as img:
%   true  = pixel is inside the retina (the photographed circle)
%   false = pixel is background (the black corners/borders)
%
%   HOW IT WORKS:
%   Fundus cameras always produce a circular photographed region inside
%   a black rectangular frame. The background is essentially pure black
%   (R,G,B all near 0) in a way real retinal tissue never is, even in
%   underexposed images -- so a low brightness threshold reliably
%   separates "black frame" from "photographed circle," regardless of
%   how dark the actual retina photo is.
%
%   NOTE (MATLAB basics):
%   - sum(img, 3) adds up the Red+Green+Blue channels into one 2D image,
%     so we're checking total brightness across all colors, not just one.
%   - bwareafilt() keeps only the largest connected blob in a
%     true/false image and discards smaller stray true regions (like a
%     tiny bright reflection or a single stray decoded pixel) --
%     important because the actual FOV should be one big circular blob.
%   - imfill(mask, 'holes') fills in any small dark spots (like a real
%     dark lesion or hemorrhage inside the retina) that would otherwise
%     incorrectly poke holes in the mask -- we want the whole circle
%     included, not perforated by naturally dark clinical content.

    totalBrightness = sum(im2double(img), 3);

    % Threshold: background pixels sum to ~0 across all 3 channels;
    % real retina content (even dark areas) has SOME non-zero signal.
    roughMask = totalBrightness > 0.06;

    % Keep only the single largest connected region (the retina circle
    % itself), discarding any small stray bright/dark artifacts.
    roughMask = bwareafilt(roughMask, 1);

    % Fill any interior dark spots (lesions, vessels, hemorrhages) so
    % the mask represents the FULL retina disc, not a perforated one.
    mask = imfill(roughMask, 'holes');
end
