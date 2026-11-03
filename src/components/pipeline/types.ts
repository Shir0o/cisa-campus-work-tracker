export interface PipelinePairMetrics {
  pairingId: string;
  memberIds: string[];
  memberNames: string[];
  totalFoundedContacts: number;
  stageCounts: Record<string, number>; // stageId -> count
  status: 'flowing' | 'needs-first-appt' | 'needs-regular-appt' | 'neutral';
  statusLabel: string;
}

export interface PipelineSettingsConfig {
  followupThresholdDays: number;
}
