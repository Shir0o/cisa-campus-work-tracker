import React, { useEffect, useState } from "react";
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
import { getOrCreateDirectChat } from "../../services/chat";

interface FullTimer {
  uid: string;
  name: string;
  email: string;
  photoURL?: string;
}

// Community landing: the gatherings you're welcome to + a way to reach a
// Full-timer. Reach-out opens a direct message, falling back to email.
export default function LandingCommunity() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const uid = user?.uid;
  const firstName = user?.displayName?.split(" ")[0] || "friend";

  const [fts, setFts] = useState<FullTimer[]>([]);

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
          Thank you for being part of the family around these students. Here's what's open to you,
          and the team is always glad to hear from you.
        </p>
      </header>

      <FirstRunCard
        role="community"
        userId={uid}
        context={{
          prayersCount: 0,
          messagesCount: 0,
          feedbackCount: 0,
        }}
        className="mt-8"
      />

      {/* ── Open gatherings ── */}
      <UpcomingEventsRsvp
        heading="Open gatherings"
        sub="You're warmly invited."
        emptyText="Nothing on the calendar just yet — check back soon."
        linkLabel="Full calendar"
        onLink={() => navigate("/attendance")}
      />

      {/* ── Reach out ── */}
      <section className="mt-12">
        <SectionHead title="Reach out" sub="The team would love to hear from you — anytime." />
        {lead ? (
          <div className="bg-surface rounded-3xl border border-outline-variant/60 p-6 flex flex-col sm:flex-row sm:items-center gap-5">
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
                {lead.name.split(" ")[0]} and the team are glad you're here
              </h3>
              <p className="text-sm text-on-surface-variant leading-relaxed mt-1 max-w-2xl">
                Questions about a student, a gathering, or anything at all? They coordinate it all
                and would love to hear from you — no need to wait for the right moment.
              </p>
            </div>
            <button
              onClick={() => reachOut(lead)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary text-on-primary text-sm font-medium hover:opacity-90 transition-opacity shrink-0"
            >
              <MessageSquare className="w-4 h-4" /> Reach out
            </button>
          </div>
        ) : (
          <p className="text-sm text-on-surface-variant py-2">
            We'll have someone to connect you with here soon.
          </p>
        )}
      </section>

      <p className="mt-14 text-sm text-on-surface-variant italic">
        Thank you for making room for these students.
      </p>
    </PageContainer>
  );
}
