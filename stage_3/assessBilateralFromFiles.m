function [overallGrade, leftGrade, rightGrade, leftConf, rightConf, leftReferable, rightReferable, threshold] = assessBilateralFromFiles(leftImgPath, rightImgPath)
% ASSESSBILATERALFROMFILES  Python-friendly wrapper around assessBilateralRetina.
%
% The MATLAB Engine for Python cannot marshal a trained network object, so the network is loaded
% (and cached) here and only plain strings/numbers cross the boundary.
%
%   leftConf/rightConf              calibrated probability of the most-likely grade (temperature scaling, fitted on validation;
%                                   validation/results/calibration.md). The raw network is over-confident.
%   leftReferable/rightReferable    P(Moderate or worse) for each eye
%   threshold                       the referable-probability threshold the model was tuned with; an eye
%                                   is flagged when its referable probability is >= this value
    [net, threshold, ~, temperature] = loadStage3Model();
    [overallGrade, leftRes, rightRes] = assessBilateralRetina(net, leftImgPath, rightImgPath);
    leftGrade = leftRes.Grade;
    rightGrade = rightRes.Grade;
    leftConf = double(max(temperatureScale(leftRes.Probabilities, temperature)));
    rightConf = double(max(temperatureScale(rightRes.Probabilities, temperature)));
    leftReferable = leftRes.ReferableProbability;
    rightReferable = rightRes.ReferableProbability;
    threshold = double(threshold);
end

function q = temperatureScale(p, T)
% softmax(log p / T): the calibration stage_3/finetune/finetuneStage3.m fitted (fitTemperature).
    z = log(max(double(p), 1e-12)) / T;
    z = z - max(z);
    q = exp(z) / sum(exp(z));
end
