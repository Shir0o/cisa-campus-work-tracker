import { useEffect } from 'react';
import { useLanguage } from '../LanguageProvider';
import { claimDocumentTitle } from '../../lib/documentTitle';

/**
 * Names the document after the page while `title` is non-null, and puts the
 * app's own name back on unmount or when the page stops naming itself (#1814,
 * #1838). Both reading routes share it, so a page that names itself on screen
 * is never titled with the internal app name.
 *
 * It depends on the active language (`t`), so a Spanish reader's tab is renamed
 * on a language switch rather than reverting to the app name; the claim tells
 * `LanguageProvider` not to overwrite it.
 */
export function useDocumentTitle(title: string | null) {
  const { t } = useLanguage();
  useEffect(() => {
    if (!title) return;
    claimDocumentTitle(title);
    document.title = title;
    return () => {
      claimDocumentTitle(null);
      document.title = t('meta.title');
    };
  }, [title, t]);
}
