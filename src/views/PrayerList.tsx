import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  where,
  doc,
  setDoc,
  serverTimestamp,
  getDocs
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Contact, PrayerRecord } from '../types';
import { 
  MessageSquare, 
  CheckCircle2, 
  Save, 
  ChevronLeft, 
  ChevronRight,
  Search,
  Filter,
  User,
  Clock,
  Loader2,
  Calendar,
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { useAuth } from '../components/AuthProvider';
import { Skeleton } from '../components/ui/Skeleton';

const PRAYER_DATES = [
  '2026-02-10', '2026-02-17', '2026-02-24', 
  '2026-03-03', '2026-03-10', '2026-03-17', '2026-03-24', '2026-03-31',
  '2026-04-14', '2026-04-21', '2026-04-28', '2026-05-05'
];

const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' });
};

export default function PrayerList() {
  const { user } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [prayers, setPrayers] = useState<Record<string, Record<string, PrayerRecord>>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDate, setSelectedDate] = useState(PRAYER_DATES[0]);
  const [saving, setSaving] = useState<string | null>(null);

  // Load Contacts
  useEffect(() => {
    const q = query(collection(db, 'contacts'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const contactData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Contact[];
      setContacts(contactData);
    });
    return () => unsubscribe();
  }, []);

  // Load Prayers
  useEffect(() => {
    const q = query(collection(db, 'prayers'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const prayerData: Record<string, Record<string, PrayerRecord>> = {};
      snapshot.docs.forEach(doc => {
        const data = doc.data() as PrayerRecord;
        const id = doc.id;
        if (!prayerData[data.contactId]) {
          prayerData[data.contactId] = {};
        }
        prayerData[data.contactId][data.date] = { ...data, id };
      });
      setPrayers(prayerData);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const filteredContacts = useMemo(() => {
    return contacts.filter(c => 
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.role?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.tags?.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  }, [contacts, searchQuery]);

  const handleUpdatePrayer = async (contactId: string, date: string, field: 'burden' | 'answer', value: string) => {
    const prayerId = `${contactId}_${date}`;
    const prayerRef = doc(db, 'prayers', prayerId);
    
    setSaving(prayerId);
    try {
      const existing = prayers[contactId]?.[date];
      await setDoc(prayerRef, {
        contactId,
        date,
        [field]: value,
        updatedAt: new Date().toISOString(),
        updatedBy: user?.uid,
        updatedByName: user?.displayName || user?.email?.split('@')[0],
        burden: field === 'burden' ? value : (existing?.burden || ''),
        answer: field === 'answer' ? value : (existing?.answer || '')
      }, { merge: true });
    } catch (error) {
      console.error("Error updating prayer:", error);
    } finally {
      setTimeout(() => setSaving(null), 1000);
    }
  };

  if (loading && contacts.length === 0) {
    return (
      <div className="h-full flex flex-col bg-surface-container-lowest/30 animate-pulse">
        {/* Header Skeleton */}
        <div className="px-8 pt-8 pb-6 bg-surface border-b border-outline-variant/50 sticky top-0 z-10">
          <div className="flex flex-col gap-6 md:flex-row md:items-end justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <Skeleton className="w-10 h-10 rounded-xl" />
                <Skeleton className="h-8 w-64" />
              </div>
              <Skeleton className="h-4 w-96 ml-13" />
            </div>
            <Skeleton className="h-11 w-64 rounded-xl" />
          </div>

          {/* Date Bar Skeleton */}
          <div className="mt-8 flex items-center gap-2 overflow-x-auto pb-2">
            {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
              <Skeleton key={i} className="h-10 w-24 rounded-full flex-shrink-0" />
            ))}
          </div>
        </div>

        {/* Table Skeleton */}
        <div className="flex-1 overflow-auto p-8 pt-6">
          <div className="border border-outline-variant rounded-[32px] overflow-hidden bg-surface shadow-xl shadow-surface-container/20">
            <div className="h-14 bg-surface-container-low/50 border-b border-outline-variant/30 flex items-center px-8 gap-8">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-3 w-48" />
              <Skeleton className="h-3 w-48" />
            </div>
            <div className="p-0">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="flex gap-8 p-4 px-8 border-b border-outline-variant/10 items-center">
                  <div className="flex items-center gap-4 min-w-[176px]">
                    <Skeleton className="w-10 h-10 rounded-xl" />
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-3 w-32" />
                    </div>
                  </div>
                  <Skeleton className="h-20 flex-1 rounded-2xl" />
                  <Skeleton className="h-20 flex-1 rounded-2xl" />
                  <Skeleton className="h-8 w-8 rounded-full" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-surface-container-lowest/30">
      {/* Header Area */}
      <div className="px-8 pt-8 pb-6 bg-surface border-b border-outline-variant/50 sticky top-0 z-10">
        <div className="flex flex-col gap-6 md:flex-row md:items-end justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-on-primary shadow-lg shadow-primary/20">
                <Calendar className="w-6 h-6" />
              </div>
              <h1 className="text-3xl font-black text-on-surface tracking-tight uppercase">Community Prayer List</h1>
            </div>
            <p className="text-on-surface-variant/70 text-sm font-medium ml-13">
              Tracking burdens and answers for the spring semester shepherdings.
            </p>
          </div>

          <div className="flex items-center gap-4">
             <div className="relative group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/40 group-focus-within:text-primary transition-colors" />
                <input 
                  type="text"
                  placeholder="Search Names, Years, Tags..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-4 h-11 w-64 rounded-xl bg-surface-container-low border border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm font-medium"
                />
             </div>
          </div>
        </div>

        {/* Date Selection Bar */}
        <div className="mt-8 flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {PRAYER_DATES.map((date) => (
            <button
              key={date}
              onClick={() => setSelectedDate(date)}
              className={cn(
                "px-5 h-10 rounded-full text-xs font-black uppercase tracking-widest whitespace-nowrap transition-all flex items-center gap-2",
                selectedDate === date 
                  ? "bg-primary text-on-primary shadow-lg shadow-primary/20" 
                  : "bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest"
              )}
            >
              {formatDate(date)}
              {selectedDate === date && <Clock className="w-3 h-3" />}
            </button>
          ))}
        </div>
      </div>

      {/* Table Container */}
      <div className="flex-1 overflow-auto p-8 pt-6">
        <div className="border border-outline-variant rounded-[32px] overflow-hidden bg-surface shadow-xl shadow-surface-container/20">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-surface-container-low/50">
                <th className="sticky left-0 z-20 bg-surface-container-low text-left p-4 px-8 border-b border-outline-variant/30 min-w-[240px]">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant">Member / Details</span>
                </th>
                <th className="text-left p-4 border-b border-outline-variant/30 min-w-[300px]">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-3.5 h-3.5 text-primary" />
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant">Prayer Burden ({formatDate(selectedDate)})</span>
                  </div>
                </th>
                <th className="text-left p-4 border-b border-outline-variant/30 min-w-[300px]">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-tertiary" />
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant">Answered Prayer ({formatDate(selectedDate)})</span>
                  </div>
                </th>
                <th className="text-right p-4 border-b border-outline-variant/30">
                   <span className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant px-4">Status</span>
                </th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence mode="popLayout">
                {filteredContacts.map((contact) => {
                  const prayer = prayers[contact.id]?.[selectedDate];
                  const isSaving = saving === `${contact.id}_${selectedDate}`;
                  const yearTag = contact.tags?.find(t => t.toLowerCase().includes('year'));
                  const shepherdingTag = contact.role || 'Unassigned';

                  return (
                    <motion.tr 
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      key={contact.id} 
                      className="group hover:bg-surface-container-lowest/50 transition-colors border-b border-outline-variant/10 last:border-0"
                    >
                      <td className="sticky left-0 z-10 bg-surface group-hover:bg-surface-container-lowest/50 p-4 px-8 transition-colors">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-xl bg-surface-container-high flex items-center justify-center text-primary font-black text-sm uppercase">
                            {contact.initials}
                          </div>
                          <div>
                            <div className="font-bold text-on-surface text-sm">{contact.name}</div>
                            <div className="flex items-center gap-2 mt-1">
                               <span className="text-[9px] font-black text-on-surface-variant/60 uppercase tracking-widest">{shepherdingTag}</span>
                               <span className="w-1 h-1 rounded-full bg-outline-variant" />
                               <span className="text-[9px] font-black text-primary uppercase tracking-widest">{yearTag || 'TBD'}</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <textarea
                          placeholder={`Enter burden for ${formatDate(selectedDate)}...`}
                          value={prayer?.burden || ''}
                          onChange={(e) => handleUpdatePrayer(contact.id, selectedDate, 'burden', e.target.value)}
                          className="w-full min-h-[80px] p-4 rounded-2xl bg-surface-container-low border border-outline-variant focus:border-primary focus:bg-surface outline-none transition-all text-xs font-medium resize-none shadow-sm group-hover:shadow-md"
                        />
                      </td>
                      <td className="p-4">
                        <textarea
                          placeholder="How did God answer?"
                          value={prayer?.answer || ''}
                          onChange={(e) => handleUpdatePrayer(contact.id, selectedDate, 'answer', e.target.value)}
                          className="w-full min-h-[80px] p-4 rounded-2xl bg-surface-container-low/50 border border-outline-variant focus:border-tertiary focus:bg-surface outline-none transition-all text-xs font-medium italic text-on-surface-variant resize-none shadow-sm group-hover:shadow-md"
                        />
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end px-4">
                          {isSaving ? (
                            <Loader2 className="w-4 h-4 animate-spin text-primary" />
                          ) : prayer?.burden || prayer?.answer ? (
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                              <Save className="w-4 h-4" />
                            </div>
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-outline-variant/20 flex items-center justify-center text-on-surface-variant/20">
                              <Clock className="w-4 h-4" />
                            </div>
                          )}
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
            </tbody>
          </table>
          
          {filteredContacts.length === 0 && (
            <div className="py-20 text-center">
              <div className="w-16 h-16 rounded-full bg-surface-container-high flex items-center justify-center mx-auto mb-4 text-on-surface-variant/30">
                <Search className="w-8 h-8" />
              </div>
              <p className="text-on-surface-variant/60 font-black uppercase tracking-widest text-xs">No members found matching your search</p>
            </div>
          )}
        </div>
      </div>
      
      {/* Footer Info */}
      <div className="px-8 py-4 bg-surface-container-low/30 border-t border-outline-variant/30 flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-primary" />
            Changes save automatically
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-tertiary" />
            Shared with management team
          </div>
        </div>
        <div>
          Last synced: {new Date().toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
}
