function ok = checkSetup()
% CHECKSETUP  Is this machine ready to fine-tune Stage 3? Run it once after installing MATLAB and downloading data/.
%
%   checkSetup()
%
% Checks toolboxes, the GPU, that trainNetwork exists in this release, the datasets under data/, and that the deployed
% model loads and grades one image. Prints PASS / FAIL per item and what to do about each failure.

    here = fileparts(mfilename('fullpath'));
    root = fileparts(fileparts(here));
    addpath(fullfile(root, 'utils'), fullfile(root, 'stage1_quality'), fullfile(root, 'stage_3'), here);   % stage1_quality: getFOVMask, used by the retina crop
    ok = true;
    fprintf('MATLAB %s\n\n', version);

    %% Toolboxes
    v = ver;
    installed = {v.Name};
    need = {'Deep Learning Toolbox', 'Image Processing Toolbox', 'Parallel Computing Toolbox'};
    for k = 1:numel(need)
        ok = report(any(strcmp(installed, need{k})), need{k}, ...
            'Install it from the Add-Ons menu (Home > Add-Ons > Get Add-Ons), or re-run the installer.') && ok;
    end
    later = {'Computer Vision Toolbox', 'Statistics and Machine Learning Toolbox', 'Simulink', 'Medical Imaging Toolbox'};
    for k = 1:numel(later)
        if ~any(strcmp(installed, later{k}))
            fprintf('  note   %s not installed (the problem statement uses it in other stages)\n', later{k});
        end
    end

    ok = report(exist('trainNetwork', 'file') > 0, 'trainNetwork available', ...
        'This release removed trainNetwork; finetuneStage3 must be ported to trainnet.') && ok;

    %% GPU
    gpuOk = false;
    try
        g = gpuDevice;
        fprintf('  GPU    %s, %.1f GB, compute capability %s\n', g.Name, g.TotalMemory / 2^30, g.ComputeCapability);
        gpuOk = canUseGPU;
    catch err
        fprintf('  GPU    error: %s\n', err.message);
    end
    ok = report(gpuOk, 'GPU usable for training', ...
        'Needs Parallel Computing Toolbox and a current NVIDIA driver. Training on the CPU would take many hours.') && ok;

    %% Data
    data = fullfile(root, 'data');
    aptos = dir(fullfile(data, 'aptos2019', 'colored_images', '*', '*.png'));
    ok = report(numel(aptos) == 3662, sprintf('APTOS images (%d of 3662)', numel(aptos)), ...
        'Expected data/aptos2019/colored_images/<grade>/<id>.png (Kaggle: sovitrath/diabetic-retinopathy-224x224-2019-data).') && ok;
    idrid = fullfile(data, 'idrid_grading', 'B. Disease Grading', 'B. Disease Grading');
    nIdrid = numel(dir(fullfile(idrid, '1. Original Images', '*', '*.jpg')));
    ok = report(nIdrid == 516, sprintf('IDRiD grading images (%d of 516)', nIdrid), ...
        ['Expected ' idrid '\1. Original Images\{a. Training Set, b. Testing Set}\*.jpg']) && ok;
    mes = fullfile(data, 'messidor2');
    nMes = numel(dir(fullfile(mes, 'IMAGES', '*.*'))) - 2;
    report(isfile(fullfile(mes, 'messidor_data.csv')), 'Messidor-2 grades (messidor_data.csv)', ...
        'Kaggle: google-brain/messidor2-dr-grades.');
    report(nMes >= 1744, sprintf('Messidor-2 images (%d of 1748)', max(nMes, 0)), ...
        'Download from ADCIS (https://www.adcis.net/en/third-party/messidor2/) into data/messidor2/IMAGES/. Messidor-2 is test-only: needed for the benchmark, not for training.');
    report(isfile(fullfile(mes, 'messidor-2.csv')), 'Messidor-2 exam list (messidor-2.csv)', ...
        'Comes with the ADCIS download; optional (records which images share a patient).');

    %% Model
    try
        [net, thr] = loadStage3Model();
        if ~isempty(aptos)
            img = preprocessStage3Input(imread(fullfile(aptos(1).folder, aptos(1).name)));
            [pred, scores] = stage3Scores(net, img);
            fprintf('  model  %s -> %s (max p = %.2f), threshold %.2f\n', aptos(1).name, char(pred), max(scores), thr);
        end
        ok = report(true, 'Deployed model loads and grades an image', '') && ok;
    catch err
        ok = report(false, 'Deployed model loads and grades an image', err.message) && ok;
    end

    if ok
        fprintf('\nReady. Next: finetuneStage3\n');
    else
        fprintf('\nFix the FAIL items above, then run checkSetup again.\n');
    end
end

function passed = report(passed, what, fix)
    if passed
        fprintf('  PASS   %s\n', what);
    else
        fprintf('  FAIL   %s\n         -> %s\n', what, fix);
    end
end
