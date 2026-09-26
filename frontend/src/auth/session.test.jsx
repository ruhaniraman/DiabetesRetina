import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import AuthProvider from './AuthProvider';
import { useAuth } from './useAuth';
import { request } from '../api/auth';
import { checkQuality, downloadReportPdf } from '../api/ml';

const json = (status, body) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });

function Probe() {
  const { status, user } = useAuth();
  return <p>{status}:{user?.phone ?? 'nobody'}</p>;
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
    vi.stubGlobal('fetch', vi.fn(() => json(200, { user: { id: 1, phone: '+919876543210' } })));
    render(<AuthProvider><Probe /></AuthProvider>);
    expect(screen.getByText('loading:nobody')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('authenticated:+919876543210')).toBeInTheDocument());
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

  it('downloads the report with cookies, the CSRF header, both photographs and the patient details, and returns the PDF', async () => {
    const pdf = new Blob(['%PDF'], { type: 'application/pdf' });
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true, status: 200, blob: () => Promise.resolve(pdf) }));
    vi.stubGlobal('fetch', fetchMock);
    const left = new File(['l'], 'l.png');
    const right = new File(['r'], 'r.png');
    expect(await downloadReportPdf(left, right, { fullName: 'Asha Rao', dob: '1972-05-12' })).toBe(pdf);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/report-pdf$/);
    expect(init.credentials).toBe('include');
    expect(init.headers['X-Requested-With']).toBe('retina-rescue');
    expect(init.body.get('patientName')).toBe('Asha Rao');
    expect(init.body.get('patientDob')).toBe('1972-05-12');
    expect(init.body.get('leftEye')).toBeInstanceOf(File);
  });

  it('sends no patient fields when there is no profile, and reports the reason from the server on failure', async () => {
    const fetchMock = vi.fn(() => json(422, { detail: 'Left eye: Image rejected: too dark.' }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(downloadReportPdf(new File(['l'], 'l.png'), new File(['r'], 'r.png'), null)).rejects.toThrow('Left eye: Image rejected: too dark.');
    expect(fetchMock.mock.calls[0][1].body.has('patientName')).toBe(false);
  });
});
