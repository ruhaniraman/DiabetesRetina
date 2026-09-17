function result = lesionDetection(imageInput, odCenter, odRadius, vesselMask, opts)
%LESIONDETECTION Detect diabetic retinopathy lesions via classical CV.
% Detects: hard exudates (EX), hemorrhages (HE), microaneurysms (MA).
% Soft exudates (SE) included as an experimental/lower-confidence pass.
%
% !! SAVE THIS FILE AS lesionDetection.m (must match this name) !!
%
% Reuses OD location and vessel mask (from opticDiscLocalization and
% vesselSegmentation) to exclude the two biggest sources of false
% positives: the OD itself (bright, would trigger false EX) and vessels
% (dark, would swamp HE/MA detection since both are dark blobs too).
%
% USAGE:
%   odRes = opticDiscLocalization(imgPath, [], struct('visualize',false));
%   vesRes = vesselSegmentation(imgPath, struct('visualize',false));
%   result = lesionDetection(imgPath, odRes.pred, 193, vesRes.vesselMask);

    if nargin < 5, opts = struct(); end
    opts = setDefault(opts, 'odExclusionFactor', 1.6);   % x odRadius, excluded around OD
    opts = setDefault(opts, 'exPercentile', 97);
    opts = setDefault(opts, 'exMinArea', 8);
    opts = setDefault(opts, 'exMaxEccentricity', 0.95);
    opts = setDefault(opts, 'hePercentile', 96);
    opts = setDefault(opts, 'heMinArea', 15);
    opts = setDefault(opts, 'heMaxArea', 8000);
    opts = setDefault(opts, 'heMaxEccentricity', 0.90);
    opts = setDefault(opts, 'maPercentile', 99.7);
    opts = setDefault(opts, 'maMinArea', 3);
    opts = setDefault(opts, 'maMaxArea', 25);
    opts = setDefault(opts, 'maMaxEccentricity', 0.6);
    
   
    opts = setDefault(opts, 'sePercentile', 94);
    opts = setDefault(opts, 'seMinArea', 200);
    opts = setDefault(opts, 'visualize', true);
    opts = setDefault(opts, 'verbose', true);
    
    if isstring(imageInput) || ischar(imageInput)
        imagePath = char(imageInput);
        I = imread(imagePath);
    else
        I = imageInput;
        imagePath = '';
    end

    green = im2double(I(:,:,2));
    grayImage = im2double(rgb2gray(I));
    [H, W] = size(green);
    fovMask = getFOVMask(grayImage);

    if nargin < 4 || isempty(vesselMask)
        vesselMask = false(H, W);
    end

    odExclMask = true(H, W);
    if nargin >= 2 && ~isempty(odCenter) && ~any(isnan(odCenter))
        [xx, yy] = meshgrid(1:W, 1:H);
        odExclMask = sqrt((xx-odCenter(1)).^2 + (yy-odCenter(2)).^2) > (opts.odExclusionFactor * odRadius);
    end

    validMask = fovMask & odExclMask;
    nonVesselMask = validMask & ~vesselMask;

    enhanced = adapthisteq(green, 'ClipLimit', 0.01);

    %% Hard exudates: bright, compact, sharp-edged
    bgEX = imgaussfilt(enhanced, max(1, odRadius*1.5));
    brightness = enhanced - bgEX;
    brightness(~validMask) = -Inf;
    exThresh = prctile(brightness(validMask), opts.exPercentile);
    exBW = brightness >= exThresh;
    exBW = exBW & ~vesselMask;
    exBW = bwareaopen(exBW, opts.exMinArea);
    exMask = filterByEccentricity(exBW, opts.exMaxEccentricity, [], []);

    %% Hemorrhages: dark, roundish blobs, NOT part of the vessel tree
    bgHE = imgaussfilt(enhanced, max(1, odRadius*0.8));
    darkness = bgHE - enhanced; % positive where locally darker than surroundings
    darkness(~nonVesselMask) = -Inf;
    heThresh = prctile(darkness(nonVesselMask), opts.hePercentile);
    heBW = darkness >= heThresh;
    heBW = bwareaopen(heBW, opts.heMinArea);
    heMask = filterByEccentricity(heBW, opts.heMaxEccentricity, opts.heMinArea, opts.heMaxArea);

    %% Microaneurysms: tiny, very round, dark dots
    smallStrel = strel('disk', max(1, round(odRadius*0.03)));
    tophat = imbothat(enhanced, smallStrel);
    tophat(~nonVesselMask) = -Inf;
    maThresh = prctile(tophat(nonVesselMask), opts.maPercentile);
    maBW = tophat >= maThresh;
    maBW = bwareaopen(maBW, opts.maMinArea);
    maMask = filterByEccentricity(maBW, opts.maMaxEccentricity, opts.maMinArea, opts.maMaxArea);

    %% Soft exudates (experimental): diffuse bright patches, larger scale
    bgSE = imgaussfilt(enhanced, max(1, odRadius*2.5));
    softBrightness = enhanced - bgSE;
    softBrightness(~validMask) = -Inf;
    seThresh = prctile(softBrightness(validMask), opts.sePercentile);
    seBW = softBrightness >= seThresh;
    seBW = seBW & ~exMask & ~vesselMask; % SE distinct from sharp-edged EX
    seMask = bwareaopen(seBW, opts.seMinArea);

    if opts.verbose
        fprintf('  [LESION] EX: %d px (%d components)\n', nnz(exMask), countComponents(exMask));
        fprintf('  [LESION] HE: %d px (%d components)\n', nnz(heMask), countComponents(heMask));
        fprintf('  [LESION] MA: %d px (%d components)\n', nnz(maMask), countComponents(maMask));
        fprintf('  [LESION] SE (experimental): %d px (%d components)\n', nnz(seMask), countComponents(seMask));
    end

    result = struct('exMask', exMask, 'heMask', heMask, 'maMask', maMask, ...
        'seMask', seMask, 'fovMask', fovMask, ...
        'nonVesselMask', nonVesselMask, 'vesselMask', vesselMask);

    if opts.visualize
        plotLesionOverlay(I, exMask, heMask, maMask, seMask, imagePath);
    end
end

function mask = filterByEccentricity(bw, maxEcc, minArea, maxArea)
    cc = bwconncomp(bw);
    stats = regionprops(cc, 'Eccentricity', 'Area');
    mask = false(size(bw));
    for i = 1:numel(stats)
        if stats(i).Eccentricity > maxEcc
            continue;
        end
        if ~isempty(minArea) && stats(i).Area < minArea
            continue;
        end
        if ~isempty(maxArea) && stats(i).Area > maxArea
            continue;
        end
        mask(cc.PixelIdxList{i}) = true;
    end
end

function n = countComponents(bw)
    cc = bwconncomp(bw);
    n = cc.NumObjects;
end

function plotLesionOverlay(I, exMask, heMask, maMask, seMask, imagePath)
    f = figure('Visible', 'off', 'Position', [100 100 1000 800]);
    imshow(I); hold on;

    overlay = zeros([size(exMask) 3]);
    overlay(:,:,1) = exMask;                    % EX = red
    overlay(:,:,2) = heMask;                    % HE = green
    overlay(:,:,3) = maMask;                    % MA = blue
    overlay(:,:,1) = overlay(:,:,1) | seMask;    % SE = yellow (red+green)
    overlay(:,:,2) = overlay(:,:,2) | seMask;

    h = imshow(overlay);
    set(h, 'AlphaData', 0.6 * any(overlay, 3));

    if ~isempty(imagePath)
        [~, imgName, imgExt] = fileparts(imagePath);
        name = imgName;
        title(sprintf('%s%s - EX(red) HE(green) MA(blue) SE(yellow)', imgName, imgExt), ...
            'Interpreter', 'none');
    else
        name = 'lesion_detection';
        title('EX(red) HE(green) MA(blue) SE(yellow)');
    end
    hold off;

    outDir = fullfile('results', 'lesion_detection');
    if ~exist(outDir, 'dir')
        mkdir(outDir);
    end
    saveas(f, fullfile(outDir, [name '_lesions.png']));
    close(f);
end

function mask = getFOVMask(grayImage)
    grayImage = im2double(grayImage);
    thresh = 0.3 * graythresh(grayImage);
    mask = grayImage > thresh;
    mask = imfill(mask, 'holes');
    maskBeforeOpen = mask;
    mask = imopen(mask, strel('disk', 15));
    if nnz(mask) == 0
        mask = maskBeforeOpen;
    end
    cc = bwconncomp(mask);
    if cc.NumObjects > 1
        stats = regionprops(cc, 'Area');
        [~, idx] = max([stats.Area]);
        mask = false(size(mask));
        mask(cc.PixelIdxList{idx}) = true;
    end
end

function opts = setDefault(opts, field, value)
    if ~isfield(opts, field)
        opts.(field) = value;
    end
end
