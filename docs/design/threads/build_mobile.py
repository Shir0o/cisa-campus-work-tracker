#!/usr/bin/env python3
"""Phone set at 390×844 — direction A, kind tag beside the name, 44px targets."""
import build as B
from build import ic, P, msg, day, thr, ASK, Q, FT, write

MCSS = B.CSS + r"""
.mroot{width:390px;height:844px;display:flex;flex-direction:column;background:#FFFFFF;font-family:Lexend,ui-sans-serif,system-ui,sans-serif;color:#0A0A0B;-webkit-font-smoothing:antialiased;position:relative;overflow:hidden}
.mtop{height:56px;flex:none;display:flex;align-items:center;gap:4px;padding:0 8px;border-bottom:1px solid #F0F0F2}
.mback{height:44px;min-width:44px;border:0;background:transparent;display:inline-flex;align-items:center;gap:2px;font-size:15px;font-weight:500;color:#0A0A0B;padding:0 6px}
.mtitle{flex:1;min-width:0;display:flex;align-items:center;gap:10px}
.mtn{font-family:"Plus Jakarta Sans",sans-serif;font-weight:700;font-size:16px;letter-spacing:-0.01em}
.mts{font-size:12px;color:#52525B}
.mbtn{width:44px;height:44px;border-radius:999px;border:0;background:transparent;display:grid;place-items:center;color:#52525B}
.hero{padding:14px 16px 12px;display:flex;flex-direction:column;gap:12px;flex:none}
.hrow{display:flex;align-items:center;gap:12px}
.hn{font-family:"Plus Jakarta Sans",sans-serif;font-weight:800;font-size:20px;letter-spacing:-0.02em}
.hacts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.hact{height:44px;border-radius:999px;border:1px solid #E4E4E7;background:#FFFFFF;font-size:13.5px;font-weight:600}
.hact.dark{background:#131316;color:#FFFFFF;border-color:#131316}
.mseg{margin:0 16px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:2px;padding:3px;border-radius:999px;background:#EAEAEC;flex:none}
.msegb{height:40px;border-radius:999px;border:0;background:transparent;font-size:13px;font-weight:500;color:#52525B}
.msegb.on{background:#FFFFFF;color:#0A0A0B;font-weight:600;box-shadow:0 1px 2px rgba(10,10,11,0.08)}
.msub{display:flex;align-items:center;gap:8px;padding:10px 16px 0;flex:none}
.msub .seg .segb{height:36px}
.maud{font-size:12px;color:#52525B;padding:6px 16px 0;flex:none}
.mstream{flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-end;padding:0 16px 4px;position:relative}
.mstream.top{justify-content:flex-start;padding-top:8px}
.mroot .btn{height:44px;padding:0 16px;font-size:13px}
.mroot .thr{height:40px}
.mroot .kind{height:36px;padding:0 12px}
.mroot .composer{padding:8px 12px 28px}
.mroot .send{width:44px;height:44px}
.mroot .tool{width:44px;height:44px}
.story2{flex:1;min-height:0;overflow:hidden;padding:12px 16px;display:flex;flex-direction:column;gap:0}
.se{display:grid;grid-template-columns:14px 1fr;gap:12px;padding:12px 0;border-bottom:1px solid #F0F0F2}
.sdot{width:10px;height:10px;border-radius:50%;background:#131316;margin-top:5px}
.sw{font-size:12px;color:#52525B}
.st{font-size:14px;line-height:1.5;margin:4px 0 0}
.linkb{height:44px;border:0;background:transparent;padding:0;font-size:13px;font-weight:600;color:#52525B;display:inline-flex;align-items:center;gap:6px}
.scrim{position:absolute;inset:0;background:rgba(10,10,11,0.36)}
.sheet2{position:absolute;left:0;right:0;bottom:0;background:#FFFFFF;border-radius:24px 24px 0 0;padding:8px 8px 28px;box-shadow:0 -12px 40px rgba(10,10,11,0.18)}
.grab{width:40px;height:5px;border-radius:3px;background:#D4D4D8;margin:4px auto 10px}
.prev{margin:0 8px 8px;padding:12px;border-radius:16px;background:#F4F4F5}
.act{width:100%;height:52px;border:0;background:transparent;display:flex;align-items:center;gap:14px;padding:0 16px;font-size:15px;font-weight:500;border-radius:14px;text-align:left;color:#0A0A0B}
.act.danger{color:#B1000F}
"""

def page(name, title, inner):
    with open(f"{B.OUT}/{name}", "w") as f:
        f.write(B.HEAD.format(title=title, css=MCSS) + f'<div class="mroot">{inner}</div>' + B.TAIL.format(w=390, h=844))
    print("wrote", name)

CHEV = ic('<path d="m15 18-6-6 6-6"></path>', 22)
MORE = ic(P["more"], 20)

def top(back, title_html, right=True):
    r = f'<button class="mbtn" aria-label="More">{MORE}</button>' if right else ""
    return f'<div class="mtop"><button class="mback" aria-label="Back to {back}">{CHEV}{back}</button><div class="mtitle">{title_html}</div>{r}</div>'

HERO = '''<div class="hero"><div class="hrow"><span class="av p-d" style="width: 48px; height: 48px; font-size: 15px;">DR</span><div><div class="hn">Daniel Reyes</div><div class="mts">Came once · Cared for by Maria</div></div></div>
<div class="hacts"><button class="hact">Text</button><button class="hact">Call</button><button class="hact dark">Log</button></div></div>'''

def segs(on):
    b = lambda k, t: f'<button class="msegb{" on" if k == on else ""}" role="tab" aria-selected="{"true" if k == on else "false"}">{t}</button>'
    return f'<div class="mseg" role="tablist" aria-label="Sections">{b("story","Story")}{b("prayers","Prayers")}{b("conv","Conversation")}</div>'

# ── Person · Conversation, with the Full-timers switch ─────────────
conv = "".join([
    day("Yesterday"),
    msg("MS", "p-m", "Maria Santos", "4:40 PM", "Can someone text Daniel before Thursday? He didn't have a ride last week.", tag=ASK,
        extra='<div class="status"><span class="s-open">Open 1 day</span><button class="btn pri">I followed up</button><button class="btn ghost">Never mind</button></div>'),
    day("Today"),
    msg("GL", "p-g", "Grace Liu", "9:12 AM", "Is Daniel's roommate the one who came to the cookout?", tag=Q),
    msg("JP", "p-j", "Josh Park", "10:02 AM", "I'll sit with him Thursday again.", extra=thr("2 replies", "Last reply 10:30 AM", [("MS", "p-m"), ("GL", "p-g")])),
])
person = (top("People", "") + HERO + segs("conv") +
    '<div class="msub"><div class="seg" role="tablist" aria-label="Which stream"><button class="segb on" role="tab" aria-selected="true">Conversation</button><button class="segb" role="tab" aria-selected="false">Full-timers 3</button></div></div>'
    '<div class="maud">Everyone tied to Daniel sees this.</div>'
    f'<div class="mstream">{conv}</div>' + B.composer(kinds=True, label="Write to everyone tied to Daniel", cid="mp"))
page("M-Person.dc.html", "Phone · Person, Conversation", person)

# ── Person · Full-timers ───────────────────────────────────────────
ftc = "".join([
    day("Monday"),
    msg("RC", "p-r", "Ruth Chen", "8:50 PM", "Daniel mentioned his dad's surgery at the table. Worth being gentle with him for a few weeks."),
    msg("MS", "p-m", "Maria Santos", "9:03 PM", "Agreed. I'd rather Josh keep sitting with him than hand him to someone new."),
    day("Today"),
    msg("RC", "p-r", "Ruth Chen", "10:31 AM", '<span class="at">@Maria Santos</span> retreat — too much this soon?'),
])
person_ft = (top("People", "") + HERO + segs("conv") +
    '<div class="msub"><div class="seg" role="tablist" aria-label="Which stream"><button class="segb" role="tab" aria-selected="false">Conversation 4</button><button class="segb on" role="tab" aria-selected="true">Full-timers</button></div></div>'
    f'<div class="maud" style="display: flex; align-items: center; gap: 6px; color: #3F3F46; font-weight: 500;">{ic(P["lock"],12)}Only Full-timers see this — Trainees can\'t.</div>'
    f'<div class="mstream">{ftc}</div>' + B.composer(kinds=False, placeholder="Write something only Full-timers will see…", label="Write to Full-timers", cid="mf"))
page("M-Person-FT.dc.html", "Phone · Person, Full-timers", person_ft)

# ── Pushed Thread ──────────────────────────────────────────────────
th = "".join([
    msg("JP", "p-j", "Josh Park", "Today, 10:02 AM", "I'll sit with him Thursday again."),
    '<div class="rc">2 replies</div>',
    msg("MS", "p-m", "Maria Santos", "10:20 AM", "Perfect — he said he doesn't know anyone yet."),
    msg("GL", "p-g", "Grace Liu", "10:30 AM", "I can drive him if the ride falls through."),
])
thread = (top("Conversation", '<div><div class="mtn">Thread</div><div class="mts">Daniel Reyes</div></div>', right=False) +
    f'<div class="mstream top">{th}</div>' + B.composer(kinds=False, placeholder="Reply…", hint="", label="Reply in thread", cid="mt"))
page("M-Thread.dc.html", "Phone · Thread", thread)

# ── Story with replies chips ───────────────────────────────────────
FEET = ic(P["feet"], 14)
story = (top("People", "") + HERO + segs("story") + f'''<div class="story2">
<div class="se"><span class="sdot"></span><div><div class="sw">Maria · Tue, Sep 22</div><p class="st">Met Daniel at the welcome table. Transfer from Fresno State, living in West Village.</p><button class="linkb">{FEET}Think it through together</button></div></div>
<div class="se"><span class="sdot"></span><div><div class="sw">Josh · Thu, Sep 17</div><p class="st">Sat with Daniel at the Thursday gathering. He's into film photography and asked whether the retreat costs anything.</p>{thr("2 replies", "Last reply Sep 18", [("MS","p-m"),("JP","p-j")])}</div></div>
<div class="se" style="border-bottom: 0;"><span class="sdot" style="background: #A1A1AA;"></span><div><div class="sw">Maria · Sat, Sep 12</div><p class="st">Added Daniel.</p></div></div>
</div>''')
page("M-Story.dc.html", "Phone · Story with replies", story)

# ── DM ─────────────────────────────────────────────────────────────
dm = "".join([
    day("Yesterday"),
    msg("GL", "p-g", "Grace Liu", "6:10 PM", "Can you cover the table Thursday? I have a dentist appointment at 11."),
    msg("MS", "p-m", "Maria Santos", "6:24 PM", "Yes — I'll take 11 to 12. Can Josh do the second hour?", extra=thr("1 reply", "Last reply 7:02 PM", [("GL", "p-g")])),
    day("Today"),
    msg("GL", "p-g", "Grace Liu", "9:02 AM", "He can. Thank you!"),
    B.cont("Sign-in sheets are in the blue folder."),
])
dmp = (top("Messages", '<span class="av s p-g">GL</span><div class="mtn">Grace Liu</div>') +
    f'<div class="mstream">{dm}</div>' + B.composer(kinds=False, placeholder="Message Grace", attach=True, hint="", label="Message Grace", cid="md"))
page("M-DM.dc.html", "Phone · DM", dmp)

# ── Announcement, member ───────────────────────────────────────────
T1 = "Fall retreat sign-ups close Friday. Please get the people you're walking with signed up — scholarships are available, just ask me."
FILE = f'<div class="file"><span class="fi">{ic(P["file"],16)}</span><div><div class="fn">Fall retreat sign-up.pdf</div><div class="fm">PDF · 212 KB</div></div></div>'
CHECK = ic(P["check"], 14, 2.4)
an = "".join([
    f'<div class="pinstrip">{ic(P["pin"],14)}Pinned by Maria · stays at the top until she unpins it</div>',
    msg("MS", "p-m", "Maria Santos", "Sep 24", T1, tag=FT, extra=FILE + f'<div class="acts"><button class="btn done" aria-pressed="true">{CHECK}You said got it</button>{thr("3 replies", "3:05 PM", [("JP","p-j"),("GL","p-g")])}</div>'),
    '<div class="newline">New · Today</div>',
    msg("GL", "p-g", "Grace Liu", "9:40 AM", "Welcome table moves to the library steps Thursday — construction on the quad.", tag=FT,
        extra=f'<div class="acts"><button class="btn" aria-pressed="false">Got it</button><button class="btn">{ic(P["reply"],14)}Reply in thread</button></div>'),
])
ann = (top("Messages", f'<span class="chip" style="width: 32px; height: 32px; border-radius: 10px;">{ic(P["mega"],16)}</span><div><div class="mtn">Everyone on Campus</div><div class="mts">Announcement · 24 people</div></div>') +
    f'<div class="mstream top">{an}</div>' +
    f'<div class="foot" style="padding-bottom: 32px;">{ic(P["mega"],16)}Only Full-timers post here. Anyone can reply in a thread.</div>')
page("M-Announce.dc.html", "Phone · Announcement, member", ann)

# ── Long-press sheet (the hover toolbar's phone equivalent) ────────
lp = (top("People", "") + HERO + segs("conv") +
    '<div class="msub"><div class="seg"><button class="segb on">Conversation</button><button class="segb">Full-timers 3</button></div></div>'
    f'<div class="mstream">{conv}</div>' + B.composer(kinds=True, label="Write", cid="ml") +
    f'''<div class="scrim"></div><div class="sheet2" role="dialog" aria-label="Message actions"><div class="grab"></div>
<div class="prev"><div class="mh"><span class="who">Josh Park</span><span class="when">10:02 AM</span></div><p class="tx">I'll sit with him Thursday again.</p></div>
<button class="act">{ic(P["reply"],20)}Reply in thread</button>
<button class="act">{ic(P["todo"],20)}Make a to-do</button>
<button class="act">{ic('<rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>',20)}Copy text</button>
<button class="act danger">{ic('<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>',20)}Delete message</button>
</div>''')
page("M-LongPress.dc.html", "Phone · Long-press actions", lp)
