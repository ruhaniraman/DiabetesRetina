function [meanBrightness, underExposedFraction, overExposedFraction] = illuminationScore(img, mask)
% ILLUMINATIONSCORE  Measure exposure quality of a fundus image,
% considering only the actual retina region (not the black background).
%
%   [meanBrightness, underExposedFraction, overExposedFraction] = illuminationScore(img)
%   [meanBrightness, underExposedFraction, overExposedFraction] = illuminationScore(img, mask)
%
%   "mask" is optional -- a logical FOV mask from getFOVMask(img). If you
%   don't pass one, this function computes it internally. Passing one in
%   is faster if you're calling this many times in a loop and already
%   have the mask computed (avoids redoing the same FOV detection work
%   over and over).
%
%   Uses the GREEN channel -- standard convention in retinal image
%   analysis for contrast reasons (see earlier comments).
%
%   NOTE (MATLAB basics):
%   - nargin is a built-in variable telling you how many input
%     arguments were actually passed when the function was called.
%     nargin < 2 means "the caller didn't supply mask," so we compute
%     it ourselves as a fallback.
%   - greenChannel(mask) with a logical mask pulls out ONLY the pixels
%     where mask is true, as a flat list of numbers -- this is called
%     "logical indexing" and is one of MATLAB's most useful features.
%     It's how we restrict all our brightness stats to just the retina
%     pixels, ignoring the black background entirely.

    if nargin < 2
        mask = getFOVMask(img);
    end

    greenChannel = im2double(img(:,:,2));
    retinaPixels = greenChannel(mask);   % only pixels INSIDE the retina

    meanBrightness = mean(retinaPixels);

    underExposedFraction = mean(retinaPixels < 0.05);
    overExposedFraction  = mean(retinaPixels > 0.95);
end