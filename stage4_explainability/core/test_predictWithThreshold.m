%% test_predictWithThreshold.m
% Quick sanity check for predictWithThreshold.m
testImagePath = 'data/aptos2019/colored_images/Proliferate_DR/1bf30c84bbad.png';

%% Load model
S = load('stage_3/Stage3_Final_HighSensitivity_Model.mat');
net = S.trainedNetWeighted;
bestThreshold = S.stage3Results.threshold;   % should be 0.2
classNames = net.Layers(end).Classes;

%% Run
result = predictWithThreshold(net, testImagePath, bestThreshold, classNames);

%% Report
fprintf('Predicted grade:   %s\n', string(result.predictedGrade));
fprintf('Confidence:        %.3f\n', result.confidence);
fprintf('Referable prob:    %.3f (threshold %.2f)\n', ...
    result.referableProb, bestThreshold);
fprintf('Is referable:      %d\n', result.isReferable);
fprintf('Probabilities sum: %.4f (should be ~1.0)\n', sum(result.probs));

for i = 1:numel(classNames)
    fprintf('  %-16s %.4f\n', string(classNames(i)), result.probs(i));
end

assert(abs(sum(result.probs) - 1) < 1e-3, 'FAIL: probabilities do not sum to 1');
fprintf('\nPASS: basic sanity checks OK.\n');

