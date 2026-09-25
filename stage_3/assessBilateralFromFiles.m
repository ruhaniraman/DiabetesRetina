function [overallGrade, leftGrade, rightGrade, leftConf, rightConf, leftReferable, rightReferable, threshold, leftPDR, rightPDR] = assessBilateralFromFiles(leftImgPath, rightImgPath)
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
%   leftPDR/rightPDR                calibrated P(Proliferate_DR): the best new-vessel signal available (AUC 0.91 for PDR on both test
%                                   sets, stronger than the NV feature model; validation/results/nv.md). Not a new-vessel finding.
    [net, threshold, classNames, temperature] = loadStage3Model();
    [overallGrade, leftRes, rightRes] = assessBilateralRetina(net, leftImgPath, rightImgPath);
    leftGrade = leftRes.Grade;
    rightGrade = rightRes.Grade;
    leftConf = double(max(temperatureScale(leftRes.Probabilities, temperature)));
    rightConf = double(max(temperatureScale(rightRes.Probabilities, temperature)));
    leftReferable = leftRes.ReferableProbability;
    rightReferable = rightRes.ReferableProbability;
    threshold = double(threshold);
    pdr = strcmp(cellstr(classNames), 'Proliferate_DR');
    leftPDR = pdrOf(leftRes.Probabilities, temperature, pdr);
    rightPDR = pdrOf(rightRes.Probabilities, temperature, pdr);
end

function v = pdrOf(p, T, idx)
    q = temperatureScale(p, T);
    v = double(q(idx));
    if isempty(v), v = NaN; end
end

function q = temperatureScale(p, T)
% softmax(log p / T): the calibration stage_3/finetune/finetuneStage3.m fitted (fitTemperature).
    z = log(max(double(p), 1e-12)) / T;
    z = z - max(z);
    q = exp(z) / sum(exp(z));
end
