import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import AuthProvider from './AuthProvider';
import { useAuth } from './useAuth';
import { request } from '../api/auth';
import { checkQuality } from '../api/ml';

const json = (status, body) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });

function Probe() {
  const { status, user } = useAuth();
  return <p>{status}:{user?.email ?? 'nobody'}</p>;
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe('cookie session', () => {
  it('sends cookies and the CSRF header on every auth-server request, and never a token header', async () => {
    const fetchMock = vi.fn(() => json(200, {}));
    vi.stubGlobal('fetch', fetchMock);
    await request('/patient/profile');
    const [, init] = fetchMock.mock.calls[0];
    expect(init.credentials).toBe('include');
    expect(init.headers['X-Requested-With']).toBe('retina-rescue');
    expect(init.headers.Authorization).toBeUndefined();
  });

  it('does the same for the analysis server', async () => {
    const fetchMock = vi.fn(() => json(200, {}));
    vi.stubGlobal('fetch', fetchMock);
    await checkQuality(new File(['x'], 'a.png', { type: 'image/png' }));
    const [, init] = fetchMock.mock.calls[0];
    expect(init.credentials).toBe('include');
    expect(init.headers['X-Requested-With']).toBe('retina-rescue');
    expect(init.headers.Authorization).toBeUndefined();
  });

  it('restores the session when the server accepts the cookie', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json(200, { user: { id: 1, email: 'me@example.com' } })));
    render(<AuthProvider><Probe /></AuthProvider>);
    expect(screen.getByText('loading:nobody')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('authenticated:me@example.com')).toBeInTheDocument());
  });

  it('is signed out when the server rejects the cookie or is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json(401, { message: 'Not signed in.' })));
    const { unmount } = render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByText('anonymous:nobody')).toBeInTheDocument());
    unmount();
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('network'))));
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByText('anonymous:nobody')).toBeInTheDocument());
  });

  it('removes a token left in localStorage by an older version', async () => {
    localStorage.setItem('retina_rescue_token', 'old.jwt.token');
    vi.stubGlobal('fetch', vi.fn(() => json(401, {})));
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByText('anonymous:nobody')).toBeInTheDocument());
    expect(localStorage.getItem('retina_rescue_token')).toBeNull();
  });
});
