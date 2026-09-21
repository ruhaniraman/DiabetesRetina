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

% Same preparation and scoring as Stage 3 grading (retina crop, then the average of the image and its mirror image), so the class
% explained here is the class that was graded. The Grad-CAM itself is computed on the un-mirrored prepared image.
[imgReady, cropInfo] = preprocessForNetwork(img, [224 224]);   % what preprocessStage3Input does, keeping the crop box
[~, probs] = stage3Scores(net, imgReady);   % 1x5, in net.Layers(end).Classes order

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

result.threshold = bestThreshold;   % so report text states the threshold actually used
result.probs = probs;
result.predictedGrade = predictedGrade;
result.referableProb = referableProb;
result.isReferable = isReferable;
result.confidence = confidence;
result.cropInfo = cropInfo;
result.preprocessedImage = imgReady;  % kept for Grad-CAM step 4

end