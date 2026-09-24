function X = normaliseFundus(img, fov)
% NORMALISEFUNDUS  uint8 fundus photo -> single, each colour channel scaled to zero mean / unit spread inside the retina.
%
% Per-image normalisation removes most differences in exposure and tint between cameras, which is what a lesion detector
% must not depend on. Pixels outside the retina are set to 0.
    X = im2single(img);
    fov3 = repmat(fov, 1, 1, size(X, 3));
    for c = 1:size(X, 3)
        ch = X(:, :, c);
        v = ch(fov);
        if isempty(v), v = ch(:); end
        ch = (ch - mean(v)) / max(std(v), 1e-3);
        X(:, :, c) = ch;
    end
    X(~fov3) = 0;
end
