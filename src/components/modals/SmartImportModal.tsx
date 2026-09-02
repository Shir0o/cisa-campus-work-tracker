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
  Trash2,
} from 'lucide-react';
import { motion } from 'motion/react';
import { collection, addDoc, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, logActivity, auth } from '../../lib/firebase';
import { useAuth } from '../AuthProvider';
import { useLanguage } from '../LanguageProvider';
import { Translate } from '../Translate';
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
  const { t } = useLanguage();
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
      setError(t('modals.smartImport.paste_error'));
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
            errorMsg = t('modals.smartImport.endpoint_not_found');
          } else if (response.status === 524 || response.status === 504) {
            errorMsg = t('modals.smartImport.timeout_error');
          }
        }
        throw new Error(errorMsg);
      }

      const resData = await response.json();
      if (!resData.success) {
        throw new Error(resData.error || t('modals.smartImport.parse_failed'));
      }

      const data: SmartImportParsedData = resData.data || { contacts: [], interactions: [], discussions: [] };

      // Initialize selected flag as true for all parsed items
      setParsedContacts((data.contacts || []).map((c) => ({ ...c, selected: true })));
      setParsedInteractions((data.interactions || []).map((i) => ({ ...i, selected: true })));
      setParsedDiscussions((data.discussions || []).map((d) => ({ ...d, selected: true })));

      setStep('preview');
    } catch (err: any) {
      console.error('Smart Import Parse Error:', err);
      setError(err.message || t('modals.smartImport.error_communicating'));
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
      setError(t('modals.smartImport.select_at_least_one'));
      return;
    }

    setError(null);
    setStep('importing');

    try {
      let idToken = '';
      if (auth?.currentUser) {
        try {
          idToken = await auth.currentUser.getIdToken();
        } catch {
          // fallback
        }
      }

      const response = await fetch('/api/smart-import/commit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({
          contacts: parsedContacts.filter((c) => c.selected),
          interactions: parsedInteractions.filter((i) => i.selected),
          discussions: parsedDiscussions.filter((d) => d.selected),
        }),
      });

      if (!response.ok) {
        let errorMsg = `Commit failed (HTTP ${response.status})`;
        try {
          const errData = await response.json();
          if (errData.error) errorMsg = errData.error;
        } catch {
          // fallback
        }
        throw new Error(errorMsg);
      }

      const resData = await response.json();
      if (!resData.success) {
        throw new Error(resData.error || t('modals.smartImport.failed_to_save'));
      }

      const summary = resData.summary || { contactsCount: 0, interactionsCount: 0, discussionsCount: 0 };
      setImportSummary(summary);
      setStep('success');

      if (onImportComplete) {
        onImportComplete(summary);
      }
    } catch (err: any) {
      console.error('Smart Import Commit Error:', err);
      setError(err.message || t('modals.smartImport.failed_to_save'));
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
            <div className="p-2.5 rounded-xl bg-primary/10 text-accent">
              <Wand2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-serif text-xl font-semibold">{t('modals.smartImport.modal_title')}</h2>
              <p className="text-xs text-on-surface-variant">
                {t('modals.smartImport.subtitle')}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 text-on-surface-variant hover:text-on-surface hover:bg-surface-variant rounded-full transition-colors"
            aria-label={t('modals.smartImport.close_modal')}
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
                  {t('modals.smartImport.paste_unstructured')}
                </label>
                <button
                  onClick={() => setInputText(SAMPLE_TEXT)}
                  className="text-xs text-accent hover:underline flex items-center gap-1 font-medium"
                >
                  <Sparkles className="w-3.5 h-3.5" /> {t('modals.smartImport.load_sample')}
                </button>
              </div>

              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={t('modals.smartImport.paste_placeholder')}
                rows={10}
                className="w-full p-4 rounded-xl border border-outline-variant bg-surface-container-lowest focus:border-primary focus:ring-1 focus:ring-primary outline-none text-sm font-mono leading-relaxed resize-y"
              />

              <div className="p-4 rounded-xl bg-surface-container-high border border-outline-variant text-xs text-on-surface-variant space-y-1">
                <p className="font-semibold text-on-surface flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-accent" /> {t('modals.smartImport.what_extracts')}
                </p>
                <ul className="list-disc list-inside space-y-1 pl-1">
                  <li><b>{t('modals.smartImport.contacts')}:</b> {t('modals.smartImport.contacts_desc')}</li>
                  <li><b>{t('modals.smartImport.interactions')}:</b> {t('modals.smartImport.interactions_desc')}</li>
                  <li><b>{t('modals.smartImport.discussions')}:</b> {t('modals.smartImport.discussions_desc')}</li>
                </ul>
              </div>
            </div>
          )}

          {/* STEP 2: PARSING LOADING */}
          {step === 'parsing' && (
            <div className="py-16 text-center space-y-4">
              <div className="relative inline-flex items-center justify-center">
                <Loader2 className="w-12 h-12 text-accent animate-spin" />
                <Sparkles className="w-5 h-5 text-accent absolute" />
              </div>
              <h3 className="font-serif text-lg font-medium">{t('modals.smartImport.parsing')}</h3>
              <p className="text-sm text-on-surface-variant max-w-md mx-auto">
                {t('modals.smartImport.parsing_desc')}
              </p>
            </div>
          )}

          {/* STEP 3: DRY RUN PREVIEW */}
          {step === 'preview' && (
            <div className="space-y-6">
              {/* Summary Bar & Selection Toggle */}
              <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-surface-container-high border border-outline-variant">
                <div className="flex items-center gap-4 text-sm font-medium">
                  <span className="flex items-center gap-1.5 text-accent">
                    <User className="w-4 h-4" /> {parsedContacts.length} {t('modals.smartImport.contacts')}
                  </span>
                  <span className="flex items-center gap-1.5 text-secondary">
                    <MessageSquare className="w-4 h-4" /> {parsedInteractions.length} {t('modals.smartImport.interactions')}
                  </span>
                  <span className="flex items-center gap-1.5 text-tertiary">
                    <FileText className="w-4 h-4" /> {parsedDiscussions.length} {t('modals.smartImport.discussions')}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleSelectAll(true)}
                    className="px-3 py-1.5 rounded-lg border border-outline-variant text-xs font-medium hover:bg-surface-variant transition-colors"
                  >
                    {t('modals.smartImport.select_all')}
                  </button>
                  <button
                    onClick={() => toggleSelectAll(false)}
                    className="px-3 py-1.5 rounded-lg border border-outline-variant text-xs font-medium hover:bg-surface-variant transition-colors"
                  >
                    {t('modals.smartImport.deselect_all')}
                  </button>
                </div>
              </div>

              {/* Filter Tabs */}
              <div className="flex border-b border-outline-variant gap-2 text-sm font-medium overflow-x-auto no-scrollbar whitespace-nowrap">
                <button
                  onClick={() => setActiveTab('all')}
                  className={`pb-2 px-3 border-b-2 transition-colors ${
                    activeTab === 'all'
                      ? 'border-primary text-accent font-semibold'
                      : 'border-transparent text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {t('modals.smartImport.all_items')} ({parsedContacts.length + parsedInteractions.length + parsedDiscussions.length})
                </button>
                <button
                  onClick={() => setActiveTab('contacts')}
                  className={`pb-2 px-3 border-b-2 transition-colors ${
                    activeTab === 'contacts'
                      ? 'border-primary text-accent font-semibold'
                      : 'border-transparent text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {t('modals.smartImport.contacts')} ({parsedContacts.length})
                </button>
                <button
                  onClick={() => setActiveTab('interactions')}
                  className={`pb-2 px-3 border-b-2 transition-colors ${
                    activeTab === 'interactions'
                      ? 'border-primary text-accent font-semibold'
                      : 'border-transparent text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {t('modals.smartImport.interactions')} ({parsedInteractions.length})
                </button>
                <button
                  onClick={() => setActiveTab('discussions')}
                  className={`pb-2 px-3 border-b-2 transition-colors ${
                    activeTab === 'discussions'
                      ? 'border-primary text-accent font-semibold'
                      : 'border-transparent text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {t('modals.smartImport.discussions')} ({parsedDiscussions.length})
                </button>
              </div>

              {/* Items List */}
              <div className="space-y-4">
                {/* CONTACTS SECTION */}
                {(activeTab === 'all' || activeTab === 'contacts') && parsedContacts.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-xs font-semibold   text-on-surface-variant flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-accent" /> {t('modals.smartImport.contacts')} ({parsedContacts.length})
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
                                className="mt-0.5 text-accent focus:outline-none"
                              >
                                {contact.selected ? (
                                  <CheckSquare className="w-5 h-5 text-accent" />
                                ) : (
                                  <Square className="w-5 h-5 text-on-surface-variant" />
                                )}
                              </button>

                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-semibold text-sm text-on-surface">{contact.name}</span>
                                  {contact.matchedContactId ? (
                                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                      {t('modals.smartImport.matches_existing').replace('{name}', contact.matchedContactName || contact.matchedContactId)}
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                      {t('modals.smartImport.new_contact')}
                                    </span>
                                  )}
                                  <span className="px-2 py-0.5 rounded-full text-xs bg-surface-container-high text-on-surface-variant capitalize">
                                    {t('modals.smartImport.stage')}: {contact.stage || t('modals.smartImport.lead')}
                                  </span>
                                </div>

                                <div className="text-xs text-on-surface-variant mt-1 space-x-3">
                                  {contact.email && <span>{t('modals.smartImport.email')}: {contact.email}</span>}
                                  {contact.phone && <span>{t('modals.smartImport.phone')}: {contact.phone}</span>}
                                  {contact.role && <span>{t('modals.smartImport.role')}: {contact.role}</span>}
                                </div>

                                {contact.notes && (
                                  <p className="text-xs text-on-surface-variant/80 mt-1 italic line-clamp-2">
                                    "<Translate text={contact.notes} />"
                                  </p>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() =>
                                  setParsedContacts((prev) => prev.filter((c) => c.tempId !== contact.tempId))
                                }
                                className="p-1.5 text-on-surface-variant hover:text-error hover:bg-error/10 rounded-lg transition-colors"
                                title={t('modals.smartImport.delete_item')}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingItemKey(isEditing ? null : itemKey)}
                                className="p-1.5 text-on-surface-variant hover:text-on-surface rounded-lg hover:bg-surface-variant transition-colors"
                                title={t('modals.smartImport.edit_item_details')}
                              >
                                {isEditing ? <ChevronUp className="w-4 h-4" /> : <Edit2 className="w-4 h-4" />}
                              </button>
                            </div>
                          </div>

                          {/* Editable Form */}
                          {isEditing && (
                            <div className="mt-4 pt-4 border-t border-outline-variant grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                              <div>
                                <label className="block text-on-surface-variant mb-1 font-medium">{t('modals.smartImport.name')}</label>
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
                                <label className="block text-on-surface-variant mb-1 font-medium">{t('modals.smartImport.email')}</label>
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
                                <label className="block text-on-surface-variant mb-1 font-medium">{t('modals.smartImport.phone')}</label>
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
                                <label className="block text-on-surface-variant mb-1 font-medium">{t('modals.smartImport.stage')}</label>
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
                                  <option value="lead">{t('modals.smartImport.lead')}</option>
                                  <option value="contact">{t('modals.smartImport.contact')}</option>
                                  <option value="follow-up">{t('modals.smartImport.follow_up')}</option>
                                  <option value="connected">{t('modals.smartImport.connected')}</option>
                                  <option value="active">{t('modals.smartImport.active')}</option>
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
                    <h4 className="text-xs font-semibold   text-on-surface-variant flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5 text-secondary" /> {t('modals.smartImport.interactions_section')} ({parsedInteractions.length})
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
                                    {interaction.contactName || t('modals.smartImport.unlinked_interaction')}
                                  </span>
                                  <span className="px-2 py-0.5 rounded-full text-xs bg-surface-container-high text-on-surface-variant capitalize">
                                    {t('modals.smartImport.type')}: {interaction.type || t('modals.smartImport.note')}
                                  </span>
                                  {interaction.dateTime && (
                                    <span className="text-xs text-on-surface-variant font-mono">
                                      {interaction.dateTime}
                                    </span>
                                  )}
                                </div>

                                <p className="text-xs text-on-surface mt-1 leading-relaxed whitespace-pre-wrap">
                                  <Translate text={interaction.content} />
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() =>
                                  setParsedInteractions((prev) => prev.filter((i) => i.tempId !== interaction.tempId))
                                }
                                className="p-1.5 text-on-surface-variant hover:text-error hover:bg-error/10 rounded-lg transition-colors"
                                title={t('modals.smartImport.delete_item')}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingItemKey(isEditing ? null : itemKey)}
                                className="p-1.5 text-on-surface-variant hover:text-on-surface rounded-lg hover:bg-surface-variant transition-colors"
                                title={t('modals.smartImport.edit_item_details')}
                              >
                                {isEditing ? <ChevronUp className="w-4 h-4" /> : <Edit2 className="w-4 h-4" />}
                              </button>
                            </div>
                          </div>

                          {/* Editable Form */}
                          {isEditing && (
                            <div className="mt-4 pt-4 border-t border-outline-variant space-y-3 text-xs">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-on-surface-variant mb-1 font-medium">{t('modals.smartImport.contact_name')}</label>
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
                                  <label className="block text-on-surface-variant mb-1 font-medium">{t('modals.smartImport.type')}</label>
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
                                    <option value="coffee">{t('modals.smartImport.coffee')}</option>
                                    <option value="call">{t('modals.smartImport.call')}</option>
                                    <option value="text">{t('modals.smartImport.text')}</option>
                                    <option value="meeting">{t('modals.smartImport.meeting')}</option>
                                    <option value="note">{t('modals.smartImport.note')}</option>
                                  </select>
                                </div>
                              </div>
                              <div>
                                <label className="block text-on-surface-variant mb-1 font-medium">{t('modals.smartImport.content_summary')}</label>
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
                    <h4 className="text-xs font-semibold   text-on-surface-variant flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-tertiary" /> {t('modals.smartImport.discussions_section')} ({parsedDiscussions.length})
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
                                    {t('modals.smartImport.audience')}: {discussion.audience || t('modals.smartImport.team')}
                                  </span>
                                </div>

                                <p className="text-xs text-on-surface-variant/90 mt-1 line-clamp-3 font-mono">
                                  <Translate text={discussion.content} />
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() =>
                                  setParsedDiscussions((prev) => prev.filter((d) => d.tempId !== discussion.tempId))
                                }
                                className="p-1.5 text-on-surface-variant hover:text-error hover:bg-error/10 rounded-lg transition-colors"
                                title={t('modals.smartImport.delete_item')}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingItemKey(isEditing ? null : itemKey)}
                                className="p-1.5 text-on-surface-variant hover:text-on-surface rounded-lg hover:bg-surface-variant transition-colors"
                                title={t('modals.smartImport.edit_item_details')}
                              >
                                {isEditing ? <ChevronUp className="w-4 h-4" /> : <Edit2 className="w-4 h-4" />}
                              </button>
                            </div>
                          </div>

                          {/* Editable Form */}
                          {isEditing && (
                            <div className="mt-4 pt-4 border-t border-outline-variant space-y-3 text-xs">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-on-surface-variant mb-1 font-medium">{t('modals.smartImport.title')}</label>
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
                                  <label className="block text-on-surface-variant mb-1 font-medium">{t('modals.smartImport.audience')}</label>
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
                                    <option value="team">{t('modals.smartImport.team')}</option>
                                    <option value="trainees">{t('modals.smartImport.trainees')}</option>
                                    <option value="everyone">{t('modals.smartImport.everyone')}</option>
                                  </select>
                                </div>
                              </div>
                              <div>
                                <label className="block text-on-surface-variant mb-1 font-medium">{t('modals.smartImport.markdown_content')}</label>
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
              <Loader2 className="w-12 h-12 text-accent animate-spin mx-auto" />
              <h3 className="font-serif text-lg font-medium">{t('modals.smartImport.writing')}</h3>
              <p className="text-sm text-on-surface-variant">
                {t('modals.smartImport.writing_desc')}
              </p>
            </div>
          )}

          {/* STEP 5: SUCCESS */}
          {step === 'success' && (
            <div className="py-12 text-center space-y-4">
              <div className="w-16 h-16 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto">
                <Check className="w-8 h-8" />
              </div>
              <h3 className="font-serif text-2xl font-semibold">{t('modals.smartImport.import_completed')}</h3>
              <p className="text-sm text-on-surface-variant max-w-md mx-auto">
                {t('modals.smartImport.success_summary').replace('{contacts}', String(importSummary.contactsCount)).replace('{interactions}', String(importSummary.interactionsCount)).replace('{discussions}', String(importSummary.discussionsCount))}
              </p>
              <div className="pt-4">
                <button
                  onClick={handleClose}
                  className="px-6 py-2.5 rounded-full bg-primary text-on-primary font-medium text-sm hover:opacity-90 transition-opacity"
                >
                  {t('modals.smartImport.done')}
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
                {t('modals.smartImport.back_to_text')}
              </button>
            ) : (
              <button
                onClick={handleClose}
                className="px-4 py-2 rounded-full border border-outline-variant text-sm font-medium text-on-surface hover:bg-surface-variant transition-colors"
              >
                {t('modals.smartImport.cancel')}
              </button>
            )}

            {step === 'input' && (
              <button
                onClick={handleParse}
                disabled={!inputText.trim()}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-primary text-on-primary font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                <Wand2 className="w-4 h-4" /> {t('modals.smartImport.parse_with_gemini')}
              </button>
            )}

            {step === 'preview' && (
              <button
                onClick={handleConfirmImport}
                disabled={totalSelected === 0}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-primary text-on-primary font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                <Check className="w-4 h-4" /> {t('modals.smartImport.confirm_import').replace('{n}', String(totalSelected))}
              </button>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}
