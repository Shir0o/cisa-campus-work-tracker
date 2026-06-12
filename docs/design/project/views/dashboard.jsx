// Dashboard — "Field notes": warm, people-first, metrics woven into prose.

const truncate = (s, n) => (s && s.length > n ? s.slice(0, n).replace(/\s+\S*$/, "") + "…" : s);

const lastInteractionFor = (cid) =>
  INTERACTIONS.filter(i => i.contactId === cid).sort((a, b) => new Date(b.date) - new Date(a.date))[0];

const Dashboard = ({ onOpenContact, onOpen, onQuickAdd, mood = "warm", feel = "blues" }) => {
  const upcomingEvents = EVENTS.slice().sort((a, b) => new Date(a.date) - new Date(b.date)).slice(0, 4);
  const newThisWeek = CONTACTS.filter(c => c.joinedDays <= 14).sort((a, b) => a.joinedDays - b.joinedDays);
  const needsFollowup = CONTACTS.filter(c => c.lastTouch >= 5).sort((a, b) => b.lastTouch - a.lastTouch);
  const openPrayers = PRAYERS.filter(p => p.status === "open");
  const carrying = openPrayers
    .filter(p => p.contactId)
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 4);

  // attendance rate, kept small and quiet
  let present = 0, total = 0;
  Object.values(ATTENDANCE).forEach(row => Object.values(row).forEach(m => { total++; if (m === "present") present++; }));
  const attRate = Math.round((present / total) * 100);

  const daysOpen = (iso) => Math.max(1, Math.round((Date.now() - new Date(iso)) / 86400000));
  const connectedLabel = (d) => d === 0 ? "Connected today" : d === 1 ? "Last connected yesterday" : `Last connected ${d} days ago`;

  return (
    <div className="page dash" data-mood={mood} data-feel={feel}>
      {/* ---- Greeting + state of things, in prose ---- */}
      <header className="dash-head">
        <div>
          <div className="dash-eyebrow">Wednesday, May 13 · Week 9 of the spring semester</div>
          <h1 className="dash-greeting">Good morning, Mei.</h1>
          <p className="dash-state">
            <b>{CONTACTS.length} students</b> are in your care this semester — <span className="num">{newThisWeek.length}</span> of
            them new in the last two weeks. You haven't connected with <span className="num">{needsFollowup.length}</span> of
            them in over a week, and <span className="num">{openPrayers.length}</span> prayers are still open across the team.
          </p>
        </div>
        <div className="dash-actions">
          <button className="btn" onClick={() => onOpen("prayer")}>
            <Icon name="praying" size={15} /> Pray together
          </button>
          <button className="btn btn-primary" onClick={onQuickAdd}>
            <Icon name="plus" size={15} /> Add someone
          </button>
        </div>
      </header>

      {/* ---- People to reach out to (the heart of the page) ---- */}
      <section className="dash-sec">
        <div className="dash-sec-head">
          <h2 className="dash-sec-title">People to reach out to</h2>
          <span className="dash-sec-sub">It's been a little while since you last connected.</span>
          <span className="dash-sec-link" onClick={() => onOpen("contacts")}>See everyone <Icon name="arrow-right" size={14} /></span>
        </div>
        <div className="reach-list">
          {needsFollowup.slice(0, 4).map(c => {
            const li = lastInteractionFor(c.id);
            const note = li ? `${li.title} — ${truncate(li.body, 96)}` : c.notes;
            const owner = staffById(c.owner);
            return (
              <div className="reach" key={c.id} onClick={() => onOpenContact(c.id)} style={{ cursor: "pointer" }}>
                <div className="reach-l">
                  <Avatar initials={c.name.split(" ").map(x => x[0]).join("").slice(0, 2)} size="l" />
                  <div className="reach-who">
                    <div className="reach-top">
                      <span className="reach-name">{c.name}</span>
                      <StageChip stage={c.stage} size="s" />
                    </div>
                    <div className="reach-since">{connectedLabel(c.lastTouch)}</div>
                    <div className="reach-note">
                      {note} <span className="meta">· cared for by {owner.name.split(" ")[0]}</span>
                    </div>
                  </div>
                </div>
                <div className="reach-cta" onClick={(e) => e.stopPropagation()}>
                  <button className="btn btn-sm"><Icon name="msg" size={14} /> Message</button>
                  <button className="btn btn-sm btn-primary" onClick={() => onOpenContact(c.id)}>Open</button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ---- New faces  +  This week ---- */}
      <div className="dash-cols">
        <section className="dash-sec" style={{ marginTop: 44 }}>
          <div className="dash-sec-head">
            <h2 className="dash-sec-title">New faces</h2>
            <span className="dash-sec-sub">Joined in the last two weeks</span>
          </div>
          <div className="card">
            <div className="card-body" style={{ paddingTop: 4, paddingBottom: 4 }}>
              <div className="gentle">
                {newThisWeek.slice(0, 5).map(c => (
                  <div className="gentle-row" key={c.id} onClick={() => onOpenContact(c.id)}>
                    <Avatar initials={c.name.split(" ").map(x => x[0]).join("").slice(0, 2)} size="l" />
                    <div>
                      <div className="g-name">{c.name}</div>
                      <div className="g-meta">{c.year} · {c.major} · joined {c.joinedDays}d ago</div>
                    </div>
                    <StageChip stage={c.stage} size="s" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="dash-sec" style={{ marginTop: 44 }}>
          <div className="dash-sec-head">
            <h2 className="dash-sec-title">This week</h2>
            <span className="dash-sec-link" onClick={() => onOpen("attendance")}>Calendar <Icon name="arrow-right" size={14} /></span>
          </div>
          <div className="card">
            <div className="card-body" style={{ paddingTop: 4, paddingBottom: 4 }}>
              {upcomingEvents.map(ev => (
                <div className="tw-row" key={ev.id}>
                  <div className="tw-date">
                    <div className="d">{dayNum(ev.date)}</div>
                    <div className="m">{dayMonth(ev.date)}</div>
                  </div>
                  <div>
                    <div className="tw-title">{ev.title}</div>
                    <div className="tw-meta">{ev.time} · {ev.location}</div>
                  </div>
                  <span className="chip s">{ev.attended.length ? `${ev.attended.length} coming` : "open"}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* ---- Prayers we're carrying ---- */}
      <section className="dash-sec">
        <div className="dash-sec-head">
          <h2 className="dash-sec-title">Prayers we're carrying</h2>
          <span className="dash-sec-sub">Held by the team this week</span>
          <span className="dash-sec-link" onClick={() => onOpen("prayer")}>All prayers <Icon name="arrow-right" size={14} /></span>
        </div>
        <div className="card">
          <div className="card-body" style={{ paddingTop: 4, paddingBottom: 4 }}>
            {carrying.map(p => {
              const c = contactById(p.contactId);
              return (
                <div className="pray-row" key={p.id}>
                  <div>
                    <div className="pray-title">{p.title}</div>
                    <span className="pray-for" onClick={() => onOpenContact(p.contactId)}>for {c.name}</span>
                    <div className="pray-body">{truncate(p.body, 150)}</div>
                  </div>
                  <div className="pray-side">
                    <div className="avstack">
                      {p.prayedBy.slice(0, 4).map(uid => {
                        const u = staffById(uid);
                        return <Avatar key={uid} initials={u.initials} size="s" />;
                      })}
                    </div>
                    <span className="pray-open">held {daysOpen(p.date)} days</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ---- Quiet figures: present, but never the headline ---- */}
      <div className="dash-figures">
        <div className="fig"><span className="fig-n">{CONTACTS.length}</span><span className="fig-l">in our care</span></div>
        <div className="fig"><span className="fig-n">{newThisWeek.length}</span><span className="fig-l">newly arrived</span></div>
        <div className="fig"><span className="fig-n">{attRate}%</span><span className="fig-l">showing up</span></div>
        <div className="fig"><span className="fig-n">{openPrayers.length}</span><span className="fig-l">prayers open</span></div>
        <span className="dash-figures-note">Numbers are just a way of noticing people.</span>
      </div>
    </div>
  );
};

window.Dashboard = Dashboard;
