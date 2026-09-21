function [referableProb, heatmapEmpty] = gradCamToFile(imgPath, outPath)
% GRADCAMTOFILE  Save the Stage 4 heatmap for one photograph as a PNG (used by the Python backend, which cannot pass network objects
% across the MATLAB Engine boundary).
%
% The heatmap explains the REFERRAL score (P(Moderate)+P(Severe)+P(Proliferate_DR)), the quantity the referral decision is made on, on the same
% prepared image that is graded. See referralGradCAM.m; validation/results/gradcam.md for how far it can be trusted.
%
%   referableProb   the referral probability of this (un-mirrored) image
%   heatmapEmpty    true when no region raised the referral score (the map is all zeros and the image is saved without colour)
    [net, threshold, classNames] = loadStage3Model();
    result = predictWithThreshold(net, imgPath, threshold, classNames);
    [heatmap, overlayImg, referableProb] = referralGradCAM(net, result.preprocessedImage);
    heatmapEmpty = ~any(heatmap(:) > 0);
    imwrite(overlayImg, outPath);
end
