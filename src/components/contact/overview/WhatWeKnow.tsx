import { Translate } from "../../Translate";
import { useLanguage } from "../../LanguageProvider";

export default function WhatWeKnow({ notes }: { notes?: string }) {
  const { t } = useLanguage();

  return (
    <div className="cd-sec">
      <div className="cd-sec-head">
        <h3 className="cd-sec-title">{t('modals.contactDetails.what_we_know')}</h3>
      </div>
      <div className="cd-prose">
        {notes ? (
          <Translate showOriginalToggle text={notes} />
        ) : (
          t('modals.contactDetails.no_notes')
        )}
      </div>
    </div>
  );
}
