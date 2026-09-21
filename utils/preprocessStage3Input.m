function imgReady = preprocessStage3Input(img)
% PREPROCESSSTAGE3INPUT  How every photograph is prepared for the Stage 3 network (grading and Grad-CAM both use this).
%
%   imgReady = preprocessStage3Input(img)
%
% Crop away the black border around the retina, pad the crop to a square (so the round retina is not stretched), resize to 224x224.
% The network applies its own normalisation internally.
%
% WHY THIS AND NOT A PLAIN RESIZE?
% The network was TRAINED on plainly resized APTOS images (a plain resize reproduces its stored test result exactly: TP 206, TN 292,
% FP 33, FN 17). On APTOS the two preparations perform the same (AUC 0.974 vs 0.972 on the held-out test split; difference not
% significant). On IDRiD, whose photographs are wide 3:2 frames with large black borders, a plain resize squashes the retina and
% wastes pixels on border, and cropping raises the AUC from 0.900 to 0.924 (95% interval of the difference +0.011 to +0.036) and
% specificity at the same threshold from 46% to 66%. Both effects matter: padding without cropping gives 0.915, cropping then
% stretching gives 0.914. See validation/results/stage3_pipeline.md.
%
% preprocessForNetwork does the crop; if no retina can be found it falls back to a plain resize of the whole image.

    if size(img, 3) == 1
        img = repmat(img, 1, 1, 3);
    elseif size(img, 3) == 4
        img = img(:, :, 1:3);
    end
    imgReady = preprocessForNetwork(img, [224 224]);
end
