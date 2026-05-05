import React, { useState, useEffect, useRef } from 'react';
import { Search, User, Calendar, Loader2, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { collection, onSnapshot, query, limit } from 'firebase/firestore';
import { db, auth } from '../../lib/firebase';
import { Contact, Event } from '../../types';
import { cn } from '../../lib/utils';
import { useLayout } from '../../App';
import { motion, AnimatePresence } from 'motion/react';

export default function GlobalSearch() {
  const [query_str, setQueryStr] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(false);
  const { setSelectedContact } = useLayout();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!auth.currentUser) return;

    // Listen to contacts and events for searching
    const unsubContacts = onSnapshot(
      collection(db, 'contacts'), 
      (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Contact[];
        setContacts(data);
      },
      (error) => console.error("GlobalSearch Contacts listener error:", error)
    );

    const unsubEvents = onSnapshot(
      collection(db, 'events'), 
      (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Event[];
        setEvents(data);
      },
      (error) => console.error("GlobalSearch Events listener error:", error)
    );

    return () => {
      unsubContacts();
      unsubEvents();
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const results = React.useMemo(() => {
    if (!query_str.trim() || query_str.length < 2) return { contacts: [], events: [] };
    
    const lowerQuery = query_str.toLowerCase();
    
    const filteredContacts = contacts.filter(c => 
      c.name.toLowerCase().includes(lowerQuery) || 
      c.email.toLowerCase().includes(lowerQuery) || 
      c.role.toLowerCase().includes(lowerQuery)
    ).slice(0, 5);

    const filteredEvents = events.filter(e => 
      e.name.toLowerCase().includes(lowerQuery)
    ).slice(0, 3);

    return { contacts: filteredContacts, events: filteredEvents };
  }, [query_str, contacts, events]);

  const hasResults = results.contacts.length > 0 || results.events.length > 0;

  const handleSelectContact = (contact: Contact) => {
    setSelectedContact(contact);
    setQueryStr('');
    setIsOpen(false);
  };

  const handleSelectEvent = (event: Event) => {
    // Navigate to attendance page and maybe highlight or just go there
    navigate('/attendance');
    setQueryStr('');
    setIsOpen(false);
  };

  return (
    <div className="relative w-full max-w-xl" ref={containerRef}>
      <div className={cn(
        "relative flex items-center w-full h-10 rounded-full transition-all group",
        isOpen ? "bg-surface shadow-lg ring-1 ring-outline-variant" : "bg-surface-container-high hover:bg-surface-container-highest"
      )}>
        <div className="grid place-items-center h-full w-10 sm:w-12 text-on-surface-variant group-focus-within:text-primary">
          <Search className="w-4 h-4 sm:w-5 h-5" />
        </div>
        <input
          type="text"
          value={query_str}
          onFocus={() => setIsOpen(true)}
          onChange={(e) => {
            setQueryStr(e.target.value);
            setIsOpen(true);
          }}
          className="peer h-full w-full outline-none text-sm text-on-surface bg-transparent pr-10 font-medium"
          placeholder="Search contacts, events..."
        />
        {query_str && (
          <button 
            onClick={() => {
              setQueryStr('');
              setIsOpen(false);
            }}
            className="absolute right-3 p-1 rounded-full hover:bg-surface-variant text-on-surface-variant"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <AnimatePresence>
        {isOpen && query_str.length >= 2 && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.99 }}
            transition={{ duration: 0.1 }}
            className="absolute top-12 left-0 right-0 bg-surface-container-high rounded-2xl shadow-2xl border border-outline-variant overflow-hidden z-50 py-2"
          >
            {!hasResults ? (
              <div className="px-5 py-8 text-center">
                <Search className="w-8 h-8 text-on-surface-variant mx-auto mb-2 opacity-20" />
                <p className="text-sm font-bold text-on-surface">No results found for "{query_str}"</p>
                <p className="text-xs text-on-surface-variant mt-1">Try searching for something else</p>
              </div>
            ) : (
              <div className="max-h-[60vh] overflow-y-auto no-scrollbar">
                {results.contacts.length > 0 && (
                  <div className="px-2 pb-2">
                    <p className="px-3 py-2 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Contacts</p>
                    <div className="space-y-1">
                      {results.contacts.map(contact => (
                        <button
                          key={contact.id}
                          onClick={() => handleSelectContact(contact)}
                          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-surface-container-highest text-left transition-colors group"
                        >
                          <div className="w-10 h-10 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center font-bold text-sm shrink-0">
                            {contact.avatar ? (
                                <img src={contact.avatar} alt={contact.name} className="w-full h-full rounded-full object-cover" />
                            ) : contact.initials}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-on-surface group-hover:text-primary transition-colors">{contact.name}</p>
                            <p className="text-xs text-on-surface-variant truncate">{contact.role} • {contact.email}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {results.events.length > 0 && (
                  <div className={cn("px-2 pb-2", results.contacts.length > 0 && "border-t border-outline-variant/30 mt-1 pt-2")}>
                    <p className="px-3 py-2 text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Events</p>
                    <div className="space-y-1">
                      {results.events.map(event => (
                        <button
                          key={event.id}
                          onClick={() => handleSelectEvent(event)}
                          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-surface-container-highest text-left transition-colors group"
                        >
                          <div className="w-10 h-10 rounded-xl bg-secondary-container text-on-secondary-container flex items-center justify-center shrink-0">
                            <Calendar className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-on-surface group-hover:text-primary transition-colors">{event.name}</p>
                            <p className="text-xs text-on-surface-variant">{new Date(event.date).toLocaleDateString()}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            
            <div className="px-5 py-2 border-t border-outline-variant/30 mt-1 bg-surface-container-highest/50">
                <p className="text-[10px] text-on-surface-variant text-center font-medium">Tip: Search by name, email, or group</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
