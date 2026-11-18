import { useState } from "react";
import { useAuth } from "../AuthProvider";
import { useLanguage } from "../LanguageProvider";
import {
  ANNOUNCEMENT_MAX_LENGTH,
  gotItProgress,
  postAnnouncement,
  useAnnouncements,
  useTeamUsers,
  yourAnnouncements,
} from "../../lib/announcements";
import { cn, relTime } from "../../lib/utils";

// A Full-timer's side of Announcements, on My Day: a small box to post one, and
// under it what they posted this past week with who has not got it yet.
export default function AnnouncementComposer({ className }: { className?: string }) {
  const { user, role } = useAuth();
  const { t } = useLanguage();
  const isFullTimer = role === "admin";
  const uid = user?.uid;
  const list = useAnnouncements();
  const team = useTeamUsers(isFullTimer);
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [failed, setFailed] = useState(false);

  if (!isFullTimer || !uid) return null;

  const mine = yourAnnouncements(list, uid);
  const canPost = body.trim().length > 0 && !posting;

  const post = async () => {
    if (!canPost) return;
    setPosting(true);
    setFailed(false);
    try {
      await postAnnouncement(body);
      setBody("");
    } catch {
      setFailed(true);
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void post();
        }}
        className="bg-surface rounded-xl border border-outline-variant/60 p-4 sm:p-5"
      >
        <label htmlFor="announcement-body" className="block text-sm font-medium text-on-surface">
          {t("announcements.compose_label")}
        </label>
        <textarea
          id="announcement-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={ANNOUNCEMENT_MAX_LENGTH}
          rows={2}
          className="mt-2 w-full px-3 py-2 bg-surface-container border border-outline rounded-xl text-sm text-on-surface focus:border-primary outline-none resize-y"
        />
        <div className="mt-2 flex items-center gap-3">
          <button
            type="submit"
            disabled={!canPost}
            className="inline-flex items-center px-4 py-2 rounded-full bg-primary text-on-primary text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
          >
            {posting ? t("announcements.posting") : t("announcements.post")}
          </button>
          {failed && (
            <span role="alert" className="text-xs text-error">
              {t("announcements.post_failed")}
            </span>
          )}
        </div>
      </form>

      {mine.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-on-surface-variant mb-2">{t("announcements.yours_heading")}</h2>
          <ul className="flex flex-col gap-3">
            {mine.map((a) => {
              const { got, total, missing } = gotItProgress(a, team);
              return (
                <li
                  key={a.id}
                  data-testid="your-announcement"
                  className="bg-surface rounded-xl border border-outline-variant/60 p-4 sm:p-5"
                >
                  <p className="text-sm text-on-surface leading-relaxed whitespace-pre-wrap break-words">{a.body}</p>
                  {team.length > 0 && (
                    <>
                      <p className="mt-2 text-xs text-on-surface-variant">
                        <span className="font-medium text-on-surface">
                          {t("announcements.progress").replace("{got}", String(got)).replace("{total}", String(total))}
                        </span>
                        {a.createdAt && <> · {relTime(a.createdAt)}</>}
                      </p>
                      {missing.length > 0 && (
                        <p className="mt-1 text-xs text-on-surface-variant">
                          {t("announcements.waiting_on").replace("{names}", missing.map((u) => u.displayName).join(", "))}
                        </p>
                      )}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
