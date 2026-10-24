import React, { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import StudyReaderView from '../components/bibleStudy/StudyReaderView';
import StudyEmptyState from '../components/bibleStudy/StudyEmptyState';
import { useResolvedStudy } from '../components/bibleStudy/useResolvedStudy';
import { useLanguage } from '../components/LanguageProvider';

export default function PublicStudyReader() {
  const { t } = useLanguage();
  const params = useParams<{ slug?: string; studyId?: string; date?: string }>();
  const slug = params.slug ?? '';
  const permalinkStudyId = params.studyId ?? '';
  const isPermalink = !!permalinkStudyId;

  // Two ways in: a scan resolves through the Entry point's active Study; a
  // staff permalink addresses one week by Study and date directly. Either
  // way the chain ends at the newest published Meeting of a Study, and it is
  // the same chain "This week's study" walks (#946).
  const { loading, entryPoint, resolution, meeting, staleDateLabel, loadError } = useResolvedStudy(
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

  // A failed subscription looks exactly like an empty term in `resolution`,
  // so this state is checked first: a student on a bad connection must not be
  // told the study is over (#1777).
  if (loadError) {
    return (
      <div className="min-h-screen flex flex-col bg-background text-on-surface">
        <div role="alert" className="flex flex-col items-center justify-center p-6 text-center flex-1">
          <h1 className="font-serif text-2xl mb-2 font-medium">{t('study.load_failed')}</h1>
          <p className="text-on-surface-variant text-sm max-w-sm">{t('study.load_failed_body')}</p>
          {/* A reload, not a re-subscribe: the Firestore channel holds its
              reconnect backoff, so a second listen on the same client keeps
              answering from the failed cache. A fresh load opens a fresh
              connection (measured: the deck renders again as soon as the
              network is back). */}
          <button
            type="button"
            className="mt-5 h-11 px-5 rounded-full bg-on-surface text-background text-sm font-medium"
            onClick={() => window.location.reload()}
          >
            {t('study.try_again')}
          </button>
        </div>
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
  // The reader fills the viewport: it measures its own box to choose the
  // scrolling deck (phone) or the paged deck (wide screens, #1590), so a fixed
  // phone frame here would pin it to the scrolling deck. It is not the scroll
  // container.
  //
  // No header actions here: this is the scan, and a student who scanned has
  // no app to go back to and no week to edit.
  return (
    <div className="min-h-screen bg-background">
      <div className="w-full h-[100dvh] bg-background text-on-surface relative overflow-hidden flex flex-col">
        <StudyReaderView meeting={meeting!} staleDateLabel={staleDateLabel} />
      </div>
    </div>
  );
}
