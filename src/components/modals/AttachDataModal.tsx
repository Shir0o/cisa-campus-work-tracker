import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Search,
  User,
  CheckSquare,
  Calendar,
  History,
  HeartHandshake,
  FileText,
  MessageSquare,
  Loader2
} from 'lucide-react';
import {
  collection,
  collectionGroup,
  query,
  orderBy,
  onSnapshot,
  limit
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../AuthProvider';
import { ChatAttachment } from '../../types';

interface AttachDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAttach: (attachment: ChatAttachment) => void;
}

type TabType = 'contact' | 'todo' | 'event' | 'interaction' | 'prayer' | 'note' | 'feedback';

export default function AttachDataModal({ isOpen, onClose, onAttach }: AttachDataModalProps) {
  const { role: userRole } = useAuth();
  const isAdmin = userRole === 'admin';

  const [activeTab, setActiveTab] = useState<TabType>('contact');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Tabs layout configuration
  const tabs = [
    { id: 'contact' as TabType, label: 'Contact', icon: User, adminOnly: false },
    { id: 'todo' as TabType, label: 'Todo', icon: CheckSquare, adminOnly: false },
    { id: 'event' as TabType, label: 'Event', icon: Calendar, adminOnly: false },
    { id: 'interaction' as TabType, label: 'Interaction', icon: History, adminOnly: false },
    { id: 'prayer' as TabType, label: 'Prayer', icon: HeartHandshake, adminOnly: false },
    { id: 'note' as TabType, label: 'Note', icon: FileText, adminOnly: true },
    { id: 'feedback' as TabType, label: 'Feedback', icon: MessageSquare, adminOnly: true },
  ].filter(t => !t.adminOnly || isAdmin);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleEsc);
    }
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  // Query Firestore based on selected tab
  useEffect(() => {
    if (!isOpen) return;

    setLoading(true);
    let unsubscribe: () => void = () => {};

    try {
      if (activeTab === 'contact') {
        const q = query(collection(db, 'contacts'), orderBy('name', 'asc'));
        unsubscribe = onSnapshot(q, (snap) => {
          setItems(snap.docs.map(doc => ({
            id: doc.id,
            name: doc.data().name,
            subtitle: doc.data().role || doc.data().location || 'Contact',
            ...doc.data()
          })));
          setLoading(false);
        }, err => {
          console.error(err);
          setLoading(false);
        });
      } else if (activeTab === 'todo') {
        const q = query(collection(db, 'tasks'), orderBy('createdAt', 'desc'), limit(100));
        unsubscribe = onSnapshot(q, (snap) => {
          setItems(snap.docs.map(doc => ({
            id: doc.id,
            name: doc.data().title,
            subtitle: doc.data().dueDate ? `Due: ${doc.data().dueDate}` : 'No due date',
            status: doc.data().status,
            priority: doc.data().priority,
            ...doc.data()
          })));
          setLoading(false);
        }, err => {
          console.error(err);
          setLoading(false);
        });
      } else if (activeTab === 'event') {
        const q = query(collection(db, 'events'), orderBy('date', 'desc'), limit(100));
        unsubscribe = onSnapshot(q, (snap) => {
          setItems(snap.docs.map(doc => ({
            id: doc.id,
            name: doc.data().name,
            subtitle: doc.data().date || 'Event date unknown',
            ...doc.data()
          })));
          setLoading(false);
        }, err => {
          console.error(err);
          setLoading(false);
        });
      } else if (activeTab === 'interaction') {
        const q = query(collectionGroup(db, 'interactions'), orderBy('createdAt', 'desc'), limit(100));
        unsubscribe = onSnapshot(q, (snap) => {
          setItems(snap.docs.map(doc => ({
            id: doc.id,
            name: doc.data().content.substring(0, 80) + (doc.data().content.length > 80 ? '...' : ''),
            subtitle: `${doc.data().userName || 'Someone'} • ${new Date(doc.data().dateTime || doc.data().createdAt).toLocaleDateString()}`,
            ...doc.data()
          })));
          setLoading(false);
        }, err => {
          console.error(err);
          setLoading(false);
        });
      } else if (activeTab === 'prayer') {
        const q = query(collection(db, 'prayers'), orderBy('date', 'desc'), limit(100));
        unsubscribe = onSnapshot(q, (snap) => {
          setItems(snap.docs.map(doc => ({
            id: doc.id,
            name: doc.data().burden.substring(0, 80) + (doc.data().burden.length > 80 ? '...' : ''),
            subtitle: `Status: ${doc.data().status || 'pending'}`,
            status: doc.data().status,
            ...doc.data()
          })));
          setLoading(false);
        }, err => {
          console.error(err);
          setLoading(false);
        });
      } else if (activeTab === 'note' && isAdmin) {
        const q = query(collection(db, 'board_notes'), orderBy('date', 'desc'), limit(100));
        unsubscribe = onSnapshot(q, (snap) => {
          setItems(snap.docs.map(doc => ({
            id: doc.id,
            name: doc.data().title,
            subtitle: `${doc.data().series} • ${doc.data().date}`,
            ...doc.data()
          })));
          setLoading(false);
        }, err => {
          console.error(err);
          setLoading(false);
        });
      } else if (activeTab === 'feedback' && isAdmin) {
        const q = query(collection(db, 'feedback'), orderBy('createdAt', 'desc'), limit(100));
        unsubscribe = onSnapshot(q, (snap) => {
          setItems(snap.docs.map(doc => ({
            id: doc.id,
            name: doc.data().message.substring(0, 80) + (doc.data().message.length > 80 ? '...' : ''),
            subtitle: `${doc.data().userEmail} • ${doc.data().type}`,
            status: doc.data().status,
            ...doc.data()
          })));
          setLoading(false);
        }, err => {
          console.error(err);
          setLoading(false);
        });
      } else {
        setItems([]);
        setLoading(false);
      }
    } catch (err) {
      console.error(err);
      setLoading(false);
    }

    return unsubscribe;
  }, [isOpen, activeTab, isAdmin]);

  const filteredItems = items.filter((item) => {
    const qStr = search.toLowerCase();
    return (
      item.name?.toLowerCase().includes(qStr) ||
      item.subtitle?.toLowerCase().includes(qStr)
    );
  });

  const handleSelect = (item: any) => {
    onAttach({
      type: activeTab,
      id: item.id,
      name: item.name,
      subtitle: item.subtitle,
      status: item.status || undefined,
      priority: item.priority || undefined
    });
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-scrim/55 backdrop-blur-sm"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ type: 'spring', duration: 0.4 }}
            className="relative w-full max-w-lg h-[500px] bg-surface rounded-3xl border border-outline-variant shadow-2xl overflow-hidden flex flex-col z-[111]"
          >
            {/* Header */}
            <div className="px-6 py-3.5 border-b border-outline-variant flex items-center justify-between bg-surface-container-low shrink-0">
              <div>
                <h3 className="font-serif text-lg text-on-surface">Attach Reference Data</h3>
                <p className="text-xs text-on-surface-variant mt-0.5">Share dynamic database cards in chat</p>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-full hover:bg-surface-container-high transition-colors text-on-surface-variant cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-outline-variant shrink-0 bg-surface-container-low/55 p-1 gap-1 overflow-x-auto select-none no-scrollbar">
              {tabs.map((t) => {
                const Icon = t.icon;
                const isActive = activeTab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => {
                      setActiveTab(t.id);
                      setSearch('');
                    }}
                    className={`py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all shrink-0 cursor-pointer ${
                      isActive
                        ? 'bg-primary text-on-primary '
                        : 'text-on-surface-variant hover:bg-surface-container-high'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {t.label}
                  </button>
                );
              })}
            </div>

            {/* Search */}
            <div className="px-5 py-2.5 border-b border-outline-variant bg-surface shrink-0 flex items-center gap-3">
              <Search className="w-4 h-4 text-on-surface-variant shrink-0" />
              <input
                type="text"
                placeholder={`Search ${activeTab}s...`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-transparent text-sm text-on-surface outline-none placeholder:text-on-surface-variant/70"
              />
            </div>

            {/* Content List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-surface-container-lowest">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-16 gap-2 text-on-surface-variant">
                  <Loader2 className="w-7 h-7 animate-spin text-accent" />
                  <span className="text-xs">Loading items...</span>
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="text-center py-16 text-on-surface-variant text-sm">
                  No {activeTab}s found matching your query.
                </div>
              ) : (
                filteredItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleSelect(item)}
                    className="w-full p-3 rounded-xl bg-surface border border-outline-variant/40 hover:border-primary/40 hover:bg-primary/5 transition-all text-left cursor-pointer flex justify-between items-start gap-4"
                  >
                    <div className="min-w-0 flex-1">
                      <h4 className="font-semibold text-xs text-on-surface line-clamp-2 leading-snug">
                        {item.name}
                      </h4>
                      <p className="text-[10px] text-on-surface-variant truncate mt-1">
                        {item.subtitle}
                      </p>
                    </div>
                    {item.status && (
                      <span className={`text-[8.5px] font-semibold  rounded px-1.5 py-0.5 shrink-0 ${
                        item.status === 'completed' || item.status === 'resolved' || item.status === 'answered'
                          ? 'bg-success/10 text-success'
                          : item.status === 'pending' || item.status === 'new'
                          ? 'bg-surface-container-high text-on-surface-variant'
                          : 'bg-stage-accent-soft text-stage-accent'
                      }`}>
                        {item.status}
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
