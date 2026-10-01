import { Briefcase, Camera, Mail, Phone, Sparkles } from "lucide-react";
import { useLanguage } from "../../LanguageProvider";
import type { Contact } from "../../../types";

export default function HowToReach({
  contact,
  firstName,
}: {
  contact: Contact;
  firstName: string;
}) {
  const { t } = useLanguage();

  return (
    <div className="cd-sec">
      <div className="cd-sec-head">
        <h3 className="cd-sec-title">{t('modals.contactDetails.how_to_reach').replace('{name}', firstName)}</h3>
      </div>
      <div className="cd-kv">
        {contact.phone && (
          <div className="cd-kv-row">
            <Phone className="w-3.5 h-3.5 cd-kv-ico" />
            <span className="cd-kv-val">{contact.phone}</span>
          </div>
        )}
        {contact.email && (
          <div className="cd-kv-row">
            <Mail className="w-3.5 h-3.5 cd-kv-ico" />
            <span className="cd-kv-val dim">{contact.email}</span>
          </div>
        )}
        {contact.instagram && (
          <div className="cd-kv-row">
            <Camera className="w-3.5 h-3.5 cd-kv-ico" />
            <span className="cd-kv-val dim">{contact.instagram}</span>
          </div>
        )}
        {contact.role && (
          <div className="cd-kv-row">
            <Briefcase className="w-3.5 h-3.5 cd-kv-ico" />
            <span className="cd-kv-val dim">{contact.role}</span>
          </div>
        )}
        {contact.spiritualBackground && (
          <div className="cd-kv-row">
            <Sparkles className="w-3.5 h-3.5 cd-kv-ico" />
            <span className="cd-kv-val dim">{contact.spiritualBackground}</span>
          </div>
        )}
        {!contact.phone && !contact.email && !contact.instagram && !contact.role && !contact.spiritualBackground && (
          <div className="cd-empty">{t('modals.contactDetails.none_yet')}</div>
        )}
      </div>
    </div>
  );
}
