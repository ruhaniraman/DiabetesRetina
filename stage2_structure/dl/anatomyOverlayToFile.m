function A = anatomyOverlayToFile(src, dst)
% ANATOMYOVERLAYTOFILE  Stage 2 anatomy for the web app: retinal vessels, optic disc and fovea (with the macula zone) drawn on a
% transparent overlay.
%
%   A = anatomyOverlayToFile(src, dst)
%
%   src   fundus photograph (any size, any camera)
%   dst   PNG with an alpha channel, same size as src: vessels in cyan, the optic disc outlined in yellow, the fovea marked
%         with a white cross and the macula (1 disc diameter around the fovea) outlined; everything else transparent
%   A     .disc [x y], .discDiameter (px), .fovea [x y], .foveaSource ('detected' | 'disc' | 'retina centre'), .foveaConfidence,
%         .vesselDensity (% of the retina marked as vessel), .vesselMethod ('unet' | 'classical'), .imageSize [H W]
%
% Vessels: the trained vessel U-Net (Stage2_VesselUNet.mat, segmentVesselsDL; validation/results/vessels_drive.md) when present,
% otherwise the classical vesselSegmentation. Disc and fovea: anatomyLandmarks (the trained localiser when present).
    persistent lesionModel
    if isempty(lesionModel)
        S = load(fullfile(fileparts(mfilename('fullpath')), 'Stage2_LesionUNet_v2.mat'), 'model');
        lesionModel = S.model;
    end
    img = imread(src);
    if size(img, 3) == 1, img = repmat(img, 1, 1, 3); elseif size(img, 3) == 4, img = img(:, :, 1:3); end
    [H, W, ~] = size(img);

    [prob, ~, info] = segmentLesionsDL(img, lesionModel);
    L = anatomyLandmarks(img, prob(:, :, strcmp(lesionModel.channels, 'OD')), info.fov);

    if isfile(fullfile(fileparts(mfilename('fullpath')), 'Stage2_VesselUNet.mat'))
        [~, vessels] = segmentVesselsDL(img);
        method = 'unet';
    else
        r = vesselSegmentation(img, struct('visualize', false, 'verbose', false));
        vessels = r.vesselMask;
        method = 'classical';
    end
    vessels = vessels & info.fov;

    rgb = zeros(H, W, 3, 'uint8'); alpha = zeros(H, W, 'uint8');
    [X, Y] = meshgrid(1:W, 1:H);
    t = max(2, round(W / 400));                                       % line thickness scales with the photo
    layers = {
        vessels, [34 211 238], 170                                    % cyan
    };
    if L.found
        dDisc = hypot(X - L.odCentre(1), Y - L.odCentre(2));
        layers(end + 1, :) = {abs(dDisc - L.odDiameter / 2) <= t, [250 204 21], 255};          % yellow disc outline
    end
    dFov = hypot(X - L.fovea(1), Y - L.fovea(2));
    cross = (abs(X - L.fovea(1)) <= t / 2 & dFov <= 0.25 * L.odDiameter) | (abs(Y - L.fovea(2)) <= t / 2 & dFov <= 0.25 * L.odDiameter);
    layers(end + 1, :) = {abs(dFov - L.odDiameter) <= t / 2 & info.fov, [255 255 255], 220};    % macula: 1 DD around the fovea
    layers(end + 1, :) = {cross, [255 255 255], 255};
    for k = 1:size(layers, 1)
        [m, colour, a] = layers{k, :};
        for c = 1:3
            ch = rgb(:, :, c); ch(m) = colour(c); rgb(:, :, c) = ch;
        end
        alpha(m) = a;
    end
    imwrite(rgb, dst, 'Alpha', alpha);

    A = struct('disc', L.odCentre, 'discDiameter', L.odDiameter, 'fovea', L.fovea, 'foveaSource', L.source, ...
        'foveaConfidence', L.foveaConfidence, 'vesselDensity', 100 * nnz(vessels) / max(nnz(info.fov), 1), ...
        'vesselMethod', method, 'imageSize', [H W]);
end
