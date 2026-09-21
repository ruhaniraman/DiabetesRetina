function [pred, scores] = stage3Scores(net, batch)
% STAGE3SCORES  Class probabilities the app uses: the average of the image and its mirror image (test-time augmentation).
%
%   [pred, scores] = stage3Scores(net, batch)
%
%   batch   224x224x3xN uint8, already prepared by preprocessStage3Input
%   pred    N-by-1 categorical, the most likely class of the averaged scores
%   scores  N-by-numClasses averaged softmax scores (network class order)
%
% Averaging with the horizontally mirrored image made the ranking of eyes slightly better on APTOS and clearly better on IDRiD
% (validation/results/stage3_pipeline.md). validation/predictFiles.m ('crop_mirror') calls this same function, so what is measured
% is what the app runs.
    [~, direct] = classify(net, batch, 'MiniBatchSize', 32);
    [~, mirrored] = classify(net, flip(batch, 2), 'MiniBatchSize', 32);
    scores = (direct + mirrored) / 2;
    classes = net.Layers(end).Classes;
    [~, idx] = max(scores, [], 2);
    pred = classes(idx);
end
