import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { TeamPrayerRow, PersonalPrayerRow, AddPersonalPrayer } from '../components/landing/PrayerRows';
import { LanguageProvider } from '../components/LanguageProvider';

const contact = (over: any = {}) => ({ id: 'c1', name: 'Alice Smith', ...over } as any);

const prayer = (over: any = {}) => ({
  id: 'p1',
  burden: 'Peace for exams',
  date: new Date().toISOString(),
  status: 'ongoing',
  ...over,
} as any);

const personal = (over: any = {}) => ({
  id: 'pp1',
  title: 'My grandma',
  date: new Date().toISOString(),
  status: 'open',
  contactId: null,
  ...over,
} as any);

describe('TeamPrayerRow', () => {
  it('marks a prayer answered without an answer and opens the composer', () => {
    const onUpdateStatus = vi.fn();
    render(
      <TeamPrayerRow
        prayer={prayer({ status: 'pending' })}
        first
        onUpdateStatus={onUpdateStatus}
        onOpenContact={vi.fn()}
        onOpenPrayerLog={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText('answered'));
    expect(onUpdateStatus).toHaveBeenCalledWith('p1', 'answered', undefined, expect.any(String));
    expect(screen.getByText(/How was it answered/)).toBeInTheDocument();
  });

  it('marks answered directly when an answer already exists', () => {
    const onUpdateStatus = vi.fn();
    render(
      <TeamPrayerRow
        prayer={prayer({ status: 'answered', answer: 'Healed', answeredAt: 'Aug 1' })}
        first
        onUpdateStatus={onUpdateStatus}
        onOpenContact={vi.fn()}
        onOpenPrayerLog={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText('ongoing'));
    expect(onUpdateStatus).toHaveBeenCalledWith('p1', 'ongoing', undefined, undefined);
  });

  it('saves an answered testimony through the composer', () => {
    const onUpdateStatus = vi.fn();
    render(
      <TeamPrayerRow
        prayer={prayer({ status: 'pending' })}
        first
        onUpdateStatus={onUpdateStatus}
        onOpenContact={vi.fn()}
        onOpenPrayerLog={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText('answered'));
    fireEvent.change(screen.getByPlaceholderText(/A sentence on how God answered/), {
      target: { value: 'It worked out' },
    });
    fireEvent.click(screen.getByText('Save'));
    expect(onUpdateStatus).toHaveBeenCalledWith('p1', 'answered', 'It worked out', expect.any(String));
  });

  it('edits an existing testimony', () => {
    const onUpdateStatus = vi.fn();
    render(
      <TeamPrayerRow
        prayer={prayer({ status: 'answered', answer: 'Old', answeredAt: 'Aug 1' })}
        first
        onUpdateStatus={onUpdateStatus}
        onOpenContact={vi.fn()}
        onOpenPrayerLog={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText('Edit Testimony'));
    const textarea = screen.getByPlaceholderText(/A sentence on how God answered/);
    fireEvent.change(textarea, { target: { value: 'New testimony' } });
    fireEvent.click(screen.getByText('Save'));
    expect(onUpdateStatus).toHaveBeenCalledWith('p1', 'answered', 'New testimony', 'Aug 1');
  });

  it('skips out of the composer without saving', () => {
    const onUpdateStatus = vi.fn();
    render(
      <TeamPrayerRow
        prayer={prayer({ status: 'pending' })}
        first
        onUpdateStatus={onUpdateStatus}
        onOpenContact={vi.fn()}
        onOpenPrayerLog={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText('answered'));
    fireEvent.click(screen.getByText('Skip'));
    expect(screen.queryByText(/How was it answered/)).not.toBeInTheDocument();
  });

  it('updates prayer status even when prayer has prayerPage true', () => {
    const onUpdateStatus = vi.fn();
    render(
      <TeamPrayerRow
        prayer={prayer({ status: 'pending', prayerPage: true })}
        first
        onUpdateStatus={onUpdateStatus}
        onOpenContact={vi.fn()}
        onOpenPrayerLog={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText('answered'));
    expect(onUpdateStatus).toHaveBeenCalled();
  });

  it('renders a subtle stale badge when the contact has had no interaction in >30 days or no interactions', () => {
    const staleDate = new Date(Date.now() - 40 * 86_400_000).toISOString();
    const staleContact = contact({ lastContactedDate: staleDate });

    const { rerender } = render(
      <TeamPrayerRow
        prayer={prayer()}
        contact={staleContact}
        first
        onUpdateStatus={vi.fn()}
        onOpenContact={vi.fn()}
        onOpenPrayerLog={vi.fn()}
      />
    );

    expect(screen.getByTestId('stale-badge')).toBeInTheDocument();
    expect(screen.getByText(/No contact in 40d/i)).toBeInTheDocument();

    // Active contact (< 30 days)
    const recentDate = new Date(Date.now() - 5 * 86_400_000).toISOString();
    const activeContact = contact({ lastContactedDate: recentDate });

    rerender(
      <TeamPrayerRow
        prayer={prayer()}
        contact={activeContact}
        first
        onUpdateStatus={vi.fn()}
        onOpenContact={vi.fn()}
        onOpenPrayerLog={vi.fn()}
      />
    );

    expect(screen.queryByTestId('stale-badge')).not.toBeInTheDocument();
  });

  it('opens the contact and the prayer log', () => {
    const onOpenContact = vi.fn();
    const onOpenPrayerLog = vi.fn();
    render(
      <TeamPrayerRow
        prayer={prayer()}
        contact={contact()}
        first
        onUpdateStatus={vi.fn()}
        onOpenContact={onOpenContact}
        onOpenPrayerLog={onOpenPrayerLog}
      />
    );
    fireEvent.click(screen.getByText('for Alice Smith'));
    expect(onOpenContact).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }));
    fireEvent.click(screen.getByText('Prayer Log'));
    expect(onOpenPrayerLog).toHaveBeenCalled();
  });
});

describe('PersonalPrayerRow', () => {
  it('marks a prayer answered and opens the composer', () => {
    const onUpdate = vi.fn();
    render(
      <PersonalPrayerRow
        prayer={personal({ status: 'open' })}
        first
        contacts={[]}
        onUpdate={onUpdate}
        onDelete={vi.fn()}
        onOpenContact={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText('answered'));
    expect(onUpdate).toHaveBeenCalledWith('pp1', { status: 'answered', answeredAt: expect.any(String) });
    expect(screen.getByText(/How was it answered/)).toBeInTheDocument();
  });

  it('saves an answered body', () => {
    const onUpdate = vi.fn();
    render(
      <PersonalPrayerRow
        prayer={personal({ status: 'open' })}
        first
        contacts={[]}
        onUpdate={onUpdate}
        onDelete={vi.fn()}
        onOpenContact={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText('answered'));
    fireEvent.change(screen.getByPlaceholderText(/A sentence on how God answered/), {
      target: { value: 'Praise God' },
    });
    fireEvent.click(screen.getByText('Save'));
    expect(onUpdate).toHaveBeenCalledWith('pp1', {
      status: 'answered',
      answeredBody: 'Praise God',
      answeredAt: expect.any(String),
    });
  });

  it('edits an answered testimony on a personal prayer', () => {
    const onUpdate = vi.fn();
    render(
      <PersonalPrayerRow
        prayer={personal({ status: 'answered', answeredBody: 'Old', answeredAt: 'Aug 1' })}
        first
        contacts={[]}
        onUpdate={onUpdate}
        onDelete={vi.fn()}
        onOpenContact={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText('Edit Testimony'));
    const textarea = screen.getByPlaceholderText(/A sentence on how God answered/);
    fireEvent.change(textarea, { target: { value: 'Renewed' } });
    fireEvent.click(screen.getByText('Save'));
    expect(onUpdate).toHaveBeenCalledWith('pp1', {
      status: 'answered',
      answeredBody: 'Renewed',
      answeredAt: 'Aug 1',
    });
  });

  it('opens the linked contact from a personal prayer', () => {
    const onOpenContact = vi.fn();
    render(
      <PersonalPrayerRow
        prayer={personal({ contactId: 'c1' })}
        first
        contacts={[contact()]}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onOpenContact={onOpenContact}
      />
    );
    fireEvent.click(screen.getByText('for Alice Smith'));
    expect(onOpenContact).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }));
  });

  it('saves an edited title and a linked contact', () => {
    const onUpdate = vi.fn();
    render(
      <PersonalPrayerRow
        prayer={personal()}
        first
        contacts={[contact()]}
        onUpdate={onUpdate}
        onDelete={vi.fn()}
        onOpenContact={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText('My grandma'));
    fireEvent.change(screen.getByPlaceholderText('What are you praying for?'), {
      target: { value: 'Grandma June' },
    });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'c1' } });
    fireEvent.click(screen.getByText('Save'));
    expect(onUpdate).toHaveBeenCalledWith('pp1', { title: 'Grandma June', contactId: 'c1' });
  });

  it('cancels an in-progress edit without saving', () => {
    const onUpdate = vi.fn();
    render(
      <PersonalPrayerRow
        prayer={personal()}
        first
        contacts={[]}
        onUpdate={onUpdate}
        onDelete={vi.fn()}
        onOpenContact={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText('My grandma'));
    fireEvent.change(screen.getByPlaceholderText('What are you praying for?'), {
      target: { value: 'Changed' },
    });
    fireEvent.click(screen.getByText('Cancel'));
    expect(onUpdate).not.toHaveBeenCalled();
    expect(screen.getByText('My grandma')).toBeInTheDocument();
  });

  it('deletes the personal prayer from the edit view', () => {
    const onDelete = vi.fn();
    render(
      <PersonalPrayerRow
        prayer={personal()}
        first
        contacts={[]}
        onUpdate={vi.fn()}
        onDelete={onDelete}
        onOpenContact={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText('My grandma'));
    fireEvent.click(screen.getByText('Delete'));
    expect(onDelete).toHaveBeenCalledWith('pp1');
  });

  it('shows a "personal" label when no contact is linked', () => {
    render(
      <PersonalPrayerRow
        prayer={personal()}
        first
        contacts={[]}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onOpenContact={vi.fn()}
      />
    );
    expect(screen.getByText('personal')).toBeInTheDocument();
  });
});

describe('AddPersonalPrayer', () => {
  it('adds a titled prayer with no contact', () => {
    const onAdd = vi.fn();
    render(<AddPersonalPrayer onAdd={onAdd} />);
    fireEvent.click(screen.getByText('Add a personal prayer'));
    fireEvent.change(screen.getByPlaceholderText('What would you like to pray for?'), {
      target: { value: 'New prayer' },
    });
    fireEvent.click(screen.getByText('Add'));
    expect(onAdd).toHaveBeenCalledWith('New prayer', null);
  });

  it('adds a prayer tagged to a contact when contacts are provided', () => {
    const onAdd = vi.fn();
    render(<AddPersonalPrayer contacts={[contact()]} onAdd={onAdd} />);
    fireEvent.click(screen.getByText('Add a personal prayer'));
    fireEvent.change(screen.getByPlaceholderText('What would you like to pray for?'), {
      target: { value: 'For Alice' },
    });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'c1' } });
    fireEvent.click(screen.getByText('Add'));
    expect(onAdd).toHaveBeenCalledWith('For Alice', 'c1');
  });

  it('cancels the composer and clears its draft', () => {
    const onAdd = vi.fn();
    render(<AddPersonalPrayer onAdd={onAdd} />);
    fireEvent.click(screen.getByText('Add a personal prayer'));
    fireEvent.change(screen.getByPlaceholderText('What would you like to pray for?'), {
      target: { value: 'Draft' },
    });
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.getByText('Add a personal prayer')).toBeInTheDocument();
    expect(onAdd).not.toHaveBeenCalled();
  });
});

describe('PrayerRows Spanish translation', () => {
  it('renders TeamPrayerRow in Spanish', () => {
    const onUpdateStatus = vi.fn();
    render(
      <LanguageProvider defaultLanguage="es">
        <TeamPrayerRow
          prayer={prayer({ status: 'answered', answer: 'Old testimony', answeredAt: 'Aug 1' })}
          contact={contact()}
          first
          onUpdateStatus={onUpdateStatus}
          onOpenContact={vi.fn()}
          onOpenPrayerLog={vi.fn()}
        />
      </LanguageProvider>
    );
    expect(screen.getByText('por Alice Smith')).toBeInTheDocument();
    expect(screen.getByText('Registro de oración')).toBeInTheDocument();
    expect(screen.getByText('en curso')).toBeInTheDocument();
    expect(screen.getByText('contestada')).toBeInTheDocument();
    expect(screen.getByText('archivar')).toBeInTheDocument();
    expect(screen.getByText(/Contestada/)).toBeInTheDocument();
    expect(screen.getByText('Editar testimonio')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Editar testimonio'));
    expect(screen.getByText('¿Cómo fue contestada?')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Una frase sobre cómo Dios respondió/)).toBeInTheDocument();
    expect(screen.getByText('Omitir')).toBeInTheDocument();
    expect(screen.getByText('Guardar')).toBeInTheDocument();
  });

  it('renders PersonalPrayerRow in Spanish', () => {
    render(
      <LanguageProvider defaultLanguage="es">
        <PersonalPrayerRow
          prayer={personal()}
          first
          contacts={[contact()]}
          onUpdate={vi.fn()}
          onDelete={vi.fn()}
          onOpenContact={vi.fn()}
        />
      </LanguageProvider>
    );
    expect(screen.getByText('personal')).toBeInTheDocument();
    expect(screen.getByText('en curso')).toBeInTheDocument();
    expect(screen.getByText('contestada')).toBeInTheDocument();
    expect(screen.getByText('archivar')).toBeInTheDocument();

    // Click to open editor
    fireEvent.click(screen.getByText('personal'));
    expect(screen.getByPlaceholderText('¿Por qué estás orando?')).toBeInTheDocument();
    expect(screen.getByText('Para un contacto (opcional)')).toBeInTheDocument();
    expect(screen.getByText('— nadie en particular')).toBeInTheDocument();
    expect(screen.getByText('Eliminar')).toBeInTheDocument();
    expect(screen.getByText('Cancelar')).toBeInTheDocument();
    expect(screen.getByText('Guardar')).toBeInTheDocument();
  });

  it('renders AddPersonalPrayer in Spanish', () => {
    render(
      <LanguageProvider defaultLanguage="es">
        <AddPersonalPrayer contacts={[contact()]} onAdd={vi.fn()} />
      </LanguageProvider>
    );
    expect(screen.getByText('Añadir una oración personal')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Añadir una oración personal'));
    expect(screen.getByPlaceholderText('¿Por qué te gustaría orar?')).toBeInTheDocument();
    expect(screen.getByText('Para un contacto (opcional)')).toBeInTheDocument();
    expect(screen.getByText('— nadie en particular')).toBeInTheDocument();
    expect(screen.getByText('Cancelar')).toBeInTheDocument();
    expect(screen.getByText('Añadir')).toBeInTheDocument();
  });
});

