// Global Search — unified inline panel that lives in the topbar.
// Desktop: dropdown below the omni pill. Mobile: fixed full-screen overlay.
// Searches contacts, interactions (staff), board notes + coord notes (ft),
// and history (opt-in toggle, staff).

const GS_MAX = 4;

// ── search helpers ────────────────────────────────────────────────────────────

function gsContacts(q) {
  const ql = q.toLowerCase();
  return CONTACTS.filter(c =>
    c.name.toLowerCase().includes(ql) ||
    (c.major  || "").toLowerCase().includes(ql) ||
    (c.year   || "").toLowerCase().includes(ql) ||
    (c.hall   || "").toLowerCase().includes(ql) ||
    (c.notes  || "").toLowerCase().includes(ql) ||
    (c.tags   || []).some(t => t.toLowerCase().includes(ql))
  ).slice(0, GS_MAX);
}

function gsInteractions(q) {
  const ql = q.toLowerCase();
  return INTERACTIONS.filter(i =>
    (i.title || "").toLowerCase().includes(ql) ||
    (i.body  || "").toLowerCase().includes(ql)
  ).slice(0, GS_MAX);
}

function gsBoard(q) {
  const ql = q.toLowerCase();
  const notes = BOARD_NOTES.filter(n =>
    n.title.toLowerCase().includes(ql) ||
    n.body.toLowerCase().includes(ql) ||
    n.series.toLowerCase().includes(ql) ||
    (n.tags || []).some(t => t.toLowerCase().includes(ql))
  );
  const coord = COORDINATION_NOTES.filter(n =>
    n.title.toLowerCase().includes(ql) ||
    (n.body || "").toLowerCase().includes(ql)
  );
  // interleave: up to GS_MAX total, board notes first
  return [...notes, ...coord].slice(0, GS_MAX);
}

function gsHistory(q) {
  const ql = q.toLowerCase();
  return EDIT_LOG.filter(e =>
    (e.action || "").toLowerCase().includes(ql) ||
    (e.detail || "").toLowerCase().includes(ql)
  ).slice(0, GS_MAX);
}

// ── component ─────────────────────────────────────────────────────────────────

const GlobalSearch = ({ q, onQChange, onClose, onOpen, onOpenContact, isStaff, isFullStaff, onNewContact }) => {
  const [inclHistory, setInclHistory] = React.useState(false);
  const [cursor, setCursor] = React.useState(-1);
  const mobileInputRef = React.useRef(null);

  const hasQ = q.trim().length > 0;

  // ── results ─────────────────────────────────────────────────────────────────

  const contactResults = React.useMemo(() =>
    hasQ
      ? gsContacts(q)
      : CONTACTS.slice().sort((a, b) => a.lastTouch - b.lastTouch).slice(0, 4),
    [q, hasQ]
  );
  const interactionResults = React.useMemo(() =>
    hasQ && isStaff ? gsInteractions(q) : [],
    [q, hasQ, isStaff]
  );
  const boardResults = React.useMemo(() =>
    hasQ && isFullStaff ? gsBoard(q) : [],
    [q, hasQ, isFullStaff]
  );
  const historyResults = React.useMemo(() =>
    hasQ && isStaff && inclHistory ? gsHistory(q) : [],
    [q, hasQ, isStaff, inclHistory]
  );

  // flat index map for keyboard nav
  const { flatItems, indexMap } = React.useMemo(() => {
    const items = [];
    const map = {};
    const add = (type, data) => { map[data.id] = items.length; items.push({ type, data }); };
    contactResults.forEach(c => add("contact", c));
    interactionResults.forEach(i => add("interaction", i));
    boardResults.forEach(n => add("board", n));
    historyResults.forEach(e => add("history", e));
    return { flatItems: items, indexMap: map };
  }, [contactResults, interactionResults, boardResults, historyResults]);

  const hasResults = flatItems.length > 0;

  // ── keyboard nav ─────────────────────────────────────────────────────────────

  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setCursor(c => Math.min(c + 1, flatItems.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setCursor(c => Math.max(c - 1, -1));
      } else if (e.key === "Enter" && cursor >= 0 && flatItems[cursor]) {
        e.preventDefault();
        activate(flatItems[cursor]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cursor, flatItems]);

  React.useEffect(() => { setCursor(-1); }, [q]);

  // Auto-focus the mobile input when panel opens
  React.useEffect(() => {
    const isMobile = window.innerWidth <= 720;
    if (isMobile && mobileInputRef.current) {
      setTimeout(() => mobileInputRef.current?.focus(), 60);
    }
  }, []);

  const activate = (item) => {
    if (item.type === "contact")     onOpenContact(item.data.id);
    else if (item.type === "interaction") onOpenContact(item.data.contactId);
    else if (item.type === "board")  onOpen("board");
    else if (item.type === "history") onOpen("editlog");
    onClose();
  };

  // ── quick actions (empty state) ───────────────────────────────────────────

  const quickActions = [
    { id: "qa-new",    label: "New contact",      icon: "user",    onClick: () => { onNewContact(); onClose(); } },
    { id: "qa-log",    label: "Log a visit",       icon: "coffee",  onClick: () => { onOpen("contacts"); onClose(); } },
    { id: "qa-signup", label: "Open sign-up form", icon: "globe",   onClick: () => { onOpen("signup"); onClose(); } },
    { id: "qa-journey",label: "The Journey",       icon: "board",   onClick: () => { onOpen("stage"); onClose(); } },
  ];

  // ── row components ────────────────────────────────────────────────────────

  const ContactRow = ({ c }) => {
    const stage = STAGE_BY_ID[c.stage];
    const idx = indexMap[c.id];
    return (
      <button className={"gs-row" + (cursor === idx ? " gs-cursor" : "")}
              onMouseEnter={() => setCursor(idx)}
              onClick={() => { onOpenContact(c.id); onClose(); }}>
        <span className="gs-ico accent"><Icon name="user" size={13} /></span>
        <div className="gs-row-body">
          <span className="gs-row-title">{c.name}</span>
          <span className="gs-row-sub">{c.year} · {c.major}</span>
        </div>
        {stage && <span className={"chip s " + stage.tone}><span className="dot"></span>{stage.name}</span>}
      </button>
    );
  };

  const InteractionRow = ({ i }) => {
    const c = contactById(i.contactId);
    const idx = indexMap[i.id];
    return (
      <button className={"gs-row" + (cursor === idx ? " gs-cursor" : "")}
              onMouseEnter={() => setCursor(idx)}
              onClick={() => { onOpenContact(i.contactId); onClose(); }}>
        <span className="gs-ico amber"><Icon name="coffee" size={13} /></span>
        <div className="gs-row-body">
          <span className="gs-row-title">{i.title}</span>
          <span className="gs-row-sub">{c ? c.name : ""} · {relTime(i.date)}</span>
        </div>
      </button>
    );
  };

  const BoardRow = ({ n }) => {
    // BOARD_NOTES have .series; COORDINATION_NOTES have .updatedBy but no .series
    const isCoord = !n.series;
    const upd = n.updatedBy ? staffById(n.updatedBy) : null;
    const sub = isCoord
      ? "Coordination · " + (upd ? upd.name.split(" ")[0] : "")
      : n.series + " · " + (n.dateLabel || "");
    const idx = indexMap[n.id];
    return (
      <button className={"gs-row" + (cursor === idx ? " gs-cursor" : "")}
              onMouseEnter={() => setCursor(idx)}
              onClick={() => { onOpen("board"); onClose(); }}>
        <span className="gs-ico teal"><Icon name={isCoord ? "doc" : "board"} size={13} /></span>
        <div className="gs-row-body">
          <span className="gs-row-title">{n.title}</span>
          <span className="gs-row-sub">{sub}</span>
        </div>
        {!isCoord && n.type && (
          <span className={"gs-kind " + n.type}>{n.type === "learning" ? "Learning" : "Record"}</span>
        )}
      </button>
    );
  };

  const HistoryRow = ({ e }) => {
    const s = staffById(e.staff);
    const c = e.contactId ? contactById(e.contactId) : null;
    const idx = indexMap[e.id];
    return (
      <button className={"gs-row" + (cursor === idx ? " gs-cursor" : "")}
              onMouseEnter={() => setCursor(idx)}
              onClick={() => { onOpen("editlog"); onClose(); }}>
        <span className="gs-ico violet"><Icon name="clock" size={13} /></span>
        <div className="gs-row-body">
          <span className="gs-row-title gs-dim">{e.detail}</span>
          <span className="gs-row-sub">{s ? s.name.split(" ")[0] : ""}{c ? " · " + c.name : ""} · {relTime(e.at)}</span>
        </div>
      </button>
    );
  };

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="gs-panel">

      {/* Mobile-only search bar (desktop input lives in the topbar) */}
      <div className="gs-mobile-bar">
        <Icon name="search" size={14} />
        <input
          ref={mobileInputRef}
          value={q}
          onChange={e => onQChange(e.target.value)}
          placeholder="Search people, conversations, notes…"
          onKeyDown={e => { if (e.key === "Escape") onClose(); }}
        />
        {q && (
          <button className="gs-clear" onClick={() => onQChange("")} title="Clear">
            <Icon name="x" size={13} />
          </button>
        )}
        <button className="gs-mobile-cancel" onClick={onClose}>Cancel</button>
      </div>

      {/* ── Empty state ── */}
      {!hasQ && (
        <>
          <div className="gs-group">
            <div className="gs-label">Recent people</div>
            {contactResults.map(c => <ContactRow key={c.id} c={c} />)}
          </div>
          <div className="gs-group">
            <div className="gs-label">Quick actions</div>
            {quickActions.map((a, i) => (
              <button key={a.id} className="gs-row" onClick={a.onClick}>
                <span className="gs-ico"><Icon name={a.icon} size={13} /></span>
                <div className="gs-row-body">
                  <span className="gs-row-title">{a.label}</span>
                </div>
                {i === 0 && <span className="gs-kbd">↵</span>}
              </button>
            ))}
          </div>
          <div className="gs-foot">⌘K anywhere · ↑↓ navigate · ↵ open</div>
        </>
      )}

      {/* ── Search results ── */}
      {hasQ && !hasResults && (
        <div className="gs-empty">Nothing came up for "{q}"</div>
      )}

      {hasQ && contactResults.length > 0 && (
        <div className="gs-group">
          <div className="gs-label">People</div>
          {contactResults.map(c => <ContactRow key={c.id} c={c} />)}
        </div>
      )}

      {hasQ && interactionResults.length > 0 && (
        <div className="gs-group">
          <div className="gs-label">Conversations</div>
          {interactionResults.map(i => <InteractionRow key={i.id} i={i} />)}
        </div>
      )}

      {hasQ && boardResults.length > 0 && (
        <div className="gs-group">
          <div className="gs-label">The Board</div>
          {boardResults.map(n => <BoardRow key={n.id} n={n} />)}
        </div>
      )}

      {/* History opt-in toggle */}
      {hasQ && isStaff && (
        <div className="gs-hist-row">
          <button className={"gs-hist-btn" + (inclHistory ? " on" : "")}
                  onClick={() => setInclHistory(v => !v)}>
            <span className="gs-hist-dot"></span>
            Search history too
          </button>
        </div>
      )}

      {hasQ && historyResults.length > 0 && (
        <div className="gs-group">
          <div className="gs-label">History</div>
          {historyResults.map(e => <HistoryRow key={e.id} e={e} />)}
        </div>
      )}

    </div>
  );
};

window.GlobalSearch = GlobalSearch;
