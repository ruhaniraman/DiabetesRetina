function reportText = formatReportText(result)
% FORMATREPORTTEXT  Convert a predictWithThreshold() result struct into
% clinician-readable report text.
%
%   reportText = formatReportText(result)
%
%   INPUT:
%     result - the struct returned by predictWithThreshold.m, containing
%              at minimum: predictedGrade, confidence, referableProb,
%              isReferable
%
%   OUTPUT:
%     reportText - struct of strings, ready to drop into a report layout:
%       .icdrLevel       - e.g. "ICDR Grade 4 (Proliferative DR)"
%       .confidenceBand  - "High" / "Moderate" / "Low"
%       .confidenceNote  - one sentence framing what the confidence means
%       .referralLine    - the recommendation sentence
%       .heatmapNote     - caption for the heatmap panel
%       .probabilityNote - caption for the class-probability chart
%       .disclaimer      - fixed safety/scope disclaimer, always included
%       .summary         - single paragraph combining the above, for a
%                          quick-read version of the report

grade = string(result.predictedGrade);

% ---- Map class name to ICDR level + full name ----
% ICDR (International Clinical Diabetic Retinopathy) scale, 0-4.
icdrMap = containers.Map(...
    {'No_DR', 'Mild', 'Moderate', 'Severe', 'Proliferate_DR'}, ...
    {'ICDR Grade 0 (No apparent retinopathy)', ...
    'ICDR Grade 1 (Mild nonproliferative DR)', ...
    'ICDR Grade 2 (Moderate nonproliferative DR)', ...
    'ICDR Grade 3 (Severe nonproliferative DR)', ...
    'ICDR Grade 4 (Proliferative DR)'});

if isKey(icdrMap, grade)
    reportText.icdrLevel = icdrMap(grade);
else
    reportText.icdrLevel = sprintf('Unrecognized grade: %s', grade);
end

% ---- Confidence banding ----
% Reported as a band, not a percentage: on held-out data the model is over-confident (its 'Moderate' band claims about
% 81% but is right about 75% of the time; validation/REPORT.md). A lower band does NOT mean the referral decision is less
% trustworthy in general, but in testing the referral decision was wrong in about 1% of high-confidence results and about
% 15% of the rest, so lower confidence is a real reason for a closer look. The same bands are used by the app
% (backend/clinical_text.py).
conf = result.confidence;
confidenceCaveat = ' Confidence is only a rough guide: the model tends to be over-confident.';
if conf >= 0.90
    reportText.confidenceBand = "High";
    reportText.confidenceNote = "Model confidence in the predicted grade: High." + confidenceCaveat;
elseif conf >= 0.70
    reportText.confidenceBand = "Moderate";
    reportText.confidenceNote = "Model confidence in the predicted grade: Moderate. " + ...
        "The image may show features consistent with more than one grade." + confidenceCaveat;
else
    reportText.confidenceBand = "Low";
    reportText.confidenceNote = "Model confidence in the predicted grade: Low. " + ...
        "This case may sit near a grading boundary; clinical correlation " + ...
        "is recommended regardless of the referral decision below." + confidenceCaveat;
end

% ---- Referral recommendation ----
% Driven by isReferable / referableProb, NOT by confidenceBand. The tuned threshold decision was technically validated on
% held-out APTOS images (sensitivity 96.9%, specificity 88.3%; validation/REPORT.md). It has NOT been clinically validated
% and it misses some referable cases, so a 'not referred' result must never read as reassurance.
thr = 0.2;
if isfield(result, 'threshold') && ~isempty(result.threshold)
    thr = result.threshold;
end
if result.isReferable
    % Urgency wording matches the app (backend/clinical_text.py): Severe and Proliferative are marked URGENT.
    if grade == "Severe" || grade == "Proliferate_DR"
        action = "URGENT - prompt referral to an ophthalmologist is recommended.";
    else
        action = "Referral to an eye specialist for ophthalmological evaluation is recommended.";
    end
    reportText.referralLine = sprintf(...
        "RECOMMENDATION: %s Referral score: %.1f%% (flagged at %.0f%% or more).", ...
        action, result.referableProb*100, thr*100);
else
    % Not flagged for referral. Wording matches the app (backend/clinical_text.py): never reassure, and for a Mild
    % grade recommend follow-up and leave the interval to the patient's eye-care professional.
    if grade == "Mild"
        nextStep = "Mild changes were detected: follow-up with an eye-care professional is recommended; " + ...
            "ask them how often you should be screened.";
    else
        nextStep = "Continue regular eye screening as advised by your eye-care professional, and seek review " + ...
            "sooner if you notice any change in your vision.";
    end
    reportText.referralLine = sprintf(...
        "NO REFERRAL FLAGGED by the screening model. This does not rule out disease, because the screening " + ...
        "tool can miss it. %s Referral score: %.1f%% (flagged at %.0f%% or more).", ...
        nextStep, result.referableProb*100, thr*100);
end

% ---- Heatmap caption (same wording as the web app, frontend/src/clinicalText.js) ----
reportText.heatmapNote = "Regions that raised this eye's referral score, on a coarse grid. A rough guide, not a lesion detection: warm colours do not " + ...
    "by themselves mean disease, and disease can be present outside them.";
reportText.probabilityNote = "Raw model output, which is over-confident. The referral score is what decides.";

% ---- Fixed disclaimer, always included ----
reportText.disclaimer = "This output is generated by an automated " + ...
    "screening aid and does not constitute a medical diagnosis. The tool can miss disease and has not been " + ...
    "clinically validated. All findings should be confirmed by a qualified eye care " + ...
    "professional before any clinical decision is made.";

% ---- One-paragraph summary ----
reportText.summary = sprintf(...
    "%s\n%s\n%s\n\n%s", ...
    reportText.icdrLevel, ...
    reportText.confidenceNote, ...
    reportText.referralLine, ...
    reportText.disclaimer);

end