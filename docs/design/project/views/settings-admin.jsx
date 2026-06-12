// Settings → admin-only surfaces.
//   FeedbackInbox  — what people are telling us (full-time staff)
//   DebuggerConsole — API & webhook traffic (Tony)

// ---------- Feedback inbox ----------
const FeedbackInbox = () => {
  const [items, setItems] = React.useState(() => FEEDBACK.map(f => ({ ...f })));
  const [showRead, setShowRead] = React.useState(false);

  const newCount = items.filter(i => i.status === "new").length;
  const shown = showRead ? items : items.filter(i => i.status === "new");

  const markRead = (id) =>
    setItems(prev => prev.map(i => i.id === id ? { ...i, status: "read" } : i));
  const markAllRead = () =>
    setItems(prev => prev.map(i => ({ ...i, status: "read" })));

  return (
    <div className="fb">
      <div className="fb-bar">
        <div className="fb-count">
          {newCount > 0
            ? <><strong>{newCount}</strong> new {newCount === 1 ? "note" : "notes"} from the team</>
            : <>You're all caught up.</>}
        </div>
        <div className="fb-bar-actions">
          <button className={"fb-toggle " + (showRead ? "on" : "")} onClick={() => setShowRead(s => !s)}>
            {showRead ? "Hide read" : "Show all"}
          </button>
          {newCount > 0 && <button className="fb-toggle" onClick={markAllRead}>Mark all read</button>}
        </div>
      </div>

      <div className="fb-list">
        {shown.length === 0 && (
          <div className="fb-empty">Nothing new right now — quiet is good too.</div>
        )}
        {shown.map(f => (
          <div key={f.id} className={"fb-item " + (f.status === "new" ? "is-new" : "")}>
            <Avatar initials={f.initials} size="l" />
            <div className="fb-main">
              <div className="fb-top">
                <span className="fb-name">{f.fromName}</span>
                <span className="fb-role">{f.fromRole}</span>
                {f.channel !== "in-app" && <span className="fb-chan">via {f.channel}</span>}
                <span className="fb-time">{relTime(f.at)}</span>
              </div>
              <p className="fb-msg">{f.message}</p>
              {f.status === "new" && (
                <div className="fb-actions">
                  <button className="fb-link" onClick={() => markRead(f.id)}>Mark read</button>
                </div>
              )}
            </div>
            {f.status === "new" && <span className="fb-dot" aria-hidden="true"></span>}
          </div>
        ))}
      </div>
    </div>
  );
};

// ---------- API & webhook debugger console ----------
const CHANNEL_LABEL = {
  siri: "Siri / API", sms: "SMS", whatsapp: "WhatsApp", groupme: "GroupMe", "quick-add": "Quick Add",
};

const LogRow = ({ row, open, onToggle }) => (
  <div className={"dbg-row " + (open ? "is-open" : "")}>
    <button className="dbg-rowhead" onClick={onToggle} aria-expanded={open}>
      <span className={"dbg-status " + (row.ok ? "ok" : "err")}>{row.status}</span>
      <span className="dbg-method">{row.method}</span>
      <span className="dbg-endpoint">{row.endpoint}</span>
      <span className="dbg-chan">{CHANNEL_LABEL[row.channel] || row.channel}</span>
      <span className="dbg-summary">{row.summary}</span>
      <span className="dbg-meta">{row.latency}ms · {relTime(row.at)}</span>
      <span className="dbg-chev"><Icon name="down" size={14} /></span>
    </button>
    {open && (
      <div className="dbg-detail">
        <CodeBlock label="Request" code={row.request} />
        <CodeBlock label="Response" code={row.response} />
      </div>
    )}
  </div>
);

const DebuggerConsole = () => {
  const [filter, setFilter] = React.useState("all");
  const [openId, setOpenId] = React.useState(API_LOG[0] && API_LOG[0].id);

  const channels = ["all", ...Array.from(new Set(API_LOG.map(l => l.channel)))];
  const rows = filter === "all" ? API_LOG : API_LOG.filter(l => l.channel === filter);
  const errs = API_LOG.filter(l => !l.ok).length;

  return (
    <div className="dbg">
      <div className="dbg-bar">
        <span className="dbg-live"><span className="dbg-live-dot"></span>Listening</span>
        <div className="dbg-filters">
          {channels.map(c => (
            <button
              key={c}
              className={"dbg-filter " + (filter === c ? "on" : "")}
              onClick={() => setFilter(c)}
            >
              {c === "all" ? "All" : (CHANNEL_LABEL[c] || c)}
            </button>
          ))}
        </div>
        <span className="dbg-tally">{API_LOG.length} events · {errs} failed</span>
      </div>

      <div className="dbg-list">
        {rows.map(r => (
          <LogRow key={r.id} row={r} open={openId === r.id} onToggle={() => setOpenId(id => id === r.id ? null : r.id)} />
        ))}
      </div>
    </div>
  );
};

Object.assign(window, { FeedbackInbox, DebuggerConsole });
