import React from "react";
import { Shield, ArrowLeft, LifeBuoy } from "lucide-react";
import { useNavigate, Link } from "react-router-dom";
import { useLanguage } from "../components/LanguageProvider";

export default function PrivacyPolicy() {
  const navigate = useNavigate();
  const { t } = useLanguage();

  return (
    <main className="min-h-screen bg-background text-on-surface py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate("/")}
            className="inline-flex items-center text-sm text-accent hover:opacity-80 transition-opacity gap-2 underline underline-offset-2"
          >
            <ArrowLeft className="w-4 h-4" />
            {t('privacy.back_to_app')}
          </button>
          <Link
            to="/support"
            className="inline-flex items-center text-sm text-on-surface-variant hover:text-accent transition-colors gap-1.5 underline underline-offset-2"
          >
            <LifeBuoy className="w-4 h-4" />
            {t('privacy.help_support')}
          </Link>
        </div>

        <div className="flex items-center gap-3 border-b border-outline-variant pb-6">
          <div className="p-3 bg-surface text-accent rounded-xl border border-outline-variant">
            <Shield className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-on-surface">{t('privacy.title')}</h1>
            <p className="text-sm text-on-surface-variant">{t('privacy.subtitle')}</p>
          </div>
        </div>

        <div className="max-w-none space-y-6 text-on-surface-variant text-sm leading-relaxed">
          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-on-surface">{t('privacy.overview_title')}</h2>
            <p>
              {t('privacy.overview_body')}
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-on-surface">{t('privacy.data_title')}</h2>
            <p>{t('privacy.data_intro')}</p>
            <ul className="list-disc pl-5 space-y-1 text-on-surface-variant">
              <li><strong className="text-on-surface">{t('privacy.data_account_creds_label')}</strong> {t('privacy.data_account_creds_body')}</li>
              <li><strong className="text-on-surface">{t('privacy.data_member_profiles_label')}</strong> {t('privacy.data_member_profiles_body')}</li>
              <li><strong className="text-on-surface">{t('privacy.data_welcome_label')}</strong> {t('privacy.data_welcome_body')}</li>
              <li><strong className="text-on-surface">{t('privacy.data_pastoral_label')}</strong> {t('privacy.data_pastoral_body')}</li>
              <li><strong className="text-on-surface">{t('privacy.data_prayer_label')}</strong> {t('privacy.data_prayer_body')}</li>
              <li><strong className="text-on-surface">{t('privacy.data_gatherings_label')}</strong> {t('privacy.data_gatherings_body')}</li>
              <li><strong className="text-on-surface">{t('privacy.data_tasks_label')}</strong> {t('privacy.data_tasks_body')}</li>
              <li><strong className="text-on-surface">{t('privacy.data_messaging_label')}</strong> {t('privacy.data_messaging_body')}</li>
              <li><strong className="text-on-surface">{t('privacy.data_diagnostics_label')}</strong> {t('privacy.data_diagnostics_body')}</li>
              <li><strong className="text-on-surface">{t('privacy.data_push_tokens_label')}</strong> {t('privacy.data_push_tokens_body')}</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-on-surface">{t('privacy.usage_title')}</h2>
            <p>
              {t('privacy.usage_body1')}
            </p>
            <p>
              {t('privacy.usage_body2')}
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-on-surface">{t('privacy.roles_title')}</h2>
            <p>
              {t('privacy.roles_intro')} <strong className="text-on-surface">{t('privacy.roles_full_timer')}</strong>, <strong className="text-on-surface">{t('privacy.roles_manager')}</strong>, <strong className="text-on-surface">{t('privacy.roles_operator')}</strong>, {t('privacy.roles_and')} <strong className="text-on-surface">{t('privacy.roles_viewer')}</strong>. {t('privacy.roles_footer')}
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-on-surface">{t('privacy.account_title')}</h2>
            <p>
              {t('privacy.account_body')} <a href="mailto:yilongwang05@gmail.com" className="text-accent underline underline-offset-2 hover:opacity-80">yilongwang05@gmail.com</a>.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-on-surface">{t('privacy.security_title')}</h2>
            <p>
              {t('privacy.security_body')}
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-on-surface">{t('privacy.contact_title')}</h2>
            <p>
              {t('privacy.contact_body')} <a href="mailto:yilongwang05@gmail.com" className="text-accent underline underline-offset-2 hover:opacity-80">yilongwang05@gmail.com</a>.
            </p>
          </section>
        </div>

        <div className="pt-8 border-t border-outline-variant text-xs text-on-surface-variant/70 text-center">
          {t('privacy.footer')}
        </div>
      </div>
    </main>
  );
}
