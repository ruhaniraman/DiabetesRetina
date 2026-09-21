function setupStage4Paths()
% SETUPSTAGE4PATHS  Add every folder Stage 4 needs to the MATLAB path.
% Paths are resolved from this file's location, not the current folder.
    root = fileparts(fileparts(mfilename('fullpath')));
    addpath(fullfile(root, 'utils'));
    addpath(fullfile(root, 'stage1_quality'));
    addpath(fullfile(root, 'stage_3'));
    addpath(fullfile(root, 'stage4_explainability'));
    addpath(fullfile(root, 'stage4_explainability', 'core'));
    addpath(fullfile(root, 'stage4_explainability', 'report'));
end
