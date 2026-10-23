import { isTestAccount, selectedPurgePaths, type PurgePlan } from "../lib/testAccountPurge";

// Test Account Purge, run with the Admin SDK (Settings → Danger Zone). The
// client cannot do this itself: rules keep other people's push devices,
// suggestions, notifications and chat messages out of reach even for a
// Full-timer, and only the Admin SDK can delete Firebase Auth logins.

interface PurgeDocSnap {
  id: string;
  ref: { path: string };
  data(): Record<string, any>;
}

interface PurgeQuerySnap {
  docs: PurgeDocSnap[];
}

export interface PurgeDb {
  collection(path: string): { get(): Promise<PurgeQuerySnap> };
  collectionGroup(id: string): { get(): Promise<PurgeQuerySnap> };
  doc(path: string): unknown;
  recursiveDelete(ref: unknown): Promise<void>;
}

export interface PurgeAuth {
  listUsers(
    maxResults?: number,
    pageToken?: string,
  ): Promise<{ users: { uid: string; email?: string; displayName?: string }[]; pageToken?: string }>;
  deleteUsers(uids: string[]): Promise<{ errors: { index: number; error: { message: string } }[] }>;
}

export interface PurgeResult {
  deletedCount: number;
  failed: { target: string; error: string }[];
}

/** Top-level collections keyed by the person's uid. */
const PER_USER_COLLECTIONS = ["userPreferences", "toAskNotes", "inboxState", "hospitalityOffers"];

/** deleteUsers takes at most 1000 uids per call. */
const AUTH_DELETE_BATCH = 1000;

export class TestAccountPurgeEngine {
  private readonly db: PurgeDb;
  private readonly auth: PurgeAuth;
  private readonly ownerEmail: string;

  constructor(opts: { db: PurgeDb; auth: PurgeAuth; ownerEmail: string }) {
    this.db = opts.db;
    this.auth = opts.auth;
    this.ownerEmail = opts.ownerEmail.trim().toLowerCase();
  }

  /**
   * Finds every test account trace. The actor's own account (and the owner's)
   * is never a target, so a cisa-* Full-timer running the purge does not
   * delete themselves halfway through.
   */
  async scan(actorId: string): Promise<PurgePlan> {
    const keptSelf: string[] = [];
    const keptEmails = new Set([this.ownerEmail]);
    const testUids = new Set<string>();
    const accounts: string[] = [];

    const isKept = (uid: string, email?: string | null) =>
      uid === actorId || (email || "").trim().toLowerCase() === this.ownerEmail;

    const usersSnap = await this.db.collection("users").get();
    for (const d of usersSnap.docs) {
      const data = d.data();
      if (!isTestAccount({ uid: d.id, ...data })) continue;
      if (isKept(d.id, data.email)) {
        keptSelf.push(data.email || data.displayName || d.id);
        if (data.email) keptEmails.add(String(data.email).trim().toLowerCase());
        continue;
      }
      testUids.add(d.id);
      accounts.push(d.ref.path);
    }

    // Auth logins: the test users above, plus test logins that never got a
    // users doc (or whose doc is already gone).
    const logins: string[] = [];
    let pageToken: string | undefined;
    do {
      const page = await this.auth.listUsers(1000, pageToken);
      for (const u of page.users) {
        if (isKept(u.uid, u.email)) continue;
        if (testUids.has(u.uid) || isTestAccount(u)) {
          testUids.add(u.uid);
          logins.push(u.uid);
        }
      }
      pageToken = page.pageToken;
    } while (pageToken);

    const invitations = (await this.db.collection("invitations").get()).docs
      .filter((d) => {
        const email = String(d.data().email || d.id);
        return isTestAccount({ email }) && !keptEmails.has(email.trim().toLowerCase());
      })
      .map((d) => d.ref.path);

    const isTest = (uid: unknown) => typeof uid === "string" && testUids.has(uid);
    const pathsWhere = async (
      source: "collection" | "collectionGroup",
      id: string,
      match: (d: PurgeDocSnap) => boolean,
    ) => {
      const snap = await (source === "collection" ? this.db.collection(id) : this.db.collectionGroup(id)).get();
      return snap.docs.filter(match).map((d) => d.ref.path);
    };

    const personal: string[] = [];
    for (const name of PER_USER_COLLECTIONS) {
      personal.push(...(await pathsWhere("collection", name, (d) => isTest(d.id))));
    }
    personal.push(...(await pathsWhere("collectionGroup", "rsvps", (d) => isTest(d.id))));

    const interactions = await pathsWhere("collectionGroup", "interactions", (d) => {
      const data = d.data();
      return isTest(data.userId ?? data.createdById);
    });

    const notes = [
      ...(await pathsWhere("collectionGroup", "comments", (d) => isTest(d.data().userId))),
      ...(await pathsWhere("collectionGroup", "threads", (d) => isTest(d.data().from))),
      ...(await pathsWhere("collectionGroup", "teamThreads", (d) => isTest(d.data().from))),
    ];

    // A room goes only when every member is a test account; in a room with a
    // real person, only the test accounts' own messages go.
    const rooms = await pathsWhere("collection", "chatRooms", (d) => {
      const members: unknown[] = Array.isArray(d.data().memberIds) ? d.data().memberIds : [];
      return members.length > 0 && members.every(isTest);
    });
    const roomPrefixes = rooms.map((p) => `${p}/`);
    const messages = await pathsWhere(
      "collectionGroup",
      "messages",
      (d) => isTest(d.data().senderId) && !roomPrefixes.some((prefix) => d.ref.path.startsWith(prefix)),
    );
    const chats = [...rooms, ...messages];

    const activity = [
      ...(await pathsWhere("collection", "notifications", (d) => isTest(d.data().userId))),
      ...(await pathsWhere("collection", "activities", (d) => isTest(d.data().userId))),
    ];

    const asks = [
      ...(await pathsWhere("collection", "asks", (d) => isTest(d.data().from) || isTest(d.data().owner))),
      ...(await pathsWhere("collection", "prayerRequests", (d) => isTest(d.data().uid))),
    ];

    const feedback = await pathsWhere("collection", "feedback", (d) => isTest(d.data().userId));

    const contacts = await pathsWhere("collection", "contacts", (d) => isTest(d.data().createdBy));

    return {
      accounts,
      logins,
      invitations,
      personal,
      interactions,
      notes,
      chats,
      activity,
      asks,
      feedback,
      contacts,
      keptSelf,
    };
  }

  /**
   * Deletes a plan's targets, each with everything nested under it, then the
   * Auth logins. A failure on one target is recorded and the rest still run,
   * so one bad document cannot strand a half-finished purge.
   */
  async purge(plan: PurgePlan, opts: { deleteTestContacts: boolean }): Promise<PurgeResult> {
    let deletedCount = 0;
    const failed: PurgeResult["failed"] = [];

    for (const path of selectedPurgePaths(plan, opts.deleteTestContacts)) {
      try {
        await this.db.recursiveDelete(this.db.doc(path));
        deletedCount++;
      } catch (err: any) {
        failed.push({ target: path, error: err?.message || String(err) });
      }
    }

    for (let i = 0; i < plan.logins.length; i += AUTH_DELETE_BATCH) {
      const batch = plan.logins.slice(i, i + AUTH_DELETE_BATCH);
      try {
        const res = await this.auth.deleteUsers(batch);
        const failedIdx = new Set(res.errors.map((e) => e.index));
        for (const e of res.errors) failed.push({ target: `auth/${batch[e.index]}`, error: e.error.message });
        deletedCount += batch.length - failedIdx.size;
      } catch (err: any) {
        for (const uid of batch) failed.push({ target: `auth/${uid}`, error: err?.message || String(err) });
      }
    }

    return { deletedCount, failed };
  }
}
