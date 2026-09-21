import { useCallback, useEffect, useState } from 'react';
import { deleteAllHealthData, getProfile, saveProfile } from '../api/patient';
import { emptyPatient } from '../utils/patient';

/**
 * The signed-in user's clinical profile, stored server-side (encrypted at rest).
 *
 * status: 'loading' | 'ready' | 'error'. On 'error' the profile shows as empty; `save` still works and
 * surfaces its own error to the form, so a temporary outage never blocks the rest of the app.
 */
export function usePatientProfile(user) {
  const blank = { ...emptyPatient, fullName: user?.fullName || '' };
  const [state, setState] = useState({ status: 'loading', patient: blank });

  useEffect(() => {
    let cancelled = false;
    getProfile()
      .then(({ profile }) => {
        if (!cancelled) setState({ status: 'ready', patient: profile ? { ...emptyPatient, ...profile } : blank });
      })
      .catch(() => {
        if (!cancelled) setState((s) => ({ ...s, status: 'error' }));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per signed-in user
  }, [user?.id]);

  // Throws on failure (the form shows the message); state only changes once the server has accepted it.
  const save = useCallback(async (next) => {
    const { profile } = await saveProfile(next);
    setState({ status: 'ready', patient: { ...emptyPatient, ...profile } });
  }, []);

  // Erases the profile and exam history on the server. The caller refreshes anything that shows exams.
  const eraseAll = useCallback(async () => {
    await deleteAllHealthData();
    setState({ status: 'ready', patient: { ...emptyPatient, fullName: user?.fullName || '' } });
  }, [user?.fullName]);

  return { patient: state.patient, status: state.status, save, eraseAll };
}
