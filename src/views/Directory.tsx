import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, 
  Filter, 
  MoreVertical, 
  Mail, 
  Phone,
  Tag,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ArrowDown,
  Plus
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { collection, onSnapshot, query, orderBy, deleteDoc, doc, writeBatch } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { cn, sleep } from '../lib/utils';
import { useLayout } from '../App';
import { Contact, Stage } from '../types';
import ContactDetailsModal from '../components/modals/ContactDetailsModal';
import { Skeleton } from '../components/ui/Skeleton';

export default function Directory() {
  const { isSidebarCollapsed, openNewContact } = useLayout();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [stagesData, setStagesData] = useState<Stage[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<keyof Contact>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);

  useEffect(() => {
    const qContacts = query(collection(db, 'contacts'), orderBy('name', 'asc'));
    const unsubscribeContacts = onSnapshot(qContacts, (snapshot) => {
      const contactData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Contact[];
      setContacts(contactData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'contacts');
    });

    const qStages = query(collection(db, 'stages'), orderBy('order', 'asc'));
    const unsubscribeStages = onSnapshot(qStages, (snapshot) => {
      const stages = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Stage[];
      setStagesData(stages);
      
      // Delay first loading=false after both are loaded or after contacts if stages are empty
      setTimeout(() => setLoading(false), 800);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'stages');
      setTimeout(() => setLoading(false), 800);
    });

    return () => {
      unsubscribeContacts();
      unsubscribeStages();
    };
  }, []);

  const [filterStage, setFilterStage] = useState<string>('All');
  const [filterRole, setFilterRole] = useState<string>('All');
  const [isTagModalOpen, setIsTagModalOpen] = useState(false);
  const [newTag, setNewTag] = useState('');

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsTagModalOpen(false);
    };
    if (isTagModalOpen) {
      window.addEventListener('keydown', handleEsc);
    }
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isTagModalOpen]);

  const filteredAndSortedContacts = useMemo(() => {
    let result = [...contacts];

    // Search
    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      result = result.filter(c => 
        c.name.toLowerCase().includes(lowerQuery) || 
        c.email.toLowerCase().includes(lowerQuery) ||
        c.role.toLowerCase().includes(lowerQuery) ||
        (c.tags && c.tags.some(t => t.toLowerCase().includes(lowerQuery)))
      );
    }

    // Filter by Stage
    if (filterStage !== 'All') {
      result = result.filter(c => c.stage === filterStage);
    }

    // Filter by Role
    if (filterRole !== 'All') {
      result = result.filter(c => c.role === filterRole);
    }

    // Sort
    result.sort((a: any, b: any) => {
      const valA = a[sortField] || '';
      const valB = b[sortField] || '';
      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [contacts, searchQuery, sortField, sortDirection, filterStage, filterRole]);

  const handleBulkTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedIds.size === 0 || !newTag.trim()) return;

    try {
      const batch = writeBatch(db);
      selectedIds.forEach(id => {
        const contact = contacts.find(c => c.id === id);
        if (contact) {
          const currentTags = contact.tags || [];
          if (!currentTags.includes(newTag)) {
            batch.update(doc(db, 'contacts', id), {
              tags: [...currentTags, newTag]
            });
          }
        }
      });
      await batch.commit();
      setNewTag('');
      setIsTagModalOpen(false);
      setSelectedIds(new Set());
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'contacts');
    }
  };

  const filterStages = useMemo(() => ['All', ...new Set(stagesData.map(s => s.label))], [stagesData]);
  const filterRoles = useMemo(() => ['All', ...new Set(contacts.map(c => c.role))], [contacts]);

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredAndSortedContacts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredAndSortedContacts.map(c => c.id)));
    }
  };

  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedIds.size} contacts?`)) return;

    try {
      const batch = writeBatch(db);
      selectedIds.forEach(id => {
        batch.delete(doc(db, 'contacts', id));
      });
      await batch.commit();
      setSelectedIds(new Set());
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'contacts');
    }
  };

  const handleSort = (field: keyof Contact) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  if (loading) {
    return (
      <div className="p-4 sm:p-6 md:p-8 flex flex-col gap-6 h-full">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-10 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
          <div className="flex gap-3">
            <Skeleton className="h-10 w-48 rounded-xl" />
            <Skeleton className="h-10 w-24 rounded-xl" />
            <Skeleton className="h-10 w-24 rounded-xl" />
          </div>
        </div>
        
        <div className="bg-surface-container rounded-2xl overflow-hidden flex-1 border border-outline-variant/30">
          <div className="h-16 px-6 flex items-center border-b border-outline-variant">
            <Skeleton className="h-5 w-32" />
          </div>
          <div className="p-6 space-y-4">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="flex items-center gap-4 py-3 border-b border-outline-variant/30 last:border-0">
                <Skeleton className="h-5 w-5 rounded" />
                <Skeleton className="h-12 w-12 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/4" />
                  <Skeleton className="h-3 w-1/6" />
                </div>
                <Skeleton className="h-4 w-24 hidden md:block" />
                <Skeleton className="h-6 w-32 rounded-full" />
                <Skeleton className="h-4 w-24 hidden sm:block" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="p-4 sm:p-6 md:p-8 flex flex-col gap-4 sm:gap-6 h-full min-w-0"
    >
      {/* Header Info */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-normal text-on-background mb-1">Contacts</h2>
          <p className="text-sm text-on-surface-variant">Manage your active contacts across all campaigns.</p>
        </div>
        <div className="flex flex-wrap gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-48 lg:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
            <input 
              type="text"
              placeholder="Search contacts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-10 pl-10 pr-4 rounded-xl border border-outline bg-surface-container focus:border-primary outline-none text-sm transition-all shadow-sm"
            />
          </div>
          <div className="flex gap-2">
            <select 
              value={filterStage}
              onChange={(e) => setFilterStage(e.target.value)}
              className="px-3 h-10 rounded-xl border border-outline bg-surface-container text-xs font-bold text-on-surface-variant outline-none focus:border-primary cursor-pointer max-w-[120px]"
            >
              {filterStages.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select 
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              className="px-3 h-10 rounded-xl border border-outline bg-surface-container text-xs font-bold text-on-surface-variant outline-none focus:border-primary cursor-pointer max-w-[120px]"
            >
              {filterRoles.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Table Surface */}
      <div className="bg-surface-container rounded-2xl overflow-hidden flex-1 flex flex-col border border-outline-variant/30 shadow-sm min-w-0">
        {/* Controls */}
        <div className="h-16 px-4 sm:px-6 flex items-center justify-between border-b border-surface-variant bg-surface-container-low/50">
          <div className="flex items-center gap-3 sm:gap-6">
            <label 
              className="flex items-center gap-2 sm:gap-3 cursor-pointer group"
              onClick={toggleSelectAll}
            >
              <div className={cn(
                "w-4 h-4 sm:w-5 sm:h-5 rounded border-2 transition-colors flex items-center justify-center",
                selectedIds.size > 0 && selectedIds.size === filteredAndSortedContacts.length 
                  ? "bg-primary border-primary" 
                  : "border-outline group-hover:border-primary"
              )}>
                {selectedIds.size > 0 && selectedIds.size === filteredAndSortedContacts.length && (
                  <div className="w-2 h-2 bg-white rounded-sm" />
                )}
                {selectedIds.size > 0 && selectedIds.size < filteredAndSortedContacts.length && (
                  <div className="w-2 h-0.5 bg-primary" />
                )}
              </div>
              <span className="text-xs sm:text-sm font-bold text-on-surface-variant select-none">
                {selectedIds.size > 0 ? `${selectedIds.size} Selected` : 'Select All'}
              </span>
            </label>
            
            {selectedIds.size > 0 && (
              <>
                <div className="h-6 w-px bg-outline-variant"></div>
                <div className="flex items-center gap-2 sm:gap-4 text-on-surface-variant">
                  <button 
                    onClick={() => setIsTagModalOpen(true)}
                    className="hover:text-primary transition-colors p-1.5 rounded-full hover:bg-surface-container-highest" 
                    title="Tag Selected"
                  >
                    <Tag className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>
                  <button className="hover:text-primary transition-colors p-1.5 rounded-full hover:bg-surface-container-highest" title="Email Selected">
                    <Mail className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>
                  <button 
                    onClick={handleBulkDelete}
                    className="hover:text-error transition-colors p-1.5 rounded-full hover:bg-error-container" 
                    title="Delete Selected"
                  >
                    <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>
                </div>
              </>
            )}
          </div>
          <div className="flex items-center gap-2 sm:gap-3 text-on-surface-variant">
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-widest">
              {filteredAndSortedContacts.length} Contacts
            </span>
          </div>
        </div>

        {/* Scrollable Area */}
        <div className="flex-1 overflow-auto no-scrollbar">
          {filteredAndSortedContacts.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center">
              <div className="w-16 h-16 rounded-full bg-surface-container-highest flex items-center justify-center mb-4">
                <Search className="w-8 h-8 text-on-surface-variant opacity-20" />
              </div>
              <h3 className="text-lg font-bold text-on-surface mb-1">No contacts found</h3>
              <p className="text-sm text-on-surface-variant">Try adjusting your search or filters.</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse table-auto min-w-[700px]">
              <thead className="bg-surface-container-low sticky top-0 z-10 border-b border-surface-variant shadow-sm text-on-surface-variant">
                <tr>
                  <th className="py-4 px-4 sm:px-6 w-16"></th>
                  <th 
                    className="py-4 px-2 sm:px-4 text-xs font-black uppercase tracking-wider cursor-pointer hover:text-on-surface group whitespace-nowrap"
                    onClick={() => handleSort('name')}
                  >
                    Name <ArrowDown className={cn(
                      "w-3 h-3 inline-block ml-1 transition-all",
                      sortField === 'name' ? (sortDirection === 'desc' ? 'rotate-180' : 'opacity-100') : 'opacity-0 group-hover:opacity-100'
                    )} />
                  </th>
                  <th className={cn(
                    "py-4 px-4 text-xs font-black uppercase tracking-wider",
                    isSidebarCollapsed ? "table-cell" : "hidden md:table-cell"
                  )}>Location</th>
                  <th className={cn(
                    "py-4 px-4 text-xs font-black uppercase tracking-wider",
                    "hidden lg:table-cell"
                  )}>Contact Info</th>
                  <th 
                    className="py-4 px-2 sm:px-4 text-xs font-black uppercase tracking-wider cursor-pointer hover:text-on-surface group w-32"
                    onClick={() => handleSort('stage')}
                  >
                    Stage <ArrowDown className={cn(
                      "w-3 h-3 inline-block ml-1 transition-all",
                      sortField === 'stage' ? (sortDirection === 'desc' ? 'rotate-180' : 'opacity-100') : 'opacity-0 group-hover:opacity-100'
                    )} />
                  </th>
                  <th className={cn(
                    "py-4 px-4 text-xs font-black uppercase tracking-wider text-right w-28",
                    isSidebarCollapsed ? "table-cell" : "hidden sm:table-cell"
                  )}>Last Seen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/30 bg-surface-container-lowest">
                {filteredAndSortedContacts.map((contact) => (
                  <tr 
                    key={contact.id} 
                    onClick={() => setSelectedContact(contact)}
                    className={cn(
                      "hover:bg-surface-container-low transition-colors group cursor-pointer",
                      contact.hasNewActivity && "bg-primary-container/[0.03]",
                      selectedIds.has(contact.id) && "bg-primary/5"
                    )}
                  >
                    <td className="py-4 px-4 sm:px-6">
                      <div 
                        onClick={(e) => toggleSelect(contact.id, e)}
                        className={cn(
                          "w-5 h-5 rounded border-2 transition-colors flex items-center justify-center",
                          selectedIds.has(contact.id) 
                            ? "bg-primary border-primary opacity-100" 
                            : "border-outline opacity-40 group-hover:opacity-100 group-hover:border-primary"
                        )}
                      >
                        {selectedIds.has(contact.id) && (
                          <div className="w-1.5 h-1.5 bg-white rounded-full" />
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-2 sm:px-4 max-w-[200px]">
                      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                        {contact.avatar ? (
                          <img src={contact.avatar} alt={contact.name} className="w-10 h-10 rounded-full border border-outline-variant shrink-0 object-cover shadow-sm" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center font-bold shrink-0 text-sm">
                            {contact.initials}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <p className="text-sm font-bold text-on-surface truncate">{contact.name}</p>
                            {contact.hasNewActivity && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
                          </div>
                          <p className="text-xs text-on-surface-variant opacity-80 truncate">{contact.role}</p>
                        </div>
                      </div>
                    </td>
                    <td className={cn(
                      "py-4 px-4",
                      isSidebarCollapsed ? "table-cell" : "hidden md:table-cell"
                    )}>
                      <p className="text-sm font-medium text-on-surface truncate">{contact.location}</p>
                    </td>
                    <td className="py-4 px-4 hidden lg:table-cell">
                      <div className="space-y-1 max-w-[180px]">
                        <div className="flex items-center gap-2 text-on-surface-variant overflow-hidden">
                          <Mail className="w-3 h-3 opacity-60 shrink-0" />
                          <span className="text-xs truncate">{contact.email}</span>
                        </div>
                        <div className="flex items-center gap-2 text-on-surface-variant overflow-hidden">
                          <Phone className="w-3 h-3 opacity-60 shrink-0" />
                          <span className="text-xs truncate">{contact.phone}</span>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-2 sm:px-4">
                      <div className="flex flex-col gap-1">
                        <span className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider w-fit",
                          stagesData.find(s => s.label === contact.stage)?.color || "bg-surface-variant text-on-surface-variant"
                        )}>
                          <span className="max-w-[100px] truncate">{contact.stage}</span>
                        </span>
                        {contact.status && (
                          <span className="text-[9px] text-on-surface-variant font-medium uppercase tracking-tight opacity-70">
                            {contact.status}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className={cn(
                      "py-4 px-4 text-right",
                      isSidebarCollapsed ? "table-cell" : "hidden sm:table-cell"
                    )}>
                      <p className={cn(
                        "text-xs whitespace-nowrap",
                        contact.hasNewActivity ? "text-primary font-bold" : "text-on-surface-variant font-medium"
                      )}>{contact.lastSeen}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Details Modal */}
      <ContactDetailsModal 
        isOpen={selectedContact !== null}
        onClose={() => setSelectedContact(null)}
        contact={selectedContact}
      />

      {/* Tag Modal */}
      <AnimatePresence>
        {isTagModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsTagModalOpen(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-sm bg-surface-container-high rounded-3xl shadow-2xl overflow-hidden border border-outline-variant"
            >
              <div className="p-6 border-b border-outline-variant bg-surface/50 backdrop-blur-md">
                <h2 className="text-xl font-bold text-on-surface">Add Tag</h2>
                <p className="text-xs text-on-surface-variant">Tag {selectedIds.size} selected contacts</p>
              </div>

              <form onSubmit={handleBulkTag} className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest px-1">Tag Name</label>
                  <input
                    required
                    autoFocus
                    type="text"
                    value={newTag}
                    onChange={e => setNewTag(e.target.value)}
                    className="w-full h-12 px-4 rounded-xl bg-surface-container-highest border border-outline focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-on-surface"
                    placeholder="e.g. Fall2023"
                  />
                </div>

                <div className="pt-2 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setIsTagModalOpen(false)}
                    className="flex-1 h-12 rounded-xl font-bold text-on-surface-variant hover:bg-surface-variant transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-2 h-12 bg-primary text-on-primary rounded-xl font-bold shadow-lg shadow-primary/20 hover:shadow-xl transition-all"
                  >
                    Add Tag
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Contact FAB */}
      <div className="fixed bottom-44 sm:bottom-24 md:bottom-24 lg:bottom-8 right-6 lg:right-8 z-40 lg:z-50 transition-all">
        <button 
          onClick={openNewContact}
          className="flex items-center gap-2 px-6 h-14 bg-primary text-on-primary rounded-2xl shadow-xl hover:shadow-primary/25 hover:translate-y-[-2px] active:translate-y-[2px] transition-all font-bold group"
          title="Add New Contact"
        >
          <Plus className="w-6 h-6 group-hover:rotate-90 transition-transform duration-300" />
          <span className="hidden sm:inline">New Contact</span>
        </button>
      </div>
    </motion.div>
  );
}
