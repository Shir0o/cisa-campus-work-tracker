import { Lock, X } from "lucide-react";
import Stream from "../stream/Stream";
import FromEntryTodoComposer from "../todos/FromEntryTodoComposer";
import { useLanguage } from "../LanguageProvider";
import type { Contact } from "../../types";
import type { ThreadMessage } from "../../lib/threads";
import type { interactionAdapter } from "../stream/interactionAdapter";
import type { conversationAdapter } from "../stream/conversationAdapter";
import type { fullTimersAdapter } from "../stream/fullTimersAdapter";
import type { StreamViewer } from "../../lib/stream";
import type { ContactTeamMember } from "./types";

export default function ContactDrawerHost({
  drawerOpen,
  drawer,
  conversation,
  fullTimers,
  interactionThread,
  viewer,
  drawerLabel,
  onCloseDrawer,
  onMakeTodo,
  todoFrom,
  onCloseTodo,
  contact,
  teamMembers,
  currentUid,
  meName,
}: {
  drawerOpen: boolean;
  drawer: "thread" | "discussion" | "interaction" | null;
  conversation: ReturnType<typeof conversationAdapter>;
  fullTimers: ReturnType<typeof fullTimersAdapter>;
  interactionThread: ReturnType<typeof interactionAdapter> | null;
  viewer: StreamViewer;
  drawerLabel: string;
  onCloseDrawer: () => void;
  onMakeTodo: (message: ThreadMessage) => void;
  todoFrom: ThreadMessage | null;
  onCloseTodo: () => void;
  contact: Contact;
  teamMembers: ContactTeamMember[];
  currentUid: string | undefined;
  meName: string;
}) {
  const { t } = useLanguage();

  const closeDrawerButton = (
    <button
      type="button"
      onClick={onCloseDrawer}
      title={t('modals.contactDetails.close_drawer').replace('{thread}', drawerLabel)}
      aria-label={t('modals.contactDetails.close_drawer').replace('{thread}', drawerLabel)}
      className="w-9 h-9 shrink-0 rounded-full hover:bg-surface-container-high text-on-surface-variant flex items-center justify-center transition-colors"
    >
      <X className="w-4 h-4" />
    </button>
  );

  return (
    <>
      {drawerOpen && drawer === "thread" && (
        <div className="cd-drawer cd-drawer-stream" role="dialog" aria-label={drawerLabel}>
          <Stream
            adapter={conversation}
            viewer={{ uid: currentUid ?? "", role: viewer.role }}
            threadMode="replace"
            onClose={onCloseDrawer}
            onMakeTodo={onMakeTodo}
            header={
              // The title alone: who reads it is said above the composer (C3).
              <div className="cd-drawer-head">
                <h3 className="cd-sec-title">{drawerLabel}</h3>
                {closeDrawerButton}
              </div>
            }
          />
        </div>
      )}
      {drawerOpen && drawer === "discussion" && (
        <div className="cd-drawer cd-drawer-stream" role="dialog" aria-label={drawerLabel}>
          <Stream
            adapter={fullTimers}
            viewer={viewer}
            threadMode="replace"
            onClose={onCloseDrawer}
            onMakeTodo={onMakeTodo}
            header={
              <div className="cd-drawer-head">
                <div>
                  <h3 className="cd-sec-title inline-flex items-center gap-2">
                    <Lock className="w-4 h-4" aria-hidden />
                    {drawerLabel}
                  </h3>
                </div>
                {closeDrawerButton}
              </div>
            }
          />
        </div>
      )}
      {drawerOpen && drawer === "interaction" && interactionThread && (
        <div className="cd-drawer cd-drawer-stream" role="dialog" aria-label={t('stream.thread_title')}>
          <Stream
            adapter={interactionThread}
            viewer={viewer}
            threadMode="replace"
            onClose={onCloseDrawer}
            onMakeTodo={onMakeTodo}
          />
        </div>
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
    </>
  );
}
