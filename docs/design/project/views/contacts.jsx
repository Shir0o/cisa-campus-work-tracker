// People — "Field notes": a warm directory, people first. No table, no ID
// codes, no monospace. Sorted so the folks we haven't seen in a while rise up.

const pplTruncate = (s, n) => (s && s.length > n ? s.slice(0, n).replace(/\s+\S*$/, "") + "…" : s);

const lastInteractionForList = (cid) =>
  INTERACTIONS.filter(i => i.contactId === cid).sort((a, b) => new Date(b.date) - new Date(a.date))[0];

const connectedLabelList = (d) =>
  d === 0 ? "Connected today" :
  d === 1 ? "Last connected yesterday" :
  `Last connected ${d} days ago`;

const Contacts = ({ onOpenContact, onQuickAdd, isMobile }) => {
  const [search, setSearch] = React.useState("");
  const [stageFilter, setStageFilter] = React.useState("all");

  const newCount = CONTACTS.filter(c => c.joinedDays <= 14).length;
  const reachCount = CONTACTS.filter(c => c.lastTouch >= 7).length;

  const filtered = CONTACTS
    .filter(c => {
      if (stageFilter !== "all" && c.stage !== stageFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!(c.name.toLowerCase().includes(q) || c.major.toLowerCase().includes(q) || c.hall.toLowerCase().includes(q))) return false;
      }
      return true;
    })
    .slice()
    .sort((a, b) => b.lastTouch - a.lastTouch);

  const stageCount = (id) => CONTACTS.filter(c => c.stage === id).length;

  return (
    <div className="page ppl">
      <header className="ppl-head">
        <div className="ppl-head-row">
          <div>
            <h1 className="ppl-h1">People</h1>
          </div>
          <div className="ppl-head-actions">
            <button className="btn btn-primary" onClick={onQuickAdd}><Icon name="plus" size={15}/> Add someone</button>
          </div>
        </div>
        <p className="ppl-state">
          <b>{CONTACTS.length} students</b> you're walking with this semester — <span className="num">{newCount}</span> new
          in the last two weeks, and <span className="num">{reachCount}</span> you haven't connected with in over a week.
        </p>
      </header>

      <div className="ppl-controls">
        <div className="ppl-search">
          <Icon name="search" size={15} />
          <input placeholder="Find someone by name…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="ppl-stages">
          <button className={"ppl-pill" + (stageFilter === "all" ? " on" : "")} onClick={() => setStageFilter("all")}>
            Everyone <span className="pn">{CONTACTS.length}</span>
          </button>
          {STAGES.map(s => (
            <button key={s.id} className={"ppl-pill" + (stageFilter === s.id ? " on" : "")} onClick={() => setStageFilter(s.id)}>
              <span className={"pd " + s.tone}></span>{s.name} <span className="pn">{stageCount(s.id)}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="ppl-count">
        {filtered.length === CONTACTS.length
          ? `${CONTACTS.length} people, the ones we've seen least first`
          : `${filtered.length} of ${CONTACTS.length} people`}
      </div>

      {isMobile ? (
        <div style={{ marginTop: 10 }}>
          {filtered.map(c => {
            const owner = staffById(c.owner);
            const init = c.name.split(' ').map(x => x[0]).join('').slice(0, 2);
            const overdue = c.lastTouch >= 7;
            return (
              <div key={c.id} className="contact-card" onClick={() => onOpenContact(c.id)} style={{ cursor: "pointer" }}>
                <Avatar initials={init} size="l" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                    <strong style={{ fontFamily: "var(--font-serif)", fontWeight: 500, fontSize: 16 }}>{c.name}</strong>
                    <StageChip stage={c.stage} size="s" />
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--text-mute)", marginTop: 3 }}>{c.year} · {c.major}</div>
                  <div className={"ppl-mob-since" + (overdue ? " is-overdue" : "")} style={{ marginTop: 6 }}>
                    {connectedLabelList(c.lastTouch)} · with {owner.name.split(' ')[0]}
                  </div>
                </div>
                <Icon name="chev" size={15} color="var(--text-mute)" />
              </div>
            );
          })}
          {filtered.length === 0 && <div className="ppl-empty">No one matches that just yet.</div>}
        </div>
      ) : (
        <div className="ppl-list">
          {filtered.map(c => {
            const owner = staffById(c.owner);
            const init = c.name.split(' ').map(x => x[0]).join('').slice(0, 2);
            const li = lastInteractionForList(c.id);
            const note = li ? `${li.title} — ${pplTruncate(li.body, 104)}` : c.notes;
            const overdue = c.lastTouch >= 7;
            const isLeader = c.tags.includes("leader-track");
            return (
              <div key={c.id} className="ppl-row" onClick={() => onOpenContact(c.id)}>
                <Avatar initials={init} size="l" />
                <div className="ppl-main">
                  <div className="ppl-top">
                    <span className="ppl-name">{c.name}</span>
                    <StageChip stage={c.stage} size="s" />
                    {isLeader && <span className="ppl-leader"><Icon name="bolt" size={10}/> leading</span>}
                  </div>
                  <div className="ppl-meta">{c.year} · {c.major} · {c.hall}</div>
                  <div className="ppl-note"><span className="lbl">Lately:</span> {note}</div>
                </div>
                <div className="ppl-side">
                  <span className={"ppl-since" + (overdue ? " is-overdue" : "")}>
                    {overdue && <span className="sd"></span>}
                    {connectedLabelList(c.lastTouch)}
                  </span>
                  <span className="ppl-owner"><Avatar initials={owner.initials} size="s" /> {owner.name.split(' ')[0]}</span>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && <div className="ppl-empty">No one matches that just yet.</div>}
        </div>
      )}
    </div>
  );
};

window.Contacts = Contacts;
