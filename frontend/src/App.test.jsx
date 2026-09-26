import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import '../src/i18n';

const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );

describe('routing', () => {
  beforeEach(() => localStorage.clear());

  it.each(['/', '/report', '/patient-details'])('sends a signed-out user from %s to the login page', async (path) => {
    renderAt(path);
    expect(await screen.findByText('Welcome Back')).toBeInTheDocument();
  });

  it('sends the verify page to sign-up when there is no pending number', async () => {
    renderAt('/verify');
    expect(await screen.findByText('Create Account')).toBeInTheDocument();
  });
});
