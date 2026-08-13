import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UserAvatar } from '../components/ui/UserAvatar';

describe('UserAvatar', () => {
  it('renders an <img> when a photoURL is provided', () => {
    render(<UserAvatar name="Tony Wang" photoURL="https://example.com/tony.png" />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', 'https://example.com/tony.png');
    expect(img).toHaveAttribute('alt', 'Tony Wang');
  });

  it('renders initials instead of a broken image when photoURL is missing', () => {
    render(<UserAvatar name="Tony Wang" />);
    expect(screen.getByText('TW')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('renders a fallback when there is no name either', () => {
    render(<UserAvatar name={null} photoURL={null} />);
    expect(screen.getByText('??')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
