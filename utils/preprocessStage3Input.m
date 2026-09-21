function imgReady = preprocessStage3Input(img)
% PREPROCESSSTAGE3INPUT  The preprocessing the Stage 3 network was trained and validated with.
%
%   imgReady = preprocessStage3Input(img)
%
% A plain resize to 224x224 (the network applies its own normalisation internally). Nothing else.
%
% WHY NOT preprocessForNetwork (crop to the retina, pad to a square)?
% validation/ evaluates the network on the exact train/validation/test split recorded in
% Stage3_checkpoint.mat. Plain resize reproduces the model's stored test result exactly
% (TP 206, TN 292, FP 33, FN 17) and the baseline network's saved predictions 548/548; the
% cropped input agrees only 92.3% of the time. The network was therefore trained on resized
% images, and every reported metric holds only for that input. Use this function everywhere
% the network is run (Stage 3 grading and the Stage 4 Grad-CAM) so both see the same image.

    if size(img, 3) == 1
        img = repmat(img, 1, 1, 3);
    elseif size(img, 3) == 4
        img = img(:, :, 1:3);
    end
    imgReady = imresize(img, [224 224]);
end
