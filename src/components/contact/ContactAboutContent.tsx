import React, { useState } from "react";
import WhatWeKnow from "./overview/WhatWeKnow";
import HowToReach from "./overview/HowToReach";
import CaredForBy from "./overview/CaredForBy";
import TagsSection from "./overview/TagsSection";
import WhoCanSee from "./overview/WhoCanSee";
import { normalizeTagList } from "../../lib/tags";
import type { Contact } from "../../types";
import type { TeamMember } from "../../hooks/useContactStory";

export interface ContactAboutContentProps {
  contact: Contact;
  firstName: string;
  carerMembers: TeamMember[];
  addedByName: string | null;
  sinceBy: string | null;
  fmtDate: (v?: string | null) => string | null;
  isAdmin: boolean;
  isImpersonating: boolean;
  reassigningCreator: boolean;
  onStartReassign: () => void;
  onCancelReassign: () => void;
  teamMembers: TeamMember[];
  onReassignCreator: (newStaffId: string) => void;
  tags: string[];
  onPersistTags: (tags: string[], verb: string, tag: string) => void;
  sharedWith: TeamMember[];
  founders: string[];
  canRemoveShare: (staffId: string) => boolean;
  onRemoveShare: (staffId: string) => void;
  shareOptions: TeamMember[];
  canShare: boolean;
  sharing: boolean;
  onStartShare: () => void;
  onCancelShare: () => void;
  onAddShare: (staffId: string) => void;
}

export default function ContactAboutContent({
  contact,
  firstName,
  carerMembers,
  addedByName,
  sinceBy,
  fmtDate,
  isAdmin,
  isImpersonating,
  reassigningCreator,
  onStartReassign,
  onCancelReassign,
  teamMembers,
  onReassignCreator,
  tags,
  onPersistTags,
  sharedWith,
  founders,
  canRemoveShare,
  onRemoveShare,
  shareOptions,
  canShare,
  sharing,
  onStartShare,
  onCancelShare,
  onAddShare,
}: ContactAboutContentProps) {
  const [addingTag, setAddingTag] = useState(false);
  const [tagInput, setTagInput] = useState("");

  const commitTag = () => {
    const raw = tagInput.trim();
    if (!raw) {
      setAddingTag(false);
      return;
    }
    const nextTags = normalizeTagList([
      ...tags,
      ...raw.split(",").map((s) => s.trim()),
    ]);
    onPersistTags(nextTags, "added", raw);
    setTagInput("");
    setAddingTag(false);
  };

  const removeTag = (tag: string) => {
    const nextTags = tags.filter((t) => t !== tag);
    onPersistTags(nextTags, "removed", tag);
  };

  return (
    <div className="space-y-2">
      <WhatWeKnow notes={contact.notes} />
      <HowToReach contact={contact} firstName={firstName} />
      <CaredForBy
        carerMembers={carerMembers}
        addedByName={addedByName}
        sinceBy={sinceBy}
        fmtDate={fmtDate}
        isAdmin={isAdmin}
        isImpersonating={isImpersonating}
        reassigningCreator={reassigningCreator}
        onStartReassign={onStartReassign}
        onCancelReassign={onCancelReassign}
        teamMembers={teamMembers}
        onReassignCreator={onReassignCreator}
        contact={contact}
      />
      <TagsSection
        tags={tags}
        addingTag={addingTag}
        tagInput={tagInput}
        onTagInputChange={setTagInput}
        onStartAdd={() => setAddingTag(true)}
        onCancelAdd={() => setAddingTag(false)}
        onCommitTag={commitTag}
        onRemoveTag={removeTag}
        onAddTag={(tag) => onPersistTags([...tags, tag], "added", tag)}
      />
      <WhoCanSee
        sharedWith={sharedWith}
        founders={founders}
        canRemove={canRemoveShare}
        onRemoveShare={onRemoveShare}
        shareOptions={shareOptions}
        canShare={canShare}
        sharing={sharing}
        onStartShare={onStartShare}
        onCancelShare={onCancelShare}
        onAddShare={onAddShare}
        firstName={firstName}
      />
    </div>
  );
}
