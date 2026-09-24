function varargout = lesionPR(mode, varargin)
% LESIONPR  Pixel-level precision-recall for lesion maps, pooled over many images (the IDRiD challenge's measure).
%
%   H = lesionPR('init', nChannels)                  empty histograms (1000 probability bins per channel)
%   H = lesionPR('add', H, P, G, mask)               add one image: P HxWxC probabilities, G HxWxC logical truth, mask HxW
%   S = lesionPR('summary', H)                       per channel: AUPR, best Dice and the threshold that gives it
%
% Histograms make pooling over tens of millions of pixels cheap. AUPR is the average precision (area under the stepwise
% precision-recall curve), as in the IDRiD segmentation challenge.
    nb = 1000;
    switch mode
        case 'init'
            varargout{1} = struct('pos', zeros(nb, varargin{1}), 'neg', zeros(nb, varargin{1}));
        case 'add'
            [H, P, G, mask] = varargin{:};
            for c = 1:size(P, 3)
                p = P(:, :, c); g = G(:, :, c);
                p = p(mask); g = g(mask);
                bin = min(nb, floor(double(p) * nb) + 1);
                H.pos(:, c) = H.pos(:, c) + accumarray(bin(g), 1, [nb 1]);
                H.neg(:, c) = H.neg(:, c) + accumarray(bin(~g), 1, [nb 1]);
            end
            varargout{1} = H;
        case 'summary'
            H = varargin{1};
            C = size(H.pos, 2);
            S = struct('aupr', nan(1, C), 'bestDice', nan(1, C), 'bestThreshold', nan(1, C), 'positives', sum(H.pos, 1));
            for c = 1:C
                tp = cumsum(flipud(H.pos(:, c)));          % predicting "lesion" for p >= threshold, from the top bin down
                fp = cumsum(flipud(H.neg(:, c)));
                P = tp(end);
                if P == 0, continue; end
                recall = tp / P;
                precision = tp ./ max(tp + fp, 1);
                S.aupr(c) = sum(diff([0; recall]) .* precision);
                dice = 2 * tp ./ max(2 * tp + fp + (P - tp), 1);
                [S.bestDice(c), k] = max(dice);
                S.bestThreshold(c) = (nb - k) / nb;         % bin lower edge of the k-th bin from the top
            end
            varargout{1} = S;
    end
end
