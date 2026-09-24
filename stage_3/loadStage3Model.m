function [net, threshold, classNames, temperature] = loadStage3Model()
% LOADSTAGE3MODEL  Load the Stage 3 network once and cache it.
%
% The .mat file sits next to this function, so the load works regardless
% of the current folder. The network is cached in a persistent variable so
% repeated calls (e.g. one per HTTP request) don't re-read the file.
%
% temperature: fitted on the validation split (stage3Results.temperature) for calibrated confidence, softmax(log p / T);
% 1 (no change) for a model saved without one. The referral threshold applies to the RAW referral score.
    persistent cachedNet cachedThreshold cachedClasses cachedTemperature
    if isempty(cachedNet)
        modelPath = fullfile(fileparts(mfilename('fullpath')), ...
            'Stage3_Final_HighSensitivity_Model.mat');
        S = load(modelPath, 'trainedNetWeighted', 'stage3Results');
        cachedNet = S.trainedNetWeighted;
        cachedThreshold = S.stage3Results.threshold;
        cachedClasses = cachedNet.Layers(end).Classes;
        cachedTemperature = 1;
        if isfield(S.stage3Results, 'temperature'), cachedTemperature = double(S.stage3Results.temperature); end
    end
    net = cachedNet;
    threshold = cachedThreshold;
    classNames = cachedClasses;
    temperature = cachedTemperature;
end
