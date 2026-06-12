// Team Prayer page — built around the team's prayer rhythm:
// the huddle, who's prayed for whom, shared focus, team-wide requests.

const Prayer = ({ onOpenContact }) => {
  const [scope, setScope] = React.useState("all");          // all | team | contacts
  const [filter, setFilter] = React.useState("all");        // all | open | answered
  const [tagFilter, setTagFilter] = React.useState(null);
  const [prayers, setPrayers] = React.useState(PRAYERS);
  const [teamPrayers, setTeamPrayers] = React.useState(TEAM_PRAYERS);
  const [huddleOpen, setHuddleOpen] = React.useState(false);
  const ME = "u1";

  const everyone = [
    ...teamPrayers.map(p => ({ ...p, kind: "team" })),
    ...prayers.map(p => ({ ...p, kind: "contact" })),
  ];
  const allTags = Array.from(new Set(everyone.flatMap(p => p.tags)));

  const filtered = everyone.filter(p => {
    if (scope === "team" && p.kind !== "team") return false;
    if (scope === "contacts" && p.kind !== "contact") return false;
    if (filter !== "all" && p.status !== filter) return false;
    if (tagFilter && !p.tags.includes(tagFilter)) return false;
    return true;
  }).sort((a,b) => {
    // huddle/priority pinned first, then date desc
    const pa = (a.priority === "high" ? 2 : 0);
    const pb = (b.priority === "high" ? 2 : 0);
    if (pa !== pb) return pb - pa;
    return new Date(b.date) - new Date(a.date);
  });

  const togglePray = (id, kind) => {
    if (kind === "team") {
      setTeamPrayers(prev => prev.map(p => p.id === id ? { ...p, prayedBy: p.prayedBy.includes(ME) ? p.prayedBy.filter(x=>x!==ME) : [...p.prayedBy, ME] } : p));
    } else {
      setPrayers(prev => prev.map(p => p.id === id ? { ...p, prayedBy: p.prayedBy.includes(ME) ? p.prayedBy.filter(x=>x!==ME) : [...p.prayedBy, ME] } : p));
    }
  };
  const markAnswered = (id, kind) => {
    if (kind === "team") {
      setTeamPrayers(prev => prev.map(p => p.id === id ? { ...p, status: p.status === "answered" ? "open" : "answered", answeredBody: p.answeredBody || "Answered. ✓" } : p));
    } else {
      setPrayers(prev => prev.map(p => p.id === id ? { ...p, status: p.status === "answered" ? "open" : "answered", answeredBody: p.answeredBody || "Answered. ✓" } : p));
    }
  };

  // stats
  const openCount = everyone.filter(p => p.status === "open").length;
  const answeredCount = everyone.filter(p => p.status === "answered").length;
  const teamCoverage = Math.round(
    everyone.filter(p => p.status === "open").reduce((acc, p) => acc + p.prayedBy.length, 0)
    / Math.max(1, everyone.filter(p => p.status === "open").length * STAFF.length) * 100
  );
  const myPrayed = everyone.filter(p => p.prayedBy.includes(ME)).length;

  // recent log (top 5)
  const recentLog = TEAM_PRAYER_LOG.slice(0, 5);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Team Prayer</h1>
          <div className="page-sub">
            What our team of {STAFF.length} is carrying together this week.
            <span className="muted" style={{marginLeft: 10}}>·</span>
            <strong style={{marginLeft: 10}}>{openCount}</strong> open
            <span className="muted" style={{margin: "0 6px"}}>·</span>
            <strong style={{color: "var(--success)"}}>{answeredCount} answered</strong>
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button className="btn"><Icon name="external" size={13}/> Send to team chat</button>
          <button className="btn btn-primary" onClick={() => setHuddleOpen(true)}>
            <Icon name="praying" size={13}/> Start prayer huddle
          </button>
        </div>
      </div>

      {/* ── Huddle banner ─────────────────────────────────────────── */}
      <div className="huddle-banner">
        <div className="huddle-stripe"></div>
        <div className="huddle-main">
          <div className="row" style={{gap: 10}}>
            <span className="chip s accent"><Icon name="praying" size={10}/> NEXT HUDDLE</span>
            <span className="mono dim" style={{fontSize: 11.5}}>
              {fmtDayLong(HUDDLE_NEXT.date)} · {HUDDLE_NEXT.time} · {HUDDLE_NEXT.location}
            </span>
            <span className="dim" style={{ fontSize: 12 }}>
              facilitated by <strong style={{color:"var(--text)"}}>{staffById(HUDDLE_NEXT.facilitator).name}</strong>
            </span>
          </div>
          <div className="huddle-focus">
            <div className="muted mono" style={{ fontSize: 10.5, letterSpacing: 0.08, textTransform: "uppercase", marginRight: 6 }}>This week's focus —</div>
            {HUDDLE_NEXT.focus.map(id => {
              const p = teamPrayers.find(x => x.id === id) || prayers.find(x => x.id === id);
              if (!p) return null;
              return <span key={id} className="huddle-pill" title={p.body}>{p.title}</span>;
            })}
          </div>
        </div>
        <div className="huddle-side">
          <div className="muted mono" style={{ fontSize: 10, letterSpacing: 0.08, textTransform: "uppercase" }}>Team coverage</div>
          <div className="row" style={{ marginTop: 4, gap: 8 }}>
            <div className="metric-num" style={{fontSize: 22, fontWeight: 600}}>{teamCoverage}<span style={{ fontSize: 12, color: "var(--text-dim)" }}>%</span></div>
            <div className="stack" style={{ gap: 2 }}>
              <div className="bar" style={{ width: 90 }}><span style={{ width: `${teamCoverage}%`, background: "var(--violet)" }}></span></div>
              <div className="muted" style={{ fontSize: 11 }}>
                you've prayed for <strong className="mono" style={{color:"var(--text)"}}>{myPrayed}</strong> of {everyone.length}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Layout: feed + sidebar ─────────────────────────────── */}
      <div className="prayer-layout">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            <div className="seg">
              <button className={scope==="all"?"active":""} onClick={()=>setScope("all")}>All</button>
              <button className={scope==="team"?"active":""} onClick={()=>setScope("team")}>Team-wide ({teamPrayers.length})</button>
              <button className={scope==="contacts"?"active":""} onClick={()=>setScope("contacts")}>For contacts ({prayers.length})</button>
            </div>
            <div className="seg">
              <button className={filter==="all"?"active":""} onClick={()=>setFilter("all")}>All</button>
              <button className={filter==="open"?"active":""} onClick={()=>setFilter("open")}>Open</button>
              <button className={filter==="answered"?"active":""} onClick={()=>setFilter("answered")}>Answered</button>
            </div>
            <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
              {allTags.map(t => (
                <button key={t} className={"chip s " + (tagFilter === t ? "accent" : "")}
                        onClick={()=>setTagFilter(tagFilter === t ? null : t)}
                        style={{ cursor: "pointer" }}>
                  <Icon name="tag" size={10}/>{t}
                </button>
              ))}
            </div>
          </div>

          <div className="prayer-grid">
            {filtered.map(p => (
              <PrayerCard
                key={p.id}
                p={p}
                onPrayed={() => togglePray(p.id, p.kind)}
                onAnswered={() => markAnswered(p.id, p.kind)}
                onOpenContact={onOpenContact}
                me={ME}
              />
            ))}
          </div>
        </div>

        <aside className="prayer-aside">
          {/* Team praying right now */}
          <div className="card">
            <div className="card-head">
              <span className="card-title"><span className="accent">Our team</span></span>
              <span className="muted mono right" style={{fontSize: 10.5}}>{STAFF.length} people</span>
            </div>
            <div style={{ padding: 12 }}>
              {STAFF.map(s => {
                const prayedCount = everyone.filter(p => p.prayedBy.includes(s.id)).length;
                const recently = TEAM_PRAYER_LOG.find(l => l.staff === s.id);
                return (
                  <div className="row" key={s.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--border-soft)" }}>
                    <Avatar initials={s.initials} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500, fontSize: 12.5 }}>{s.name}</div>
                      <div className="dim" style={{ fontSize: 11, marginTop: 1 }}>{s.role}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div className="mono" style={{ fontSize: 12, color: "var(--violet)" }}>{prayedCount}</div>
                      <div className="muted" style={{ fontSize: 10, fontFamily: "var(--font-mono)" }}>
                        {recently ? relTime(recently.when) : "—"}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Recent team prayer log */}
          <div className="card">
            <div className="card-head">
              <span className="card-title"><span className="accent">Recently prayed</span></span>
              <span className="chip s right">{TEAM_PRAYER_LOG.length} entries</span>
            </div>
            <div>
              {recentLog.map(l => {
                const u = staffById(l.staff);
                const target = TEAM_PRAYERS.find(p=>p.id===l.prayedFor) || PRAYERS.find(p=>p.id===l.prayedFor);
                if (!target) return null;
                return (
                  <div className="feed-item" key={l.id} style={{ padding: "10px 12px" }}>
                    <Avatar initials={u.initials} size="s" />
                    <div>
                      <div style={{ fontSize: 12.5 }}>
                        <span className="who">{u.name}</span>{" "}
                        <span className="what">prayed for</span>{" "}
                        <span className="target">{target.title}</span>
                      </div>
                      <div className="dim" style={{ fontSize: 11.5, marginTop: 3, lineHeight: 1.4 }}>
                        <span className={"chip s " + (l.where === "huddle" ? "violet" : l.where === "1:1" ? "" : "")}>
                          <span className="dot"></span>{l.where}
                        </span>
                        {l.note && <span style={{ marginLeft: 6 }}>{l.note}</span>}
                      </div>
                    </div>
                    <span className="time">{relTime(l.when)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>
      </div>

      {/* ── Huddle modal ──────────────────────────────────────────── */}
      {huddleOpen && <HuddleModal onClose={() => setHuddleOpen(false)} prayers={prayers} teamPrayers={teamPrayers} onPrayed={(id,kind)=>togglePray(id,kind)} me={ME} />}
    </div>
  );
};

const PrayerCard = ({ p, onPrayed, onAnswered, onOpenContact, me }) => {
  const c = p.kind === "contact" ? contactById(p.contactId) : null;
  const init = c ? c.name.split(' ').map(x=>x[0]).join('').slice(0,2) : null;
  const iPrayed = p.prayedBy.includes(me);
  const teamCount = STAFF.length;
  const prayedCount = p.prayedBy.length;
  const everyoneOnTeamPrayed = prayedCount === teamCount;

  return (
    <div className={"prayer-card " + (p.status === "answered" ? "answered" : "")}>
      {p.status === "answered" && <div className="ribbon">Answered</div>}
      {p.priority === "high" && p.status !== "answered" && (
        <div className="row" style={{ position: "absolute", top: 10, right: 12, gap: 4 }}>
          <span className="chip s amber"><Icon name="pin" size={10}/>huddle</span>
        </div>
      )}

      <div className="tag-row">
        {p.kind === "team"
          ? <span className="chip s violet"><span className="dot"></span>team-wide</span>
          : <span className="chip s teal"><Icon name="user" size={10}/>{c?.name}</span>}
        {p.tags.map(t => <span key={t} className="chip s"><Icon name="tag" size={10}/>{t}</span>)}
      </div>

      <div className="req">{p.title}</div>
      <div className="dim" style={{ fontSize: 12.5, lineHeight: 1.5 }}>{p.body}</div>

      {p.answeredBody && p.status === "answered" && (
        <div style={{ padding: 10, background: "var(--success-soft)", borderRadius: 6, fontSize: 12.5, color: "var(--text)", borderLeft: "2px solid var(--success)" }}>
          <strong style={{ color: "var(--success)", fontSize: 10.5, textTransform: "uppercase", letterSpacing: 0.08, fontFamily: "var(--font-mono)", display: "block", marginBottom: 3 }}>How God answered</strong>
          {p.answeredBody}
        </div>
      )}

      {/* Team avatars who've prayed */}
      <div style={{ paddingTop: 4, borderTop: "1px dashed var(--border-soft)" }}>
        <div className="muted mono" style={{ fontSize: 10, letterSpacing: 0.08, textTransform: "uppercase", marginBottom: 6 }}>
          Team has prayed
        </div>
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          {STAFF.map(s => {
            const did = p.prayedBy.includes(s.id);
            return (
              <span key={s.id} title={s.name + (did ? " — prayed" : " — not yet")} style={{ opacity: did ? 1 : 0.25, filter: did ? "none" : "grayscale(1)" }}>
                <Avatar initials={s.initials} size="s" />
              </span>
            );
          })}
          <span className="mono muted" style={{ fontSize: 11, marginLeft: 4 }}>
            {prayedCount}/{teamCount}
            {everyoneOnTeamPrayed && p.status !== "answered" && <span style={{ color: "var(--violet)", marginLeft: 4 }}>· all in</span>}
          </span>
        </div>
      </div>

      <div className="pr-foot">
        <button className={"btn btn-sm " + (iPrayed ? "btn-primary" : "")} onClick={onPrayed}>
          <Icon name="heart" size={12}/> {iPrayed ? "Prayed" : "I prayed"}
        </button>
        {c && (
          <button className="btn btn-sm" onClick={() => onOpenContact(c.id)}>
            <Icon name="user" size={12}/> Open
          </button>
        )}
        <button className="btn btn-sm right" onClick={onAnswered}>
          {p.status === "answered" ? "Reopen" : "Mark answered"}
        </button>
      </div>
    </div>
  );
};

// ── Prayer Huddle modal — walks the team through this week's focus ─
const HuddleModal = ({ onClose, prayers, teamPrayers, onPrayed, me }) => {
  const focus = HUDDLE_NEXT.focus
    .map(id => teamPrayers.find(p=>p.id===id) || prayers.find(p=>p.id===id))
    .filter(Boolean)
    .map(p => ({ ...p, kind: teamPrayers.find(x => x.id === p.id) ? "team" : "contact" }));
  const [idx, setIdx] = React.useState(0);
  const cur = focus[idx];
  if (!cur) return null;
  const c = cur.kind === "contact" ? contactById(cur.contactId) : null;
  const iPrayed = cur.prayedBy.includes(me);

  return (
    <div className="scrim" onClick={(e)=>{ if (e.target.classList.contains("scrim")) onClose(); }}>
      <div className="modal" style={{ width: "min(640px, 92vw)" }}>
        <div className="modal-head">
          <Icon name="praying" size={15}/>
          <div style={{ fontWeight: 600 }}>Prayer Huddle</div>
          <span className="muted mono" style={{ fontSize: 11 }}>{idx+1} of {focus.length}</span>
          <button className="icon-btn right" onClick={onClose}><Icon name="x" size={14}/></button>
        </div>
        <div className="modal-body" style={{ padding: 24 }}>
          <div className="row" style={{ gap: 8, marginBottom: 10 }}>
            {cur.kind === "team"
              ? <span className="chip s violet"><span className="dot"></span>team-wide</span>
              : <span className="chip s teal"><Icon name="user" size={10}/>{c?.name}</span>}
            {cur.tags.map(t => <span key={t} className="chip s"><Icon name="tag" size={10}/>{t}</span>)}
          </div>
          <h2 style={{ margin: "4px 0 12px", fontSize: 22, fontWeight: 600, letterSpacing: -0.015 }}>{cur.title}</h2>
          <p style={{ color: "var(--text-dim)", fontSize: 14, lineHeight: 1.6 }}>{cur.body}</p>

          <div style={{ marginTop: 18, padding: 12, background: "var(--panel)", borderRadius: 8, border: "1px solid var(--border-soft)" }}>
            <div className="muted mono" style={{ fontSize: 10, letterSpacing: 0.08, textTransform: "uppercase", marginBottom: 8 }}>
              Team has prayed
            </div>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              {STAFF.map(s => {
                const did = cur.prayedBy.includes(s.id);
                return (
                  <div key={s.id} className="row" style={{ gap: 4, opacity: did ? 1 : 0.4 }}>
                    <Avatar initials={s.initials} size="s" />
                    <span className="dim" style={{ fontSize: 11 }}>{s.name.split(" ")[0]}</span>
                    {did && <Icon name="check" size={11} color="var(--success)" />}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={() => setIdx(Math.max(0, idx-1))} disabled={idx === 0}>← Prev</button>
          <button className={"btn " + (iPrayed ? "btn-primary" : "")} onClick={() => onPrayed(cur.id, cur.kind)}>
            <Icon name="heart" size={12}/> {iPrayed ? "Prayed" : "Lord, hear us"}
          </button>
          {idx < focus.length - 1 ? (
            <button className="btn btn-primary" onClick={() => setIdx(idx+1)}>Next <Icon name="arrow-right" size={13}/></button>
          ) : (
            <button className="btn btn-primary" onClick={onClose}>Close huddle <Icon name="check" size={13}/></button>
          )}
        </div>
      </div>
    </div>
  );
};

window.Prayer = Prayer;
