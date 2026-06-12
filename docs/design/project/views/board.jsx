// The Board — FT shared coordination surface (+ My Day placeholder).
// A weekly rhythm of coordination sessions, each with a running agenda and a
// delegated checklist; discussion becomes notes you can find again by series.

const bdInitials = (name) => (name || "").split(" ").map(x => x[0]).join("").slice(0, 2);
const bdFirst = (id) => { const s = staffById(id); return s ? s.name.split(" ")[0] : ""; };
const bdClone = (x) => JSON.parse(JSON.stringify(x));

const BdCatChip = ({ cat }) => {
  const c = BOARD_CATEGORIES[cat];
  if (!c) return null;
  return <span className={"chip s " + (c.tone || "")}><span className="dot"></span>{c.label}</span>;
};

// Small teammate picker — anchored under whatever opens it.
const AssigneePicker = ({ current, onPick, onClose, align = "right" }) => (
  <React.Fragment>
    <div className="bd-pick-scrim" onClick={onClose}></div>
    <div className={"bd-pick " + align} role="menu">
      <div className="bd-pick-head">Hand this to…</div>
      {STAFF.map(u => (
        <button key={u.id} className={"bd-pick-row " + (u.id === current ? "on" : "")}
                role="menuitem" onClick={() => onPick(u.id)}>
          <Avatar initials={u.initials} size="s" />
          <span className="bd-pick-name">{u.name}</span>
          <span className="bd-pick-role">{u.role}</span>
          {u.id === current && <Icon name="check" size={13} />}
        </button>
      ))}
    </div>
  </React.Fragment>
);

// ── My Day — Tony's personal cockpit ──────────────────────────────────────────
// The counterpart to The Board: not the team's shared mind, but Tony's own day —
// what's his to carry, the leaders he's discipling, where he's needed this week,
// and the prayers he's holding. People-first; metrics demoted to a quiet footer.
const mdLastInteraction = (cid) =>
  INTERACTIONS.filter(i => i.contactId === cid).sort((a, b) => new Date(b.date) - new Date(a.date))[0];
const mdConnected = (d) => d === 0 ? "Connected today" : d === 1 ? "Last connected yesterday" : `Last connected ${d} days ago`;
const mdDaysOpen = (iso) => Math.max(1, Math.round((Date.now() - new Date(iso)) / 86400000));
const mdTrunc = (s, n) => (s && s.length > n ? s.slice(0, n).replace(/\s+\S*$/, "") + "…" : s);

const MyDayFT = ({ persona, onOpen, onOpenContact, onToast, feel }) => {
  const me = persona.staffId || "u1";

  // The students Tony personally carries — for a director, the student leaders.
  const mine = CONTACTS.filter(c => c.owner === me).sort((a, b) => b.lastTouch - a.lastTouch);
  const stale = mine[0];                       // longest since he last connected
  const staleWeeks = stale ? Math.max(1, Math.round(stale.lastTouch / 7)) : 0;

  // Prayers Tony is personally carrying (he's among those praying), oldest first.
  const myOpenPrayers = PRAYERS
    .filter(p => p.status === "open" && (p.prayedBy || []).includes(me))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  const carrying = myOpenPrayers.slice(0, 4);

  // What's his to do this week — drawn from his tasks + board commitments.
  const plate = [
    { id: "md-fri", text: "On the door with Ana, welcoming new faces", ctx: "Friday gathering", due: "Friday", tone: "soon" },
    { id: "md-sade", text: "Plan Sade's leader 1:1 — what to walk through", contactId: "C-0188", contactName: "Sade Mensah", due: "In 3 days", tone: "" },
    { id: "md-retreat", text: "Draft the retreat partial-aid plan", ctx: "Spring retreat", due: "By Monday", tone: "" },
  ];
  const [done, setDone] = React.useState({});
  const toggle = (id) => {
    setDone(s => ({ ...s, [id]: !s[id] }));
    if (!done[id]) onToast("Done — one thing lighter.");
  };
  const leftToDo = plate.filter(p => !done[p.id]).length;

  // This week's gatherings he has a hand in.
  const week = [
    { ev: EVENTS.find(e => e.id === "E-2001"), role: "On the door for new faces" },
    { ev: EVENTS.find(e => e.id === "E-2003"), role: "You're facilitating" },
  ].filter(x => x.ev).sort((a, b) => new Date(a.ev.date) - new Date(b.ev.date));

  // Tomorrow's prayer huddle — a gentle start to his morning.
  const allPrayers = [...PRAYERS, ...TEAM_PRAYERS];
  const huddleFocus = HUDDLE_NEXT.focus.map(id => (allPrayers.find(p => p.id === id) || {}).title).filter(Boolean);
  const huddleLead = staffById(HUDDLE_NEXT.facilitator);

  // Prayers carried — interactive "I prayed" like the trainee landing.
  const [prayed, setPrayed] = React.useState({});

  return (
    <div className="page dash md-page" data-role="ft" data-feel={feel}>
      {/* Greeting + the state of his own day, in prose */}
      <header className="dash-head">
        <div>
          <div className="dash-eyebrow">Wednesday, May 13 · Week 9 · Your day</div>
          <h1 className="dash-greeting">Good morning, {persona.first}.</h1>
          <p className="dash-state">
            You're walking closely with <b>{mine.length} student leaders</b> this season, and
            there are <span className="num">{leftToDo}</span> things that are yours to tend before the week is out.
            {stale && <> It's been <b>{staleWeeks} weeks</b> since you sat with {stale.name.split(" ")[0]} — maybe today.</>}
            {" "}And <span className="num">{myOpenPrayers.length}</span> prayers are still yours to carry.
          </p>
        </div>
        <div className="dash-actions">
          <button className="btn" onClick={() => onOpen("prayer")}><Icon name="praying" size={15} /> Pray together</button>
          <button className="btn btn-primary" onClick={() => onOpen("board")}><Icon name="board" size={15} /> The team's board</button>
        </div>
      </header>

      {/* On your plate — the actionable heart of the day */}
      <section className="dash-sec">
        <div className="dash-sec-head">
          <h2 className="dash-sec-title">On your plate</h2>
          <span className="dash-sec-sub">{leftToDo > 0 ? `${leftToDo} small things, yours to carry this week.` : "All clear — nothing waiting on you."}</span>
        </div>
        <div className="card">
          <div className="card-body" style={{ paddingTop: 6, paddingBottom: 6 }}>
            <div className="md-plate">
              {plate.map(p => {
                const isDone = done[p.id];
                return (
                  <div className={"md-task " + (isDone ? "done" : "")} key={p.id}>
                    <button className={"bd-check " + (isDone ? "is-on" : "")} onClick={() => toggle(p.id)}
                            title={isDone ? "Done — tap to reopen" : "Mark done"}>
                      {isDone && <Icon name="check" size={12} />}
                    </button>
                    <div className="md-task-main">
                      <div className="md-task-text">{p.text}</div>
                      <div className="md-task-meta">
                        {p.contactId
                          ? <span className="md-task-link" onClick={() => onOpenContact(p.contactId)}>{p.contactName}</span>
                          : <span className="md-task-ctx">{p.ctx}</span>}
                      </div>
                    </div>
                    {!isDone && <span className={"md-due " + p.tone}>{p.due}</span>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* The leaders he's personally discipling */}
      <section className="dash-sec">
        <div className="dash-sec-head">
          <h2 className="dash-sec-title">The leaders you're walking with</h2>
          <span className="dash-sec-sub">The students you disciple personally.</span>
          <span className="dash-sec-link" onClick={() => onOpen("contacts")}>See everyone <Icon name="arrow-right" size={14} /></span>
        </div>
        <div className="reach-list">
          {mine.map(c => {
            const li = mdLastInteraction(c.id);
            const note = li ? `${li.title} — ${mdTrunc(li.body, 96)}` : c.notes;
            return (
              <div className="reach" key={c.id} onClick={() => onOpenContact(c.id)} style={{ cursor: "pointer" }}>
                <div className="reach-l">
                  <Avatar initials={bdInitials(c.name)} size="l" />
                  <div className="reach-who">
                    <div className="reach-top">
                      <span className="reach-name">{c.name}</span>
                      <StageChip stage={c.stage} size="s" />
                    </div>
                    <div className="reach-since">{mdConnected(c.lastTouch)}</div>
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

      {/* Your week — the huddle, then the gatherings he's part of */}
      <section className="dash-sec">
        <div className="dash-sec-head">
          <h2 className="dash-sec-title">Your week</h2>
          <span className="dash-sec-sub">Where you're needed.</span>
          <span className="dash-sec-link" onClick={() => onOpen("attendance")}>Full calendar <Icon name="arrow-right" size={14} /></span>
        </div>

        <div className="card md-huddle">
          <div className="card-body">
            <div className="md-huddle-eyebrow">Tomorrow · {HUDDLE_NEXT.time} · {HUDDLE_NEXT.location}</div>
            <h3 className="md-huddle-title">The team prayer huddle</h3>
            <p className="md-huddle-lead">
              {huddleLead.name.split(" ")[0]} is leading. Before the day starts, the five of you will
              pray through what you're each carrying:
            </p>
            <div className="md-focus">
              {huddleFocus.map((t, i) => <span className="md-focus-item" key={i}>{t}</span>)}
            </div>
          </div>
        </div>

        <div className="card" style={{ marginTop: 14 }}>
          <div className="card-body" style={{ paddingTop: 4, paddingBottom: 4 }}>
            {week.map(({ ev, role }) => (
              <div className="tw-row" key={ev.id}>
                <div className="tw-date">
                  <div className="d">{dayNum(ev.date)}</div>
                  <div className="m">{dayMonth(ev.date)}</div>
                </div>
                <div>
                  <div className="tw-title">{ev.title}</div>
                  <div className="tw-meta">{ev.time} · {ev.location}</div>
                </div>
                <span className="chip s accent"><span className="dot"></span>{role}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Prayers you're carrying — with an "I prayed today" */}
      <section className="dash-sec">
        <div className="dash-sec-head">
          <h2 className="dash-sec-title">Prayers you're carrying</h2>
          <span className="dash-sec-sub">Held by you this week.</span>
          <span className="dash-sec-link" onClick={() => onOpen("prayer")}>All prayers <Icon name="arrow-right" size={14} /></span>
        </div>
        <div className="card">
          <div className="card-body" style={{ paddingTop: 4, paddingBottom: 4 }}>
            {carrying.map(p => {
              const c = contactById(p.contactId);
              const isPrayed = prayed[p.id];
              return (
                <div className="pray-row" key={p.id}>
                  <div>
                    <div className="pray-title">{p.title}</div>
                    {c && <span className="pray-for" onClick={() => onOpenContact(p.contactId)}>for {c.name}</span>}
                    <div className="pray-body">{mdTrunc(p.body, 150)}</div>
                  </div>
                  <div className="pray-side">
                    <span className="pray-open">held {mdDaysOpen(p.date)} days</span>
                    <button className={"lp-prayed-btn " + (isPrayed ? "is-done" : "")}
                            onClick={() => { setPrayed(s => ({ ...s, [p.id]: true })); onToast("Marked — prayed today."); }}>
                      <Icon name={isPrayed ? "check" : "praying"} size={13} /> {isPrayed ? "Prayed today" : "I prayed"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Quiet figures — present, never the headline */}
      <div className="dash-figures">
        <div className="fig"><span className="fig-n">{mine.length}</span><span className="fig-l">leaders you carry</span></div>
        <div className="fig"><span className="fig-n">{myOpenPrayers.length}</span><span className="fig-l">prayers you hold</span></div>
        <div className="fig"><span className="fig-n">{leftToDo}</span><span className="fig-l">to tend this week</span></div>
        <div className="fig"><span className="fig-n">{week.length}</span><span className="fig-l">gatherings you're part of</span></div>
        <span className="dash-figures-note">Numbers are just a way of noticing people.</span>
      </div>
    </div>
  );
};

// ── The Board ─────────────────────────────────────────────────────────────────
const BoardFT = ({ onOpen, onToast, feel, home, onSetHome }) => {
  const initial = (BOARD_SESSIONS.find(s => s.status === "today") || BOARD_SESSIONS[0]).id;
  const [sessions, setSessions] = React.useState(() => bdClone(BOARD_SESSIONS));
  const [focusId, setFocusId] = React.useState(initial);

  // note archive controls
  const [q, setQ] = React.useState("");
  const [series, setSeries] = React.useState("All");
  const [kind, setKind] = React.useState("All");

  // agenda composer
  const [draft, setDraft] = React.useState("");
  const [draftCat, setDraftCat] = React.useState("care");
  const [target, setTarget] = React.useState(initial);

  const focus = sessions.find(s => s.id === focusId) || sessions[0];
  const futureSessions = sessions.filter(s => s.status !== "done");

  const mutate = (sid, fn) => setSessions(list => list.map(s => s.id === sid ? fn(bdClone(s)) : s));

  const toggleItem = (sid, aid) => mutate(sid, s => {
    s.agenda = s.agenda.map(a => a.id === aid
      ? { ...a, status: a.status === "covered" ? "open" : "covered" } : a);
    return s;
  });

  const pushItem = (sid, aid) => {
    const idx = sessions.findIndex(s => s.id === sid);
    const next = sessions.slice(idx + 1).find(s => s.status !== "done") || futureSessions.find(s => s.id !== sid);
    if (!next) { onToast("No later session to push to."); return; }
    const item = focus.agenda.find(a => a.id === aid);
    setSessions(list => list.map(s => {
      if (s.id === sid) return { ...s, agenda: s.agenda.map(a => a.id === aid ? { ...a, status: "pushed", pushedTo: next.weekday } : a) };
      if (s.id === next.id) return { ...s, agenda: [{ ...item, id: aid + "-c", status: "open", carriedFrom: s0Weekday(sessions, sid), pushedTo: undefined }, ...s.agenda] };
      return s;
    }));
    onToast(`Pushed to ${next.weekday}.`);
  };

  const addItem = () => {
    const text = draft.trim();
    if (!text) return;
    const tgt = sessions.find(s => s.id === target) || focus;
    setSessions(list => list.map(s => s.id === tgt.id
      ? { ...s, agenda: [...s.agenda, { id: "a-new-" + Date.now(), text, cat: draftCat, raisedBy: "u1", status: "open" }] }
      : s));
    setDraft("");
    onToast(tgt.id === focus.id ? "Added to this session." : `Added to ${tgt.weekday}'s session.`);
  };

  // sub-items on an agenda item (display + toggle + reassign; no inline creation)
  const [pickFor, setPickFor] = React.useState(null);    // `${aid}:${actId}` for sub-items; `t:${gid}`/`tnew` for tasks

  const editAction = (sid, aid, actId, fn) => mutate(sid, s => {
    s.agenda = s.agenda.map(a => a.id === aid
      ? { ...a, actions: (a.actions || []).map(g => g.id === actId ? fn(g) : g) }
      : a);
    return s;
  });

  const toggleAction = (sid, aid, actId) => editAction(sid, aid, actId, g => ({ ...g, done: !g.done }));

  // inline sub-step composer (which agenda item is currently taking a new step)
  const [subFor, setSubFor] = React.useState(null);
  const [subDraft, setSubDraft] = React.useState("");

  const addAction = (sid, aid) => {
    const text = subDraft.trim();
    if (!text) return;
    mutate(sid, s => {
      s.agenda = s.agenda.map(a => a.id === aid
        ? { ...a, actions: [...(a.actions || []), { id: "g-new-" + Date.now(), text, done: false }] }
        : a);
      return s;
    });
    setSubDraft("");   // keep the composer open for rapid entry
  };

  // standalone side-panel task list (decoupled from agenda actions)
  const [adding, setAdding] = React.useState(false);
  const [taskDraft, setTaskDraft] = React.useState("");
  const [taskWho, setTaskWho] = React.useState("u1");

  const toggleAssigned = (sid, gid) => mutate(sid, s => {
    s.assigned = (s.assigned || []).map(g => g.id === gid ? { ...g, done: !g.done } : g);
    return s;
  });

  const assignTask = (sid, gid, who) => {
    mutate(sid, s => {
      s.assigned = (s.assigned || []).map(g => g.id === gid ? { ...g, who } : g);
      return s;
    });
    setPickFor(null);
    onToast(`Handed to ${bdFirst(who)}.`);
  };

  const addTask = () => {
    const text = taskDraft.trim();
    if (!text) return;
    mutate(focus.id, s => {
      s.assigned = [...(s.assigned || []), { id: "t-new-" + Date.now(), text, who: taskWho, done: false }];
      return s;
    });
    onToast(`Assigned to ${bdFirst(taskWho)}.`);
    setTaskDraft("");
    setAdding(false);
    setPickFor(null);
  };

  // push an agenda item over to the Tasks panel — user picks who carries it there
  const pushToTasks = (a) => {
    setTaskDraft(a.text);
    setTaskWho(a.raisedBy || "u1");
    setAdding(true);
    setPickFor(null);
    onToast("Sent to Tasks — choose who carries it.");
    setTimeout(() => { const el = document.querySelector(".bd-assign-input"); if (el) el.focus(); }, 40);
  };

  // filtered notes
  const ql = q.trim().toLowerCase();
  const notes = BOARD_NOTES.filter(n => {
    if (series !== "All" && n.series !== series) return false;
    if (kind === "Records" && n.type !== "record") return false;
    if (kind === "Learnings" && n.type !== "learning") return false;
    if (ql) {
      const hay = (n.title + " " + n.body + " " + n.series + " " + n.tags.join(" ")).toLowerCase();
      if (!hay.includes(ql)) return false;
    }
    return true;
  });

  const openCount = focus.agenda.filter(a => a.status === "open").length;
  const statusLabel = { done: "Wrapped", today: "Today", upcoming: "Upcoming" };

  return (
    <div className="page dash bd-page" data-feel={feel}>
      {/* Header */}
      <header className="dash-head">
        <div>
          <div className="dash-eyebrow">Wednesday, May 13 · Week 9</div>
          <h1 className="dash-greeting">The Board</h1>
          <p className="dash-state">
            Where the five of you think together — every <b>coordination session</b>, what's
            been <b>assigned</b>, and everything you've <b>learned</b>. Nothing important should
            live in one person's inbox.
          </p>
        </div>
      </header>

      {/* Week switcher — pick a day */}
      <section className="dash-sec bd-week-sec">
        <div className="bd-switch" role="tablist" aria-label="This week's sessions">
          {sessions.map(s => {
            const n = s.agenda.filter(a => a.status !== "pushed").length;
            return (
              <button
                key={s.id}
                role="tab"
                aria-selected={s.id === focusId}
                className={"bd-switch-day " + s.status + (s.id === focusId ? " is-focus" : "")}
                onClick={() => { setFocusId(s.id); if (s.status !== "done") setTarget(s.id); }}
              >
                <span className="bd-switch-mark">
                  {s.status === "today"
                    ? <span className="bd-switch-now">Today</span>
                    : s.status === "done"
                      ? <Icon name="check" size={12} />
                      : <span className="bd-switch-dot"></span>}
                </span>
                <span className="bd-switch-wd">{s.weekday}</span>
                <span className="bd-switch-date">{s.dateLabel}</span>
                <span className="bd-switch-n">{n} item{n === 1 ? "" : "s"}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Focused session */}
      <section className="dash-sec bd-session-sec">
        <div className="bd-session card">
          <div className="bd-session-head">
            <div className="bd-session-when">
              <div className="bd-session-wd">{focus.weekday}</div>
              <div className="bd-session-date">{focus.dateLabel}</div>
            </div>
            <div className="bd-session-id">
              <div className="bd-session-event">{focus.event}</div>
              <div className="bd-session-meta">{focus.time} · {focus.place}</div>
            </div>
            <div className="bd-session-side">
              <span className={"chip s " + (focus.status === "today" ? "accent" : focus.status === "upcoming" ? "" : "success")}>
                <span className="dot"></span>{statusLabel[focus.status]}
              </span>
            </div>
          </div>

          <div className="bd-cols">
            <div className="bd-agenda">
            <div className="bd-col-head">
              <h3 className="bd-col-title">Agenda</h3>
              <span className="bd-col-sub">{openCount} to talk through</span>
            </div>
            <div className="bd-items">
              {focus.agenda.filter(a => a.status !== "pushed").map(a => {
                const acts = a.actions || [];
                return (
                  <div className={"bd-item " + a.status} key={a.id}>
                    <button className={"bd-check " + (a.status === "covered" ? "is-on" : "")}
                            onClick={() => toggleItem(focus.id, a.id)}
                            title={a.status === "covered" ? "Covered" : "Mark covered"}>
                      {a.status === "covered" && <Icon name="check" size={12} />}
                    </button>
                    <div className="bd-item-main">
                      <div className="bd-item-text">{a.text}</div>
                      <div className="bd-item-meta">
                        {a.carriedFrom && <span className="bd-carried"><Icon name="arrow-right" size={11} /> carried from {a.carriedFrom}</span>}
                        <BdCatChip cat={a.cat} />
                        <span className="bd-raised">{bdFirst(a.raisedBy)} raised this</span>
                      </div>

                      {(acts.length > 0 || subFor === a.id) && (
                        <div className="bd-actions">
                          {acts.map(g => (
                            <div className={"bd-action " + (g.done ? "done" : "")} key={g.id}>
                              <button className="bd-check sm" onClick={() => toggleAction(focus.id, a.id, g.id)}
                                      title={g.done ? "Done — tap to reopen" : "Mark done"}>
                                {g.done && <Icon name="check" size={11} />}
                              </button>
                              <span className="bd-action-text" onClick={() => toggleAction(focus.id, a.id, g.id)}>{g.text}</span>
                            </div>
                          ))}
                          {subFor === a.id && (
                            <div className="bd-action-new">
                              <span className="bd-check sm ghostadd"></span>
                              <input className="bd-action-input" autoFocus value={subDraft}
                                     placeholder="Add a step…  (Enter to keep going)"
                                     onChange={e => setSubDraft(e.target.value)}
                                     onKeyDown={e => {
                                       if (e.key === "Enter") addAction(focus.id, a.id);
                                       if (e.key === "Escape") { setSubFor(null); setSubDraft(""); }
                                     }} />
                              <button className="bd-action-done" onClick={() => { setSubFor(null); setSubDraft(""); }} title="Done adding">
                                <Icon name="check" size={13} />
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {focus.status !== "done" && (
                        <div className="bd-item-tools">
                          <button className="bd-tool" onClick={() => { setSubFor(subFor === a.id ? null : a.id); setSubDraft(""); }}>
                            <Icon name="plus" size={12} /> Add a step
                          </button>
                          <button className="bd-tool" onClick={() => pushToTasks(a)} title="Hand this off to the Tasks panel">
                            Send to tasks <Icon name="arrow-right" size={12} />
                          </button>
                        </div>
                      )}
                    </div>
                    {focus.status !== "done" && a.status !== "covered" && (
                      <button className="bd-push" onClick={() => pushItem(focus.id, a.id)} title="Push to the next session">
                        Push <Icon name="arrow-right" size={12} />
                      </button>
                    )}
                  </div>
                );
              })}
              {focus.agenda.filter(a => a.status === "pushed").map(a => (
                <div className="bd-item pushed-out" key={a.id}>
                  <span className="bd-check ghost"><Icon name="arrow-right" size={11} /></span>
                  <div className="bd-item-main">
                    <div className="bd-item-text">{a.text}</div>
                    <div className="bd-item-meta"><span className="bd-pushed-note">moved to {a.pushedTo}'s session</span></div>
                  </div>
                </div>
              ))}
            </div>

            <div className="bd-compose">
              <input
                className="bd-compose-input"
                placeholder="Add something to talk through…"
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") addItem(); }}
              />
              <div className="bd-compose-row">
                <select className="bd-select" value={draftCat} onChange={e => setDraftCat(e.target.value)} title="Category">
                  {Object.entries(BOARD_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <select className="bd-select" value={target} onChange={e => setTarget(e.target.value)} title="Which session">
                  {futureSessions.map(s => <option key={s.id} value={s.id}>{s.id === focus.id ? "This session" : s.weekday}</option>)}
                </select>
                <button className="btn btn-sm btn-primary" onClick={addItem}><Icon name="plus" size={13} /> Add to agenda</button>
              </div>
            </div>
            </div>

            {/* Standalone task list — sticky so it stays in reach on a long agenda */}
            <aside className="bd-assign">
              <div className="bd-col-head">
                <h3 className="bd-col-title">Tasks</h3>
                {focus.status !== "done" && !adding && (
                  <button className="bd-assign-add" onClick={() => setAdding(true)} title="Add a task">
                    <Icon name="plus" size={13} /> Add
                  </button>
                )}
              </div>
              {adding && (
                <div className="bd-assign-new">
                  <input className="bd-assign-input" autoFocus value={taskDraft}
                         placeholder="What needs doing?"
                         onChange={e => setTaskDraft(e.target.value)}
                         onKeyDown={e => { if (e.key === "Enter") addTask(); if (e.key === "Escape") { setAdding(false); setTaskDraft(""); } }} />
                  <div className="bd-task-assign">
                    <button className="bd-task-who" onClick={() => setPickFor(pickFor === "tnew" ? null : "tnew")}
                            title={"To " + staffById(taskWho).name}>
                      <Avatar initials={staffById(taskWho).initials} size="s" />
                    </button>
                    {pickFor === "tnew" && (
                      <AssigneePicker current={taskWho}
                                      onPick={(who) => { setTaskWho(who); setPickFor(null); }}
                                      onClose={() => setPickFor(null)} />
                    )}
                  </div>
                  <button className="btn btn-sm btn-primary" onClick={addTask} disabled={!taskDraft.trim()}>Add</button>
                  <button className="bd-assign-cancel" onClick={() => { setAdding(false); setTaskDraft(""); setPickFor(null); }} title="Cancel">
                    <Icon name="x" size={14} />
                  </button>
                </div>
              )}
              <div className="bd-tasks">
                {(focus.assigned || []).map(g => (
                  <div className={"bd-task " + (g.done ? "done" : "")} key={g.id}>
                    <button className="bd-check sm" onClick={() => toggleAssigned(focus.id, g.id)}
                            title={g.done ? "Done — tap to reopen" : "Mark done"}>
                      {g.done && <Icon name="check" size={11} />}
                    </button>
                    <span className="bd-task-text" onClick={() => toggleAssigned(focus.id, g.id)}>{g.text}</span>
                    <div className="bd-task-assign">
                      <button className="bd-task-who" onClick={() => setPickFor(pickFor === "t:" + g.id ? null : "t:" + g.id)}
                              title={"Carried by " + staffById(g.who).name + " — tap to reassign"}>
                        <Avatar initials={staffById(g.who).initials} size="s" />
                      </button>
                      {pickFor === "t:" + g.id && (
                        <AssigneePicker current={g.who}
                                        onPick={(who) => assignTask(focus.id, g.id, who)}
                                        onClose={() => setPickFor(null)} />
                      )}
                    </div>
                  </div>
                ))}
                {(focus.assigned || []).length === 0 && !adding && (
                  <div className="bd-tasks-empty">Nothing being carried yet.</div>
                )}
              </div>
            </aside>
          </div>
        </div>
      </section>

      {/* Notes & learnings */}
      <section className="dash-sec">
        <div className="dash-sec-head">
          <h2 className="dash-sec-title">Notes &amp; learnings</h2>
          <span className="dash-sec-sub">Every session becomes a record — running it again? Find last time's notes.</span>
        </div>

        <div className="bd-notes-controls">
          <div className="bd-search">
            <Icon name="search" size={14} />
            <input placeholder="Search notes — e.g. “Friday gathering”, “retreat”, “welcome”…" value={q} onChange={e => setQ(e.target.value)} />
            {q && <button className="bd-search-x" onClick={() => setQ("")}><Icon name="x" size={13} /></button>}
          </div>
          <div className="bd-seg">
            {["All", "Records", "Learnings"].map(k => (
              <button key={k} className={"bd-seg-btn " + (kind === k ? "on" : "")} onClick={() => setKind(k)}>{k}</button>
            ))}
          </div>
        </div>

        <div className="bd-chips">
          {["All", ...BOARD_SERIES].map(s => (
            <button key={s} className={"bd-chip " + (series === s ? "on" : "")} onClick={() => setSeries(s)}>{s}</button>
          ))}
        </div>

        <div className="bd-notes">
          {notes.map(n => (
            <article className={"bd-note card " + n.type} key={n.id}>
              <div className="bd-note-body">
                <div className="bd-note-top">
                  <span className={"bd-note-kind " + n.type}>{n.type === "record" ? "Record" : "Learning"}</span>
                  <span className="bd-note-series"><Icon name="tag" size={11} /> {n.series}</span>
                  <span className="bd-note-date">{n.lastYear && <span className="bd-yr">1 yr</span>}{n.dateLabel}</span>
                </div>
                <h4 className="bd-note-title">{n.title}</h4>
                <p className="bd-note-text">{n.body}</p>
                <div className="bd-note-foot">
                  <div className="avstack">{n.contributors.map(id => <Avatar key={id} initials={staffById(id).initials} size="s" />)}</div>
                  <span className="bd-note-tags">{n.tags.map(t => <span className="bd-mini-tag" key={t}>#{t}</span>)}</span>
                </div>
              </div>
            </article>
          ))}
          {notes.length === 0 && (
            <div className="bd-empty">No notes match that yet — try a different word or series.</div>
          )}
        </div>
      </section>

      <div className="lp-foot-line">A shared place to think together — so the team stays one mind.</div>
    </div>
  );
};

// helper: weekday of a session by id (used when carrying an item forward)
function s0Weekday(list, sid) { const s = list.find(x => x.id === sid); return s ? s.weekday : ""; }

window.BoardFT = BoardFT;
window.MyDayFT = MyDayFT;
