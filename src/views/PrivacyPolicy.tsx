import React from "react";
import { Shield, ArrowLeft, LifeBuoy } from "lucide-react";
import { useNavigate, Link } from "react-router-dom";
import { useLanguage } from "../components/LanguageProvider";

export default function PrivacyPolicy() {
  const navigate = useNavigate();
  const { t } = useLanguage();

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate("/")}
            className="inline-flex items-center text-sm text-cyan-400 hover:text-cyan-300 transition-colors gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            {t('privacy.back_to_app')}
          </button>
          <Link
            to="/support"
            className="inline-flex items-center text-sm text-slate-400 hover:text-cyan-400 transition-colors gap-1.5"
          >
            <LifeBuoy className="w-4 h-4" />
            {t('privacy.help_support')}
          </Link>
        </div>

        <div className="flex items-center gap-3 border-b border-slate-800 pb-6">
          <div className="p-3 bg-cyan-500/10 text-cyan-400 rounded-xl border border-cyan-500/20">
            <Shield className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-100">{t('privacy.title')}</h1>
            <p className="text-sm text-slate-400">{t('privacy.subtitle')}</p>
          </div>
        </div>

        <div className="prose prose-invert max-w-none space-y-6 text-slate-300 text-sm leading-relaxed">
          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-100">{t('privacy.overview_title')}</h2>
            <p>
              {t('privacy.overview_body')}
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-100">{t('privacy.data_title')}</h2>
            <p>{t('privacy.data_intro')}</p>
            <ul className="list-disc pl-5 space-y-1 text-slate-400">
              <li><strong>{t('privacy.data_account_creds_label')}</strong> {t('privacy.data_account_creds_body')}</li>
              <li><strong>{t('privacy.data_member_profiles_label')}</strong> {t('privacy.data_member_profiles_body')}</li>
              <li><strong>{t('privacy.data_welcome_label')}</strong> {t('privacy.data_welcome_body')}</li>
              <li><strong>{t('privacy.data_pastoral_label')}</strong> {t('privacy.data_pastoral_body')}</li>
              <li><strong>{t('privacy.data_prayer_label')}</strong> {t('privacy.data_prayer_body')}</li>
              <li><strong>{t('privacy.data_gatherings_label')}</strong> {t('privacy.data_gatherings_body')}</li>
              <li><strong>{t('privacy.data_tasks_label')}</strong> {t('privacy.data_tasks_body')}</li>
              <li><strong>{t('privacy.data_messaging_label')}</strong> {t('privacy.data_messaging_body')}</li>
              <li><strong>{t('privacy.data_diagnostics_label')}</strong> {t('privacy.data_diagnostics_body')}</li>
              <li><strong>{t('privacy.data_push_tokens_label')}</strong> {t('privacy.data_push_tokens_body')}</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-100">{t('privacy.usage_title')}</h2>
            <p>
              {t('privacy.usage_body1')}
            </p>
            <p>
              {t('privacy.usage_body2')}
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-100">{t('privacy.roles_title')}</h2>
            <p>
              {t('privacy.roles_intro')} <strong>{t('privacy.roles_full_timer')}</strong>, <strong>{t('privacy.roles_manager')}</strong>, <strong>{t('privacy.roles_operator')}</strong>, {t('privacy.roles_and')} <strong>{t('privacy.roles_viewer')}</strong>. {t('privacy.roles_footer')}
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-100">{t('privacy.account_title')}</h2>
            <p>
              {t('privacy.account_body')} <a href="mailto:yilongwang05@gmail.com" className="text-cyan-400 hover:underline">yilongwang05@gmail.com</a>.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-100">{t('privacy.security_title')}</h2>
            <p>
              {t('privacy.security_body')}
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-100">{t('privacy.contact_title')}</h2>
            <p>
              {t('privacy.contact_body')} <a href="mailto:yilongwang05@gmail.com" className="text-cyan-400 hover:underline">yilongwang05@gmail.com</a>.
            </p>
          </section>
        </div>

        <div className="pt-8 border-t border-slate-800 text-xs text-slate-500 text-center">
          {t('privacy.footer')}
        </div>
      </div>
    </div>
  );
}
