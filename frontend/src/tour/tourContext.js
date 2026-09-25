import { createContext, useContext } from 'react';

// value: { active, start(), stop() }. null outside the signed-in app (the tour button is then hidden).
export const TourContext = createContext(null);

export const useTour = () => useContext(TourContext);
