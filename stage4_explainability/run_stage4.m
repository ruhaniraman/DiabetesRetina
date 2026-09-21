function summaryTable = run_stage4(inputPath, outputDir)
% RUN_STAGE4  Entry point for Stage 4 (Explainability & Reporting).
%
%   summaryTable = run_stage4(inputPath)
%   summaryTable = run_stage4(inputPath, outputDir)
%
%   INPUTS:
%     inputPath - EITHER a path to a single image file (.jpg/.png),
%                 OR a path to a folder containing images. Folders are
%                 scanned recursively, so a folder of class subfolders
%                 (Mild/, Moderate/, etc., like your APTOS structure)
%                 works directly -- every image inside is processed.
%     outputDir - (optional) where to save PDF reports and the summary
%                 CSV. Defaults to 'stage4_explainability/results'.
%
%   OUTPUT:
%     summaryTable - a MATLAB table with one row per image, containing:
%                     ImageName, PredictedGrade, Confidence,
%                     ReferableProb, IsReferable, ReportPath
%                     (This is also written to disk as summary.csv --
%                     this is the file Stage 6 should read to build a
%                     dashboard, rather than opening individual PDFs.)
%
%   USAGE EXAMPLES:
%     run_stage4('data/aptos2019/colored_images/Severe/0c917c372572.png');
%     run_stage4('data/aptos2019/colored_images/Severe');
%     run_stage4('data/aptos2019/colored_images');   % all 5 class folders

addpath(fileparts(mfilename('fullpath'))); setupStage4Paths();   % works from any current folder

if nargin < 2 || isempty(outputDir)
    outputDir = fullfile(projectRoot(), 'stage4_explainability', 'results');
end
if ~exist(outputDir, 'dir')
    mkdir(outputDir);
end

% ---- Load model ONCE, regardless of how many images follow ----
fprintf('Loading Stage 3 model...\n');
S = load(fullfile(projectRoot(), 'stage_3', 'Stage3_Final_HighSensitivity_Model.mat'));
net = S.trainedNetWeighted;
bestThreshold = S.stage3Results.threshold;
classNames = net.Layers(end).Classes;
fprintf('Model loaded. Threshold: %.2f\n\n', bestThreshold);

% ---- Resolve inputPath to a list of image files ----
validExts = {'.jpg', '.jpeg', '.png'};
if isfolder(inputPath)
    allFiles = dir(fullfile(inputPath, '**', '*.*'));
    allFiles = allFiles(~[allFiles.isdir]);
    [~, ~, exts] = cellfun(@fileparts, {allFiles.name}, 'UniformOutput', false);
    keep = ismember(lower(exts), validExts);
    allFiles = allFiles(keep);
    imagePaths = fullfile({allFiles.folder}, {allFiles.name});
    fprintf('Found %d image(s) in folder: %s\n\n', numel(imagePaths), inputPath);
elseif isfile(inputPath)
    imagePaths = {inputPath};
else
    error('run_stage4:invalidInput', ...
        'inputPath is neither a valid file nor a folder: %s', inputPath);
end

if isempty(imagePaths)
    warning('run_stage4:noImages', 'No images found at: %s', inputPath);
    summaryTable = table();
    return;
end

% ---- Preallocate summary fields ----
n = numel(imagePaths);
imageNames    = cell(n, 1);
predictedGrades = cell(n, 1);
confidences   = zeros(n, 1);
referableProbs = zeros(n, 1);
isReferableArr = false(n, 1);
reportPaths   = cell(n, 1);
failedFlags   = false(n, 1);

% ---- Main loop ----
for i = 1:n
    imgPath = imagePaths{i};
    [~, imgName, imgExt] = fileparts(imgPath);
    fprintf('[%d/%d] %s%s ... ', i, n, imgName, imgExt);

    try
        result = predictWithThreshold(net, imgPath, bestThreshold, classNames);
        [~, predictedClassIdx] = max(result.probs);
        [~, overlayImg] = generateGradCAM(net, result.preprocessedImage, ...
            predictedClassIdx, classNames);
        reportText = formatReportText(result);
        outputPaths = createMedicalReport(imgPath, result, [], overlayImg, ...
            reportText, outputDir);

        imageNames{i}      = [imgName imgExt];
        predictedGrades{i} = char(result.predictedGrade);
        confidences(i)     = result.confidence;
        referableProbs(i)  = result.referableProb;
        isReferableArr(i)  = result.isReferable;
        reportPaths{i}     = outputPaths.pdf;

        fprintf('%s (%.1f%%) -> %s\n', predictedGrades{i}, confidences(i)*100, ...
            ternary(isReferableArr(i), 'REFERRAL', 'routine'));

    catch ME
        % A single bad/corrupt image should NOT crash the whole
        % batch run. Log it, mark it, and keep going.
        warning('run_stage4:imageFailed', 'Failed on %s: %s', imgPath, ME.message);
        imageNames{i}      = [imgName imgExt];
        predictedGrades{i} = 'ERROR';
        confidences(i)     = NaN;
        referableProbs(i)  = NaN;
        isReferableArr(i)  = false;
        reportPaths{i}     = '';
        failedFlags(i)     = true;
        fprintf('FAILED (%s)\n', ME.message);
    end
end

% ---- Build summary table ----
summaryTable = table(imageNames, predictedGrades, confidences, ...
    referableProbs, isReferableArr, reportPaths, failedFlags, ...
    'VariableNames', {'ImageName', 'PredictedGrade', 'Confidence', ...
    'ReferableProb', 'IsReferable', 'ReportPath', 'Failed'});

csvPath = fullfile(outputDir, 'summary.csv');
writetable(summaryTable, csvPath);

% ---- Final summary printout ----
numFailed = sum(failedFlags);
numReferable = sum(isReferableArr & ~failedFlags);
numOk = n - numFailed;

fprintf('\n=== Stage 4 Batch Complete ===\n');
fprintf('Processed: %d/%d images successfully\n', numOk, n);
if numFailed > 0
    fprintf('Failed:    %d (see warnings above)\n', numFailed);
end
fprintf('Flagged for referral: %d/%d\n', numReferable, numOk);
fprintf('Summary CSV: %s\n', csvPath);
fprintf('Reports:     %s\n', outputDir);

end


function out = ternary(cond, a, b)
if cond
    out = a;
else
    out = b;
end
end