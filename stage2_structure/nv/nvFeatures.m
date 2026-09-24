function [f, maps] = nvFeatures(img, lesionModel)
% NVFEATURES  Image features that suggest new vessels (neovascularisation), for the NV suspicion model (Stage 2).
%
%   [f, maps] = nvFeatures(img)                 img: RGB fundus photograph or file path
%   [f, maps] = nvFeatures(img, lesionModel)    reuse a loaded Stage2_LesionUNet_v2 model struct
%
% New vessels are fine, tortuous, densely branching vessels on or near the optic disc (NVD) or elsewhere (NVE); proliferative DR can also
% show large pre-retinal or vitreous haemorrhages. None of the problem-statement datasets has pixel masks for new vessels, so these
% features are validated against the proliferative grade (validation/results/nv.md), not against drawn new vessels.
%
% The retina is rescaled to 1024 px wide. Vessels: the classical vesselSegmentation (validated on DRIVE); fine vessels are those found
% by the smallest vesselness scales only. Disc and haemorrhages: the lesion network (segmentLesionsDL, estimateFovea).
%   f      struct of scalar features (see the list at the end)
%   maps   .fineVessels (logical, 1024-wide working view), .hotspot (8x8 grid of fine-vessel density outside the disc region)
    persistent model
    if nargin >= 2 && ~isempty(lesionModel), model = lesionModel; end
    if isempty(model)
        S = load(fullfile(fileparts(fileparts(mfilename('fullpath'))), 'dl', 'Stage2_LesionUNet_v2.mat'), 'model');
        model = S.model;
    end
    if ischar(img) || isstring(img), img = imread(img); end
    if size(img, 3) == 1, img = repmat(img, 1, 1, 3); elseif size(img, 3) == 4, img = img(:, :, 1:3); end

    % lesion network at full resolution (disc + haemorrhages), then everything else at a 1024-wide retina view
    [prob, masks, info] = segmentLesionsDL(img, model);
    b = info.cropBox;
    crop = @(x) x(b(2):b(2) + b(4) - 1, b(1):b(1) + b(3) - 1, :);
    scale = 1024 / b(3);
    work = imresize(crop(img), scale);
    fov = imresize(crop(info.fov), [size(work, 1) size(work, 2)], 'nearest');
    odProb = imresize(crop(prob(:, :, strcmp(model.channels, 'OD'))), [size(work, 1) size(work, 2)]);
    heMask = imresize(crop(masks(:, :, strcmp(model.channels, 'HE'))), [size(work, 1) size(work, 2)], 'nearest');
    L = estimateFovea(odProb, fov);

    % vessels: all scales vs the finest scales only
    vAll = vesselSegmentation(work, struct('visualize', false, 'verbose', false));
    vFine = vesselSegmentation(work, struct('visualize', false, 'verbose', false, 'vesselThicknesses', [2 3], 'threshPercentile', 90));
    allV = vAll.vesselMask & fov;
    fine = vFine.vesselMask & fov & ~imdilate(bwareaopen(allV, 400), strel('disk', 2));   % thin structure not part of the main vessel tree
    skel = bwskel(allV, 'MinBranchLength', 5);
    bp = bwmorph(skel, 'branchpoints'); ep = bwmorph(skel, 'endpoints');

    [H, W] = size(fov);
    [X, Y] = meshgrid(1:W, 1:H);
    dd = L.odDiameter;
    if L.found
        discRegion = hypot(X - L.odCentre(1), Y - L.odCentre(2)) <= 1.5 * dd & fov;       % disc plus about half a disc diameter around it
    else
        discRegion = false(H, W);
    end
    elsewhere = fov & ~discRegion;
    dens = @(m, region) nnz(m & region) / max(nnz(region), 1);

    f.discFound = double(L.found);
    f.vesselDensity = dens(allV, fov);
    f.vesselDensityDisc = dens(allV, discRegion);
    f.fineDensity = dens(fine, fov);
    f.fineDensityDisc = dens(fine, discRegion);
    f.fineDensityElsewhere = dens(fine, elsewhere);
    f.branchDensity = nnz(bp & fov) / max(nnz(skel & fov), 1);
    f.branchDensityDisc = nnz(bp & discRegion) / max(nnz(skel & discRegion), 1);
    f.meanSegmentLength = nnz(skel & fov) / max(nnz((bp | ep) & fov), 1);          % short segments: a tangled network
    f.meanSegmentLengthDisc = nnz(skel & discRegion) / max(nnz((bp | ep) & discRegion), 1);
    % NVE hotspot: fine-vessel density on an 8x8 grid outside the disc region
    grid = zeros(8);
    for a = 1:8
        for c = 1:8
            r = floor((a - 1) * H / 8) + 1:floor(a * H / 8); q = floor((c - 1) * W / 8) + 1:floor(c * W / 8);
            reg = elsewhere(r, q);
            if nnz(reg) > 0.5 * numel(reg), grid(a, c) = nnz(fine(r, q) & reg) / nnz(reg); end
        end
    end
    f.fineHotspot = max(grid(:));
    f.fineHotspotRatio = f.fineHotspot / max(f.fineDensityElsewhere, 1e-4);
    % large haemorrhages (pre-retinal / vitreous haemorrhage proxy)
    cc = regionprops(heMask & fov, 'Area');
    areas = sort([cc.Area], 'descend');
    f.heArea = nnz(heMask & fov) / max(nnz(fov), 1);
    if isempty(areas), f.largestHe = 0; else, f.largestHe = areas(1) / (dd ^ 2 + eps); end   % in disc areas
    maps = struct('fineVessels', fine, 'hotspot', grid, 'discRegion', discRegion);
end

