function idrid = loadIDRiD(baseDir)
%LOADIDRID Load the IDRiD dataset into one struct.

    if nargin < 1 || isempty(baseDir)
        baseDir = fullfile(fileparts(mfilename('fullpath')), '..', 'data');
    end

    baseDir = char(baseDir);

    if ~isfolder(baseDir)
        altDir = fullfile(fileparts(mfilename('fullpath')), '..', baseDir);
        if isfolder(altDir)
            baseDir = altDir;
        end
    end

    if ~isfolder(baseDir)
        error('loadIDRiD:BaseDirNotFound', ...
            'Base data folder not found: %s', baseDir);
    end

    fprintf('Loading IDRiD dataset from: %s\n', baseDir);

    % ---------------------------------------------------------------
    % PART B: DISEASE GRADING
    % ---------------------------------------------------------------
    gradeRoot = firstExistingFolder(baseDir, { ...
        fullfile('idrid_grading', 'B. Disease Grading', 'B. Disease Grading'), ...
        fullfile('idrid_grading', 'B. Disease Grading') ...
    });

    gradeImgDir = fullfile(gradeRoot, '1. Original Images');
    gradeLabelDir = fullfile(gradeRoot, '2. Groundtruths');

    idrid.grading.trainImages = imageDatastore(requireFolder(fullfile(gradeImgDir, 'a. Training Set')));
    idrid.grading.testImages  = imageDatastore(requireFolder(fullfile(gradeImgDir, 'b. Testing Set')));

    idrid.grading.trainLabels = readtable(findFile(gradeLabelDir, '*Training*.csv'));
    idrid.grading.testLabels   = readtable(findFile(gradeLabelDir, '*Testing*.csv'));

    fprintf('  Grading: %d train images, %d test images\n', ...
        numel(idrid.grading.trainImages.Files), numel(idrid.grading.testImages.Files));

    % ---------------------------------------------------------------
    % PART C: LOCALIZATION
    % ---------------------------------------------------------------
    locRoot = firstExistingFolder(baseDir, { ...
        fullfile('idrid_localization', 'C. Localization', 'C. Localization'), ...
        fullfile('idrid_localization', 'C. Localization') ...
    });

    locImgDir = fullfile(locRoot, '1. Original Images');
    locLabelDir = fullfile(locRoot, '2. Groundtruths');

    idrid.localization.trainImages = imageDatastore(requireFolder(fullfile(locImgDir, 'a. Training Set')));
    idrid.localization.testImages  = imageDatastore(requireFolder(fullfile(locImgDir, 'b. Testing Set')));

    odDir    = fullfile(locLabelDir, '1. Optic Disc Center Location');
    foveaDir = fullfile(locLabelDir, '2. Fovea Center Location');

    idrid.localization.odTrain    = readtable(findFile(odDir, '*Training*.csv'));
    idrid.localization.odTest     = readtable(findFile(odDir, '*Testing*.csv'));
    idrid.localization.foveaTrain = readtable(findFile(foveaDir, '*Training*.csv'));
    idrid.localization.foveaTest   = readtable(findFile(foveaDir, '*Testing*.csv'));

    fprintf('  Localization: %d train images, %d test images\n', ...
        numel(idrid.localization.trainImages.Files), numel(idrid.localization.testImages.Files));

    % ---------------------------------------------------------------
    % PART A: SEGMENTATION
    % ---------------------------------------------------------------
    segRoot = firstExistingFolder(baseDir, { ...
        fullfile('idrid_segmentation', 'A. Segmentation', 'A. Segmentation'), ...
        fullfile('idrid_segmentation', 'A. Segmentation') ...
    });

    segImgDir = fullfile(segRoot, '1. Original Images');
    segGtDir  = fullfile(segRoot, '2. All Segmentation Groundtruths');

    idrid.segmentation.trainImages = imageDatastore(requireFolder(fullfile(segImgDir, 'a. Training Set')));
    idrid.segmentation.testImages  = imageDatastore(requireFolder(fullfile(segImgDir, 'b. Testing Set')));

    lesionFolders = { ...
        'MA', '1. Microaneurysms'; ...
        'HE', '2. Haemorrhages'; ...
        'EX', '3. Hard Exudates'; ...
        'SE', '4. Soft Exudates'; ...
        'OD', '5. Optic Disc' ...
    };

    for i = 1:size(lesionFolders, 1)
        fieldName = lesionFolders{i, 1};
        folderName = lesionFolders{i, 2};

        idrid.segmentation.lesionFolders.(fieldName).train = ...
            requireFolder(fullfile(segGtDir, 'a. Training Set', folderName));
        idrid.segmentation.lesionFolders.(fieldName).test = ...
            requireFolder(fullfile(segGtDir, 'b. Testing Set', folderName));
    end

    fprintf('  Segmentation: %d train images, %d test images (5 lesion types indexed)\n', ...
        numel(idrid.segmentation.trainImages.Files), numel(idrid.segmentation.testImages.Files));

    fprintf('IDRiD loaded successfully.\n');
end

function folderPath = firstExistingFolder(baseDir, candidates)
    folderPath = '';
    for i = 1:numel(candidates)
        candidate = fullfile(baseDir, candidates{i});
        if isfolder(candidate)
            folderPath = candidate;
            return;
        end
    end

    error('loadIDRiD:FolderNotFound', ...
        'Could not find any of these folders under:\n%s\n\n%s', ...
        baseDir, strjoin(string(candidates), newline));
end

function folderPath = requireFolder(folderPath)
    if ~isfolder(folderPath)
        error('loadIDRiD:MissingFolder', 'Folder not found:\n%s', folderPath);
    end
end

function filePath = findFile(folder, pattern)
    matches = dir(fullfile(folder, pattern));

    if isempty(matches)
        error('loadIDRiD:fileNotFound', ...
            'No file matching "%s" found in:\n%s', pattern, folder);
    elseif numel(matches) > 1
        error('loadIDRiD:ambiguousFile', ...
            'Multiple files matching "%s" found in:\n%s', pattern, folder);
    end

    filePath = fullfile(matches(1).folder, matches(1).name);
end
