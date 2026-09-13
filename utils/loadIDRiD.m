function idrid = loadIDRiD(baseDir)
% LOADIDRID  Load all three parts of the IDRiD dataset into one struct.
%
%   idrid = loadIDRiD(baseDir)
%
%   baseDir should be the path to your project's "data" folder, e.g.:
%       idrid = loadIDRiD('C:\Users\ruhan\DiabetesRetina\data');
%
%   Returns a struct "idrid" with three top-level fields:
%       idrid.grading       -> DR severity grading images + labels
%       idrid.localization  -> images + optic disc / fovea coordinates
%       idrid.segmentation  -> images + per-lesion groundtruth mask folders
%
%   NOTE (MATLAB basics, since this is new to you):
%   - fullfile(a,b,c) builds a filepath by joining pieces with the
%     correct slash for your OS -- always use this instead of pasting
%     strings together, so the code also works if you ever run it on
%     Mac/Linux.
%   - A "struct" (idrid.grading.trainImages) is just a container for
%     grouping related variables together, similar to a Python dict/
%     object, accessed with dots instead of ["key"].
%   - imageDatastore() doesn't load every image into memory at once --
%     it just indexes the files on disk. Actual pixel data only loads
%     when you call read() or readimage() on it later. This matters
%     because these folders contain hundreds of multi-megapixel images.

    fprintf('Loading IDRiD dataset from: %s\n', baseDir);

    % ---------------------------------------------------------------
    % PART B: DISEASE GRADING
    % ---------------------------------------------------------------
    gradeRoot = fullfile(baseDir, 'idrid_grading', 'B. Disease Grading', 'B. Disease Grading');

    gradeImgDir   = fullfile(gradeRoot, '1. Original Images');
    gradeLabelDir = fullfile(gradeRoot, '2. Groundtruths');

    idrid.grading.trainImages = imageDatastore(fullfile(gradeImgDir, 'a. Training Set'));
    idrid.grading.testImages  = imageDatastore(fullfile(gradeImgDir, 'b. Testing Set'));

    idrid.grading.trainLabels = readtable(findFile(gradeLabelDir, '*Training*.csv'));
    idrid.grading.testLabels  = readtable(findFile(gradeLabelDir, '*Testing*.csv'));

    fprintf('  Grading: %d train images, %d test images\n', ...
        numel(idrid.grading.trainImages.Files), numel(idrid.grading.testImages.Files));

    % ---------------------------------------------------------------
    % PART C: LOCALIZATION (optic disc + fovea centers)
    % ---------------------------------------------------------------
    locRoot = fullfile(baseDir, 'idrid_localization', 'C. Localization', 'C. Localization');

    locImgDir   = fullfile(locRoot, '1. Original Images');
    locLabelDir = fullfile(locRoot, '2. Groundtruths');

    idrid.localization.trainImages = imageDatastore(fullfile(locImgDir, 'a. Training Set'));
    idrid.localization.testImages  = imageDatastore(fullfile(locImgDir, 'b. Testing Set'));

    odDir     = fullfile(locLabelDir, '1. Optic Disc Center Location');
    foveaDir  = fullfile(locLabelDir, '2. Fovea Center Location');

    idrid.localization.odTrain    = readtable(findFile(odDir, '*Training*.csv'));
    idrid.localization.odTest     = readtable(findFile(odDir, '*Testing*.csv'));
    idrid.localization.foveaTrain = readtable(findFile(foveaDir, '*Training*.csv'));
    idrid.localization.foveaTest  = readtable(findFile(foveaDir, '*Testing*.csv'));

    fprintf('  Localization: %d train images, %d test images\n', ...
        numel(idrid.localization.trainImages.Files), numel(idrid.localization.testImages.Files));

    % ---------------------------------------------------------------
    % PART A: SEGMENTATION (lesion + optic disc masks)
    % ---------------------------------------------------------------
    segRoot = fullfile(baseDir, 'idrid_segmentation', 'A. Segmentation', 'A. Segmentation');

    segImgDir = fullfile(segRoot, '1. Original Images');
    segGtDir  = fullfile(segRoot, '2. All Segmentation Groundtruths');

    idrid.segmentation.trainImages = imageDatastore(fullfile(segImgDir, 'a. Training Set'));
    idrid.segmentation.testImages  = imageDatastore(fullfile(segImgDir, 'b. Testing Set'));

    % Each lesion type has its own subfolder. Not every image has every
    % lesion type present (e.g. not all images show soft exudates), so
    % rather than pre-loading masks here, we just store the folder paths.
    % Stage 2 code will match mask files to images by filename when needed.
    lesionFolders = { ...
        'MA',   '1. Microaneurysms'; ...
        'HE',   '2. Haemorrhages'; ...
        'EX',   '3. Hard Exudates'; ...
        'SE',   '4. Soft Exudates'; ...
        'OD',   '5. Optic Disc' ...
    };

    for i = 1:size(lesionFolders, 1)
        fieldName = lesionFolders{i, 1};
        folderName = lesionFolders{i, 2};

        idrid.segmentation.lesionFolders.(fieldName).train = ...
            fullfile(segGtDir, 'a. Training Set', folderName);
        idrid.segmentation.lesionFolders.(fieldName).test = ...
            fullfile(segGtDir, 'b. Testing Set', folderName);
    end

    fprintf('  Segmentation: %d train images, %d test images (5 lesion types indexed)\n', ...
        numel(idrid.segmentation.trainImages.Files), numel(idrid.segmentation.testImages.Files));

    fprintf('IDRiD loaded successfully.\n');
end


function filePath = findFile(folder, pattern)
% FINDFILE  Locate a single file in "folder" matching wildcard "pattern".
%   Used instead of hardcoding exact filenames, since the official IDRiD
%   filenames vary slightly in spacing/capitalization between releases.
%   Errors out with a helpful message if zero or multiple matches are found,
%   rather than failing later with a cryptic "file not found".

    matches = dir(fullfile(folder, pattern));

    if isempty(matches)
        error('loadIDRiD:fileNotFound', ...
            'No file matching "%s" found in:\n%s', pattern, folder);
    elseif numel(matches) > 1
        error('loadIDRiD:ambiguousFile', ...
            'Multiple files matching "%s" found in:\n%s\nExpected exactly one.', ...
            pattern, folder);
    end

    filePath = fullfile(matches(1).folder, matches(1).name);
end
