%% evalLesionDetection.m
% Scores lesionDetection.m against real IDRiD ground-truth masks
% (Dice + IoU per lesion type).
%
% IMPORTANT: the Segmentation subset (idrid.segmentation, 81 images) and
% the Localization subset (idrid.localization, 413 images) are SEPARATE
% image sets with independent ID numbering (segmentation images are
% typically IDRiD_01..IDRiD_54, localization images are IDRiD_001..
% IDRiD_413 - different photos, not the same images renumbered). This
% script loops over idrid.segmentation directly and pulls each image's
% ID from its own filename, so lookups actually match.

idrid = loadIDRiD('data');

maxImages = 5; % chains OD + vessel + lesion detection, slow on full-res images
segFiles = idrid.segmentation.trainImages.Files;
N = min(numel(segFiles), maxImages);

lesionTypes = {'MA', 'HE', 'EX', 'SE'};
diceScores = struct('MA', [], 'HE', [], 'EX', [], 'SE', []);
iouScores  = struct('MA', [], 'HE', [], 'EX', [], 'SE', []);

for i = 1:N
    imgPath = segFiles{i};
    [~, imgID, ~] = fileparts(imgPath); % ID straight from the segmentation image's own filename

    fprintf('\n=== %s ===\n', imgID);

    fprintf('  running OD localization (no GT available for this image set)...\n');
    odRes = opticDiscLocalization(imgPath, [], struct('visualize', false, 'verbose', false));
    fprintf('  running vessel segmentation (slowest step, be patient)...\n');
    vesRes = vesselSegmentation(imgPath, struct('visualize', false, 'verbose', false));
    fprintf('  running lesion detection...\n');
    lesRes = lesionDetection(imgPath, odRes.pred, 193, vesRes.vesselMask, ...
        struct('visualize', false, 'verbose', false));
    fprintf('  scoring against ground truth...\n');

    predMasks = struct('MA', lesRes.maMask, 'HE', lesRes.heMask, ...
        'EX', lesRes.exMask, 'SE', lesRes.seMask);

    for t = 1:numel(lesionTypes)
        type = lesionTypes{t};
        folder = idrid.segmentation.lesionFolders.(type).train;
        gtFile = findGTFile(folder, imgID);

        if isempty(gtFile)
            fprintf('  %s: no GT mask for this image (lesion type absent) - skipped\n', type);
            continue;
        end

        gtMask = imread(gtFile);
        if size(gtMask, 3) > 1
            gtMask = gtMask(:,:,1);
        end
        gtMask = gtMask > 0;

        predMask = predMasks.(type);
        if ~isequal(size(gtMask), size(predMask))
            gtMask = imresize(gtMask, size(predMask), 'nearest');
        end

        intersection = nnz(gtMask & predMask);
        union = nnz(gtMask | predMask);
        gtArea = nnz(gtMask);
        predArea = nnz(predMask);

        dice = 2*intersection / max(gtArea + predArea, 1);
        iou = intersection / max(union, 1);

        diceScores.(type)(end+1) = dice;
        iouScores.(type)(end+1) = iou;

        fprintf('  %s: GT area=%d, pred area=%d, Dice=%.4f, IoU=%.4f\n', ...
            type, gtArea, predArea, dice, iou);
    end
end

fprintf('\n--- Summary (n=%d images) ---\n', N);
for t = 1:numel(lesionTypes)
    type = lesionTypes{t};
    d = diceScores.(type);
    if isempty(d)
        fprintf('%s: no ground truth instances found in this sample\n', type);
    else
        fprintf('%s: mean Dice=%.4f (n=%d instances), mean IoU=%.4f\n', ...
            type, mean(d), numel(d), mean(iouScores.(type)));
    end
end

function gtFile = findGTFile(folder, imgID)
    gtFile = '';
    d = dir(fullfile(folder, [imgID '*']));
    if ~isempty(d)
        gtFile = fullfile(folder, d(1).name);
    end
end
