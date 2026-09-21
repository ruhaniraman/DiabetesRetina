function result = predictWithThreshold(net, imgPath, bestThreshold, classNames)
% PREDICTWITHTHRESHOLD  Run one fundus image through the Stage 3 network
% and apply the referable-DR decision rule at the tuned threshold.
%
%   result = predictWithThreshold(net, imgPath, bestThreshold, classNames)
%
%   INPUTS:
%     net           - the loaded trainedNetWeighted DAGNetwork
%     imgPath       - path to a fundus image (any size, uint8 RGB)
%     bestThreshold - scalar threshold from stage3Results (e.g. 0.2)
%     classNames    - categorical/cellstr array of class names in the
%                     SAME order as net.Layers(end).Classes, i.e.:
%                     {'Mild','Moderate','No_DR','Proliferate_DR','Severe'}
%
%   OUTPUT (struct):
%     probs          - 1x5 vector of class probabilities (softmax output)
%     predictedGrade - the argmax class name (categorical)
%     referableProb  - P(Moderate) + P(Severe) + P(Proliferate_DR)
%     isReferable    - true if referableProb >= bestThreshold
%     confidence     - probability of the predicted (argmax) class
%     cropInfo       - the region of the original image that was fed to the
%                      network (the full frame: the input is resized, not cropped)
%
%   IMPORTANT: this uses classify()'s AUTOMATIC normalization. Do not
%   apply any manual zscore here -- the network's own ImageInputLayer
%   normalises the input.

img = imread(imgPath);
if size(img, 3) == 1
    img = repmat(img, 1, 1, 3);
elseif size(img, 3) == 4
    img = img(:, :, 1:3);
end

% Plain resize: the preprocessing the network was trained and validated with (see preprocessStage3Input.m
% and validation/REPORT.md). Stage 3 grading uses the same function, so the Grad-CAM explains exactly the
% image that was graded. The whole image is used, so cropInfo covers the full frame.
imgReady = preprocessStage3Input(img);
cropInfo.bbox = [1 1 size(img, 2) size(img, 1)];
cropInfo.padded = false;
cropInfo.originalSize = [size(img, 1) size(img, 2)];

% classify() applies the network's own zscore normalization internally
[~, scores] = classify(net, imgReady);
probs = scores;  % 1x5, in net.Layers(end).Classes order

% ---- Referable-DR decision rule ----
% Referable = Moderate, Severe, or Proliferate_DR (NOT argmax alone).
% Indices found by name, never hardcoded, since class order is
% alphabetical and easy to get wrong: Mild, Moderate, No_DR,
% Proliferate_DR, Severe.
referableClasses = {'Moderate', 'Severe', 'Proliferate_DR'};
referableIdx = find(ismember(cellstr(classNames), referableClasses));

referableProb = sum(probs(referableIdx));
isReferable = referableProb >= bestThreshold;

[confidence, maxIdx] = max(probs);
predictedGrade = classNames(maxIdx);

result.probs = probs;
result.predictedGrade = predictedGrade;
result.referableProb = referableProb;
result.isReferable = isReferable;
result.confidence = confidence;
result.cropInfo = cropInfo;
result.preprocessedImage = imgReady;  % kept for Grad-CAM step 4

end