function [odCenter, confidence] = findOpticDisc(img, mask)
% FINDOPTICDISC  Locate the optic disc center in a fundus image.
%
%   [odCenter, confidence] = findOpticDisc(img)
%   [odCenter, confidence] = findOpticDisc(img, mask)
%
%   Returns:
%     odCenter   - [x, y] pixel coordinates of the detected OD center
%     confidence - a rough 0-1 score of how "disc-like" the detected
%                  region is (based on circularity), useful later for
%                  flagging low-confidence detections
%
%   HOW IT WORKS:
%   The optic disc is the brightest, most solid large region in a
%   healthy fundus image -- it's where the retina's blood vessels
%   converge and where light reflects strongly. This function finds it
%   by looking for the largest bright, roughly-circular connected
%   region within the retina.
%
%   NOTE (MATLAB basics):
%   - regionprops() analyzes a labeled/binary image and measures
%     properties of each connected blob -- here, Area (size) and
%     Circularity (how close to a perfect circle, 1.0 = perfect).
%   - [~, idx] = max(...) : the ~ means "I don't need this output,
%     just skip it." max() normally returns both the max VALUE and its
%     INDEX (position in the list) if asked for two outputs -- here we
%     only care about the index (which blob was biggest), not the
%     value itself.

    if nargin < 2
        mask = getFOVMask(img);
    end

    greenChannel = im2double(img(:,:,2));
    % Red channel also carries strong OD signal and is less affected by
    % vessel-darkening than green -- averaging both improves robustness.
    redChannel = im2double(img(:,:,1));
    combined = (greenChannel + redChannel) / 2;
    combined(~mask) = 0;   % ignore background entirely

    % The OD is among the brightest ~2% of retina pixels in most images.
    % Using a percentile threshold (rather than a fixed number) adapts
    % automatically to each image's own brightness range.
    retinaPixels = combined(mask);
    brightThreshold = prctile(retinaPixels, 98);
    brightRegions = combined > brightThreshold;

    % Clean up: remove tiny stray bright specks (single bright pixels
    % from vessel reflections), then fill small gaps so the OD region
    % reads as one solid blob rather than a speckled cluster.
    brightRegions = bwareaopen(brightRegions, 30);
    brightRegions = imclose(brightRegions, strel('disk', 5));

    stats = regionprops(brightRegions, 'Area', 'Centroid', 'Circularity');

    if isempty(stats)
        odCenter = [NaN, NaN];
        confidence = 0;
        return;
    end

    % The OD is the LARGEST bright blob -- vessel reflections and other
    % bright artifacts are typically much smaller.
    areas = [stats.Area];
    [~, idx] = max(areas);

    odCenter = stats(idx).Centroid;
    confidence = min(1, stats(idx).Circularity);
end
