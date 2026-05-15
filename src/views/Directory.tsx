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
import { db, handleFirestoreError, OperationType, logActivity } from '../lib/firebase';
import { cn, sleep } from '../lib/utils';
import { useLayout } from '../App';
import { useAuth } from '../components/AuthProvider';
import { Contact, Stage } from '../types';
import { Skeleton } from '../components/ui/Skeleton';

export default function Directory() {
  const { isSidebarCollapsed, openNewContact, setSelectedContact } = useLayout();
  const { user } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [stagesData, setStagesData] = useState<Stage[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<keyof Contact>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

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
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isTagModalOpen, setIsTagModalOpen] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [showFilterMenu, setShowFilterMenu] = useState(false);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsTagModalOpen(false);
        setShowFilterMenu(false);
      }
    };
    if (isTagModalOpen || showFilterMenu) {
      window.addEventListener('keydown', handleEsc);
    }
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isTagModalOpen, showFilterMenu]);

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

    // Filter by Tags
    if (selectedTags.length > 0) {
      result = result.filter(c => 
        c.tags && selectedTags.every(tag => c.tags?.includes(tag))
      );
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
      const selectedContacts = contacts.filter(c => selectedIds.has(c.id));
      
      selectedContacts.forEach(contact => {
        const currentTags = contact.tags || [];
        if (!currentTags.includes(newTag)) {
          const updatedTags = [...currentTags, newTag];
          batch.update(doc(db, 'contacts', contact.id), {
            tags: updatedTags,
            updatedAt: new Date().toISOString(),
            updatedBy: user?.uid,
            updatedByName: user?.displayName || user?.email?.split('@')[0] || 'Unknown User'
          });

          logActivity({
            action: `added tag #${newTag} to`,
            targetId: contact.id,
            targetName: contact.name,
            targetType: 'contact',
            type: 'edit',
            description: `Tags: [${currentTags.join(', ')}] → [${updatedTags.join(', ')}]`
          });
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
  const allTags = useMemo(() => [...new Set(contacts.flatMap(c => c.tags || []))], [contacts]);

  const toggleTagFilter = (tag: string) => {
    setSelectedTags(prev => 
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const clearFilters = () => {
    setSearchQuery('');
    setFilterStage('All');
    setFilterRole('All');
    setSelectedTags([]);
  };

  const hasActiveFilters = searchQuery !== '' || filterStage !== 'All' || filterRole !== 'All' || selectedTags.length > 0;

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

  const handleBulkEmail = () => {
    if (selectedIds.size === 0) return;
    const selectedContacts = contacts.filter(c => selectedIds.has(c.id));
    const emails = selectedContacts.map(c => c.email).filter(Boolean).join(',');
    if (emails) {
      window.location.href = `mailto:${emails}`;
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedIds.size} contacts?`)) return;

    try {
      const batch = writeBatch(db);
      const selectedContacts = contacts.filter(c => selectedIds.has(c.id));

      selectedContacts.forEach(contact => {
        batch.delete(doc(db, 'contacts', contact.id));
        
        logActivity({
          action: 'deleted contact',
          targetId: contact.id,
          targetName: contact.name,
          targetType: 'contact',
          type: 'alert'
        });
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
            <Skeleton className="h-10 w-24 rounded-xl" />
          </div>
        </div>
        <div className="flex gap-2 mb-2">
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-6 w-14 rounded-full" />
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
      className="px-4 sm:px-6 lg:px-10 py-6 sm:py-8 lg:py-10 flex flex-col gap-4 sm:gap-6 h-full min-w-0 max-w-[1600px] mx-auto w-full"
    >
      {/* Header Info */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-normal text-on-background mb-1">Contacts</h2>
        </div>
        <div className="flex flex-wrap gap-3 w-full md:w-auto items-center">
          <button 
            onClick={openNewContact}
            className="h-10 px-4 bg-primary text-on-primary rounded-xl font-bold flex items-center gap-2 shadow-sm hover:translate-y-[-1px] transition-all"
          >
            <Plus className="w-4 h-4" />
            <span className="text-sm">New Contact</span>
          </button>
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
          <div className="flex flex-wrap gap-2 relative">
            <button 
              onClick={() => setShowFilterMenu(!showFilterMenu)}
              className={cn(
                "p-2 rounded-full hover:bg-surface-variant text-on-surface-variant transition-colors flex items-center gap-2",
                hasActiveFilters && "text-primary bg-primary/5"
              )}
              title="Filters"
            >
              <Filter className="w-5 h-5" />
              {hasActiveFilters && (
                <span className="flex-none w-2 h-2 rounded-full bg-primary" />
              )}
            </button>

            <AnimatePresence>
              {showFilterMenu && (
                <>
                  <div 
                    className="fixed inset-0 z-30" 
                    onClick={() => setShowFilterMenu(false)}
                  />
                  <motion.div 
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute top-12 right-0 z-40 bg-surface-container-high border border-outline-variant rounded-2xl shadow-2xl p-4 min-w-[240px] space-y-4"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Filters</span>
                      {hasActiveFilters && (
                        <button 
                          onClick={clearFilters}
                          className="text-[10px] font-bold text-primary hover:underline"
                        >
                          Clear all
                        </button>
                      )}
                    </div>

                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-on-surface-variant uppercase tracking-wider px-1">Stage</label>
                        <select 
                          value={filterStage}
                          onChange={(e) => setFilterStage(e.target.value)}
                          className="w-full h-10 px-3 rounded-xl border border-outline bg-surface-container-highest text-xs font-bold text-on-surface-variant outline-none focus:border-primary cursor-pointer"
                        >
                          {filterStages.map(s => <option key={s} value={s}>{s === 'All' ? 'All Stages' : s}</option>)}
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-on-surface-variant uppercase tracking-wider px-1">Group</label>
                        <select 
                          value={filterRole}
                          onChange={(e) => setFilterRole(e.target.value)}
                          className="w-full h-10 px-3 rounded-xl border border-outline bg-surface-container-highest text-xs font-bold text-on-surface-variant outline-none focus:border-primary cursor-pointer"
                        >
                          {filterRoles.map(r => <option key={r} value={r}>{r === 'All' ? 'All Groups' : r}</option>)}
                        </select>
                      </div>
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Tag Chips Filter */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-2 overflow-x-auto pb-1 max-h-24 no-scrollbar">
          {allTags.map(tag => (
            <button
              key={tag}
              onClick={() => toggleTagFilter(tag)}
              className={cn(
                "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border transition-all shrink-0",
                selectedTags.includes(tag) 
                  ? "bg-primary text-on-primary border-primary shadow-sm shadow-primary/20" 
                  : "bg-surface-container-high text-on-surface-variant border-outline/30 hover:border-outline"
              )}
            >
              #{tag}
            </button>
          ))}
        </div>
      )}

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
                  <button 
                    onClick={handleBulkEmail}
                    className="hover:text-primary transition-colors p-1.5 rounded-full hover:bg-surface-container-highest" 
                    title="Email Selected"
                  >
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
        <div className="flex-1 overflow-auto no-scrollbar pb-32">
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
                  <th className="py-4 px-3 sm:px-4 w-12 text-center"></th>
                  <th 
                    className="py-4 px-2 text-xs font-black uppercase tracking-wider cursor-pointer hover:text-on-surface group whitespace-nowrap"
                    onClick={() => handleSort('name')}
                  >
                    Name <ArrowDown className={cn(
                      "w-3 h-3 inline-block ml-1 transition-all",
                      sortField === 'name' ? (sortDirection === 'desc' ? 'rotate-180' : 'opacity-100') : 'opacity-0 group-hover:opacity-100'
                    )} />
                  </th>
                  <th 
                    className={cn(
                      "py-4 px-4 text-xs font-black uppercase tracking-wider cursor-pointer hover:text-on-surface group whitespace-nowrap",
                      isSidebarCollapsed ? "table-cell" : "hidden md:table-cell"
                    )}
                    onClick={() => handleSort('location')}
                  >
                    Location <ArrowDown className={cn(
                      "w-3 h-3 inline-block ml-1 transition-all",
                      sortField === 'location' ? (sortDirection === 'desc' ? 'rotate-180' : 'opacity-100') : 'opacity-0 group-hover:opacity-100'
                    )} />
                  </th>
                  <th 
                    className={cn(
                      "py-4 px-4 text-xs font-black uppercase tracking-wider cursor-pointer hover:text-on-surface group whitespace-nowrap",
                      "hidden lg:table-cell"
                    )}
                    onClick={() => handleSort('email')}
                  >
                    Contact Info <ArrowDown className={cn(
                      "w-3 h-3 inline-block ml-1 transition-all",
                      sortField === 'email' ? (sortDirection === 'desc' ? 'rotate-180' : 'opacity-100') : 'opacity-0 group-hover:opacity-100'
                    )} />
                  </th>
                  <th 
                    className="py-4 px-2 text-xs font-black uppercase tracking-wider cursor-pointer hover:text-on-surface group w-32"
                    onClick={() => handleSort('stage')}
                  >
                    Stage <ArrowDown className={cn(
                      "w-3 h-3 inline-block ml-1 transition-all",
                      sortField === 'stage' ? (sortDirection === 'desc' ? 'rotate-180' : 'opacity-100') : 'opacity-0 group-hover:opacity-100'
                    )} />
                  </th>
                  <th 
                    className={cn(
                      "py-4 px-4 sm:px-6 text-xs font-black uppercase tracking-wider text-right w-36 cursor-pointer hover:text-on-surface group",
                      isSidebarCollapsed ? "table-cell" : "hidden sm:table-cell"
                    )}
                    onClick={() => handleSort('lastSeen')}
                  >
                    Last Seen <ArrowDown className={cn(
                      "w-3 h-3 inline-block ml-1 transition-all",
                      sortField === 'lastSeen' ? (sortDirection === 'desc' ? 'rotate-180' : 'opacity-100') : 'opacity-0 group-hover:opacity-100'
                    )} />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/30 bg-surface-container-lowest">
                {filteredAndSortedContacts.map((contact) => (
                    <tr 
                    key={contact.id} 
                    onClick={() => setSelectedContact(contact)}
                    className={cn(
                      "hover:bg-surface-container-low transition-colors group cursor-pointer",
                      selectedIds.has(contact.id) && "bg-primary/5"
                    )}
                  >
                    <td className="py-4 px-3 sm:px-4">
                      <div 
                        onClick={(e) => toggleSelect(contact.id, e)}
                        className={cn(
                          "w-4 h-4 rounded border-2 transition-colors flex items-center justify-center mx-auto",
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
                    <td className="py-4 px-2 max-w-[200px]">
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
                          </div>
                          <p className="text-[10px] text-on-surface-variant font-bold uppercase tracking-tight opacity-70 truncate">{contact.role}</p>
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
                    <td className="py-4 px-2">
                      <div className="flex flex-col gap-1">
                        <span className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider w-fit",
                          stagesData.find(s => s.label === contact.stage)?.color || "bg-surface-variant text-on-surface-variant"
                        )}>
                          <span className="max-w-[100px] truncate">{contact.stage}</span>
                        </span>
                      </div>
                    </td>
                    <td className={cn(
                      "py-4 px-4 sm:px-6 text-right",
                      isSidebarCollapsed ? "table-cell" : "hidden sm:table-cell"
                    )}>
                      <p className="text-xs whitespace-nowrap text-on-surface-variant font-medium">{contact.lastSeen}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

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
    </motion.div>
  );
}
