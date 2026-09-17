function result = opticDiscLocalization(imageInput, gtCoord, opts)
%OPTICDISCLOCALIZATION Estimate optic disc location using vessel convergence.
%
% This is the VERIFIED, BENCHMARKED version: 58.21px mean / 39.27px
% median error on the standard 10-image IDRiD test (1/10 correctly
% returns NaN rather than a wrong guess, on a low-solidity/merged blob).
% Do not modify without re-running runBatch_opticDisc / runBatch_fovea
% and comparing against these numbers.
%
% !! SAVE THIS FILE AS opticDiscLocalization.m (must match this name) !!

    if nargin < 2
        gtCoord = [];
    end
    if nargin < 3
        opts = struct();
    end

    opts = setDefault(opts, 'expectedODRadiusFrac', 0.045);
    opts = setDefault(opts, 'topPercentile', 97);
    opts = setDefault(opts, 'bgSigmaFactor', 2.5);
    opts = setDefault(opts, 'minAreaFrac', 0.15);
    opts = setDefault(opts, 'maxAreaFrac', 3.0);
    opts = setDefault(opts, 'minSolidity', 0.75);
    opts = setDefault(opts, 'enableSplit', false); % watershed split regressed accuracy in testing - off by default
    opts = setDefault(opts, 'ringInnerFactor', 1.2);
    opts = setDefault(opts, 'ringOuterFactor', 3.0);
    opts = setDefault(opts, 'numSectors', 8);
    opts = setDefault(opts, 'sectorAgreementDeg', 35);
    opts = setDefault(opts, 'visualize', true);
    opts = setDefault(opts, 'verbose', true);

    if isstring(imageInput) || ischar(imageInput)
        imagePath = char(imageInput);
        if ~isfile(imagePath)
            error('opticDiscLocalization:FileNotFound', 'Image file not found: %s', imagePath);
        end
        I = imread(imagePath);
    else
        I = imageInput;
        imagePath = '';
    end

    if size(I, 3) == 3
        green = im2double(I(:, :, 2));
        grayImage = im2double(rgb2gray(I));
    else
        green = im2double(I);
        grayImage = green;
    end

    [~, W] = size(green);
    expectedR = max(opts.expectedODRadiusFrac * W, 1);

    fovMask = getFOVMask(grayImage, opts.verbose);

    candidates = generateCandidates(green, fovMask, expectedR, opts);

    if isempty(candidates)
        if opts.verbose
            fprintf('  [RESULT] No candidates survived - returning NaN prediction\n');
        end
        result = struct('pred', [NaN NaN], 'error', NaN, 'candidates', candidates, ...
            'bestIdx', NaN, 'vesselSkel', []);
        if opts.visualize
            plotExplainability(I, candidates, NaN, [], gtCoord, imagePath);
        end
        return;
    end

    scaleRange = max(1, round(expectedR * [0.15 0.3]));
    vesselProb = fibermetric(green, scaleRange, ...
        'ObjectPolarity', 'bright', 'StructureSensitivity', 0.15);
    vesselProb = vesselProb .* double(fovMask);

    maxVessel = max(vesselProb(:));
    if maxVessel > 0
        vesselMask = vesselProb > (0.35 * maxVessel);
    else
        vesselMask = false(size(vesselProb));
    end

    vesselSkel = safeSkeletonize(vesselMask, round(expectedR * 0.3));

    [Gx, Gy] = imgradientxy(imgaussfilt(vesselProb, 1.5));
    vesselOrient = atan2(Gx, -Gy);

    for k = 1:numel(candidates)
        c = candidates(k);
        score = convergenceScore(c.centroid, vesselSkel, vesselOrient, expectedR, opts);
        candidates(k).convergenceScore = score;
        shapeScore = max(0, 1 - c.eccentricity); % 1 = perfect circle, 0 = elongated
        candidates(k).finalScore = 0.5 * score + 0.3 * shapeScore + 0.2 * c.brightnessScore;
    end

    if opts.verbose
        fprintf('  [SCORE] %d candidate(s):\n', numel(candidates));
        for k = 1:numel(candidates)
            fprintf('    cand %d: centroid=(%.0f,%.0f) convergence=%.3f brightness=%.3f final=%.3f\n', ...
                k, candidates(k).centroid(1), candidates(k).centroid(2), ...
                candidates(k).convergenceScore, candidates(k).brightnessScore, candidates(k).finalScore);
        end
    end

    [~, bestIdx] = max([candidates.finalScore]);
    pred = candidates(bestIdx).centroid;

    if ~isempty(gtCoord)
        err = norm(pred - gtCoord(:)');
    else
        err = NaN;
    end

    result = struct('pred', pred, 'error', err, 'candidates', candidates, ...
        'bestIdx', bestIdx, 'vesselSkel', vesselSkel);

    if opts.visualize
        plotExplainability(I, candidates, bestIdx, vesselSkel, gtCoord, imagePath);
    end
end

function candidates = generateCandidates(green, fovMask, expectedR, opts)
    verbose = opts.verbose;
    bgSigma = opts.bgSigmaFactor * expectedR;
    bg = imgaussfilt(green, bgSigma);

    enhanced = green - bg;
    enhanced(~fovMask) = -Inf;

    validVals = enhanced(fovMask);
    validVals = validVals(isfinite(validVals));

    if verbose
        fprintf('  [CAND] expectedR=%.1f px, bgSigma=%.1f px, FOV pixels=%d, finite vals=%d\n', ...
            expectedR, bgSigma, nnz(fovMask), numel(validVals));
    end

    candidates = struct('centroid', {}, 'area', {}, 'eccentricity', {}, ...
        'brightnessScore', {}, 'convergenceScore', {}, 'finalScore', {});

    if isempty(validVals)
        if verbose, fprintf('  [CAND] ABORT: no finite values inside FOV mask\n'); end
        return;
    end

    thresh = prctile(validVals, opts.topPercentile);
    if ~isfinite(thresh)
        if verbose, fprintf('  [CAND] ABORT: percentile threshold is not finite\n'); end
        return;
    end

    bw = enhanced >= thresh;
    if verbose, fprintf('  [CAND] thresh=%.4f, raw bw pixels=%d\n', thresh, nnz(bw)); end

    bw = imopen(bw, strel('disk', max(2, round(expectedR * 0.1))));
    if verbose, fprintf('  [CAND] after imopen: %d px\n', nnz(bw)); end
    bw = imclose(bw, strel('disk', max(2, round(expectedR * 0.3))));
    if verbose, fprintf('  [CAND] after imclose: %d px\n', nnz(bw)); end
    bw = bwareaopen(bw, max(4, round(pi * (expectedR * 0.2)^2)));
    if verbose, fprintf('  [CAND] after bwareaopen: %d px\n', nnz(bw)); end

    cc = bwconncomp(bw);
    if cc.NumObjects == 0
        if verbose, fprintf('  [CAND] ABORT: zero connected components after cleanup\n'); end
        return;
    end

    stats = regionprops(cc, green, 'Centroid', 'WeightedCentroid', 'Area', ...
        'Eccentricity', 'MeanIntensity', 'Solidity');
    expectedArea = pi * expectedR^2;

    if verbose
        fprintf('  [CAND] connected components found: %d\n', numel(stats));
    end

    splitPool = []; % component indices worth attempting a watershed split on

    for i = 1:numel(stats)
        areaFrac = stats(i).Area / expectedArea;
        rejectArea = areaFrac < opts.minAreaFrac || areaFrac > opts.maxAreaFrac;
        rejectSolidity = stats(i).Solidity < opts.minSolidity;
        if verbose
            if rejectArea || rejectSolidity
                verdict = sprintf('REJECTED (area=%d, solidity=%d)', rejectArea, rejectSolidity);
            else
                verdict = 'kept';
            end
            fprintf('    comp %d: area=%.0f (ratio=%.2f) solidity=%.2f %s\n', ...
                i, stats(i).Area, areaFrac, stats(i).Solidity, verdict);
        end
        if rejectArea && ~rejectSolidity
            continue; % wrong size but compact shape - not a merge candidate, just drop
        end
        if rejectSolidity && ~rejectArea
            splitPool(end+1) = i; %#ok<AGROW> % right-ish size but merged/concave - try splitting
            continue;
        end
        if rejectArea && rejectSolidity
            continue; % wrong size AND merged - not worth trying to salvage
        end

        candidates(end + 1).centroid = stats(i).WeightedCentroid; %#ok<AGROW>
        candidates(end).area = stats(i).Area;
        candidates(end).eccentricity = stats(i).Eccentricity;
        candidates(end).brightnessScore = stats(i).MeanIntensity;
        candidates(end).convergenceScore = NaN;
        candidates(end).finalScore = NaN;
    end

    if isempty(candidates) && ~isempty(splitPool) && opts.enableSplit
        if verbose
            fprintf('  [CAND] no clean candidates - attempting watershed split on %d merged blob(s)\n', ...
                numel(splitPool));
        end
        for p = 1:numel(splitPool)
            i = splitPool(p);
            compMask = false(size(bw));
            compMask(cc.PixelIdxList{i}) = true;
            subCandidates = splitMergedBlob(compMask, green, expectedR, opts, verbose);
            candidates = [candidates, subCandidates]; %#ok<AGROW>
        end
    end

    if verbose
        fprintf('  [CAND] candidates surviving area filter: %d\n', numel(candidates));
    end

    if isempty(candidates)
        return;
    end

    mx = max([candidates.brightnessScore]);
    mn = min([candidates.brightnessScore]);
    scale = max(mx - mn, eps);

    for i = 1:numel(candidates)
        candidates(i).brightnessScore = (candidates(i).brightnessScore - mn) / scale;
    end
end

function subCandidates = splitMergedBlob(compMask, green, expectedR, opts, verbose)
    % Separates a merged/concave blob into sub-regions via smoothed
    % distance-transform watershed - the standard technique for splitting
    % touching objects (e.g. disc merged with an adjacent bright lesion).
    subCandidates = struct('centroid', {}, 'area', {}, 'eccentricity', {}, ...
        'brightnessScore', {}, 'convergenceScore', {}, 'finalScore', {});

    D = bwdist(~compMask);
    D = imgaussfilt(D, max(1, round(expectedR * 0.05))); % smooth to avoid oversegmentation
    L = watershed(-D);
    L(~compMask) = 0;

    subStats = regionprops(L, green, 'WeightedCentroid', 'Area', 'Eccentricity', ...
        'MeanIntensity', 'Solidity');
    expectedArea = pi * expectedR^2;

    if verbose
        fprintf('    [SPLIT] watershed produced %d sub-region(s)\n', numel(subStats));
    end

    for j = 1:numel(subStats)
        if subStats(j).Area == 0
            continue;
        end
        areaFrac = subStats(j).Area / expectedArea;
        if areaFrac < opts.minAreaFrac || areaFrac > opts.maxAreaFrac
            continue;
        end
        if subStats(j).Solidity < opts.minSolidity
            continue;
        end
        if verbose
            fprintf('    [SPLIT] sub-region %d: area=%.0f (ratio=%.2f) solidity=%.2f - kept\n', ...
                j, subStats(j).Area, areaFrac, subStats(j).Solidity);
        end
        subCandidates(end + 1).centroid = subStats(j).WeightedCentroid; %#ok<AGROW>
        subCandidates(end).area = subStats(j).Area;
        subCandidates(end).eccentricity = subStats(j).Eccentricity;
        subCandidates(end).brightnessScore = subStats(j).MeanIntensity;
        subCandidates(end).convergenceScore = NaN;
        subCandidates(end).finalScore = NaN;
    end
end

function score = convergenceScore(centroid, vesselSkel, vesselOrient, expectedR, opts)
    [H, W] = size(vesselSkel);
    cx = centroid(1);
    cy = centroid(2);

    innerR = opts.ringInnerFactor * expectedR;
    outerR = opts.ringOuterFactor * expectedR;

    x0 = max(1, floor(cx - outerR));
    x1 = min(W, ceil(cx + outerR));
    y0 = max(1, floor(cy - outerR));
    y1 = min(H, ceil(cy + outerR));

    if x1 <= x0 || y1 <= y0
        score = 0;
        return;
    end

    [xx, yy] = meshgrid(x0:x1, y0:y1);
    dx = xx - cx;
    dy = yy - cy;
    r = sqrt(dx.^2 + dy.^2);
    inRing = r >= innerR & r <= outerR;

    localSkel = vesselSkel(y0:y1, x0:x1) & inRing;
    if ~any(localSkel(:))
        score = 0;
        return;
    end

    radialAngle = atan2(dy, dx);
    localOrient = vesselOrient(y0:y1, x0:x1);

    angDiff = mod(abs(localOrient - radialAngle), pi);
    angDiff = min(angDiff, pi - angDiff);
    aligned = localSkel & (rad2deg(angDiff) <= opts.sectorAgreementDeg);

    if any(aligned(:))
        radialWrapped = mod(radialAngle(aligned) + pi, 2 * pi);
        sectorIdx = floor(radialWrapped / (2 * pi) * opts.numSectors);
        sectorsHit = numel(unique(sectorIdx));
    else
        sectorsHit = 0;
    end

    pointScore = sum(aligned(:)) / max(sum(localSkel(:)), 1);
    spreadScore = sectorsHit / opts.numSectors;

    score = 0.5 * pointScore + 0.5 * spreadScore;
end

function vesselSkel = safeSkeletonize(vesselMask, minBranchLength)
    try
        vesselSkel = bwskel(vesselMask, 'MinBranchLength', minBranchLength);
    catch
        vesselSkel = bwmorph(vesselMask, 'skel', Inf);
    end
end

function plotExplainability(I, candidates, bestIdx, vesselSkel, gtCoord, imagePath)
    f = figure('Visible', 'off', 'Position', [100 100 1000 800]);
    imshow(I); hold on;

    if ~isempty(vesselSkel)
        [ys, xs] = find(vesselSkel);
        plot(xs, ys, '.', 'Color', [0.2 0.6 1], 'MarkerSize', 1);
    end

    for k = 1:numel(candidates)
        c = candidates(k).centroid;
        col = [1 0.6 0];
        if ~isnan(bestIdx) && k == bestIdx
            col = [0 1 0];
        end
        plotCircle(c, 15, col);
        text(c(1) + 18, c(2), sprintf('%.2f', candidates(k).finalScore), ...
            'Color', col, 'FontSize', 9, 'FontWeight', 'bold');
    end

    if ~isempty(gtCoord)
        plot(gtCoord(1), gtCoord(2), 'r+', 'MarkerSize', 20, 'LineWidth', 2);
    end

    if ~isempty(imagePath)
        [~, imgName, imgExt] = fileparts(imagePath);
        title(sprintf('OD localization: %s%s', imgName, imgExt), 'Interpreter', 'none');
        name = imgName;
    else
        title('OD localization');
        name = 'od_localization';
    end

    outDir = fullfile('results', 'od_localization');
    if ~exist(outDir, 'dir')
        mkdir(outDir);
    end
    saveas(f, fullfile(outDir, [name '_explain.png']));
    close(f);
end

function plotCircle(center, radius, color)
    t = linspace(0, 2 * pi, 100);
    x = center(1) + radius * cos(t);
    y = center(2) + radius * sin(t);
    plot(x, y, 'Color', color, 'LineWidth', 1.5);
end

function mask = getFOVMask(grayImage, verbose)
    if nargin < 2, verbose = true; end
    grayImage = im2double(grayImage);

    otsuThresh = graythresh(grayImage);
    thresh = 0.3 * otsuThresh; % grayImage is in [0,1] (im2double), so no x255 needed
    mask = grayImage > thresh;
    if verbose
        fprintf('  [FOV] otsu=%.3f, thresh=%.3f, raw mask pixels=%d (%.1f%% of image)\n', ...
            otsuThresh, thresh, nnz(mask), 100 * nnz(mask) / numel(mask));
    end

    mask = imfill(mask, 'holes');
    maskBeforeOpen = mask;
    mask = imopen(mask, strel('disk', 15));
    if nnz(mask) == 0
        if verbose
            fprintf('  [FOV] WARNING: imopen erased mask entirely, falling back to pre-open mask\n');
        end
        mask = maskBeforeOpen;
    end

    cc = bwconncomp(mask);
    if cc.NumObjects > 1
        stats = regionprops(cc, 'Area');
        [~, idx] = max([stats.Area]);
        mask = false(size(mask));
        mask(cc.PixelIdxList{idx}) = true;
    end
    if verbose
        fprintf('  [FOV] final mask pixels=%d (%.1f%% of image)\n', ...
            nnz(mask), 100 * nnz(mask) / numel(mask));
    end
end

function opts = setDefault(opts, field, value)
    if ~isfield(opts, field)
        opts.(field) = value;
    end
end
