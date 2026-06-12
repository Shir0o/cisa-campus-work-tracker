// Role-aware landing pages — "Field notes" treatment, one strong direction each.
// FT (Tony) → a shared coordination desk. Trainee (Zion) → caseload + mentor.
// Student (Timothy) → gatherings + a note + pray for friends. Community (Philip) → lightest touch.

const lpTrunc = (s, n) => (s && s.length > n ? s.slice(0, n).replace(/\s+\S*$/, "") + "…" : s);
const lpInitials = (name) => name.split(" ").map(x => x[0]).join("").slice(0, 2);
const lpLastInteraction = (cid) =>
  INTERACTIONS.filter(i => i.contactId === cid).sort((a, b) => new Date(b.date) - new Date(a.date))[0];
const lpConnected = (d) => d === 0 ? "Connected today" : d === 1 ? "Last connected yesterday" : `Last connected ${d} days ago`;
const lpDaysOpen = (iso) => Math.max(1, Math.round((Date.now() - new Date(iso)) / 86400000));

// ── shared little pieces ─────────────────────────────────────────────────────
const LPSectionHead = ({ title, sub, linkLabel, onLink }) => (
  <div className="dash-sec-head">
    <h2 className="dash-sec-title">{title}</h2>
    {sub && <span className="dash-sec-sub">{sub}</span>}
    {linkLabel && <span className="dash-sec-link" onClick={onLink}>{linkLabel} <Icon name="arrow-right" size={14} /></span>}
  </div>
);

const LPAvStack = ({ ids }) => (
  <div className="avstack">
    {ids.map(id => { const u = staffById(id); return <Avatar key={id} initials={u.initials} size="s" />; })}
  </div>
);

// ── FT — Tony — the team's shared desk (replaces Google Docs) ─────────────────
const LandingFT = ({ persona, onOpen, onToast, feel }) => {
  const pinned = COORDINATION_NOTES.find(n => n.pinned);
  const notes = COORDINATION_NOTES.filter(n => !n.pinned);

  return (
    <div className="page dash lp" data-role="ft" data-feel={feel}>
      <header className="dash-head">
        <div>
          <div className="dash-eyebrow">Wednesday, May 13 · Week 9 · The team's shared desk</div>
          <h1 className="dash-greeting">Good morning, {persona.first}.</h1>
          <p className="dash-state">
            This is where the five of you think together — the <b>notes</b> you all keep,
            what you've <b>learned</b>, and the <b>fellowships</b> you're tending. Nothing
            important should live only in someone's inbox.
          </p>
        </div>
        <div className="dash-actions">
          <button className="btn" onClick={() => onToast("New note started — share it with the team.")}><Icon name="doc" size={15} /> New note</button>
          <button className="btn btn-primary" onClick={() => onToast("Jotted down — added to learnings.")}><Icon name="plus" size={15} /> Add a learning</button>
        </div>
      </header>

      {/* Coordination notes */}
      <section className="dash-sec">
        <LPSectionHead title="Coordination notes" sub="The running page you all edit" />
        <div className="lp-pin card">
          <div className="lp-pin-bar">
            <span className="lp-pin-tag"><Icon name="pin" size={12} /> Pinned · this week</span>
            <span className="lp-edited">edited {relTime(pinned.updated)} by {staffById(pinned.updatedBy).name.split(" ")[0]}</span>
          </div>
          <div className="card-body">
            <h3 className="lp-pin-title">{pinned.title}</h3>
            <p className="lp-pin-body">{pinned.body}</p>
            <div className="lp-checks">
              {pinned.items.map((it, i) => (
                <div className={"lp-check " + (it.done ? "done" : "")} key={i}>
                  <span className="lp-box">{it.done && <Icon name="check" size={11} />}</span>
                  <span className="lp-check-text">{it.text}</span>
                  <Avatar initials={staffById(it.who).initials} size="s" />
                </div>
              ))}
            </div>
            <div className="lp-pin-foot">
              <LPAvStack ids={pinned.contributors} />
              <span className="lp-foot-note">{pinned.contributors.length} people keep this up to date</span>
            </div>
          </div>
        </div>

        <div className="lp-docs">
          {notes.map(n => (
            <div className="lp-doc" key={n.id} onClick={() => onToast(`Opening “${n.title}”…`)}>
              <div className="lp-doc-ico"><Icon name="doc" size={16} /></div>
              <div className="lp-doc-main">
                <div className="lp-doc-title">{n.title}</div>
                <div className="lp-doc-snip">{n.body}</div>
              </div>
              <div className="lp-doc-side">
                <LPAvStack ids={n.contributors} />
                <span className="lp-doc-time">{relTime(n.updated)}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Learnings */}
      <section className="dash-sec">
        <LPSectionHead title="Learnings from the past" sub="What this season has been teaching you" />
        <div className="lp-learn-grid">
          {LEARNINGS.map(l => (
            <article className="lp-learn card" key={l.id}>
              <div className="card-body">
                <div className="lp-tags">{l.tags.map(t => <span className="lp-tag" key={t}>{t}</span>)}</div>
                <h3 className="lp-learn-title">{l.title}</h3>
                <p className="lp-learn-body">{l.body}</p>
                <div className="lp-by">
                  <Avatar initials={staffById(l.author).initials} size="s" />
                  <span>{staffById(l.author).name} · {fmtDay(l.date)}</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Fellowships */}
      <section className="dash-sec">
        <LPSectionHead title="Fellowships" sub="The groups you're tending" linkLabel="Gatherings" onLink={() => onOpen("attendance")} />
        <div className="lp-fellow-grid">
          {FELLOWSHIPS.map(f => {
            const leader = staffById(f.leaderId);
            return (
              <div className="lp-fellow card" key={f.id}>
                <div className="card-body">
                  <span className={"chip s " + f.tone}><span className="dot"></span>{f.rhythm}</span>
                  <h3 className="lp-fellow-name">{f.name}</h3>
                  <div className="lp-fellow-place">{f.place}</div>
                  <p className="lp-fellow-note">{f.note}</p>
                  <div className="lp-fellow-foot">
                    <span className="lp-fellow-leader"><Avatar initials={leader.initials} size="s" /> {leader.name.split(" ")[0]} leads</span>
                    <span className="lp-fellow-size">{f.size} people</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="lp-foot-line">A shared place to think together — so the team stays one mind.</div>
    </div>
  );
};

// ── Trainee — Zion — your people, your mentor, your prayers ───────────────────
const LandingTrainee = ({ persona, onOpenContact, onOpen, onToast, feel }) => {
  const mine = CONTACTS.filter(c => c.owner === persona.staffId).sort((a, b) => b.lastTouch - a.lastTouch);
  const mentor = staffById(persona.mentorId);
  const myPrayers = PRAYERS
    .filter(p => p.status === "open" && (mine.some(c => c.id === p.contactId) || (p.prayedBy || []).includes(persona.staffId)))
    .slice(0, 4);
  const [prayedToday, setPrayedToday] = React.useState({});

  return (
    <div className="page dash lp" data-role="trainee" data-feel={feel}>
      <header className="dash-head">
        <div>
          <div className="dash-eyebrow">Wednesday, May 13 · Your second semester on staff</div>
          <h1 className="dash-greeting">Good morning, {persona.first}.</h1>
          <p className="dash-state">
            You're walking with <b>{mine.length} students</b> this season. Here's your circle,
            a word from {mentor.name.split(" ")[0]}, and what you're carrying in prayer.
          </p>
        </div>
      </header>

      {/* Mentor note */}
      <section className="dash-sec" style={{ marginTop: 30 }}>
        <div className="lp-mentor card">
          <div className="card-body">
            <div className="lp-mentor-head">
              <Avatar initials={mentor.initials} size="l" />
              <div className="lp-mentor-id">
                <div className="lp-mentor-from">A note from {mentor.name}</div>
                <div className="lp-mentor-role">{mentor.role} · your mentor</div>
              </div>
              <span className="lp-mentor-when">2h ago</span>
            </div>
            <p className="lp-mentor-body">
              Zion — proud of how you sat with Lila's hard question instead of rushing it. Two nudges:
              text Rio the night before Thursday's coffee so it doesn't slip, and don't let Kofi go a
              second week without a hello. You're doing the quiet, faithful work. Let's talk Friday.
            </p>
            <div className="lp-mentor-foot">
              <button className="btn btn-sm" onClick={() => onToast("Reply sent to " + mentor.name.split(" ")[0] + ".")}><Icon name="msg" size={14} /> Reply</button>
              <button className="btn btn-sm" onClick={() => onToast("Marked — you'll see it Friday.")}>Talk Friday</button>
            </div>
          </div>
        </div>
      </section>

      {/* Your people */}
      <section className="dash-sec">
        <LPSectionHead title="Your people" sub="The students in your care" linkLabel="See all" onLink={() => onOpen("contacts")} />
        <div className="reach-list">
          {mine.map(c => {
            const li = lpLastInteraction(c.id);
            const note = li ? `${li.title} — ${lpTrunc(li.body, 90)}` : c.notes;
            return (
              <div className="reach" key={c.id} onClick={() => onOpenContact(c.id)} style={{ cursor: "pointer" }}>
                <div className="reach-l">
                  <Avatar initials={lpInitials(c.name)} size="l" />
                  <div className="reach-who">
                    <div className="reach-top">
                      <span className="reach-name">{c.name}</span>
                      <StageChip stage={c.stage} size="s" />
                    </div>
                    <div className="reach-since">{lpConnected(c.lastTouch)}</div>
                    <div className="reach-note">{note}</div>
                  </div>
                </div>
                <div className="reach-cta" onClick={(e) => e.stopPropagation()}>
                  <button className="btn btn-sm" onClick={() => onToast(`Message to ${c.name.split(" ")[0]} opened.`)}><Icon name="msg" size={14} /> Message</button>
                  <button className="btn btn-sm btn-primary" onClick={() => onOpenContact(c.id)}>Open</button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Prayers you're carrying */}
      <section className="dash-sec">
        <LPSectionHead title="Prayers you're carrying" sub="Held by you this week" linkLabel="All prayers" onLink={() => onOpen("prayer")} />
        <div className="card">
          <div className="card-body" style={{ paddingTop: 4, paddingBottom: 4 }}>
            {myPrayers.map(p => {
              const c = contactById(p.contactId);
              const done = prayedToday[p.id];
              return (
                <div className="pray-row" key={p.id}>
                  <div>
                    <div className="pray-title">{p.title}</div>
                    <span className="pray-for" onClick={() => c && onOpenContact(p.contactId)}>for {c ? c.name : "the team"}</span>
                    <div className="pray-body">{lpTrunc(p.body, 150)}</div>
                  </div>
                  <div className="pray-side">
                    <span className="pray-open">held {lpDaysOpen(p.date)} days</span>
                    <button className={"lp-prayed-btn " + (done ? "is-done" : "")} onClick={() => { setPrayedToday(s => ({ ...s, [p.id]: true })); onToast("Marked — prayed today."); }}>
                      <Icon name={done ? "check" : "praying"} size={13} /> {done ? "Prayed today" : "I prayed"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <div className="lp-foot-line">Small, steady faithfulness is the whole job.</div>
    </div>
  );
};

// ── Student — Timothy — gatherings, a note, pray for friends ──────────────────
const LandingStudent = ({ persona, onOpen, onToast, feel }) => {
  const carer = staffById(persona.caredById);
  const events = EVENTS.slice().sort((a, b) => new Date(a.date) - new Date(b.date)).slice(0, 3);
  const [rsvp, setRsvp] = React.useState({});
  const [friends, setFriends] = React.useState(STUDENT_FRIENDS);
  const [newFriend, setNewFriend] = React.useState("");

  const addFriend = () => {
    const t = newFriend.trim();
    if (!t) return;
    const name = t.split("—")[0].split(":")[0].trim().split(" ").slice(0, 2).join(" ") || "A friend";
    setFriends(f => [{ id: "fx" + Date.now(), name, initials: lpInitials(name), note: t, prayed: false }, ...f]);
    setNewFriend("");
    onToast("Added — held in prayer.");
  };

  return (
    <div className="page dash lp lp-member" data-role="student" data-feel={feel}>
      <header className="dash-head">
        <div>
          <div className="dash-eyebrow">Wednesday, May 13 · Good to see you</div>
          <h1 className="dash-greeting">Hi {persona.first}.</h1>
          <p className="dash-state">
            Here's what's coming up, a note from {carer.name.split(" ")[0]}, and a quiet place
            to pray for the people on your heart.
          </p>
        </div>
      </header>

      {/* Note from the person who cares for them */}
      <section className="dash-sec" style={{ marginTop: 30 }}>
        <div className="lp-mentor card">
          <div className="card-body">
            <div className="lp-mentor-head">
              <Avatar initials={carer.initials} size="l" />
              <div className="lp-mentor-id">
                <div className="lp-mentor-from">A note from {carer.name}</div>
                <div className="lp-mentor-role">{carer.role}</div>
              </div>
              <span className="lp-mentor-when">yesterday</span>
            </div>
            <p className="lp-mentor-body">
              Hey Timothy — loved talking music with you last week. No pressure at all, but we'd
              love to have you at Friday's gathering; I'll save you a seat. And if that question
              about heaven is still rattling around, bring it. Glad you're around.
            </p>
            <div className="lp-mentor-foot">
              <button className="btn btn-sm" onClick={() => onToast("Reply sent to " + carer.name.split(" ")[0] + ".")}><Icon name="msg" size={14} /> Say hi back</button>
            </div>
          </div>
        </div>
      </section>

      {/* Coming up */}
      <section className="dash-sec">
        <LPSectionHead title="Coming up" sub="You're always welcome" linkLabel="Full calendar" onLink={() => onOpen("attendance")} />
        <div className="lp-invites">
          {events.map(ev => {
            const going = rsvp[ev.id];
            return (
              <div className="lp-invite card" key={ev.id}>
                <div className="card-body">
                  <div className="lp-invite-date">
                    <div className="d">{dayNum(ev.date)}</div>
                    <div className="m">{dayMonth(ev.date)}</div>
                  </div>
                  <div className="lp-invite-main">
                    <h3 className="lp-invite-title">{ev.title}</h3>
                    <div className="lp-invite-meta">{ev.time} · {ev.location}</div>
                  </div>
                  <button className={"btn btn-sm " + (going ? "" : "btn-primary")} onClick={() => { setRsvp(s => ({ ...s, [ev.id]: !going })); onToast(going ? "No worries — maybe next time." : "Count you in — see you there!"); }}>
                    {going ? <span><Icon name="check" size={13} /> Coming</span> : "I'll be there"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Pray for your friends */}
      <section className="dash-sec">
        <LPSectionHead title="Pray for your friends" sub="The people on your heart" />
        <div className="card">
          <div className="card-body">
            <div className="lp-compose">
              <input
                className="lp-compose-input"
                placeholder="Who's on your heart? e.g. “Daniel — finals stress”"
                value={newFriend}
                onChange={e => setNewFriend(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") addFriend(); }}
              />
              <button className="btn btn-primary btn-sm" onClick={addFriend}><Icon name="plus" size={13} /> Add</button>
            </div>
            <div className="lp-friends">
              {friends.map(fr => (
                <div className="lp-friend" key={fr.id}>
                  <Avatar initials={fr.initials} size="l" />
                  <div className="lp-friend-main">
                    <div className="lp-friend-name">{fr.name}</div>
                    <div className="lp-friend-note">{fr.note}</div>
                  </div>
                  <button
                    className={"lp-heart " + (fr.prayed ? "is-on" : "")}
                    title={fr.prayed ? "Prayed" : "Mark as prayed"}
                    onClick={() => { setFriends(list => list.map(x => x.id === fr.id ? { ...x, prayed: !x.prayed } : x)); if (!fr.prayed) onToast("Prayed for " + fr.name.split(" ")[0] + "."); }}
                  >
                    <Icon name="heart" size={15} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="lp-foot-line">You belong here — exactly as you are today.</div>
    </div>
  );
};

// ── Community — Philip — lightest touch ───────────────────────────────────────
const LandingCommunity = ({ persona, onOpen, onToast, feel }) => {
  const events = EVENTS.filter(e => e.attended.length === 0 || e.type === "Weekly Gathering" || e.type === "Special")
    .sort((a, b) => new Date(a.date) - new Date(b.date)).slice(0, 3);
  const [prayer, setPrayer] = React.useState("");

  const sharePrayer = () => {
    if (!prayer.trim()) return;
    setPrayer("");
    onToast("Thank you — our team will be praying.");
  };

  return (
    <div className="page dash lp lp-member" data-role="community" data-feel={feel}>
      <header className="dash-head">
        <div>
          <div className="dash-eyebrow">Wednesday, May 13</div>
          <h1 className="dash-greeting">Welcome, {persona.first}.</h1>
          <p className="dash-state">
            You're always welcome here. Come to a gathering, share something to pray for, or
            reach out to someone on our team whenever you're ready.
          </p>
        </div>
      </header>

      {/* Open gatherings */}
      <section className="dash-sec" style={{ marginTop: 30 }}>
        <LPSectionHead title="You're welcome to come" sub="Open to anyone — just show up" linkLabel="All gatherings" onLink={() => onOpen("attendance")} />
        <div className="lp-invites">
          {events.map(ev => (
            <div className="lp-invite card" key={ev.id}>
              <div className="card-body">
                <div className="lp-invite-date">
                  <div className="d">{dayNum(ev.date)}</div>
                  <div className="m">{dayMonth(ev.date)}</div>
                </div>
                <div className="lp-invite-main">
                  <h3 className="lp-invite-title">{ev.title}</h3>
                  <div className="lp-invite-meta">{ev.time} · {ev.location}</div>
                </div>
                <button className="btn btn-sm" onClick={() => onToast("Sent you the details — hope to see you!")}>Let us know</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Share a prayer request */}
      <section className="dash-sec">
        <LPSectionHead title="Share a prayer request" sub="Whatever you share stays with our staff team" />
        <div className="card">
          <div className="card-body">
            <textarea
              className="lp-prayer-area"
              placeholder="Is there something we can pray for?"
              rows={3}
              value={prayer}
              onChange={e => setPrayer(e.target.value)}
            />
            <div className="lp-prayer-foot">
              <span className="lp-prayer-hint">Held quietly and with care.</span>
              <button className="btn btn-primary btn-sm" onClick={sharePrayer}><Icon name="praying" size={13} /> Share with the team</button>
            </div>
          </div>
        </div>
      </section>

      {/* Want to go deeper */}
      <section className="dash-sec">
        <LPSectionHead title="Want to go deeper?" sub="No pressure — only when you're ready" />
        <div className="lp-connect card">
          <div className="card-body">
            <div className="lp-connect-faces">
              {persona.connectIds.map(id => { const u = staffById(id); return <Avatar key={id} initials={u.initials} size="l" />; })}
            </div>
            <div className="lp-connect-main">
              <h3 className="lp-connect-title">Grab a coffee with someone on our team</h3>
              <p className="lp-connect-body">
                Have a question, want to talk, or curious about a small group? Someone here would
                genuinely love to meet you — your pace, your call.
              </p>
            </div>
            <button className="btn btn-primary" onClick={() => onToast("Someone from the team will reach out soon.")}><Icon name="coffee" size={15} /> Reach out</button>
          </div>
        </div>
      </section>

      <div className="lp-foot-line">There's a place for you here, whenever you want it.</div>
    </div>
  );
};

// ── dispatcher ────────────────────────────────────────────────────────────────
const Landing = ({ role, ...props }) => {
  const persona = PERSONAS[role] || PERSONAS.ft;
  const shared = { persona, ...props };
  if (role === "trainee") return <LandingTrainee {...shared} />;
  if (role === "student") return <LandingStudent {...shared} />;
  if (role === "community") return <LandingCommunity {...shared} />;
  return <MyDayFT {...shared} />;
};

window.Landing = Landing;
