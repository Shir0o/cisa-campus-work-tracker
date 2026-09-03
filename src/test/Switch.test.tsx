import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { Switch } from '../components/ui/Switch';

describe('Switch', () => {
  it('renders with role="switch" and aria-checked reflecting the current value', () => {
    const { rerender } = render(<Switch checked={false} onChange={() => {}} aria-label="Club rush" />);
    const el = screen.getByRole('switch', { name: 'Club rush' });
    expect(el).toHaveAttribute('aria-checked', 'false');

    rerender(<Switch checked onChange={() => {}} aria-label="Club rush" />);
    expect(screen.getByRole('switch', { name: 'Club rush' })).toHaveAttribute('aria-checked', 'true');
  });

  it('calls onChange with the toggled value when activated', async () => {
    const onChange = vi.fn();
    render(<Switch checked={false} onChange={onChange} aria-label="Club rush" />);
    await userEvent.click(screen.getByRole('switch', { name: 'Club rush' }));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('calls onChange with false when toggling off', async () => {
    const onChange = vi.fn();
    render(<Switch checked onChange={onChange} aria-label="Club rush" />);
    await userEvent.click(screen.getByRole('switch', { name: 'Club rush' }));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('exposes a visible On/Off label so the state reads at a glance', () => {
    const { rerender } = render(<Switch checked={false} onChange={() => {}} aria-label="Club rush" />);
    // Off label is visible when the switch is off, and On label is not rendered.
    expect(screen.getByText('Off')).toBeVisible();
    expect(screen.queryByText('On')).not.toBeInTheDocument();

    rerender(<Switch checked onChange={() => {}} aria-label="Club rush" />);
    expect(screen.getByText('On')).toBeVisible();
    expect(screen.queryByText('Off')).not.toBeInTheDocument();
  });

  it('uses an off-track colour that is distinguishable from the on-track colour', () => {
    // The Ink palette uses dark neutrals for both bg-primary and bg-outline, so the
    // off state has to live on a token with clear contrast against the on state.
    render(<Switch checked={false} onChange={() => {}} aria-label="Club rush" />);
    const track = screen.getByRole('switch', { name: 'Club rush' });
    // Word-boundary match: `bg-outline-variant` must be present and the bare
    // `bg-outline` token must not, so the dark-on-dark regression can't sneak
    // back in through a substring false-positive.
    expect(track.className).toMatch(/(?:^|\s)bg-outline-variant(?:\s|$)/);
    expect(track.className).not.toMatch(/(?:^|\s)bg-outline(?:\s|$)/);
  });

  it('forwards className through to the button', () => {
    render(<Switch checked={false} onChange={() => {}} aria-label="Club rush" className="extra-class" />);
    expect(screen.getByRole('switch', { name: 'Club rush' })).toHaveClass('extra-class');
  });

  it('is disabled when the disabled prop is set', () => {
    render(<Switch checked={false} onChange={() => {}} aria-label="Club rush" disabled />);
    const el = screen.getByRole('switch', { name: 'Club rush' });
    expect(el).toBeDisabled();
  });
});