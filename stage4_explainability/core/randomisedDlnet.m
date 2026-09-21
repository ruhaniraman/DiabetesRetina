function dlnet = randomisedDlnet(net, which, seed)
% RANDOMISEDDLNET  A copy of the trained network with random weights: the "model parameter randomisation" sanity check for saliency maps.
%
%   dlnet = randomisedDlnet(net, which, seed)
%
%   which   'top'  only the last learnable layer (the classifier) is randomised
%           'all'  every learnable parameter is randomised
% Each tensor is replaced by Gaussian noise with the mean and standard deviation of the trained tensor. An explanation that really
% depends on what the network learned must change a lot; one that looks the same is only showing image structure.
    dlnet = trainedDlnetwork(net);
    rng(seed);
    L = dlnet.Learnables;
    if strcmp(which, 'top')
        rows = find(L.Layer == L.Layer(end));
    else
        rows = 1:height(L);
    end
    for i = rows(:)'
        v = extractdata(L.Value{i});
        L.Value{i} = dlarray(single(mean(v(:)) + std(v(:)) * randn(size(v))));
    end
    dlnet.Learnables = L;
end
