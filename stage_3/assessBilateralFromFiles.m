function [overallGrade, leftGrade, rightGrade, leftConf, rightConf] = assessBilateralFromFiles(leftImgPath, rightImgPath)
% ASSESSBILATERALFROMFILES  Python-friendly wrapper around assessBilateralRetina.
%
% The MATLAB Engine for Python cannot marshal a trained network object, so
% the network is loaded (and cached) here and only plain strings/numbers
% cross the boundary.
    net = loadStage3Model();
    [overallGrade, leftRes, rightRes] = assessBilateralRetina(net, leftImgPath, rightImgPath);
    leftGrade = leftRes.Grade;
    rightGrade = rightRes.Grade;
    leftConf = double(max(leftRes.Probabilities));
    rightConf = double(max(rightRes.Probabilities));
end
