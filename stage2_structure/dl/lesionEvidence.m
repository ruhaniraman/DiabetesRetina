function E = lesionEvidence(masks, prob, info, channels)
% LESIONEVIDENCE  Lesion findings summarised against the ICDR criteria a grader checks, for the report.
%
%   E = lesionEvidence(masks, prob, info, channels)      (outputs of segmentLesionsDL)
%
%   E.heQuadrants        number of retinal quadrants (around the estimated fovea) with at least one possible haemorrhage
%   E.heQuadrantsWith20  quadrants with 20 or more possible haemorrhages (ICDR severe NPDR: >= 20 in each of 4 quadrants, the "4" of 4-2-1)
%   E.heByQuadrant       1x4 counts: superotemporal, inferotemporal, superonasal, inferonasal (temporal = away from the disc)
%   E.onlyMA             possible microaneurysms and nothing else marked (ICDR mild NPDR: microaneurysms only)
%   E.exNearFovea        possible hard exudates within 1 disc diameter of the estimated fovea (macular oedema is not graded here)
%   E.foveaFrom          'disc' (estimated from the optic disc) or 'retina centre'
%
% Counts are connected regions of the calibrated masks, so a large blot haemorrhage counts once and touching ones merge: this is
% evidence for a reviewer, not a grade. Venous beading, IRMA and new vessels are not detected.
    ch = @(name) find(strcmp(channels, name), 1);
    L = estimateFovea(prob(:, :, ch('OD')), info.fov);
    [H, W] = size(info.fov);
    [X, Y] = meshgrid(1:W, 1:H);
    upper = Y < L.fovea(2);
    discSide = L.found && L.odCentre(1) < L.fovea(1);           % disc on the left: temporal is right
    temporal = ternary(discSide, X > L.fovea(1), X < L.fovea(1));
    quad = {upper & temporal, ~upper & temporal, upper & ~temporal, ~upper & ~temporal};

    he = bwconncomp(masks(:, :, ch('HE')), 8);
    heCentres = regionprops(he, 'Centroid');
    E.heByQuadrant = zeros(1, 4);
    for k = 1:numel(heCentres)
        c = round(heCentres(k).Centroid); c = [min(max(c(1), 1), W), min(max(c(2), 1), H)];
        for q = 1:4
            if quad{q}(c(2), c(1)), E.heByQuadrant(q) = E.heByQuadrant(q) + 1; break; end
        end
    end
    E.heQuadrants = nnz(E.heByQuadrant);
    E.heQuadrantsWith20 = nnz(E.heByQuadrant >= 20);

    anyOf = @(name) any(any(masks(:, :, ch(name))));
    E.onlyMA = anyOf('MA') && ~anyOf('HE') && ~anyOf('EX') && ~anyOf('SE');
    near = hypot(X - L.fovea(1), Y - L.fovea(2)) <= L.odDiameter;
    E.exNearFovea = any(any(masks(:, :, ch('EX')) & near));
    E.foveaFrom = L.source;
end

function out = ternary(c, a, b)
    if c, out = a; else, out = b; end
end
