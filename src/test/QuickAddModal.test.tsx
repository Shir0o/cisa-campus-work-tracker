// Quick add's web preview (§26): every parsed field is editable, a name-less
// note cannot save, and several name matches are all offered with none chosen.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import React from 'react';
import QuickAddModal from '../components/modals/QuickAddModal';
import { saveQuickAdd } from '../lib/quickAdd';
import { useAuth } from '../components/AuthProvider';

vi.mock('motion/react', () => {
  const cache = new Map<PropertyKey, any>();
  const motion = new Proxy(
    {},
    {
      get: (_target, prop) => {
        if (!cache.has(prop)) {
          cache.set(prop, ({ children, ...props }: any) => {
            const Tag = prop as any;
            return <Tag {...props}>{children}</Tag>;
          });
        }
        return cache.get(prop);
      },
    },
  );
  return { motion, AnimatePresence: ({ children }: any) => <>{children}</> };
});

beforeAll(() => {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

vi.mock('../components/AuthProvider', () => ({ useAuth: vi.fn() }));
vi.mock('../lib/quickAdd', () => ({ saveQuickAdd: vi.fn() }));
vi.mock('../lib/firebase', () => ({
  auth: { currentUser: { getIdToken: vi.fn().mockResolvedValue('token') } },
}));

const fetchMock = vi.fn();

const parsed = {
  contact: {
    name: 'Jordan Lee',
    phone: '(555) 010-2030',
    email: 'jordan-lee-contact',
    year: 'Sophomore',
    step: 'contact',
    tags: ['Bible study'],
  },
  match: [] as { id: string; name: string }[],
  interaction: { type: 'meeting', when: '2026-11-17', notes: 'Met at the club table' },
  prayer: 'pray for his exams',
  reminder: { when: '2026-11-24', text: 'Text Jordan about Bible study' },
};

const respond = (body: Record<string, unknown>) => {
  fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, ...body }) });
};

const parse = async (text = 'Met Jordan at the club table') => {
  const user = userEvent.setup();
  render(<QuickAddModal isOpen onClose={vi.fn()} stages={['lead', 'contact']} />);
  await user.type(screen.getByLabelText('What happened?'), text);
  await user.click(screen.getByRole('button', { name: 'Parse with Gemini' }));
  return user;
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  (useAuth as any).mockReturnValue({
    user: { uid: 'u1', displayName: 'Mei Tanaka', getIdToken: vi.fn().mockResolvedValue('token') },
    role: 'admin',
  });
  (saveQuickAdd as any).mockResolvedValue({ contactId: 'c-new', createdContact: true });
});

describe('QuickAddModal', () => {
  it('previews every parsed field, each in an editable field', async () => {
    respond(parsed);
    await parse();

    expect(await screen.findByDisplayValue('Jordan Lee')).toBeInTheDocument();
    expect(screen.getByDisplayValue('(555) 010-2030')).toBeInTheDocument();
    expect(screen.getByDisplayValue('jordan-lee-contact')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Met at the club table')).toBeInTheDocument();
    expect(screen.getByDisplayValue('pray for his exams')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Text Jordan about Bible study')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Bible study')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('blocks Save when no name was parsed and no match is picked', async () => {
    respond({
      contact: { name: '', phone: '', email: '', year: '', step: '', tags: [] },
      match: [],
    });
    const user = await parse('Someone from the quad');

    const save = await screen.findByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    await user.click(save);
    expect(saveQuickAdd).not.toHaveBeenCalled();
    expect(screen.getByText('Add a name, or pick someone already in your directory.')).toBeInTheDocument();
  });

  it('offers every name match and preselects none when there are several', async () => {
    respond({
      ...parsed,
      match: [
        { id: 'c1', name: 'Jordan Lee' },
        { id: 'c2', name: 'Jordan Lee' },
      ],
    });
    const user = await parse();

    const options = await screen.findAllByRole('button', { name: /Jordan Lee/ });
    expect(options).toHaveLength(2);
    for (const option of options) expect(option).toHaveAttribute('aria-pressed', 'false');

    // Saving now adds a new person, so both candidates are still on offer.
    expect(screen.getByRole('button', { name: /New person/ })).toHaveAttribute('aria-pressed', 'true');

    await user.click(options[1]);
    expect(options[1]).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(saveQuickAdd).toHaveBeenCalledWith(expect.objectContaining({ matchId: 'c2', matchName: 'Jordan Lee' }), expect.anything()),
    );
  });

  it('sends the interaction, prayer and reminder to one save', async () => {
    respond(parsed);
    const user = await parse();
    await user.click(await screen.findByRole('button', { name: 'Save' }));

    await waitFor(() => expect(saveQuickAdd).toHaveBeenCalledTimes(1));
    const [input] = (saveQuickAdd as any).mock.calls[0];
    expect(input).toMatchObject({
      contact: expect.objectContaining({ name: 'Jordan Lee', year: 'Sophomore', step: 'contact' }),
      interaction: { type: 'meeting', when: '2026-11-17', notes: 'Met at the club table' },
      prayer: 'pray for his exams',
      reminder: { when: '2026-11-24', text: 'Text Jordan about Bible study' },
    });
  });

  it('lets the parsed fields be edited before saving', async () => {
    respond(parsed);
    const user = await parse();
    const name = await screen.findByLabelText('Name');
    await user.clear(name);
    await user.type(name, 'Jordan A. Lee');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(saveQuickAdd).toHaveBeenCalledWith(
        expect.objectContaining({ contact: expect.objectContaining({ name: 'Jordan A. Lee' }) }),
        expect.anything(),
      ),
    );
  });
});
