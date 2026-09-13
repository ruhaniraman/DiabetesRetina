function [verdict, reason, details] = assessImageQuality(img)
% ASSESSIMAGEQUALITY  Overall quality gate for a fundus image.
%
%   [verdict, reason, details] = assessImageQuality(img)
%
%   Returns:
%     verdict - one of: "accept", "enhance", "reject"
%                 accept  = good as-is, send straight to Stage 2/3
%                 enhance = has a fixable problem (illumination), apply
%                           CLAHE/normalization before proceeding
%                 reject  = ungradeable, trigger a recapture message
%     reason  - human-readable string explaining the verdict (this is
%               what would eventually show up in a "please retake this
%               photo" message to the camera operator)
%     details - struct with every underlying check's raw values, for
%               logging/debugging
%
%   DECISION LOGIC:
%   Blur is NEVER something enhancement can fix -- sharpening filters
%   don't recover detail that was never captured, they just add
%   artifacts. So any blurry image is rejected outright, not "enhanced."
%
%   Illumination problems (too dark/bright) genuinely CAN often be
%   improved with CLAHE and illumination normalization -- so a
%   borderline illumination issue gets routed to "enhance" rather than
%   an automatic reject. But a CATASTROPHIC exposure failure (extreme
%   under/over-exposure, per isPoorlyIlluminated's stricter backup
%   thresholds) is unsalvageable and gets rejected too.

    mask = getFOVMask(img);

    [blurred, blurVal] = isBlurry(img);
    [poorLit, illumDetails] = isPoorlyIlluminated(img, mask);

    details.blurScore = blurVal;
    details.illumination = illumDetails;

    if blurred
        verdict = "reject";
        reason = "Image is too blurry to grade. Please refocus and recapture.";
        return;
    end

    if illumDetails.catastrophicDark
        verdict = "reject";
        reason = "Image is severely underexposed. Please recapture with more light.";
        return;
    end

    if illumDetails.catastrophicBright
        verdict = "reject";
        reason = "Image is severely overexposed. Please recapture with less light/flash.";
        return;
    end

    if poorLit
        verdict = "enhance";
        if illumDetails.tooDark
            reason = "Image is underexposed but salvageable -- applying enhancement.";
        else
            reason = "Image is overexposed but salvageable -- applying enhancement.";
        end
        return;
    end

    verdict = "accept";
    reason = "Image quality is acceptable.";
end
