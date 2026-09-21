function [overallGrade, leftResult, rightResult] = assessBilateralRetina(trainedNetWeighted, leftImgPath, rightImgPath)
% ASSESSBILATERALRETINA  Grade both eyes and report the worse of the two.
%
% Images go through preprocessForNetwork (crop to the retina, pad to a
% square, resize to 224x224) -- the same preprocessing Stage 4 uses -- so
% grades here are consistent with the Stage 4 reports.

    % Higher index = more severe stage
    stages = {'No_DR', 'Mild', 'Moderate', 'Severe', 'Proliferate_DR'};

    [predLeft, probLeft] = gradeOneEye(trainedNetWeighted, leftImgPath);
    [predRight, probRight] = gradeOneEye(trainedNetWeighted, rightImgPath);

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
    rightResult.Grade = char(predRight);
    rightResult.Probabilities = probRight;

    fprintf('--- Bilateral AI Assessment Complete ---\n');
    fprintf('Left Eye (OS) Tag: %s\n', char(predLeft));
    fprintf('Right Eye (OD) Tag: %s\n', char(predRight));
    fprintf('Overall Patient Assessment Tag: %s Risk\n', overallGrade);
end

function [pred, probs] = gradeOneEye(net, imgPath)
    img = imread(imgPath);
    if size(img, 3) == 1
        img = repmat(img, 1, 1, 3);
    elseif size(img, 3) == 4
        img = img(:, :, 1:3);
    end
    imgReady = preprocessForNetwork(img, [224 224]);
    [pred, probs] = classify(net, imgReady);
end
