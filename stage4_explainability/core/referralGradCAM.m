function [heatmap, overlayImg, referableProb] = referralGradCAM(net, preprocessedImg, classSet, dlnetOverride)
% REFERRALGRADCAM  Where did the model's REFERRAL score come from?
%
%   [heatmap, overlayImg, referableProb] = referralGradCAM(net, preprocessedImg)
%
% The referral decision is made on P(Moderate) + P(Severe) + P(Proliferate_DR) (see assessBilateralRetina), not on the single most
% likely grade, so the explanation is computed for that same quantity: the gradient of the referral probability with respect to the last
% convolutional feature map (res5b_relu), weighted and summed as in Grad-CAM. (The older generateGradCAM explains the most likely CLASS,
% which for an eye flagged only by the threshold can be "No_DR" or "Mild".)
%
%   preprocessedImg  224x224x3 uint8 from preprocessStage3Input
%   classSet         optional cellstr of the classes whose summed probability is explained (default: the three referable classes;
%                    a single class reproduces the standard Grad-CAM of that class, used to test this implementation)
%   dlnetOverride    optional dlnetwork to use instead of the trained one (the randomised-weights sanity check, see randomisedDlnet)
%   heatmap          224x224 in [0,1], 0 outside the retina
%   overlayImg       the image with the heatmap blended in (retina only)
%   referableProb    the network's referral probability for this image (not mirror-averaged)

    persistent cachedNet cachedDlnet
    if nargin >= 4 && ~isempty(dlnetOverride)
        dlnet = dlnetOverride;
    else
        if isempty(cachedDlnet) || ~isequal(cachedNet, net)
            cachedDlnet = trainedDlnetwork(net);
            cachedNet = net;
        end
        dlnet = cachedDlnet;
    end
    classes = cellstr(net.Layers(end).Classes);
    if nargin < 3 || isempty(classSet), classSet = {'Moderate', 'Severe', 'Proliferate_DR'}; end
    refIdx = find(ismember(classes, classSet));

    dlX = dlarray(single(preprocessedImg), 'SSC');
    [referableProb, gradient, activation] = dlfeval(@referralGradient, dlnet, dlX, refIdx);
    referableProb = double(extractdata(referableProb));

    A = extractdata(activation);                       % 7x7xK feature map
    G = extractdata(gradient);
    weights = mean(G, [1 2]);                          % Grad-CAM channel weights
    cam = max(sum(A .* weights, 3), 0);                % ReLU of the weighted sum
    cam = double(cam);
    if max(cam(:)) > 0
        cam = (cam - min(cam(:))) / (max(cam(:)) - min(cam(:)));
    end
    heatmap = imresize(cam, [size(preprocessedImg, 1), size(preprocessedImg, 2)]);

    fovMask = getFOVMask(preprocessedImg);
    fovMask = imresize(fovMask, size(heatmap), 'nearest') > 0;
    heatmap(~fovMask) = 0;
    if any(fovMask(:)) && max(heatmap(fovMask)) > 0
        heatmap = heatmap / max(heatmap(fovMask));
    end
    overlayImg = blendHeatmap(preprocessedImg, heatmap, fovMask);
end

function [referable, gradient, activation] = referralGradient(dlnet, dlX, refIdx)
    [prob, activation] = predict(dlnet, dlX, 'Outputs', {'prob', 'res5b_relu'});   % inference mode: batch-norm uses its stored statistics
    referable = sum(prob(refIdx));
    gradient = dlgradient(referable, activation);
end

function overlayImg = blendHeatmap(baseImg, heatmap, fovMask)
    alphaMap = 0.4 * double(fovMask);
    idx = max(1, min(256, round(heatmap * 255) + 1));
    rgb = im2uint8(ind2rgb(idx, jet(256)));
    blended = (1 - alphaMap) .* double(baseImg) + alphaMap .* double(rgb);
    overlayImg = uint8(blended);
    fov3 = repmat(fovMask, [1, 1, size(overlayImg, 3)]);
    overlayImg(~fov3) = baseImg(~fov3);
end
