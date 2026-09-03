import { writeFileSync } from 'node:fs';
import { HEAD, FOOT, svg, I, caption, board } from './build.mjs';

const W = (f, title, body) => writeFileSync(f, HEAD(title) + body + '\n' + FOOT);
const PAGE = (cols, inner) =>
  `<div style="height: 100%; box-sizing: border-box; padding: 24px; display: grid; grid-template-columns: ${cols}; gap: 24px; background: #FFFFFF;">${inner}</div>`;
const MAIN = (inner) =>
  `<div style="min-width: 0; display: flex; flex-direction: column; background: #F4F4F5; border: 1px solid #F0F0F2; border-radius: 24px; overflow: hidden;">${inner}</div>`;

/* ── the compressed head: one 56px row (proposed) ── */
const HEAD56 = `
  <div style="flex: none; height: 56px; display: flex; align-items: center; gap: 12px; padding: 0 28px; border-bottom: 1px solid #F0F0F2;">
    <div style="width: 34px; height: 34px; border-radius: 999px; background: rgba(10,10,11,.06); color: #52525B; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 600; flex: none;">DO</div>
    <h2 style="font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 600; font-size: 19px; letter-spacing: -.015em; line-height: 1.1; margin: 0; color: #0A0A0B; flex: none;">Daniel Okonkwo</h2>
    <span style="display: inline-flex; align-items: center; padding: 2px 10px; border-radius: 999px; font-size: 11.5px; font-weight: 500; background: #EAEAEC; color: #52525B; flex: none;">Growing</span>
    <span style="flex: 1; min-width: 0; font-size: 13px; color: #52525B; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">Last connected 12&nbsp;Aug · Cared for by Sam Whitfield</span>
    <div style="display: flex; gap: 6px; flex: none;">
      <span class="ico">${svg(I.phone, 15, 1.8)}</span>
      <span class="ico">${svg(I.chat, 15, 1.8)}</span>
      <span class="ico">${svg(I.mail, 15, 1.8)}</span>
      <span class="ico">${svg(I.more, 15, 1.8)}</span>
    </div>
  </div>`;

/* ── the tab bar; six tabs fit inside 779 ── */
const TABS = (on) => {
  const t = [['Overview'], ['Follow up', '3'], ['Discussion', '2'], ['Interactions', '7'], ['Prayer', '2'], ['History']];
  return `
  <div style="flex: none; height: 48px; display: flex; align-items: center; gap: 2px; padding: 0 28px; border-bottom: 1px solid #F0F0F2; background: #F4F4F5; overflow: hidden;">
    ${t.map(([l, c]) => `<span class="tab${l === on ? ' on' : ''}">${l}${c ? ` <span class="cnt">${c}</span>` : ''}</span>`).join('\n    ')}
  </div>`;
};

const kv = (icon, text) => `<div class="kv">${svg(icon, 16)}<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${text}</span></div>`;
const NOTES = 'Met at the Welcome BBQ — came with his roommate and stayed the whole evening. Second-year engineering, plays bass in the worship band at his home church back in Fresno and misses it. Asked directly whether the Bible study was only for people who already believe.';

/* ══════════════ 1. Today ══════════════ */
W('Today.dc.html', 'Today', board(PAGE('minmax(0, 1fr) 320px', `
  ${MAIN(`
    <div style="flex: none; display: flex; gap: 18px; align-items: flex-start; padding: 24px 28px 18px; border-bottom: 1px solid #F0F0F2;">
      <div style="width: 56px; height: 56px; border-radius: 999px; background: rgba(10,10,11,.06); color: #52525B; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 600; flex: none;">DO</div>
      <div style="flex: 1; min-width: 0;">
        <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
          <h2 style="font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 500; font-size: 28.28px; letter-spacing: -.015em; line-height: 1.1; margin: 0; color: #0A0A0B;">Daniel Okonkwo</h2>
          <span style="font-size: 12.5px; color: #52525B;">he/him</span>
          <span style="display: inline-flex; padding: 2px 10px; border-radius: 999px; font-size: 12px; background: #EAEAEC; color: #52525B;">Growing</span>
        </div>
        <div style="margin-top: 9px; font-size: 14.5px; color: #52525B; font-weight: 600;">Last connected 12 Aug <span style="font-weight: 400; font-size: 13px;">by Sam Whitfield</span></div>
        <div style="margin-top: 6px; font-size: 13px; color: #A1A1AA;">Sophomore · Engineering · met at the Welcome BBQ</div>
        <div style="margin-top: 10px; display: flex; gap: 8px; flex-wrap: wrap;">
          <span class="pill">${svg(I.phone, 14, 1.8)}Call</span>
          <span class="pill">${svg(I.chat, 14, 1.8)}Text</span>
          <span class="pill">${svg(I.mail, 14, 1.8)}Email</span>
          <span class="pill">${svg(I.chat, 14, 1.8)}Log interaction</span>
        </div>
      </div>
    </div>
    <div style="flex: none; height: 48px; display: flex; align-items: center; gap: 2px; padding: 0 28px; border-bottom: 1px solid #F0F0F2; background: #F4F4F5; overflow: hidden;">
      <span class="tab on">Overview</span>
      <span class="tab">Follow up <span class="cnt">3</span></span>
      <span class="tab">Discussion <span class="cnt">2</span></span>
      <span class="tab">Interactio</span>
    </div>
    <div style="flex: 1 1 auto; min-height: 0; overflow: hidden;">
      <div style="padding: 24px 28px;">
        <h3 class="sect">What we know</h3>
        <div style="font-size: 15px; line-height: 1.66; color: #0A0A0B; max-width: 72ch; text-wrap: pretty;">${NOTES}</div>
      </div>
    </div>
    <div style="flex: none; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 28px; border-top: 1px solid #E4E4E7; background: #F4F4F5;">
      <span style="display: inline-flex; align-items: center; gap: 8px; height: 32px; color: #B1000F; font-weight: 600; font-size: 13px;">${svg(I.trash, 15, 1.8)}Delete contact</span>
      <span style="display: inline-flex; align-items: center; height: 32px; padding: 0 26px; border-radius: 999px; background: rgba(10,10,11,.06); color: #52525B; font-weight: 600; font-size: 13px;">Done</span>
    </div>`)}
  <div style="overflow: hidden; display: flex; flex-direction: column; gap: 16px;">
    <div class="asec"><h3 class="atit">How to reach Daniel</h3>
      <div style="display: flex; flex-direction: column; gap: 12px;">
        ${kv(I.phone, '(916) 555-0143')}${kv(I.mail, 'd.okonkwo@ucdavis.edu')}${kv(I.insta, '@dan.okonkwo')}
      </div></div>
    <div class="asec"><h3 class="atit">Where they are</h3>
      <div style="display: flex; flex-direction: column; gap: 12px;">${kv(I.pin, 'Segundo, Bldg 4')}</div></div>
    <div class="asec"><h3 class="atit">Cared for by</h3>
      <div class="kv"><div style="width: 30px; height: 30px; border-radius: 999px; background: rgba(10,10,11,.06); color: #52525B; font-size: 12px; font-weight: 600; display: flex; align-items: center; justify-content: center;">SW</div><span>Sam Whitfield</span></div></div>
  </div>`), 32) + `
  <div class="rl" style="left: 288px; top: 96px;  width: 435px; height: 166px;"></div>
  <div class="rl" style="left: 288px; top: 262px; width: 435px; height: 48px;"></div>
  <div class="rl" style="left: 288px; top: 530px; width: 435px; height: 60px;"></div>
  <div class="rl" style="left: 747px; top: 96px;  width: 320px; height: 494px;"></div>
  <div class="rl" style="left: 264px; top: 614px; width: 827px; height: 32px;"></div>
  <div style="position: absolute; left: 288px; top: 310px; width: 435px; height: 220px; box-sizing: border-box; border: 2px solid #C81E4A; pointer-events: none;"></div>
  <span class="chip" style="left: 296px; top: 104px;">pinned · 166px</span>
  <span class="chip" style="left: 296px; top: 272px;">pinned · 48px</span>
  <span class="chip" style="left: 296px; top: 552px;">pinned · 60px — for “Done”, on a page that is a route</span>
  <span class="chip" style="left: 755px; top: 104px;">320px · 41% of the usable width</span>
  <span class="chip" style="left: 272px; top: 620px;">32px phantom scroll — height:100% under pb-8</span>
  <span class="chipk" style="left: 424px; top: 494px;">220 × 435 — everything you can work in</span>
  ` + caption('Today', '/people/:contactId at 1107×662, the reported viewport. 274px of 494 is pinned chrome.') + '</div>');

/* ══════════════ 2. Main — the proposed frame ══════════════ */
W('Main.dc.html', 'Frame', board(PAGE('minmax(0, 1fr)', MAIN(`
  ${HEAD56}
  ${TABS('Overview')}
  <div style="flex: 1 1 auto; min-height: 0; overflow: hidden;">
    <div style="padding: 22px 28px;">
      <h3 class="sect">What we know</h3>
      <div style="font-size: 15px; line-height: 1.66; color: #0A0A0B; max-width: 72ch; text-wrap: pretty;">${NOTES}</div>
    </div>
    <div style="padding: 4px 28px 22px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px;">
      <div><h3 class="atit">How to reach Daniel</h3>
        <div style="display: flex; flex-direction: column; gap: 12px;">
          ${kv(I.phone, '(916) 555-0143')}${kv(I.mail, 'd.okonkwo@ucdavis.edu')}${kv(I.insta, '@dan.okonkwo')}
        </div></div>
      <div><h3 class="atit">Where they are</h3>
        <div style="display: flex; flex-direction: column; gap: 12px;">
          ${kv(I.pin, 'Segundo, Bldg 4')}${kv(I.cal, 'Sophomore · Engineering')}
        </div></div>
      <div><h3 class="atit">Cared for by</h3>
        <div class="kv"><div style="width: 30px; height: 30px; border-radius: 999px; background: rgba(10,10,11,.06); color: #52525B; font-size: 12px; font-weight: 600; display: flex; align-items: center; justify-content: center;">SW</div><span>Sam Whitfield</span></div></div>
      <div><h3 class="atit">Who else can see</h3>
        <div class="kv"><div style="width: 30px; height: 30px; border-radius: 999px; background: rgba(10,10,11,.06); color: #52525B; font-size: 12px; font-weight: 600; display: flex; align-items: center; justify-content: center;">RA</div><span>Rina Adeyemi · gospel partner</span></div></div>
    </div>
    <div style="padding: 0 28px 22px;"><h3 class="atit">Tags</h3>
      <div style="display: flex; gap: 8px; flex-wrap: wrap;">
        <span class="pill">bass player</span><span class="pill">engineering</span><span class="pill">Fresno</span>
      </div></div>
  </div>`)), 0) + `
  <div class="gn" style="left: 288px; top: 200px; width: 779px; height: 422px;"></div>
  <span class="chipg" style="left: 296px; top: 208px;">422 × 779 — the same page, after</span>
  <span class="chip"  style="left: 296px; top: 104px;">56px — avatar, name, last connected, cared for by, actions</span>
  <span class="chipk" style="left: 850px; top: 570px;">Delete contact sits below the fold, at the end of Overview</span>
  ` + caption('Frame', 'Aside deleted, head compressed to one row, foot gone, pb-8 dropped. 220 → 422 tall, 435 → 779 wide.') + '</div>');

console.log('wrote Today.dc.html, Main.dc.html');

/* ══════════════ 3. Panes — Discussion as a fill pane ══════════════ */
const msg = (init, who, when, text, mine) => `
  <div style="display: flex; gap: 10px; align-items: flex-start;">
    <div style="width: 28px; height: 28px; border-radius: 999px; background: rgba(10,10,11,.06); color: #52525B; font-size: 11px; font-weight: 600; display: flex; align-items: center; justify-content: center; flex: none;">${init}</div>
    <div style="min-width: 0;">
      <div style="font-size: 12px; color: #A1A1AA; margin-bottom: 3px;"><span style="color: #52525B; font-weight: 600;">${who}</span> · ${when}</div>
      <div class="msg" style="background: ${mine ? '#EAEAEC' : '#FFFFFF'}; border: 1px solid #F0F0F2;">${text}</div>
    </div>
  </div>`;

W('Panes.dc.html', 'Panes', board(PAGE('minmax(0, 1fr)', MAIN(`
  ${HEAD56}
  ${TABS('Discussion')}
  <div style="flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column;">
    <div style="flex: none; padding: 18px 28px 12px;">
      <h3 class="sect" style="margin: 0 0 4px;">Discussion</h3>
      <div style="font-size: 13px; color: #52525B;">Full-timers only — how the team is thinking about caring for Daniel.</div>
    </div>
    <div style="flex: 1 1 auto; min-height: 0; overflow: hidden; padding: 4px 28px 12px; display: flex; flex-direction: column; gap: 14px; justify-content: flex-end;">
      ${msg('SW', 'Sam Whitfield', '8 Aug', 'He asked whether the study is only for people who already believe. I said no and left it there — didn’t want to oversell it. Worth someone else picking that thread up.', false)}
      ${msg('GL', 'Grace Lim', '11 Aug', 'Rina knows him from the dorm floor. Might be more natural coming from her than from either of us.', false)}
      ${msg('SW', 'Sam Whitfield', '12 Aug', 'Agreed. I’ll hand it to Rina and stay out of the way. Bass player — the band could be a real door here.', true)}
    </div>
    <div style="flex: none; padding: 12px 28px 16px; border-top: 1px solid #F0F0F2; background: #F4F4F5;">
      <div style="border: 1px solid #E4E4E7; border-radius: 16px; background: #FFFFFF; padding: 12px 14px; font-size: 13.5px; color: #A1A1AA; min-height: 34px;">Add to the discussion…</div>
      <div style="display: flex; justify-content: flex-end; margin-top: 10px;">
        <span style="display: inline-flex; align-items: center; gap: 7px; height: 32px; padding: 0 16px; border-radius: 999px; background: #131316; color: #FFFFFF; font-size: 13px; font-weight: 600;">${svg(I.send, 14, 1.8)}Comment</span>
      </div>
    </div>
  </div>`)), 0) + `
  <div class="gn" style="left: 288px; top: 262px; width: 779px; height: 258px;"></div>
  <span class="chipg" style="left: 296px; top: 270px;">the list scrolls — opens at the newest</span>
  <span class="chipk" style="left: 296px; top: 528px;">the composer is pinned to the pane, not parked below the list</span>
  <span class="chip"  style="left: 700px; top: 104px;">Thread gains a pane variant beside compact — desktop opts in; mobile is untouched</span>
  ` + caption('Panes', 'Discussion and Follow up declare fill: the pane owns its height. Every other tab still flows.') + '</div>');

/* ══════════════ 4. Editing — the form at 779px ══════════════ */
const field = (label, value, dim) => `
  <div><span class="lbl">${label}</span><div class="fld"${dim ? ' style="color:#A1A1AA;border:1px solid #E4E4E7;border-radius:14px;background:#FFFFFF;height:42px;display:flex;align-items:center;padding:0 14px;font-size:14px"' : ''}>${value}</div></div>`;

W('Editing.dc.html', 'Editing', board(PAGE('minmax(0, 1fr)', MAIN(`
  ${HEAD56}
  ${TABS('Overview')}
  <div style="flex: 1 1 auto; min-height: 0; overflow: hidden;">
    <div style="padding: 22px 28px; display: flex; flex-direction: column; gap: 18px;">
      <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px;">
        ${field('First name', 'Daniel')}
        ${field('Last name', 'Okonkwo')}
        ${field('Phone', '(916) 555-0143')}
        ${field('Email', 'd.okonkwo@ucdavis.edu')}
        ${field('Instagram', '@dan.okonkwo')}
        ${field('How we met', 'Welcome BBQ')}
        ${field('Location', 'Segundo, Bldg 4')}
        ${field('Part of', 'Engineering')}
      </div>
      <div><span class="lbl">First impressions</span>
        <div style="border: 1px solid #E4E4E7; border-radius: 14px; background: #FFFFFF; padding: 12px 14px; font-size: 14px; line-height: 1.6; color: #0A0A0B; min-height: 76px;">${NOTES}</div></div>
    </div>
  </div>
  <div style="flex: none; height: 52px; display: flex; align-items: center; justify-content: flex-end; gap: 10px; padding: 0 28px; border-top: 1px solid #E4E4E7; background: #F4F4F5;">
    <span style="display: inline-flex; align-items: center; height: 32px; padding: 0 18px; border-radius: 999px; color: #52525B; font-weight: 600; font-size: 13px;">Cancel</span>
    <span style="display: inline-flex; align-items: center; height: 32px; padding: 0 24px; border-radius: 999px; background: #131316; color: #FFFFFF; font-weight: 600; font-size: 13px;">Save changes</span>
  </div>`)), 0) + `
  <div class="gn" style="left: 288px; top: 200px; width: 779px; height: 370px;"></div>
  <span class="chipg" style="left: 296px; top: 208px;">370 × 779 — two columns at ~365px each, not 200px</span>
  <span class="chipk" style="left: 296px; top: 578px;">Save and Cancel pin only while editing — the only thing worth 52px</span>
  <span class="chip"  style="left: 700px; top: 104px;">columns come from a container query, not md: — the rail's 232/76 changes width without the viewport moving</span>
  ` + caption('Editing', 'The edit form in the same frame. Delete contact is gone from here — it lives at the end of Overview.') + '</div>');

console.log('wrote Panes.dc.html, Editing.dc.html');
