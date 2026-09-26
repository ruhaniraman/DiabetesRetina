import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProfileMenu from './ProfileMenu';
import '../i18n';

const setup = () => {
  const props = { onEditPatient: vi.fn(), onStartTour: vi.fn(), onLogout: vi.fn(), onDeleteAccount: vi.fn().mockResolvedValue() };
  render(<ProfileMenu name="Asha Rao" phone="+918050500000" {...props} />);
  return { user: userEvent.setup({ delay: null }), props };
};
const openMenu = (user) => user.click(screen.getByRole('button', { name: /account menu/i }));

describe('ProfileMenu', () => {
  it('shows only the profile button until it is opened, then who is signed in and the options, with delete account last', async () => {
    const { user } = setup();
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.queryByRole('button', { name: /delete account/i })).toBeNull();
    await openMenu(user);
    const menu = screen.getByRole('menu');
    expect(within(menu).getByText('Asha Rao')).toBeTruthy();
    expect(within(menu).getByText('+918050500000')).toBeTruthy();
    const items = within(menu).getAllByRole('menuitem').map((b) => b.textContent);
    expect(items).toEqual(['Edit patient profile', 'Take the tour of the website', 'Log Out', 'Delete account']);
  });

  it('runs the chosen option and closes the menu', async () => {
    const { user, props } = setup();
    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Log Out' }));
    expect(props.onLogout).toHaveBeenCalled();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('asks for the password before deleting the account', async () => {
    const { user, props } = setup();
    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: /delete account/i }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(props.onDeleteAccount).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText(/password to confirm/i), 'Secret-1');
    await user.click(screen.getByRole('button', { name: /delete permanently/i }));
    expect(props.onDeleteAccount).toHaveBeenCalledWith('Secret-1');
  });

  it('closes on Escape', async () => {
    const { user } = setup();
    await openMenu(user);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
