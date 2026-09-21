import { useCallback, useState } from 'react';
import { emptyPatient } from '../utils/patient';

const KEY = 'retina_rescue_patient';

/**
 * The patient's clinical profile, kept in sessionStorage so a page refresh doesn't lose it.
 * sessionStorage (not localStorage) on purpose: health data is wiped when the tab closes, and
 * AuthProvider clears it on sign-out. There is no server-side profile store yet.
 */
export function usePatientProfile(user) {
  const [patient, setPatientState] = useState(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(KEY));
      if (saved && typeof saved === 'object') return { ...emptyPatient, ...saved };
    } catch {
      /* unreadable or unavailable storage: start empty */
    }
    return { ...emptyPatient, fullName: user?.fullName || '' };
  });

  const setPatient = useCallback((next) => {
    setPatientState(next);
    try {
      sessionStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* storage full or blocked: the in-memory copy still works */
    }
  }, []);

  return [patient, setPatient];
}
