import React, { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import StudyReaderView from '../components/bibleStudy/StudyReaderView';
import StudyEmptyState from '../components/bibleStudy/StudyEmptyState';
import { useResolvedStudy } from '../components/bibleStudy/useResolvedStudy';

export default function PublicStudyReader() {
  const params = useParams<{ slug?: string; studyId?: string; date?: string }>();
  const slug = params.slug ?? '';
  const permalinkStudyId = params.studyId ?? '';
  const isPermalink = !!permalinkStudyId;

  // Two ways in: a scan resolves through the Entry point's active Study; a
  // staff permalink addresses one week by Study and date directly. Either
  // way the chain ends at the newest published Meeting of a Study, and it is
  // the same chain "This week's study" walks (#946).
  const { loading, entryPoint, resolution, meeting, staleDateLabel } = useResolvedStudy(
    slug,
    isPermalink ? { studyId: permalinkStudyId, date: params.date || undefined } : undefined,
  );

  // A permalink is public but unlisted (ADR 0011): the Firestore rule already
  // serves any published Meeting to anyone, so a UI gate would present an
  // open door as protected. noindex keeps it out of search engines.
  useEffect(() => {
    if (!isPermalink) return;
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex';
    document.head.appendChild(meta);
    return () => meta.remove();
  }, [isPermalink]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-on-surface-variant font-sans">
        <div className="animate-pulse tracking-wide text-sm font-medium">Loading Bible Study...</div>
      </div>
    );
  }

  if (resolution.kind !== 'meeting') {
    return (
      <div className="min-h-screen flex flex-col bg-background text-on-surface">
        <StudyEmptyState kind={resolution.kind} entryPoint={entryPoint} isPermalink={isPermalink} />
      </div>
    );
  }

  // The route keeps only what is genuinely its job: resolve the scan and own
  // the empty states. Everything a student sees — the deck, the chrome, the
  // Blanks — is the shared StudyReaderView (ADR 0014, one rendering path),
  // which the editor's preview also renders. The parallax washes retired with
  // tap-to-advance: they animated on a section index nothing owns anymore.
  // The phone frame stays (a student's viewport on desktop, full-bleed on
  // mobile), but it is no longer the scroll container.
  //
  // No header actions here: this is the scan, and a student who scanned has
  // no app to go back to and no week to edit.
  return (
    <div className="min-h-screen bg-black/95 sm:bg-background flex items-center justify-center p-0 sm:p-4">
      <div className="w-full max-w-[420px] h-[100dvh] sm:h-[844px] sm:max-h-[92dvh] sm:rounded-3xl bg-background text-on-surface relative overflow-hidden flex flex-col shadow-2xl">
        <StudyReaderView meeting={meeting!} staleDateLabel={staleDateLabel} />
      </div>
    </div>
  );
}
