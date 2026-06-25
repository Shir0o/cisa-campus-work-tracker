import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  where,
  doc,
  getDoc
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
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, getUserInitials } from '../lib/utils';
import { db } from '../lib/firebase';
import { useAuth } from '../components/AuthProvider';
import { useLayout } from '../App';
import { ChatRoom, ChatMessage, ChatAttachment, Contact } from '../types';
import { sendMessage } from '../services/chat';
import { setTodoDone } from '../lib/todos';

// Modals
import CreateChatModal from '../components/modals/CreateChatModal';
import ChatDetailsModal from '../components/modals/ChatDetailsModal';
import AttachDataModal from '../components/modals/AttachDataModal';

export default function Messages() {
  const { user: currentUser, role: userRole } = useAuth();
  const { setSelectedContact, openLogInteraction } = useLayout();
  const navigate = useNavigate();

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

  // User details cache (to show correct names for direct chats)
  const [usersCache, setUsersCache] = useState<Record<string, { displayName: string; photoURL?: string }>>({});

  // Auto-scroll ref
  const messageEndRef = useRef<HTMLDivElement>(null);

  // Mention system state
  const [mentionSearch, setMentionSearch] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [roomMembers, setRoomMembers] = useState<{ uid: string; displayName: string }[]>([]);

  const isAdmin = userRole === 'admin';

  // 1. Fetch Rooms (Real-time)
  useEffect(() => {
    if (!currentUser) return;

    setLoadingRooms(true);
    // Admins see all chats; other users only see chats they are member of
    const roomsQuery = isAdmin
      ? query(collection(db, 'chatRooms'), orderBy('createdAt', 'desc'))
      : query(collection(db, 'chatRooms'), where('memberIds', 'array-contains', currentUser.uid));

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
  }, [currentUser, isAdmin]);

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

      // Scroll to bottom
      setTimeout(() => {
        messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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
  }, [activeRoomId, rooms, currentUser, usersCache]);

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
    if (!room.lastMessage || room.lastMessage.senderId === currentUser?.uid) return false;
    const lastRead = localStorage.getItem(`chat_read_${room.id}`);
    if (!lastRead) return true;
    const lastMsgTime = room.lastMessage.timestamp?.seconds * 1000 || 0;
    return lastMsgTime > parseInt(lastRead);
  };

  const getRoomName = (room: ChatRoom) => {
    if (room.type === 'group') return room.name || 'Group';
    const otherUid = room.memberIds.find(id => id !== currentUser?.uid);
    return otherUid ? usersCache[otherUid]?.displayName || 'Direct Chat' : 'Direct Chat';
  };

  const getRoomPhoto = (room: ChatRoom) => {
    if (room.type === 'group') return null;
    const otherUid = room.memberIds.find(id => id !== currentUser?.uid);
    return otherUid ? usersCache[otherUid]?.photoURL || '' : '';
  };

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!currentUser || !activeRoomId) return;

    const textToSend = inputText.trim();
    if (!textToSend && attachments.length === 0) return;

    try {
      await sendMessage(
        activeRoomId,
        textToSend,
        {
          uid: currentUser.uid,
          displayName: currentUser.displayName || 'Member',
          photoURL: currentUser.photoURL || ''
        },
        attachments
      );
      setInputText('');
      setAttachments([]);
      setMentionSearch(null);
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
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

  // Filtered room list
  const filteredRooms = rooms.filter((r) => {
    const name = getRoomName(r).toLowerCase();
    return name.includes(roomSearch.toLowerCase());
  });

  // Handle clicking attachment cards in chat bubble
  const handleAttachmentClick = async (attachment: ChatAttachment) => {
    if (attachment.type === 'contact') {
      // Fetch details and open ContactDetailsModal
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
      openLogInteraction();
    } else if (attachment.type === 'todo') {
      navigate('/my-day');
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

  // Group messages by day
  const groupMessagesByDay = (msgs: ChatMessage[]) => {
    const groups: Record<string, ChatMessage[]> = {};
    msgs.forEach((msg) => {
      const date = msg.timestamp
        ? new Date(msg.timestamp.seconds * 1000).toLocaleDateString(undefined, {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })
        : 'Sending...';
      if (!groups[date]) groups[date] = [];
      groups[date].push(msg);
    });
    return groups;
  };

  const groupedMessages = groupMessagesByDay(messages);

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

  return (
    <div className="flex h-[calc(100vh-64px)] md:h-screen w-full overflow-hidden bg-background">
      {/* 1. Left Sidebar Room List */}
      <div className={cn(
        "flex flex-col border-r border-outline-variant w-full md:w-80 shrink-0 bg-surface",
        activeRoomId ? "hidden md:flex" : "flex"
      )}>
        {/* Sidebar Header */}
        <div className="p-4 border-b border-outline-variant flex items-center justify-between bg-surface-container-low shrink-0">
          <div>
            <h1 className="font-serif text-xl text-on-surface">Fellowship Chat</h1>
            <p className="text-xs text-on-surface-variant">Private team messaging</p>
          </div>
          <button
            onClick={() => setCreateChatOpen(true)}
            className="p-2 bg-primary text-on-primary rounded-full hover:bg-primary/90 active:scale-95 transition-all shadow shadow-primary/20 cursor-pointer"
            title="Start Chat"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Sidebar Search */}
        <div className="p-3 border-b border-outline-variant bg-surface-container-lowest shrink-0 flex items-center gap-2">
          <Search className="w-4 h-4 text-on-surface-variant shrink-0" />
          <input
            type="text"
            placeholder="Search chats..."
            value={roomSearch}
            onChange={(e) => setRoomSearch(e.target.value)}
            className="w-full bg-transparent text-sm text-on-surface outline-none placeholder:text-on-surface-variant/75"
          />
        </div>

        {/* Rooms Scroll List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {loadingRooms ? (
            <div className="text-center py-12 text-on-surface-variant text-sm">
              Loading chat channels...
            </div>
          ) : filteredRooms.length === 0 ? (
            <div className="text-center py-12 text-on-surface-variant text-sm">
              No conversations found.
            </div>
          ) : (
            filteredRooms.map((room) => {
              const isActive = room.id === activeRoomId;
              const name = getRoomName(room);
              const photo = getRoomPhoto(room);
              const unread = isUnread(room);
              
              return (
                <button
                  key={room.id}
                  onClick={() => setActiveRoomId(room.id)}
                  className={cn(
                    "w-full p-3 rounded-2xl flex items-center gap-3.5 transition-all text-left cursor-pointer border",
                    isActive
                      ? "bg-primary/10 border-primary/20 text-on-surface"
                      : "bg-transparent border-transparent hover:bg-surface-container-low text-on-surface-variant hover:text-on-surface"
                  )}
                >
                  {/* Chat Avatar */}
                  <div className="relative shrink-0">
                    <div className="w-10 h-10 rounded-full bg-stage-accent-soft text-stage-accent font-semibold flex items-center justify-center border border-outline-variant/30 text-sm">
                      {photo ? (
                        <img src={photo} alt={name} className="w-full h-full object-cover rounded-full" />
                      ) : (
                        getUserInitials(name)
                      )}
                    </div>
                    {unread && (
                      <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-error rounded-full border border-surface shadow-sm animate-pulse" />
                    )}
                  </div>

                  {/* Chat Metadata */}
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between items-baseline gap-2">
                      <h4 className={cn(
                        "text-xs truncate leading-snug",
                        unread ? "font-bold text-on-surface" : "font-semibold"
                      )}>
                        {name}
                      </h4>
                      {room.lastMessage?.timestamp && (
                        <span className="text-[9px] text-on-surface-variant">
                          {new Date(room.lastMessage.timestamp.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                    <p className={cn(
                      "text-[11px] truncate mt-0.5 leading-snug",
                      unread ? "text-on-surface font-semibold" : "text-on-surface-variant"
                    )}>
                      {room.lastMessage ? (
                        <>
                          <span className="font-medium mr-1">{room.lastMessage.senderName}:</span>
                          {room.lastMessage.text}
                        </>
                      ) : (
                        "No messages yet"
                      )}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* 2. Right Active Chat Area */}
      <div className={cn(
        "flex flex-col flex-1 h-full bg-surface-container-lowest",
        activeRoomId ? "flex" : "hidden md:flex"
      )}>
        {activeRoom && currentUser ? (
          <>
            {/* Active Room Header */}
            <div className="px-6 py-3 border-b border-outline-variant flex items-center justify-between bg-surface-container-low shrink-0 z-10">
              <div className="flex items-center gap-3.5 min-w-0">
                <button
                  onClick={() => setActiveRoomId(null)}
                  className="p-2 -ml-2 rounded-full hover:bg-surface-container-high text-on-surface md:hidden cursor-pointer"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <div className="w-9 h-9 rounded-full bg-stage-accent-soft text-stage-accent font-semibold flex items-center justify-center border border-outline-variant/30 text-xs shrink-0">
                  {getRoomPhoto(activeRoom) ? (
                    <img src={getRoomPhoto(activeRoom) || ''} alt={getRoomName(activeRoom)} className="w-full h-full object-cover rounded-full" />
                  ) : (
                    getUserInitials(getRoomName(activeRoom))
                  )}
                </div>
                <div className="min-w-0">
                  <h3 className="font-serif text-base text-on-surface leading-tight truncate">
                    {getRoomName(activeRoom)}
                  </h3>
                  {activeRoom.type === 'group' && (
                    <span className="text-[10px] text-on-surface-variant font-medium">
                      {activeRoom.memberIds.length} members
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setChatDetailsOpen(true)}
                  className="p-2 rounded-full hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface cursor-pointer"
                  title="Group details"
                >
                  <Info className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Messages Stream */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-surface-container-lowest">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center gap-2 text-on-surface-variant">
                  <MessageSquare className="w-10 h-10 text-outline" />
                  <p className="text-sm">No messages yet. Send a message to start the conversation!</p>
                </div>
              ) : (
                Object.keys(groupedMessages).map((day) => (
                  <div key={day} className="space-y-4">
                    {/* Day Separator */}
                    <div className="flex justify-center my-6 select-none">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/80 bg-surface-container-low px-3 py-1 rounded-full border border-outline-variant/30">
                        {day}
                      </span>
                    </div>

                    {groupedMessages[day].map((msg) => {
                      const isMe = msg.senderId === currentUser.uid;
                      const isSys = msg.type === 'system';

                      if (isSys) {
                        return (
                          <div key={msg.id} className="flex justify-center select-none animate-in fade-in duration-200">
                            <span className="text-[11px] font-medium bg-surface-container-low/60 text-on-surface-variant border border-outline-variant/10 rounded-full px-3 py-0.5">
                              {msg.text}
                            </span>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={msg.id}
                          className={cn(
                            "flex items-end gap-2.5 animate-in slide-in-from-bottom-2 duration-300",
                            isMe ? "justify-end" : "justify-start"
                          )}
                        >
                          {/* Sender Photo */}
                          {!isMe && (
                            <div
                              className="w-7 h-7 rounded-full bg-stage-accent-soft text-stage-accent font-semibold flex items-center justify-center text-[10px] shrink-0 border border-outline-variant/20"
                              title={msg.senderName}
                            >
                              {msg.senderPhoto ? (
                                <img src={msg.senderPhoto} alt={msg.senderName} className="w-full h-full object-cover rounded-full" />
                              ) : (
                                getUserInitials(msg.senderName)
                              )}
                            </div>
                          )}

                          {/* Speech Bubble */}
                          <div className={cn("max-w-[70%] space-y-1.5", isMe ? "text-right" : "text-left")}>
                            {!isMe && (
                              <span className="text-[10px] font-bold text-on-surface-variant px-1 uppercase tracking-wider block">
                                {msg.senderName}
                              </span>
                            )}
                            <div className={cn(
                              "p-3.5 rounded-2xl text-[13.5px] leading-relaxed shadow-sm border",
                              isMe
                                ? "bg-primary text-on-primary border-primary-fixed-dim/20 rounded-br-none"
                                : "bg-surface border-outline-variant/40 rounded-bl-none text-on-surface"
                            )}>
                              {msg.text}

                              {/* Render attachments inside bubble */}
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
                                            ? "bg-on-primary/10 border-on-primary/20 text-on-primary hover:bg-on-primary/15"
                                            : "bg-surface-container-low border-outline-variant/60 text-on-surface hover:bg-surface-container-high"
                                        )}
                                        style={{ cursor: isTodo ? 'default' : 'pointer' }}
                                      >
                                        {isTodo ? (
                                          <input
                                            type="checkbox"
                                            checked={isTodoChecked}
                                            onChange={(e) => handleToggleTodo(attach, e.target.checked)}
                                            className="w-4 h-4 rounded text-primary border-outline accent-primary cursor-pointer shrink-0 mt-0.5"
                                          />
                                        ) : (
                                          <div className={cn(
                                            "w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border",
                                            isMe ? "bg-on-primary/20 border-on-primary/30" : "bg-stage-accent-soft text-stage-accent border-outline-variant/30"
                                          )}>
                                            <AttachIcon className="w-3.5 h-3.5" />
                                          </div>
                                        )}
                                        <div className="min-w-0 flex-1">
                                          <h5 className={cn(
                                            "text-xs font-bold leading-normal",
                                            isTodo && isTodoChecked && "line-through opacity-70"
                                          )}>
                                            {attach.name}
                                          </h5>
                                          <p className={cn(
                                            "text-[10px] mt-0.5 leading-normal",
                                            isMe ? "text-on-primary/80" : "text-on-surface-variant"
                                          )}>
                                            {attach.subtitle}
                                          </p>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                            {msg.timestamp && (
                              <span className="text-[9px] text-on-surface-variant/80 px-1 select-none">
                                {new Date(msg.timestamp.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
              <div ref={messageEndRef} />
            </div>

            {/* Composer tray (for mentions & attachments list) */}
            <div className="px-6 py-2 bg-surface border-t border-outline-variant relative z-20 shrink-0">
              {/* Mentions list autocomplete */}
              {mentionSearch !== null && (
                <div className="absolute bottom-full left-6 mb-2 bg-surface border border-outline shadow-2xl rounded-2xl w-64 max-h-48 overflow-y-auto p-1.5 space-y-1 animate-in slide-in-from-bottom-2 duration-200">
                  <div className="px-3 py-1 text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
                    Mention member
                  </div>
                  {roomMembers
                    .filter((m) => m.displayName.toLowerCase().includes(mentionSearch.toLowerCase()))
                    .map((m, idx) => (
                      <button
                        key={m.uid}
                        onClick={() => handleSelectMention(m.displayName)}
                        className={cn(
                          "w-full px-3 py-2 rounded-xl text-xs font-semibold text-left transition-colors flex items-center gap-2 cursor-pointer",
                          idx === mentionIndex ? "bg-primary text-on-primary" : "text-on-surface hover:bg-surface-container-high"
                        )}
                      >
                        <User className="w-3.5 h-3.5 shrink-0" />
                        {m.displayName}
                      </button>
                    ))}
                </div>
              )}

              {/* Attachments listing */}
              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 py-2">
                  {attachments.map((attach, idx) => {
                    const AttachIcon = getAttachmentIcon(attach.type);
                    return (
                      <div
                        key={idx}
                        className="py-1.5 px-3 rounded-full bg-stage-accent-soft text-stage-accent border border-outline-variant/30 text-xs font-semibold flex items-center gap-2 animate-in scale-in duration-200"
                      >
                        <AttachIcon className="w-3.5 h-3.5 shrink-0" />
                        <span className="max-w-[120px] truncate">{attach.name}</span>
                        <button
                          onClick={() => setAttachments(prev => prev.filter((_, i) => i !== idx))}
                          className="p-0.5 rounded-full hover:bg-stage-accent/15 cursor-pointer text-stage-accent"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Composition Input Form */}
              <form onSubmit={handleSend} className="flex items-end gap-3 py-2">
                <button
                  type="button"
                  onClick={() => setAttachDataOpen(true)}
                  className="p-3 rounded-2xl bg-surface-container border border-outline hover:border-primary/50 text-on-surface-variant hover:text-primary transition-all cursor-pointer shrink-0"
                  title="Attach reference data"
                >
                  <Paperclip className="w-5 h-5" />
                </button>
                
                <div className="flex-1 relative">
                  <textarea
                    placeholder="Type a message... (use @ to mention)"
                    value={inputText}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyPress}
                    rows={1}
                    className="w-full bg-surface-container border border-outline focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm text-on-surface rounded-2xl py-3 px-4 resize-none min-h-[46px] max-h-32"
                  />
                </div>

                <button
                  type="submit"
                  disabled={!inputText.trim() && attachments.length === 0}
                  className="p-3.5 bg-primary text-on-primary rounded-2xl shadow-lg shadow-primary/20 hover:shadow-primary/30 active:scale-95 transition-all shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          </>
        ) : (
          /* Empty Chat Area Placeholder */
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 gap-4 text-on-surface-variant">
            <div className="w-20 h-20 rounded-3xl bg-surface border border-outline-variant/65 flex items-center justify-center shadow-sm">
              <MessageSquare className="w-10 h-10 text-primary" />
            </div>
            <div>
              <h2 className="font-serif text-2xl text-on-surface">Fellowship Messaging</h2>
              <p className="text-sm mt-1.5 max-w-sm leading-relaxed">
                Connect with the team in real-time. Start a direct one-on-one message or invite members to a group chat.
              </p>
            </div>
            <button
              onClick={() => setCreateChatOpen(true)}
              className="py-2.5 px-6 bg-primary text-on-primary font-bold text-sm rounded-full shadow-md hover:bg-primary/95 transition-all flex items-center gap-2 cursor-pointer mt-2"
            >
              <Plus className="w-4 h-4" />
              New Conversation
            </button>
          </div>
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
