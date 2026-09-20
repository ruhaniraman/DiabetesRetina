%% test_createMedicalReport.m
% Full end-to-end test: image -> prediction -> Grad-CAM -> report text
% -> final assembled PDF/PNG report.
%
% Run this AFTER predictWithThreshold.m, generateGradCAM.m, and
% formatReportText.m have all been individually validated.

testImagePath = 'data/aptos2019/colored_images/Severe/0c917c372572.png';

%% Load model
S = load('stage_3/Stage3_Final_HighSensitivity_Model.mat');
net = S.trainedNetWeighted;
bestThreshold = S.stage3Results.threshold;
classNames = net.Layers(end).Classes;

%% Step 2: predict
result = predictWithThreshold(net, testImagePath, bestThreshold, classNames);
fprintf('Predicted: %s (confidence %.3f)\n', ...
    string(result.predictedGrade), result.confidence);

%% Step 3: Grad-CAM
[~, predictedClassIdx] = max(result.probs);
[heatmap, overlayImg] = generateGradCAM(net, result.preprocessedImage, ...
    predictedClassIdx, classNames);

%% Step 4: report text
reportText = formatReportText(result);

%% Step 5: assemble full report
outputPaths = createMedicalReport(testImagePath, result, heatmap, ...
    overlayImg, reportText, 'stage4_explainability/results');

fprintf('\nDone. PDF saved at:\n  %s\n', outputPaths.pdf);

% Open the PDF automatically (Windows). If this errors on your system,
% just navigate to the results folder and open it manually.
if ispc
    winopen(outputPaths.pdf);
end