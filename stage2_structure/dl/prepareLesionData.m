function D = prepareLesionData(targetWidth)
% PREPARELESIONDATA  IDRiD segmentation set (81 photographs with pixel masks) prepared for the Stage 2 lesion network.
%
%   D = prepareLesionData()        cached in data/stage2_cache/idrid_lesions_<targetWidth>.mat
%   D = prepareLesionData(1792)
%
% Each photograph is cropped to the retina (getFOVMask) and resized so the retina is `targetWidth` pixels wide. Using the
% retina's width, not a fixed factor, is what lets the same network run on other cameras: segmentLesionsDL applies the same rule.
% At 1792 px an IDRiD image is about half its native size; microaneurysms stay 3-10 px across.
%
% Masks are downscaled keeping any pixel at least a quarter covered by lesion, so microaneurysms do not vanish.
%
% Output struct array, one element per photograph:
%   id, split ('train' | 'validation' | 'test'), img (uint8), masks (logical HxWx5), fov (logical), cropBox, fullSize
% Channel order is D(1).channels: MA, HE, EX, SE, OD. A missing mask file means "no such lesion" (IDRiD omits empty masks).
% Split: IDRiD's official test set (27) stays test; its training set (54) -> 45 train / 9 validation (fixed seed, stratified so
% both have soft exudates).

    if nargin < 1 || isempty(targetWidth), targetWidth = 1792; end
    root = fileparts(fileparts(fileparts(mfilename('fullpath'))));
    cacheFile = fullfile(root, 'data', 'stage2_cache', sprintf('idrid_lesions_%d.mat', targetWidth));
    if isfile(cacheFile)
        S = load(cacheFile, 'D');
        D = S.D;
        return
    end

    base = fullfile(root, 'data', 'idrid_segmentation', 'A. Segmentation', 'A. Segmentation');
    channels = {'MA', 'HE', 'EX', 'SE', 'OD'};
    folders = {'1. Microaneurysms', '2. Haemorrhages', '3. Hard Exudates', '4. Soft Exudates', '5. Optic Disc'};
    sets = {'a. Training Set', 'train'; 'b. Testing Set', 'test'};

    D = struct('id', {}, 'split', {}, 'img', {}, 'masks', {}, 'fov', {}, 'cropBox', {}, 'fullSize', {}, 'channels', {});
    for s = 1:size(sets, 1)
        files = dir(fullfile(base, '1. Original Images', sets{s, 1}, '*.jpg'));
        for f = 1:numel(files)
            [~, id] = fileparts(files(f).name);
            full = imread(fullfile(files(f).folder, files(f).name));
            [H, W, ~] = size(full);
            fov = getFOVMask(full);
            st = regionprops(fov, 'BoundingBox', 'Area');
            [~, big] = max([st.Area]);
            box = round(st(big).BoundingBox);                        % [x y w h]
            box(3) = min(box(3), W - box(1) + 1); box(4) = min(box(4), H - box(2) + 1);
            rows = box(2):box(2) + box(4) - 1;
            cols = box(1):box(1) + box(3) - 1;
            scale = targetWidth / box(3);
            outSize = round([box(4) box(3)] * scale);

            masks = false([outSize numel(channels)]);
            for c = 1:numel(channels)
                mf = fullfile(base, '2. All Segmentation Groundtruths', sets{s, 1}, folders{c}, sprintf('%s_%s.tif', id, channels{c}));
                if isfile(mf)
                    m = readMask(mf);
                    masks(:, :, c) = maxPoolResize(m(rows, cols), outSize);
                end
            end
            k = numel(D) + 1;
            D(k).id = id;
            D(k).split = sets{s, 2};
            D(k).img = imresize(full(rows, cols, :), outSize);
            D(k).masks = masks;
            D(k).fov = imresize(fov(rows, cols), outSize, 'nearest');
            D(k).cropBox = box;
            D(k).fullSize = [H W];
            D(k).channels = channels;
            fprintf('  %s %s -> %dx%d\n', sets{s, 2}, id, outSize(2), outSize(1));
        end
    end

    % 9 of the 54 training photographs -> validation, keeping soft exudates on both sides
    tr = find(strcmp({D.split}, 'train'));
    hasSE = arrayfun(@(i) any(D(i).masks(:, :, 4), 'all'), tr);
    rng(21);
    withSE = tr(hasSE); withoutSE = tr(~hasSE);
    withSE = withSE(randperm(numel(withSE))); withoutSE = withoutSE(randperm(numel(withoutSE)));
    nSE = round(9 * numel(withSE) / numel(tr));
    for i = [withSE(1:nSE) withoutSE(1:9 - nSE)]
        D(i).split = 'validation';
    end

    if ~isfolder(fileparts(cacheFile)), mkdir(fileparts(cacheFile)); end
    save(cacheFile, 'D', '-v7.3');
    fprintf('Prepared %d photographs (train %d, validation %d, test %d) -> %s\n', numel(D), ...
        sum(strcmp({D.split}, 'train')), sum(strcmp({D.split}, 'validation')), sum(strcmp({D.split}, 'test')), cacheFile);
end

function out = maxPoolResize(m, outSize)
% Downscale a logical mask without losing small lesions: box-average, then keep pixels at least a quarter covered.
% (A plain nearest-neighbour resize drops most microaneurysms; "any pixel" would inflate every lesion by a pixel.)
    out = imresize(single(m), outSize, 'box') >= 0.25;
end
