function [heatmap, overlayImg] = generateGradCAM(net, preprocessedImg, predictedClassIdx, classNames)
% GENERATEGRADCAM  Produce a Grad-CAM heatmap explaining why the network
% predicted a given class for a fundus image.

featureLayer = 'res5b_relu';
reductionLayer = 'prob';

className = classNames(predictedClassIdx);

heatmapRaw = gradCAM(net, preprocessedImg, className, ...
    'FeatureLayer', featureLayer, ...
    'ReductionLayer', reductionLayer);

heatmapRaw = heatmapRaw - min(heatmapRaw(:));
maxVal = max(heatmapRaw(:));
if maxVal > 0
    heatmap = heatmapRaw / maxVal;
else
    heatmap = heatmapRaw;
    warning('generateGradCAM:flatHeatmap', ...
        'Grad-CAM heatmap is all zeros for class "%s".', string(className));
end

heatmap = imresize(heatmap, [size(preprocessedImg,1), size(preprocessedImg,2)]);

% ---- Mask out black background/padding ----
fovMask = getFOVMask(preprocessedImg);
fovMask = imresize(fovMask, size(heatmap), 'nearest') > 0;

heatmap(~fovMask) = 0;
if any(fovMask(:))
    inMaskMax = max(heatmap(fovMask));
    if inMaskMax > 0
        heatmap = heatmap / inMaskMax;
    end
end

overlayImg = overlayHeatmap(preprocessedImg, heatmap, fovMask);

end


function overlayImg = overlayHeatmap(baseImg, heatmap, fovMask)
% Blend a normalized [0,1] heatmap onto baseImg using a jet colormap.
% fovMask forces background pixels outside the eye to remain completely untouched.

baseAlpha = 0.4;

if ~isa(baseImg, 'uint8')
    baseImg = im2uint8(mat2gray(baseImg));
end

if nargin < 3 || isempty(fovMask)
    alphaMap = baseAlpha * ones(size(heatmap));
else
    alphaMap = baseAlpha * double(fovMask);
end

cmap = jet(256);
heatmapIdx = max(1, min(256, round(heatmap * 255) + 1));
heatmapRGB = ind2rgb(heatmapIdx, cmap);
heatmapRGB = im2uint8(heatmapRGB);

% Standard alpha blend
blended = (1 - alphaMap) .* double(baseImg) + alphaMap .* double(heatmapRGB);
overlayImg = uint8(blended);

% ---- HARD CUTOFF CLAMP FOR BACKGROUND ----
if ~isempty(fovMask)
    % Expand mask to 3 channels (RGB)
    fovMask3D = repmat(fovMask, [1, 1, size(overlayImg, 3)]);

    % Force any pixel outside the FOV mask to be strictly the original baseImg
    overlayImg(~fovMask3D) = baseImg(~fovMask3D);
end

end