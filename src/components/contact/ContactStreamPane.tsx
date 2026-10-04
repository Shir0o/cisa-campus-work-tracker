import { Lock, X } from "lucide-react";
import Stream from "../stream/Stream";
import FromEntryTodoComposer from "../todos/FromEntryTodoComposer";
import { useLanguage } from "../LanguageProvider";
import { cn } from "../../lib/utils";
import type { Contact } from "../../types";
import type { ThreadMessage } from "../../lib/threads";
import type { interactionAdapter } from "../stream/interactionAdapter";
import type { conversationAdapter } from "../stream/conversationAdapter";
import type { fullTimersAdapter } from "../stream/fullTimersAdapter";
import type { StreamViewer } from "../../lib/stream";
import type { ContactTeamMember } from "./types";

/** Which of a contact's two streams the pane is showing. */
export type ContactPaneView = "conversation" | "fullTimers";

/** The contact's Conversation, pinned beside the story (ADR 0034). On a narrow
 *  screen the same pane opens full-screen over the page. Full-timers share the
 *  pane behind a Conversation · Full-timers switch; a Trainee sees no switch.
 *  An Interaction's Thread replaces the stream inside the pane, with a back
 *  arrow to the stream behind it. */
export default function ContactStreamPane({
  isMobile,
  open,
  view,
  onViewChange,
  conversation,
  fullTimers,
  interactionThread,
  viewer,
  isFullTimer,
  onBack,
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
  fullTimersUnread,
  initialThreadId,
}: {
  isMobile: boolean;
  open: boolean;
  view: ContactPaneView;
  onViewChange: (view: ContactPaneView) => void;
  conversation: ReturnType<typeof conversationAdapter>;
  fullTimers: ReturnType<typeof fullTimersAdapter>;
  interactionThread: ReturnType<typeof interactionAdapter> | null;
  viewer: StreamViewer;
  isFullTimer: boolean;
  onBack: () => void;
  onClose: () => void;
  onMakeTodo: (message: ThreadMessage) => void;
  /** Conversation only: add a message to the person's story, or take it back
   *  out. Never offered on the Full-timers stream. */
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
  fullTimersUnread: boolean;
  /** A deep link onto one message's Thread (#1303). */
  initialThreadId?: string | null;
}) {
  const { t } = useLanguage();
  const conversationLabel = t('modals.contactDetails.follow_up');
  const fullTimersLabel = t('modals.contactDetails.discussion');
  const baseLabel = view === "fullTimers" ? fullTimersLabel : conversationLabel;
  const baseAdapter = view === "fullTimers" ? fullTimers : conversation;

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
      aria-label={baseLabel}
      data-pane-stream={view}
    >
      {interactionThread ? (
        <Stream
          adapter={interactionThread}
          viewer={viewer}
          threadMode="replace"
          back={{ label: t('stream.back_to').replace('{name}', baseLabel), onClick: onBack }}
          onMakeTodo={onMakeTodo}
        />
      ) : (
        <>
          <div className="cd-pane-head">
            <h3 className="cd-pane-title inline-flex items-center gap-2">
              {view === "fullTimers" && <Lock className="w-4 h-4" aria-hidden />}
              {baseLabel}
            </h3>
            {isFullTimer && (
              <div className="cd-pane-switch" role="group" aria-label={t('modals.contactDetails.conversation_switch')}>
                <button
                  type="button"
                  aria-pressed={view === "conversation"}
                  onClick={() => onViewChange("conversation")}
                  className={cn("cd-pane-tab", view === "conversation" && "on")}
                >
                  {conversationLabel}
                </button>
                <button
                  type="button"
                  aria-pressed={view === "fullTimers"}
                  onClick={() => onViewChange("fullTimers")}
                  className={cn("cd-pane-tab", view === "fullTimers" && "on")}
                >
                  {fullTimersLabel}
                  {fullTimersUnread && (
                    <span
                      className="cd-pane-dot"
                      aria-label={t('modals.contactDetails.full_timers_unread')}
                      title={t('modals.contactDetails.full_timers_unread')}
                    />
                  )}
                </button>
              </div>
            )}
            {openAskCount > 0 && (
              <button type="button" className="cd-pane-asks" onClick={onJumpToAsk}>
                {askCountLabel}
              </button>
            )}
            {isMobile && (
              <button
                type="button"
                onClick={onClose}
                title={t('modals.contactDetails.close_drawer').replace('{thread}', baseLabel)}
                aria-label={t('modals.contactDetails.close_drawer').replace('{thread}', baseLabel)}
                className="w-9 h-9 shrink-0 rounded-full hover:bg-surface-container-high text-on-surface-variant flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="cd-pane-body">
            <Stream
              adapter={baseAdapter}
              viewer={viewer}
              threadMode="replace"
              onMakeTodo={onMakeTodo}
              onAddToStory={view === "conversation" ? onAddToStory : undefined}
              storyMessageIds={view === "conversation" ? storyMessageIds : undefined}
              initialThreadId={initialThreadId}
            />
          </div>
        </>
      )}
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
