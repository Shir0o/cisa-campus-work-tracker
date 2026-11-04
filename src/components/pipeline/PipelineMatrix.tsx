import React, { useState } from 'react';
import type { Stage, Contact } from '../../types';
import type { PipelinePairMetrics } from './types';
import { X, ExternalLink } from 'lucide-react';
import { useLanguage } from '../LanguageProvider';

interface PipelineMatrixProps {
  metrics: PipelinePairMetrics[];
  stages: Stage[];
  contacts: Contact[];
  onOpenContact?: (contact: Contact) => void;
}

export const PipelineMatrix: React.FC<PipelineMatrixProps> = ({
  metrics,
  stages,
  contacts,
  onOpenContact,
}) => {
  const { t } = useLanguage();
  const [selectedCell, setSelectedCell] = useState<{
    pairingId: string;
    pairLabel: string;
    stageId: string;
    stageLabel: string;
  } | null>(null);

  const [filterGapsOnly, setFilterGapsOnly] = useState(false);

  const sortedStages = [...stages].sort((a, b) => a.order - b.order);

  const displayedMetrics = filterGapsOnly
    ? metrics.filter((m) => m.status.startsWith('needs-'))
    : metrics;

  const selectedContacts = selectedCell
    ? contacts.filter((c) => {
        const pairing = metrics.find((m) => m.pairingId === selectedCell.pairingId);
        if (!pairing) return false;
        const matchesPair = pairing.memberIds
          ? pairing.memberIds.some((m) => (c.founders || []).includes(m))
          : true;
        return (c.stage === selectedCell.stageId || c.stage === selectedCell.stageLabel) && matchesPair;
      })
    : [];

  const needsNextStepCount = metrics.filter((m) => m.status.startsWith('needs-')).length;

  return (
    <div className="bg-surface rounded-xl border border-outline-variant shadow-xs overflow-hidden">
      {/* Table Top Controls */}
      <div className="bg-surface-container-low px-6 py-3.5 border-b border-outline-variant flex flex-wrap justify-between items-center gap-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-on-surface">{t('outreachBoard.pipeline_filter', 'Filter:')}</span>
          <button
            type="button"
            onClick={() => setFilterGapsOnly(!filterGapsOnly)}
            className={`px-3 py-1.5 rounded-full font-semibold border transition-colors flex items-center gap-1.5 ${
              filterGapsOnly
                ? 'bg-secondary-container text-on-secondary-container border-secondary/40'
                : 'bg-surface border-outline-variant text-on-surface-variant hover:bg-surface-variant'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${filterGapsOnly ? 'bg-secondary' : 'bg-outline'}`} />
            {t('outreachBoard.pipeline_needs_next_step', 'Needs Next Step Only ({n})').replace('{n}', String(needsNextStepCount))}
          </button>
        </div>
        <div className="text-on-surface-variant">
          {t('outreachBoard.pipeline_showing_pairs', 'Showing {shown} of {total} Gospel Partner pairs')
            .replace('{shown}', String(displayedMetrics.length))
            .replace('{total}', String(metrics.length))}
        </div>
      </div>

      {/* Matrix Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="bg-surface-container-low/70 text-[11px] font-bold tracking-wider text-on-surface-variant uppercase border-b border-outline-variant">
              <th className="py-3 px-6">{t('outreachBoard.pipeline_pair_col', 'Gospel Partner Pair')}</th>
              {sortedStages.map((s) => (
                <th key={s.id} className="py-3 px-4 text-center">
                  {s.label}
                </th>
              ))}
              <th className="py-3 px-6 text-center">{t('outreachBoard.pipeline_guidance_col', 'Pipeline Guidance')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/30">
            {displayedMetrics.length === 0 ? (
              <tr>
                <td colSpan={sortedStages.length + 2} className="py-8 text-center text-on-surface-variant italic text-sm">
                  {t('outreachBoard.pipeline_no_pairs', 'No gospel partner pairs found.')}
                </td>
              </tr>
            ) : (
              displayedMetrics.map((row) => (
                <tr key={row.pairingId} className="hover:bg-surface-container-lowest/60 transition-colors">
                  <td className="py-3.5 px-6">
                    <div className="font-semibold text-on-surface">{row.memberNames.join(' & ')}</div>
                    <div className="text-xs text-on-surface-variant">
                      {t('outreachBoard.pipeline_total_contacts', '{n} total contacts').replace('{n}', String(row.totalFoundedContacts))}
                    </div>
                  </td>

                  {sortedStages.map((s, idx) => {
                    const count = row.stageCounts[s.id] || 0;
                    const isZeroInGapStage = count === 0 && idx > 0 && row.status.startsWith('needs-');

                    return (
                      <td key={s.id} className="py-3.5 px-4 text-center">
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedCell({
                              pairingId: row.pairingId,
                              pairLabel: row.memberNames.join(' & '),
                              stageId: s.id,
                              stageLabel: s.label,
                            })
                          }
                          className={`inline-flex items-center justify-center min-w-8 h-7 px-2.5 rounded-md text-xs font-bold transition-transform active:scale-95 ${
                            isZeroInGapStage
                              ? 'bg-error-container text-on-error-container border border-error/40'
                              : count > 0
                              ? 'bg-surface-container-highest text-on-surface hover:bg-surface-variant'
                              : 'text-on-surface-variant/40 hover:text-on-surface-variant'
                          }`}
                        >
                          {count === 0 && !isZeroInGapStage ? '—' : count}
                        </button>
                      </td>
                    );
                  })}

                  <td className="py-3.5 px-6 text-center">
                    {row.status === 'needs-first-appt' && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-error-container text-on-error-container border border-error/30 rounded-full text-xs font-semibold">
                        Needs 1st Appt
                      </span>
                    )}
                    {row.status === 'needs-regular-appt' && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-tertiary-container text-on-tertiary-container border border-tertiary/30 rounded-full text-xs font-semibold">
                        Needs Regular Appt
                      </span>
                    )}
                    {row.status === 'flowing' && (
                      <span className="inline-flex items-center gap-1 px-3 py-1 bg-secondary-container text-on-secondary-container border border-secondary/30 rounded-full text-xs font-semibold">
                        ✓ Active Flow
                      </span>
                    )}
                    {row.status === 'neutral' && <span className="text-on-surface-variant/40">—</span>}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Slide-over Contact Detail Drawer */}
      {selectedCell && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30 backdrop-blur-xs">
          <div className="w-full max-w-md bg-surface h-full shadow-2xl flex flex-col border-l border-outline-variant animate-in slide-in-from-right duration-200">
            <div className="p-4 border-b border-outline-variant flex justify-between items-center bg-surface-container-low">
              <div>
                <h3 className="font-bold text-on-surface text-base">{selectedCell.pairLabel}</h3>
                <p className="text-xs text-on-surface-variant">
                  {t('outreachBoard.pipeline_step_label', 'Step: {stage}').replace('{stage}', selectedCell.stageLabel)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCell(null)}
                className="p-1.5 rounded-full hover:bg-surface-variant text-on-surface-variant"
                aria-label={t('common.close', 'Close')}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 flex-1 overflow-y-auto space-y-2.5">
              {selectedContacts.length === 0 ? (
                <div className="py-12 text-center text-on-surface-variant italic text-sm">
                  {t('outreachBoard.pipeline_no_contacts_in_step', 'No contacts found in this step for this pair.')}
                </div>
              ) : (
                selectedContacts.map((contact) => (
                  <div
                    key={contact.id}
                    className="p-3 bg-surface-container-lowest rounded-lg border border-outline-variant hover:border-outline transition-colors flex items-center justify-between"
                  >
                    <div>
                      <div className="font-semibold text-on-surface text-sm">{contact.name}</div>
                      <div className="text-xs text-on-surface-variant">
                        {contact.lastSeen ? `Last seen ${contact.lastSeen}` : 'No recent contact logged'}
                      </div>
                    </div>
                    {onOpenContact && (
                      <button
                        type="button"
                        onClick={() => onOpenContact(contact)}
                        className="p-1 text-primary hover:bg-primary/10 rounded"
                        title={t('outreachBoard.pipeline_view_contact', 'View contact')}
                      >
                        <ExternalLink className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
