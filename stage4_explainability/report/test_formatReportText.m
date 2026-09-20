%% test_formatReportText.m
% Run this AFTER predictWithThreshold.m has been validated.
% Prints the generated report text for a chosen test image.

testImagePath = 'data/aptos2019/colored_images/No_DR/0a38b552372d.png';

%% Load model
S = load('stage_3/Stage3_Final_HighSensitivity_Model.mat');
net = S.trainedNetWeighted;
bestThreshold = S.stage3Results.threshold;
classNames = net.Layers(end).Classes;

%% Predict + format
result = predictWithThreshold(net, testImagePath, bestThreshold, classNames);
reportText = formatReportText(result);

%% Print each field so you can review the language
fprintf('--- ICDR Level ---\n%s\n\n', reportText.icdrLevel);
fprintf('--- Confidence Band: %s ---\n%s\n\n', ...
    reportText.confidenceBand, reportText.confidenceNote);
fprintf('--- Referral Line ---\n%s\n\n', reportText.referralLine);
fprintf('--- Disclaimer ---\n%s\n\n', reportText.disclaimer);
fprintf('=== Full Summary ===\n%s\n', reportText.summary);