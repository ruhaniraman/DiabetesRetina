function L = anatomyLandmarks(img, odProb, fov)
% ANATOMYLANDMARKS  Optic disc and fovea for the report: detected by the trained localiser when it is available and confident,
% otherwise estimated from the lesion network's optic-disc output (estimateFovea).
%
%   L = anatomyLandmarks(img, odProb, fov)
%
%   img     RGB fundus photograph (uint8)
%   odProb  optic-disc probability from segmentLesionsDL (channel 'OD'), same size as img
%   fov     retina mask, same size
%   L       as estimateFovea (.found, .odCentre, .odDiameter, .fovea, .source), plus .foveaConfidence (NaN when not detected).
%           .source is 'detected' (localiser), 'disc' (2.5 disc diameters from the disc) or 'retina centre'.
%
% The disc DIAMETER always comes from the lesion network (the localiser gives centres only). The localiser's fovea is used when its
% confidence (share of probability near its peak) is at least 0.25; below that (fovea outside the photo, very poor contrast) the
% estimate from the disc is kept. Accuracy of each: validation/results/localisation.md.
    persistent localiser checked
    L = estimateFovea(odProb, fov);
    L.foveaConfidence = NaN;
    if isempty(checked)
        checked = true;
        f = fullfile(fileparts(mfilename('fullpath')), 'Stage2_Localiser.mat');
        if isfile(f), S = load(f, 'model'); localiser = S.model; end
    end
    if isempty(localiser), return; end
    Q = locateDiscFovea(img, localiser);
    L.foveaConfidence = Q.foveaConfidence;
    if Q.discConfidence >= 0.25
        L.odCentre = Q.disc;
        L.found = true;
    end
    if Q.foveaConfidence >= 0.25
        L.fovea = Q.fovea;
        L.source = 'detected';
    end
end
