function [verdict, message, reasons, score] = assessFundusQualityFile(src)
% ASSESSFUNDUSQUALITYFILE  For the web app (STAGE1_ENGINE=matlab): assessFundusQuality on a file, with plain outputs the MATLAB
% Engine for Python passes cleanly.
%   verdict, message   char;  reasons  char, reason codes joined by commas;  score  the focus measure (lap_var_norm)
    [v, msg, r, m] = assessFundusQuality(imread(src));
    verdict = char(v);
    message = char(msg);
    reasons = char(strjoin(r, ','));
    score = double(m.lap_var_norm);
end
