import { describe, it, expect, beforeEach } from "vitest";
import {
  buildAttentionItems,
  attentionStacksFor,
  partitionAttentionStacks,
  type AttentionItem,
} from "../lib/attention";
import { UserEntityState, __resetUserEntityStateCache } from "../lib/userEntityState";
import type { Contact, Interaction } from "../types";
import type { ThreadMessageWithContact } from "../lib/threads";

describe("partitionAttentionStacks (#595)", () => {
  const uid = "u1";

  beforeEach(() => {
    localStorage.clear();
    __resetUserEntityStateCache();
  });

  const sampleContacts: Contact[] = [
    {
      id: "c_owned",
      name: "Alex Johnson",
      createdBy: "u3",
      owner: "u1", // owned by current user
      createdAt: new Date().toISOString(),
      reviewed: false,
      stage: "Freshman Contact",
    } as Contact,
    {
      id: "c_team",
      name: "Emerson Ahn",
      createdBy: "u2",
      owner: "u2", // owned by someone else
      createdAt: new Date().toISOString(),
      reviewed: false,
      stage: "Student",
    } as Contact,
  ];

  const sampleInteractions: Interaction[] = [
    {
      id: "i1",
      contactId: "c_team",
      userId: "u2",
      content: "Shared during prayer time about exam stress.",
      createdAt: new Date().toISOString(),
      type: "small_group",
      title: "Tuesday small group",
    } as unknown as Interaction,
  ];

  const sampleThreads: ThreadMessageWithContact[] = [
    {
      id: "t1",
      contactId: "c_owned",
      from: "u3",
      fromName: "Zion",
      kind: "question",
      body: "How should we follow up with Alex?",
      at: new Date().toISOString(),
      interactionId: null,
      reactions: [],
    },
  ];

  it("partitions direct questions and owned contacts into onYou, team activity into aroundTeam", () => {
    const rawItems = buildAttentionItems({
      role: "admin",
      uid,
      contacts: sampleContacts,
      interactions: sampleInteractions,
      threads: sampleThreads,
    });

    const stacks = attentionStacksFor(rawItems, uid);
    const { onYou, aroundTeam } = partitionAttentionStacks(stacks, sampleContacts, uid, "admin");

    expect(onYou.some((s) => s.contactId === "c_owned")).toBe(true);
    expect(aroundTeam.some((s) => s.contactId === "c_team")).toBe(true);
  });

  it("places direct assigned tasks and notifications into onYou", () => {
    const rawItems = buildAttentionItems({
      role: "admin",
      uid,
      tasks: [
        {
          id: "task_1",
          title: "Follow up before Friday",
          status: "pending",
          assigneeId: uid,
          contactId: null,
        },
      ],
      notifications: [
        {
          id: "notif_1",
          title: "Welcome to campus",
          message: "A quick update",
          type: "info",
          read: false,
          userId: uid,
          createdAt: new Date().toISOString(),
        },
      ],

    });

    const stacks = attentionStacksFor(rawItems, uid);
    const { onYou, aroundTeam } = partitionAttentionStacks(stacks, sampleContacts, uid, "admin");

    expect(onYou.length).toBe(2);
    expect(aroundTeam.length).toBe(0);
  });

  it("extracts mentioned thread messages and places them into onYou regardless of contact ownership", () => {
    const threadWithMention: ThreadMessageWithContact = {
      id: "t_mention",
      contactId: "c_team", // Not owned by u1
      from: "u2",
      fromName: "Emerson",
      kind: "comment",
      body: "Hey @Tony Wang can you take a look?",
      at: new Date().toISOString(),
      interactionId: null,
      reactions: [],
      mentionedUserIds: ["u1"],
    };

    const rawItems = buildAttentionItems({
      role: "admin",
      uid: "u1",
      contacts: sampleContacts,
      threads: [threadWithMention],
    });

    const mentionItem = rawItems.find((i) => i.id === "thread:t_mention");
    expect(mentionItem).toBeDefined();
    expect(mentionItem?.mentioned).toBe(true);

    const stacks = attentionStacksFor(rawItems, "u1");
    const { onYou, aroundTeam } = partitionAttentionStacks(stacks, sampleContacts, "u1", "admin");

    // Even though c_team is not owned by u1, being mentioned routes it to onYou!
    expect(onYou.some((s) => s.contactId === "c_team")).toBe(true);
    expect(aroundTeam.some((s) => s.contactId === "c_team")).toBe(false);
  });
});

