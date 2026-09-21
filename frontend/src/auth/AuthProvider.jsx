import { useCallback, useEffect, useMemo, useState } from 'react';
import { deleteAccountRequest, fetchMe, forgetLegacyToken, logoutRequest } from '../api/auth';
import { setUnauthorizedHandler } from '../api/ml';
import { AuthContext } from './authContext';

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading');

  // Restore the session on page load: the browser sends the HttpOnly cookie, the server says whether it is still valid.
  useEffect(() => {
    forgetLegacyToken();
    let cancelled = false;
    fetchMe()
      .then(({ user: me }) => {
        if (cancelled) return;
        setUser(me);
        setStatus('authenticated');
      })
      .catch(() => {
        if (!cancelled) setStatus('anonymous');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback((me) => {
    setUser(me); // the server has already set the session cookie
    setStatus('authenticated');
  }, []);

  const endSession = useCallback(() => {
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

  // Permanently deletes the account on the server (needs the password); ends the session only once the server confirms.
  const deleteAccount = useCallback(
    async (password) => {
      await deleteAccountRequest(password);
      endSession();
    },
    [endSession]
  );

  // If the ML backend reports an expired or revoked session, end it locally.
  useEffect(() => {
    setUnauthorizedHandler(endSession);
    return () => setUnauthorizedHandler(null);
  }, [endSession]);

  const value = useMemo(() => ({ user, status, signIn, signOut, deleteAccount }), [user, status, signIn, signOut, deleteAccount]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
