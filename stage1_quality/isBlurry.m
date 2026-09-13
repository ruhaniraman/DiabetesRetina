function [isBlurred, score] = isBlurry(img)
% ISBLURRY  Decide whether a fundus image is too blurry to grade.
%
%   [isBlurred, score] = isBlurry(img)
%
%   Returns:
%     isBlurred - true/false decision
%     score     - the raw blur score (so callers can log it if needed)
%
%   THRESHOLD JUSTIFICATION (calibrated 2026-09-13):
%   Tested on IDRiD training images (pre-confirmed as clinically
%   gradable/good quality by 2 medical experts per the dataset paper).
%   20-image baseline sample of real good images had scores ranging
%   7.77e-05 to 3.65e-04.
%   Synthetic Gaussian blur sweep (sigma 0 to 3) on 3 different images
%   consistently showed: sigma=0.5 blur -> score stays ABOVE the good
%   baseline floor; sigma=1.0 blur -> score drops clearly BELOW it.
%   Threshold set at the good-quality floor itself, so it accepts every
%   image in the good baseline sample while catching anything blurred
%   beyond roughly sigma=0.8-0.9 of Gaussian blur.
%
%   NOTE: this threshold was calibrated on IDRiD images specifically.
%   If Stage 1 later gets tested against a different camera/dataset
%   (e.g. images from an actual portable fundus camera in the field),
%   re-run this calibration process -- absolute pixel intensity scale
%   and camera resolution both affect the raw score.

    BLUR_THRESHOLD = 7.5e-05;

    score = blurScore(img);
    isBlurred = score < BLUR_THRESHOLD;
end