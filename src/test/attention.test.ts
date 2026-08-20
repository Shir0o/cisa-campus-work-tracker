import { describe, it, expect, beforeEach } from "vitest";
import {
  buildAttentionItems,
  attentionStacksFor,
  attentionGroupsFor,
  attentionPhrase,
  type AttentionItem,
} from "../lib/attention";
import { UserEntityState, __resetUserEntityStateCache } from "../lib/userEntityState";
import type { Contact, Interaction } from "../types";
import type { ThreadMessageWithContact } from "../lib/threads";

describe("Attention Data Layer (#330)", () => {
  const uid = "u1";

  beforeEach(() => {
    localStorage.clear();
    __resetUserEntityStateCache();
  });

  const sampleContacts: Contact[] = [
    {
      id: "c1",
      name: "Alex Johnson",
      createdBy: "u3",
      createdAt: new Date().toISOString(),
      reviewed: false,
      stage: "Freshman Contact",
      owner: "u3",
    } as Contact,
  ];

  const sampleInteractions: Interaction[] = [
    {
      id: "i1",
      contactId: "c1",
      userId: "u3",
      content: "Met at library for study session",
      createdAt: new Date().toISOString(),
      dateTime: new Date().toISOString(),
      type: "meetup",
    } as Interaction,
  ];

  const sampleThreads: ThreadMessageWithContact[] = [
    {
      id: "t1",
      contactId: "c1",
      from: "u3",
      fromName: "Zion",
      kind: "question",
      body: "How should we follow up with Alex?",
      at: new Date().toISOString(),
      interactionId: null,
      reactions: [],
    },
  ];

  it("builds attention items for full-timer oversight", () => {
    const items = buildAttentionItems({
      role: "admin",
      uid: "u1",
      contacts: sampleContacts,
      interactions: sampleInteractions,
      threads: sampleThreads,
    });

    expect(items.length).toBe(3);
    const types = items.map((i) => i.type);
    expect(types).toContain("contact");
    expect(types).toContain("interaction");
    expect(types).toContain("thread");
  });

  it("folds multiple items for the same contact into a single stack", () => {
    const items = buildAttentionItems({
      role: "admin",
      uid: "u1",
      contacts: sampleContacts,
      interactions: sampleInteractions,
      threads: sampleThreads,
    });

    const stacks = attentionStacksFor(items, uid);
    expect(stacks.length).toBe(1);
    expect(stacks[0].contactId).toBe("c1");
    expect(stacks[0].items.length).toBe(3);
    expect(stacks[0].unread).toBe(3);
  });

  it("excludes items or stacks when marked done via UserEntityState", () => {
    const items = buildAttentionItems({
      role: "admin",
      uid: "u1",
      contacts: sampleContacts,
      interactions: sampleInteractions,
      threads: sampleThreads,
    });

    // Mark contact stack done
    UserEntityState.markDone(uid, "contact:c1");
    let stacks = attentionStacksFor(items, uid);
    expect(stacks.length).toBe(0);

    // Reset and test item-level done
    UserEntityState.markUndone(uid, "contact:c1");
    UserEntityState.markDone(uid, "interaction:i1");
    stacks = attentionStacksFor(items, uid);
    expect(stacks.length).toBe(1);
    expect(stacks[0].items.length).toBe(2);
  });

  it("computes unread counts accurately and updates when items are marked read", () => {
    const items = buildAttentionItems({
      role: "admin",
      uid: "u1",
      contacts: sampleContacts,
      interactions: sampleInteractions,
      threads: sampleThreads,
    });

    UserEntityState.markRead(uid, "contact:c1");
    const stacks = attentionStacksFor(items, uid);
    expect(stacks[0].unread).toBe(2);
  });

  it("groups stacks into date buckets", () => {
    const now = new Date().toISOString();
    const yesterday = new Date(Date.now() - 86400000).toISOString();

    const items: AttentionItem[] = [
      {
        id: "contact:c1",
        type: "contact",
        contactId: "c1",
        at: now,
        by: "u3",
      },
      {
        id: "contact:c2",
        type: "contact",
        contactId: "c2",
        at: yesterday,
        by: "u3",
      },
    ];

    const stacks = attentionStacksFor(items, uid);
    const groups = attentionGroupsFor(stacks);

    expect(groups.length).toBe(2);
    expect(groups[0].bucket).toBe("today");
    expect(groups[0].label).toBe("Today");
    expect(groups[1].bucket).toBe("yesterday");
    expect(groups[1].label).toBe("Yesterday");
  });

  it("formats attention phrases accurately", () => {
    const staffMap = { u3: "Zion Trainee" };
    expect(
      attentionPhrase(
        {
          id: "contact:c1",
          type: "contact",
          contactId: "c1",
          at: new Date().toISOString(),
          by: "u3",
        },
        staffMap,
      ),
    ).toBe("Zion added them");

    expect(
      attentionPhrase(
        {
          id: "thread:t1",
          type: "thread",
          contactId: "c1",
          at: new Date().toISOString(),
          by: "u3",
          kind: "question",
        },
        staffMap,
      ),
    ).toBe("Zion asked you something");

    expect(
      attentionPhrase(
        {
          id: "task:tk1",
          type: "task",
          at: new Date().toISOString(),
          by: "u3",
          title: "Follow up call",
        },
        staffMap,
      ),
    ).toBe("Zion assigned a task");

    expect(
      attentionPhrase(
        {
          id: "notif:n1",
          type: "notification",
          at: new Date().toISOString(),
          title: "New gathering scheduled",
        },
        staffMap,
      ),
    ).toBe("New gathering scheduled");

    expect(
      attentionPhrase(
        {
          id: "interaction:i2",
          type: "interaction",
          at: new Date().toISOString(),
          by: "u3",
        },
        staffMap,
      ),
    ).toBe("Zion logged time");
  });

  it("builds attention items for trainee role including FT messages", () => {
    const traineeItems = buildAttentionItems({
      role: "trainee",
      uid: "u3",
      threads: [
        {
          id: "t_ft",
          contactId: "c1",
          from: "u1",
          fromName: "Tony",
          kind: "nudge",
          body: "Check in with Alex this week",
          at: new Date().toISOString(),
          interactionId: null,
          reactions: [],
        },
      ],
      tasks: [
        {
          id: "task_1",
          title: "Call Alex",
          status: "pending",
          assigneeId: "u3",
          dueDate: new Date().toISOString(),
          contactId: "c1",
        },
      ],
      notifications: [
        {
          id: "notif_1",
          title: "Welcome note",
          message: "Welcome to term",
          read: false,
          userId: "u3",
          createdAt: new Date().toISOString(),
        } as Notification,
        {
          id: "notif_ts",
          title: "Event note",
          message: "Gathering starts soon",
          read: false,
          userId: "u3",
          createdAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 } as any,
        } as Notification,
      ],
    });

    expect(traineeItems.length).toBe(4);
    const types = traineeItems.map((i) => i.type);
    expect(types).toContain("thread");
    expect(types).toContain("task");
    expect(types).toContain("notification");
  });

  it("stacks items by targetId and respects targetId done filtering", () => {
    const targetItems: AttentionItem[] = [
      {
        id: "notif:n1",
        type: "notification",
        targetId: "target_room_1",
        title: "Room message 1",
        at: new Date().toISOString(),
      },
      {
        id: "notif:n2",
        type: "notification",
        targetId: "target_room_1",
        title: "Room message 2",
        at: new Date().toISOString(),
      },
    ];

    let stacks = attentionStacksFor(targetItems, uid);
    expect(stacks.length).toBe(1);
    expect(stacks[0].targetId).toBe("target_room_1");
    expect(stacks[0].items.length).toBe(2);

    UserEntityState.markDone(uid, "target:target_room_1");
    stacks = attentionStacksFor(targetItems, uid);
    expect(stacks.length).toBe(0);
  });
});
