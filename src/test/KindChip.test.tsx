import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import KindChip from '../components/ui/KindChip';

// The chip marks a person's kind wherever they appear (#1152, ADR 0030) — but
// only when it says something. Most people in the system are Contacts, and a
// chip on every row teaches the eye to skip all chips, including the ones that
// matter, so a Contact carries none.
describe('KindChip', () => {
  it('marks a Local saint', () => {
    render(<KindChip contact={{ inChurchLife: true, isStudent: false }} />);
    expect(screen.getByText('Local saint')).toBeTruthy();
  });

  it('marks Our own', () => {
    render(<KindChip contact={{ inChurchLife: true, isStudent: true }} />);
    expect(screen.getByText('Our own')).toBeTruthy();
  });

  it('renders nothing for a Contact', () => {
    const { container } = render(<KindChip contact={{ inChurchLife: false, isStudent: true }} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing for a legacy document carrying neither field', () => {
    const { container } = render(<KindChip contact={{}} />);
    expect(container.firstChild).toBeNull();
  });

  it('uses design tokens rather than hardcoded colours', () => {
    const { container } = render(<KindChip contact={{ inChurchLife: true, isStudent: false }} />);
    expect((container.firstChild as HTMLElement).className).toMatch(/bg-stage-/);
  });
});
