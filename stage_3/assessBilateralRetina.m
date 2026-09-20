function [overallGrade, leftResult, rightResult] = assessBilateralRetina(trainedNetWeighted, leftImgPath, rightImgPath)
    % Define the clinical hierarchy mapping for grading severity
    % Higher number = more severe stage
    stages = {'No_DR', 'Mild', 'Moderate', 'Severe', 'Proliferate_DR'};
    
    % 1. Process Left Eye (OS)
    imgLeft = imread(leftImgPath);
    imgLeft = imresize(imgLeft, [224, 224]); % Match network input size
    [predLeft, probLeft] = classify(trainedNetWeighted, imgLeft);
    
    % 2. Process Right Eye (OD)
    imgRight = imread(rightImgPath);
    imgRight = imresize(imgRight, [224, 224]);
    [predRight, probRight] = classify(trainedNetWeighted, imgRight);
    
    % 3. Determine Highest Grading (Severity Max)
    leftIdx = find(ismember(stages, char(predLeft)));
    rightIdx = find(ismember(stages, char(predRight)));
    
    if leftIdx >= rightIdx
        overallIdx = leftIdx;
        overallGrade = stages{overallIdx};
    else
        overallIdx = rightIdx;
        overallGrade = stages{overallIdx};
    end
    
    % Pack individual results for your tags/UI display
    leftResult.Grade = char(predLeft);
    leftResult.Probabilities = probLeft;
    
    rightResult.Grade = char(predRight);
    rightResult.Probabilities = probRight;
    
    % Print summary to command window (simulating tag updates)
    fprintf('--- Bilateral AI Assessment Complete ---\n');
    fprintf('Left Eye (OS) Tag: %s\n', string(predLeft));
    fprintf('Right Eye (OD) Tag: %s\n', string(predRight));
    fprintf('Overall Patient Assessment Tag: %s Risk\n', overallGrade);
end