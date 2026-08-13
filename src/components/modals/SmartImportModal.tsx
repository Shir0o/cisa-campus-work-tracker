import React, { useState } from 'react';
import {
  Wand2,
  Sparkles,
  Check,
  X,
  User,
  MessageSquare,
  FileText,
  Edit2,
  Loader2,
  AlertCircle,
  CheckSquare,
  Square,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { motion } from 'motion/react';
import { collection, addDoc, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, logActivity } from '../../lib/firebase';
import { useAuth } from '../AuthProvider';
import {
  ParsedContactItem,
  ParsedInteractionItem,
  ParsedDiscussionItem,
  SmartImportParsedData,
} from '../../types';

interface SmartImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete?: (result: { contactsCount: number; interactionsCount: number; discussionsCount: number }) => void;
}

type Step = 'input' | 'parsing' | 'preview' | 'importing' | 'success';

const SAMPLE_TEXT = `Met Jane Smith (freshman CS major, jane.smith@email.com, 555-0123) at the welcome booth. She is interested in joining Bible study and looking for community.
Had coffee with her on 2026-08-03 at Starbucks. Discussed her transition to campus life, answered questions about group meetings, and gave her a welcome pack.

Group Meeting Notes - Fall Kickoff Strategy
Audience: team
We met with team leaders to map out Welcome Week. Focus areas:
1. Dorm outreach teams
2. Friday night BBQ setup
3. Follow-up strategy for new contacts`;

export default function SmartImportModal({ isOpen, onClose, onImportComplete }: SmartImportModalProps) {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>('input');
  const [inputText, setInputText] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Parsed items with local selection and editing state
  const [parsedContacts, setParsedContacts] = useState<ParsedContactItem[]>([]);
  const [parsedInteractions, setParsedInteractions] = useState<ParsedInteractionItem[]>([]);
  const [parsedDiscussions, setParsedDiscussions] = useState<ParsedDiscussionItem[]>([]);

  // Expanded edit tracking
  const [editingItemKey, setEditingItemKey] = useState<string | null>(null);

  // Active tab in preview step
  const [activeTab, setActiveTab] = useState<'all' | 'contacts' | 'interactions' | 'discussions'>('all');

  // Summary counts post-import
  const [importSummary, setImportSummary] = useState({ contactsCount: 0, interactionsCount: 0, discussionsCount: 0 });

  if (!isOpen) return null;

  const handleReset = () => {
    setStep('input');
    setInputText('');
    setError(null);
    setParsedContacts([]);
    setParsedInteractions([]);
    setParsedDiscussions([]);
    setEditingItemKey(null);
    setActiveTab('all');
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  const handleParse = async () => {
    if (!inputText.trim()) {
      setError('Please paste or type text to import.');
      return;
    }

    setError(null);
    setStep('parsing');

    try {
      let token: string | undefined;
      if (user) {
        try {
          token = await user.getIdToken();
        } catch {
          // Ignore auth token errors in test/demo mode
        }
      }

      const response = await fetch('/api/smart-import/parse', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ text: inputText }),
      });

      if (!response.ok) {
        let errorMsg = `Server error (HTTP ${response.status} ${response.statusText || ''})`.trim();
        try {
          const errorData = await response.json();
          if (errorData.error) {
            errorMsg = errorData.error;
          }
        } catch {
          if (response.status === 404) {
            errorMsg = 'Smart Import endpoint not found (HTTP 404). Please ensure the backend server is deployed.';
          } else if (response.status === 524 || response.status === 504) {
            errorMsg = 'AI Smart Import request timed out (HTTP 524). Please try pasting a smaller chunk of text.';
          }
        }
        throw new Error(errorMsg);
      }

      const resData = await response.json();
      if (!resData.success) {
        throw new Error(resData.error || 'Failed to parse text with AI');
      }

      const data: SmartImportParsedData = resData.data || { contacts: [], interactions: [], discussions: [] };

      // Initialize selected flag as true for all parsed items
      setParsedContacts((data.contacts || []).map((c) => ({ ...c, selected: true })));
      setParsedInteractions((data.interactions || []).map((i) => ({ ...i, selected: true })));
      setParsedDiscussions((data.discussions || []).map((d) => ({ ...d, selected: true })));

      setStep('preview');
    } catch (err: any) {
      console.error('Smart Import Parse Error:', err);
      setError(err.message || 'Error communicating with AI parser.');
      setStep('input');
    }
  };

  const toggleSelectAll = (select: boolean) => {
    setParsedContacts((prev) => prev.map((c) => ({ ...c, selected: select })));
    setParsedInteractions((prev) => prev.map((i) => ({ ...i, selected: select })));
    setParsedDiscussions((prev) => prev.map((d) => ({ ...d, selected: select })));
  };

  const selectedContactsCount = parsedContacts.filter((c) => c.selected).length;
  const selectedInteractionsCount = parsedInteractions.filter((i) => i.selected).length;
  const selectedDiscussionsCount = parsedDiscussions.filter((d) => d.selected).length;
  const totalSelected = selectedContactsCount + selectedInteractionsCount + selectedDiscussionsCount;

  const handleConfirmImport = async () => {
    if (totalSelected === 0) {
      setError('Please select at least one item to import.');
      return;
    }

    setError(null);
    setStep('importing');

    let cCount = 0;
    let iCount = 0;
    let dCount = 0;

    try {
      // Map temporary contact IDs or matched IDs to real Firestore contact IDs
      const tempIdToRealIdMap: Record<string, string> = {};

      // 1. Process Contacts
      for (const contact of parsedContacts) {
        if (!contact.selected) continue;

        if (contact.matchedContactId) {
          // Linked to existing contact
          tempIdToRealIdMap[contact.tempId] = contact.matchedContactId;
          if (contact.matchedContactId) {
            tempIdToRealIdMap[contact.matchedContactId] = contact.matchedContactId;
          }
        } else {
          // Create new contact in Firestore
          const newContactRef = doc(collection(db, 'contacts'));
          const initials = contact.name
            ? contact.name
                .split(' ')
                .map((n) => n[0])
                .join('')
                .slice(0, 2)
                .toUpperCase()
            : '??';

          const newContactData = {
            name: contact.name || 'Unnamed Contact',
            role: contact.role || 'Student',
            location: '',
            email: contact.email || '',
            phone: contact.phone || '',
            stage: contact.stage || 'lead',
            lastSeen: new Date().toISOString().split('T')[0],
            initials,
            notes: contact.notes || '',
            tags: contact.tags || [],
            spiritualBackground: contact.spiritualBackground || '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            createdBy: user?.uid || 'system',
            createdByName: user?.displayName || 'Smart Import',
          };

          await setDoc(newContactRef, newContactData);
          tempIdToRealIdMap[contact.tempId] = newContactRef.id;
          cCount++;

          if (user) {
            logActivity({
              action: 'created contact via Smart Import',
              targetId: newContactRef.id,
              targetName: newContactData.name,
              targetType: 'contact',
              type: 'create',
            });
          }
        }
      }

      // 2. Process Interactions
      for (const interaction of parsedInteractions) {
        if (!interaction.selected) continue;

        // Resolve contactId from tempId or matched ID
        let targetContactId = interaction.contactId || null;
        if (!targetContactId && interaction.contactRef && tempIdToRealIdMap[interaction.contactRef]) {
          targetContactId = tempIdToRealIdMap[interaction.contactRef];
        }

        // If no contact mapped, look for matching contact by name among imported/parsed
        if (!targetContactId && interaction.contactName) {
          const found = parsedContacts.find(
            (c) => c.name.toLowerCase() === interaction.contactName?.toLowerCase()
          );
          if (found && tempIdToRealIdMap[found.tempId]) {
            targetContactId = tempIdToRealIdMap[found.tempId];
          }
        }

        if (targetContactId) {
          const interactionRef = collection(db, 'contacts', targetContactId, 'interactions');
          const interactionData = {
            contactId: targetContactId,
            contactName: interaction.contactName || 'Contact',
            content: interaction.content,
            dateTime: interaction.dateTime || new Date().toISOString(),
            type: interaction.type || 'note',
            userId: user?.uid || 'system',
            userName: user?.displayName || 'Smart Import',
            createdAt: new Date().toISOString(),
          };

          const docRef = await addDoc(interactionRef, interactionData);
          iCount++;

          if (user) {
            logActivity({
              action: 'logged interaction via Smart Import',
              targetId: docRef.id,
              targetName: interaction.contactName || 'Interaction',
              targetType: 'interaction',
              type: 'create',
            });
          }
        }
      }

      // 3. Process Discussions (Board Docs)
      for (const discussion of parsedDiscussions) {
        if (!discussion.selected) continue;

        const boardDocRef = doc(collection(db, 'board_docs'));
        const nowIso = new Date().toISOString();
        const dateStr = nowIso.split('T')[0];

        const boardDocData = {
          title: discussion.title || 'Imported Discussion',
          audience: discussion.audience || 'team',
          md: discussion.content || '',
          tags: discussion.tags || [],
          date: dateStr,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          deletedAt: null,
          authorName: user?.displayName || 'Smart Import',
          authorId: user?.uid || 'system',
        };

        await setDoc(boardDocRef, boardDocData);
        dCount++;

        if (user) {
          logActivity({
            action: 'created discussion doc via Smart Import',
            targetId: boardDocRef.id,
            targetName: discussion.title,
            targetType: 'comment',
            type: 'create',
          });
        }
      }

      const summary = { contactsCount: cCount, interactionsCount: iCount, discussionsCount: dCount };
      setImportSummary(summary);
      setStep('success');

      if (onImportComplete) {
        onImportComplete(summary);
      }
    } catch (err: any) {
      console.error('Smart Import Commit Error:', err);
      setError(err.message || 'Failed to save imported items to database.');
      setStep('preview');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-surface border border-outline-variant rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden text-on-surface"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-outline-variant flex items-center justify-between bg-surface-container-low">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
              <Wand2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-serif text-xl font-semibold">Smart Text Import</h2>
              <p className="text-xs text-on-surface-variant">
                Paste notes, emails, or chat logs — Gemini AI parses contacts, 1-on-1s, and discussions with a dry-run review.
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 text-on-surface-variant hover:text-on-surface hover:bg-surface-variant rounded-full transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="p-4 rounded-xl bg-error/10 border border-error/20 text-error text-sm flex items-center gap-3">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* STEP 1: INPUT */}
          {step === 'input' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-on-surface">
                  Paste unstructured text below
                </label>
                <button
                  onClick={() => setInputText(SAMPLE_TEXT)}
                  className="text-xs text-primary hover:underline flex items-center gap-1 font-medium"
                >
                  <Sparkles className="w-3.5 h-3.5" /> Load sample text
                </button>
              </div>

              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Paste roster lists, email exchanges, text message logs, or meeting notes here..."
                rows={10}
                className="w-full p-4 rounded-xl border border-outline-variant bg-surface-container-lowest focus:border-primary focus:ring-1 focus:ring-primary outline-none text-sm font-mono leading-relaxed resize-y"
              />

              <div className="p-4 rounded-xl bg-surface-container-high border border-outline-variant text-xs text-on-surface-variant space-y-1">
                <p className="font-semibold text-on-surface flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-primary" /> What Gemini AI extracts:
                </p>
                <ul className="list-disc list-inside space-y-1 pl-1">
                  <li><b>Contacts:</b> Names, emails, phones, stages, tags, spiritual background, & matching existing contacts.</li>
                  <li><b>Interactions:</b> Dates, 1-on-1 conversation notes, call/coffee type, & contact linkages.</li>
                  <li><b>Discussions:</b> Group meeting notes, strategy topics, board documents, & audience settings.</li>
                </ul>
              </div>
            </div>
          )}

          {/* STEP 2: PARSING LOADING */}
          {step === 'parsing' && (
            <div className="py-16 text-center space-y-4">
              <div className="relative inline-flex items-center justify-center">
                <Loader2 className="w-12 h-12 text-primary animate-spin" />
                <Sparkles className="w-5 h-5 text-primary absolute" />
              </div>
              <h3 className="font-serif text-lg font-medium">Parsing text with Gemini AI...</h3>
              <p className="text-sm text-on-surface-variant max-w-md mx-auto">
                Extracting people, conversation logs, and discussion documents into a dry-run preview for your confirmation.
              </p>
            </div>
          )}

          {/* STEP 3: DRY RUN PREVIEW */}
          {step === 'preview' && (
            <div className="space-y-6">
              {/* Summary Bar & Selection Toggle */}
              <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-surface-container-high border border-outline-variant">
                <div className="flex items-center gap-4 text-sm font-medium">
                  <span className="flex items-center gap-1.5 text-primary">
                    <User className="w-4 h-4" /> {parsedContacts.length} Contacts
                  </span>
                  <span className="flex items-center gap-1.5 text-secondary">
                    <MessageSquare className="w-4 h-4" /> {parsedInteractions.length} Interactions
                  </span>
                  <span className="flex items-center gap-1.5 text-tertiary">
                    <FileText className="w-4 h-4" /> {parsedDiscussions.length} Discussions
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleSelectAll(true)}
                    className="px-3 py-1.5 rounded-lg border border-outline-variant text-xs font-medium hover:bg-surface-variant transition-colors"
                  >
                    Select All
                  </button>
                  <button
                    onClick={() => toggleSelectAll(false)}
                    className="px-3 py-1.5 rounded-lg border border-outline-variant text-xs font-medium hover:bg-surface-variant transition-colors"
                  >
                    Deselect All
                  </button>
                </div>
              </div>

              {/* Filter Tabs */}
              <div className="flex border-b border-outline-variant gap-2 text-sm font-medium">
                <button
                  onClick={() => setActiveTab('all')}
                  className={`pb-2 px-3 border-b-2 transition-colors ${
                    activeTab === 'all'
                      ? 'border-primary text-primary font-semibold'
                      : 'border-transparent text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  All Items ({parsedContacts.length + parsedInteractions.length + parsedDiscussions.length})
                </button>
                <button
                  onClick={() => setActiveTab('contacts')}
                  className={`pb-2 px-3 border-b-2 transition-colors ${
                    activeTab === 'contacts'
                      ? 'border-primary text-primary font-semibold'
                      : 'border-transparent text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  Contacts ({parsedContacts.length})
                </button>
                <button
                  onClick={() => setActiveTab('interactions')}
                  className={`pb-2 px-3 border-b-2 transition-colors ${
                    activeTab === 'interactions'
                      ? 'border-primary text-primary font-semibold'
                      : 'border-transparent text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  Interactions ({parsedInteractions.length})
                </button>
                <button
                  onClick={() => setActiveTab('discussions')}
                  className={`pb-2 px-3 border-b-2 transition-colors ${
                    activeTab === 'discussions'
                      ? 'border-primary text-primary font-semibold'
                      : 'border-transparent text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  Discussions ({parsedDiscussions.length})
                </button>
              </div>

              {/* Items List */}
              <div className="space-y-4">
                {/* CONTACTS SECTION */}
                {(activeTab === 'all' || activeTab === 'contacts') && parsedContacts.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-on-surface-variant flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-primary" /> Contacts ({parsedContacts.length})
                    </h4>
                    {parsedContacts.map((contact) => {
                      const itemKey = `c_${contact.tempId}`;
                      const isEditing = editingItemKey === itemKey;

                      return (
                        <div
                          key={contact.tempId}
                          className={`p-4 rounded-xl border transition-colors ${
                            contact.selected
                              ? 'border-primary/40 bg-primary/5'
                              : 'border-outline-variant bg-surface opacity-75'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3 flex-1 min-w-0">
                              <button
                                type="button"
                                onClick={() =>
                                  setParsedContacts((prev) =>
                                    prev.map((c) => (c.tempId === contact.tempId ? { ...c, selected: !c.selected } : c))
                                  )
                                }
                                className="mt-0.5 text-primary focus:outline-none"
                              >
                                {contact.selected ? (
                                  <CheckSquare className="w-5 h-5 text-primary" />
                                ) : (
                                  <Square className="w-5 h-5 text-on-surface-variant" />
                                )}
                              </button>

                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-semibold text-sm text-on-surface">{contact.name}</span>
                                  {contact.matchedContactId ? (
                                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                      Matches existing: {contact.matchedContactName || contact.matchedContactId}
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                      New Contact
                                    </span>
                                  )}
                                  <span className="px-2 py-0.5 rounded-full text-xs bg-surface-container-high text-on-surface-variant capitalize">
                                    Stage: {contact.stage || 'lead'}
                                  </span>
                                </div>

                                <div className="text-xs text-on-surface-variant mt-1 space-x-3">
                                  {contact.email && <span>Email: {contact.email}</span>}
                                  {contact.phone && <span>Phone: {contact.phone}</span>}
                                  {contact.role && <span>Role: {contact.role}</span>}
                                </div>

                                {contact.notes && (
                                  <p className="text-xs text-on-surface-variant/80 mt-1 italic line-clamp-2">
                                    "{contact.notes}"
                                  </p>
                                )}
                              </div>
                            </div>

                            <button
                              onClick={() => setEditingItemKey(isEditing ? null : itemKey)}
                              className="p-1.5 text-on-surface-variant hover:text-on-surface rounded-lg hover:bg-surface-variant transition-colors"
                              title="Edit item details"
                            >
                              {isEditing ? <ChevronUp className="w-4 h-4" /> : <Edit2 className="w-4 h-4" />}
                            </button>
                          </div>

                          {/* Editable Form */}
                          {isEditing && (
                            <div className="mt-4 pt-4 border-t border-outline-variant grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                              <div>
                                <label className="block text-on-surface-variant mb-1 font-medium">Name</label>
                                <input
                                  type="text"
                                  value={contact.name}
                                  onChange={(e) =>
                                    setParsedContacts((prev) =>
                                      prev.map((c) =>
                                        c.tempId === contact.tempId ? { ...c, name: e.target.value } : c
                                      )
                                    )
                                  }
                                  className="w-full p-2 rounded-lg border border-outline-variant bg-surface text-on-surface"
                                />
                              </div>
                              <div>
                                <label className="block text-on-surface-variant mb-1 font-medium">Email</label>
                                <input
                                  type="email"
                                  value={contact.email || ''}
                                  onChange={(e) =>
                                    setParsedContacts((prev) =>
                                      prev.map((c) =>
                                        c.tempId === contact.tempId ? { ...c, email: e.target.value } : c
                                      )
                                    )
                                  }
                                  className="w-full p-2 rounded-lg border border-outline-variant bg-surface text-on-surface"
                                />
                              </div>
                              <div>
                                <label className="block text-on-surface-variant mb-1 font-medium">Phone</label>
                                <input
                                  type="text"
                                  value={contact.phone || ''}
                                  onChange={(e) =>
                                    setParsedContacts((prev) =>
                                      prev.map((c) =>
                                        c.tempId === contact.tempId ? { ...c, phone: e.target.value } : c
                                      )
                                    )
                                  }
                                  className="w-full p-2 rounded-lg border border-outline-variant bg-surface text-on-surface"
                                />
                              </div>
                              <div>
                                <label className="block text-on-surface-variant mb-1 font-medium">Stage</label>
                                <select
                                  value={contact.stage || 'lead'}
                                  onChange={(e) =>
                                    setParsedContacts((prev) =>
                                      prev.map((c) =>
                                        c.tempId === contact.tempId ? { ...c, stage: e.target.value } : c
                                      )
                                    )
                                  }
                                  className="w-full p-2 rounded-lg border border-outline-variant bg-surface text-on-surface cursor-pointer"
                                >
                                  <option value="lead">Lead</option>
                                  <option value="contact">Contact</option>
                                  <option value="follow-up">Follow-up</option>
                                  <option value="connected">Connected</option>
                                  <option value="active">Active</option>
                                </select>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* INTERACTIONS SECTION */}
                {(activeTab === 'all' || activeTab === 'interactions') && parsedInteractions.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-on-surface-variant flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5 text-secondary" /> Interactions / 1-on-1s ({parsedInteractions.length})
                    </h4>
                    {parsedInteractions.map((interaction) => {
                      const itemKey = `i_${interaction.tempId}`;
                      const isEditing = editingItemKey === itemKey;

                      return (
                        <div
                          key={interaction.tempId}
                          className={`p-4 rounded-xl border transition-colors ${
                            interaction.selected
                              ? 'border-secondary/40 bg-secondary/5'
                              : 'border-outline-variant bg-surface opacity-75'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3 flex-1 min-w-0">
                              <button
                                type="button"
                                onClick={() =>
                                  setParsedInteractions((prev) =>
                                    prev.map((i) => (i.tempId === interaction.tempId ? { ...i, selected: !i.selected } : i))
                                  )
                                }
                                className="mt-0.5 text-secondary focus:outline-none"
                              >
                                {interaction.selected ? (
                                  <CheckSquare className="w-5 h-5 text-secondary" />
                                ) : (
                                  <Square className="w-5 h-5 text-on-surface-variant" />
                                )}
                              </button>

                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-semibold text-sm text-on-surface">
                                    {interaction.contactName || 'Unlinked Interaction'}
                                  </span>
                                  <span className="px-2 py-0.5 rounded-full text-xs bg-surface-container-high text-on-surface-variant capitalize">
                                    Type: {interaction.type || 'note'}
                                  </span>
                                  {interaction.dateTime && (
                                    <span className="text-xs text-on-surface-variant font-mono">
                                      {interaction.dateTime}
                                    </span>
                                  )}
                                </div>

                                <p className="text-xs text-on-surface mt-1 leading-relaxed whitespace-pre-wrap">
                                  {interaction.content}
                                </p>
                              </div>
                            </div>

                            <button
                              onClick={() => setEditingItemKey(isEditing ? null : itemKey)}
                              className="p-1.5 text-on-surface-variant hover:text-on-surface rounded-lg hover:bg-surface-variant transition-colors"
                              title="Edit item details"
                            >
                              {isEditing ? <ChevronUp className="w-4 h-4" /> : <Edit2 className="w-4 h-4" />}
                            </button>
                          </div>

                          {/* Editable Form */}
                          {isEditing && (
                            <div className="mt-4 pt-4 border-t border-outline-variant space-y-3 text-xs">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-on-surface-variant mb-1 font-medium">Contact Name</label>
                                  <input
                                    type="text"
                                    value={interaction.contactName || ''}
                                    onChange={(e) =>
                                      setParsedInteractions((prev) =>
                                        prev.map((i) =>
                                          i.tempId === interaction.tempId ? { ...i, contactName: e.target.value } : i
                                        )
                                      )
                                    }
                                    className="w-full p-2 rounded-lg border border-outline-variant bg-surface text-on-surface"
                                  />
                                </div>
                                <div>
                                  <label className="block text-on-surface-variant mb-1 font-medium">Type</label>
                                  <select
                                    value={interaction.type || 'note'}
                                    onChange={(e) =>
                                      setParsedInteractions((prev) =>
                                        prev.map((i) =>
                                          i.tempId === interaction.tempId ? { ...i, type: e.target.value } : i
                                        )
                                      )
                                    }
                                    className="w-full p-2 rounded-lg border border-outline-variant bg-surface text-on-surface cursor-pointer"
                                  >
                                    <option value="coffee">Coffee</option>
                                    <option value="call">Call</option>
                                    <option value="text">Text</option>
                                    <option value="meeting">Meeting</option>
                                    <option value="note">Note</option>
                                  </select>
                                </div>
                              </div>
                              <div>
                                <label className="block text-on-surface-variant mb-1 font-medium">Content / Summary</label>
                                <textarea
                                  value={interaction.content}
                                  onChange={(e) =>
                                    setParsedInteractions((prev) =>
                                      prev.map((i) =>
                                        i.tempId === interaction.tempId ? { ...i, content: e.target.value } : i
                                      )
                                    )
                                  }
                                  rows={3}
                                  className="w-full p-2 rounded-lg border border-outline-variant bg-surface text-on-surface"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* DISCUSSIONS SECTION */}
                {(activeTab === 'all' || activeTab === 'discussions') && parsedDiscussions.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-on-surface-variant flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-tertiary" /> Discussions / Board Notes ({parsedDiscussions.length})
                    </h4>
                    {parsedDiscussions.map((discussion) => {
                      const itemKey = `d_${discussion.tempId}`;
                      const isEditing = editingItemKey === itemKey;

                      return (
                        <div
                          key={discussion.tempId}
                          className={`p-4 rounded-xl border transition-colors ${
                            discussion.selected
                              ? 'border-tertiary/40 bg-tertiary/5'
                              : 'border-outline-variant bg-surface opacity-75'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3 flex-1 min-w-0">
                              <button
                                type="button"
                                onClick={() =>
                                  setParsedDiscussions((prev) =>
                                    prev.map((d) => (d.tempId === discussion.tempId ? { ...d, selected: !d.selected } : d))
                                  )
                                }
                                className="mt-0.5 text-tertiary focus:outline-none"
                              >
                                {discussion.selected ? (
                                  <CheckSquare className="w-5 h-5 text-tertiary" />
                                ) : (
                                  <Square className="w-5 h-5 text-on-surface-variant" />
                                )}
                              </button>

                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-semibold text-sm text-on-surface">{discussion.title}</span>
                                  <span className="px-2 py-0.5 rounded-full text-xs bg-surface-container-high text-on-surface-variant capitalize">
                                    Audience: {discussion.audience || 'team'}
                                  </span>
                                </div>

                                <p className="text-xs text-on-surface-variant/90 mt-1 line-clamp-3 font-mono">
                                  {discussion.content}
                                </p>
                              </div>
                            </div>

                            <button
                              onClick={() => setEditingItemKey(isEditing ? null : itemKey)}
                              className="p-1.5 text-on-surface-variant hover:text-on-surface rounded-lg hover:bg-surface-variant transition-colors"
                              title="Edit item details"
                            >
                              {isEditing ? <ChevronUp className="w-4 h-4" /> : <Edit2 className="w-4 h-4" />}
                            </button>
                          </div>

                          {/* Editable Form */}
                          {isEditing && (
                            <div className="mt-4 pt-4 border-t border-outline-variant space-y-3 text-xs">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-on-surface-variant mb-1 font-medium">Title</label>
                                  <input
                                    type="text"
                                    value={discussion.title}
                                    onChange={(e) =>
                                      setParsedDiscussions((prev) =>
                                        prev.map((d) =>
                                          d.tempId === discussion.tempId ? { ...d, title: e.target.value } : d
                                        )
                                      )
                                    }
                                    className="w-full p-2 rounded-lg border border-outline-variant bg-surface text-on-surface"
                                  />
                                </div>
                                <div>
                                  <label className="block text-on-surface-variant mb-1 font-medium">Audience</label>
                                  <select
                                    value={discussion.audience || 'team'}
                                    onChange={(e) =>
                                      setParsedDiscussions((prev) =>
                                        prev.map((d) =>
                                          d.tempId === discussion.tempId
                                            ? { ...d, audience: e.target.value as any }
                                            : d
                                        )
                                      )
                                    }
                                    className="w-full p-2 rounded-lg border border-outline-variant bg-surface text-on-surface cursor-pointer"
                                  >
                                    <option value="team">Team (Full-timers)</option>
                                    <option value="trainees">Trainees</option>
                                    <option value="everyone">Everyone</option>
                                  </select>
                                </div>
                              </div>
                              <div>
                                <label className="block text-on-surface-variant mb-1 font-medium">Markdown Content</label>
                                <textarea
                                  value={discussion.content}
                                  onChange={(e) =>
                                    setParsedDiscussions((prev) =>
                                      prev.map((d) =>
                                        d.tempId === discussion.tempId ? { ...d, content: e.target.value } : d
                                      )
                                    )
                                  }
                                  rows={4}
                                  className="w-full p-2 rounded-lg border border-outline-variant bg-surface text-on-surface font-mono"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 4: IMPORTING */}
          {step === 'importing' && (
            <div className="py-16 text-center space-y-4">
              <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto" />
              <h3 className="font-serif text-lg font-medium">Writing items to database...</h3>
              <p className="text-sm text-on-surface-variant">
                Saving confirmed contacts, interaction logs, and discussion docs into Firestore.
              </p>
            </div>
          )}

          {/* STEP 5: SUCCESS */}
          {step === 'success' && (
            <div className="py-12 text-center space-y-4">
              <div className="w-16 h-16 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto">
                <Check className="w-8 h-8" />
              </div>
              <h3 className="font-serif text-2xl font-bold">Import Completed!</h3>
              <p className="text-sm text-on-surface-variant max-w-md mx-auto">
                Successfully added {importSummary.contactsCount} contacts, logged {importSummary.interactionsCount} interactions, and created {importSummary.discussionsCount} discussion docs.
              </p>
              <div className="pt-4">
                <button
                  onClick={handleClose}
                  className="px-6 py-2.5 rounded-full bg-primary text-on-primary font-medium text-sm hover:opacity-90 transition-opacity"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {step !== 'importing' && step !== 'success' && (
          <div className="px-6 py-4 border-t border-outline-variant bg-surface-container-low flex items-center justify-between">
            {step === 'preview' ? (
              <button
                onClick={() => setStep('input')}
                className="px-4 py-2 rounded-full border border-outline-variant text-sm font-medium text-on-surface hover:bg-surface-variant transition-colors"
              >
                Back to text
              </button>
            ) : (
              <button
                onClick={handleClose}
                className="px-4 py-2 rounded-full border border-outline-variant text-sm font-medium text-on-surface hover:bg-surface-variant transition-colors"
              >
                Cancel
              </button>
            )}

            {step === 'input' && (
              <button
                onClick={handleParse}
                disabled={!inputText.trim()}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-primary text-on-primary font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                <Wand2 className="w-4 h-4" /> Parse with Gemini AI
              </button>
            )}

            {step === 'preview' && (
              <button
                onClick={handleConfirmImport}
                disabled={totalSelected === 0}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-primary text-on-primary font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                <Check className="w-4 h-4" /> Confirm & Import ({totalSelected} Selected)
              </button>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}
