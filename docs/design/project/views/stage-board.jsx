// The Journey — "Field notes": the same walk from a first hello toward a church
// home, read left to right. Not a sales pipeline — a progression of people.
// Drag a card when someone takes their next step.
//
// Stages themselves are editable: staff can add, rename, recolor, reorder and
// remove steps via "Shape the journey". Changes sync to the global STAGES /
// STAGE_BY_ID so chips read the same everywhere.

// Warm fallback captions for the four original stages.
const STAGE_CAPTION = {
  first: "We've only just met — a name, a face, a first hello.",
  second: "Following up — a coffee, a text, learning who they are.",
  regular: "Part of the rhythm now, around most weeks.",
  church: "Finding a church family to belong to."
};

// Theme-aware tones a stage can wear. Each value is a real CSS var name
// (--accent, --amber, …) so it adapts across paper / dusk automatically.
const STAGE_TONES = [
  { tone: "accent", name: "Slate" },
  { tone: "amber",  name: "Terracotta" },
  { tone: "teal",   name: "Sage" },
  { tone: "violet", name: "Plum" },
  { tone: "danger", name: "Clay" },
  { tone: "warn",   name: "Gold" }
];

const lastInteractionForBoard = (cid) =>
INTERACTIONS.
filter((i) => i.contactId === cid).
sort((a, b) => new Date(b.date) - new Date(a.date))[0];

const connectedLabel = (d) =>
d === 0 ? "Connected today" :
d === 1 ? "Last connected yesterday" :
`Last connected ${d} days ago`;

// Push the working stage list back into the globals other views read from.
const syncStages = (next) => {
  STAGES.length = 0;
  next.forEach((s) => STAGES.push(s));
  Object.keys(STAGE_BY_ID).forEach((k) => delete STAGE_BY_ID[k]);
  next.forEach((s) => { STAGE_BY_ID[s.id] = s; });
};

const StageBoard = ({ onOpenContact }) => {
  // Source of truth for the stages, seeded from the globals (+ fallback captions).
  const [stages, setStages] = React.useState(() =>
  STAGES.map((s) => ({ ...s, caption: s.caption || STAGE_CAPTION[s.id] || "" }))
  );
  const [contacts, setContacts] = React.useState(CONTACTS);
  const [dragId, setDragId] = React.useState(null);
  const [overCol, setOverCol] = React.useState(null);
  const [editing, setEditing] = React.useState(false);

  // push the seeded captions onto the globals once, on mount
  React.useEffect(() => { syncStages(stages); }, []); // eslint-disable-line

  const commitStages = (next) => {
    setStages(next);
    syncStages(next);
  };

  const byStage = (stage) => contacts.filter((c) => c.stage === stage);

  const onDragStart = (id) => (e) => {
    setDragId(id);
    e.dataTransfer.effectAllowed = "move";
  };
  const onDragOverCol = (stage) => (e) => {
    e.preventDefault();
    setOverCol(stage);
  };
  const onDropCol = (stage) => (e) => {
    e.preventDefault();
    if (dragId) {
      setContacts((prev) => prev.map((c) => c.id === dragId ? { ...c, stage } : c));
    }
    setDragId(null);
    setOverCol(null);
  };

  const total = contacts.length;

  return (
    <div className="page jrn">
      <header className="jrn-head">
        <div className="jrn-head-row">
          <h1 className="jrn-h1">Stages</h1>
          <button className="btn jrn-edit-btn" onClick={() => setEditing(true)}>
            <Icon name="settings" size={13} /> Shape the journey
          </button>
        </div>
        <p className="jrn-state">
          <b>{total} students</b> in all
          {" — "}
          {stages.map((s, i) =>
          <React.Fragment key={s.id}>
              <span className="num">{byStage(s.id).length}</span> {s.name.toLowerCase()}
              {i < stages.length - 1 ? ", " : "."}
            </React.Fragment>
          )}
        </p>
      </header>

      <div className="jrn-board">
        {stages.map((stage) => {
          const items = byStage(stage.id);
          const isOver = overCol === stage.id;
          return (
            <div className={"jrn-col " + stage.tone + (isOver ? " is-over" : "")}
            key={stage.id}
            onDragOver={onDragOverCol(stage.id)}
            onDragLeave={() => setOverCol(null)}
            onDrop={onDropCol(stage.id)}>
              <div className="jrn-col-head">
                <div className="jrn-col-top">
                  <span className="jrn-col-name">{stage.name}</span>
                  <span className="jrn-col-count">
                    {items.length === 0 ? "no one yet" :
                    items.length === 1 ? "1 person" :
                    `${items.length} people`}
                  </span>
                </div>
                {stage.caption && <p className="jrn-col-caption">{stage.caption}</p>}
              </div>

              <div className="jrn-col-body">
                {items.length === 0 &&
                <div className="jrn-empty">No one here just now.</div>
                }
                {items.map((c) => {
                  const owner = staffById(c.owner);
                  const li = lastInteractionForBoard(c.id);
                  const init = c.name.split(' ').map((x) => x[0]).join('').slice(0, 2);
                  const hasPrayer = PRAYERS.some((p) => p.contactId === c.id && p.status === "open");
                  const isLeader = c.tags.includes("leader-track");
                  const overdue = c.lastTouch >= 7;
                  return (
                    <article className={"jrn-card " + (dragId === c.id ? "is-drag" : "")}
                    key={c.id}
                    draggable
                    onDragStart={onDragStart(c.id)}
                    onDragEnd={() => {setDragId(null);setOverCol(null);}}
                    onClick={() => onOpenContact(c.id)}>
                      <div className="jrn-card-head">
                        <Avatar initials={init} size="l" />
                        <div className="jrn-card-who">
                          <div className="jrn-card-name">{c.name}</div>
                          <div className="jrn-card-sub">{c.year} · {c.major}</div>
                        </div>
                      </div>

                      <div className={"jrn-card-since" + (overdue ? " is-overdue" : "")}>
                        {overdue && <span className="jrn-since-dot" aria-hidden></span>}
                        {connectedLabel(c.lastTouch)}
                      </div>

                      {li &&
                      <p className="jrn-card-note">
                          <span className="jrn-note-label">Last:</span> {li.title}.
                        </p>
                      }

                      <div className="jrn-card-foot">
                        <span className="jrn-walked">
                          <Avatar initials={owner.initials} size="s" />
                          walked by {owner.name.split(" ")[0]}
                        </span>
                        {hasPrayer &&
                        <span className="jrn-tag violet">
                            <Icon name="praying" size={11} /> praying
                          </span>
                        }
                        {isLeader &&
                        <span className="jrn-tag accent">leader track</span>
                        }
                      </div>
                    </article>);

                })}
              </div>

              <div className="jrn-col-foot">
                <button className="jrn-add">
                  {stages[0] && stage.id === stages[0].id ? "Welcome someone new" : `Add to ${stage.name}`}
                </button>
              </div>
            </div>);

        })}
      </div>

      {editing &&
      <StageEditor
        stages={stages}
        contacts={contacts}
        onClose={() => setEditing(false)}
        onChange={commitStages}
        onReassign={(fromId, toId) => {
          setContacts((prev) => prev.map((c) => c.stage === fromId ? { ...c, stage: toId } : c));
          // keep the globals honest so chips elsewhere don't blank out
          CONTACTS.forEach((c) => { if (c.stage === fromId) c.stage = toId; });
        }} />
      }
    </div>);

};

// ── Shape the journey ─────────────────────────────────────────────────
// Add / rename / recaption / recolor / reorder / remove the steps. Changes
// apply live. A step that still holds people can't vanish their cards —
// they move to the neighbouring step on the way out.
const StageEditor = ({ stages, contacts, onClose, onChange, onReassign }) => {
  const countIn = (id) => contacts.filter((c) => c.stage === id).length;

  const update = (id, patch) =>
  onChange(stages.map((s) => s.id === id ? { ...s, ...patch } : s));

  const move = (idx, dir) => {
    const j = idx + dir;
    if (j < 0 || j >= stages.length) return;
    const next = stages.slice();
    [next[idx], next[j]] = [next[j], next[idx]];
    onChange(next);
  };

  const add = () => {
    const used = stages.map((s) => s.tone);
    const tone = (STAGE_TONES.find((t) => !used.includes(t.tone)) || STAGE_TONES[0]).tone;
    const id = "stage-" + Date.now().toString(36);
    onChange([...stages, { id, name: "New step", tone, caption: "", desc: "" }]);
  };

  const remove = (id) => {
    if (stages.length <= 1) return;
    const idx = stages.findIndex((s) => s.id === id);
    const neighbour = stages[idx - 1] || stages[idx + 1];
    if (countIn(id) > 0 && neighbour) onReassign(id, neighbour.id);
    onChange(stages.filter((s) => s.id !== id));
  };

  return (
    <div className="scrim" onClick={(e) => { if (e.target.classList.contains("scrim")) onClose(); }}>
      <div className="modal stage-ed" style={{ width: "min(600px, 94vw)" }}>
        <div className="modal-head">
          <Icon name="settings" size={15} />
          <div style={{ fontWeight: 600, whiteSpace: "nowrap" }}>Shape the journey</div>
          <button className="icon-btn right" onClick={onClose}><Icon name="x" size={14} /></button>
        </div>

        <div className="modal-body stage-ed-body">
          <p className="stage-ed-intro">
            These are the steps a student moves through. Name them in your own
            words, give each a colour, and order them the way the walk really goes.
          </p>

          {stages.map((s, i) => {
            const n = countIn(s.id);
            return (
              <div className="stage-ed-row" key={s.id}>
                <div className="stage-ed-reorder">
                  <button className="stage-ed-arrow up" disabled={i === 0} onClick={() => move(i, -1)} title="Move earlier">
                    <Icon name="down" size={13} />
                  </button>
                  <button className="stage-ed-arrow" disabled={i === stages.length - 1} onClick={() => move(i, 1)} title="Move later">
                    <Icon name="down" size={13} />
                  </button>
                </div>

                <div className="stage-ed-main">
                  <div className="stage-ed-line">
                    <input
                      className="stage-ed-name"
                      value={s.name}
                      placeholder="Step name"
                      onChange={(e) => update(s.id, { name: e.target.value })} />
                    <span className="stage-ed-count">{n === 0 ? "no one" : n === 1 ? "1 person" : `${n} people`}</span>
                    <button
                      className="stage-ed-del"
                      disabled={stages.length <= 1}
                      title={stages.length <= 1 ? "Keep at least one step" : "Remove step"}
                      onClick={() => remove(s.id)}>
                      <Icon name="trash" size={13} />
                    </button>
                  </div>

                  <input
                    className="stage-ed-caption"
                    value={s.caption || ""}
                    placeholder="A warm one-line description (optional)"
                    onChange={(e) => update(s.id, { caption: e.target.value })} />

                  <div className="stage-ed-tones">
                    {STAGE_TONES.map((t) =>
                    <button
                      key={t.tone}
                      className={"stage-ed-swatch " + (s.tone === t.tone ? "is-on" : "")}
                      style={{ background: `var(--${t.tone})` }}
                      title={t.name}
                      aria-label={t.name}
                      onClick={() => update(s.id, { tone: t.tone })}>
                        {s.tone === t.tone && <Icon name="check" size={11} />}
                      </button>
                    )}
                  </div>
                </div>
              </div>);

          })}

          <button className="stage-ed-add" onClick={add}>
            <Icon name="plus" size={14} /> Add a step
          </button>
        </div>

        <div className="modal-foot">
          <button className="btn btn-primary" onClick={onClose}>
            <Icon name="check" size={13} /> Done
          </button>
        </div>
      </div>
    </div>);

};

window.StageBoard = StageBoard;
