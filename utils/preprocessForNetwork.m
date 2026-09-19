function [imgReady, cropInfo] = preprocessForNetwork(img, targetSize)
% PREPROCESSFORNETWORK  Prepare a fundus image for input to the Stage 3
% CNN (trainedNetWeighted), preserving maximum retinal detail during
% the inevitable downscaling from full resolution to network input size.
%
%   imgReady = preprocessForNetwork(img)
%   imgReady = preprocessForNetwork(img, targetSize)
%   [imgReady, cropInfo] = preprocessForNetwork(img, targetSize)
%
%   Inputs:
%     img        - raw fundus image (any size, uint8 RGB)
%     targetSize - [height width] for network input (default: [224 224])
%
%   Returns:
%     imgReady  - preprocessed image ready for network inference
%     cropInfo  - struct with the bounding box used, so Stage 4's
%                 Grad-CAM heatmap can be mapped back to the original
%                 image coordinates if needed
%
%   WHY CROP BEFORE RESIZE:
%   Full IDRiD images are 4288x2848 pixels. The retina circle typically
%   occupies ~70-80% of the image width, with black borders on all
%   sides. A naive resize to 224x224 compresses everything including
%   those black borders -- meaning the actual retinal tissue ends up
%   using fewer pixels than the target size, which loses fine detail
%   like microaneurysms and small vessel structure right when you need
%   them most. Cropping to the retina bounding box first ensures every
%   pixel in the resized output carries actual clinical information.
%
%   WHY PADDING (not squish):
%   The retina circle isn't perfectly square, so a tight crop would
%   still cause slight squishing when resized to a square target.
%   Padding the crop to a square (adding black on the shorter axis
%   rather than stretching) avoids distorting the circular retina
%   shape, since circularity matters for optic disc detection and
%   vessel structure analysis in the network's learned features.
%
%   NOTE: the network applies its own z-score normalization internally
%   (stored in its ImageInputLayer), so no manual normalization is
%   needed here -- just passing a standard uint8/single image is enough.

    if nargin < 2
        targetSize = [224 224];
    end

    mask = getFOVMask(img);

    % Get tight bounding box around the retina region
    stats = regionprops(mask, 'BoundingBox');
    if isempty(stats)
        % Fallback: no FOV detected, just resize the whole image
        imgReady = imresize(img, targetSize);
        cropInfo.bbox = [1 1 size(img,2) size(img,1)];
        cropInfo.padded = false;
        return;
    end

    bbox = stats(1).BoundingBox;   % [x y width height]
    x = max(1, floor(bbox(1)));
    y = max(1, floor(bbox(2)));
    w = min(size(img,2)-x, ceil(bbox(3)));
    h = min(size(img,1)-y, ceil(bbox(4)));

    retinaCrop = img(y:y+h-1, x:x+w-1, :);

    % Pad the shorter dimension to make the crop square, preserving
    % the circular retina shape rather than squishing it
    if h > w
        padAmt = h - w;
        padLeft = floor(padAmt/2);
        padRight = ceil(padAmt/2);
        retinaCrop = padarray(retinaCrop, [0 padLeft 0], 0, 'pre');
        retinaCrop = padarray(retinaCrop, [0 padRight 0], 0, 'post');
    elseif w > h
        padAmt = w - h;
        padTop = floor(padAmt/2);
        padBot = ceil(padAmt/2);
        retinaCrop = padarray(retinaCrop, [padTop 0 0], 0, 'pre');
        retinaCrop = padarray(retinaCrop, [padBot 0 0], 0, 'post');
    end

    imgReady = imresize(retinaCrop, targetSize);

    cropInfo.bbox = [x y w h];
    cropInfo.padded = true;
    cropInfo.originalSize = [size(img,1) size(img,2)];
end
