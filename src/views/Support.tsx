import React from "react";
import { LifeBuoy, ArrowLeft, Mail, Shield, Smartphone, HelpCircle } from "lucide-react";
import { useNavigate, Link } from "react-router-dom";
import { useLanguage } from "../components/LanguageProvider";

export default function Support() {
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
            {t('support.back_to_app')}
          </button>
          <Link
            to="/privacy"
            className="inline-flex items-center text-sm text-on-surface-variant hover:text-accent transition-colors gap-1.5 underline underline-offset-2"
          >
            <Shield className="w-4 h-4" />
            {t('support.privacy_policy')}
          </Link>
        </div>

        <div className="flex items-center gap-3 border-b border-outline-variant pb-6">
          <div className="p-3 bg-surface text-accent rounded-xl border border-outline-variant">
            <LifeBuoy className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-on-surface">{t('support.title')}</h1>
            <p className="text-sm text-on-surface-variant">{t('support.subtitle')}</p>
          </div>
        </div>

        <div className="bg-surface border border-outline-variant rounded-xl p-6 space-y-3">
          <div className="flex items-center gap-2 text-on-surface font-semibold">
            <Mail className="w-5 h-5 text-accent" />
            <span>{t('support.contact_title')}</span>
          </div>
          <p className="text-sm text-on-surface-variant">
            {t('support.contact_intro')}
          </p>
          <div className="text-sm space-y-1 text-on-surface-variant">
            <p>
              <strong className="text-on-surface">{t('support.email_label')}</strong>{" "}
              <a href="mailto:yilongwang05@gmail.com" className="text-accent underline underline-offset-2 hover:opacity-80">
                yilongwang05@gmail.com
              </a>
            </p>
            <p>
              <strong className="text-on-surface">{t('support.hours_label')}</strong> {t('support.hours_value')}
            </p>
            <p>
              <strong className="text-on-surface">{t('support.response_label')}</strong> {t('support.response_value')}
            </p>
          </div>
        </div>

        <div className="space-y-6 text-sm text-on-surface-variant">
          <div className="flex items-center gap-2 text-base font-semibold text-on-surface border-b border-outline-variant pb-2">
            <HelpCircle className="w-5 h-5 text-accent" />
            <h2>{t('support.faq_title')}</h2>
          </div>

          <div className="space-y-4">
            <div className="space-y-1">
              <h3 className="font-semibold text-on-surface">{t('support.faq_access_title')}</h3>
              <p className="text-on-surface-variant">
                {t('support.faq_access_body')}
              </p>
            </div>

            <div className="space-y-1">
              <h3 className="font-semibold text-on-surface">{t('support.faq_roles_title')}</h3>
              <p className="text-on-surface-variant">
                {t('support.faq_roles_body')}
              </p>
            </div>

            <div className="space-y-1">
              <h3 className="font-semibold text-on-surface">{t('support.faq_notifications_title')}</h3>
              <p className="text-on-surface-variant">
                {t('support.faq_notifications_body')}
              </p>
            </div>

            <div className="space-y-1">
              <h3 className="font-semibold text-on-surface">{t('support.faq_deletion_title')}</h3>
              <p className="text-on-surface-variant">
                {t('support.faq_deletion_body')}{" "}
                <a href="mailto:yilongwang05@gmail.com" className="text-accent underline underline-offset-2 hover:opacity-80">
                  yilongwang05@gmail.com
                </a>
                .
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-base font-semibold text-on-surface border-b border-outline-variant pb-2 pt-4">
            <Smartphone className="w-5 h-5 text-accent" />
            <h2>{t('support.compatibility_title')}</h2>
          </div>

          <ul className="list-disc pl-5 space-y-1 text-on-surface-variant">
            <li><strong className="text-on-surface">{t('support.compatibility_ios_label')}</strong> {t('support.compatibility_ios_body')}</li>
            <li><strong className="text-on-surface">{t('support.compatibility_android_label')}</strong> {t('support.compatibility_android_body')}</li>
            <li><strong className="text-on-surface">{t('support.compatibility_web_label')}</strong> {t('support.compatibility_web_body')}</li>
          </ul>
        </div>

        <div className="pt-8 border-t border-outline-variant text-xs text-on-surface-variant/70 text-center">
          {t('support.footer')}
        </div>
      </div>
    </main>
  );
}
