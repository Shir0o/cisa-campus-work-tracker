// ── FIRST RUN — Role-aware first-run checklist (#335) ────────────────────────
// One component, two rooms: a compartment on the desktop home / landing,
// and a card on mobile. Every tick is reactively derived from live records.
// Dismissal is persisted in localStorage per user + role.

export interface FirstRunStep {
  id: string;
  label: string;
  hint: string;
  to?: string | null;
  done: boolean;
}

export interface FirstRunCopy {
  title: string;
  sub: string;
  foot: string;
}

export interface FirstRunData {
  key: string;
  steps: FirstRunStep[];
  doneCount: number;
  totalCount: number;
  isAway: boolean;
  isVisible: boolean;
}

export const FIRSTRUN_LS_KEY = 'cisa.firstrun.v1';

export const FRN_COPY: Record<string, FirstRunCopy> = {
  trainee: {
    title: 'Your first week',
    sub: "The handful of things this app is actually for. Each row ticks itself once you've done it.",
    foot: "Nothing here is a test — the ticks just read what's already in the app.",
  },
  admin: {
    title: 'Finding your feet',
    sub: 'The few habits the rest of the app hangs off. Ticks read your own work, not a tour.',
    foot: 'Read off the record, so undoing the work un-ticks the row.',
  },
  operator: {
    title: 'Getting started',
    sub: 'Three small things, and then you can mostly forget the app exists.',
    foot: "That's all we'd ask of you here.",
  },
  viewer: {
    title: 'Getting started',
    sub: 'Three small things, and then you can mostly forget the app exists.',
    foot: "That's all we'd ask of you here.",
  },
};

// Aliases for convenience
FRN_COPY.ft = FRN_COPY.admin;
FRN_COPY.manager = FRN_COPY.trainee;
FRN_COPY.student = FRN_COPY.operator;
FRN_COPY.community = FRN_COPY.viewer;

export function getFrnCopy(role?: string | null): FirstRunCopy {
  const norm = (role || 'trainee').toLowerCase();
  return FRN_COPY[norm] || FRN_COPY.trainee;
}

export const FirstRunStore = {
  isAway(key: string): boolean {
    try {
      const raw = localStorage.getItem(FIRSTRUN_LS_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      return !!(parsed && typeof parsed === 'object' && parsed[key]);
    } catch {
      return false;
    }
  },

  putAway(key: string): void {
    try {
      const raw = localStorage.getItem(FIRSTRUN_LS_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      const updated = { ...(typeof parsed === 'object' && parsed ? parsed : {}), [key]: new Date().toISOString() };
      localStorage.setItem(FIRSTRUN_LS_KEY, JSON.stringify(updated));
    } catch {
      // Ignore localStorage write failures
    }
  },

  bringBack(key: string): void {
    try {
      const raw = localStorage.getItem(FIRSTRUN_LS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        const updated = { ...parsed };
        delete updated[key];
        localStorage.setItem(FIRSTRUN_LS_KEY, JSON.stringify(updated));
      }
    } catch {
      // Ignore localStorage errors
    }
  },
};

export interface FirstRunPredicateContext {
  userId?: string | null;
  contactsCount?: number;
  interactionsCount?: number;
  messagesCount?: number;
  prayersCount?: number;
  todosCreatedCount?: number;
  todosCompletedCount?: number;
  docsCount?: number;
  feedbackCount?: number;
}

export function computeFirstRunSteps(
  role: string | undefined | null,
  ctx: FirstRunPredicateContext,
): FirstRunStep[] {
  const normRole = (role || 'trainee').toLowerCase();

  if (normRole === 'trainee' || normRole === 'manager') {
    return [
      {
        id: 'person',
        label: "Add someone you've met",
        to: '/directory',
        hint: 'One name is enough. Everything else about them can come later.',
        done: (ctx.contactsCount ?? 0) > 0,
      },
      {
        id: 'convo',
        label: 'Write up your first conversation',
        to: '/directory',
        hint: 'In your own words — what they said, what you noticed.',
        done: (ctx.interactionsCount ?? 0) > 0,
      },
      {
        id: 'ask',
        label: 'Ask the team something real',
        to: '/messages',
        hint: "A question you don't have the answer to beats a tidy update.",
        done: (ctx.messagesCount ?? 0) > 0,
      },
      {
        id: 'pray',
        label: 'Pray for one person by name',
        to: '/prayer',
        hint: "Your queue hands you one at a time. There's nothing to write.",
        done: (ctx.prayersCount ?? 0) > 0,
      },
      {
        id: 'follow',
        label: 'Say you followed up with someone',
        to: '/directory',
        hint: 'The only done in the app. It quiets the row, not the person.',
        done: (ctx.todosCompletedCount ?? 0) > 0,
      },
    ];
  }

  if (normRole === 'admin' || normRole === 'ft') {
    return [
      {
        id: 'convo',
        label: 'Log a conversation',
        to: '/directory',
        hint: 'The record is only as warm as what you put in it.',
        done: (ctx.interactionsCount ?? 0) > 0,
      },
      {
        id: 'todo',
        label: 'Hand a to-do to someone',
        to: '/coordination',
        hint: "Ask by name. It shows up on their day, not in their inbox.",
        done: (ctx.todosCreatedCount ?? 0) > 0,
      },
      {
        id: 'learn',
        label: 'Write down something the team learned',
        to: '/coordination',
        hint: 'Notes & learnings is where a good instinct outlives a semester.',
        done: (ctx.docsCount ?? 0) > 0,
      },
      {
        id: 'pray',
        label: 'Pray for someone by name',
        to: '/prayer',
        hint: 'Recorded, never announced — initials and a date, nothing else.',
        done: (ctx.prayersCount ?? 0) > 0,
      },
      {
        id: 'follow',
        label: 'Say you followed up with someone',
        to: '/directory',
        hint: 'One verb quiets a whole stack — here, the bell and the phone.',
        done: (ctx.todosCompletedCount ?? 0) > 0,
      },
    ];
  }

  // Student (operator) & Community (viewer)
  return [
    {
      id: 'hello',
      label: 'Say hello to the team',
      to: '/messages',
      hint: 'One line is plenty. Someone asked because they meant it.',
      done: (ctx.messagesCount ?? 0) > 0,
    },
    {
      id: 'pray',
      label: 'Pray for one person by name',
      to: '/prayer',
      hint: "Tap once when you've prayed. Nobody is told; it's just kept.",
      done: (ctx.prayersCount ?? 0) > 0,
    },
    {
      id: 'say',
      label: 'Tell the team how this is going',
      hint: "Something off, something missing, something you'd love — all welcome.",
      done: (ctx.feedbackCount ?? 0) > 0,
    },
  ];
}

export function evaluateFirstRun(
  role: string | undefined | null,
  userId: string | undefined | null,
  ctx: FirstRunPredicateContext,
): FirstRunData {
  const normRole = (role || 'trainee').toLowerCase();
  const uid = userId || 'anon';
  const key = `fr:${normRole}:${uid}`;

  const steps = computeFirstRunSteps(normRole, ctx);
  const doneCount = steps.filter((s) => s.done).length;
  const totalCount = steps.length;
  const isAway = FirstRunStore.isAway(key);
  const isVisible = !isAway && steps.length > 0 && doneCount < totalCount;

  return {
    key,
    steps,
    doneCount,
    totalCount,
    isAway,
    isVisible,
  };
}
