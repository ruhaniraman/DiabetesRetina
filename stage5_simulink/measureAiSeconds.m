function secs = measureAiSeconds(nPatients)
% MEASUREAISECONDS  Seconds of MATLAB work the backend does per patient (both eyes), for districtParameters.aiSecondsPerPatient.
%
%   secs = measureAiSeconds()      % 10 patients from the held-out APTOS test split, full-resolution photographs
%
% Per patient, as the backend does it: Stage 3 grading of both eyes (assessBilateralFromFiles), Stage 4 Grad-CAM of both eyes
% (gradCamToFile), the Stage 2 lesion overlay of both eyes (lesionOverlayToFile) and the Stage 2 anatomy of both eyes (vessels, disc,
% fovea: anatomyOverlayToFile, when the vessel network exists). Stage 1 (Python, OpenCV) takes well under a second and is not included. The first patient is a warm-up (models load, GPU initialises) and is not counted.
    if nargin < 1, nPatients = 10; end
    root = fileparts(fileparts(mfilename('fullpath')));
    addpath(fullfile(root, 'utils'), fullfile(root, 'stage1_quality'), fullfile(root, 'stage_3'), ...
        fullfile(root, 'stage4_explainability', 'core'), fullfile(root, 'stage2_structure'), fullfile(root, 'stage2_structure', 'dl'));
    withAnatomy = isfile(fullfile(root, 'stage2_structure', 'dl', 'Stage2_VesselUNet.mat'));
    S = readtable(fullfile(root, 'validation', 'results', 'splits.csv'), 'TextType', 'char');
    ids = S.id(strcmp(S.split, 'test'));
    files = fullfile(root, 'data', 'aptos2019_full', 'train_images', strcat(ids(1:2 * (nPatients + 1)), '.png'));
    tmp = tempname; mkdir(tmp); cleanup = onCleanup(@() rmdir(tmp, 's'));
    t = zeros(nPatients + 1, 1);
    for k = 1:nPatients + 1
        L = files{2 * k - 1}; R = files{2 * k};
        tic;
        assessBilateralFromFiles(L, R);
        gradCamToFile(L, fullfile(tmp, 'l.png')); gradCamToFile(R, fullfile(tmp, 'r.png'));
        lesionOverlayToFile(L, fullfile(tmp, 'ol.png')); lesionOverlayToFile(R, fullfile(tmp, 'or.png'));
        if withAnatomy
            anatomyOverlayToFile(L, fullfile(tmp, 'al.png')); anatomyOverlayToFile(R, fullfile(tmp, 'ar.png'));
        end
        t(k) = toc;
    end
    secs = mean(t(2:end));
    parts = 'grading + Grad-CAM + lesion overlay';
    if withAnatomy, parts = [parts ' + anatomy']; end
    fprintf('AI seconds per patient (both eyes, %s): %.1f (median %.1f, n=%d; GPU: %d)\n', ...
        parts, secs, median(t(2:end)), nPatients, canUseGPU());
end
