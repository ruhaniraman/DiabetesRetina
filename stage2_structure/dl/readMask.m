function m = readMask(file)
% READMASK  IDRiD ground-truth mask -> logical HxW. Uses the colour channels only: IDRiD_81_EX.tif is RGBA (lesion in red,
% alpha 255 everywhere), so any(imread(file), 3) would mark the whole image as lesion.
    m = imread(file);
    m = any(m(:, :, 1:min(3, size(m, 3))), 3);
end
