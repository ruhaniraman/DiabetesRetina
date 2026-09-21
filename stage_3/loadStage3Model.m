function [net, threshold, classNames] = loadStage3Model()
% LOADSTAGE3MODEL  Load the Stage 3 network once and cache it.
%
% The .mat file sits next to this function, so the load works regardless
% of the current folder. The network is cached in a persistent variable so
% repeated calls (e.g. one per HTTP request) don't re-read the file.
    persistent cachedNet cachedThreshold cachedClasses
    if isempty(cachedNet)
        modelPath = fullfile(fileparts(mfilename('fullpath')), ...
            'Stage3_Final_HighSensitivity_Model.mat');
        S = load(modelPath, 'trainedNetWeighted', 'stage3Results');
        cachedNet = S.trainedNetWeighted;
        cachedThreshold = S.stage3Results.threshold;
        cachedClasses = cachedNet.Layers(end).Classes;
    end
    net = cachedNet;
    threshold = cachedThreshold;
    classNames = cachedClasses;
end
