import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { onSnapshot } from 'firebase/firestore';
import Settings from '../views/Settings';
import { useAuth } from '../components/AuthProvider';
import { LanguageProvider } from '../components/LanguageProvider';
import { Switch } from '../components/ui/Switch';
import en from '../locales/en.json';
import es from '../locales/es.json';

// The Spanish render of Settings (#1818). Settings.test.tsx stubs
// LanguageProvider with `fallback ?? key`, so it can only ever prove the English
// copy. This spec leaves the provider real and mounts the page in Spanish, then
// asserts each unit's copy — including the two role pickers and the reminder
// summary line the original report missed.

// ── Mocks (same set as Settings.test.tsx, minus the language stub) ──────

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  Link: ({ to, children, ...props }: any) => {
    const { createElement } = require('react');
    return createElement('a', { href: to, ...props }, children);
  },
}));

vi.mock('../components/AuthProvider', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../components/ThemeProvider', () => ({
  useTheme: () => ({ theme: 'system', setTheme: vi.fn() }),
}));

vi.mock('../components/NavShellProvider', () => ({
  useNavShell: () => ({ preference: 'rail', effective: 'rail', setPreference: vi.fn() }),
  NavShellProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('../views/FeedbackList', () => ({
  default: () => {
    const { createElement } = require('react');
    return createElement('div', { 'data-testid': 'feedback-list' }, 'FeedbackList');
  },
}));

vi.mock('motion/react', () => {
  const { forwardRef, createElement, Fragment } = require('react');
  return {
    motion: {
      div: forwardRef(({ children, ...props }: any, ref: any) =>
        createElement('div', { ...props, ref }, children),
      ),
      button: forwardRef(({ children, ...props }: any, ref: any) =>
        createElement('button', { ...props, ref }, children),
      ),
    },
    AnimatePresence: ({ children }: any) => createElement(Fragment, null, children),
  };
});

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: any, path: string) => ({ path })),
  onSnapshot: vi.fn((_ref: any, callback: any) => {
    callback({ docs: [], size: 0 });
    return vi.fn();
  }),
  query: vi.fn((ref: any) => ref),
  orderBy: vi.fn(),
  doc: vi.fn((_db: any, coll: string, id: string) => ({ path: `${coll}/${id}`, id })),
  setDoc: vi.fn(() => Promise.resolve()),
  updateDoc: vi.fn(() => Promise.resolve()),
  deleteDoc: vi.fn(() => Promise.resolve()),
  getDocs: vi.fn(() => Promise.resolve({ docs: [] })),
  serverTimestamp: vi.fn(() => 'mock-timestamp'),
}));

vi.mock('../lib/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  sendNotification: vi.fn(() => Promise.resolve()),
  OperationType: { LIST: 'LIST', CREATE: 'CREATE', UPDATE: 'UPDATE', DELETE: 'DELETE' },
}));

const mfaMocks = vi.hoisted(() => ({
  listEnrolledFactors: vi.fn(() => []),
  hasTotpFactor: vi.fn(() => false),
  startTotpEnrollment: vi.fn(),
  unenrollTotpFactor: vi.fn(() => Promise.resolve()),
}));

vi.mock('../lib/mfa', () => ({
  listEnrolledFactors: mfaMocks.listEnrolledFactors,
  hasTotpFactor: mfaMocks.hasTotpFactor,
  startTotpEnrollment: mfaMocks.startTotpEnrollment,
  unenrollTotpFactor: mfaMocks.unenrollTotpFactor,
  TOTP_FACTOR_ID: 'totp',
}));

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(),
  sendEmailVerification: vi.fn(() => Promise.resolve()),
  reauthenticateWithCredential: vi.fn(() => Promise.resolve()),
  reauthenticateWithPopup: vi.fn(() => Promise.resolve()),
  EmailAuthProvider: { credential: vi.fn(() => ({ providerId: 'password' })) },
  GoogleAuthProvider: class {},
}));

// ── Fixtures ───────────────────────────────────────────────────────────

const USERS = [
  {
    id: 'u-admin',
    data: () => ({
      uid: 'u-admin',
      email: 'admin@test.com',
      displayName: 'Admin User',
      approved: true,
      role: 'admin',
      photoURL: null,
    }),
  },
  {
    id: 'u-alice',
    data: () => ({
      uid: 'u-alice',
      email: 'alice@test.com',
      displayName: 'Alice Johnson',
      approved: true,
      role: 'operator',
      photoURL: null,
    }),
  },
  {
    id: 'u-pending',
    data: () => ({
      uid: 'u-pending',
      email: 'pending@test.com',
      displayName: null,
      approved: false,
      role: 'viewer',
      photoURL: null,
    }),
  },
];

const INVITES = [
  {
    id: 'inv1',
    data: () => ({
      email: 'charlie@test.com',
      role: 'operator',
      approved: true,
      invitedBy: 'u-admin',
      createdAt: '2026-01-01',
    }),
  },
];

const WEBHOOK_LOGS = [
  {
    id: 'log1',
    data: () => ({
      source: 'GroupMe',
      status: 'success',
      result: 'Contact added: Jerry Doe',
      timestamp: '2026-06-17T12:00:00Z',
      payload: '{"text": "add contact Jerry"}',
      headers: '{"content-type": "application/json"}',
    }),
  },
  {
    id: 'log2',
    data: () => ({
      source: 'SMS',
      status: 'error',
      result: 'Parsing failed',
      timestamp: '2026-06-17T12:05:00Z',
      payload: 'invalid payload',
      headers: '{"content-type": "text/plain"}',
      error: 'Invalid format',
    }),
  },
];

// ── Helpers ────────────────────────────────────────────────────────────

const lookup = (dict: unknown, key: string): unknown =>
  key
    .split('.')
    .reduce<any>((node, seg) => (node && typeof node === 'object' ? node[seg] : undefined), dict);

function setupManagerAuth(overrides: Record<string, any> = {}) {
  (useAuth as any).mockReturnValue({
    user: {
      uid: 'u-admin',
      displayName: 'Admin User',
      email: 'admin@test.com',
      photoURL: null,
      emailVerified: true,
      providerData: [],
      getIdToken: vi.fn().mockResolvedValue('mock-id-token'),
    },
    isAdmin: true,
    isManager: true,
    role: 'admin',
    isApproved: true,
    ...overrides,
  });
}

/** Seed the Firestore subscriptions Settings mounts with. `silent` keeps a path
 *  pending (its snapshot callback never fires), which is how the loading copy
 *  is reached. */
function seedSnapshots(overrides: Record<string, any> = {}) {
  vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
    const path = ref?.path as string;
    if (path in overrides) {
      const snap = overrides[path];
      if (snap === 'silent') return vi.fn();
      callback(typeof snap === 'function' ? snap() : snap);
      return vi.fn();
    }
    if (path === 'users') callback({ docs: USERS });
    else if (path === 'invitations') callback({ docs: INVITES });
    else if (path === 'settings/integrations') {
      callback({ exists: () => true, data: () => ({ attdSyncToken: 'tok_abcdef' }) });
    } else callback({ docs: [], size: 0 });
    return vi.fn();
  });
}

function renderSpanish() {
  return render(
    <LanguageProvider defaultLanguage="es">
      <Settings />
    </LanguageProvider>,
  );
}

/** The mechanical "no English remains" check: for every key a unit adds, its
 *  English dictionary value must be absent from the Spanish render, and the two
 *  dictionary values must actually differ (which catches a copied translation). */
function expectNoEnglish(keys: string[]) {
  for (const key of keys) {
    const enValue = lookup(en, key);
    const esValue = lookup(es, key);
    expect(typeof enValue, `${key} is missing from en.json`).toBe('string');
    expect(typeof esValue, `${key} is missing from es.json`).toBe('string');
    expect(esValue, `${key} is still English in es.json`).not.toBe(enValue);
    expect(
      screen.queryByText(enValue as string),
      `${key} still renders its English copy`,
    ).toBeNull();
  }
}

const UNIT_1_KEYS = [
  'common.you',
  'settings.unnamed',
  'settings.member_options',
  'settings.edit_member',
  'settings.remove_access',
  'settings.invite_sent',
  'settings.waiting_to_sign_up',
  'settings.cancel_invite',
  'settings.asking_to_join_one',
  'settings.asking_to_join_many',
  'settings.wants_role',
  'settings.campus_user',
];

const UNIT_2_KEYS = [
  'settings.edit_your_name',
  'settings.display_name',
  'settings.display_name_example',
  'settings.role',
  'settings.your_name',
  'settings.remove_access_title',
  'settings.remove_access_body',
  'settings.add_by_email_title',
  'settings.add_by_email_body',
  'settings.email',
  'settings.email_placeholder',
  'settings.pre_add',
  'settings.adding',
];

const UNIT_3_KEYS = [
  'settings.quick_add_title',
  'settings.quick_add_sub',
  'settings.playground_title',
  'settings.gemini_ready',
  'settings.gemini_ready_help',
  'settings.gemini_missing',
  'settings.gemini_missing_help',
  'settings.gemini_checking',
  'settings.quick_add_intro',
  'settings.quick_add_placeholder',
  'settings.quick_add_reading',
  'settings.quick_add_try',
  'settings.quick_add_parsed',
  'settings.field_name',
  'settings.field_role_group',
  'settings.field_location',
  'settings.field_stage',
  'settings.field_notes',
  'settings.quick_add_failed',
  'settings.quick_add_error',
  'settings.quick_add_connection_error',
  'settings.channel_siri_title',
  'settings.channel_siri_blurb',
  'settings.channel_siri_body',
  'settings.channel_siri_step1',
  'settings.channel_siri_step2',
  'settings.channel_siri_step3',
  'settings.channel_siri_step4',
  'settings.curl_label',
  'settings.channel_sms_title',
  'settings.channel_sms_blurb',
  'settings.channel_sms_body',
  'settings.sms_webhook_label',
  'settings.channel_sms_step1',
  'settings.channel_sms_step2',
  'settings.channel_sms_step3',
  'settings.channel_groupme_title',
  'settings.channel_groupme_blurb',
  'settings.channel_groupme_body',
  'settings.groupme_webhook_label',
  'settings.channel_groupme_step1',
  'settings.channel_groupme_step2',
  'settings.channel_groupme_step3',
  'settings.prefix_triggers',
  'settings.prefix_triggers_body',
  'settings.parsing_options',
  'settings.parsing_options_body',
  'settings.parsing_default',
  'settings.parsing_contact_body',
  'settings.parsing_interaction_body',
  'attendanceSync.attd_loading_token',
  'attendanceSync.attd_hide_token',
  'attendanceSync.attd_show_token',
  'attendanceSync.attd_copy_token',
];

const UNIT_4_KEYS = [
  'settings.webhook_title',
  'settings.webhook_sub',
  'settings.webhook_clear',
  'settings.webhook_clear_confirm',
  'settings.webhook_listening',
  'settings.webhook_empty_title',
  'settings.webhook_empty_body',
  'settings.webhook_failure_detail',
  'settings.webhook_raw_payload',
  'settings.webhook_headers',
];

const UNIT_5_KEYS = ['common.on', 'common.off'];

const UNIT_6_KEYS = [
  'settings.edit_name',
  'settings.security.qr_label',
  'settings.whats_new_audience',
  'settings.audience_everyone',
  'settings.audience_staff',
  'settings.audience_admin',
  'reminders.no_days',
  // Found by the same whole-file pass, beyond the brief's table.
  'settings.security.hide_password',
  'settings.security.show_password',
  'settings.whats_new_save_failed',
  'settings.calendar_upcoming_count',
  'settings.calendar_nothing_coming_up',
  'settings.invite_exists',
  'settings.invite_failed',
  'settings.cancel_invite_confirm',
];

// ── Tests ──────────────────────────────────────────────────────────────

describe('Settings in Spanish (#1818)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    // LanguageProvider reads this before `defaultLanguage`, so a leftover from
    // another spec would silently turn the Spanish render English.
    window.localStorage.clear();
    setupManagerAuth();
    seedSnapshots();
    vi.spyOn(global, 'fetch').mockImplementation((url: unknown) =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve(
            String(url).includes('/api/quick-add/status')
              ? { geminiConfigured: false }
              : { success: true, contact: {} },
          ),
      } as Response),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── 1. The team roster ──

  describe('unit 1 — the team roster', () => {
    it('speaks Spanish in member cards, invite rows, and the approval queue', async () => {
      renderSpanish();

      await waitFor(() => expect(screen.getByText('Alice Johnson')).toBeInTheDocument());

      // The "you" badge on your own card.
      expect(screen.getAllByText('Tú').length).toBeGreaterThan(0);

      // Member options menu.
      fireEvent.click(screen.getByRole('button', { name: 'Opciones del miembro' }));
      expect(screen.getByText('Editar miembro')).toBeInTheDocument();
      expect(screen.getByText('Quitar acceso')).toBeInTheDocument();

      // Invite row.
      expect(screen.getByText('invitación enviada')).toBeInTheDocument();
      expect(screen.getByText(/esperando registro/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Cancelar invitación' })).toBeInTheDocument();

      // Pending approval block — one person, a role, and an unnamed account.
      expect(screen.getByText('1 persona pide unirse')).toBeInTheDocument();
      expect(screen.getByText(/quiere ser Comunidad/)).toBeInTheDocument();
      expect(screen.getAllByText('Sin nombre').length).toBeGreaterThan(0);
      expect(screen.getByRole('button', { name: 'Aprobar' })).toBeInTheDocument();

      expectNoEnglish(UNIT_1_KEYS);
    });
  });

  // ── 2. The four modals (and their role pickers) ──

  describe('unit 2 — the four modals', () => {
    it('translates the edit-member modal, including its role options', async () => {
      renderSpanish();
      await waitFor(() => expect(screen.getByText('Alice Johnson')).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: 'Opciones del miembro' }));
      fireEvent.click(screen.getByText('Editar miembro'));

      expect(screen.getByRole('heading', { level: 3, name: 'Editar miembro' })).toBeInTheDocument();
      expect(screen.getByLabelText('Nombre visible')).toHaveValue('Alice Johnson');
      expect(screen.getByPlaceholderText('p. ej. Juana Pérez')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Guardar' })).toBeInTheDocument();

      // The picker used to render ROLE_OPTIONS[].label — literal English.
      const options = within(screen.getByLabelText('Rol')).getAllByRole('option');
      expect(options.map((o) => o.textContent)).toEqual([
        'Comunidad',
        'Estudiante',
        'Aprendiz',
        'Tiempo completo',
      ]);

      expectNoEnglish(UNIT_2_KEYS);
    });

    it('translates the remove-access confirmation and its sentence', async () => {
      renderSpanish();
      await waitFor(() => expect(screen.getByText('Alice Johnson')).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: 'Opciones del miembro' }));
      fireEvent.click(screen.getByText('Quitar acceso'));

      expect(screen.getByRole('heading', { level: 3, name: '¿Quitar acceso?' })).toBeInTheDocument();
      expect(screen.getByText(/Alice perderá el acceso a CISA/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Eliminar' })).toBeInTheDocument();
    });

    it('translates the invite modal, including its role options', async () => {
      renderSpanish();
      await waitFor(() => expect(screen.getByText('Alice Johnson')).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: 'Añadir persona' }));

      expect(screen.getByRole('heading', { level: 3, name: 'Añadir a alguien por correo' })).toBeInTheDocument();
      expect(screen.getByText(/Añade un correo de antemano/)).toBeInTheDocument();
      expect(screen.getByPlaceholderText('nombre@correo.com')).toBeInTheDocument();
      expect(screen.getByText('Correo')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Añadir por adelantado' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Cerrar' })).toBeInTheDocument();

      const options = within(screen.getByLabelText('Rol')).getAllByRole('option');
      expect(options.map((o) => o.textContent)).toEqual([
        'Comunidad',
        'Estudiante',
        'Aprendiz',
        'Tiempo completo',
      ]);
    });

    it('translates the edit-your-name modal', async () => {
      renderSpanish();
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Editar nombre' })).toBeInTheDocument(),
      );

      fireEvent.click(screen.getByRole('button', { name: 'Editar nombre' }));

      expect(screen.getByRole('heading', { level: 3, name: 'Edita tu nombre' })).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Tu nombre')).toBeInTheDocument();
      expect(screen.getByLabelText('Nombre visible')).toBeInTheDocument();
    });
  });

  // ── 3. Quick add by text ──

  describe('unit 3 — quick add by text', () => {
    it('translates the section, its playground, and all three channels', async () => {
      renderSpanish();

      await waitFor(() =>
        expect(
          screen.getByRole('heading', { level: 2, name: 'Añadir rápido por texto' }),
        ).toBeInTheDocument(),
      );

      // The section heading and its rail chip resolve the same key.
      const rail = screen.getByTestId('settings-section-rail');
      expect(within(rail).getByRole('button', { name: 'Añadir rápido por texto' })).toBeInTheDocument();

      expect(screen.getByText('Zona de pruebas en lenguaje natural')).toBeInTheDocument();
      expect(screen.getByText('Gemini AI sin configurar')).toBeInTheDocument();
      expect(screen.getByText(/Escribe o pega una nota sobre alguien/)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/Conocí a Juan Pérez en Miller Hall/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Probar' })).toBeInTheDocument();

      // Siri channel (open by default).
      expect(screen.getByText('Siri y Atajos de iOS / widget de inicio')).toBeInTheDocument();
      expect(screen.getByText('POST · plantilla de petición curl')).toBeInTheDocument();
      expect(
        screen.getByText(
          'En la app Atajos de Apple, crea un atajo nuevo llamado «Añadir rápido».',
        ),
      ).toBeInTheDocument();

      // SMS channel opens on click.
      fireEvent.click(screen.getByText('SMS y WhatsApp'));
      expect(screen.getByText('URL del webhook entrante de Twilio')).toBeInTheDocument();

      // GroupMe channel, including the parser copy (the commands stay literal).
      fireEvent.click(screen.getByText('Bot de GroupMe'));
      expect(screen.getByText('URL de callback del bot de GroupMe')).toBeInTheDocument();
      expect(screen.getByText('Prefijos de activación')).toBeInTheDocument();
      expect(screen.getByText('Opciones de análisis')).toBeInTheDocument();
      expect(screen.getByText('predeterminado')).toBeInTheDocument();
      expect(screen.getByText(/Analiza nombre, rol, detalles y datos de contacto/)).toBeInTheDocument();

      expectNoEnglish(UNIT_3_KEYS);
    });

    it('translates the attendance-sync token card', async () => {
      renderSpanish();

      await waitFor(() => expect(screen.getByRole('button', { name: 'Mostrar token' })).toBeInTheDocument());
      expect(screen.getByRole('button', { name: 'Copiar token' })).toBeInTheDocument();
      // Every code block's copy button is Spanish too.
      expect(screen.getAllByText('Copiar').length).toBeGreaterThan(0);

      fireEvent.click(screen.getByRole('button', { name: 'Mostrar token' }));
      expect(screen.getByRole('button', { name: 'Ocultar token' })).toBeInTheDocument();
    });

    it('says it is loading the token while the snapshot is pending', async () => {
      seedSnapshots({ 'settings/integrations': 'silent' });
      renderSpanish();

      expect(await screen.findByText('Cargando token…')).toBeInTheDocument();
    });

    it('translates the parsed-contact result and the failure copy', async () => {
      renderSpanish();
      await waitFor(() => expect(screen.getByRole('button', { name: 'Probar' })).toBeInTheDocument());

      const input = screen.getByPlaceholderText(/Conocí a Juan Pérez en Miller Hall/);
      fireEvent.change(input, { target: { value: 'Conocí a Juan Pérez' } });
      fireEvent.click(screen.getByRole('button', { name: 'Probar' }));

      await waitFor(() => expect(screen.getByText('Listo, ya es un contacto')).toBeInTheDocument());
      expect(screen.getByText('Nombre')).toBeInTheDocument();
      expect(screen.getByText('Rol / grupo')).toBeInTheDocument();
      expect(screen.getByText('Ubicación')).toBeInTheDocument();
      expect(screen.getByText('Etapa')).toBeInTheDocument();

      // The backend's own message rides through; the fallback is Spanish.
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: false }),
      } as Response);

      fireEvent.change(input, { target: { value: 'otra nota' } });
      fireEvent.click(screen.getByRole('button', { name: 'Probar' }));

      await waitFor(() => expect(screen.getByText('Algo salió mal')).toBeInTheDocument());
      expect(screen.getByText('No se pudo procesar la descripción.')).toBeInTheDocument();
    });
  });

  // ── 4. API & webhook console ──

  describe('unit 4 — the webhook console', () => {
    it('translates the heading, the rail chip, and the empty state', async () => {
      renderSpanish();

      await waitFor(() =>
        expect(
          screen.getByRole('heading', { level: 2, name: 'Consola de API y webhooks' }),
        ).toBeInTheDocument(),
      );
      const rail = screen.getByTestId('settings-section-rail');
      expect(
        within(rail).getByRole('button', { name: 'Consola de API y webhooks' }),
      ).toBeInTheDocument();

      expect(screen.getByText('Aún no hay actividad')).toBeInTheDocument();
      expect(
        screen.getByText('Envía un mensaje a tu bot de GroupMe o prueba Añadir rápido para ver webhooks aquí.'),
      ).toBeInTheDocument();

      expectNoEnglish(UNIT_4_KEYS);
    });

    it('translates the log detail labels, the clear button, and its confirmation', async () => {
      seedSnapshots({ webhook_logs: { docs: WEBHOOK_LOGS } });
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

      renderSpanish();

      await waitFor(() => expect(screen.getByText('Contact added: Jerry Doe')).toBeInTheDocument());

      fireEvent.click(screen.getByText('Contact added: Jerry Doe'));
      expect(screen.getByText('Carga útil sin procesar (cuerpo POST)')).toBeInTheDocument();
      expect(screen.getByText('Cabeceras de la petición')).toBeInTheDocument();

      fireEvent.click(screen.getByText('Parsing failed'));
      expect(screen.getByText('Detalle del fallo')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Limpiar' }));
      expect(confirmSpy).toHaveBeenCalledWith('¿Borrar todos los registros de depuración de webhooks?');
    });

    it('translates the listening state while the log snapshot is pending', async () => {
      seedSnapshots({ webhook_logs: 'silent' });
      renderSpanish();

      expect(await screen.findByText('Escuchando peticiones entrantes…')).toBeInTheDocument();
    });
  });

  // ── 5. Switch ──

  describe('unit 5 — the shared switch', () => {
    it('shows its visible track label in the session language', () => {
      const { rerender } = render(
        <LanguageProvider defaultLanguage="es">
          <Switch checked={false} onChange={() => {}} aria-label="Recordatorios" />
        </LanguageProvider>,
      );

      const off = screen.getByText('No');
      expect(off).toBeVisible();
      // The label stays decorative: callers keep owning the accessible name.
      expect(off.closest('[aria-hidden="true"]')).not.toBeNull();
      expect(screen.queryByText('Off')).toBeNull();

      rerender(
        <LanguageProvider defaultLanguage="es">
          <Switch checked onChange={() => {}} aria-label="Recordatorios" />
        </LanguageProvider>,
      );

      const on = screen.getByText('Sí');
      expect(on).toBeVisible();
      expect(on.closest('[aria-hidden="true"]')).not.toBeNull();
      expect(screen.queryByText('On')).toBeNull();
    });
  });

  // ── 6. Stragglers ──

  describe('unit 6 — stragglers', () => {
    it('translates the account pencil and the video-audience picker', async () => {
      renderSpanish();

      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Editar nombre' })).toBeInTheDocument(),
      );
      expect(screen.getByTitle('Editar nombre')).toBeInTheDocument();

      const audience = await screen.findByLabelText('Público del vídeo');
      expect(
        within(audience)
          .getAllByRole('option')
          .map((o) => o.textContent),
      ).toEqual(['Todos', 'Tiempo completo y aprendices', 'Solo tiempo completo']);

      expectNoEnglish(UNIT_6_KEYS);
    });

    it('translates the authenticator QR code label', async () => {
      mfaMocks.startTotpEnrollment.mockResolvedValue({
        qrCodeUrl: 'otpauth://totp/CISA:admin@test.com?secret=ABC123',
        enroll: vi.fn(),
      });

      renderSpanish();

      fireEvent.click(await screen.findByRole('button', { name: 'Configurar segundo factor' }));

      await waitFor(() => expect(screen.getByTestId('totp-qr-container')).toBeInTheDocument());
      expect(
        document.querySelector('[aria-label="Código QR de configuración del autenticador"]'),
      ).not.toBeNull();
      expect(document.querySelector('[aria-label="Authenticator setup QR code"]')).toBeNull();
    });

    it('names the re-confirm password toggle in Spanish', async () => {
      mfaMocks.startTotpEnrollment.mockRejectedValue({ code: 'auth/requires-recent-login' });

      renderSpanish();

      fireEvent.click(await screen.findByRole('button', { name: 'Configurar segundo factor' }));

      expect(await screen.findByRole('button', { name: 'Mostrar contraseña' })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Mostrar contraseña' }));
      expect(screen.getByRole('button', { name: 'Ocultar contraseña' })).toBeInTheDocument();
    });

    it('reads the weekly reminder summary in Spanish, on a 24-hour clock', async () => {
      seedSnapshots({
        'settings/reminder_schedule': {
          data: () => ({
            fullTimers: { days: [2, 3], hour: 17 },
            teams: { yp: { days: [], hour: 18 }, campus: { days: [2, 3], hour: 18 } },
          }),
        },
      });

      renderSpanish();

      await waitFor(() => expect(screen.getByText('Mar, Mié · 17:00')).toBeInTheDocument());
      expect(screen.getAllByText('Sin días · 18:00').length).toBeGreaterThan(0);
      expectNoEnglish(UNIT_6_KEYS);
    });
  });
});
