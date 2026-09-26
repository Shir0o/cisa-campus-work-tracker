import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ToolbarMenu from '../components/ui/ToolbarMenu';

describe('ToolbarMenu', () => {
  it('opens and closes strictly on click, not on hover', () => {
    vi.useFakeTimers();
    const onSelect = vi.fn();
    render(
      <ToolbarMenu
        label="Prompts"
        items={[
          { id: 'discuss', label: 'Discuss', onSelect },
          { id: 'question', label: 'Question', onSelect },
        ]}
      />
    );

    // Initial state: menu items are not present
    expect(screen.queryByRole('menuitem', { name: 'Discuss' })).not.toBeInTheDocument();

    // Hovering does NOT open the menu even after 500ms
    const trigger = screen.getByRole('button', { name: /^Prompts$/i });
    fireEvent.mouseEnter(trigger);
    vi.advanceTimersByTime(500);
    expect(screen.queryByRole('menuitem', { name: 'Discuss' })).not.toBeInTheDocument();

    // Clicking the trigger opens the menu
    fireEvent.click(trigger);
    expect(screen.getByRole('menuitem', { name: 'Discuss' })).toBeInTheDocument();

    // Clicking again toggles it closed
    fireEvent.click(trigger);
    expect(screen.queryByRole('menuitem', { name: 'Discuss' })).not.toBeInTheDocument();

    vi.useRealTimers();
  });

  it('closes when an item is selected and runs onSelect', () => {
    const onSelect = vi.fn();
    render(
      <ToolbarMenu
        label="Prompts"
        items={[
          { id: 'discuss', label: 'Discuss', onSelect },
        ]}
      />
    );

    const trigger = screen.getByRole('button', { name: /^Prompts$/i });
    fireEvent.click(trigger);
    const item = screen.getByRole('menuitem', { name: 'Discuss' });
    fireEvent.click(item);

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menuitem', { name: 'Discuss' })).not.toBeInTheDocument();
  });
});
