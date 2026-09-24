%% visualizeMA.m
idrid = loadIDRiD('data');
segFiles = idrid.segmentation.trainImages.Files;
imgPath = segFiles{1};
[~, imgID, ~] = fileparts(imgPath);

odRes = opticDiscLocalization(imgPath, [], struct('visualize', false, 'verbose', false));
vesRes = vesselSegmentation(imgPath, struct('visualize', false, 'verbose', false));
lesRes = lesionDetection(imgPath, odRes.pred, 193, vesRes.vesselMask, ...
    struct('visualize', false, 'verbose', false));

folder = idrid.segmentation.lesionFolders.MA.train;
d = dir(fullfile(folder, [imgID '*']));
gtMA = imread(fullfile(folder, d(1).name));
if size(gtMA,3) > 1, gtMA = gtMA(:,:,1); end
gtMA = gtMA > 0;
if ~isequal(size(gtMA), size(lesRes.maMask))
    gtMA = imresize(gtMA, size(lesRes.maMask), 'nearest');
end

f = figure('Position', [100 100 1200 900]);
I = imread(imgPath);
imshow(I); hold on;
overlay = zeros([size(gtMA) 3]);
overlay(:,:,2) = gtMA;              % GT = green
overlay(:,:,1) = lesRes.maMask;     % predicted = red
h = imshow(overlay);
set(h, 'AlphaData', 0.6 * any(overlay,3));
title('GT MA (green) vs Predicted MA (red) - yellow = overlap');
maOut = fullfile(fileparts(mfilename('fullpath')), 'results', 'microaneurysms');   % fixed folder, whatever the current one is
if ~exist(maOut, 'dir'), mkdir(maOut); end
saveas(f, fullfile(maOut, 'ma_diagnostic_overlay.png'));
fprintf('Saved ma_diagnostic_overlay.png\n');

%% Isolated mask views - run after the overlay section above
f2 = figure('Position', [100 100 1400 700]);

subplot(1,2,1);
imshow(lesRes.maMask);
title(sprintf('Predicted MA mask only (%d px, %d components)', ...
    nnz(lesRes.maMask), bwconncomp(lesRes.maMask).NumObjects));

subplot(1,2,2);
imshow(gtMA);
title(sprintf('Ground truth MA mask only (%d px)', nnz(gtMA)));

saveas(f2, fullfile(maOut, 'ma_masks_isolated.png'));
fprintf('Saved ma_masks_isolated.png\n');