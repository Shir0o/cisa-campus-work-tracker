import React, { useState } from 'react';
import {
  X,
  Send,
  Pin,
  Paperclip,
  User,
  CheckSquare,
  Calendar,
  History,
  HeartHandshake,
  FileText,
  MessageSquare
} from 'lucide-react';
import { ChatRoom, ChatMessage, ChatAttachment, Contact, ChatReaction } from '../../types';
import { cn, getUserInitials, relTime, firstName } from '../../lib/utils';
import { convReplies } from '../../services/chat';
import ContactPill from '../ui/ContactPill';
import { useTranslate } from '../../hooks/useTranslate';

const QUICK_REACTS = ["🙏", "❤️", "🌱", "👍", "🙌"];

function canRemoveForEveryone(msg: ChatMessage, uid: string | undefined, isAdmin: boolean): boolean {
  return !!msg && !msg.deleted && (msg.senderId === uid || isAdmin);
}

function messageGoneLabel(msg: ChatMessage, uid: string | undefined): string {
  if (!msg.deleted) return "";
  if (msg.deleted.by === uid) {
    return msg.senderId === uid ? "You took this message back." : "You removed this message.";
  }
  const who = firstName(msg.senderName);
  return msg.deleted.by === msg.senderId ? `${who} took this message back.` : `Removed by ${firstName(msg.deleted.by)}.`;
}

function renderBody(text: string, memberFirstNames: string[]): React.ReactNode[] {
  const parts = text.split(/(@[A-Za-z]+)/g);
  return parts.map((part, i) => {
    if (/^@[A-Za-z]+$/.test(part)) {
      const hit = memberFirstNames.some((n) => n.toLowerCase() === part.slice(1).toLowerCase());
      if (hit) return <span key={i} className="text-accent font-semibold">{part}</span>;
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

function MessageBody({ text, memberFirstNames }: { text: string; memberFirstNames: string[] }) {
  const { translatedText } = useTranslate(text);
  return <>{renderBody(translatedText, memberFirstNames)}</>;
}

export interface MsgThreadPaneProps {
  room: ChatRoom;
  parentMsg: ChatMessage;
  allMessages: ChatMessage[];
  effectiveUid?: string;
  isAdmin: boolean;
  onClose: () => void;
  onReact: (messageId: string, emoji: string, current: ChatReaction[]) => void;
  onPin: (messageId: string, pinned: boolean) => void;
  onRemoveAll: (msg: ChatMessage) => void;
  onHide: (messageId: string) => void;
  onTodo: (msg: ChatMessage) => void;
  onOpenContact: (contact: Contact) => void;
  onSendReply: (text: string) => Promise<void>;
  roomMembers: { uid: string; displayName: string }[];
  canPost: boolean;
}

export function MsgThreadPane({
  room,
  parentMsg,
  allMessages,
  effectiveUid,
  isAdmin,
  onClose,
  onReact,
  onPin,
  onRemoveAll,
  onHide,
  onTodo,
  onOpenContact,
  onSendReply,
  roomMembers,
  canPost,
}: MsgThreadPaneProps) {
  const [draft, setDraft] = useState('');
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [menuConfirm, setMenuConfirm] = useState(false);

  const replies = convReplies(allMessages, parentMsg.id);
  const memberFirstNames = roomMembers.map((m) => m.displayName.split(' ')[0]);

  const send = async () => {
    const text = draft.trim();
    if (!text || !canPost) return;
    await onSendReply(text);
    setDraft('');
  };

  const getAttachmentIcon = (type: string) => {
    switch (type) {
      case 'contact': return User;
      case 'todo': return CheckSquare;
      case 'event': return Calendar;
      case 'interaction': return History;
      case 'prayer': return HeartHandshake;
      case 'note': return FileText;
      case 'feedback': return MessageSquare;
      default: return Paperclip;
    }
  };

  const renderBubble = (msg: ChatMessage, isParent: boolean) => {
    const isMe = msg.senderId === effectiveUid;
    const gone = !!msg.deleted;
    const tally: Record<string, number> = {};
    (msg.reactions || []).forEach((r) => { tally[r.emoji] = (tally[r.emoji] || 0) + 1; });
    const mineReacted = (emoji: string) => (msg.reactions || []).some((r) => r.by === effectiveUid && r.emoji === emoji);
    const canAll = canRemoveForEveryone(msg, effectiveUid, isAdmin);
    const menuOpen = menuFor === msg.id;

    return (
      <div key={msg.id} className={cn("msgb", isMe && "mine")}>
        {!isMe && (
          <div className="w-7 h-7 rounded-full bg-primary/10 text-accent font-semibold flex items-center justify-center text-[10px] shrink-0 border border-outline-variant/20">
            {msg.senderPhoto ? (
              <img src={msg.senderPhoto} alt={msg.senderName} className="w-full h-full object-cover rounded-full" />
            ) : (
              getUserInitials(msg.senderName)
            )}
          </div>
        )}
        <div className="msgb-col">
          {!isMe && <div className="msgb-name">{firstName(msg.senderName)}</div>}
          <div className="msgb-row">
            {gone ? (
              <div className="msgb-gone">{messageGoneLabel(msg, effectiveUid)}</div>
            ) : (
              <div className={cn("msgb-bubble", msg.pinned && "pinned")}>
                <MessageBody text={msg.text} memberFirstNames={memberFirstNames} />
                {msg.attachments && msg.attachments.length > 0 && (
                  <div className="mt-2.5 space-y-1.5 border-t border-outline-variant/10 pt-2.5">
                    {msg.attachments.map((attach, idx) => {
                      if (attach.type === 'contact') {
                        return (
                          <div key={idx} className="my-1">
                            <ContactPill
                              contactId={attach.id}
                              fallbackName={attach.name}
                              fallbackSubtitle={attach.subtitle}
                              onOpenContact={(contact) => onOpenContact(contact)}
                            />
                          </div>
                        );
                      }
                      const AttachIcon = getAttachmentIcon(attach.type);
                      return (
                        <div
                          key={idx}
                          className={cn(
                            "p-2 rounded-xl border flex items-start gap-2.5 text-left text-xs",
                            isMe ? "bg-primary/10 border-primary/20" : "bg-surface-container-low border-outline-variant/60"
                          )}
                        >
                          <AttachIcon className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          <div className="min-w-0 flex-1">
                            <span className="font-semibold">{attach.name}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {!gone && (
              <div className="msgb-tools">
                <span className="msgb-react-pick">
                  {QUICK_REACTS.filter((e) => !tally[e]).slice(0, 3).map((e) => (
                    <button
                      key={e}
                      type="button"
                      className="msgb-react-add"
                      title="React"
                      onClick={() => onReact(msg.id, e, msg.reactions || [])}
                    >
                      {e}
                    </button>
                  ))}
                </span>
                <button
                  type="button"
                  className="msgb-pin-btn"
                  title={msg.pinned ? "Unpin" : "Pin"}
                  onClick={() => onPin(msg.id, !msg.pinned)}
                >
                  <Pin className="w-3 h-3" />
                </button>
                <span className="msgb-menu-wrap">
                  <button
                    type="button"
                    className="msgb-pin-btn"
                    title="More"
                    onClick={() => {
                      setMenuFor(menuOpen ? null : msg.id);
                      setMenuConfirm(false);
                    }}
                  >⋯</button>
                  {menuOpen && (
                    <>
                      <div
                        className="msgb-menu-away"
                        onClick={() => {
                          setMenuFor(null);
                          setMenuConfirm(false);
                        }}
                      />
                      <div className="msgb-menu">
                        {menuConfirm ? (
                          <>
                            <p>Take this back for everyone?</p>
                            <button
                              className="msgb-menu-danger"
                              onClick={() => {
                                onRemoveAll(msg);
                                setMenuFor(null);
                                setMenuConfirm(false);
                              }}
                            >
                              Yes, remove it
                            </button>
                            <button onClick={() => setMenuConfirm(false)}>Keep it</button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => {
                                onHide(msg.id);
                                setMenuFor(null);
                              }}
                            >
                              Hide from my view
                            </button>
                            <button
                              onClick={() => {
                                onTodo(msg);
                                setMenuFor(null);
                              }}
                            >
                              Make a to-do
                            </button>
                            {canAll && (
                              <button
                                className="msgb-menu-danger"
                                onClick={() => setMenuConfirm(true)}
                              >
                                {isMe ? "Take back for everyone" : "Remove for everyone"}
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </>
                  )}
                </span>
              </div>
            )}
          </div>
          <div className="msgb-foot">
            <span className="msgb-when">
              {msg.timestamp?.seconds ? relTime(new Date(msg.timestamp.seconds * 1000).toISOString()) : ''}
            </span>
            {!gone && Object.keys(tally).length > 0 && (
              <span className="msgb-reacts">
                {Object.keys(tally).map((e) => (
                  <button
                    key={e}
                    type="button"
                    className={cn("msgb-react", mineReacted(e) && "on")}
                    onClick={() => onReact(msg.id, e, msg.reactions || [])}
                  >
                    <span>{e}</span><span className="msgb-react-n">{tally[e]}</span>
                  </button>
                ))}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="msgs-pane">
      <div className="msgs-pane-head">
        <div>
          <div className="msgs-pane-title">Thread</div>
          <div className="msgs-pane-sub">
            {firstName(parentMsg.senderName)} · {room.name || 'Conversation'}
          </div>
        </div>
        <button type="button" className="icon-btn" onClick={onClose}>
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="msgs-pane-stream">
        {renderBubble(parentMsg, true)}
        <div className="msgs-pane-count">
          {replies.length === 0
            ? "No replies yet"
            : replies.length === 1
            ? "1 reply"
            : `${replies.length} replies`}
        </div>
        {replies.map((r) => renderBubble(r, false))}
      </div>

      {canPost ? (
        <div className="msgs-composer msgs-pane-composer">
          <div className="msgs-composer-row">
            <textarea
              className="li-input msgs-ta"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={`Reply to ${firstName(parentMsg.senderName)}…`}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            <button
              type="button"
              className="msgs-send"
              disabled={!draft.trim()}
              onClick={() => void send()}
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        <div className="msgs-readonly">
          <span>This one's an announcement — replies go to the team directly.</span>
        </div>
      )}
    </div>
  );
}
