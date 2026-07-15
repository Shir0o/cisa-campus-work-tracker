// Live data for the native Feedback admin review screen. Mirrors web's
// src/views/FeedbackList.tsx: a live subscription to every feedback doc plus
// the combined kind/status/archive/search filter, delegated to the shared,
// unit-tested filterFeedback.
import { useEffect, useMemo, useState } from 'react';
import { filterFeedback, type Feedback, type FeedbackFilters } from '@cisa/core';
import { handleFirestoreError, OperationType } from './firebase';
import {
  subscribeFeedback,
  updateFeedbackStatus,
  toggleFeedbackArchive,
  deleteFeedback,
} from './data/feedback';

const DEFAULT_FILTERS: FeedbackFilters = { kind: 'all', status: 'all', includeArchived: false, search: '' };

export function useFeedbackAdminData() {
  const [items, setItems] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FeedbackFilters>(DEFAULT_FILTERS);

  useEffect(() => {
    const unsub = subscribeFeedback(
      (list) => {
        setItems(list);
        setLoading(false);
      },
      (e) => {
        setError("Couldn't load feedback.");
        setLoading(false);
        handleFirestoreError(e, OperationType.LIST, 'feedback', { rethrow: false });
      },
    );
    return unsub;
  }, []);

  const filtered = useMemo(() => filterFeedback(items, filters), [items, filters]);

  return {
    loading,
    error,
    items: filtered,
    total: items.length,
    filters,
    setKind: (kind: FeedbackFilters['kind']) => setFilters((f) => ({ ...f, kind })),
    setStatus: (status: FeedbackFilters['status']) => setFilters((f) => ({ ...f, status })),
    setIncludeArchived: (includeArchived: boolean) => setFilters((f) => ({ ...f, includeArchived })),
    setSearch: (search: string) => setFilters((f) => ({ ...f, search })),
    updateStatus: updateFeedbackStatus,
    toggleArchive: toggleFeedbackArchive,
    remove: deleteFeedback,
  };
}
