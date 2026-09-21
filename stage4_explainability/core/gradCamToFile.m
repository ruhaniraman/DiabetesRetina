function gradCamToFile(imgPath, outPath)
% GRADCAMTOFILE  Run the real Stage 4 Grad-CAM on one image and save the
% overlay as a PNG. Used by the Python backend (which can't pass network
% objects across the MATLAB Engine boundary).
    [net, threshold, classNames] = loadStage3Model();
    result = predictWithThreshold(net, imgPath, threshold, classNames);
    [~, predictedClassIdx] = max(result.probs);
    [~, overlayImg] = generateGradCAM(net, result.preprocessedImage, ...
        predictedClassIdx, classNames);
    imwrite(overlayImg, outPath);
end
