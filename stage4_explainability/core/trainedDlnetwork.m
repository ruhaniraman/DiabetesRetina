function dlnet = trainedDlnetwork(net)
% TRAINEDDLNETWORK  The trained Stage 3 network as a dlnetwork ending at the softmax ('prob'), so gradients can be taken.
    lgraph = layerGraph(net);
    lgraph = removeLayers(lgraph, lgraph.Layers(end).Name);      % drop the classification layer; keep the softmax
    dlnet = dlnetwork(lgraph);
end
