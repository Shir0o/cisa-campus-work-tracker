import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
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
  Send,
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
  Phone,
  Trash2,
  Check,
  X,
  Pin,
  Bell
} from 'lucide-react';
import { cn, getUserInitials, relTime, firstName } from '../lib/utils';
import { db } from '../lib/firebase';
import { useAuth } from '../components/AuthProvider';
import { useMediaQuery } from '../lib/useMediaQuery';
import { useLayout } from '../App';
import { ChatRoom, ChatMessage, ChatAttachment, Contact } from '../types';
import { sendMessage, reactToMessage, togglePinMessage, removeMessageForEveryone, deleteChatRoom, canRemoveConvForEveryone } from '../services/chat';
import { setTodoDone } from '../lib/todos';
import { MessageHides } from '../lib/messageHides';
import { ConvHides } from '../lib/convHides';

// Modals
import CreateChatModal from '../components/modals/CreateChatModal';
import ChatDetailsModal from '../components/modals/ChatDetailsModal';
import AttachDataModal from '../components/modals/AttachDataModal';

// The Field Notes design's quick reactions (views/messages.jsx).
const QUICK_REACTS = ["🙏", "❤️", "🌱", "👍", "🙌"];

/** Can this viewer take the message back for everyone? Its author, or a
 *  Full-timer — the same gate firestore.rules applies to the `deleted` field. */
function canRemoveForEveryone(msg: ChatMessage, uid: string | undefined, isAdmin: boolean): boolean {
  return !!msg && !msg.deleted && (msg.senderId === uid || isAdmin);
}

/** What a taken-back message reads as ("You took this message back." /
 *  "Removed by Mei.") — the design's `messageGoneLabel`. */
function messageGoneLabel(msg: ChatMessage, uid: string | undefined): string {
  if (!msg.deleted) return "";
  if (msg.deleted.by === uid) {
    return msg.senderId === uid ? "You took this message back." : "You removed this message.";
  }
  const who = firstName(msg.senderName);
  return msg.deleted.by === msg.senderId ? `${who} took this message back.` : `Removed by ${firstName(msg.deleted.by)}.`;
}

/** Bubble body with @mentions highlighted against the room's first names —
 *  the design's `renderBody`. */
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

export default function Messages() {
  const { user: currentUser, role: userRole, effectiveUserId, impersonateTarget } = useAuth();
  const effectiveUid = effectiveUserId || currentUser?.uid;
  const { setSelectedContact, openLogInteraction } = useLayout();
  const navigate = useNavigate();
  const isMobile = useMediaQuery("(max-width: 768px)");
  const isAdmin = userRole === 'admin';

  // Modals state
  const [createChatOpen, setCreateChatOpen] = useState(false);
  const [chatDetailsOpen, setChatDetailsOpen] = useState(false);
  const [attachDataOpen, setAttachDataOpen] = useState(false);

  // Messaging state
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [roomSearch, setRoomSearch] = useState('');
  const [loadingRooms, setLoadingRooms] = useState(true);

  // Rail filter + thread chrome (the design's msgs-filters / pinned strip / thread search)
  const [filter, setFilter] = useState<'all' | 'unread' | 'groups' | 'announce'>('all');
  const [threadSearchOpen, setThreadSearchOpen] = useState(false);
  const [threadSearch, setThreadSearch] = useState('');
  const [pinnedOpen, setPinnedOpen] = useState(false);

  // Message ⋯ menu (which message, and whether the confirm step is showing)
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [menuConfirm, setMenuConfirm] = useState(false);

  // User details cache (to show correct names for direct chats)
  const [usersCache, setUsersCache] = useState<Record<string, { displayName: string; photoURL?: string }>>({});

  // Auto-scroll ref for messages stream container
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Mention system state
  const [mentionSearch, setMentionSearch] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [roomMembers, setRoomMembers] = useState<{ uid: string; displayName: string }[]>([]);

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
    if (!effectiveUid) return;

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
      return;
    }

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

      // Mark as read in LocalStorage
      localStorage.setItem(`chat_read_${activeRoomId}`, Date.now().toString());

      // Scroll messages stream container to bottom without jumping page
      setTimeout(() => {
        if (messagesContainerRef.current) {
          messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
        }
      }, 100);
    }, (error) => {
      console.error('Error fetching messages:', error);
    });

    // Populate room members for autocomplete
    const activeRoom = rooms.find(r => r.id === activeRoomId);
    if (activeRoom) {
      const membersList: { uid: string; displayName: string }[] = [];
      activeRoom.memberIds.forEach(async (uid) => {
        if (uid === currentUser?.uid) return;
        const cached = usersCache[uid];
        if (cached) {
          membersList.push({ uid, displayName: cached.displayName });
        } else {
          try {
            const userDoc = await getDoc(doc(db, 'users', uid));
            if (userDoc.exists()) {
              const uData = userDoc.data();
              setUsersCache(prev => ({
                ...prev,
                [uid]: { displayName: uData.displayName, photoURL: uData.photoURL }
              }));
              membersList.push({ uid, displayName: uData.displayName });
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

  // The thread's kind note — the design's `convSub`.
  const threadSub = activeRoom
    ? activeRoom.type === 'group'
      ? `${activeRoom.memberIds.length} ${activeRoom.memberIds.length === 1 ? 'member' : 'members'}`
      : activeRoom.type === 'announcement'
        ? `Announcement · ${activeRoom.memberIds.length} people`
        : 'Just the two of you'
    : '';

  // Only a Full-timer posts in an announcement room — the same gate
  // firestore.rules applies, so a member sees a note instead of a composer
  // whose send would be denied. Mirrors canPostToRoom in @cisa/core.
  const canPostToActiveRoom = !activeRoom || activeRoom.type !== 'announcement' || isAdmin;

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!effectiveUid || !activeRoomId) return;

    const textToSend = inputText.trim();
    if (!textToSend && attachments.length === 0) return;

    const senderName = impersonateTarget ? impersonateTarget.name : (currentUser?.displayName || 'Member');
    const senderPhoto = impersonateTarget ? '' : (currentUser?.photoURL || '');

    try {
      await sendMessage(
        activeRoomId,
        textToSend,
        {
          uid: effectiveUid,
          displayName: senderName,
          photoURL: senderPhoto
        },
        attachments,
        activeRoom?.memberIds
      );
      setInputText('');
      setAttachments([]);
      setMentionSearch(null);
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  // Design's composer: Cmd/Ctrl+Enter sends, plain Enter makes a new line.
  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  };

  // Mention autocomplete trigger
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInputText(val);

    const cursor = e.target.selectionStart;
    const beforeCursor = val.slice(0, cursor);
    const lastAt = beforeCursor.lastIndexOf('@');

    if (lastAt !== -1 && (lastAt === 0 || /\s/.test(beforeCursor[lastAt - 1]))) {
      const query = beforeCursor.slice(lastAt + 1);
      if (!/\s/.test(query)) {
        setMentionSearch(query);
        setMentionIndex(0);
        return;
      }
    }
    setMentionSearch(null);
  };

  const handleSelectMention = (displayName: string) => {
    if (mentionSearch === null) return;
    const cursor = inputText.slice(0, inputText.lastIndexOf('@') + 1).length;
    const before = inputText.slice(0, cursor);
    const after = inputText.slice(cursor + mentionSearch.length);
    setInputText(`${before}${displayName} `);
    setMentionSearch(null);
  };

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
  const visibleMsgs = messages.filter((m) => {
    if (effectiveUid && MessageHides.has(effectiveUid, m.id)) return false;
    if (threadSearch) return (m.text || '').toLowerCase().includes(threadSearch.toLowerCase());
    return true;
  });
  const pinned = messages.filter((m) => m.pinned && !m.deleted);
  const memberFirstNames = roomMembers.map((m) => m.displayName.split(' ')[0]);

  const jumpTo = (messageId: string) => {
    const el = document.getElementById(`msgb-${messageId}`);
    if (el && messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = el.offsetTop - 24;
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
    setMenuFor(null);
    setMenuConfirm(false);
  };

  const activeRoomIsGroupish = !!activeRoom && activeRoom.type !== 'direct';

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
          ) : (
            filteredRooms.map((room) => {
              const isActive = room.id === activeRoomId;
              const name = getRoomName(room);
              const photo = getRoomPhoto(room);
              const unread = isUnread(room);
              const last = room.lastMessage;
              const isGroupish = room.type !== 'direct';
              const menuOpen = convMenuFor === room.id;
              const canAllConv = canRemoveConvForEveryone(room, effectiveUid, isAdmin);

              return (
                <div
                  key={room.id}
                  className={cn("msgs-item", isActive && "active", unread && "unread")}
                  onClick={() => setActiveRoomId(room.id)}
                >
                  {isGroupish ? (
                    <span className={cn("msgs-cluster", room.type === 'announcement' && "broadcast")}>
                      {room.type === 'announcement' ? <Bell className="w-4 h-4" /> : <Users className="w-4 h-4" />}
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
                                        if (activeRoomId === room.id) setActiveRoomId(null);
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
                                      if (activeRoomId === room.id) setActiveRoomId(null);
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
            })
          )}
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
      <div className={cn(
        "flex flex-col flex-1 h-full bg-surface-container-lowest min-w-0",
        activeRoomId ? "flex" : "hidden md:flex"
      )}>
        {!activeRoom ? (
          /* Empty Chat Area Placeholder */
          <div className="msgs-empty">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 text-accent flex items-center justify-center mb-1">
              <MessageSquare className="w-6 h-6" />
            </div>
            <div className="ntf-empty-title">Pick a conversation</div>
            <div className="ntf-empty-sub">Or start a new one — everyone in the app is reachable from here.</div>
          </div>
        ) : (
          <>
            {/* Active Room Header */}
            <div className="msgs-thread-head">
              {isMobile && (
                <button className="icon-btn" onClick={() => setActiveRoomId(null)}>
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

            {/* Messages Stream */}
            <div ref={messagesContainerRef} className="msgs-stream">
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

              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center gap-2 text-on-surface-variant">
                  <MessageSquare className="w-10 h-10 text-outline" />
                  <p className="text-sm">No messages yet. Send a message to start the conversation!</p>
                </div>
              ) : visibleMsgs.length === 0 && threadSearch ? (
                <div className="msgs-people-empty">Nothing matches “{threadSearch}”.</div>
              ) : (
                visibleMsgs.map((msg) => {
                  const isMe = msg.senderId === effectiveUid;
                  const isSys = msg.type === 'system';
                  const gone = !!msg.deleted;
                  const tally: Record<string, number> = {};
                  (msg.reactions || []).forEach((r) => { tally[r.emoji] = (tally[r.emoji] || 0) + 1; });
                  const mineReacted = (emoji: string) => (msg.reactions || []).some((r) => r.by === effectiveUid && r.emoji === emoji);
                  const canAll = canRemoveForEveryone(msg, effectiveUid, isAdmin);
                  const menuOpen = menuFor === msg.id;

                  if (isSys) {
                    return (
                      <div key={msg.id} className="flex justify-center select-none">
                        <span className="text-[11px] font-medium bg-surface-container-low/60 text-on-surface-variant border border-outline-variant/10 rounded-full px-3 py-0.5">
                          {msg.text}
                        </span>
                      </div>
                    );
                  }

                  return (
                    <div key={msg.id} id={`msgb-${msg.id}`} className={cn("msgb", isMe && "mine")}>
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
                        {activeRoomIsGroupish && !isMe && (
                          <div className="msgb-name">{firstName(msg.senderName)}</div>
                        )}
                        <div className="msgb-row">
                          {gone ? (
                            <div className="msgb-gone">{messageGoneLabel(msg, effectiveUid)}</div>
                          ) : (
                            <div className={cn("msgb-bubble", msg.pinned && "pinned")}>
                              {renderBody(msg.text, memberFirstNames)}

                              {/* Attachments inside bubble */}
                              {msg.attachments && msg.attachments.length > 0 && (
                                <div className="mt-2.5 space-y-1.5 border-t border-outline-variant/10 pt-2.5">
                                  {msg.attachments.map((attach, idx) => {
                                    const AttachIcon = getAttachmentIcon(attach.type);
                                    const isTodo = attach.type === 'todo';
                                    const isTodoChecked = attach.status === 'completed';

                                    return (
                                      <div
                                        key={idx}
                                        onClick={() => !isTodo && handleAttachmentClick(attach)}
                                        className={cn(
                                          "p-2.5 rounded-xl border flex items-start gap-3 transition-all text-left",
                                          isMe
                                            ? "bg-primary/10 border-primary/20 hover:bg-primary/15"
                                            : "bg-surface-container-low border-outline-variant/60 text-on-surface hover:bg-surface-container-high"
                                        )}
                                        style={{ cursor: isTodo ? 'default' : 'pointer' }}
                                      >
                                        {isTodo ? (
                                          <input
                                            type="checkbox"
                                            checked={isTodoChecked}
                                            onChange={(e) => handleToggleTodo(attach, e.target.checked)}
                                            className="w-4 h-4 rounded text-accent border-outline accent-primary cursor-pointer shrink-0 mt-0.5"
                                          />
                                        ) : (
                                          <div className={cn(
                                            "w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border",
                                            isMe ? "bg-primary/20 border-primary/30 text-on-primary" : "bg-surface-container-high text-on-surface-variant border-outline-variant/30"
                                          )}>
                                            <AttachIcon className="w-3.5 h-3.5" />
                                          </div>
                                        )}
                                        <div className="min-w-0 flex-1">
                                          <h5 className={cn(
                                            "text-xs font-semibold leading-normal",
                                            isTodo && isTodoChecked && "line-through opacity-70"
                                          )}>
                                            {attach.name}
                                          </h5>
                                          {attach.subtitle && (
                                            <p className={cn(
                                              "text-[10px] mt-0.5 leading-normal",
                                              isMe ? "text-on-surface-variant/80" : "text-on-surface-variant"
                                            )}>
                                              {attach.subtitle}
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}

                          {/* hover tools: quick react + pin + ⋯ menu */}
                          {!gone && (
                            <div className="msgb-tools">
                              <span className="msgb-react-pick">
                                {QUICK_REACTS.filter((e) => !tally[e]).slice(0, 3).map((e) => (
                                  <button key={e} className="msgb-react-add" title="React" onClick={() => effectiveUid && reactToMessage(activeRoomId!, msg.id, effectiveUid, e, msg.reactions || [])}>
                                    {e}
                                  </button>
                                ))}
                              </span>
                              <button className="msgb-pin-btn" title={msg.pinned ? "Unpin" : "Pin"} onClick={() => togglePinMessage(activeRoomId!, msg.id, !msg.pinned)}>
                                <Pin className="w-3 h-3" />
                              </button>
                              <span className="msgb-menu-wrap">
                                <button
                                  className="msgb-pin-btn"
                                  title="More"
                                  onClick={() => {
                                    setMenuFor(menuOpen ? null : msg.id);
                                    setMenuConfirm(false);
                                  }}
                                >⋯</button>
                                {menuOpen && (
                                  <>
                                    <div className="msgb-menu-away" onClick={() => { setMenuFor(null); setMenuConfirm(false); }} />
                                    <div className="msgb-menu">
                                      {menuConfirm ? (
                                        <>
                                          <p>Take this back for everyone? They'll see that a message was removed — not what it said.</p>
                                          <button className="msgb-menu-danger" onClick={() => void handleRemoveAll(msg)}>Yes, remove it</button>
                                          <button onClick={() => setMenuConfirm(false)}>Keep it</button>
                                        </>
                                      ) : (
                                        <>
                                          <button onClick={() => { setMenuFor(null); setMenuConfirm(false); effectiveUid && MessageHides.hide(effectiveUid, msg.id); }}>
                                            Hide from my view
                                          </button>
                                          {canAll && (
                                            <button className="msgb-menu-danger" onClick={() => setMenuConfirm(true)}>
                                              {isMe ? "Take back for everyone" : "Remove for everyone"}
                                            </button>
                                          )}
                                          {!canAll && (
                                            <p>Only {firstName(msg.senderName)} or a full-timer can remove it for everyone.</p>
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
                                  className={cn("msgb-react", mineReacted(e) && "on")}
                                  onClick={() => effectiveUid && reactToMessage(activeRoomId!, msg.id, effectiveUid, e, msg.reactions || [])}
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
                })
              )}
            </div>

            {/* Composer / readonly announcement bar */}
            {canPostToActiveRoom ? (
              <div className="msgs-composer">
                {mentionSearch !== null && (
                  <div className="msgs-mention-pop">
                    {roomMembers
                      .filter((m) => m.displayName.toLowerCase().includes(mentionSearch.toLowerCase()))
                      .map((m, idx) => (
                        <div
                          key={m.uid}
                          className={cn("msgs-mention-row", idx === mentionIndex && "bg-surface-container-high")}
                          onClick={() => handleSelectMention(m.displayName)}
                        >
                          <User className="w-3.5 h-3.5 shrink-0 text-on-surface-variant" />
                          {m.displayName}
                        </div>
                      ))}
                  </div>
                )}

                {attachments.length > 0 && (
                  <div className="flex flex-wrap gap-2 py-2">
                    {attachments.map((attach, idx) => {
                      const AttachIcon = getAttachmentIcon(attach.type);
                      return (
                        <div
                          key={idx}
                          className="py-1.5 px-3 rounded-full bg-surface-container-low text-on-surface-variant border border-outline-variant/60 text-xs font-semibold flex items-center gap-2"
                        >
                          <AttachIcon className="w-3.5 h-3.5 shrink-0" />
                          <span className="max-w-[120px] truncate">{attach.name}</span>
                          <button
                            onClick={() => setAttachments(prev => prev.filter((_, i) => i !== idx))}
                            className="p-0.5 rounded-full hover:bg-surface-container-high cursor-pointer text-on-surface-variant"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="msgs-composer-row">
                  <button
                    type="button"
                    onClick={() => setAttachDataOpen(true)}
                    className="icon-btn"
                    title="Attach reference data"
                  >
                    <Paperclip className="w-4 h-4" />
                  </button>
                  <textarea
                    placeholder="Write a message… (@ to mention)"
                    value={inputText}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyPress}
                    rows={1}
                    className="msgs-ta li-input"
                  />
                  <button
                    type="button"
                    disabled={!inputText.trim() && attachments.length === 0}
                    className="msgs-send"
                    title="Send"
                    onClick={handleSend}
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="msgs-readonly">
                <span>This one's an announcement — replies go to the team directly.</span>
                <span className="msgs-readonly-reacts">
                  {QUICK_REACTS.slice(0, 4).map((e) => {
                    const last = messages[messages.length - 1];
                    return (
                      <button
                        key={e}
                        onClick={() => {
                          if (effectiveUid && last && !last.deleted) {
                            reactToMessage(activeRoomId!, last.id, effectiveUid, e, last.reactions || []);
                          }
                        }}
                      >{e}</button>
                    );
                  })}
                </span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modals overlay */}
      <CreateChatModal
        isOpen={createChatOpen}
        onClose={() => setCreateChatOpen(false)}
        onSelectRoom={(id) => setActiveRoomId(id)}
      />

      {activeRoom && (
        <ChatDetailsModal
          isOpen={chatDetailsOpen}
          onClose={() => setChatDetailsOpen(false)}
          room={activeRoom}
          onLeftGroup={() => setActiveRoomId(null)}
        />
      )}

      <AttachDataModal
        isOpen={attachDataOpen}
        onClose={() => setAttachDataOpen(false)}
        onAttach={(item) => setAttachments(prev => [...prev, item])}
      />
    </div>
  );
}
