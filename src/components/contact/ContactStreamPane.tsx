import { X } from "lucide-react";
import { useId } from "react";
import Stream from "../stream/Stream";
import FromEntryTodoComposer from "../todos/FromEntryTodoComposer";
import { useLanguage } from "../LanguageProvider";
import { cn } from "../../lib/utils";
import type { Contact } from "../../types";
import type { ThreadMessage } from "../../lib/threads";
import type { conversationAdapter } from "../stream/conversationAdapter";
import type { StreamViewer } from "../../lib/stream";
import type { ContactTeamMember } from "./types";

/** The contact's Conversation, pinned beside the story (ADR 0034). On a narrow
 *  screen the same pane opens full-screen over the page. A reply's Thread
 *  replaces the stream inside the pane, with a back arrow to the stream behind
 *  it; the Full-timers pane is cut (cut-or-keep §24). */
export default function ContactStreamPane({
  isMobile,
  open,
  conversation,
  viewer,
  onClose,
  onMakeTodo,
  onAddToStory,
  storyMessageIds,
  todoFrom,
  onCloseTodo,
  contact,
  teamMembers,
  currentUid,
  meName,
  openAskCount,
  onJumpToAsk,
  initialThreadId,
}: {
  isMobile: boolean;
  open: boolean;
  conversation: ReturnType<typeof conversationAdapter>;
  viewer: StreamViewer;
  onClose: () => void;
  onMakeTodo: (message: ThreadMessage) => void;
  /** Add a message to the person's story, or take it back out. */
  onAddToStory: (message: ThreadMessage) => void;
  storyMessageIds: ReadonlySet<string>;
  todoFrom: ThreadMessage | null;
  onCloseTodo: () => void;
  contact: Contact;
  teamMembers: ContactTeamMember[];
  currentUid: string | undefined;
  meName: string;
  openAskCount: number;
  onJumpToAsk: () => void;
  /** A deep link onto one message's Thread (#1303). */
  initialThreadId?: string | null;
}) {
  const { t } = useLanguage();
  const conversationLabel = t('modals.contactDetails.follow_up');
  const whoId = useId();

  // On a narrow screen the pane only exists while it is open; the head's
  // Conversation button is what opens it.
  if (isMobile && !open) return null;

  const askCountLabel =
    openAskCount === 1
      ? t('modals.contactDetails.open_ask_one')
      : t('modals.contactDetails.open_ask_many').replace('{count}', String(openAskCount));

  return (
    <aside
      className={cn("cd-pane-stream", isMobile && open && "is-open")}
      role="region"
      aria-label={conversationLabel}
      aria-describedby={isMobile ? whoId : undefined}
      data-pane-stream="conversation"
    >
      <div className="cd-pane-head">
        <div className="cd-pane-heading">
          <h3 className="cd-pane-title">{conversationLabel}</h3>
          {/* The pane covers the page (#1781), so the title alone loses whose
              thread this is. The name sits under it and is the region's
              description. */}
          {isMobile && (
            <p className="cd-pane-who" id={whoId}>
              {contact.name}
            </p>
          )}
        </div>
        {openAskCount > 0 && (
          <button type="button" className="cd-pane-asks" onClick={onJumpToAsk}>
            {askCountLabel}
          </button>
        )}
        {isMobile && (
          <button
            type="button"
            onClick={onClose}
            title={t('modals.contactDetails.close_drawer').replace('{thread}', conversationLabel)}
            aria-label={t('modals.contactDetails.close_drawer').replace('{thread}', conversationLabel)}
            className="cd-pane-close shrink-0 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      <div className="cd-pane-body">
        <Stream
          adapter={conversation}
          viewer={viewer}
          threadMode="replace"
          onMakeTodo={onMakeTodo}
          onAddToStory={onAddToStory}
          storyMessageIds={storyMessageIds}
          initialThreadId={initialThreadId}
        />
      </div>
      {todoFrom && (
        <FromEntryTodoComposer
          text={todoFrom.body}
          contactId={contact.id}
          contactName={contact.name}
          source={null}
          team={teamMembers.map((m) => ({ uid: m.id, name: m.name }))}
          meUid={currentUid ?? ""}
          meName={meName}
          onClose={onCloseTodo}
        />
      )}
    </aside>
  );
}
