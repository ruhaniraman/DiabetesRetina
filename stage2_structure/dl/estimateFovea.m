function L = estimateFovea(odProb, fov, odThreshold)
% ESTIMATEFOVEA  Optic disc centre and size from the lesion network's optic-disc output, and the fovea estimated from the anatomy.
%
%   L = estimateFovea(odProb, fov)
%   L = estimateFovea(odProb, fov, odThreshold)      default 0.5
%
%   odProb   HxW optic-disc probability (segmentLesionsDL, channel 'OD'), any resolution
%   fov      HxW logical retina mask at the same resolution
%   L        .found (disc found), .odCentre [x y], .odDiameter (px), .fovea [x y], .source ('disc' or 'retina centre')
%
% The fovea lies about 2.5 disc diameters from the disc centre, on the temporal side (away from the disc, toward the middle of the
% retina) and close to the disc's horizontal level. When no disc is found the fovea is taken as the centre of the retina (macula-centred
% photographs), and the disc diameter as 1/7 of the retina's width. Accuracy on IDRiD's labelled disc and fovea centres:
% validation/results/localisation.md (validateLocalisation.m).
    if nargin < 3, odThreshold = 0.5; end
    [H, W] = size(fov);
    st = regionprops(fov, 'BoundingBox', 'Area');
    [~, big] = max([st.Area]);
    box = st(big).BoundingBox;
    centre = [box(1) + box(3) / 2, box(2) + box(4) / 2];
    L = struct('found', false, 'odCentre', [NaN NaN], 'odDiameter', box(3) / 7, 'fovea', centre, 'source', 'retina centre');

    disc = odProb >= odThreshold & fov;
    if ~any(disc(:)), return; end
    cc = bwconncomp(disc);
    props = regionprops(cc, odProb, 'Area', 'WeightedCentroid', 'EquivDiameter', 'MeanIntensity');
    score = [props.Area] .* [props.MeanIntensity];
    [~, k] = max(score);
    if props(k).Area < (box(3) / 40) ^ 2, return; end                % too small to be a disc
    L.found = true;
    L.odCentre = props(k).WeightedCentroid;
    L.odDiameter = props(k).EquivDiameter;
    side = sign(centre(1) - L.odCentre(1)); if side == 0, side = 1; end   % temporal = toward the retina's centre
    L.fovea = [L.odCentre(1) + side * 2.5 * L.odDiameter, L.odCentre(2)];
    L.fovea = [min(max(L.fovea(1), 1), W), min(max(L.fovea(2), 1), H)];
    L.source = 'disc';
end
