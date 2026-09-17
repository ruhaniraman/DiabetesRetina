function visualizeLocalization(idrid, imageIndex)
%VISUALIZELOCALIZATION Display an IDRiD image with OD and fovea ground truth.
%
%   visualizeLocalization(idrid, imageIndex)
%
%   imageIndex = index of the image in the localization training datastore.

% Read image
img = readimage(idrid.localization.trainImages, imageIndex);

% Get corresponding ground-truth rows
od = idrid.localization.odTrain(imageIndex, :);
fovea = idrid.localization.foveaTrain(imageIndex, :);

% Extract coordinates
odX = od.X_Coordinate;
odY = od.Y_Coordinate;

foveaX = fovea.X_Coordinate;
foveaY = fovea.Y_Coordinate;

% Display image
figure;
imshow(img);
hold on;

% Optic disc
plot(odX, odY, 'r+', 'MarkerSize', 20, 'LineWidth', 3);

% Fovea
plot(foveaX, foveaY, 'b+', 'MarkerSize', 20, 'LineWidth', 3);

% Labels
text(odX + 30, odY, 'Optic Disc', ...
    'Color', 'red', ...
    'FontSize', 12, ...
    'FontWeight', 'bold');

text(foveaX + 30, foveaY, 'Fovea', ...
    'Color', 'blue', ...
    'FontSize', 12, ...
    'FontWeight', 'bold');

title(sprintf('IDRiD Localization - Image %d', imageIndex));

legend('Optic Disc', 'Fovea');
hold off;

end