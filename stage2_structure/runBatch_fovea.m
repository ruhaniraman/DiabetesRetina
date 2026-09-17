%% runBatch_fovea.m
% Compares OD localization using two candidate thresholds:
%   99th percentile = current baseline
%   97th percentile = test
%
% Runs both on the same first N training images.

idrid = loadIDRiD('data');

maxImages = 10;
N = min(height(idrid.localization.odTrain), maxImages);

odFiles   = idrid.localization.trainImages.Files;
odTbl     = idrid.localization.odTrain;
foveaTbl  = idrid.localization.foveaTrain;

%% =========================================================
% TEST 1: 99th percentile
% =========================================================

fprintf('\n========================================\n');
fprintf('TEST 1: topPercentile = 99\n');
fprintf('========================================\n\n');

odErrors99 = nan(N,1);
foveaErrors99 = nan(N,1);

odOpts99 = struct( ...
    'visualize', false, ...
    'verbose', false, ...
    'topPercentile', 99);

for i = 1:N

    imgID = odTbl.ImageNo{i};

    odGT = [ ...
        odTbl.X_Coordinate(i), ...
        odTbl.Y_Coordinate(i)];

    foveaGT = [ ...
        foveaTbl.X_Coordinate(i), ...
        foveaTbl.Y_Coordinate(i)];

    matchIdx = find(contains(odFiles, imgID), 1);

    if isempty(matchIdx)

        fprintf('%3d/%3d  %-15s  NO MATCHING FILE - skipped\n', ...
            i, N, imgID);

        continue;
    end

    imgPath = odFiles{matchIdx};

    odRes = opticDiscLocalization( ...
        imgPath, odGT, odOpts99);

    odErrors99(i) = odRes.error;

    foveaRes = fovealLocalization( ...
        imgPath, ...
        odRes.pred, ...
        foveaGT, ...
        struct('verbose', false));

    foveaErrors99(i) = foveaRes.error;

    fprintf('%3d/%3d  %-15s  OD err=%8.2f px   Fovea err=%8.2f px\n', ...
        i, N, imgID, ...
        odRes.error, ...
        foveaRes.error);

end

fprintf('\n--- 99th Percentile OD Summary ---\n');

fprintf('Mean:   %.2f px\n', mean(odErrors99,'omitnan'));
fprintf('Median: %.2f px\n', median(odErrors99,'omitnan'));
fprintf('Max:    %.2f px\n', max(odErrors99));
fprintf('Failed: %d\n', sum(isnan(odErrors99)));

fprintf('\n--- 99th Percentile Fovea Summary ---\n');

fprintf('Mean:   %.2f px\n', mean(foveaErrors99,'omitnan'));
fprintf('Median: %.2f px\n', median(foveaErrors99,'omitnan'));
fprintf('Max:    %.2f px\n', max(foveaErrors99));
fprintf('Failed: %d\n', sum(isnan(foveaErrors99)));


%% =========================================================
% TEST 2: 97th percentile
% =========================================================

fprintf('\n========================================\n');
fprintf('TEST 2: topPercentile = 97\n');
fprintf('========================================\n\n');

odErrors97 = nan(N,1);
foveaErrors97 = nan(N,1);

odOpts97 = struct( ...
    'visualize', false, ...
    'verbose', false, ...
    'topPercentile', 97);

for i = 1:N

    imgID = odTbl.ImageNo{i};

    odGT = [ ...
        odTbl.X_Coordinate(i), ...
        odTbl.Y_Coordinate(i)];

    foveaGT = [ ...
        foveaTbl.X_Coordinate(i), ...
        foveaTbl.Y_Coordinate(i)];

    matchIdx = find(contains(odFiles, imgID), 1);

    if isempty(matchIdx)

        fprintf('%3d/%3d  %-15s  NO MATCHING FILE - skipped\n', ...
            i, N, imgID);

        continue;
    end

    imgPath = odFiles{matchIdx};

    odRes = opticDiscLocalization( ...
        imgPath, odGT, odOpts97);

    odErrors97(i) = odRes.error;

    foveaRes = fovealLocalization( ...
        imgPath, ...
        odRes.pred, ...
        foveaGT, ...
        struct('verbose', false));

    foveaErrors97(i) = foveaRes.error;

    fprintf('%3d/%3d  %-15s  OD err=%8.2f px   Fovea err=%8.2f px\n', ...
        i, N, imgID, ...
        odRes.error, ...
        foveaRes.error);

end

fprintf('\n--- 97th Percentile OD Summary ---\n');

fprintf('Mean:   %.2f px\n', mean(odErrors97,'omitnan'));
fprintf('Median: %.2f px\n', median(odErrors97,'omitnan'));
fprintf('Max:    %.2f px\n', max(odErrors97));
fprintf('Failed: %d\n', sum(isnan(odErrors97)));

fprintf('\n--- 97th Percentile Fovea Summary ---\n');

fprintf('Mean:   %.2f px\n', mean(foveaErrors97,'omitnan'));
fprintf('Median: %.2f px\n', median(foveaErrors97,'omitnan'));
fprintf('Max:    %.2f px\n', max(foveaErrors97));
fprintf('Failed: %d\n', sum(isnan(foveaErrors97)));


%% =========================================================
% DIRECT COMPARISON
% =========================================================

fprintf('\n========================================\n');
fprintf('FINAL COMPARISON\n');
fprintf('========================================\n\n');

fprintf('                 99th       97th\n');
fprintf('----------------------------------------\n');

fprintf('OD Mean:       %8.2f   %8.2f px\n', ...
    mean(odErrors99,'omitnan'), ...
    mean(odErrors97,'omitnan'));

fprintf('OD Median:     %8.2f   %8.2f px\n', ...
    median(odErrors99,'omitnan'), ...
    median(odErrors97,'omitnan'));

fprintf('OD Max:        %8.2f   %8.2f px\n', ...
    max(odErrors99), ...
    max(odErrors97));

fprintf('OD Failed:     %8d   %8d\n', ...
    sum(isnan(odErrors99)), ...
    sum(isnan(odErrors97)));

fprintf('\n');

fprintf('Fovea Mean:    %8.2f   %8.2f px\n', ...
    mean(foveaErrors99,'omitnan'), ...
    mean(foveaErrors97,'omitnan'));

fprintf('Fovea Median:  %8.2f   %8.2f px\n', ...
    median(foveaErrors99,'omitnan'), ...
    median(foveaErrors97,'omitnan'));

fprintf('Fovea Max:     %8.2f   %8.2f px\n', ...
    max(foveaErrors99), ...
    max(foveaErrors97));

fprintf('Fovea Failed:  %8d   %8d\n', ...
    sum(isnan(foveaErrors99)), ...
    sum(isnan(foveaErrors97)));

fprintf('\n========================================\n');