import React, { useState, useEffect } from 'react';
import { 
  Users, 
  CheckCircle2, 
  AlertTriangle, 
  Filter, 
  Download,
  CalendarDays,
  X,
  Plus
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { collection, onSnapshot, query, orderBy, doc, updateDoc, addDoc, getDocs, limit } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { cn, sleep } from '../lib/utils';
import { useLayout } from '../App';
import { Contact } from '../types';
import { Skeleton } from '../components/ui/Skeleton';

interface Event {
  id: string;
  name: string;
  date: string;
  order: number;
}

export default function Attendance() {
  const { isSidebarCollapsed } = useLayout();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch Contacts
    const unsubscribeContacts = onSnapshot(collection(db, 'contacts'), (snapshot) => {
      const contactData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Contact[];
      setContacts(contactData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'contacts');
    });

    // Fetch Events
    const qEvents = query(collection(db, 'events'), orderBy('order', 'asc'));
    const unsubscribeEvents = onSnapshot(qEvents, (snapshot) => {
      const eventData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Event[];
      setEvents(eventData);
      setTimeout(() => setLoading(false), 800);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'events');
      setTimeout(() => setLoading(false), 800);
    });

    return () => {
      unsubscribeContacts();
      unsubscribeEvents();
    };
  }, []);

  const toggleAttendance = async (contactId: string, eventId: string, currentStatus: boolean | 'absent' | undefined) => {
    try {
      const contactRef = doc(db, 'contacts', contactId);
      const contact = contacts.find(c => c.id === contactId);
      if (!contact) return;

      const newAttendance = { ...(contact.attendance || {}) };
      
      if (currentStatus === true) {
        newAttendance[eventId] = 'absent';
      } else if (currentStatus === 'absent') {
        delete newAttendance[eventId];
      } else {
        newAttendance[eventId] = true;
      }

      await updateDoc(contactRef, {
        attendance: newAttendance,
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `contacts/${contactId}`);
    }
  };

  const handleAddEvent = async () => {
    const name = prompt('Event Name:');
    if (!name) return;
    const date = prompt('Date (e.g. Oct 12):');
    if (!date) return;

    try {
      await addDoc(collection(db, 'events'), {
        name,
        date,
        order: events.length,
        createdAt: new Date().toISOString()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'events');
    }
  };

  const calculateAvgAttendance = () => {
    if (contacts.length === 0 || events.length === 0) return 0;
    let totalPresent = 0;
    contacts.forEach(c => {
      events.forEach(e => {
        if (c.attendance?.[e.id] === true) totalPresent++;
      });
    });
    return Math.round((totalPresent / (contacts.length * events.length)) * 100);
  };

  const atRiskCount = contacts.filter(c => {
    if (events.length === 0) return false;
    let present = 0;
    events.forEach(e => {
      if (c.attendance?.[e.id] === true) present++;
    });
    return (present / events.length) < 0.5;
  }).length;

  if (loading) {
    return (
      <div className="p-6 md:p-8 space-y-6 flex flex-col h-full">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-10 w-64" />
            <Skeleton className="h-4 w-48" />
          </div>
          <div className="flex gap-3">
            <Skeleton className="h-10 w-32 rounded-xl" />
            <Skeleton className="h-10 w-32 rounded-xl" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
        </div>

        <div className="bg-surface-container rounded-2xl overflow-hidden flex-1 border border-outline-variant/30">
          <div className="h-16 px-6 border-b border-outline-variant flex items-center">
            <Skeleton className="h-4 w-32" />
          </div>
          <div className="p-6 space-y-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="flex items-center gap-6 py-4 border-b border-outline-variant/30 last:border-0">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-32" />
                </div>
                <div className="flex gap-4">
                  <Skeleton className="h-8 w-8 rounded-lg" />
                  <Skeleton className="h-8 w-8 rounded-lg" />
                  <Skeleton className="h-8 w-8 rounded-lg" />
                  <Skeleton className="h-8 w-8 rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="p-6 md:p-8 space-y-6 flex flex-col h-full"
    >
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-3xl font-normal text-on-surface mb-1">Attendance Tracker</h1>
          <p className="text-sm text-on-surface-variant flex items-center gap-2">
            <CalendarDays className="w-4 h-4" />
            Active Outreach • {contacts.length} Contacts
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={handleAddEvent}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-primary text-primary font-bold text-sm hover:bg-primary/5 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Event
          </button>
          <button className="flex items-center gap-2 px-4 py-2 rounded-xl bg-secondary-container text-on-secondary-container font-bold text-sm hover:opacity-80 transition-colors">
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 shrink-0">
        <div className="bg-surface-container rounded-2xl p-4 flex items-center gap-4 border border-outline-variant/30">
          <div className="w-12 h-12 rounded-full bg-primary-fixed flex items-center justify-center text-on-primary-fixed">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[10px] text-on-surface-variant uppercase tracking-widest font-black">Total Reach</p>
            <p className="text-2xl font-bold text-on-surface">{contacts.length}</p>
          </div>
        </div>
        <div className="bg-surface-container rounded-2xl p-4 flex items-center gap-4 border border-outline-variant/30">
          <div className="w-12 h-12 rounded-full bg-tertiary-fixed flex items-center justify-center text-on-tertiary-fixed">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[10px] text-on-surface-variant uppercase tracking-widest font-black">Avg Attendance</p>
            <p className="text-2xl font-bold text-on-surface">{calculateAvgAttendance()}%</p>
          </div>
        </div>
        <div className="bg-surface-container rounded-2xl p-4 flex items-center gap-4 border border-outline-variant/30">
          <div className="w-12 h-12 rounded-full bg-error-container flex items-center justify-center text-on-error-container">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[10px] text-on-surface-variant uppercase tracking-widest font-black">At Risk (&lt; 50%)</p>
            <p className="text-2xl font-bold text-on-surface">{atRiskCount}</p>
          </div>
        </div>
      </div>

      {/* Attendance Table */}
      <div className="bg-surface-container rounded-2xl border border-outline-variant/50 flex flex-col overflow-hidden shadow-sm flex-1">
        <div className="overflow-auto no-scrollbar h-full">
          {events.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center bg-surface-container-low">
               <CalendarDays className="w-12 h-12 text-on-surface-variant opacity-20 mb-4" />
               <h3 className="text-lg font-bold text-on-surface mb-1">No events added yet</h3>
               <p className="text-sm text-on-surface-variant max-w-xs">Start tracking attendance by adding your first event (e.g. Kickoff Event, Workshop A).</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse table-auto min-w-[600px]">
              <thead className="sticky top-0 z-30">
                <tr className="bg-surface-container-high border-b border-outline-variant">
                  <th className="p-3 sm:p-4 sticky left-0 z-40 bg-surface-container-high border-r border-outline-variant w-64 shadow-[2px_0_5px_rgba(0,0,0,0.05)]">
                    <div className="text-xs font-black uppercase tracking-widest text-on-surface-variant">Contact</div>
                  </th>
                  {events.map((event) => (
                    <th key={event.id} className="p-2 sm:p-4 text-center border-r border-outline-variant/50 min-w-[100px]">
                      <div className="text-xs font-bold text-on-surface truncate">{event.date}</div>
                      <div className="text-[9px] text-on-surface-variant mt-0.5 leading-tight truncate">{event.name}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/30 bg-surface-container-lowest">
                {contacts.length === 0 ? (
                  <tr>
                    <td colSpan={events.length + 1} className="p-12 text-center text-on-surface-variant text-sm italic">
                      No contacts found. Add contacts in the Directory first.
                    </td>
                  </tr>
                ) : (
                  contacts.map((contact) => (
                    <tr key={contact.id} className="hover:bg-surface-container-low transition-colors group">
                      <td className="sticky left-0 z-20 bg-surface-container-lowest group-hover:bg-surface-container-low border-r border-outline-variant p-3 sm:p-4 transition-colors shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                        <div className="flex items-center gap-2 sm:gap-3">
                          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center font-bold shrink-0 text-xs sm:text-base bg-secondary-container text-on-secondary-container">
                            {contact.initials}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs sm:text-sm font-bold text-on-surface truncate">
                              {contact.name}
                            </p>
                            <p className="text-[10px] text-on-surface-variant truncate uppercase tracking-tighter opacity-70">{contact.role}</p>
                          </div>
                        </div>
                      </td>
                      {events.map((event) => {
                        const status = contact.attendance?.[event.id];
                        return (
                          <td key={event.id} className="p-2 sm:p-4 text-center border-r border-outline-variant/30">
                            <div className="flex justify-center">
                              <button
                                onClick={() => toggleAttendance(contact.id, event.id, status)}
                                className={cn(
                                  "w-6 h-6 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center transition-all active:scale-95",
                                  status === true ? "bg-primary text-on-primary shadow-sm hover:brightness-110" : 
                                  status === 'absent' ? "bg-error-container text-on-error-container shadow-sm hover:brightness-110" : 
                                  "border-2 border-outline/30 hover:border-primary/50 bg-transparent"
                                )}
                              >
                                {status === true && <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5" />}
                                {status === 'absent' && <X className="w-4 h-4 sm:w-5 sm:h-5" />}
                              </button>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </motion.div>
  );
}
