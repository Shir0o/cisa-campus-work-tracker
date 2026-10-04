import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { firestoreWeeklyDeps, runWeeklyReminders } from "../src/reminders";

// The Full-timer weekly reminder's number (#1336) is their **to work through**
// count on Around the team — the cards not yet Reviewed — read over the same
// docs Around reads, not the reach model's "Not reached yet".

// 2026-06-02 is a Tuesday; 17:00 in LA (PDT, UTC-7) is 00:00Z the next day.
const TUESDAY_5PM = new Date("2026-06-03T00:00:00.000Z").getTime();
const QUIET_HOUR = new Date("2026-06-02T18:00:00.000Z").getTime();
const RECENT = "2026-06-01T12:00:00.000Z";

interface FakeDoc {
  path: string;
  data: Record<string, unknown>;
}

/** A tiny in-memory Firestore: enough of the admin API for the weekly deps. */
function fakeDb(docs: FakeDoc[]) {
  const calls: string[] = [];
  const snap = (d: FakeDoc) => {
    const segs = d.path.split("/");
    return {
      id: segs[segs.length - 1],
      exists: true,
      data: () => d.data,
      ref: {
        path: d.path,
        parent: { id: segs[segs.length - 2], parent: segs.length > 2 ? { id: segs[segs.length - 3] } : null },
      },
    };
  };
  const query = (label: string, match: (d: FakeDoc) => boolean) => {
    let filtered = docs.filter(match);
    let max = Infinity;
    const q = {
      where(field: string, op: string, value: unknown) {
        filtered = filtered.filter((d) =>
          op === "in" ? (value as unknown[]).includes(d.data[field]) : d.data[field] === value,
        );
        return q;
      },
      orderBy(field: string) {
        filtered = filtered
          .filter((d) => typeof d.data[field] === "string")
          .sort((a, b) => String(b.data[field]).localeCompare(String(a.data[field])));
        return q;
      },
      limit(n: number) {
        max = n;
        return q;
      },
      async get() {
        calls.push(label);
        return { docs: filtered.slice(0, max).map(snap) };
      },
    };
    return q;
  };
  const db = {
    calls,
    doc(path: string) {
      return {
        async get() {
          calls.push(`doc:${path}`);
          const d = docs.find((x) => x.path === path);
          return d ? snap(d) : { exists: false, data: () => undefined };
        },
      };
    },
    collection(name: string) {
      return query(`collection:${name}`, (d) => {
        const segs = d.path.split("/");
        return segs.length === 2 && segs[0] === name;
      });
    },
    collectionGroup(name: string) {
      return query(`group:${name}`, (d) => {
        const segs = d.path.split("/");
        return segs.length % 2 === 0 && segs[segs.length - 2] === name;
      });
    },
  };
  return db;
}

const users: FakeDoc[] = [
  { path: "users/ft1", data: { role: "admin" } },
  { path: "users/tr1", data: { role: "manager", team: "campus" } },
];

// Three people a Trainee added, all reached already — so the old reach-model
// count would be zero — and one the Full-timer added themselves.
const contacts: FakeDoc[] = [
  { path: "contacts/a", data: { createdBy: "tr1", createdAt: RECENT } },
  { path: "contacts/b", data: { createdBy: "tr1", createdAt: RECENT } },
  { path: "contacts/c", data: { createdBy: "tr1", createdAt: RECENT } },
  { path: "contacts/own", data: { createdBy: "ft1", createdAt: RECENT } },
  ...["a", "b", "c"].map((id) => ({
    path: `contacts/${id}/interactions/i-${id}`,
    data: { userId: "tr1", createdAt: RECENT },
  })),
];

function bellsFor(db: ReturnType<typeof fakeDb>) {
  const writeBell = vi.fn(async () => {});
  return {
    deps: {
      ...firestoreWeeklyDeps(db as never),
      writeBell,
      markReminded: vi.fn(async () => {}),
      now: () => TUESDAY_5PM,
    },
    writeBell,
  };
}

describe("firestoreWeeklyDeps — the Full-timer's count (#1336)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(TUESDAY_5PM);
  });
  afterEach(() => vi.useRealTimers());

  it("is their to-work-through count on Around the team, leaving out cards they have Reviewed", async () => {
    const db = fakeDb([
      ...users,
      ...contacts,
      { path: "inboxState/ft1", data: { completed: { "att:contact:a": RECENT } } },
    ]);
    const staff = await firestoreWeeklyDeps(db as never).staff();
    expect(staff.find((s) => s.uid === "ft1")?.toWorkThrough).toBe(2);

    const { deps, writeBell } = bellsFor(db);
    await runWeeklyReminders(deps);
    expect(writeBell).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "ft1",
        title: "Around the team",
        message: "2 new people to work through on Around the team",
        link: "/around",
      }),
    );
  });

  it("leaves out the people the Full-timer keeps on their own My Day", async () => {
    const db = fakeDb([
      ...users,
      ...contacts,
      { path: "userPreferences/ft1", data: { personalContactIds: ["b"] } },
    ]);
    const staff = await firestoreWeeklyDeps(db as never).staff();
    expect(staff.find((s) => s.uid === "ft1")?.toWorkThrough).toBe(2);
  });

  it("sends a Full-timer nothing when everything is Reviewed", async () => {
    const db = fakeDb([
      ...users,
      ...contacts,
      {
        path: "inboxState/ft1",
        data: { completed: { "att:contact:a": RECENT, "att:contact:b": RECENT, "att:contact:c": RECENT } },
      },
    ]);
    const { deps, writeBell } = bellsFor(db);
    await runWeeklyReminders(deps);
    expect(writeBell).not.toHaveBeenCalledWith(expect.objectContaining({ userId: "ft1" }));
  });

  it("still never reminds a Full-timer twice on the same campus day", async () => {
    const db = fakeDb([
      { path: "users/ft1", data: { role: "admin", weeklyReminderAt: new Date(TUESDAY_5PM - 60_000).toISOString() } },
      ...contacts,
    ]);
    const { deps, writeBell } = bellsFor(db);
    expect(await runWeeklyReminders(deps)).toEqual({ written: 0 });
    expect(writeBell).not.toHaveBeenCalled();
  });

  it("reads only the schedule doc in an hour no schedule covers", async () => {
    vi.setSystemTime(QUIET_HOUR);
    const db = fakeDb([...users, ...contacts]);
    expect(await firestoreWeeklyDeps(db as never).staff()).toEqual([]);
    expect(db.calls).toEqual(["doc:settings/reminder_schedule"]);
  });
});
