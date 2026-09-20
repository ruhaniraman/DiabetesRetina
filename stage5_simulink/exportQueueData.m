% 1. Run your existing full pipeline simulation
% (e.g., 100 patients, 15 arrivals/hr, 2 cameras, 5min capture, etc.)
results = simulateFullPipeline(100, 15, 2, 5, 1, 2, 3, 10, 0.25);

% 2. Convert the MATLAB struct to a JSON string
jsonOutput = jsonencode(results);

% 3. Save it to a file that FastAPI can read
fid = fopen('pipeline_results.json', 'w');
if fid == -1, error('Cannot create JSON file'); end
fwrite(fid, jsonOutput, 'char');
fclose(fid);

disp('Simulation data exported to pipeline_results.json successfully.');