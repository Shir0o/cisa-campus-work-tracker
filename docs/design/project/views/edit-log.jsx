// History — "Field notes": not an audit trail. A quiet, continuous ledger of
// what the team has done lately — conversations had, prayers begun, steps taken.
// One unbroken thread with small date markers; every moment carries equal weight.

// How each kind of change reads in human language.
const HIST_ACTION = {
  "moved":              { bucket: "steps",  icon: "arrow-right", lead: "walked", tail: "a step further" },
  "created contact":    { bucket: "steps",  icon: "user",        lead: "welcomed" },
  "created prayer":     { bucket: "prayer", icon: "praying",     lead: "started praying for" },
  "marked answered":    { bucket: "prayer", icon: "heart",       lead: "gave thanks for an answered prayer for" },
  "logged interaction": { bucket: "talk",   icon: "coffee",      lead: "spent time with" },
  "updated note":       { bucket: "talk",   icon: "edit",        lead: "added to the notes on" },
  "updated field":      { bucket: "talk",   icon: "edit",        lead: "updated details for" },
  "logged attendance":  { bucket: "gather", icon: "calendar",    lead: "noted who gathered" },
  "created event":      { bucket: "gather", icon: "calendar",    lead: "planned a gathering" },
};

const HIST_KINDS = [
  { id: "all",    label: "Everything" },
  { id: "steps",  label: "Steps forward" },
  { id: "prayer", label: "Prayer" },
  { id: "talk",   label: "Conversations" },
  { id: "gather", label: "Gatherings" },
];

// Strip DB-isms (IDs, char counts, masked digits) into plain pastoral language.
const histDetail = (action, detail, contact) => {
  if (action === "moved") {
    if (/\(kept\)/i.test(detail))
      return "Still walking alongside them — added a note after a family update.";
    const m = detail.match(/Stage changed:\s*([^→]+?)\s*→\s*([^.]+)/i);
    if (m) return `A step forward — from ${m[1].trim()} toward ${m[2].trim()}.`;
  }
  if (action === "marked answered") {
    const m = detail.match(/\(([^)]+)\)/);
    return m ? `“${m[1]}” — answered, after carrying it together.` : detail;
  }
  if (action === "updated field") {
    if (/phone/i.test(detail)) return "Tidied up their phone number.";
    return detail.replace(/\s*\([^)]*\)/g, "").trim();
  }
  if (action === "updated note") return "Added a few lines to remember.";
  if (action === "created prayer") {
    const m = detail.match(/['‘“]([^'’”]+)['’”]/);
    return m ? `Began carrying “${m[1]}.”` : detail;
  }
  if (action === "created contact") {
    return `${contact ? contact.name : "Someone new"} found their way to us.`;
  }
  return detail;
};

const EditLog = ({ onOpenContact }) => {
  const [who, setWho] = React.useState("all");
  const [kind, setKind] = React.useState("all");
  const [q, setQ] = React.useState("");

  const items = EDIT_LOG.filter((l) => {
    if (who !== "all" && l.staff !== who) return false;
    const meta = HIST_ACTION[l.action];
    if (kind !== "all" && (!meta || meta.bucket !== kind)) return false;
    if (q.trim()) {
      const c = l.contactId ? contactById(l.contactId) : null;
      const hay = `${staffById(l.staff).name} ${l.action} ${l.detail} ${c ? c.name : ""}`.toLowerCase();
      if (!hay.includes(q.trim().toLowerCase())) return false;
    }
    return true;
  });

  // one continuous stream, with a small marker wherever the day changes
  const rows = [];
  let lastDay = null;
  items.forEach((l) => {
    const k = new Date(l.at).toDateString();
    if (k !== lastDay) { rows.push({ type: "date", at: l.at, key: "d:" + k }); lastDay = k; }
    rows.push({ type: "item", l, key: l.id });
  });

  const dayInfo = (iso) => {
    const d = new Date(iso), now = new Date();
    const start = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((start(now) - start(d)) / 86400000);
    const md = d.toLocaleDateString(undefined, { month: "long", day: "numeric" });
    if (diff === 0) return { label: "Today", sub: md };
    if (diff === 1) return { label: "Yesterday", sub: md };
    if (diff < 7) return { label: d.toLocaleDateString(undefined, { weekday: "long" }), sub: md };
    return { label: md, sub: d.toLocaleDateString(undefined, { weekday: "long" }) };
  };

  const people = new Set(EDIT_LOG.filter((l) => l.contactId).map((l) => l.contactId)).size;

  return (
    <div className="page history">
      <header className="dash-head">
        <div>
          <div className="dash-eyebrow">Wednesday, May 13 · Week 9 of the spring semester</div>
          <h1 className="dash-greeting">Looking back</h1>
          <p className="dash-state">
            A record of the small, faithful work of the last few days — conversations had,
            prayers begun, steps taken. <b>{EDIT_LOG.length} moments</b> across the team,
            touching <span className="num">{people}</span> of the people in our care.
          </p>
        </div>
      </header>

      <section className="dash-sec" style={{ marginTop: 38 }}>
        <div className="hist-controls">
          <div className="seg seg-warm">
            {HIST_KINDS.map((k) => (
              <button key={k.id} className={kind === k.id ? "active" : ""} onClick={() => setKind(k.id)}>{k.label}</button>
            ))}
          </div>
          <label className="hist-sel">
            <Icon name="users" size={14} />
            <select value={who} onChange={(e) => setWho(e.target.value)}>
              <option value="all">Whole team</option>
              {STAFF.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <Icon name="down" size={12} />
          </label>
          <div className="hist-find">
            <Icon name="search" size={14} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a moment or a name…" />
          </div>
        </div>

        {rows.length === 0 &&
          <div className="hist-empty">Nothing here yet for that filter. Try widening it.</div>}

        <div className="hist-stream">
          {rows.map((row) => {
            if (row.type === "date") {
              const d = dayInfo(row.at);
              return (
                <div className="hist-datemark" key={row.key}>
                  <span className="hist-date-node" aria-hidden></span>
                  <div className="hist-date-text">
                    <span className="hist-date-label">{d.label}</span>
                    <span className="hist-date-sub">{d.sub}</span>
                  </div>
                </div>
              );
            }
            const l = row.l;
            const u = staffById(l.staff);
            const meta = HIST_ACTION[l.action] || { bucket: "talk", icon: "edit", lead: l.action };
            const c = l.contactId ? contactById(l.contactId) : null;
            return (
              <div className="hist-item" key={row.key}>
                <span className={"hist-mark " + meta.bucket} aria-hidden>
                  <Icon name={meta.icon} size={13} />
                </span>
                <div className="hist-body">
                  <div className="hist-line">
                    <span className="hist-who-name">{u.name.split(" ")[0]}</span>{" "}
                    <span className="hist-verb">{meta.lead}</span>
                    {c &&
                      <React.Fragment>
                        {" "}
                        <span className="hist-target" onClick={() => onOpenContact(c.id)}>{c.name}</span>
                      </React.Fragment>}
                    {meta.tail && <span className="hist-verb">{" "}{meta.tail}</span>}
                    <span className="hist-dot">·</span>
                    <span className="hist-time">{relTime(l.at)}</span>
                  </div>
                  <div className="hist-detail">{histDetail(l.action, l.detail, c)}</div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="dash-figures">
        <div className="fig"><span className="fig-n">{EDIT_LOG.length}</span><span className="fig-l">moments noted</span></div>
        <div className="fig"><span className="fig-n">{people}</span><span className="fig-l">people remembered</span></div>
        <div className="fig"><span className="fig-n">{STAFF.length}</span><span className="fig-l">hands at work</span></div>
        <span className="dash-figures-note">We write it down so nothing — and no one — is forgotten.</span>
      </div>
    </div>
  );
};

window.EditLog = EditLog;
