function root = projectRoot()
% PROJECTROOT  Absolute path of the repository root (the folder that
% contains utils/, stage_3/, stage4_explainability/, ...).
%
% Resolved from this file's own location, so scripts and tests work no
% matter which folder MATLAB's current directory happens to be.
    root = fileparts(fileparts(mfilename('fullpath')));
end
