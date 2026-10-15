import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { MessageSquare } from "lucide-react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { cn, getUserInitials } from "../../lib/utils";
import { useAuth } from "../../components/AuthProvider";
import { Contact } from "../../types";
import PageContainer from "../../components/layout/PageContainer";
import { Avatar, SectionHead } from "../../components/landing/primitives";
import { UpcomingEventsRsvp } from "../../components/landing/UpcomingEventsRsvp";
import FirstRunCard from "../../components/landing/FirstRunCard";
import { useFirstRunRecords } from "../../lib/firstRunRecords";
import {
  subscribePersonalPrayers,
  type PersonalPrayer,
} from "../../lib/personalPrayers";
import { getOrCreateDirectChat } from "../../services/chat";
import { useLanguage } from "../../components/LanguageProvider";

interface FullTimer {
  uid: string;
  name: string;
  email: string;
  photoURL?: string;
}

// Community landing: the gatherings you're welcome to + a way to reach a
// Full-timer. Reach-out opens a direct message, falling back to email.
export default function LandingCommunity() {
  const { user, effectiveUserId, effectiveUserName } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const uid = effectiveUserId || user?.uid;
  const firstName = (effectiveUserName || user?.displayName || user?.email)?.split(" ")[0] || "friend";

  const [fts, setFts] = useState<FullTimer[]>([]);
  const [personalPrayers, setPersonalPrayers] = useState<PersonalPrayer[]>([]);
  const firstRunRecords = useFirstRunRecords("community", uid);

  const activePersonalPrayers = useMemo(
    () =>
      personalPrayers.filter(
        (p) => p.status !== "answered" && p.status !== "archived",
      ),
    [personalPrayers],
  );

  useEffect(() => {
    if (!uid) return;
    return subscribePersonalPrayers(uid, setPersonalPrayers);
  }, [uid]);

  useEffect(() => {
    // Full-timers are the approved admins — query and filter client-side.
    const unsub = onSnapshot(
      query(collection(db, "users"), where("role", "==", "admin")),
      (snap) =>
        setFts(
          snap.docs
            .map((d) => ({ uid: d.id, ...(d.data() as Record<string, unknown>) }))
            .filter((u) => (u as { approved?: boolean }).approved !== false)
            .map((u) => ({
              uid: u.uid,
              name: (u as { displayName?: string }).displayName || "A Full-timer",
              email: (u as { email?: string }).email || "",
              photoURL: (u as { photoURL?: string }).photoURL || undefined,
            })),
        ),
      () => setFts([]),
    );
    return unsub;
  }, []);

  const reachOut = async (ft: FullTimer) => {
    if (!uid) return;
    try {
      await getOrCreateDirectChat(
        { uid, displayName: user?.displayName || "" },
        { uid: ft.uid, displayName: ft.name },
      );
      navigate("/messages");
    } catch {
      // Chat rules may block a DM for some roles — fall back to email.
      if (ft.email) window.location.href = `mailto:${ft.email}`;
    }
  };

  const lead = fts[0];

  return (
    <PageContainer variant="wide">
      <header>
        <p className="text-sm text-on-surface-variant">{format(new Date(), "EEEE, MMMM d")}</p>
        <h1 className="font-serif text-3xl sm:text-4xl text-on-surface mt-1">Hello, {firstName}.</h1>
        <p className="text-base text-on-surface-variant leading-relaxed mt-3 max-w-2xl">
          Here's what's open to you this week and how to contact the campus team.
        </p>
      </header>

      <FirstRunCard
        role="community"
        userId={uid}
        context={{
          prayersCount: activePersonalPrayers.length,
          ...firstRunRecords,
        }}
        className="mt-8"
      />

      {/* ── Open gatherings ── */}
      {/* No "Full calendar" door: Gatherings is staff-facing (it carries the
          contact database), so Community has no calendar page to open. The
          inline list and RSVP below are the whole of what they get. */}
      <UpcomingEventsRsvp
        heading="Open gatherings"
        sub="You're warmly invited."
        emptyText="Nothing on the calendar just yet — check back soon."
      />

      {/* ── Reach out ── */}
      <section className="mt-12">
        <SectionHead title={t("common.reach_out")} sub="Connect directly with the campus team." />
        {lead ? (
          <div className="bg-surface rounded-xl border border-outline-variant/60 p-6 flex flex-col sm:flex-row sm:items-center gap-5">
            <div className="flex shrink-0">
              {fts.slice(0, 4).map((ft, i) => (
                <div key={ft.uid} className={cn("rounded-full ring-2 ring-surface", i > 0 && "-ml-3")}>
                  <Avatar
                    contact={
                      {
                        name: ft.name,
                        avatar: ft.photoURL,
                        initials: getUserInitials(ft.name),
                      } as Contact
                    }
                  />
                </div>
              ))}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-serif text-xl text-on-surface">
                {lead.name.split(" ")[0]} and the team
              </h3>
              <p className="text-sm text-on-surface-variant leading-relaxed mt-1 max-w-2xl">
                Have questions about a student or an upcoming gathering? Send a message anytime.
              </p>
            </div>
            <button
              onClick={() => reachOut(lead)}
              aria-label={`Reach out to ${lead.name}`}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary text-on-primary text-sm font-medium hover:opacity-90 active:scale-[0.98] transition-all focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none shrink-0 cursor-pointer"
            >
              <MessageSquare className="w-4 h-4" aria-hidden="true" /> Reach out
            </button>
          </div>
        ) : (
          <p className="text-sm text-on-surface-variant py-2">
            We'll have someone to connect you with here soon.
          </p>
        )}
      </section>
    </PageContainer>
  );
}
