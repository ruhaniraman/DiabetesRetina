import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../api/auth', async (importOriginal) => ({
  ...(await importOriginal()),
  forgotPassword: vi.fn(),
  resetPassword: vi.fn(),
}));

import { forgotPassword, resetPassword, ApiError } from '../api/auth';
import ForgotPassword from './ForgotPassword';
import App from '../App';
import '../i18n';

const setup = () => {
  const onDone = vi.fn();
  render(<ForgotPassword onDone={onDone} onBackToLogin={() => {}} />);
  return { user: userEvent.setup({ delay: null }), onDone };
};

beforeEach(() => {
  forgotPassword.mockResolvedValue({ message: 'ok' });
  resetPassword.mockResolvedValue({ message: 'ok' });
  localStorage.clear();
});

describe('ForgotPassword', () => {
  it('validates the mobile number before calling the server', async () => {
    const { user } = setup();
    await user.type(screen.getByLabelText('Mobile number'), '12345');
    await user.click(screen.getByRole('button', { name: /send code/i }));
    expect(await screen.findByText('Enter a valid mobile number.')).toBeInTheDocument();
    expect(forgotPassword).not.toHaveBeenCalled();
  });

  it('never claims the account exists, then resets with code + new password', async () => {
    const { user, onDone } = setup();
    await user.type(screen.getByLabelText('Mobile number'), '98765 43210');
    await user.click(screen.getByRole('button', { name: /send code/i }));

    expect(forgotPassword).toHaveBeenCalledWith({ phone: '+919876543210' });
    expect(await screen.findByText(/If an account exists for \+919876543210/)).toBeInTheDocument();

    await user.type(screen.getByLabelText('Reset code'), '123456');
    await user.type(screen.getByLabelText('New password'), 'BrandNew123');
    await user.type(screen.getByLabelText('Confirm new password'), 'BrandNew123');
    await user.click(screen.getByRole('button', { name: /update password/i }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(resetPassword).toHaveBeenCalledWith({ phone: '+919876543210', code: '123456', password: 'BrandNew123' });
  });

  it('blocks weak or mismatched passwords locally', async () => {
    const { user } = setup();
    await user.type(screen.getByLabelText('Mobile number'), '9876500001');
    await user.click(screen.getByRole('button', { name: /send code/i }));
    await screen.findByLabelText('Reset code');

    await user.type(screen.getByLabelText('Reset code'), '123456');
    await user.type(screen.getByLabelText('New password'), 'weak');
    await user.type(screen.getByLabelText('Confirm new password'), 'different');
    await user.click(screen.getByRole('button', { name: /update password/i }));

    expect(await screen.findByText('Passwords do not match.')).toBeInTheDocument();
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it('shows the server error for a wrong code and stays on the form', async () => {
    resetPassword.mockRejectedValue(new ApiError('Incorrect code. 4 attempts left.', 400));
    const { user, onDone } = setup();
    await user.type(screen.getByLabelText('Mobile number'), '9876500001');
    await user.click(screen.getByRole('button', { name: /send code/i }));
    await screen.findByLabelText('Reset code');

    await user.type(screen.getByLabelText('Reset code'), '000000');
    await user.type(screen.getByLabelText('New password'), 'BrandNew123');
    await user.type(screen.getByLabelText('Confirm new password'), 'BrandNew123');
    await user.click(screen.getByRole('button', { name: /update password/i }));

    expect(await screen.findByText('Incorrect code. 4 attempts left.')).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
  });
});

describe('routing', () => {
  it('is reachable from the login page via "Forgot password?"', async () => {
    const user = userEvent.setup({ delay: null });
    render(
      <MemoryRouter initialEntries={['/login']}>
        <App />
      </MemoryRouter>,
    );
    await user.click(await screen.findByRole('button', { name: /forgot password/i }));
    expect(await screen.findByText('Reset your password')).toBeInTheDocument();
  });
});
