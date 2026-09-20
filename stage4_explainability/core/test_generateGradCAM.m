%% test_generateGradCAM.m
% Visual sanity check for generateGradCAM.m.
% Run this AFTER predictWithThreshold.m has been validated.
%
% This displays the original preprocessed image side-by-side with its
% Grad-CAM overlay. For a Severe/Proliferate_DR case, the heatmap should
% concentrate on lesions (hemorrhages, exudates) -- NOT on the image
% border, the optic disc rim uniformly, or scattered randomly.

testImagePath = 'data/aptos2019/colored_images/Severe/0dc8d25b3f69.png';

%% Load model
S = load('stage_3/Stage3_Final_HighSensitivity_Model.mat');
net = S.trainedNetWeighted;
bestThreshold = S.stage3Results.threshold;
classNames = net.Layers(end).Classes;

%% Get prediction (reuses step 2)
result = predictWithThreshold(net, testImagePath, bestThreshold, classNames);
[~, predictedClassIdx] = max(result.probs);

fprintf('Predicted: %s (confidence %.3f)\n', ...
    string(result.predictedGrade), result.confidence);

%% Generate Grad-CAM
[heatmap, overlayImg] = generateGradCAM(net, result.preprocessedImage, ...
    predictedClassIdx, classNames);

%% Display side by side
figure('Name', 'Grad-CAM Sanity Check', 'Position', [100 100 900 450]);

subplot(1, 3, 1);
imshow(uint8(result.preprocessedImage));
title('Preprocessed input');

subplot(1, 3, 2);
imagesc(heatmap);
colormap(gca, 'jet');
colorbar;
axis image off;
title('Raw Grad-CAM heatmap');

subplot(1, 3, 3);
imshow(overlayImg);
title(sprintf('Overlay: %s (%.1f%%)', ...
    string(result.predictedGrade), result.confidence*100));

fprintf('\nVisual check: does the heatmap concentrate on lesions,\n');
fprintf('not on borders or scattered noise? Inspect the figure.\n');