function [isPoorlyLit, details] = isPoorlyIlluminated(img, mask)
% ISPOORLYILLUMINATED  Decide whether a fundus image has an exposure
% problem (too dark, too bright, or has catastrophic dark/bright regions).
%
%   [isPoorlyLit, details] = isPoorlyIlluminated(img)
%   [isPoorlyLit, details] = isPoorlyIlluminated(img, mask)
%
%   Returns:
%     isPoorlyLit - true/false decision
%     details     - struct with the raw brightness/underExp/overExp
%                   values, so callers can log or display them
%
%   THRESHOLD JUSTIFICATION (calibrated 2026-09-13):
%   20-image baseline of confirmed-good IDRiD images: meanBrightness
%   ranged 0.1329 to 0.3547.
%   Synthetic darkening/brightening sweep on a real image showed
%   meanBrightness declines/rises smoothly and predictably with
%   exposure change, while underExp/overExp fractions stay flat near
%   baseline until a late, sudden jump -- so brightness range is the
%   primary, sensitive signal; underExp/overExp are backup catches for
%   catastrophic failures only (values far beyond anything seen in
%   confirmed-good images).
%
%   NOTE: like the blur threshold, this was calibrated on IDRiD images.
%   Re-calibrate if tested against a different camera/dataset later.

    if nargin < 2
        mask = getFOVMask(img);
    end

    [brightness, underExp, overExp] = illuminationScore(img, mask);

    BRIGHTNESS_MIN = 0.13;
    BRIGHTNESS_MAX = 0.35;
    CATASTROPHIC_UNDEREXP = 0.30;
    CATASTROPHIC_OVEREXP  = 0.10;

    tooDark    = brightness < BRIGHTNESS_MIN;
    tooBright  = brightness > BRIGHTNESS_MAX;
    catastrophicDark   = underExp > CATASTROPHIC_UNDEREXP;
    catastrophicBright = overExp  > CATASTROPHIC_OVEREXP;

    isPoorlyLit = tooDark || tooBright || catastrophicDark || catastrophicBright;

    details.brightness = brightness;
    details.underExposedFraction = underExp;
    details.overExposedFraction = overExp;
    details.tooDark = tooDark;
    details.tooBright = tooBright;
    details.catastrophicDark = catastrophicDark;
    details.catastrophicBright = catastrophicBright;
end
