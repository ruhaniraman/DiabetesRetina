function T = buildGradingManifest(aptosSource)
% BUILDGRADINGMANIFEST  One table of every grading image used to fine-tune Stage 3, with a fixed train/validation/test split.
%
%   T = buildGradingManifest()          APTOS from the 224x224 copy the deployed model was trained on
%   T = buildGradingManifest('full')    APTOS from the original full-resolution competition images (same ids, same split)
%   Also writes stage_3/finetune/manifest.csv and splits.csv.
%
% Columns: id (unique across datasets), dataset, path, label (No_DR ... Proliferate_DR), patient, split.
%
% Sources (all under data/, git-ignored) and how each is split:
%   APTOS 2019   '224':  data/aptos2019/colored_images/<Label>/<id>.png  (Kaggle sovitrath/diabetic-retinopathy-224x224-2019-data)
%                'full': data/aptos2019_full/train_images/<id>.png + train.csv  (Kaggle competition aptos2019-blindness-detection)
%                The split recorded in Stage3_checkpoint.mat is kept exactly, so the 548 test images stay the ones the
%                original model never saw and validation/REPORT.md stays comparable.
%   IDRiD        data/idrid_grading/B. Disease Grading/B. Disease Grading/...
%                Official testing set (103) -> test. Official training set (413) -> 85% train / 15% validation, stratified.
%                NOTE: validation/ previously used all 516 IDRiD images as an external test; after fine-tuning only the
%                official test set is unseen.
%   Messidor-2   data/messidor2/IMAGES/<image_id>, grades from data/messidor2/messidor_data.csv (Krause et al. adjudicated
%                ICDR grades: image_id, adjudicated_dr_grade, adjudicated_gradable). Ungradable images are dropped.
%                TEST ONLY (team decision 2026-09-24): never trained on, so results are an external benchmark comparable
%                with published Messidor-2 results, which use the whole dataset. data/messidor2/messidor-2.csv (the ADCIS
%                exam list: one row per exam, first two columns = the two image names) is used, when present, only to record
%                which images belong to the same patient.
%
% A dataset whose folder is missing is skipped with a warning, so the script also runs on a partial download.

    if nargin < 1 || isempty(aptosSource), aptosSource = '224'; end
    root = projectRoot();
    grades = {'No_DR', 'Mild', 'Moderate', 'Severe', 'Proliferate_DR'};
    parts = {};

    %% APTOS: reuse the recorded split
    switch aptosSource
        case '224',  aptosDir = fullfile(root, 'data', 'aptos2019', 'colored_images');
        case 'full', aptosDir = fullfile(root, 'data', 'aptos2019_full', 'train_images');
        otherwise,   error('buildGradingManifest:aptosSource', 'aptosSource must be ''224'' or ''full''.');
    end
    if isfolder(aptosDir)
        if strcmp(aptosSource, 'full')
            G = readtable(fullfile(fileparts(aptosDir), 'train.csv'), 'TextType', 'char');   % id_code, diagnosis
            fullLabel = containers.Map(G.id_code, grades(G.diagnosis + 1));
        end
        C = load(fullfile(root, 'stage_3', 'Stage3_checkpoint.mat'), 'imdsTrain', 'imdsValidation', 'imdsTest');
        sets = {C.imdsTrain, 'train'; C.imdsValidation, 'validation'; C.imdsTest, 'test'};
        for s = 1:size(sets, 1)
            imds = sets{s, 1};
            labels = cellstr(imds.Labels);
            n = numel(imds.Files);
            ids = cell(n, 1); paths = cell(n, 1);
            for i = 1:n
                [~, stem] = fileparts(strrep(imds.Files{i}, char(92), '/'));   % stored paths are from the training machine
                ids{i} = stem;
                if strcmp(aptosSource, 'full')
                    paths{i} = fullfile(aptosDir, [stem '.png']);
                    if ~strcmp(fullLabel(stem), labels{i})
                        error('buildGradingManifest:labelMismatch', '%s: checkpoint says %s, train.csv says %s.', stem, labels{i}, fullLabel(stem));
                    end
                else
                    paths{i} = fullfile(aptosDir, labels{i}, [stem '.png']);
                end
            end
            parts{end+1} = makeRows(strcat('aptos_', ids), 'aptos', paths, labels, strcat('aptos_', ids), sets{s, 2}); %#ok<AGROW>
        end
    else
        warning('buildGradingManifest:missing', 'APTOS not found at %s; skipped.', aptosDir);
    end

    %% IDRiD: official test stays test; official train split into train/validation
    idridDir = fullfile(root, 'data', 'idrid_grading', 'B. Disease Grading', 'B. Disease Grading');
    if isfolder(idridDir)
        for official = ["train", "test"]
            if official == "train"
                folder = 'a. Training Set'; csvName = 'a. IDRiD_Disease Grading_Training Labels.csv';
            else
                folder = 'b. Testing Set';  csvName = 'b. IDRiD_Disease Grading_Testing Labels.csv';
            end
            L = readtable(fullfile(idridDir, '2. Groundtruths', csvName), 'VariableNamingRule', 'preserve', 'TextType', 'char');
            names = strtrim(string(L.('Image name')));
            g = L.('Retinopathy grade');
            if ~isnumeric(g), g = str2double(g); end
            labels = grades(g + 1)';
            paths = cellstr(fullfile(idridDir, '1. Original Images', folder, names + ".jpg"));
            ids = cellstr("idrid_" + official + "_" + names);      % IDRiD_001 exists in BOTH official sets
            if official == "test"
                split = repmat({'test'}, numel(ids), 1);
            else
                split = splitGroups(ids, labels, [0.85 0.15 0], 11);
            end
            parts{end+1} = makeRows(ids, 'idrid', paths, labels, ids, split); %#ok<AGROW>
        end
    else
        warning('buildGradingManifest:missing', 'IDRiD grading not found at %s; skipped.', idridDir);
    end

    %% Messidor-2: external benchmark, all test
    mesDir = fullfile(root, 'data', 'messidor2');
    mesCsv = fullfile(mesDir, 'messidor_data.csv');
    if isfile(mesCsv)
        M = readtable(mesCsv, 'TextType', 'char');
        keep = ~isnan(M.adjudicated_dr_grade);
        if ismember('adjudicated_gradable', M.Properties.VariableNames)
            keep = keep & M.adjudicated_gradable == 1;
        end
        M = M(keep, :);
        imgNames = M.image_id;
        labels = grades(M.adjudicated_dr_grade + 1)';
        paths = cellfun(@(nm) locateFile(fullfile(mesDir, 'IMAGES'), nm), imgNames, 'UniformOutput', false);
        found = ~cellfun(@isempty, paths);
        if any(~found)
            warning('buildGradingManifest:messidorMissing', '%d Messidor-2 images listed in the CSV were not found; skipped.', sum(~found));
        end
        imgNames = imgNames(found); labels = labels(found); paths = paths(found);
        [~, stems] = cellfun(@fileparts, imgNames, 'UniformOutput', false);
        patient = messidorPatients(fullfile(mesDir, 'messidor-2.csv'), stems);
        split = repmat({'test'}, numel(stems), 1);
        parts{end+1} = makeRows(strcat('messidor_', stems), 'messidor2', paths, labels, patient, split);
    else
        warning('buildGradingManifest:missing', 'Messidor-2 grades not found at %s; skipped.', mesCsv);
    end

    if isempty(parts)
        error('buildGradingManifest:noData', 'No datasets found under %s.', fullfile(root, 'data'));
    end
    T = vertcat(parts{:});
    missing = ~cellfun(@isfile, T.path);
    if any(missing)
        error('buildGradingManifest:missingFiles', '%d image files are missing, e.g. %s', sum(missing), T.path{find(missing, 1)});
    end
    if numel(unique(T.id)) ~= height(T)
        error('buildGradingManifest:duplicateIds', 'Image ids are not unique.');
    end

    here = fileparts(mfilename('fullpath'));
    writetable(T, fullfile(here, 'manifest.csv'));                                          % local paths: git-ignored
    writetable(T(:, {'id', 'dataset', 'label', 'patient', 'split'}), fullfile(here, 'splits.csv'));   % commit this: the split record
    disp(groupsummary(T, {'dataset', 'split'}));
end

function T = makeRows(ids, dataset, paths, labels, patient, split)
    n = numel(ids);
    if ischar(split), split = repmat({split}, n, 1); end
    T = table(ids(:), repmat({dataset}, n, 1), paths(:), labels(:), patient(:), split(:), ...
        'VariableNames', {'id', 'dataset', 'path', 'label', 'patient', 'split'});
end

function split = splitGroups(groupOf, labels, fracs, seed)
% Assign whole groups (patients) to train/validation/test, stratified on each group's most severe label.
    order = {'No_DR', 'Mild', 'Moderate', 'Severe', 'Proliferate_DR'};
    [groups, ~, gi] = unique(groupOf);
    sev = accumarray(gi, cellfun(@(l) find(strcmp(order, l)), labels(:)), [], @max);
    names = {'train', 'validation', 'test'};
    groupSplit = cell(numel(groups), 1);
    rng(seed);
    for s = unique(sev)'
        members = find(sev == s);
        members = members(randperm(numel(members)));
        edges = round(cumsum(fracs) * numel(members));
        for k = 1:numel(members)
            groupSplit{members(k)} = names{find(k <= edges, 1)};
        end
    end
    split = groupSplit(gi);
end

function patient = messidorPatients(examCsv, stems)
% Map each image to its exam (patient) using the ADCIS exam list; fall back to one group per image.
    patient = strcat('messidor_', stems);
    if ~isfile(examCsv)
        fprintf('Messidor-2: %s not found; each image is recorded as its own patient (all images are test data).\n', examCsv);
        return
    end
    E = readtable(examCsv, 'ReadVariableNames', false, 'TextType', 'char', 'Delimiter', {';', ','});
    lookup = containers.Map('KeyType', 'char', 'ValueType', 'char');
    for r = 1:height(E)
        for c = 1:min(2, width(E))
            [~, stem] = fileparts(strtrim(E{r, c}{1}));
            lookup(lower(stem)) = sprintf('messidor_exam%04d', r);
        end
    end
    for i = 1:numel(stems)
        key = lower(stems{i});
        if isKey(lookup, key), patient{i} = lookup(key); end
    end
    fprintf('Messidor-2: %d images grouped into %d patients.\n', numel(stems), numel(unique(patient)));
end

function p = locateFile(folder, name)
% Messidor-2 mixes .png/.jpg/.JPG/.tif; match the listed name, else the same stem with any extension (case-insensitive).
    p = fullfile(folder, name);
    if isfile(p), return; end
    [~, stem] = fileparts(name);
    d = dir(fullfile(folder, [stem '.*']));
    if isempty(d)
        d = dir(folder);
        d = d(strcmpi(regexprep({d.name}, '\.[^.]*$', ''), stem));
    end
    if isempty(d), p = ''; else, p = fullfile(folder, d(1).name); end
end
