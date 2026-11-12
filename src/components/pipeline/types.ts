export interface PipelinePairMetrics {
  pairingId: string;
  memberIds: string[];
  memberNames: string[];
  totalFoundedContacts: number;
  /** Founded contacts nobody has placed on a step yet (no stage, or a stage
   *  label that no longer exists, e.g. "Unassigned"). */
  unplacedContacts: number;
  stageCounts: Record<string, number>; // stageId -> count
  status: 'flowing' | 'needs-step' | 'unplaced' | 'neutral';
  /** The step this pair is being guided to next; null unless needs-step. */
  gapStageId: string | null;
  gapStageLabel: string | null;
}
