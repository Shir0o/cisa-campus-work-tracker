import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, X, User, ArrowRight } from 'lucide-react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Contact } from '../../types';
import { cn } from '../../lib/utils';
import { useLayout } from '../../App';

interface SearchContactModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SearchContactModal({ isOpen, onClose }: SearchContactModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const { setSelectedContact } = useLayout();

  useEffect(() => {
    const q = query(collection(db, 'contacts'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Contact[];
      setContacts(data);
    });
    return () => unsubscribe();
  }, []);

  const filteredContacts = React.useMemo(() => {
    if (!searchQuery.trim()) return [];
    const lower = searchQuery.toLowerCase();
    return contacts.filter(c => 
      c.name.toLowerCase().includes(lower) || 
      c.email.toLowerCase().includes(lower) ||
      c.role.toLowerCase().includes(lower)
    ).slice(0, 8);
  }, [searchQuery, contacts]);

  const handleSelect = (contact: Contact) => {
    setSelectedContact(contact);
    onClose();
    setSearchQuery('');
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-20 px-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            className="relative w-full max-w-lg bg-surface-container-high rounded-[2rem] shadow-2xl overflow-hidden border border-outline-variant"
          >
            <div className="p-4 border-b border-outline-variant flex items-center gap-3">
              <Search className="w-5 h-5 text-on-surface-variant ml-2" />
              <input
                autoFocus
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search contact to log interaction..."
                className="flex-1 bg-transparent border-none outline-none text-lg text-on-surface placeholder:text-on-surface-variant font-medium py-2"
              />
              <button 
                onClick={onClose}
                className="p-2 rounded-full hover:bg-surface-variant transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-2 no-scrollbar font-sans">
              {searchQuery.trim() === '' ? (
                 <div className="p-8 text-center">
                    <User className="w-12 h-12 text-on-surface-variant mx-auto mb-3 opacity-20" />
                    <p className="text-on-surface-variant font-medium">Type a name to find a contact</p>
                 </div>
              ) : filteredContacts.length === 0 ? (
                <div className="p-8 text-center">
                   <p className="text-on-surface-variant font-medium">No contacts found for "{searchQuery}"</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {filteredContacts.map(contact => (
                    <button
                      key={contact.id}
                      onClick={() => handleSelect(contact)}
                      className="w-full flex items-center gap-4 px-4 py-3 rounded-2xl hover:bg-surface-container-highest transition-all group text-left"
                    >
                      <div className="w-12 h-12 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center font-bold text-lg shadow-sm group-hover:scale-110 transition-transform overflow-hidden shrink-0">
                        {contact.avatar ? (
                          <img src={contact.avatar} alt={contact.name} className="w-full h-full object-cover" />
                        ) : contact.initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-base font-bold text-on-surface group-hover:text-primary transition-colors">{contact.name}</p>
                        <p className="text-xs text-on-surface-variant uppercase font-black tracking-widest opacity-70">{contact.role}</p>
                      </div>
                      <ArrowRight className="w-5 h-5 text-on-surface-variant opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 bg-surface-container-highest/30 border-t border-outline-variant flex justify-center">
                <p className="text-[10px] uppercase font-black tracking-[0.2em] text-on-surface-variant">Log Interaction Shortcut</p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
