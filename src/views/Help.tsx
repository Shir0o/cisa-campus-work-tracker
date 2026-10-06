import React from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, BookOpen } from 'lucide-react';
import helpManifest from '../generated/help.json';
import type { HelpManifest } from '../scripts/compile-help';
import { useAuth } from '../components/AuthProvider';
import { useLanguage } from '../components/LanguageProvider';
import { cn } from '../lib/utils';
import { helpContentForLocale, helpPageForRole, visibleHelpPages } from '../lib/help';

const HELP_MD: Components = {
  h1: ({ children }) => (
    <h1 className="mt-6 mb-3 font-serif text-2xl font-semibold text-on-surface first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-6 mb-2 font-serif text-xl font-semibold text-on-surface">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-5 mb-2 text-base font-semibold text-on-surface">{children}</h3>
  ),
  p: ({ children }) => (
    <p className="my-3 text-sm leading-relaxed text-on-surface-variant">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="my-3 list-disc space-y-1 pl-5 text-sm text-on-surface-variant">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-3 list-decimal space-y-1 pl-5 text-sm text-on-surface-variant">{children}</ol>
  ),
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-accent underline underline-offset-2 hover:opacity-80">
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-2 border-outline-variant pl-4 italic text-on-surface-variant">
      {children}
    </blockquote>
  ),
  code: ({ children }) => (
    <code className="rounded bg-surface-container px-1.5 py-0.5 text-xs text-on-surface">{children}</code>
  ),
  strong: ({ children }) => <strong className="font-semibold text-on-surface">{children}</strong>,
};

export default function Help() {
  const manifest = helpManifest as HelpManifest;
  const { slug } = useParams();
  const { role } = useAuth();
  const { language, t } = useLanguage();
  const navigate = useNavigate();

  const pages = visibleHelpPages(manifest, role);
  const activePage = slug ? helpPageForRole(manifest, role, slug) : undefined;
  const content = activePage ? helpContentForLocale(activePage, language) : undefined;

  return (
    <main
      data-testid="help-view"
      className="min-h-screen bg-background px-4 py-12 text-on-surface sm:px-6 lg:px-8"
    >
      <div className="mx-auto max-w-5xl space-y-8">
        <button
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-2 text-sm text-accent underline underline-offset-2 transition-opacity hover:opacity-80"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('help.back_to_app', 'Back to Application')}
        </button>

        <div className="flex items-center gap-3 border-b border-outline-variant pb-6">
          <div className="rounded-xl border border-outline-variant bg-surface p-3 text-accent">
            <BookOpen className="h-8 w-8" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-on-surface">{t('help.title', 'Help')}</h1>
            <p className="text-sm text-on-surface-variant">
              {t('help.subtitle', 'Guides for using CISA Campus Work Tracker.')}
            </p>
          </div>
        </div>

        <div className="grid gap-8 md:grid-cols-[16rem_1fr]">
          <nav data-testid="help-nav" aria-label={t('help.pages_label', 'Help pages')} className="space-y-1">
            {pages.map((page) => (
              <Link
                key={page.slug}
                to={`/help/${page.slug}`}
                className={cn(
                  'block rounded-xl border px-4 py-2.5 text-sm transition-colors',
                  page.slug === slug
                    ? 'border-primary/40 bg-primary/5 text-on-surface'
                    : 'border-transparent text-on-surface-variant hover:bg-surface-container',
                )}
              >
                {helpContentForLocale(page, language).title}
              </Link>
            ))}
          </nav>

          {slug && !activePage ? (
            <div
              data-testid="help-not-found"
              className="rounded-3xl border border-outline-variant bg-surface-container p-8 text-center"
            >
              <h2 className="mb-2 text-xl font-semibold text-on-surface">
                {t('help.not_found_title', 'Page not found')}
              </h2>
              <p className="mb-6 text-sm text-on-surface-variant">
                {t('help.not_found_body', 'This help page does not exist, or it is not available for your role.')}
              </p>
              <Link
                to="/help"
                className="text-sm text-accent underline underline-offset-2 hover:opacity-80"
              >
                {t('help.back_to_help', 'Back to Help')}
              </Link>
            </div>
          ) : activePage && content ? (
            <article data-testid="help-page" className="max-w-none">
              {activePage.category && (
                <p className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
                  {activePage.category}
                </p>
              )}
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={HELP_MD}>
                {content.body}
              </ReactMarkdown>
            </article>
          ) : null}
        </div>
      </div>
    </main>
  );
}
