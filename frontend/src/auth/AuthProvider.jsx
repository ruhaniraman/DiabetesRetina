import { useCallback, useEffect, useMemo, useState } from 'react';
import { clearToken, fetchMe, getToken, logoutRequest, setToken } from '../api/auth';
import { setUnauthorizedHandler } from '../api/ml';
import { AuthContext } from './authContext';

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState(() => (getToken() ? 'loading' : 'anonymous'));

  // Restore the session on page load.
  useEffect(() => {
    if (!getToken()) return undefined;
    let cancelled = false;
    fetchMe()
      .then(({ user: me }) => {
        if (cancelled) return;
        setUser(me);
        setStatus('authenticated');
      })
      .catch((err) => {
        if (cancelled) return;
        // Only drop the token when the server says it is invalid; keep it if the server was merely unreachable.
        if (err.status === 401 || err.status === 403) clearToken();
        setStatus('anonymous');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback((token, me) => {
    setToken(token);
    setUser(me);
    setStatus('authenticated');
  }, []);

  const endSession = useCallback(() => {
    clearToken();
    sessionStorage.clear(); // drop anything left over from older versions; health data now lives on the server
    setUser(null);
    setStatus('anonymous');
  }, []);

  const signOut = useCallback(async () => {
    try {
      await logoutRequest(); // revokes the token on the server; best effort
    } catch {
      /* the local session is ended regardless */
    }
    endSession();
  }, [endSession]);

  // If the ML backend reports an expired or revoked session, end it locally.
  useEffect(() => {
    setUnauthorizedHandler(endSession);
    return () => setUnauthorizedHandler(null);
  }, [endSession]);

  const value = useMemo(() => ({ user, status, signIn, signOut }), [user, status, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
