function enhanceToFile(src, dst, maxSide)
% ENHANCETOFILE  For the web app: write the enhanced copy of a fundus photograph (enhanceForReview) to dst (PNG).
% Display only: the grading network is given the unprocessed photograph (validation/results/enhancement.md).
% The photo is first shrunk so its longest side is at most maxSide px (default 2048): a screen shows no more, and on a 12 MP photo
% the full-resolution bilateral filter took about 35 s.
    if nargin < 3, maxSide = 2048; end
    img = imread(src);
    s = min(1, maxSide / max(size(img, 1), size(img, 2)));
    if s < 1, img = imresize(img, s); end
    imwrite(enhanceForReview(img), dst);
end
