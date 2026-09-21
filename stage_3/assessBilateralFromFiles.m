function [overallGrade, leftGrade, rightGrade, leftConf, rightConf, leftReferable, rightReferable, threshold] = assessBilateralFromFiles(leftImgPath, rightImgPath)
% ASSESSBILATERALFROMFILES  Python-friendly wrapper around assessBilateralRetina.
%
% The MATLAB Engine for Python cannot marshal a trained network object, so the network is loaded
% (and cached) here and only plain strings/numbers cross the boundary.
%
%   leftConf/rightConf              probability of the most-likely grade
%   leftReferable/rightReferable    P(Moderate or worse) for each eye
%   threshold                       the referable-probability threshold the model was tuned with; an eye
%                                   is flagged when its referable probability is >= this value
    [net, threshold] = loadStage3Model();
    [overallGrade, leftRes, rightRes] = assessBilateralRetina(net, leftImgPath, rightImgPath);
    leftGrade = leftRes.Grade;
    rightGrade = rightRes.Grade;
    leftConf = double(max(leftRes.Probabilities));
    rightConf = double(max(rightRes.Probabilities));
    leftReferable = leftRes.ReferableProbability;
    rightReferable = rightRes.ReferableProbability;
    threshold = double(threshold);
end
