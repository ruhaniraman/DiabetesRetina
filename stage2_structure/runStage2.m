function result = runStage2(imageInput, opts)
%RUNSTAGE2 Run the complete Stage 2 retinal-structure pipeline.
%
% Stage 2:
%   1. Optic disc localization
%   2. Fovea localization
%   3. Retinal vessel segmentation
%   4. Lesion detection:
%        - Microaneurysms (MA)
%        - Haemorrhages (HE)
%        - Hard exudates (EX)
%        - Soft exudates (SE, experimental)
%
% USAGE:
%   result = runStage2(imgPath);
%   result = runStage2(imgPath, struct('visualize', false));
%
% The function returns one unified result structure containing the
% outputs of all Stage 2 modules.

    if nargin < 2
        opts = struct();
    end

    opts = setDefault(opts, 'visualize', true);
    opts = setDefault(opts, 'verbose', true);
    opts = setDefault(opts, 'odRadius', 193);

    % ---------------------------------------------------------------
    % Prepare input
    % ---------------------------------------------------------------
    if isstring(imageInput) || ischar(imageInput)
        imagePath = char(imageInput);
        if ~isfile(imagePath)
            error('runStage2:FileNotFound', ...
                'Image file not found: %s', imagePath);
        end
        I = imread(imagePath);
    else
        I = imageInput;
        imagePath = '';
    end

    if opts.verbose
        fprintf('\n========================================\n');
        fprintf('        STAGE 2 RETINAL ANALYSIS\n');
        fprintf('========================================\n');
        if ~isempty(imagePath)
            fprintf('Image: %s\n', imagePath);
        end
    end

    % ---------------------------------------------------------------
    % 1. Optic disc localization
    % ---------------------------------------------------------------
    if opts.verbose
        fprintf('\n[1/4] Optic disc localization...\n');
    end

    odOpts = struct( ...
        'visualize', opts.visualize, ...
        'verbose', opts.verbose);

    odRes = opticDiscLocalization(imageInput, [], odOpts);

    % ---------------------------------------------------------------
    % 2. Fovea localization
    % ---------------------------------------------------------------
    if opts.verbose
        fprintf('\n[2/4] Fovea localization...\n');
    end

    foveaRes = struct( ...
        'pred', [NaN NaN], ...
        'error', NaN);

    if all(isfinite(odRes.pred))
        foveaOpts = struct( ...
            'visualize', opts.visualize, ...
            'verbose', opts.verbose);

        foveaRes = fovealLocalization(imageInput, odRes.pred, [], foveaOpts);
    else
        if opts.verbose
            fprintf('  [FOVEA] Skipped because optic disc localization failed.\n');
        end
    end

    % ---------------------------------------------------------------
    % 3. Vessel segmentation
    % ---------------------------------------------------------------
    if opts.verbose
        fprintf('\n[3/4] Retinal vessel segmentation...\n');
    end

    % Uses vesselSegmentation.m's own default (85th percentile) - this is
    % the value that was actually validated at 16.02% density with a
    % clean visual overlay. Do not override with 92 here - that value
    % produced severe under-detection (~4% density) in earlier testing.
    vesselOpts = struct( ...
        'visualize', opts.visualize, ...
        'verbose', opts.verbose);

    vesRes = vesselSegmentation(imageInput, vesselOpts);

    % ---------------------------------------------------------------
    % 4. Lesion detection
    % ---------------------------------------------------------------
    if opts.verbose
        fprintf('\n[4/4] Lesion detection...\n');
    end

    lesionOpts = struct( ...
        'visualize', opts.visualize, ...
        'verbose', opts.verbose);

    % If OD localization failed, pass [] so lesionDetection does not
    % apply an incorrect optic-disc exclusion region.
    if all(isfinite(odRes.pred))
        odCenter = odRes.pred;
    else
        odCenter = [];
    end

    lesRes = lesionDetection( ...
        imageInput, ...
        odCenter, ...
        opts.odRadius, ...
        vesRes.vesselMask, ...
        lesionOpts);

    % ---------------------------------------------------------------
    % Unified output
    % ---------------------------------------------------------------
    result = struct();

    result.imagePath = imagePath;
    result.imageSize = size(I);

    result.opticDisc = odRes;
    result.fovea = foveaRes;
    result.vessels = vesRes;
    result.lesions = lesRes;

    % Convenient top-level masks/coordinates for downstream stages.
    result.odCenter = odRes.pred;
    result.foveaCenter = foveaRes.pred;
    result.vesselMask = vesRes.vesselMask;

    result.maMask = lesRes.maMask;
    result.heMask = lesRes.heMask;
    result.exMask = lesRes.exMask;
    result.seMask = lesRes.seMask;

    if opts.verbose
        fprintf('\n========================================\n');
        fprintf('          STAGE 2 COMPLETE\n');
        fprintf('========================================\n');

        if all(isfinite(odRes.pred))
            fprintf('OD      : (%.1f, %.1f)\n', ...
                odRes.pred(1), odRes.pred(2));
        else
            fprintf('OD      : localization failed\n');
        end

        if all(isfinite(foveaRes.pred))
            fprintf('Fovea   : (%.1f, %.1f)\n', ...
                foveaRes.pred(1), foveaRes.pred(2));
        else
            fprintf('Fovea   : localization failed/skipped\n');
        end

        fprintf('Vessels : %d px (%.2f%% of FOV)\n', ...
            nnz(vesRes.vesselMask), 100 * vesRes.density);

        fprintf('MA      : %d px\n', nnz(lesRes.maMask));
        fprintf('HE      : %d px\n', nnz(lesRes.heMask));
        fprintf('EX      : %d px\n', nnz(lesRes.exMask));
        fprintf('SE      : %d px (experimental)\n', nnz(lesRes.seMask));
    end
end


function opts = setDefault(opts, field, value)
    if ~isfield(opts, field)
        opts.(field) = value;
    end
end
