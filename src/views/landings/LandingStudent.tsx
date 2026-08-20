import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { useAuth } from "../../components/AuthProvider";
import PageContainer from "../../components/layout/PageContainer";
import { SectionHead } from "../../components/landing/primitives";
import { UpcomingEventsRsvp } from "../../components/landing/UpcomingEventsRsvp";
import { PersonalPrayerRow, AddPersonalPrayer } from "../../components/landing/PrayerRows";
import { cardClass } from "../../components/landing/helpers";
import {
  subscribePersonalPrayers,
  addPersonalPrayer,
  updatePersonalPrayer,
  deletePersonalPrayer,
  type PersonalPrayer,
} from "../../lib/personalPrayers";
import FirstRunCard from "../../components/landing/FirstRunCard";

// Student landing: what's coming up (with RSVP) + a quiet place to pray for the
// friends on your heart. Friends are just titled personal prayers (no contacts).
export default function LandingStudent() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const uid = user?.uid;
  const firstName = user?.displayName?.split(" ")[0] || "friend";

  const [personalPrayers, setPersonalPrayers] = useState<PersonalPrayer[]>([]);

  useEffect(() => {
    if (!uid) return;
    return subscribePersonalPrayers(uid, setPersonalPrayers);
  }, [uid]);

  const activePersonalPrayers = useMemo(
    () => personalPrayers.filter((p) => p.status !== "archived"),
    [personalPrayers],
  );

  return (
    <PageContainer variant="wide">
      <header>
        <p className="text-sm text-on-surface-variant">
          {format(new Date(), "EEEE, MMMM d")} · Good to see you
        </p>
        <h1 className="font-serif text-3xl sm:text-4xl text-on-surface mt-1">Hi {firstName}.</h1>
        <p className="text-base text-on-surface-variant leading-relaxed mt-3 max-w-2xl">
          Here's what's coming up, and a quiet place to pray for the people on your heart.
        </p>
      </header>

      <FirstRunCard
        role="student"
        userId={uid}
        context={{
          prayersCount: activePersonalPrayers.length,
          messagesCount: 0,
          feedbackCount: 0,
        }}
        className="mt-8"
      />

      {/* ── Coming up ── */}
      <UpcomingEventsRsvp
        heading="Coming up"
        sub="You're always welcome."
        emptyText="Nothing on the calendar just yet — check back soon."
        linkLabel="Full calendar"
        onLink={() => navigate("/attendance")}
      />

      {/* ── Pray for your friends ── */}
      <section className="mt-12">
        <SectionHead
          title="Pray for your friends"
          sub="The people on your heart — just between you and God."
        />
        <div className={cardClass}>
          {activePersonalPrayers.map((p, i) => (
            <PersonalPrayerRow
              key={p.id}
              prayer={p}
              first={i === 0}
              contacts={[]}
              onUpdate={(id, patch) => uid && updatePersonalPrayer(uid, id, patch)}
              onDelete={(id) => uid && deletePersonalPrayer(uid, id)}
              onOpenContact={() => {}}
            />
          ))}
          {activePersonalPrayers.length === 0 && (
            <p className="text-sm text-on-surface-variant py-4">
              No one yet — add the first person on your heart below.
            </p>
          )}
          <AddPersonalPrayer
            onAdd={(title) => uid && addPersonalPrayer(uid, { title })}
            addLabel="Add someone"
            placeholder="Who's on your heart? e.g. “Daniel — finals stress”"
          />
        </div>
      </section>

      <p className="mt-14 text-sm text-on-surface-variant italic">
        You belong here — exactly as you are today.
      </p>
    </PageContainer>
  );
}
