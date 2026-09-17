function result = fovealLocalization(imagePath, odPred, gtCoord, opts)
%FOVEALLOCALIZATION Predict fovea location as a fixed geometric offset
% from the OD prediction. No pixel search - the pixel-darkness search
% approach was tested and consistently failed (1700-1900px errors),
% while a simple offset derived from real IDRiD statistics is both
% accurate and has no failure mode.
%
% Offsets below were computed from idrid.localization.odTrain /
% foveaTrain (413 images), split by which half of the image the OD sits
% in (a proxy for eye laterality, which flips the offset direction):
%   OD on right half: dx=1294.6 (std 84.9), dy=-108.3 (std 98.0), n=204
%   OD on left half:  dx=-1306.0 (std 82.2), dy=-180.2 (std 86.3), n=209
% where dx = odX - foveaX, dy = odY - foveaY.
%
% USAGE:
%   odRes = opticDiscLocalization(imgPath, odGT, struct('visualize',false));
%   result = fovealLocalization(imgPath, odRes.pred, foveaGT);

    if nargin < 3, gtCoord = []; end
    if nargin < 4, opts = struct(); end
    opts = setDefault(opts, 'dxRight', 1294.6);
    opts = setDefault(opts, 'dyRight', -108.3);
    opts = setDefault(opts, 'dxLeft', -1306.0);
    opts = setDefault(opts, 'dyLeft', -180.2);
    opts = setDefault(opts, 'verbose', true);

    if any(isnan(odPred))
        result = struct('pred', [NaN NaN], 'error', NaN);
        if opts.verbose, fprintf('  [FOVEA] ABORT: OD prediction is NaN, cannot anchor offset\n'); end
        return;
    end

    info = imfinfo(imagePath);
    W = info.Width;

    cx = odPred(1); cy = odPred(2);

    if cx > W/2
        dx = opts.dxRight; dy = opts.dyRight;
        side = 'right';
    else
        dx = opts.dxLeft; dy = opts.dyLeft;
        side = 'left';
    end

    pred = [cx - dx, cy - dy];

    if ~isempty(gtCoord)
        err = norm(pred - gtCoord(:)');
    else
        err = NaN;
    end

    result = struct('pred', pred, 'error', err, 'odSide', side);
    if opts.verbose
        fprintf('  [FOVEA] OD side=%s, pred=(%.0f,%.0f), err=%.2f px\n', side, pred(1), pred(2), err);
    end
end

function opts = setDefault(opts, field, value)
    if ~isfield(opts, field)
        opts.(field) = value;
    end
end
