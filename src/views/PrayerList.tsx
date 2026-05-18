import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  doc,
  addDoc,
  updateDoc
} from 'firebase/firestore';
import { db, logActivity } from '../lib/firebase';
import { Contact, PrayerRecord } from '../types';
import { 
  CheckCircle2, 
  Search,
  Clock,
  Loader2,
  Calendar,
  AlertCircle,
  Heart,
  Plus,
  MessageSquare
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { useAuth } from '../components/AuthProvider';
import { Skeleton } from '../components/ui/Skeleton';

export default function PrayerList() {
  const { user } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [prayers, setPrayers] = useState<PrayerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [newBurden, setNewBurden] = useState('');
  const [addingStatus, setAddingStatus] = useState(false);

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

  // Load Prayers History
  useEffect(() => {
    const q = query(collection(db, 'prayers'), orderBy('date', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const prayerData: PrayerRecord[] = [];
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.date && data.burden) {
          prayerData.push({ id: doc.id, ...data } as PrayerRecord);
        } else if (data.prayedFor) {
          // Legacy mapping
          prayerData.push({
            id: doc.id,
            contactId: data.contactId,
            date: data.updatedAt || new Date().toISOString(),
            burden: data.prayedFor,
            status: data.unanswered ? 'unanswered' : 'pending',
            updatedAt: data.updatedAt || new Date().toISOString(),
            updatedBy: data.updatedBy,
            updatedByName: data.updatedByName
          } as PrayerRecord);
        }
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

  const selectedContact = useMemo(() => 
    contacts.find(c => c.id === selectedContactId), 
  [contacts, selectedContactId]);

  const selectedContactPrayers = useMemo(() => 
    prayers.filter(p => p.contactId === selectedContactId).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
  [prayers, selectedContactId]);

  const handleAddBurden = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedContactId || !newBurden.trim()) return;

    setAddingStatus(true);
    try {
      const newRecord: Omit<PrayerRecord, 'id'> = {
        contactId: selectedContactId,
        date: new Date().toISOString(),
        burden: newBurden.trim(),
        status: 'pending',
        updatedAt: new Date().toISOString(),
        updatedBy: user?.uid,
        updatedByName: user?.displayName || user?.email?.split('@')[0]
      };
      
      await addDoc(collection(db, 'prayers'), newRecord);
      
      logActivity({
        action: "added a prayer burden for",
        targetId: selectedContactId,
        targetName: selectedContact.name,
        targetType: "contact",
        type: "comment",
        description: newBurden.trim(),
      });
      
      setNewBurden('');
    } catch (error) {
      console.error("Error adding burden:", error);
    } finally {
      setAddingStatus(false);
    }
  };

  const handleUpdateStatus = async (prayerId: string, newStatus: PrayerRecord['status']) => {
    try {
      const ref = doc(db, 'prayers', prayerId);
      await updateDoc(ref, {
        status: newStatus,
        updatedAt: new Date().toISOString(),
        updatedBy: user?.uid,
        updatedByName: user?.displayName || user?.email?.split('@')[0]
      });
      
      if (selectedContact) {
        logActivity({
          action: `marked a prayer burden as ${newStatus} for`,
          targetId: selectedContact.id,
          targetName: selectedContact.name,
          targetType: "contact",
          type: "edit",
          description: `Status changed to ${newStatus}`,
        });
      }
    } catch (error) {
      console.error("Error updating status:", error);
    }
  };

  const formatDate = (isoString: string) => {
    const d = new Date(isoString);
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(d);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'answered': return 'text-green-600 bg-green-500/10 border-green-500/20';
      case 'ongoing': return 'text-blue-600 bg-blue-500/10 border-blue-500/20';
      case 'unanswered': return 'text-red-600 bg-red-500/10 border-red-500/20';
      default: return 'text-orange-600 bg-orange-500/10 border-orange-500/20';
    }
  };

  if (loading && contacts.length === 0) {
    return (
      <div className="h-full flex flex-col bg-surface-container-lowest/30 animate-pulse p-8">
        <Skeleton className="h-10 w-64 mb-8" />
        <div className="flex gap-6 h-full">
          <Skeleton className="w-1/3 h-full rounded-[32px]" />
          <Skeleton className="flex-1 h-full rounded-[32px]" />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-surface-container-lowest/30 overflow-hidden">
      {/* Header Area */}
      <div className="px-8 pt-8 pb-6 bg-surface border-b border-outline-variant/50 flex-shrink-0 z-10">
        <div className="flex flex-col gap-6 md:flex-row md:items-end justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-on-primary shadow-lg shadow-primary/20">
                <Heart className="w-6 h-6" />
              </div>
              <h1 className="text-3xl font-black text-on-surface tracking-tight uppercase">Prayer Log History</h1>
            </div>
            <p className="text-on-surface-variant/70 text-sm font-medium ml-13">
              Track weekly burdens, review past requests, and log answered prayers.
            </p>
          </div>
        </div>
      </div>

      {/* Split View Container */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left: Contact List */}
        <div className="w-[380px] flex-shrink-0 flex flex-col bg-surface-container-lowest border-r border-outline-variant/30 relative">
          <div className="p-4 border-b border-outline-variant/30 sticky top-0 bg-surface-container-lowest/80 backdrop-blur-xl z-10">
             <div className="relative group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/40 group-focus-within:text-primary transition-colors" />
                <input 
                  type="text"
                  placeholder="Search Members..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-4 h-11 w-full rounded-xl bg-surface-container-low border border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm font-medium"
                />
             </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-2 scrollbar-thin">
            <AnimatePresence>
              {filteredContacts.map(contact => {
                const isSelected = selectedContactId === contact.id;
                const contactPrayers = prayers.filter(p => p.contactId === contact.id).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                const latestPrayer = contactPrayers[0];
                
                return (
                  <motion.button
                    layout
                    key={contact.id}
                    onClick={() => setSelectedContactId(contact.id)}
                    className={cn(
                      "w-full text-left p-4 rounded-2xl mb-1 transition-all group flex gap-4 items-start",
                      isSelected 
                        ? "bg-primary/10 hover:bg-primary/15" 
                        : "hover:bg-surface-container-low"
                    )}
                  >
                    <div className={cn(
                      "w-10 h-10 shrink-0 rounded-xl flex items-center justify-center font-black text-sm uppercase transition-colors",
                      isSelected ? "bg-primary text-on-primary" : "bg-surface-container-high text-primary group-hover:bg-primary/20"
                    )}>
                      {contact.initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm text-on-surface truncate">{contact.name}</div>
                      {latestPrayer ? (
                        <div className="flex items-center gap-2 mt-1 truncate">
                          <span className={cn(
                            "w-2 h-2 rounded-full shrink-0", 
                            latestPrayer.status === 'answered' ? 'bg-green-500' :
                            latestPrayer.status === 'ongoing' ? 'bg-blue-500' :
                            latestPrayer.status === 'unanswered' ? 'bg-red-500' : 'bg-orange-500'
                          )} />
                          <span className="text-xs text-on-surface-variant/70 truncate">{latestPrayer.burden}</span>
                        </div>
                      ) : (
                        <div className="text-xs text-on-surface-variant/40 mt-1 italic">No prayer history</div>
                      )}
                    </div>
                  </motion.button>
                )
              })}
            </AnimatePresence>
          </div>
        </div>

        {/* Right: History Log Panel */}
        <div className="flex-1 flex flex-col bg-surface relative overflow-hidden">
          {!selectedContact ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 opacity-50">
              <MessageSquare className="w-16 h-16 text-on-surface-variant/30 mb-4" />
              <h2 className="text-xl font-bold text-on-surface-variant">Select a Member</h2>
              <p className="text-sm font-medium text-on-surface-variant/60 mt-2 max-w-sm">
                Choose a contact from the list to view their prayer history, review past burdens, and add a new focus for this week.
              </p>
            </div>
          ) : (
            <div className="flex flex-col h-full absolute inset-0">
              
              {/* Contact Header */}
              <div className="flex items-center gap-4 p-6 md:px-10 border-b border-outline-variant/30 bg-surface/80 backdrop-blur-sm z-10 shrink-0">
                <div className="w-14 h-14 rounded-2xl bg-surface-container-high flex items-center justify-center text-primary font-black text-xl uppercase">
                  {selectedContact.initials}
                </div>
                <div>
                  <h2 className="text-2xl font-black text-on-surface tracking-tight">{selectedContact.name}</h2>
                  <div className="flex items-center gap-2 mt-1">
                     <span className="text-[10px] font-black text-on-surface-variant/60 uppercase tracking-widest">{selectedContact.role || 'Unassigned'}</span>
                     <span className="w-1 h-1 rounded-full bg-outline-variant" />
                     <span className="text-[10px] font-black text-primary uppercase tracking-widest">{selectedContact.tags?.find(t => t.toLowerCase().includes('year')) || 'TBD'}</span>
                  </div>
                </div>
              </div>

              {/* Scrollable Feed */}
              <div className="flex-1 overflow-y-auto p-6 md:px-10 scrollbar-thin bg-surface-container-lowest/30">
                
                {/* Compose New Burden */}
                <form onSubmit={handleAddBurden} className="mb-10 bg-surface rounded-[24px] border border-outline-variant/50 p-6 shadow-xl shadow-surface-container/5 relative overflow-hidden group">
                  <div className="absolute top-0 left-0 w-1 h-full bg-primary" />
                  <h3 className="text-sm font-black text-on-surface uppercase tracking-widest mb-4 flex items-center gap-2">
                    <Plus className="w-4 h-4 text-primary" />
                    This Week's Burden
                  </h3>
                  <textarea
                    placeholder={`What are we praying for ${selectedContact.name.split(' ')[0]} this week?`}
                    value={newBurden}
                    onChange={(e) => setNewBurden(e.target.value)}
                    className="w-full min-h-[100px] p-4 rounded-xl bg-surface-container-lowest border border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm font-medium resize-none shadow-inner"
                  />
                  <div className="mt-4 flex justify-end">
                    <button
                      type="submit"
                      disabled={!newBurden.trim() || addingStatus}
                      className="px-6 py-2.5 rounded-xl bg-primary text-on-primary text-sm font-bold shadow-lg shadow-primary/25 hover:bg-primary/90 hover:shadow-primary/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {addingStatus && <Loader2 className="w-4 h-4 animate-spin" />}
                      Log Burden
                    </button>
                  </div>
                </form>

                {/* History Log */}
                <div className="space-y-6 relative">
                  {/* Timeline vertical line */}
                  <div className="absolute left-6 top-8 bottom-0 w-px bg-outline-variant/30 -z-10" />

                  <h3 className="text-sm font-black text-on-surface-variant uppercase tracking-widest mb-6 bg-surface-container-lowest/30 inline-block pr-4">
                    Prayer History
                  </h3>

                  {selectedContactPrayers.length === 0 ? (
                    <div className="text-center py-10 opacity-60">
                      <Clock className="w-10 h-10 text-on-surface-variant mx-auto mb-3 opacity-50" />
                      <p className="text-sm font-medium">No past burdens logged yet.</p>
                    </div>
                  ) : (
                    selectedContactPrayers.map((prayer) => (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        key={prayer.id} 
                        className="flex gap-6 relative"
                      >
                        {/* Timeline node */}
                        <div className="mt-1.5 z-10 shrink-0">
                          <div className={cn(
                            "w-12 h-12 rounded-full border-4 border-surface-container-lowest flex items-center justify-center font-bold text-[10px] uppercase shadow-sm",
                            prayer.status === 'answered' ? 'bg-green-100 text-green-700' :
                            prayer.status === 'ongoing' ? 'bg-blue-100 text-blue-700' :
                            prayer.status === 'unanswered' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'
                          )}>
                            {prayer.status === 'answered' ? <CheckCircle2 className="w-5 h-5" /> : 
                             prayer.status === 'ongoing' ? <Clock className="w-5 h-5" /> : 
                             prayer.status === 'unanswered' ? <AlertCircle className="w-5 h-5" /> :
                             <Calendar className="w-4 h-4" />}
                          </div>
                        </div>

                        {/* Card */}
                        <div className="flex-1 bg-surface border border-outline-variant/30 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
                          <div className="flex items-center justify-between mb-3 border-b border-outline-variant/20 pb-3">
                            <div className="flex flex-col">
                              <span className="text-sm font-black text-on-surface">Week of {formatDate(prayer.date)}</span>
                              <span className="text-[10px] font-bold text-on-surface-variant/60 uppercase tracking-wide">
                                Logged by {prayer.updatedByName || 'Team'}
                              </span>
                            </div>
                            
                            {/* Status Switcher */}
                            <select
                              value={prayer.status}
                              onChange={(e) => handleUpdateStatus(prayer.id, e.target.value as PrayerRecord['status'])}
                              className={cn(
                                "text-xs font-bold uppercase tracking-wider rounded-lg px-3 py-1.5 border appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/50 transition-colors",
                                getStatusColor(prayer.status)
                              )}
                            >
                              <option value="pending">Pending Review</option>
                              <option value="ongoing">Ongoing</option>
                              <option value="unanswered">Unanswered</option>
                              <option value="answered">Answered 🎉</option>
                            </select>
                          </div>
                          
                          <div className="text-sm text-on-surface-variant leading-relaxed whitespace-pre-wrap font-medium">
                            {prayer.burden}
                          </div>
                        </div>
                      </motion.div>
                    ))
                  )}
                </div>

              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
