function [out, info] = augmentStage3Image(img, info, sz, colour)
% AUGMENTSTAGE3IMAGE  One training image -> {augmented image, label}, for transform(imageDatastore, ..., 'IncludeInfo', true).
%
%   Geometry: mirror (left/right eyes), rotation, zoom and shift.
%   Colour (when `colour` is true): brightness, contrast, saturation and hue jitter. Cameras differ in exposure and tint, and
%   that is where the model transferred badly (IDRiD specificity), so training should not rely on a camera's exact colours.
%
% A separate file (not a local function) so the parallel pool workers that prepare batches can find it.
    tform = randomAffine2d('XReflection', true, 'Rotation', [-20 20], 'Scale', [0.9 1.1], ...
        'XTranslation', [-12 12], 'YTranslation', [-12 12]);
    img = imwarp(img, tform, 'OutputView', affineOutputView(size(img), tform, 'BoundsStyle', 'centerOutput'));
    if colour
        background = max(img, [], 3) < 15;              % black border and warp padding: keep it black, or it turns grey and speckled
        img = jitterColorHSV(img, 'Brightness', [-0.15 0.15], 'Contrast', [0.8 1.2], ...
            'Saturation', [-0.15 0.15], 'Hue', [-0.03 0.03]);
        img(repmat(background, 1, 1, 3)) = 0;
    end
    if ~isequal(size(img, [1 2]), sz(1:2)), img = imresize(img, sz(1:2)); end
    out = {img, info.Label};
end
