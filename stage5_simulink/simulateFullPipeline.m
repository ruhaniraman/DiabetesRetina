function results = simulateFullPipeline(numPatients, arrivalRatePerHour, ...
    numCameras, avgCaptureMin, ...
    numServers, avgComputeMin, ...
    numSpecialists, avgReviewMin, referableRate)
% SIMULATEFULLPIPELINE 3-Stage Queueing Simulation for DR Screening
% Stages: 1) Camera Capture -> 2) AI Processing -> 3) Human Specialist Review

    %% STAGE 1: Image Capture (Primary Healthcare Center)
    meanInterArrival = 60 / arrivalRatePerHour;
    arrivalTimes = cumsum(exprnd(meanInterArrival, numPatients, 1));
    
    cameraFreeAt = zeros(numCameras, 1);
    captureEndTimes = zeros(numPatients, 1);
    waitCapture = zeros(numPatients, 1);
    
    for i = 1:numPatients
        [earliestFree, idx] = min(cameraFreeAt);
        startT = max(arrivalTimes(i), earliestFree);
        waitCapture(i) = startT - arrivalTimes(i);
        
        dur = exprnd(avgCaptureMin);
        captureEndTimes(i) = startT + dur;
        cameraFreeAt(idx) = captureEndTimes(i);
    end

    %% STAGE 2: AI Processing (Cloud / Edge Server)
    % Patients arrive at the AI server exactly when their capture finishes.
    % We must sort them because patient 2 might finish capture before patient 1.
    computeArrivals = sort(captureEndTimes);
    
    serverFreeAt = zeros(numServers, 1);
    computeEndTimes = zeros(numPatients, 1);
    waitCompute = zeros(numPatients, 1);
    
    for i = 1:numPatients
        [earliestFree, idx] = min(serverFreeAt);
        startT = max(computeArrivals(i), earliestFree);
        waitCompute(i) = startT - computeArrivals(i);
        
        dur = exprnd(avgComputeMin);
        computeEndTimes(i) = startT + dur;
        serverFreeAt(idx) = computeEndTimes(i);
    end

    %% STAGE 3: Ophthalmologist Review (Central Hub)
    % Only patients flagged with referable DR (Level 2+) are sent to the doctor.
    isReferable = rand(numPatients, 1) < referableRate;
    specialistArrivals = computeEndTimes(isReferable);
    numReferable = length(specialistArrivals);
    
    specialistFreeAt = zeros(numSpecialists, 1);
    reviewEndTimes = zeros(numReferable, 1);
    waitSpecialist = zeros(numReferable, 1);
    
    for i = 1:numReferable
        [earliestFree, idx] = min(specialistFreeAt);
        startT = max(specialistArrivals(i), earliestFree);
        waitSpecialist(i) = startT - specialistArrivals(i);
        
        dur = exprnd(avgReviewMin);
        reviewEndTimes(i) = startT + dur;
        specialistFreeAt(idx) = reviewEndTimes(i);
    end

    %% Package Results
    results.avgWaitCapture = mean(waitCapture);
    results.avgWaitCompute = mean(waitCompute);
    
    if numReferable > 0
        results.avgWaitSpecialist = mean(waitSpecialist);
    else
        results.avgWaitSpecialist = 0;
    end
    
    results.totalTimeSimulated = max([cameraFreeAt; serverFreeAt; specialistFreeAt]);
    results.numFlagged = numReferable;
end