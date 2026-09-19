function results = simulateCaptureQueue(numPatients, arrivalRatePerHour, numStations, avgCaptureMinutes)
% SIMULATECAPTUREQUEUE  Discrete-event simulation of patients queueing
% for fundus image capture at a screening center.
%
%   results = simulateCaptureQueue(numPatients, arrivalRatePerHour, numStations, avgCaptureMinutes)
%
%   Inputs:
%     numPatients        - how many patients to simulate
%     arrivalRatePerHour - average number of patients arriving per hour
%     numStations        - number of camera capture stations available
%     avgCaptureMinutes  - average time to capture one patient's images
%
%   Returns a struct "results" with:
%     waitTimes    - how long each patient waited before capture started
%     avgWait      - mean wait time (minutes)
%     maxWait      - worst-case wait time (minutes)
%     utilization  - fraction of time stations were busy (0-1)
%
%   HOW THIS SIMULATION WORKS (discrete-event simulation, no toolbox
%   needed): rather than dragging visual blocks (which is what SimEvents
%   would normally do), we generate random patient arrival times and
%   random capture durations, then track when each station becomes free
%   and assign each patient to the next available station -- this is
%   the exact same underlying logic SimEvents blocks perform internally,
%   just written directly as code.
%
%   Arrival and service times use the EXPONENTIAL distribution -- this
%   is the standard, well-justified choice in queueing theory for
%   modeling "random independent arrivals" (formally: a Poisson arrival
%   process has exponentially-distributed times BETWEEN arrivals). It's
%   not an arbitrary choice; this is exactly what queueing theory (M/M/c
%   models) assumes, so results can be cross-checked against known
%   formulas.
%
%   NOTE (MATLAB basics):
%   - exprnd(mu, n, 1) generates n random numbers from an exponential
%     distribution with mean mu. Each call gives a different random
%     result -- run this function multiple times and you'll get
%     slightly different numbers, which is expected and realistic
%     (real patient arrivals are random too).
%   - A "for" loop processing patients one at a time, tracking each
%     station's next-free time in an array, is the simplest correct way
%     to hand-build a queueing simulation.

    meanInterArrival = 60 / arrivalRatePerHour;   % minutes between arrivals, on average
    interArrivalTimes = exprnd(meanInterArrival, numPatients, 1);
    arrivalTimes = cumsum(interArrivalTimes);     % actual clock time each patient shows up

    serviceTimes = exprnd(avgCaptureMinutes, numPatients, 1);

    stationFreeAt = zeros(numStations, 1);   % when each station next becomes available
    waitTimes = zeros(numPatients, 1);
    totalBusyTime = 0;

    for i = 1:numPatients
        [earliestFreeTime, stationIdx] = min(stationFreeAt);

        startTime = max(arrivalTimes(i), earliestFreeTime);
        waitTimes(i) = startTime - arrivalTimes(i);

        finishTime = startTime + serviceTimes(i);
        stationFreeAt(stationIdx) = finishTime;

        totalBusyTime = totalBusyTime + serviceTimes(i);
    end

    totalSimTime = max(stationFreeAt);
    utilization = totalBusyTime / (numStations * totalSimTime);

    results.waitTimes = waitTimes;
    results.avgWait = mean(waitTimes);
    results.maxWait = max(waitTimes);
    results.utilization = utilization;
end
