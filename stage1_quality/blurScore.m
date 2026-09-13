function score = blurScore(img)
% BLURSCORE  Compute a sharpness score for an image using variance of Laplacian.
%
%   score = blurScore(img)
%
%   Higher score = sharper image. Lower score = blurrier image.
%
%   IMPORTANT FIX (2026-09-13): the raw variance-of-Laplacian measure is
%   sensitive to overall image brightness/contrast, not just sharpness --
%   a perfectly sharp but simply DARK image produces an artificially low
%   score, which would incorrectly get flagged as blurry. This was caught
%   by testing: darkening a sharp image to 30% brightness dropped its
%   blur score below the blur threshold, despite zero actual blur being
%   applied.
%
%   FIX: normalize the image's contrast range to [0,1] with mat2gray()
%   BEFORE computing the Laplacian, so brightness/contrast differences
%   between images don't affect the sharpness measurement -- only actual
%   edge structure does.
%
%   NOTE (MATLAB basics):
%   - mat2gray() rescales an image so its darkest pixel becomes 0 and its
%     brightest becomes 1, stretching whatever range it originally used
%     to fill the full [0,1] scale. This cancels out uniform brightness
%     scaling (multiplying every pixel by the same factor) since the
%     relative differences between pixels -- which is what edges are --
%     get stretched back to the same scale regardless of original
%     brightness.

    if size(img, 3) == 3
        img = rgb2gray(img);
    end

    img = im2double(img);
    img = mat2gray(img);   % normalize contrast so brightness doesn't affect the score

    laplacianKernel = fspecial('laplacian');
    edgeResponse = imfilter(img, laplacianKernel, 'replicate');

    score = var(edgeResponse(:));
end