import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, FileSpreadsheet, RefreshCw, AlertCircle, CheckCircle2, Sparkles } from 'lucide-react';
import { useAuth } from '../AuthProvider';
import { fetchSheetData, extractSpreadsheetId } from '../../services/sheetsService';
import { aiService } from '../../services/aiService';
import { collection, doc, updateDoc, getDocs, query, where, addDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { cn } from '../../lib/utils';
import { Contact, Event } from '../../types';

interface SyncSheetModalProps {
  isOpen: boolean;
  onClose: () => void;
  contacts: Contact[];
}

export default function SyncSheetModal({ isOpen, onClose, contacts }: SyncSheetModalProps) {
  const { authorizeSheets, isAdmin } = useAuth();
  const [sheetUrl, setSheetUrl] = useState('');
  const [tabName, setTabName] = useState('Sheet1');
  const [range, setRange] = useState('A1:Z100');
  const [loading, setLoading] = useState(false);
  const [isMapping, setIsMapping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Dry run states
  const [dryRunData, setDryRunData] = useState<{
    newContacts: any[];
    updates: any[];
    eventMappings: Record<string, string>;
    displayRows: { identifier: string; status: 'new' | 'update'; count: number }[];
  } | null>(null);

  const handleDryRun = async () => {
    if (!isAdmin) return;
    setError(null);
    setSuccess(null);
    setLoading(true);
    setDryRunData(null);

    try {
      const token = await authorizeSheets();
      if (!token) throw new Error('Google authorization failed');

      const spreadSheetId = extractSpreadsheetId(sheetUrl);
      if (!spreadSheetId) throw new Error('Invalid Google Sheet URL or ID');

      const fullRange = `${tabName}!${range}`;
      const rows = await fetchSheetData(spreadSheetId, fullRange, token);
      if (rows.length < 2) throw new Error('Sheet must have at least a header row and one data row');

      const headers = rows[0];
      const dataRows = rows.slice(1);

      setIsMapping(true);
      const existingEventsSnapshot = await getDocs(collection(db, 'events'));
      const existingEvents = existingEventsSnapshot.docs.map(d => ({ id: d.id, name: d.data().name }));
      const existingEventNames = existingEvents.map(e => e.name);

      const aiMapping = await aiService.mapSheetColumnsToEvents(headers, existingEventNames);
      setIsMapping(false);

      const eventMappings: Record<string, string> = {};
      const colToEventId: Record<number, string> = {};
      
      const eventHeaders = headers.slice(1);
      for (let i = 0; i < eventHeaders.length; i++) {
        const colIdx = i + 1;
        const header = eventHeaders[i];
        const matchedName = aiMapping[colIdx] || header;
        const existing = existingEvents.find(e => e.name.toLowerCase() === matchedName.toLowerCase());
        
        eventMappings[header] = existing ? `Matches: ${existing.name}` : `Will create new event: ${matchedName}`;
        colToEventId[colIdx] = existing?.id || `new:${matchedName}`;
      }

      const newContacts: any[] = [];
      const updates: any[] = [];
      const displayRows: { identifier: string; status: 'new' | 'update'; count: number }[] = [];

      for (const row of dataRows) {
        const identifier = row[0]?.trim();
        if (!identifier) continue;

        const contact = contacts.find(c => 
          c.name.toLowerCase() === identifier.toLowerCase() || 
          c.email?.toLowerCase() === identifier.toLowerCase()
        );

        const attendance: Record<string, boolean | 'absent'> = {};
        let count = 0;
        for (const colIdxStr in colToEventId) {
          const colIdx = parseInt(colIdxStr);
          const val = row[colIdx]?.toLowerCase().trim();
          if (['p', 'present', 'x', '1', 'yes'].includes(val)) {
            attendance[colToEventId[colIdx]] = true;
            count++;
          } else if (['a', 'absent', '0', 'no'].includes(val)) {
            attendance[colToEventId[colIdx]] = 'absent';
            count++;
          }
        }

        if (contact) {
          updates.push({ id: contact.id, name: contact.name, attendance });
          displayRows.push({ identifier: contact.name, status: 'update', count });
        } else {
          const name = identifier.includes('@') ? identifier.split('@')[0] : identifier;
          newContacts.push({ 
            name,
            email: identifier.includes('@') ? identifier : '',
            attendance 
          });
          displayRows.push({ identifier: name, status: 'new', count });
        }
      }

      setDryRunData({ newContacts, updates, eventMappings, displayRows });
    } catch (err: any) {
      setError(err.message || 'Validation failed');
    } finally {
      setLoading(false);
      setIsMapping(false);
    }
  };

  const commitSync = async () => {
    if (!dryRunData) return;
    setLoading(true);
    try {
      // 1. Resolve Events (Create missing)
      const finalEventMap: Record<string, string> = {};
      const existingEventsSnapshot = await getDocs(collection(db, 'events'));
      const existingEvents = existingEventsSnapshot.docs.map(d => ({ id: d.id, name: d.data().name }));

      for (const mapping in dryRunData.eventMappings) {
        const status = dryRunData.eventMappings[mapping];
        if (status.startsWith('Will create')) {
          const name = status.replace('Will create new event: ', '');
          const exists = existingEvents.find(e => e.name === name);
          if (exists) {
            finalEventMap[`new:${name}`] = exists.id;
          } else {
            const ref = await addDoc(collection(db, 'events'), {
              name,
              date: new Date().toISOString().split('T')[0],
              createdAt: new Date().toISOString()
            });
            finalEventMap[`new:${name}`] = ref.id;
          }
        }
      }

      // 2. Add New Contacts
      for (const nc of dryRunData.newContacts) {
        const attendance: any = {};
        Object.entries(nc.attendance).forEach(([id, val]) => {
          attendance[id.startsWith('new:') ? finalEventMap[id] : id] = val;
        });
        await addDoc(collection(db, 'contacts'), {
          ...nc,
          attendance,
          status: 'Lead',
          role: 'Member',
          isApproved: true,
          createdAt: new Date().toISOString()
        });
      }

      // 3. Update Existing
      for (const up of dryRunData.updates) {
        const attendance: any = { ...(contacts.find(c => c.id === up.id)?.attendance || {}) };
        Object.entries(up.attendance).forEach(([id, val]) => {
          attendance[id.startsWith('new:') ? finalEventMap[id] : id] = val;
        });
        await updateDoc(doc(db, 'contacts', up.id), { attendance, updatedAt: new Date().toISOString() });
      }

      setSuccess('Sync completed successfully!');
      setTimeout(() => onClose(), 2000);
    } catch (err: any) {
      setError(err.message || 'Sync failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-md bg-surface-container-high rounded-3xl shadow-2xl p-6 md:p-8 overflow-hidden border border-outline-variant/30"
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-primary-container text-on-primary-container">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-on-surface">Sync Google Sheet</h2>
                  <p className="text-xs text-on-surface-variant">Update attendance from a spreadsheet</p>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-surface-container rounded-full transition-colors"
                aria-label="Close modal"
              >
                <X className="w-5 h-5 text-on-surface-variant" />
              </button>
            </div>

            <div className="space-y-4">
              {!dryRunData ? (
                <>
                  <div className="space-y-1.5">
                    <label className="text-sm font-bold text-on-surface-variant ml-1">Sheet URL or ID</label>
                    <input
                      type="text"
                      value={sheetUrl}
                      onChange={(e) => setSheetUrl(e.target.value)}
                      placeholder="https://docs.google.com/spreadsheets/d/..."
                      className="w-full bg-surface-container-highest border border-outline-variant rounded-xl px-4 py-3 text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-sm font-bold text-on-surface-variant ml-1">Tab Name</label>
                      <input
                        type="text"
                        value={tabName}
                        onChange={(e) => setTabName(e.target.value)}
                        placeholder="Sheet1"
                        className="w-full bg-surface-container-highest border border-outline-variant rounded-xl px-4 py-3 text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-bold text-on-surface-variant ml-1">Range</label>
                      <input
                        type="text"
                        value={range}
                        onChange={(e) => setRange(e.target.value)}
                        placeholder="A1:Z100"
                        className="w-full bg-surface-container-highest border border-outline-variant rounded-xl px-4 py-3 text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-sm font-mono"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="space-y-4 max-h-[40vh] overflow-y-auto pr-2 custom-scrollbar"
                >
                  <div className="p-4 rounded-2xl bg-primary/5 border border-primary/20 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-primary uppercase tracking-wider">Sync Preview</h4>
                      <button 
                        onClick={() => setDryRunData(null)}
                        className="text-[10px] text-on-surface-variant hover:text-primary transition-colors font-bold"
                      >
                        Edit Config
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="p-3 bg-surface-container-low rounded-xl border border-outline-variant/30">
                        <div className="text-lg font-black text-primary">{dryRunData.newContacts.length}</div>
                        <div className="text-[10px] font-bold text-on-surface-variant">New Contacts</div>
                      </div>
                      <div className="p-3 bg-surface-container-low rounded-xl border border-outline-variant/30">
                        <div className="text-lg font-black text-primary">{dryRunData.updates.length}</div>
                        <div className="text-[10px] font-bold text-on-surface-variant">Updates</div>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-[10px] font-bold text-on-surface-variant flex items-center justify-between">
                        <span>Participants to Sync</span>
                        <span>{dryRunData.displayRows.length} rows</span>
                      </div>
                      <div className="space-y-1 max-h-[120px] overflow-y-auto pr-1">
                        {dryRunData.displayRows.map((row, idx) => (
                          <div key={idx} className="flex items-center justify-between text-[10px] bg-surface-container-lowest p-2 rounded-lg border border-outline-variant/10">
                            <div className="flex items-center gap-2 overflow-hidden">
                              <span className={cn(
                                "px-1.5 py-0.5 rounded text-[8px] font-black uppercase",
                                row.status === 'new' ? "bg-primary text-on-primary" : "bg-outline-variant text-on-surface-variant"
                              )}>
                                {row.status}
                              </span>
                              <span className="font-bold text-on-surface truncate">{row.identifier}</span>
                            </div>
                            <span className="text-on-surface-variant shrink-0">{row.count} events</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="text-[10px] font-bold text-on-surface-variant">Event Mappings</div>
                      <div className="space-y-1">
                        {Object.entries(dryRunData.eventMappings).map(([header, status]) => (
                          <div key={header} className="flex items-start gap-2 text-[10px] bg-surface-container-lowest p-2 rounded-lg border border-outline-variant/10">
                            <div className="font-bold text-on-surface w-1/3 truncate">{header}</div>
                            <div className={cn(
                              "w-2/3 italic",
                              String(status).startsWith('Matches') ? "text-primary" : "text-secondary"
                            )}>{String(status)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              <div className="p-4 rounded-2xl bg-surface-container-lowest border border-outline-variant/30 space-y-2">
                <h4 className="text-xs font-black uppercase tracking-widest text-on-surface-variant flex items-center gap-2">
                  <Sparkles className="w-3 h-3 text-primary" />
                  AI Sync Protocol
                </h4>
                <ul className="text-[11px] text-on-surface-variant space-y-1.5 list-disc pl-4 leading-relaxed">
                  <li><strong>Auto-Creation</strong>: New people will be added as "Leads".</li>
                  <li><strong>Dry Run</strong>: Validate row-by-row before any database changes.</li>
                  <li><strong>Intelligent Matching</strong>: AI correlates column names to existing events.</li>
                </ul>
              </div>

              {error && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-3 rounded-xl bg-error-container text-on-error-container text-xs flex items-start gap-2 border border-error/20"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </motion.div>
              )}

              {success && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-3 rounded-xl bg-primary-container text-on-primary-container text-xs flex items-start gap-2 border border-primary/20"
                >
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{success}</span>
                </motion.div>
              )}

              <button
                onClick={dryRunData ? commitSync : handleDryRun}
                disabled={loading || (!sheetUrl && !dryRunData) || !isAdmin}
                className={cn(
                  "w-full h-12 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all active:scale-95 relative overflow-hidden",
                  loading ? "bg-surface-container text-on-surface-variant cursor-not-allowed" : 
                  (dryRunData ? "bg-primary text-on-primary hover:shadow-lg hover:shadow-primary/25" : "bg-primary-container text-on-primary-container hover:bg-primary/20")
                )}
              >
                {loading ? (
                  <div className="flex flex-col items-center">
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    {isMapping && (
                      <motion.span 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-[10px] mt-1 font-medium animate-pulse"
                      >
                        AI Analysis...
                      </motion.span>
                    )}
                  </div>
                ) : (
                  <>
                    <RefreshCw className="w-5 h-5" />
                    {dryRunData ? `Confirm & Commit (${dryRunData.newContacts.length + dryRunData.updates.length} rows)` : 'Run AI Dry Run'}
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
