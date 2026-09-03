// Assembles the four contact-detail artboards from one shared shell.
// Every value here is lifted from src/index.css, App.tsx, permissions.ts and
// ContactDetailsModal.tsx — see _shell.txt. Re-run after editing.
import { writeFileSync } from 'node:fs';

const HEAD = (title) => `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Lexend:wght@300;400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap">
  <style>
    body { margin: 0; font-family: "Lexend", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
    a { color: #52525B; } a:hover { color: #0A0A0B; }
    .rl { position: absolute; box-sizing: border-box; border: 1px dashed rgba(200,30,74,.5);
          background: repeating-linear-gradient(45deg, rgba(200,30,74,.11) 0 6px, rgba(200,30,74,0) 6px 12px); }
    .gn { position: absolute; box-sizing: border-box; border: 1px dashed rgba(2,110,90,.55);
          background: repeating-linear-gradient(45deg, rgba(2,110,90,.09) 0 6px, rgba(2,110,90,0) 6px 12px); }
    .chip { position: absolute; background: #C81E4A; color: #fff; font-size: 11px; font-weight: 600;
            padding: 3px 8px; border-radius: 6px; white-space: nowrap; box-shadow: 0 2px 6px rgba(200,30,74,.3); }
    .chipg { position: absolute; background: #026E5A; color: #fff; font-size: 11px; font-weight: 600;
             padding: 3px 8px; border-radius: 6px; white-space: nowrap; box-shadow: 0 2px 6px rgba(2,110,90,.3); }
    .chipk { position: absolute; background: #0A0A0B; color: #fff; font-size: 11px; font-weight: 600;
             padding: 3px 8px; border-radius: 6px; white-space: nowrap; box-shadow: 0 2px 8px rgba(10,10,11,.35); }
    .ri { display: flex; align-items: center; gap: 12px; height: 40px; padding: 0 12px;
          border-radius: 14px; font-size: 14px; color: rgba(255,255,255,.62); }
    .ri.on { background: #FFFFFF; color: #0A0A0B; font-weight: 600; }
    .pill { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 12px;
            border: 1px solid #E4E4E7; border-radius: 999px; font-size: 12px; color: #0A0A0B; }
    .ico { width: 30px; height: 30px; border-radius: 999px; border: 1px solid #E4E4E7;
           display: flex; align-items: center; justify-content: center; color: #52525B; flex: none; }
    .tab { display: inline-flex; align-items: center; gap: 6px; height: 48px; padding: 0 12px;
           font-size: 14px; color: #52525B; white-space: nowrap; flex: 0 0 auto; }
    .tab.on { color: #0A0A0B; font-weight: 600; box-shadow: inset 0 -4px 0 -1px #52525B; }
    .cnt { font-size: 11.5px; font-weight: 600; color: #52525B; background: #EAEAEC;
           border: 1px solid #F0F0F2; border-radius: 999px; padding: 0 7px; line-height: 17px;
           min-width: 17px; text-align: center; }
    .asec { background: #F4F4F5; border: 1px solid #F0F0F2; border-radius: 24px; padding: 20px; }
    .atit { font-size: 15.5px; font-weight: 600; color: #0A0A0B; margin: 0 0 14px; }
    .kv { display: flex; align-items: center; gap: 12px; font-size: 14px; color: #0A0A0B; min-width: 0; }
    .sect { font-family: "Plus Jakarta Sans", sans-serif; font-size: 20px; font-weight: 500;
            letter-spacing: -.01em; margin: 0 0 16px; color: #0A0A0B; }
    .lbl { font-size: 12px; font-weight: 600; color: #52525B; margin-bottom: 6px; display: block; }
    .fld { height: 42px; border: 1px solid #E4E4E7; border-radius: 14px; background: #FFFFFF;
           display: flex; align-items: center; padding: 0 14px; font-size: 14px; color: #0A0A0B; }
    .bnm { font-family: "Plus Jakarta Sans", sans-serif; font-size: 15px; font-weight: 700; color: #0A0A0B; }
    .bsub { font-size: 12.5px; color: #A1A1AA; }
    .msg { border-radius: 16px; padding: 12px 14px; font-size: 13.5px; line-height: 1.55; color: #0A0A0B; }
  </style>
</helmet>
`;
const FOOT = `</x-dc>
</body>
</html>
`;

const svg = (d, s = 18, w = 1.7) =>
  `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

const I = {
  home: '<path d="M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
  board: '<rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="11" rx="1.5"/><rect x="17" y="4" width="4" height="7" rx="1.5"/>',
  people: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><path d="M16 5.3a3.2 3.2 0 0 1 0 5.4"/><path d="M17.5 20a5.4 5.4 0 0 0-2-4.2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  flag: '<path d="M5 21V4.5A1.5 1.5 0 0 1 6.5 3h11l-2.5 4 2.5 4h-11"/>',
  heart: '<path d="M12 20s-7.2-4.6-7.2-9.4A4.1 4.1 0 0 1 12 8a4.1 4.1 0 0 1 7.2 2.6C19.2 15.4 12 20 12 20z"/>',
  chat: '<path d="M20 15a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z"/>',
  gear: '<circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7.5 19l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3.6 13H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 5 7.5l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 11 3.6V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.6 1.6 0 0 0 20.4 9H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a12 12 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1.1 1A16 16 0 0 1 4 5.1 1 1 0 0 1 5 4z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  insta: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/>',
  pin: '<path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/>',
  bell: '<path d="M18 8a6 6 0 1 0-12 0c0 7-2 8-2 8h16s-2-1-2-8"/><path d="M10.5 20a1.8 1.8 0 0 0 3 0"/>',
  trash: '<path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/>',
  more: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
  send: '<path d="M4 12 20 4l-6 16-2.5-6.5z"/>',
};

const RAIL = `
  <div style="position: absolute; left: 16px; top: 16px; width: 232px; height: 630px; background: #0A0A0B; border-radius: 32px; box-shadow: 0 8px 32px rgba(10,10,11,.14); overflow: hidden; display: flex; flex-direction: column; padding: 18px 12px; box-sizing: border-box; gap: 2px;">
    <div style="display: flex; align-items: center; gap: 10px; padding: 0 12px 16px;">
      <div style="width: 26px; height: 26px; border-radius: 8px; background: #FFFFFF; display: flex; align-items: center; justify-content: center; color: #0A0A0B; font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 700; font-size: 13px;">C</div>
      <div style="color: #FFFFFF; font-family: 'Plus Jakarta Sans', sans-serif; font-size: 14.5px; font-weight: 600;">CISA</div>
    </div>
    <div class="ri">${svg(I.home)}My Day</div>
    <div class="ri">${svg(I.board)}The Journey</div>
    <div class="ri on">${svg(I.people)}People</div>
    <div class="ri">${svg(I.clock)}Looking back</div>
    <div class="ri">${svg(I.cal)}Gatherings</div>
    <div class="ri">${svg(I.flag)}Gospel</div>
    <div class="ri">${svg(I.heart)}On our hearts</div>
    <div class="ri">${svg(I.chat)}Messages</div>
    <div class="ri">${svg(I.gear)}Settings</div>
  </div>`;

const CHROME = `
    <div style="height: 56px; flex: none; display: flex; align-items: center; gap: 10px; justify-content: flex-end;">
      <div style="flex: 1;"></div>
      <div style="width: 34px; height: 34px; border-radius: 999px; border: 1px solid #E4E4E7; display: flex; align-items: center; justify-content: center; color: #52525B;">${svg(I.bell, 17)}</div>
      <div style="width: 40px; height: 40px; border-radius: 999px; background: #EAEAEC; border: 1px solid #E4E4E7;"></div>
    </div>`;

const caption = (name, text) => `
  <div style="position: absolute; left: 288px; top: 30px; display: flex; align-items: baseline; gap: 10px;">
    <span class="bnm">${name}</span><span class="bsub">${text}</span>
  </div>`;

// Board frame: rail + chrome + a main slot. `pb` is main's bottom padding.
const board = (inner, pb) => `
<div style="width: 1107px; height: 662px; position: relative; background: #FFFFFF; overflow: hidden;">
  ${RAIL}
  <div style="position: absolute; left: 264px; top: 16px; width: 827px; height: 630px; display: flex; flex-direction: column;">
    ${CHROME}
    <div style="flex: 1; min-height: 0; padding-bottom: ${pb}px; box-sizing: border-box;">
      ${inner}
    </div>
  </div>
`;

export { HEAD, FOOT, svg, I, RAIL, CHROME, caption, board };
