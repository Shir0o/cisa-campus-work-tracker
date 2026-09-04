import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import Select from '../components/ui/Select';

describe('Select component', () => {
  it('renders a select element with appearance-none and chevron icon', () => {
    render(
      <Select data-testid="test-select" defaultValue="opt1">
        <option value="opt1">Option 1</option>
        <option value="opt2">Option 2</option>
      </Select>
    );

    const select = screen.getByTestId('test-select');
    expect(select).toBeInTheDocument();
    expect(select.tagName.toLowerCase()).toBe('select');
    expect(select.className).toContain('appearance-none');
    expect(select.className).toContain('pr-10');
  });

  it('triggers onChange properly when selection changes', () => {
    const handleChange = vi.fn();
    render(
      <Select data-testid="test-select" onChange={handleChange}>
        <option value="a">A</option>
        <option value="b">B</option>
      </Select>
    );

    fireEvent.change(screen.getByTestId('test-select'), { target: { value: 'b' } });
    expect(handleChange).toHaveBeenCalledTimes(1);
  });

  it('merges custom className and wrapperClassName', () => {
    render(
      <Select
        data-testid="test-select"
        className="custom-select-cls"
        wrapperClassName="custom-wrapper-cls"
      >
        <option value="1">1</option>
      </Select>
    );

    const select = screen.getByTestId('test-select');
    expect(select.className).toContain('custom-select-cls');
    expect(select.className).toContain('appearance-none');
    expect(select.parentElement?.className).toContain('custom-wrapper-cls');
  });
});
