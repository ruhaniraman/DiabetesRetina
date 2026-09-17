%% diagnoseMA.m
% Checks what fraction of true MA ground-truth pixels fall inside the
% region excluded by vesselMask, for one image.

idrid = loadIDRiD('data');

segFiles = idrid.segmentation.trainImages.Files;
imgPath = segFiles{1};
[~, imgID, ~] = fileparts(imgPath);
fprintf('Testing on %s\n', imgID);

odRes = opticDiscLocalization(imgPath, [], struct('visualize', false, 'verbose', false));
vesRes = vesselSegmentation(imgPath, struct('visualize', false, 'verbose', false));
lesRes = lesionDetection(imgPath, odRes.pred, 193, vesRes.vesselMask, ...
    struct('visualize', false, 'verbose', false));

folder = idrid.segmentation.lesionFolders.MA.train;
d = dir(fullfile(folder, [imgID '*']));

if isempty(d)
    error('No MA ground-truth file found for %s in %s', imgID, folder);
end

gtFile = fullfile(folder, d(1).name);
fprintf('GT file: %s\n', gtFile);

gtMA = imread(gtFile);
if size(gtMA, 3) > 1
    gtMA = gtMA(:,:,1);
end
gtMA = gtMA > 0;

if ~isequal(size(gtMA), size(lesRes.vesselMask))
    gtMA = imresize(gtMA, size(lesRes.vesselMask), 'nearest');
end

pctExcluded = 100 * nnz(gtMA & lesRes.vesselMask) / nnz(gtMA);
fprintf('GT MA pixels inside vessel mask (excluded from search): %.1f%%\n', pctExcluded);

pctOutsideValid = 100 * nnz(gtMA & ~lesRes.nonVesselMask) / nnz(gtMA);
fprintf('GT MA pixels outside nonVesselMask entirely (excluded by OD/FOV too): %.1f%%\n', pctOutsideValid);