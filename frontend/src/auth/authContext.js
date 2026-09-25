import { createContext } from 'react';

// value: { user, status: 'loading' | 'authenticated' | 'anonymous', loginCount, signIn(user), signOut(), deleteAccount(password) }
export const AuthContext = createContext(null);
