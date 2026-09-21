import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DeleteAccount from './DeleteAccount';
import '../i18n';

const setup = (onDelete = vi.fn().mockResolvedValue()) => {
  render(<DeleteAccount onDelete={onDelete} />);
  return { user: userEvent.setup({ delay: null }), onDelete };
};
const open = (user) => user.click(screen.getByRole('button', { name: /delete account/i }));

describe('DeleteAccount', () => {
  it('shows nothing destructive until the button is pressed, and says it cannot be undone', async () => {
    const { user } = setup();
    expect(screen.queryByRole('dialog')).toBeNull();
    await open(user);
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText(/cannot be undone/i)).toBeTruthy();
  });

  it('does not call the server without a password', async () => {
    const { user, onDelete } = setup();
    await open(user);
    await user.click(screen.getByRole('button', { name: /delete permanently/i }));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toMatch(/password/i);
  });

  it('sends the password and shows the server message when it is refused', async () => {
    const onDelete = vi.fn().mockRejectedValue(new Error('Incorrect password.'));
    const { user } = setup(onDelete);
    await open(user);
    await user.type(screen.getByLabelText(/password to confirm/i), 'wrong');
    await user.click(screen.getByRole('button', { name: /delete permanently/i }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Incorrect password.'));
    expect(onDelete).toHaveBeenCalledWith('wrong');
    expect(screen.getByRole('dialog')).toBeTruthy(); // still open, nothing was deleted
  });

  it('cancel closes the dialog without calling the server', async () => {
    const { user, onDelete } = setup();
    await open(user);
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onDelete).not.toHaveBeenCalled();
  });
});
