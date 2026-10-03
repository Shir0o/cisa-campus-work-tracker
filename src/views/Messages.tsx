import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  where,
  doc,
  getDoc,
  updateDoc,
  serverTimestamp
} from 'firebase/firestore';
import {
  MessageSquare,
  Plus,
  Paperclip,
  Info,
  ChevronLeft,
  Search,
  User,
  Users,
  CheckSquare,
  Calendar,
  History,
  HeartHandshake,
  FileText,
  Check,
  Pin,
  Bell
} from 'lucide-react';
import { cn, getUserInitials, relTime, firstName } from '../lib/utils';
import { db } from '../lib/firebase';
import { useAuth } from '../components/AuthProvider';
import { useLanguage } from '../components/LanguageProvider';
import { prefetchTranslations } from '../lib/translator';
import { useMediaQuery } from '../lib/useMediaQuery';
import { useLayout } from '../App';
import { ChatRoom, ChatMessage, ChatAttachment, Contact } from '../types';
import {
  togglePinMessage,
  removeMessageForEveryone,
  deleteChatRoom,
  canRemoveConvForEveryone,
  acknowledgeAnnouncement,
  markAnnouncementRead
} from '../services/chat';
import { setTodoDone } from '../lib/todos';
import type { TodoPerson } from '../lib/todos';
import FromEntryTodoComposer from '../components/todos/FromEntryTodoComposer';
import { MessageHides } from '../lib/messageHides';
import { ConvHides } from '../lib/convHides';

// Modals & UI
import CreateChatModal from '../components/modals/CreateChatModal';
import ChatDetailsModal from '../components/modals/ChatDetailsModal';
import AttachDataModal from '../components/modals/AttachDataModal';
import ContactPill from '../components/ui/ContactPill';
import Stream from '../components/stream/Stream';
import {
  announcementReadMark,
  chatAdapter,
  chatReadMark,
  chatRoomSubtitle,
  type ChatStreamMessage,
} from '../components/stream/chatAdapter';

export default function Messages() {
  const { roomId } = useParams<{ roomId?: string }>();
  // A notification about a reply opens that message's Thread (#1303).
  const [searchParams] = useSearchParams();
  const initialThreadId = searchParams.get('parent');
  const { user: currentUser, role: userRole, effectiveUserId, impersonateTarget } = useAuth();
  const effectiveUid = effectiveUserId || currentUser?.uid;
  const { setSelectedContact, openLogInteraction } = useLayout();
  const navigate = useNavigate();
  const isMobile = useMediaQuery("(max-width: 768px)");
  // A Thread opens beside the channel where both fit (T2); below that it
  // replaces the channel, with back.
  const threadBeside = useMediaQuery("(min-width: 1280px)");
  const isAdmin = userRole === 'admin';

  // Modals state
  const [createChatOpen, setCreateChatOpen] = useState(false);
  const [chatDetailsOpen, setChatDetailsOpen] = useState(false);
  const [attachDataOpen, setAttachDataOpen] = useState(false);
  const [readReceiptMsg, setReadReceiptMsg] = useState<ChatMessage | null>(null);

  // Messaging state
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(roomId || null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  // Where the "New" line goes (G6), fixed when the room opens: a chat's
  // per-device last-read, an announcement's first unread post. Reading moves
  // both on, and the line should not chase the reader down the stream.
  const [readMark, setReadMark] = useState<string | null>(null);
  const readMarkRoomRef = useRef<string | null>(null);
  const [roomSearch, setRoomSearch] = useState('');
  const [loadingRooms, setLoadingRooms] = useState(true);
  const { language, t } = useLanguage();

  useEffect(() => {
    setActiveRoomId(roomId || null);
  }, [roomId]);

  const handleSelectRoom = (id: string) => {
    setActiveRoomId(id);
    navigate(`/messages/${id}`);
  };

  const handleClearRoom = () => {
    setActiveRoomId(null);
    navigate('/messages');
  };

  // Warm translation cache for visible chat messages when Spanish is active.
  useEffect(() => {
    if (language !== 'es') return;
    void prefetchTranslations(
      messages.flatMap((m) => [m.text, ...(m.attachments ?? []).map((a) => a.name)]),
      language,
    );
  }, [messages, language]);

  // Rail filter + thread chrome (the design's msgs-filters / pinned strip / thread search)
  const [filter, setFilter] = useState<'all' | 'unread' | 'groups' | 'announce'>('all');
  const [threadSearchOpen, setThreadSearchOpen] = useState(false);
  const [threadSearch, setThreadSearch] = useState('');
  const [pinnedOpen, setPinnedOpen] = useState(false);

  // "Make a to-do" — the message being turned into a follow-up task.
  const [todoFor, setTodoFor] = useState<ChatMessage | null>(null);

  // User details cache (to show correct names for direct chats; the role
  // says who posts in an announcement)
  const [usersCache, setUsersCache] = useState<Record<string, { displayName: string; photoURL?: string; role?: string }>>({});

  // The open conversation — the stream inside it holds the scrolling list.
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // The room's other members: mention candidates and the header's posters.
  const [roomMembers, setRoomMembers] = useState<{ uid: string; displayName: string; role?: string }[]>([]);

  // Hidden-from-view messages & conversations (client-only, per viewer — MessageHides / ConvHides)
  const [, setHideNonce] = useState(0);
  useEffect(() => {
    const unsub1 = MessageHides.subscribe(() => setHideNonce((n) => n + 1));
    const unsub2 = ConvHides.subscribe(() => setHideNonce((n) => n + 1));
    return () => {
      unsub1();
      unsub2();
    };
  }, []);

  // Conversation ⋯ menu (which room ID, and whether confirm step is showing)
  const [convMenuFor, setConvMenuFor] = useState<string | null>(null);
  const [convMenuConfirm, setConvMenuConfirm] = useState(false);

  // Toggle fullscreen chat body class on mobile when a chat is open
  useEffect(() => {
    const full = isMobile && !!activeRoomId;
    document.body.classList.toggle("msgs-fullscreen", full);
    return () => document.body.classList.remove("msgs-fullscreen");
  }, [isMobile, activeRoomId]);

  // Back-button/gesture integration for mobile chat
  useEffect(() => {
    if (!isMobile || !activeRoomId) return;

    const stateId = `chat-room-${activeRoomId}`;
    window.history.pushState({ chatRoomId: stateId }, '');

    const handlePopState = () => {
      setActiveRoomId(null);
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [isMobile, activeRoomId]);

  // 1. Fetch Rooms (Real-time)
  useEffect(() => {
    if (!effectiveUid) {
      setRooms([]);
      setLoadingRooms(false);
      return;
    }

    setLoadingRooms(true);
    // Only fetch chat rooms where the user is an explicit member
    const roomsQuery = query(
      collection(db, 'chatRooms'),
      where('memberIds', 'array-contains', effectiveUid)
    );

    const unsubscribe = onSnapshot(roomsQuery, (snapshot) => {
      const chatRooms: ChatRoom[] = [];
      snapshot.forEach((doc) => {
        chatRooms.push({ id: doc.id, ...doc.data() } as ChatRoom);
      });
      // Sort by last message timestamp or creation timestamp
      chatRooms.sort((a, b) => {
        const timeA = a.lastMessage?.timestamp?.seconds || a.createdAt?.seconds || 0;
        const timeB = b.lastMessage?.timestamp?.seconds || b.createdAt?.seconds || 0;
        return timeB - timeA;
      });
      setRooms(chatRooms);
      setLoadingRooms(false);
    }, (error) => {
      console.error('Error fetching rooms:', error);
      setLoadingRooms(false);
    });

    return unsubscribe;
  }, [effectiveUid]);

  // Reset active room if the current user is no longer a member of it
  useEffect(() => {
    if (activeRoomId && rooms.length > 0 && !loadingRooms) {
      const exists = rooms.some((r) => r.id === activeRoomId);
      if (!exists) {
        setActiveRoomId(null);
      }
    }
  }, [rooms, activeRoomId, loadingRooms]);

  // 2. Fetch Active Room Messages
  useEffect(() => {
    if (!activeRoomId) {
      setMessages([]);
      readMarkRoomRef.current = null;
      return;
    }
    const activeRoom = rooms.find(r => r.id === activeRoomId);

    const messagesQuery = query(
      collection(db, 'chatRooms', activeRoomId, 'messages'),
      orderBy('timestamp', 'asc')
    );

    const unsubscribe = onSnapshot(messagesQuery, (snapshot) => {
      const roomMsgs: ChatMessage[] = [];
      snapshot.forEach((doc) => {
        roomMsgs.push({ id: doc.id, ...doc.data() } as ChatMessage);
      });
      setMessages(roomMsgs);

      // The New line's place, once per room visit — read before this visit
      // marks the room read.
      if (readMarkRoomRef.current !== activeRoomId) {
        readMarkRoomRef.current = activeRoomId;
        setReadMark(
          activeRoom?.type === 'announcement'
            ? announcementReadMark(roomMsgs, effectiveUid || '')
            : chatReadMark(localStorage.getItem(`chat_read_${activeRoomId}`))
        );
      }

      // Mark as read in LocalStorage
      localStorage.setItem(`chat_read_${activeRoomId}`, Date.now().toString());
    }, (error) => {
      console.error('Error fetching messages:', error);
    });

    // Populate room members for autocomplete
    if (activeRoom) {
      const membersList: { uid: string; displayName: string; role?: string }[] = [];
      activeRoom.memberIds.forEach(async (uid) => {
        if (uid === currentUser?.uid) return;
        const cached = usersCache[uid];
        if (cached) {
          membersList.push({ uid, displayName: cached.displayName, role: cached.role });
        } else {
          try {
            const userDoc = await getDoc(doc(db, 'users', uid));
            if (userDoc.exists()) {
              const uData = userDoc.data();
              setUsersCache(prev => ({
                ...prev,
                [uid]: { displayName: uData.displayName, photoURL: uData.photoURL, role: uData.role }
              }));
              membersList.push({ uid, displayName: uData.displayName, role: uData.role });
            }
          } catch (e) {
            console.error(e);
          }
        }
      });
      setRoomMembers(membersList);
    }

    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRoomId, rooms, currentUser]);

  // 3. User details loader for caching direct chat profiles
  useEffect(() => {
    if (rooms.length === 0 || !currentUser) return;

    rooms.forEach((room) => {
      if (room.type === 'direct') {
        const otherUid = room.memberIds.find((id) => id !== currentUser.uid);
        if (otherUid && !usersCache[otherUid]) {
          const userRef = doc(db, 'users', otherUid);
          getDoc(userRef).then((snap) => {
            if (snap.exists()) {
              setUsersCache((prev) => ({
                ...prev,
                [otherUid]: {
                  displayName: snap.data().displayName || 'Member',
                  photoURL: snap.data().photoURL || ''
                }
              }));
            }
          }).catch(console.error);
        }
      }
    });
  }, [rooms, currentUser, usersCache]);

  const activeRoom = rooms.find(r => r.id === activeRoomId);

  // Check unread status
  const isUnread = (room: ChatRoom) => {
    if (!room.lastMessage || room.lastMessage.senderId === effectiveUid) return false;
    const readKey = effectiveUid ? `chat_read_${effectiveUid}_${room.id}` : `chat_read_${room.id}`;
    const lastRead = localStorage.getItem(readKey) || localStorage.getItem(`chat_read_${room.id}`);
    if (!lastRead) return true;
    const lastMsgTime = room.lastMessage.timestamp?.seconds * 1000 || 0;
    return lastMsgTime > parseInt(lastRead);
  };

  const getRoomName = (room: ChatRoom) => {
    if (room.type === 'announcement') return room.name || 'Announcement';
    if (room.type === 'group') return room.name || 'Group';
    const otherUid = room.memberIds.find(id => id !== effectiveUid);
    return otherUid ? usersCache[otherUid]?.displayName || 'Direct Chat' : 'Direct Chat';
  };

  const getRoomPhoto = (room: ChatRoom) => {
    if (room.type !== 'direct') return null;
    const otherUid = room.memberIds.find(id => id !== effectiveUid);
    return otherUid ? usersCache[otherUid]?.photoURL || '' : '';
  };

  // The line under the room's name (S5): "Group · 4 people", or who posts in
  // an announcement.
  const threadSub = activeRoom
    ? chatRoomSubtitle(activeRoom, { members: roomMembers, meIsFullTimer: isAdmin, t })
    : '';

  // Filtered and deduplicated room list (the design's msgs-filters + search)
  const seenDirectUids = new Set<string>();
  const filteredRooms = rooms.filter((r) => {
    if (effectiveUid && ConvHides.has(effectiveUid, r.id)) return false;
    if (r.type === 'direct') {
      const otherUid = r.memberIds.find((id) => id !== effectiveUid) || r.memberIds[0];
      if (otherUid) {
        const otherUser = usersCache[otherUid];
        if (otherUser) {
          const nameLower = (otherUser.displayName || '').toLowerCase();
          if (nameLower.startsWith('cisa-')) return false;
        }
        if (seenDirectUids.has(otherUid)) {
          return false; // Skip duplicate direct chat channel for the same person
        }
        seenDirectUids.add(otherUid);
      }
    }
    const name = getRoomName(r).toLowerCase();
    if (name.startsWith('cisa-')) return false;
    if (!name.includes(roomSearch.toLowerCase())) return false;
    if (filter === 'unread' && !isUnread(r)) return false;
    if (filter === 'groups' && r.type !== 'group') return false;
    if (filter === 'announce' && r.type !== 'announcement') return false;
    return true;
  });

  const hiddenConvs = effectiveUid ? rooms.filter((r) => ConvHides.has(effectiveUid, r.id)) : [];

  // Handle clicking attachment cards in chat bubble
  const handleAttachmentClick = async (attachment: ChatAttachment) => {
    if (attachment.type === 'contact') {
      setLoadingRooms(true);
      try {
        const docRef = doc(db, 'contacts', attachment.id);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          setSelectedContact({ id: snap.id, ...snap.data() } as Contact);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingRooms(false);
      }
    } else if (attachment.type === 'interaction') {
      navigate('/history');
    } else if (attachment.type === 'todo') {
      navigate('/');
    } else if (attachment.type === 'event') {
      navigate('/attendance');
    } else if (attachment.type === 'prayer') {
      navigate('/prayer');
    } else if (attachment.type === 'note') {
      navigate('/coordination');
    } else if (attachment.type === 'feedback') {
      navigate('/admin/feedback');
    }
  };

  const handleToggleTodo = async (attachment: ChatAttachment, done: boolean) => {
    try {
      await setTodoDone(attachment.id, done);
    } catch (e) {
      console.error(e);
    }
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

  // ── the thread's visible messages (the design's visibleMessages: hidden
  //    messages are filtered out for THIS viewer only, and can be brought back)
  const hiddenHere = effectiveUid ? messages.filter((m) => MessageHides.has(effectiveUid, m.id)) : [];
  // A search narrows the top-level messages; a Thread keeps all its replies.
  const visibleMsgs = messages.filter((m) => {
    if (effectiveUid && MessageHides.has(effectiveUid, m.id)) return false;
    if (threadSearch && !m.parentId) return (m.text || '').toLowerCase().includes(threadSearch.toLowerCase());
    return true;
  });
  const pinned = messages.filter((m) => m.pinned && !m.deleted);

  // The stream's scrolling list, inside the open conversation.
  const streamList = () => (messagesContainerRef.current?.querySelector('[data-stream-list]') ?? null) as HTMLElement | null;

  // An announcement post is "read" when it enters view, not when the room
  // loads — so the "new to you" treatment survives until the reader gets to it.
  // The observer starts after the stream has opened on its newest message, so
  // posts parked off-screen at the top during load are not swept up.
  const announcementRoomId = activeRoom?.type === 'announcement' ? activeRoom.id : null;
  const markedReadRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!announcementRoomId || !effectiveUid || typeof IntersectionObserver === 'undefined') return;
    const unread = new Set(
      messages.filter((m) => !m.parentId && !m.deleted && !m.readBy?.includes(effectiveUid)).map((m) => m.id)
    );
    const root = (messagesContainerRef.current?.querySelector('[data-stream-list]') ?? null) as HTMLElement | null;
    let cleanup = () => {};
    const timer = window.setTimeout(() => {
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const id = entry.target.getAttribute('data-stream-row') || '';
            if (!entry.isIntersecting || markedReadRef.current.has(`${announcementRoomId}/${id}`)) continue;
            markedReadRef.current.add(`${announcementRoomId}/${id}`);
            observer.unobserve(entry.target);
            void markAnnouncementRead(announcementRoomId, id, effectiveUid);
          }
        },
        // Shrink the viewport a little so a post has to be properly on screen.
        { root, rootMargin: '-10% 0px -10% 0px' }
      );
      root?.querySelectorAll('[data-stream-row]').forEach((el) => {
        const id = el.getAttribute('data-stream-row') || '';
        if (unread.has(id) && !markedReadRef.current.has(`${announcementRoomId}/${id}`)) observer.observe(el);
      });
      cleanup = () => observer.disconnect();
    }, 150);
    return () => {
      window.clearTimeout(timer);
      cleanup();
    };
  }, [announcementRoomId, effectiveUid, messages]);

  const jumpTo = (messageId: string) => {
    const list = streamList();
    const el = list?.querySelector(`[data-stream-row="${messageId}"]`) as HTMLElement | null | undefined;
    if (el && list) {
      list.scrollTop = el.offsetTop - 24;
    }
    setPinnedOpen(false);
  };

  // Take a message back for everyone; if it was the room's last visible one,
  // keep the rail preview honest (a conversation never leaks removed text).
  const handleRemoveAll = async (msg: ChatMessage) => {
    if (!activeRoomId || !effectiveUid) return;
    await removeMessageForEveryone(activeRoomId, msg.id, effectiveUid);
    if (messages[messages.length - 1]?.id === msg.id) {
      await updateDoc(doc(db, 'chatRooms', activeRoomId), {
        lastMessage: {
          text: 'Message removed',
          senderId: msg.senderId,
          senderName: msg.senderName,
          timestamp: serverTimestamp(),
        },
      });
    }
  };

  // Team for the "make a to-do" composer: the room's members plus the viewer.
  const todoTeam: TodoPerson[] = useMemo(() => {
    const people: TodoPerson[] = roomMembers.map((m) => ({ uid: m.uid, name: m.displayName }));
    if (currentUser?.displayName) {
      people.push({ uid: currentUser.uid, name: currentUser.displayName, photoURL: currentUser.photoURL || undefined });
    }
    return people;
  }, [roomMembers, currentUser]);

  // The open room as a written stream (ADR 0033): DM, group or announcement.
  const adapter = activeRoom && effectiveUid
    ? chatAdapter({
        room: activeRoom,
        roomName: getRoomName(activeRoom),
        messages: visibleMsgs,
        me: {
          uid: effectiveUid,
          displayName: impersonateTarget ? impersonateTarget.name : (currentUser?.displayName || 'Member'),
          photoURL: impersonateTarget ? '' : (currentUser?.photoURL || ''),
          isFullTimer: isAdmin,
        },
        members: roomMembers,
        lastReadAt: readMark,
        staged: attachments,
        search: threadSearch,
        t,
        onAttach: () => setAttachDataOpen(true),
        onUnstage: (i) => setAttachments((prev) => prev.filter((_, n) => n !== i)),
        onSent: () => setAttachments([]),
        onPin: (m, pin) => void togglePinMessage(activeRoom.id, m.id, pin, currentUser?.uid),
        onHide: (m) => MessageHides.hide(effectiveUid, m.id),
        onRemove: (m) => handleRemoveAll(m),
      })
    : null;

  /** A message's attachments, under its body: contact cards open the
   *  person; to-dos tick; the rest go where they live. */
  const renderAttachments = (m: ChatStreamMessage) => {
    const list = m.source.attachments;
    if (!list || list.length === 0) return null;
    return (
      <div className="strm-files">
        {list.map((attach, idx) => {
          if (attach.type === 'contact') {
            return (
              <ContactPill
                key={idx}
                contactId={attach.id}
                fallbackName={attach.name}
                fallbackSubtitle={attach.subtitle}
                onOpenContact={(contact) => setSelectedContact(contact)}
              />
            );
          }
          const AttachIcon = getAttachmentIcon(attach.type);
          const body = (
            <span className="min-w-0">
              <span className={cn(attach.type === 'todo' && attach.status === 'completed' && "line-through opacity-70")}>{attach.name}</span>
              {attach.subtitle && <span className="strm-file-sub">{attach.subtitle}</span>}
            </span>
          );
          if (attach.type === 'todo') {
            return (
              <label key={idx} className="strm-file">
                <input
                  type="checkbox"
                  checked={attach.status === 'completed'}
                  onChange={(e) => handleToggleTodo(attach, e.target.checked)}
                  className="w-4 h-4 rounded accent-primary cursor-pointer shrink-0"
                />
                {body}
              </label>
            );
          }
          return (
            <button key={idx} type="button" className="strm-file" onClick={() => handleAttachmentClick(attach)}>
              <AttachIcon className="w-4 h-4 shrink-0 text-on-surface-variant" />
              {body}
            </button>
          );
        })}
      </div>
    );
  };

  /** Beside an announcement post's Thread chip (S4): a member says Got it and
   *  can reply in a thread; a Full-timer sees who has read it, as one link to
   *  the receipts. */
  const renderPostActions = (m: ChatStreamMessage, { openThread, replies }: { openThread: () => void; replies: number }) => {
    const s = m.source;
    if (m.parentId || !activeRoom || !effectiveUid) return null;
    const acked = !!s.acknowledged?.includes(effectiveUid);
    const read = String(s.readBy?.length || 0);
    const total = String(activeRoom.memberIds?.length || 0);
    const said = s.acknowledged?.length || 0;
    return (
      <>
        {s.senderId !== effectiveUid && (
          <button
            type="button"
            className={cn("strm-btn", acked && "strm-btn-done")}
            aria-pressed={acked}
            onClick={() => void acknowledgeAnnouncement(activeRoom.id, s.id, effectiveUid, s.acknowledged || [])}
          >
            <Check className="w-3.5 h-3.5" aria-hidden />
            {acked ? t('modals.you_said_got_it') : t('modals.got_it')}
          </button>
        )}
        {isAdmin ? (
          <button type="button" className="strm-receipt" title={t('chat.view_receipts')} onClick={() => setReadReceiptMsg(s)}>
            {said > 0
              ? t('chat.read_by_acked').replace('{read}', read).replace('{total}', total).replace('{n}', String(said))
              : t('modals.read_by_n').replace('{read}', read).replace('{total}', total)}
          </button>
        ) : (
          replies === 0 && (
            <button type="button" className="strm-btn" onClick={openThread}>
              <MessageSquare className="w-3.5 h-3.5" aria-hidden />
              {t('modals.reply_in_thread')}
            </button>
          )
        )}
      </>
    );
  };

  return (
    <div className="page msgs flex flex-1 h-full min-h-0 w-full overflow-hidden bg-background">
      {/* 1. Left Rail — the design's msgs-rail */}
      <div className={cn(
        "msgs-rail flex flex-col border-r border-outline-variant w-full md:w-[328px] shrink-0 bg-surface min-h-0",
        activeRoomId ? "hidden md:flex" : "flex"
      )}>
        {/* Rail head */}
        <div className="msgs-rail-head">
          <h1 className="page-title">Messages</h1>
          <button
            onClick={() => setCreateChatOpen(true)}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-primary text-on-primary text-[13.5px] font-semibold hover:bg-primary/90 active:scale-[0.98] transition-all cursor-pointer"
            title="Start Chat"
          >
            <Plus className="w-3.5 h-3.5" /> New
          </button>
        </div>

        {/* Search */}
        <div className="msgs-search">
          <Search className="w-3.5 h-3.5 shrink-0" />
          <input
            type="text"
            placeholder="Search messages…"
            value={roomSearch}
            onChange={(e) => setRoomSearch(e.target.value)}
          />
        </div>

        {/* Filter pills */}
        <div className="msgs-filters">
          {([["all", "All"], ["unread", "Unread"], ["groups", "Groups"], ["announce", "Announcements"]] as const).map(([id, label]) => (
            <button
              key={id}
              className={cn("msgs-pill", filter === id && "on")}
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Rooms Scroll List */}
        <div className="msgs-list">
          {loadingRooms ? (
            <div className="msgs-people-empty">Loading conversations…</div>
          ) : filteredRooms.length === 0 ? (
            <div className="msgs-people-empty">Nothing here yet.</div>
          ) : (() => {
            const isAll = filter === 'all';
            const annRooms = filteredRooms.filter(r => r.type === 'announcement');
            const convRooms = filteredRooms.filter(r => r.type !== 'announcement');
            const shouldSection = isAll && annRooms.length > 0 && convRooms.length > 0;

            const renderRoomItem = (room: ChatRoom) => {
              const isActive = room.id === activeRoomId;
              const name = getRoomName(room);
              const photo = getRoomPhoto(room);
              const unread = isUnread(room);
              const last = room.lastMessage;
              const isGroupish = room.type !== 'direct';
              const menuOpen = convMenuFor === room.id;
              const canAllConv = canRemoveConvForEveryone(room, effectiveUid, isAdmin);

              if (room.type === 'announcement') {
                return (
                  <div
                    key={room.id}
                    className={cn("anrow", isActive && "active", unread && "unread")}
                    onClick={() => handleSelectRoom(room.id)}
                  >
                    <div className="anrow-top">
                      <span className="cluster">
                        <Bell className="w-3.5 h-3.5" />
                      </span>
                      <span className="anrow-name">{name}</span>
                      {last?.timestamp?.seconds && (
                        <span className="anrow-time">{relTime(new Date(last.timestamp.seconds * 1000).toISOString())}</span>
                      )}
                    </div>
                    <div className="anrow-body">
                      {last ? (last.senderName === 'System' ? last.text : last.text) : t('common.no_messages', 'No messages yet')}
                    </div>
                    <div className="anrow-meta">
                      {unread && <span className="dot-warn" />}
                      <span>{unread ? 'New' : 'Read'}{last ? ` · from ${firstName(last.senderName)}` : ''}</span>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={room.id}
                  className={cn("msgs-item", isActive && "active", unread && "unread")}
                  onClick={() => handleSelectRoom(room.id)}
                >
                  {isGroupish ? (
                    <span className="msgs-cluster">
                      <Users className="w-4 h-4" />
                    </span>
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-primary/10 text-accent font-semibold flex items-center justify-center border border-outline-variant/30 text-sm shrink-0">
                      {photo ? (
                        <img src={photo} alt={name} className="w-full h-full object-cover rounded-full" />
                      ) : (
                        getUserInitials(name)
                      )}
                    </div>
                  )}
                  <div className="msgs-item-main">
                    <div className="msgs-item-top">
                      <span className="msgs-item-name">{name}</span>
                      {last?.timestamp?.seconds && (
                        <span className="msgs-item-time">{relTime(new Date(last.timestamp.seconds * 1000).toISOString())}</span>
                      )}
                    </div>
                    <div className="msgs-item-bot">
                      <span className="msgs-item-preview">
                        {!last ? (
                          'No messages yet'
                        ) : last.senderName === 'System' ? (
                          last.text
                        ) : (
                          <>
                            {isGroupish && <b>{last.senderId === effectiveUid ? 'You' : firstName(last.senderName)}: </b>}
                            {last.text}
                          </>
                        )}
                      </span>
                      {unread && <span className="msgs-unread-dot"></span>}
                      <span
                        className={cn("msgs-item-more", menuOpen && "on")}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          title="More options"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConvMenuFor(menuOpen ? null : room.id);
                            setConvMenuConfirm(false);
                          }}
                        >
                          ⋯
                        </button>
                        {menuOpen && (
                          <>
                            <div
                              className="msgb-menu-away"
                              onClick={(e) => {
                                e.stopPropagation();
                                setConvMenuFor(null);
                                setConvMenuConfirm(false);
                              }}
                            />
                            <div className="msgb-menu">
                              {convMenuConfirm ? (
                                <>
                                  <p>Delete this conversation for everyone? It leaves everyone's list, messages and all.</p>
                                  <button
                                    className="msgb-menu-danger"
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      setConvMenuFor(null);
                                      setConvMenuConfirm(false);
                                      try {
                                        await deleteChatRoom(room.id);
                                        if (activeRoomId === room.id) handleClearRoom();
                                      } catch (err) {
                                        console.error('Failed to delete chat room:', err);
                                      }
                                    }}
                                  >
                                    Yes, delete it
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setConvMenuConfirm(false);
                                    }}
                                  >
                                    Keep it
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setConvMenuFor(null);
                                      if (effectiveUid) ConvHides.hide(effectiveUid, room.id);
                                      if (activeRoomId === room.id) handleClearRoom();
                                    }}
                                  >
                                    Hide from my list
                                  </button>
                                  {canAllConv ? (
                                    <button
                                      className="msgb-menu-danger"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setConvMenuConfirm(true);
                                      }}
                                    >
                                      Delete for everyone
                                    </button>
                                  ) : (
                                    <p>Only whoever started it or a full-timer can delete it for everyone.</p>
                                  )}
                                </>
                              )}
                            </div>
                          </>
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              );
            };

            if (shouldSection) {
              return (
                <>
                  <div className="sech">
                    <span>{t('modals.announcements_heading', 'Announcements')}</span>
                    <span className="n">{annRooms.length}</span>
                    <span className="rule" />
                  </div>
                  {annRooms.map(renderRoomItem)}
                  <div className="sech">
                    <span>{t('common.conversations', 'Conversations')}</span>
                    <span className="rule" />
                  </div>
                  {convRooms.map(renderRoomItem)}
                </>
              );
            }

            return filteredRooms.map(renderRoomItem);
          })()}
          {hiddenConvs.length > 0 && (
            <div className="msgs-hidden-note msgs-hidden-convs">
              <span>
                {hiddenConvs.length === 1
                  ? "One conversation is hidden from your list. Everyone else still has it."
                  : `${hiddenConvs.length} conversations are hidden from your list. Everyone else still have them.`}
              </span>
              <button
                onClick={() => effectiveUid && ConvHides.unhideAll(effectiveUid, hiddenConvs.map((c) => c.id))}
              >
                {hiddenConvs.length === 1 ? "Bring it back" : "Bring them back"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 2. Right — the thread (the design's msgs-thread) */}
        <div ref={messagesContainerRef} className={cn(
          "msgs-thread flex flex-col flex-1 h-full bg-surface-container-lowest min-w-0",
          activeRoomId ? "flex" : "hidden md:flex",
          adapter && "msgs-streamed"
        )}>
          {!activeRoom || !adapter ? (
            /* Empty Chat Area Placeholder */
            <div className="msgs-empty">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 text-accent flex items-center justify-center mb-1">
                <MessageSquare className="w-6 h-6" />
              </div>
              <div className="ntf-empty-title">Pick a conversation</div>
              <div className="ntf-empty-sub">Or start a new one — everyone in the app is reachable from here.</div>
            </div>
          ) : (
            <Stream
              key={activeRoom.id}
              adapter={adapter}
              viewer={{ uid: effectiveUid || '', role: userRole }}
              threadMode={threadBeside ? 'beside' : 'replace'}
              onMakeTodo={(m) => setTodoFor(m.source)}
              renderExtra={renderAttachments}
              renderActions={activeRoom.type === 'announcement' ? renderPostActions : undefined}
              translate
              initialThreadId={initialThreadId}
              footer={adapter.readOnlyNote && <div className="msgs-postnote">{adapter.readOnlyNote}</div>}
              header={
              <>
              {/* Active Room Header */}
              <div className="msgs-thread-head">
                {isMobile && (
                  <button className="icon-btn" onClick={handleClearRoom}>
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                )}
                {activeRoom.type === 'direct' ? (
                  <div className="avatar w-9 h-9 rounded-full bg-primary/10 text-accent font-semibold flex items-center justify-center border border-outline-variant/30 text-xs shrink-0">
                    {getRoomPhoto(activeRoom) ? (
                      <img src={getRoomPhoto(activeRoom) || ''} alt={getRoomName(activeRoom)} className="w-full h-full object-cover rounded-full" />
                    ) : (
                      getUserInitials(getRoomName(activeRoom))
                    )}
                  </div>
                ) : (
                  <span className={cn("msgs-cluster", activeRoom.type === 'announcement' && "broadcast")}>
                    {activeRoom.type === 'announcement' ? <Bell className="w-4 h-4" /> : <Users className="w-4 h-4" />}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="msgs-thread-title">{getRoomName(activeRoom)}</div>
                  <div className="msgs-thread-sub">{threadSub}</div>
                </div>
                <div className="msgs-thread-actions">
                  {pinned.length > 0 && (
                    <button className="icon-btn" title="Pinned messages" onClick={() => setPinnedOpen(o => !o)}>
                      <Pin className="w-4 h-4" />
                    </button>
                  )}
                  <button className="icon-btn" title="Search in conversation" onClick={() => setThreadSearchOpen(o => !o)}>
                    <Search className="w-4 h-4" />
                  </button>
                  <button className="icon-btn" title="Group details" onClick={() => setChatDetailsOpen(true)}>
                    <Info className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Thread search */}
              {threadSearchOpen && (
                <div className="msgs-thread-search">
                  <Search className="w-3.5 h-3.5 shrink-0" />
                  <input autoFocus placeholder="Search this conversation…" value={threadSearch} onChange={(e) => setThreadSearch(e.target.value)} />
                </div>
              )}

              {/* Pinned strip */}
              {pinnedOpen && pinned.length > 0 && (
                <div className="msgs-pinned-strip">
                  {pinned.map((m) => (
                    <div key={m.id} className="msgs-pinned-row" onClick={() => jumpTo(m.id)}>
                      <Pin className="w-3 h-3 shrink-0" />
                      <span><b>{m.senderId === effectiveUid ? 'You' : firstName(m.senderName)}:</b> {m.text}</span>
                    </div>
                  ))}
                </div>
              )}

                {hiddenHere.length > 0 && (
                  <div className="msgs-hidden-note">
                    <span>
                      {hiddenHere.length === 1
                        ? "One message is hidden from your view. Everyone else still sees it."
                        : `${hiddenHere.length} messages are hidden from your view. Everyone else still sees them.`}
                    </span>
                    <button onClick={() => effectiveUid && MessageHides.unhideAll(effectiveUid, hiddenHere.map((m) => m.id))}>
                      {hiddenHere.length === 1 ? "Bring it back" : "Bring them back"}
                    </button>
                  </div>
                )}
              </>
              }
            />
          )}
      </div>

      {/* Modals overlay */}
      <CreateChatModal
        isOpen={createChatOpen}
        onClose={() => setCreateChatOpen(false)}
        onSelectRoom={(id) => handleSelectRoom(id)}
      />

      {activeRoom && (
        <ChatDetailsModal
          isOpen={chatDetailsOpen}
          onClose={() => setChatDetailsOpen(false)}
          room={activeRoom}
          onLeftGroup={handleClearRoom}
        />
      )}

      <AttachDataModal
        isOpen={attachDataOpen}
        onClose={() => setAttachDataOpen(false)}
        onAttach={(item) => setAttachments(prev => [...prev, item])}
      />

      {todoFor && !todoFor.deleted && (
        <FromEntryTodoComposer
          text={todoFor.text || 'Follow up on this message'}
          source={{ interactionId: todoFor.id, interactionTitle: `Message from ${firstName(todoFor.senderName) || 'the team'}` }}
          team={todoTeam}
          meUid={effectiveUid || currentUser?.uid || ''}
          meName={currentUser?.displayName || 'Someone'}
          onClose={() => setTodoFor(null)}
        />
      )}

      {/* Read Receipts Modal */}
      {readReceiptMsg && activeRoom && (
        <div className="modal-backdrop" onClick={() => setReadReceiptMsg(null)}>
          <div className="pop" onClick={(e) => e.stopPropagation()}>
            <div className="pophead">
              <span className="poptitle">Read receipts</span>
              <span className="popn">
                {readReceiptMsg.readBy?.length || 0} / {activeRoom.memberIds?.length || 0} read
              </span>
            </div>

            {/* Read by section */}
            <div className="popsec">Read</div>
            {(() => {
              const readUids = readReceiptMsg.readBy || [];
              if (readUids.length === 0) {
                return <div className="text-xs text-on-surface-variant px-3 py-1">No one yet</div>;
              }
              return readUids.map((uid) => {
                const u = usersCache[uid];
                const displayName = u?.displayName || (uid === effectiveUid ? 'You' : 'Member');
                return (
                  <div key={uid} className="poprow">
                    <div className="w-6 h-6 rounded-full bg-primary/10 text-accent font-semibold flex items-center justify-center text-[10px] shrink-0 border border-outline-variant/30">
                      {u?.photoURL ? (
                        <img src={u.photoURL} alt={displayName} className="w-full h-full object-cover rounded-full" />
                      ) : (
                        getUserInitials(displayName)
                      )}
                    </div>
                    <span className="truncate flex-1 font-medium">{displayName}</span>
                    {readReceiptMsg.acknowledged?.includes(uid) && (
                      <span className="text-[11px] text-accent flex items-center gap-1 font-medium shrink-0">
                        <Check className="w-3 h-3" />
                        Got it
                      </span>
                    )}
                  </div>
                );
              });
            })()}

            {/* Not yet read section */}
            <div className="popsec">Not yet</div>
            {(() => {
              const readUids = new Set(readReceiptMsg.readBy || []);
              const unreadUids = (activeRoom.memberIds || []).filter(uid => !readUids.has(uid));
              if (unreadUids.length === 0) {
                return <div className="text-xs text-on-surface-variant px-3 py-1">Everyone has read this</div>;
              }
              return unreadUids.map((uid) => {
                const u = usersCache[uid];
                const displayName = u?.displayName || (uid === effectiveUid ? 'You' : 'Member');
                return (
                  <div key={uid} className="poprow">
                    <div className="w-6 h-6 rounded-full bg-primary/10 text-accent font-semibold flex items-center justify-center text-[10px] shrink-0 border border-outline-variant/30">
                      {u?.photoURL ? (
                        <img src={u.photoURL} alt={displayName} className="w-full h-full object-cover rounded-full" />
                      ) : (
                        getUserInitials(displayName)
                      )}
                    </div>
                    <span className="truncate flex-1 text-on-surface-variant">{displayName}</span>
                  </div>
                );
              });
            })()}

            <div className="popfoot">
              <button type="button" className="action-btn-secondary" onClick={() => setReadReceiptMsg(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
