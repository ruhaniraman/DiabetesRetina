function outputPaths = createMedicalReport(imgPath, result, heatmap, overlayImg, reportText, outputDir)
% CREATEMEDICALREPORT  DEVELOPER TOOL. The web app does NOT use this file: its downloadable report is built by backend/report_pdf.py
% (both eyes, wording in backend/clinical_text.py). This one draws a single-photograph report from MATLAB (run_stage4.m).
%
% RetinaRescue-branded screening report: dark navy
% cards, gold/teal accents (matching the web app), structured metadata
% grid (inspired by clinical operative report templates), saved as PDF
% (A4) and PNG.

if nargin < 6 || isempty(outputDir)
    outputDir = 'stage4_explainability/results';
end
if ~exist(outputDir, 'dir')
    mkdir(outputDir);
end

[~, baseName, ~] = fileparts(imgPath);

% ---- RetinaRescue palette (pulled from the web app) ----
navyDark   = [0.11 0.13 0.20];   % card backgrounds
navyText   = [0.08 0.10 0.16];   % headings
bodyText   = [0.30 0.32 0.38];
mutedText  = [0.55 0.57 0.62];
gold       = [0.96 0.72 0.26];   % accent / predicted bar
slate      = [0.36 0.42 0.52];   % no referral flagged: a neutral colour, never green (the tool can miss disease)
red        = [0.86 0.29 0.29];   % referral needed
cardBg     = [0.96 0.965 0.975]; % light gray boxes (metadata grid)
pageWhite  = [1 1 1];

% ---- Figure: A4 portrait ----
fig = figure('Name', 'RetinaRescue Screening Report', ...
    'Units', 'centimeters', 'Position', [2 1 21 29.7], ...
    'Color', pageWhite, 'Visible', 'off');
set(fig, 'PaperUnits', 'centimeters', 'PaperSize', [21 29.7], ...
    'PaperPositionMode', 'manual', 'PaperPosition', [0 0 21 29.7]);

% One full-figure background axes for all "chrome" (cards, rules,
% badges, text) drawn in normalized 0-1 coordinates. Image/chart axes
% are layered on top afterward.
bg = axes(fig, 'Position', [0 0 1 1], 'Visible', 'off', ...
    'XLim', [0 1], 'YLim', [0 1]);
hold(bg, 'on');

marginX  = 0.07;
colGap   = 0.05;
colWidth = (1 - 2*marginX - colGap) / 2;
leftX    = marginX;
rightX   = marginX + colWidth + colGap;

% ---- Kicker + Title (matches the app's "RETINARESCUE / Retinal
% Assessment" header pattern) ----
topShift = 0.025;  % pushes the header down slightly from the page edge
text(bg, marginX, 0.965-topShift, 'RETINARESCUE  \bullet  AI SCREENING AID', ...
    'FontSize', 9, 'FontWeight', 'bold', 'Color', mutedText, ...
    'Interpreter', 'tex');
text(bg, marginX, 0.945-topShift, 'Diabetic Retinopathy Screening Report', ...
    'FontSize', 19, 'FontWeight', 'bold', 'Color', navyText);

% ---- Metadata grid (label-over-box, like a clinical report header) ----
extraGridGap = 0.020;  % extra breathing room between title and grid
gridY = 0.895 - topShift - extraGridGap;
boxH  = 0.028;
labelY = gridY + boxH + 0.006;
cellW = (1 - 2*marginX - 3*0.02) / 4;
cellXs = marginX + (0:3) * (cellW + 0.02);

% Confidence is shown as a band, not a percentage: the model's raw probabilities are over-confident
% (validation/REPORT.md). The referral score is the summed probability of Moderate, Severe and Proliferate.
gridLabels = {'PREDICTED GRADE (ESTIMATE)', 'CONFIDENCE', 'REFERRAL SCORE', 'DATE'};
gridValues = { ...
    char(result.predictedGrade), ...
    char(reportText.confidenceBand), ...
    sprintf('%.1f%%', result.referableProb*100), ...
    datestr(now, 'dd mmm yyyy') };

for i = 1:4
    rectangle(bg, 'Position', [cellXs(i), gridY, cellW, boxH], ...
        'FaceColor', cardBg, 'EdgeColor', 'none', 'Curvature', 0.25);
    text(bg, cellXs(i)+0.008, labelY, gridLabels{i}, ...
        'FontSize', 7.5, 'FontWeight', 'bold', 'Color', mutedText);
    text(bg, cellXs(i)+0.008, gridY+boxH/2, gridValues{i}, ...
        'FontSize', 10.5, 'FontWeight', 'bold', 'Color', navyText, ...
        'VerticalAlignment', 'middle');
end

% ---- Section divider ----
ruleY1 = gridY - 0.018;
plot(bg, [marginX 1-marginX], [ruleY1 ruleY1], 'Color', [0.85 0.85 0.88], 'LineWidth', 1);

% ---- Row 1: image cards (dark navy frame, like the app's dark cards) ----
row1Top  = ruleY1 - 0.035;
capH     = 0.022;
imgH     = 0.300;
cardPad  = 0.012;

sectionHeader(bg, leftX, row1Top, 'FUNDUS IMAGE (AS ANALYSED)', gold, navyText);
sectionHeader(bg, rightX, row1Top, 'REGIONS THAT RAISED THE REFERRAL SCORE', gold, navyText);

imgTop = row1Top - capH - 0.010;

% Dark navy card frames behind each image
rectangle(bg, 'Position', [leftX-cardPad, imgTop-imgH-cardPad, colWidth+2*cardPad, imgH+2*cardPad], ...
    'FaceColor', navyDark, 'EdgeColor', 'none', 'Curvature', 0.06);
rectangle(bg, 'Position', [rightX-cardPad, imgTop-imgH-cardPad, colWidth+2*cardPad, imgH+2*cardPad], ...
    'FaceColor', navyDark, 'EdgeColor', 'none', 'Curvature', 0.06);

ax1 = axes(fig, 'Units', 'normalized', 'Position', [leftX, imgTop-imgH, colWidth, imgH]);
imshow(uint8(result.preprocessedImage), 'Parent', ax1);

ax2 = axes(fig, 'Units', 'normalized', 'Position', [rightX, imgTop-imgH, colWidth, imgH]);
imshow(overlayImg, 'Parent', ax2);
annotation(fig, 'textbox', [rightX, imgTop-imgH-cardPad-0.033, colWidth, 0.030], 'String', reportText.heatmapNote, ...
    'FontSize', 7, 'Color', mutedText, 'EdgeColor', 'none', 'VerticalAlignment', 'top', 'FitBoxToText', 'off');

% ---- Row 2 divider ----
ruleY2 = imgTop - imgH - cardPad - 0.040;     % room for the two-line caption under the heatmap
plot(bg, [marginX 1-marginX], [ruleY2 ruleY2], 'Color', [0.85 0.85 0.88], 'LineWidth', 1);

% ---- Row 2: probability chart + referral panel ----
row2Top = ruleY2 - 0.035;
row2H   = 0.345 - topShift - extraGridGap;  % compensates for both
% header shifts above,
% so the footer stays put

sectionHeader(bg, leftX, row2Top, 'CLASS PROBABILITIES (RAW OUTPUT)', gold, navyText);
sectionHeader(bg, rightX, row2Top, 'ASSESSMENT SUMMARY', gold, navyText);

chartTop = row2Top - capH - 0.010;
ax3 = axes(fig, 'Units', 'normalized', ...
    'Position', [leftX, chartTop-row2H+0.055, colWidth, row2H-0.055]);   % leaves room for the caption under the chart
barLabels = {'Mild', 'Moderate', 'No\_DR', 'Proliferate\_DR', 'Severe'};
barColors = repmat([0.75 0.76 0.80], 5, 1);
[~, predIdx] = max(result.probs);
barColors(predIdx, :) = gold;

b = bar(ax3, result.probs, 'FaceColor', 'flat');
b.CData = barColors;
set(ax3, 'XTickLabel', barLabels, 'XTickLabelRotation', 25, 'FontSize', 8.5, ...
    'XColor', bodyText, 'YColor', bodyText, 'Color', pageWhite, 'GridColor', [0.8 0.8 0.84], 'GridAlpha', 0.6);   % white plot area: the default theme can be dark, which hides the value labels
ylim(ax3, [0 1.12]);
ylabel(ax3, 'Probability', 'Color', navyText, 'FontSize', 9);
xlabel(ax3, reportText.probabilityNote, 'Color', mutedText, 'FontSize', 6.5);
grid(ax3, 'on');
box(ax3, 'off');
for i = 1:numel(result.probs)
    text(ax3, i, result.probs(i) + 0.045, sprintf('%.0f%%', result.probs(i)*100), ...
        'HorizontalAlignment', 'center', 'FontSize', 8, 'FontWeight', 'bold', ...
        'Color', navyText);
end

% ---- Referral badge: rounded pill, RetinaRescue-style ----
badgeTop = chartTop;
badgeH   = 0.032;
if result.isReferable
    badgeColor = red;
    badgeText  = 'REFERRAL RECOMMENDED';
else
    badgeColor = slate;
    badgeText  = 'NO REFERRAL FLAGGED';   % never "routine"/"normal": the tool can miss disease
end
rectangle(bg, 'Position', [rightX, badgeTop-badgeH, colWidth, badgeH], ...
    'FaceColor', badgeColor, 'EdgeColor', 'none', 'Curvature', 0.35);
text(bg, rightX+colWidth/2, badgeTop-badgeH/2, badgeText, ...
    'Color', 'w', 'FontSize', 11.5, 'FontWeight', 'bold', ...
    'HorizontalAlignment', 'center', 'VerticalAlignment', 'middle');

icdrY = badgeTop - badgeH - 0.028;
text(bg, rightX, icdrY, reportText.icdrLevel, ...
    'FontSize', 11, 'FontWeight', 'bold', 'Color', navyText, ...
    'VerticalAlignment', 'top');

bodyBlock = sprintf('%s\n\n%s\n\n%s', ...
    reportText.confidenceNote, reportText.referralLine, reportText.disclaimer);
annotation(fig, 'textbox', ...
    [rightX, chartTop-row2H, colWidth, (icdrY-0.03)-(chartTop-row2H)], ...
    'String', bodyBlock, 'FontSize', 9, 'Color', bodyText, ...
    'EdgeColor', 'none', 'VerticalAlignment', 'top');

% ---- Footer: dark navy strip, matching app chrome ----
footerH = 0.032;
rectangle(bg, 'Position', [0, 0, 1, footerH], ...
    'FaceColor', navyDark, 'EdgeColor', 'none');
text(bg, 0.5, footerH/2, ...
    sprintf('RETINARESCUE  \\bullet  Automated screening aid \\bullet  Image: %s', baseName), ...
    'Color', 'w', 'FontSize', 8, 'HorizontalAlignment', 'center', ...
    'VerticalAlignment', 'middle');

% ---- Save output (PDF only) ----
pdfPath = fullfile(outputDir, [baseName '_report.pdf']);

print(fig, pdfPath, '-dpdf', '-r300');

close(fig);

outputPaths.pdf = pdfPath;

fprintf('Report saved:\n  %s\n', pdfPath);

end


function sectionHeader(bg, x, topY, str, accentColor, textColor)
% Small gold accent tick + bold caption, RetinaRescue section-header style.
rectangle(bg, 'Position', [x, topY-0.014, 0.006, 0.014], ...
    'FaceColor', accentColor, 'EdgeColor', 'none');
text(bg, x+0.014, topY-0.007, str, ...
    'FontSize', 10, 'FontWeight', 'bold', 'Color', textColor, ...
    'VerticalAlignment', 'middle', 'Interpreter', 'tex');
end


