import { createContext } from 'react';

// value: { user, status: 'loading' | 'authenticated' | 'anonymous', signIn(token, user), signOut() }
export const AuthContext = createContext(null);
