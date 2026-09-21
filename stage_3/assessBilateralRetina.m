function [overallGrade, leftResult, rightResult] = assessBilateralRetina(trainedNetWeighted, leftImgPath, rightImgPath)
% ASSESSBILATERALRETINA  Grade both eyes.
%
% Returns the worse of the two most-likely grades, and for each eye:
%   .Grade                  most-likely class
%   .Probabilities          class probabilities (network class order)
%   .ReferableProbability   P(Moderate) + P(Severe) + P(Proliferate_DR)
%
% The network is tuned to flag an eye as referable when ReferableProbability >= the threshold stored
% with the model (see loadStage3Model). That decision is made by the caller: it catches far more
% referable eyes than the most-likely grade alone (validation/REPORT.md).
%
% Images go through preprocessStage3Input (plain resize), the preprocessing the network was
% trained and validated with.

    % Higher index = more severe stage
    stages = {'No_DR', 'Mild', 'Moderate', 'Severe', 'Proliferate_DR'};

    [predLeft, probLeft, refLeft] = gradeOneEye(trainedNetWeighted, leftImgPath);
    [predRight, probRight, refRight] = gradeOneEye(trainedNetWeighted, rightImgPath);

    leftIdx = find(ismember(stages, char(predLeft)), 1);
    rightIdx = find(ismember(stages, char(predRight)), 1);
    if isempty(leftIdx) || isempty(rightIdx)
        error('assessBilateralRetina:unknownClass', ...
            'Network returned a class outside the expected DR stages: %s / %s', ...
            char(predLeft), char(predRight));
    end

    overallGrade = stages{max(leftIdx, rightIdx)};

    leftResult.Grade = char(predLeft);
    leftResult.Probabilities = probLeft;
    leftResult.ReferableProbability = refLeft;
    rightResult.Grade = char(predRight);
    rightResult.Probabilities = probRight;
    rightResult.ReferableProbability = refRight;

    fprintf('--- Bilateral AI Assessment Complete ---\n');
    fprintf('Left Eye (OS) Tag: %s (referable probability %.2f)\n', char(predLeft), refLeft);
    fprintf('Right Eye (OD) Tag: %s (referable probability %.2f)\n', char(predRight), refRight);
    fprintf('Overall Patient Assessment Tag: %s Risk\n', overallGrade);
end

function [pred, probs, referableProb] = gradeOneEye(net, imgPath)
    imgReady = preprocessStage3Input(imread(imgPath));
    [pred, probs] = classify(net, imgReady);
    classes = cellstr(net.Layers(end).Classes);
    referableProb = double(sum(probs(ismember(classes, {'Moderate', 'Severe', 'Proliferate_DR'}))));
end
