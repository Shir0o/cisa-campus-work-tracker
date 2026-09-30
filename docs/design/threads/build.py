#!/usr/bin/env python3
"""Builds the generated full-set artboards (direction A, kind treatment 1) from one shell and one stylesheet.

Main, A-Messages, B-*, C-* and Kinds are hand-written; everything else here is generated:
    python3 build.py && python3 build_mobile.py
"""
import os
OUT = os.path.dirname(os.path.abspath(__file__))

def ic(d, s=18, w=2):
    return f'<svg width="{s}" height="{s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="{w}" stroke-linecap="round" stroke-linejoin="round">{d}</svg>'

P = {
 "home": '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z"></path>',
 "users": '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"></path>',
 "msg": '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>',
 "heart": '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"></path>',
 "cal": '<rect x="3" y="4" width="18" height="18" rx="2"></rect><path d="M16 2v4M8 2v4M3 10h18"></path>',
 "book": '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15Z"></path><path d="M20 17v5H6.5A2.5 2.5 0 0 1 4 19.5"></path>',
 "around": '<circle cx="12" cy="12" r="10"></circle><path d="m16.24 7.76-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z"></path>',
 "search": '<circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path>',
 "bell": '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"></path><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"></path>',
 "x": '<path d="M18 6 6 18M6 6l12 12"></path>',
 "back": '<path d="m12 19-7-7 7-7M19 12H5"></path>',
 "send": '<path d="m22 2-7 20-4-9-9-4Z"></path><path d="M22 2 11 13"></path>',
 "at": '<circle cx="12" cy="12" r="4"></circle><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"></path>',
 "clip": '<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>',
 "reply": '<path d="M9 17 4 12l5-5"></path><path d="M20 18v-2a4 4 0 0 0-4-4H4"></path>',
 "todo": '<path d="m9 11 3 3L22 4"></path><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>',
 "more": '<circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle>',
 "mega": '<path d="m3 11 18-5v12L3 14v-3z"></path><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"></path>',
 "pin": '<path d="M12 17v5"></path><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"></path>',
 "file": '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><path d="M14 2v6h6"></path>',
 "check": '<path d="M20 6 9 17l-5-5"></path>',
 "info": '<circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4M12 8h.01"></path>',
 "lock": '<rect x="3" y="11" width="18" height="11" rx="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path>',
 "globe": '<circle cx="12" cy="12" r="10"></circle><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>',
 "pencil": '<path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path>',
 "user": '<circle cx="12" cy="8" r="4"></circle><path d="M4 21a8 8 0 0 1 16 0"></path>',
 "feet": '<path d="M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z"></path><path d="M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z"></path>',
}

CSS = r"""
body{margin:0}
*{box-sizing:border-box}
a{color:#131316}a:hover{color:#52525B}
button{font-family:inherit;cursor:pointer}
svg{display:block;flex:none}
.root{font-family:Lexend,ui-sans-serif,system-ui,sans-serif;color:#0A0A0B;background:#FFFFFF;-webkit-font-smoothing:antialiased;position:relative;overflow:hidden;display:flex;gap:16px;padding:16px}
.rail{width:232px;flex:none;background:#0A0A0B;border-radius:32px;padding:20px 14px;display:flex;flex-direction:column;gap:4px;color:#A1A1AA}
.brand{display:flex;align-items:center;gap:10px;padding:0 6px 18px;color:#FAFAFA;font-family:"Plus Jakarta Sans",sans-serif;font-weight:800;font-size:15px;letter-spacing:-0.01em}
.logo{width:32px;height:32px;border-radius:10px;background:#FAFAFA;color:#0A0A0B;display:grid;place-items:center;font-size:12px;font-weight:800}
.ri{height:44px;border-radius:14px;display:flex;align-items:center;gap:12px;padding:0 12px;font-size:14px;font-weight:500;color:#A1A1AA;text-decoration:none}
.ri.on{background:#FAFAFA;color:#0A0A0B}
.col{flex:1;min-width:0;display:flex;flex-direction:column}
.chrome{height:56px;flex:none;display:flex;align-items:center;gap:12px;padding:0 4px 12px}
.search{flex:1;max-width:400px;height:40px;border-radius:999px;background:#F4F4F5;display:flex;align-items:center;gap:10px;padding:0 16px;font-size:13.5px;color:#71717A}
.kbd{margin-left:auto;font-size:11px;color:#52525B;border:1px solid #E4E4E7;border-radius:6px;padding:1px 6px;background:#FFFFFF}
.chrome-r{margin-left:auto;display:flex;align-items:center;gap:6px}
.icon-btn{width:40px;height:40px;border-radius:999px;display:grid;place-items:center;color:#52525B;background:transparent;border:0;flex:none}
.av{width:36px;height:36px;border-radius:50%;flex:none;display:grid;place-items:center;font-size:12.5px;font-weight:600}
.av.s{width:28px;height:28px;font-size:10.5px}
.av.xs{width:20px;height:20px;font-size:8.5px;border:2px solid #FFFFFF}
.p-m{background:#E0E7FF;color:#3730A3}.p-j{background:#DCFCE7;color:#166534}.p-g{background:#FCE7F3;color:#9D174D}.p-r{background:#FEF3C7;color:#92400E}.p-d{background:#E4E4E7;color:#3F3F46}.p-t{background:#131316;color:#FFFFFF}.p-k{background:#CCFBF1;color:#115E59}
/* contact page */
.page{flex:1;min-height:0;background:#F4F4F5;border:1px solid #F0F0F2;border-radius:24px;position:relative;overflow:hidden}
.cd-head{height:64px;display:flex;align-items:center;gap:12px;padding:0 24px;border-bottom:1px solid #E4E4E7}
.cd-name{font-family:"Plus Jakarta Sans",sans-serif;font-weight:800;font-size:18px;letter-spacing:-0.02em}
.cd-sub{font-size:12px;color:#52525B}
.band{display:flex;gap:8px;padding:14px 24px;border-bottom:1px solid #E4E4E7}
.step{height:30px;border-radius:999px;padding:0 12px;font-size:12px;display:flex;align-items:center;background:#FFFFFF;color:#52525B;border:1px solid #E4E4E7;white-space:nowrap}
.step.on{background:#131316;color:#FFFFFF;border-color:#131316}
.story{padding:20px 24px;display:flex;flex-direction:column;gap:16px;width:360px}
.entry{display:grid;grid-template-columns:52px 1fr;gap:12px;font-size:12.5px;color:#52525B;line-height:1.5}
.entry b{color:#0A0A0B;font-weight:600}
.entry .thr{margin-top:8px}
.drawer{position:absolute;top:0;right:0;bottom:0;width:460px;background:#FFFFFF;border-left:1px solid #E4E4E7;box-shadow:-16px 0 40px rgba(10,10,11,0.08);display:flex;flex-direction:column}
.dh{display:flex;align-items:flex-start;gap:8px;padding:16px 12px 12px 24px;border-bottom:1px solid #F0F0F2;flex:none}
.dh.back{padding-left:12px}
.dh h3{font-family:"Plus Jakarta Sans",sans-serif;font-weight:700;font-size:16px;margin:0;letter-spacing:-0.01em;display:flex;align-items:center;gap:6px}
.dh p{margin:2px 0 0;font-size:12px;color:#52525B;line-height:1.45}
.dh .lockline{color:#3F3F46;font-weight:500}
/* stream */
.stream{flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-end;padding:0 24px 6px;position:relative}
.stream.top{justify-content:flex-start;padding-top:8px}
.fade{position:absolute;left:0;right:0;top:0;height:28px;background:linear-gradient(#FFFFFF,rgba(255,255,255,0));z-index:2}
.day{display:flex;align-items:center;gap:10px;margin:12px 0 6px;font-size:11.5px;font-weight:600;color:#52525B}
.day::before,.day::after{content:"";flex:1;height:1px;background:#F0F0F2}
.newline{display:flex;align-items:center;gap:8px;color:#B45309;font-size:11px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;margin:14px 0 4px}
.newline::after{content:"";flex:1;height:1px;background:#F59E0B}
.m{display:flex;gap:10px;padding:6px 8px;margin:0 -8px;border-radius:10px;position:relative}
.m.hover{background:#F4F4F5}
.m.just{background:#F4F4F5;box-shadow:inset 3px 0 0 #131316}
.mb{flex:1;min-width:0}
.mh{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-height:20px}
.who{font-size:14px;font-weight:600}
.when{font-size:11.5px;color:#71717A}
.tx{font-size:14px;line-height:1.5;margin:1px 0 0;color:#18181B}
.cont{padding:1px 8px 4px 54px;margin:0 -8px}
.at{color:#1E40AF;background:#EFF6FF;border-radius:4px;padding:0 3px;font-weight:500}
.thr{display:inline-flex;align-items:center;gap:8px;margin-top:6px;height:30px;padding:0 10px 0 4px;border-radius:10px;border:1px solid #E4E4E7;background:#FFFFFF;font-size:12.5px;color:#0A0A0B}
.thr.on{border-color:#131316;box-shadow:0 0 0 1px #131316}
.minis{display:flex}
.minis .av + .av{margin-left:-6px}
.thr b{font-weight:600}
.thr .last{color:#71717A}
.tools{position:absolute;top:-14px;right:8px;display:flex;gap:2px;padding:3px;background:#FFFFFF;border:1px solid #E4E4E7;border-radius:12px;box-shadow:0 4px 12px rgba(10,10,11,0.08);z-index:3}
.tool{width:30px;height:30px;border-radius:8px;display:grid;place-items:center;color:#52525B;background:transparent;border:0}
.tool.on{background:#F4F4F5;color:#0A0A0B}
.tag{display:inline-flex;align-items:center;height:20px;padding:0 8px;border-radius:999px;font-size:11px;font-weight:600;gap:4px}
.tag.q{background:#DBEAFE;color:#1E40AF}
.tag.ask{background:#FEF3C7;color:#92400E}
.tag.muted{background:#F4F4F5;color:#52525B}
.tag.role{background:#F4F4F5;color:#3F3F46;border:1px solid #E4E4E7}
.tag.just{background:#131316;color:#FFFFFF}
.status{display:flex;align-items:center;gap:8px;margin-top:8px;flex-wrap:wrap;font-size:12px;font-weight:500}
.s-open{color:#92400E}
.s-done{color:#016A1C;display:inline-flex;align-items:center;gap:5px}
.btn{height:32px;border-radius:999px;padding:0 14px;font-size:12.5px;font-weight:600;border:1px solid #E4E4E7;background:#FFFFFF;color:#0A0A0B;display:inline-flex;align-items:center;gap:6px}
.btn.pri{background:#131316;color:#FFFFFF;border-color:#131316}
.btn.ghost{border-color:transparent;background:transparent;color:#52525B}
.btn.done{background:#E1FCDE;border-color:#E1FCDE;color:#016A1C}
.file{display:flex;align-items:center;gap:10px;margin-top:8px;padding:8px 12px;border:1px solid #E4E4E7;border-radius:12px;background:#FFFFFF;max-width:300px}
.fi{width:32px;height:32px;border-radius:8px;background:#FEE2E2;color:#991B1B;display:grid;place-items:center;flex:none}
.fn{font-size:13px;font-weight:600}
.fm{font-size:11.5px;color:#71717A}
.cpill{display:inline-flex;align-items:center;gap:8px;margin-top:8px;height:36px;padding:0 12px 0 4px;border:1px solid #E4E4E7;border-radius:999px;background:#FFFFFF;font-size:13px;font-weight:600}
.cpill .cps{font-weight:400;color:#52525B;font-size:12px}
.quote{border:1px solid #E4E4E7;border-radius:14px;padding:12px 14px;background:#FAFAFA;margin-top:6px}
.quote .qh{font-size:11.5px;font-weight:600;color:#52525B;display:flex;align-items:center;gap:6px;text-transform:uppercase;letter-spacing:0.04em}
.quote .tx{margin-top:6px}
.rc{display:flex;align-items:center;gap:10px;font-size:12px;font-weight:600;color:#52525B;margin:12px 0 6px}
.rc::after{content:"";flex:1;height:1px;background:#F0F0F2}
/* composer */
.composer{padding:8px 20px 16px;flex:none;position:relative}
.cbox{border:1px solid #E4E4E7;border-radius:16px;background:#FFFFFF;padding:8px 8px 8px 12px;box-shadow:0 1px 2px rgba(10,10,11,0.04)}
.cbox.focus{border-color:#131316;box-shadow:0 0 0 3px rgba(19,19,22,0.08)}
.kinds{display:flex;gap:4px;margin:0 0 2px -4px}
.kind{height:28px;border-radius:999px;border:1px solid transparent;background:transparent;padding:0 10px;font-size:12px;font-weight:500;color:#52525B}
.kind.on{background:#F4F4F5;color:#0A0A0B;border-color:#E4E4E7}
.kind.on.ask{background:#FEF3C7;color:#92400E;border-color:#FDE68A}
.ta{display:block;width:100%;border:0;outline:0;resize:none;font-family:inherit;font-size:14px;line-height:1.5;color:#0A0A0B;padding:6px 0 4px;height:40px;background:transparent}
.ta.tall{height:62px}
.ta::placeholder{color:#71717A}
.typed{font-size:14px;line-height:1.5;padding:6px 0 4px;min-height:40px}
.caret{display:inline-block;width:1.5px;height:17px;background:#0A0A0B;vertical-align:-3px;margin-left:1px}
.ctools{display:flex;align-items:center;gap:4px}
.hint{font-size:11.5px;color:#71717A;margin-left:auto;margin-right:8px}
.aud{font-size:11.5px;color:#52525B;margin:0 0 6px 2px;display:flex;align-items:center;gap:6px}
.send{width:36px;height:36px;border-radius:999px;background:#131316;color:#FFFFFF;display:grid;place-items:center;border:0;flex:none}
.staged{display:flex;gap:8px;margin:2px 0 4px}
.stg{display:flex;align-items:center;gap:8px;height:40px;padding:0 6px 0 8px;border:1px solid #E4E4E7;border-radius:12px;background:#FAFAFA;font-size:12.5px;font-weight:600}
.pop{position:absolute;left:20px;bottom:100%;width:280px;background:#FFFFFF;border:1px solid #E4E4E7;border-radius:14px;box-shadow:0 12px 32px rgba(10,10,11,0.12);padding:6px;z-index:5}
.pop .ph2{font-size:11px;font-weight:600;color:#52525B;padding:6px 8px 4px;text-transform:uppercase;letter-spacing:0.05em}
.opt{display:flex;align-items:center;gap:10px;padding:6px 8px;border-radius:10px;font-size:13px;font-weight:500;width:100%;border:0;background:transparent;text-align:left}
.opt.on{background:#F4F4F5}
.opt .os{margin-left:auto;font-size:11px;color:#71717A;font-weight:400}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
/* messages */
.msgs{flex:1;min-height:0;display:flex;gap:16px}
.side{width:328px;flex:none;border:1px solid #F0F0F2;border-radius:24px;display:flex;flex-direction:column;overflow:hidden}
.sh{display:flex;align-items:center;justify-content:space-between;padding:16px 12px 10px 20px}
.sh h2{font-family:"Plus Jakarta Sans",sans-serif;font-size:20px;font-weight:800;margin:0;letter-spacing:-0.02em}
.sfind{margin:0 16px 10px;height:38px;border-radius:12px;background:#F4F4F5;display:flex;align-items:center;gap:8px;padding:0 12px;font-size:13px;color:#71717A}
.pills{display:flex;gap:6px;padding:0 16px 6px;flex-wrap:wrap}
.pill{height:30px;padding:0 12px;border-radius:999px;font-size:12px;font-weight:500;border:1px solid #E4E4E7;background:#FFFFFF;color:#52525B;display:inline-flex;align-items:center;gap:6px}
.pill.on{background:#131316;color:#FFFFFF;border-color:#131316}
.sech{font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#52525B;padding:14px 20px 6px}
.row{display:flex;gap:10px;align-items:center;padding:8px 12px;margin:0 8px;border-radius:14px;min-height:56px}
.row.on{background:#F4F4F5}
.rm{flex:1;min-width:0}
.rn{font-size:13.5px;font-weight:600;display:flex;gap:6px;align-items:center}
.rs{font-size:12.5px;color:#52525B;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rt{font-size:11px;color:#71717A;align-self:flex-start;padding-top:3px;display:flex;flex-direction:column;align-items:flex-end;gap:6px}
.unread{width:8px;height:8px;border-radius:50%;background:#D97706}
.chip{width:36px;height:36px;border-radius:12px;background:#F4F4F5;color:#3F3F46;display:grid;place-items:center;flex:none}
.stack{width:36px;height:36px;position:relative;flex:none}
.stack .av{position:absolute;width:24px;height:24px;font-size:9px;border:2px solid #FFFFFF}
.chan{flex:1;min-width:0;border:1px solid #F0F0F2;border-radius:24px;display:flex;flex-direction:column;overflow:hidden}
.chh{display:flex;align-items:center;gap:12px;padding:14px 12px 14px 20px;border-bottom:1px solid #F0F0F2;flex:none}
.chn{font-family:"Plus Jakarta Sans",sans-serif;font-weight:700;font-size:16px;letter-spacing:-0.01em}
.chs{font-size:12px;color:#52525B}
.cstream{flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column;padding:6px 20px 12px}
.cstream.bottom{justify-content:flex-end}
.pinstrip{display:flex;align-items:center;gap:6px;font-size:12px;color:#52525B;font-weight:500;margin:8px 0 2px}
.acts{display:flex;align-items:center;gap:8px;margin-top:8px;flex-wrap:wrap}
.receipt{font-size:12px;color:#52525B;font-weight:500;text-decoration:underline;text-underline-offset:2px;background:transparent;border:0;padding:0 4px;height:32px}
.foot{display:flex;align-items:center;gap:10px;padding:14px 20px;border-top:1px solid #F0F0F2;font-size:13px;color:#3F3F46;background:#FAFAFA;flex:none}
.pane{width:340px;flex:none;border:1px solid #F0F0F2;border-radius:24px;display:flex;flex-direction:column;overflow:hidden}
.pstream{flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column;padding:10px 20px}
/* around */
.pg{flex:1;min-height:0;display:flex;flex-direction:column;gap:14px;padding:4px 8px 0}
.pgh{display:flex;align-items:flex-end;gap:16px}
.pgh h1{font-family:"Plus Jakarta Sans",sans-serif;font-weight:800;font-size:28px;letter-spacing:-0.025em;margin:0}
.pgh p{margin:4px 0 0;font-size:13px;color:#52525B}
.grid3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;align-items:start}
.wc{background:#F4F4F5;border:1px solid #F0F0F2;border-radius:24px;padding:18px}
.wc.open{background:#FFFFFF;border-color:#E4E4E7;box-shadow:0 8px 28px rgba(10,10,11,0.06)}
.wch{display:flex;align-items:center;gap:10px}
.wcn{font-weight:600;font-size:14.5px}
.wcs{font-size:12px;color:#52525B}
.wcb{font-size:13px;line-height:1.55;color:#18181B;margin:10px 0 0}
.clamp{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.wca{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap}
.strip{margin-top:14px;padding-top:12px;border-top:1px solid #E4E4E7}
.seg{display:inline-flex;gap:2px;padding:2px;border-radius:999px;background:#EAEAEC}
.segb{height:30px;border-radius:999px;padding:0 12px;font-size:12px;font-weight:500;border:0;background:transparent;color:#52525B}
.segb.on{background:#FFFFFF;color:#0A0A0B;font-weight:600;box-shadow:0 1px 2px rgba(10,10,11,0.08)}
.strip .m{padding:5px 6px;margin:0 -6px}
.strip .composer{padding:8px 0 0}
.sheadback{display:flex;align-items:center;gap:6px;margin:-4px 0 6px -8px}
/* notes */
.nlist{display:flex;flex-direction:column;gap:12px}
.note{border:1px solid #F0F0F2;border-radius:24px;padding:20px 24px;background:#FFFFFF}
.note.shut{background:#F4F4F5}
.nh{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.nb{font-size:14.5px;line-height:1.55;margin:10px 0 0}
.outcome{display:flex;gap:10px;align-items:flex-start;margin-top:14px;padding:12px 14px;border-radius:14px;background:#E1FCDE;color:#014A14;font-size:13px;line-height:1.5}
.outcome b{display:block;font-size:11px;letter-spacing:0.05em;text-transform:uppercase;margin-bottom:2px}
.fuh{font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#52525B;margin:18px 0 4px}
.public{display:flex;align-items:center;gap:6px;font-size:11.5px;color:#52525B;margin:8px 0 0 2px}
.edited{font-size:11px;color:#71717A}
/* labels on sheet boards */
.sheet{background:#FAFAFA;padding:48px;display:grid;gap:24px;align-items:start}
.cap{font-family:"Plus Jakarta Sans",sans-serif;font-weight:700;font-size:16px;letter-spacing:-0.015em;margin:0}
.capsub{font-size:12.5px;color:#52525B;margin:4px 0 12px;line-height:1.5}
.frame{border:1px solid #F0F0F2;border-radius:24px;background:#FFFFFF;padding:16px 0 0;position:relative}
"""

HEAD = '''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{title}</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700;800&amp;family=Lexend:wght@400;500;600&amp;display=swap">
<style>{css}</style>
</helmet>
'''
TAIL = '''
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{{"$preview":{{"width":{w},"height":{h}}}}}'>
class Component extends DCLogic {{
  renderVals() {{ return {{}}; }}
}}
</script>
</body>
</html>
'''

def rail(active):
    items = [("home", "My Day"), ("around", "Around the team"), ("users", "People"), ("msg", "Messages"), ("heart", "Prayer"), ("cal", "Gatherings"), ("book", "Bible study")]
    out = ['<nav class="rail" aria-label="Main">', '<div class="brand"><span class="logo">CW</span>Campus Work</div>']
    for k, label in items:
        out.append(f'<a class="ri{" on" if label == active else ""}" href="#">{ic(P[k])}{label}</a>')
    out.append('</nav>')
    return "\n".join(out)

def chrome(me_cls, me):
    return f'''<div class="chrome">
<div class="search">{ic(P["search"],16)}Search or jump to…<span class="kbd">⌘K</span></div>
<div class="chrome-r"><button class="icon-btn" aria-label="Notifications">{ic(P["bell"])}</button><span class="av s {me_cls}">{me}</span></div>
</div>'''

def shell(w, h, active, me_cls, me, inner):
    return f'''<div class="root" style="width: {w}px; height: {h}px;">
{rail(active)}
<div class="col">
{chrome(me_cls, me)}
{inner}
</div>
</div>'''

def msg(av, cls, who, when, body, extra="", tag="", hover=False, just=False, tools=False, small=False):
    klass = "m" + (" hover" if hover else "") + (" just" if just else "")
    tg = tag
    t = ""
    if tools:
        t = f'''<div class="tools"><button class="tool" aria-label="Reply in thread">{ic(P["reply"],16)}</button><button class="tool" aria-label="Make a to-do">{ic(P["todo"],16)}</button><button class="tool" aria-label="More actions">{ic(P["more"],16)}</button></div>'''
    a = "av s" if small else "av"
    return f'''<div class="{klass}"><span class="{a} {cls}">{av}</span><div class="mb">
<div class="mh"><span class="who">{who}</span>{tg}<span class="when">{when}</span></div>
<p class="tx">{body}</p>{extra}
</div>{t}</div>'''

def cont(body):
    return f'<div class="cont"><p class="tx">{body}</p></div>'

def day(label): return f'<div class="day">{label}</div>'

def thr(n, last, minis, on=False):
    ms = "".join(f'<span class="av xs {c}">{i}</span>' for i, c in minis)
    return f'<button class="thr{" on" if on else ""}"><span class="minis">{ms}</span><b>{n}</b><span class="last">{last}</span></button>'

ASK = '<span class="tag ask">Follow-up ask</span>'
Q = '<span class="tag q">Question</span>'
FT = '<span class="tag role">Full-timer</span>'

def status_open(asker=True):
    nm = '<button class="btn ghost">Never mind</button>' if asker else ""
    return f'<div class="status"><span class="s-open">Open 1 day</span><button class="btn pri">I followed up</button>{nm}</div>'

def composer(kinds=True, kind_on="comment", placeholder="Write something…", aud=None, tall=False, typed=None, pop=None, attach=False, staged=None, focus=False, hint="⌘↵ to post", label="Write a message", cid="c"):
    k = ""
    if kinds:
        def kb(key, text):
            on = kind_on == key
            cls = "kind" + (" on" if on else "") + (" ask" if on and key == "ask" else "")
            return f'<button class="{cls}" aria-pressed="{"true" if on else "false"}">{text}</button>'
        k = f'<div class="kinds" role="group" aria-label="What are you writing">{kb("comment","Comment")}{kb("question","Question")}{kb("ask","Ask a follow-up")}</div>'
    a = f'<div class="aud">{aud}</div>' if aud else ""
    st = f'<div class="staged">{staged}</div>' if staged else ""
    if typed:
        field = f'<div class="typed">{typed}<span class="caret"></span></div>'
    else:
        field = f'<label class="sr" for="{cid}">{label}</label><textarea id="{cid}" class="ta{" tall" if tall else ""}" placeholder="{placeholder}"></textarea>'
    clip = f'<button class="tool" aria-label="Attach">{ic(P["clip"],16)}</button>' if attach else ""
    return f'''<div class="composer">{pop or ""}{a}<div class="cbox{" focus" if focus else ""}">{k}{st}{field}
<div class="ctools">{clip}<button class="tool" aria-label="Mention someone">{ic(P["at"],16)}</button><span class="hint">{hint}</span><button class="send" aria-label="Send">{ic(P["send"],16)}</button></div></div></div>'''

def contact_page(drawer, story_extra=""):
    return f'''<main class="page">
<div class="cd-head"><span class="av p-d">DR</span><div><div class="cd-name">Daniel Reyes</div><div class="cd-sub">Last connected 2 days ago · Cared for by Maria</div></div></div>
<div class="band"><span class="step">Met</span><span class="step on">Came once</span><span class="step">Coming</span></div>
<div class="story">
<div class="entry"><span>Sep 22</span><span><b>Maria</b> met Daniel at the welcome table.</span></div>
<div class="entry"><span>Sep 17</span><span><b>Josh</b> sat with Daniel at the Thursday gathering.{story_extra}</span></div>
<div class="entry"><span>Sep 12</span><span><b>Maria</b> added Daniel.</span></div>
</div>
{drawer}
</main>'''

def write(name, title, w, h, body):
    with open(os.path.join(OUT, name), "w") as f:
        f.write(HEAD.format(title=title, css=CSS) + body + TAIL.format(w=w, h=h))
    print("wrote", name)

# ── Full-timers drawer ─────────────────────────────────────────────
ft_stream = "".join([
    '<div class="fade"></div>',
    day("Monday, September 21"),
    msg("RC", "p-r", "Ruth Chen", "8:50 PM", "Daniel mentioned his dad's surgery at the table. Worth being gentle with him for a few weeks."),
    msg("MS", "p-m", "Maria Santos", "9:03 PM", "Agreed. I'd rather Josh keep sitting with him than hand him to someone new right now.",
        extra=thr("1 reply", "Last reply yesterday", [("RC", "p-r")])),
    day("Today"),
    msg("RC", "p-r", "Ruth Chen", "10:31 AM", '<span class="at">@Maria Santos</span> should we invite him to the retreat, or is that too much this soon?'),
])
ft_drawer = f'''<section class="drawer" aria-label="Full-timers">
<div class="dh"><div style="flex-grow: 1;"><h3>{ic(P["lock"],15)}Full-timers</h3></div><button class="icon-btn" aria-label="Close Full-timers">{ic(P["x"])}</button></div>
<div class="stream">{ft_stream}</div>
{composer(kinds=False, placeholder="Write something only Full-timers will see…", aud=ic(P["lock"],12) + "Only Full-timers see this — Trainees can't.", label="Write to Full-timers", cid="ft")}
</section>'''
write("FT-Drawer.dc.html", "Contact · Full-timers", 1107, 662, shell(1107, 662, "People", "p-m", "MS", contact_page(ft_drawer)))

# ── Thread replacing the drawer ────────────────────────────────────
rep_stream = "".join([
    msg("JP", "p-j", "Josh Park", "Sep 22, 11:02 AM", "I did! Quiet, really thoughtful. I'll sit with him Thursday."),
    '<div class="rc">2 replies</div>',
    msg("MS", "p-m", "Maria Santos", "11:20 AM", "Perfect — he said he doesn't know anyone yet."),
    msg("GL", "p-g", "Grace Liu", "Yesterday", "I can drive him Thursday if the ride falls through."),
])
rep_drawer = f'''<section class="drawer" aria-label="Thread">
<div class="dh back"><button class="icon-btn" aria-label="Back to Conversation">{ic(P["back"])}</button><div style="flex-grow: 1; padding-top: 2px;"><h3>Thread</h3><p>in Conversation · Daniel Reyes</p></div><button class="icon-btn" aria-label="Close">{ic(P["x"])}</button></div>
<div class="stream top">{rep_stream}</div>
{composer(kinds=False, placeholder="Reply…", hint="⌘↵ to reply", label="Reply in thread", cid="rp")}
</section>'''
write("Drawer-Thread.dc.html", "Contact · Thread replaces the drawer", 1107, 662, shell(1107, 662, "People", "p-m", "MS", contact_page(rep_drawer)))

# ── Interaction thread ─────────────────────────────────────────────
int_stream = "".join([
    f'''<div class="quote"><div class="qh">{ic(P["feet"],13)}Josh's conversation · Thu, Sep 17</div><p class="tx">Sat with Daniel at the Thursday gathering. He's into film photography and asked whether the retreat costs anything.</p></div>''',
    '<div class="rc">2 replies</div>',
    msg("MS", "p-m", "Maria Santos", "Sep 17, 9:40 PM", "Film photography — Ruth's roommate does that. Could be a good second friend."),
    msg("JP", "p-j", "Josh Park", "Sep 18", "I'll mention the scholarship next time. He looked worried about the cost."),
])
int_drawer = f'''<section class="drawer" aria-label="Thread on an interaction">
<div class="dh"><div style="flex-grow: 1;"><h3>Thread</h3><p>On an interaction · everyone tied to Daniel sees this.</p></div><button class="icon-btn" aria-label="Close">{ic(P["x"])}</button></div>
<div class="stream top">{int_stream}</div>
{composer(kinds=False, placeholder="Think it through together…", hint="⌘↵ to reply", label="Reply on this interaction", cid="it")}
</section>'''
write("Interaction-Thread.dc.html", "Contact · Interaction thread", 1107, 662,
      shell(1107, 662, "People", "p-m", "MS", contact_page(int_drawer, story_extra="<br>" + thr("2 replies", "Last reply Sep 18", [("MS", "p-m"), ("JP", "p-j")], on=True))))

# ── Around the team ────────────────────────────────────────────────
def wc_closed(av, cls, name, sub, body, n):
    return f'''<article class="wc"><div class="wch"><span class="av {cls}">{av}</span><div><div class="wcn">{name}</div><div class="wcs">{sub}</div></div></div>
<p class="wcb clamp">{body}</p>
<div class="wca"><button class="btn">{ic(P["msg"],14)}Conversation · {n}</button><button class="btn">{ic(P["check"],14)}Reviewed</button></div></article>'''

strip_stream = "".join([
    day("Yesterday"),
    msg("MS", "p-m", "Maria Santos", "4:40 PM", "Can someone text Daniel before Thursday? He didn't have a ride last week.", tag=ASK, small=True,
        extra='<div class="status"><span class="s-open">Open 1 day</span><button class="btn pri">I followed up</button></div>'),
    day("Today"),
    msg("GL", "p-g", "Grace Liu", "9:12 AM", "Is Daniel's roommate the one who came to the cookout?", tag=Q, small=True),
    msg("RC", "p-r", "Ruth Chen", "Just now", "I'll text him tonight — I have his number from the table.", small=True, just=True,
        tag='<span class="tag just">Just posted</span>'),
])
open_card = f'''<article class="wc open"><div class="wch"><span class="av p-d">DR</span><div><div class="wcn">Daniel Reyes</div><div class="wcs">Josh logged a conversation · 2h ago</div></div></div>
<p class="wcb">Sat with Daniel at the Thursday gathering. He's into film photography and asked whether the retreat costs anything — worth mentioning the scholarship.</p>
<div class="wca"><button class="btn pri" aria-expanded="true">{ic(P["msg"],14)}Conversation · 5</button><button class="btn">{ic(P["check"],14)}Reviewed</button></div>
<div class="strip">
<div class="seg" role="tablist" aria-label="Which stream"><button class="segb on" role="tab" aria-selected="true">Conversation 5</button><button class="segb" role="tab" aria-selected="false">Full-timers 3</button></div>
<div style="display: flex; flex-direction: column; margin-top: 4px;">{strip_stream}</div>
{composer(kinds=True, aud="Everyone tied to Daniel sees this.", label="Write to everyone tied to Daniel", cid="ar")}
</div></article>'''
col2 = wc_closed("PN", "p-k", "Priya Nair", "Grace added a prayer · 3h ago", "Her grandmother is in hospital in Chennai; she's flying out Friday and asked us to pray for the trip.", 2) + '<div style="height: 16px;"></div>' + wc_closed("EK", "p-g", "Eli Kim", "Ruth logged a conversation · 5h ago", "Eli came to the prayer walk and stayed after. Talked about switching majors.", 0)
col3 = wc_closed("SO", "p-j", "Sam Ortiz", "Josh moved Sam to Coming · yesterday", "Third Thursday in a row. Brought his roommate this time.", 4)
around = f'''<div class="pg">
<div class="pgh"><div><h1>Around the team</h1><p>What the team has been doing on people you aren't carrying.</p></div>
<div style="margin-left: auto; display: flex; gap: 6px;"><button class="pill on">To work through · 6</button><button class="pill">Everyone</button><button class="pill">Campus</button></div></div>
<div class="day" style="margin: 0;">Today</div>
<div class="grid3"><div>{open_card}</div><div>{col2}</div><div>{col3}</div></div>
</div>'''
write("Around.dc.html", "Around the team · card open", 1440, 1000, shell(1440, 1000, "Around the team", "p-m", "MS", around))

# Around — Thread replacing the strip (card only)
at_stream = "".join([
    msg("MS", "p-m", "Maria Santos", "Yesterday, 4:40 PM", "Can someone text Daniel before Thursday? He didn't have a ride last week.", tag=ASK, small=True,
        extra='<div class="status"><span class="s-open">Open 1 day</span><button class="btn pri">I followed up</button></div>'),
    '<div class="rc">1 reply</div>',
    msg("JP", "p-j", "Josh Park", "8:02 PM", "I texted — he's getting a ride with his roommate.", small=True),
])
around_thread = f'''<div class="root" style="width: 420px; height: 760px; background: #FAFAFA; padding: 24px; display: block;">
<article class="wc open"><div class="wch"><span class="av p-d">DR</span><div><div class="wcn">Daniel Reyes</div><div class="wcs">Josh logged a conversation · 2h ago</div></div></div>
<p class="wcb">Sat with Daniel at the Thursday gathering. He's into film photography and asked whether the retreat costs anything — worth mentioning the scholarship.</p>
<div class="wca"><button class="btn pri" aria-expanded="true">{ic(P["msg"],14)}Conversation · 5</button><button class="btn">{ic(P["check"],14)}Reviewed</button></div>
<div class="strip">
<div class="sheadback"><button class="icon-btn" aria-label="Back to Conversation">{ic(P["back"],16)}</button><span style="font-weight: 600; font-size: 13.5px;">Thread</span><span class="wcs">in Conversation</span></div>
<div style="display: flex; flex-direction: column;">{at_stream}</div>
{composer(kinds=False, placeholder="Reply…", hint="⌘↵ to reply", label="Reply in thread", cid="at")}
</div></article></div>'''
write("Around-Thread.dc.html", "Around · Thread replaces the strip", 420, 760, around_thread)

# ── Group chat ─────────────────────────────────────────────────────
def side(active_row):
    rows = [
        ("sech", "Announcements"),
        ("chan", "Everyone on Campus", "Grace: Welcome table moves to the library steps…", "9:40 AM", True),
        ("chan", "Trainees · Fall", "Maria: Training notes for Saturday are up", "Mon", False),
        ("sech", "Conversations"),
        ("dm", "GL", "p-g", "Grace Liu", "Can you cover the table Thursday?", "9:02 AM", False),
        ("grp", "Thursday table crew", "Josh: I'll bring the sign-in sheet", "10:14 AM", False),
        ("dm", "MS", "p-m", "Maria Santos", "Thanks for sitting with Daniel.", "Sun", False),
        ("dm", "RC", "p-r", "Ruth Chen", "See you Sunday", "Sat", False),
    ]
    out = [f'<aside class="side" aria-label="Conversations"><div class="sh"><h2>Messages</h2><button class="icon-btn" aria-label="New message">{ic(P["pencil"])}</button></div>',
           f'<div class="sfind">{ic(P["search"],15)}Find a conversation</div><div class="pills"><button class="pill on">All</button><button class="pill">Unread</button></div>']
    for r in rows:
        if r[0] == "sech":
            out.append(f'<div class="sech">{r[1]}</div>'); continue
        if r[0] == "chan":
            _, name, snip, t, un = r; lead = f'<span class="chip">{ic(P["mega"])}</span>'
        elif r[0] == "grp":
            _, name, snip, t, un = r; lead = '<span class="stack"><span class="av p-r" style="left: 0; top: 0;">RC</span><span class="av p-j" style="left: 12px; top: 12px;">JP</span></span>'
        else:
            _, i, c, name, snip, t, un = r; lead = f'<span class="av {c}">{i}</span>'
        on = " on" if name == active_row else ""
        dot = '<span class="unread"></span>' if un else ""
        out.append(f'<div class="row{on}">{lead}<div class="rm"><div class="rn">{name}</div><div class="rs">{snip}</div></div><div class="rt">{t}{dot}</div></div>')
    out.append('</aside>')
    return "\n".join(out)

pop = f'''<div class="pop" role="listbox" aria-label="Mention"><div class="ph2">People in this conversation</div>
<button class="opt on" role="option" aria-selected="true"><span class="av s p-g">GL</span>Grace Liu<span class="os">Full-timer</span></button>
<button class="opt" role="option" aria-selected="false"><span class="av s p-j">JP</span>Josh Park<span class="os">Trainee</span></button></div>'''
grp_stream = "".join([
    day("Yesterday"),
    msg("RC", "p-r", "Ruth Chen", "7:48 PM", "Table plan for Thursday — library steps, 11 to 1. Who's got the first hour?"),
    msg("MS", "p-m", "Maria Santos", "7:55 PM", "I'll take 11–12. Bringing Daniel's info card so whoever's on second hour knows him if he stops by.",
        extra=f'<div class="cpill"><span class="av s p-d">DR</span>Daniel Reyes<span class="cps">Came once</span></div>'),
    cont("Also — sign-in sheets are in the blue folder."),
    day("Today"),
    msg("JP", "p-j", "Josh Park", "10:14 AM", "I'll bring the sign-in sheet and cover 12–1.", hover=True, tools=True,
        extra=thr("2 replies", "Last reply 10:40 AM", [("RC", "p-r"), ("GL", "p-g")])),
])
grp = f'''<div class="msgs">{side("Thursday table crew")}
<section class="chan" aria-label="Thursday table crew">
<div class="chh"><span class="stack"><span class="av p-r" style="left: 0; top: 0;">RC</span><span class="av p-j" style="left: 12px; top: 12px;">JP</span></span><div style="flex-grow: 1; min-width: 0;"><div class="chn">Thursday table crew</div><div class="chs">Group · 4 people</div></div><button class="icon-btn" aria-label="Conversation details">{ic(P["info"])}</button></div>
<div class="cstream bottom">{grp_stream}</div>
{composer(kinds=False, typed='Can someone cover if I run late? <span class="at">@Gr</span>', pop=pop, attach=True, focus=True, hint="⌘↵ to send")}
</section></div>'''
write("Chat.dc.html", "Group chat", 1440, 900, shell(1440, 900, "Messages", "p-m", "MS", grp))

# ── Announcement channel, Full-timer's view ────────────────────────
T1 = "Fall retreat sign-ups close Friday. Please get the people you're walking with signed up — scholarships are available, just ask me."
FILE = f'<div class="file"><span class="fi">{ic(P["file"],16)}</span><div><div class="fn">Fall retreat sign-up.pdf</div><div class="fm">PDF · 212 KB</div></div></div>'
an_stream = "".join([
    f'<div class="pinstrip">{ic(P["pin"],14)}Pinned by you · stays at the top until you unpin it</div>',
    msg("MS", "p-m", "Maria Santos", "Sep 24", T1, tag=FT, extra=FILE + f'<div class="acts"><button class="receipt">Read by 21 of 24 · 17 said got it</button>{thr("3 replies", "Last reply 3:05 PM", [("JP","p-j"),("MS","p-m"),("GL","p-g")])}</div>'),
    day("Yesterday"),
    msg("RC", "p-r", "Ruth Chen", "5:15 PM", "Prayer walk is at 7 tonight — meet at the clock tower. Bring a jacket, it gets cold by the river.", tag=FT,
        extra='<div class="acts"><button class="receipt">Read by 18 of 24 · 11 said got it</button></div>'),
    day("Today"),
    msg("GL", "p-g", "Grace Liu", "9:40 AM", "Welcome table moves to the library steps Thursday — construction on the quad. Same time, 11 to 1.", tag=FT,
        extra='<div class="acts"><button class="btn">Got it</button><button class="receipt">Read by 9 of 24</button></div>'),
])
an = f'''<div class="msgs">{side("Everyone on Campus")}
<section class="chan" aria-label="Everyone on Campus">
<div class="chh"><span class="chip">{ic(P["mega"])}</span><div style="flex-grow: 1; min-width: 0;"><div class="chn">Everyone on Campus</div><div class="chs">Announcement · 24 people · you and 2 others post here</div></div><button class="icon-btn" aria-label="Channel details">{ic(P["info"])}</button></div>
<div class="cstream">{an_stream}</div>
{composer(kinds=False, placeholder="Post to Everyone on Campus…", aud=ic(P["mega"],13) + "Posting to Everyone on Campus · 24 people · each gets a notification", attach=True, hint="⌘↵ to post", label="Post an announcement", cid="an")}
</section></div>'''
write("Announce-FT.dc.html", "Announcement channel · Full-timer", 1440, 900, shell(1440, 900, "Messages", "p-m", "MS", an))

# ── Composer states ────────────────────────────────────────────────
def frame(cap, sub, inner, h):
    return f'<div><h2 class="cap">{cap}</h2><p class="capsub">{sub}</p><div class="frame" style="height: {h}px; display: flex; flex-direction: column; justify-content: flex-end;">{inner}</div></div>'
mpop = f'''<div class="pop" role="listbox" aria-label="Mention"><div class="ph2">Teammates</div>
<button class="opt on" role="option" aria-selected="true"><span class="av s p-j">JP</span>Josh Park<span class="os">Trainee</span></button>
<button class="opt" role="option" aria-selected="false"><span class="av s p-g">GL</span>Grace Liu<span class="os">Full-timer</span></button></div>'''
ftpop = f'''<div class="pop" role="listbox" aria-label="Mention"><div class="ph2">Full-timers only</div>
<button class="opt on" role="option" aria-selected="true"><span class="av s p-r">RC</span>Ruth Chen<span class="os">Full-timer</span></button></div>'''
stg = f'<span class="stg"><span class="fi" style="width: 26px; height: 26px;">{ic(P["file"],13)}</span>Retreat packing list.pdf<button class="tool" aria-label="Remove attachment">{ic(P["x"],14)}</button></span><span class="stg"><span class="av s p-d" style="width: 26px; height: 26px; font-size: 9px;">DR</span>Daniel Reyes<button class="tool" aria-label="Remove contact">{ic(P["x"],14)}</button></span>'
sheet = f'''<div class="root sheet" style="width: 1320px; height: 900px; grid-template-columns: repeat(3, minmax(0, 1fr)); display: grid;">
{frame("Conversation · Comment", "The default. Kind chips sit inside the box, so choosing one is part of writing.", composer(kinds=True, aud="Everyone tied to Daniel sees this.", label="Comment", cid="k1"), 250)}
{frame("Conversation · Ask a follow-up", "The chip takes the ask's colour; the placeholder says what a good ask carries.", composer(kinds=True, kind_on="ask", placeholder="What wants doing — text them, email them? Say enough that anyone could pick it up.", tall=True, aud="Everyone tied to Daniel sees this and can say they followed up.", focus=True, label="Ask a follow-up", cid="k2"), 250)}
{frame("Conversation · Question", "Same box; the question reaches everyone tied, not one person.", composer(kinds=True, kind_on="question", placeholder="What do you want to know? Everyone tied to this person will see it.", tall=True, aud="Everyone tied to Daniel sees this.", label="Question", cid="k3"), 250)}
{frame("@mention in a Conversation", "Any teammate, as today (ADR 0007).", composer(kinds=True, typed='<span class="at">@Jo</span>', pop=mpop, focus=True, aud="Everyone tied to Daniel sees this."), 340)}
{frame("@mention in Full-timers", "No kinds; mentions are Full-timers only.", composer(kinds=False, typed='<span class="at">@Ru</span>', pop=ftpop, focus=True, aud=ic(P["lock"],12) + "Only Full-timers see this."), 340)}
{frame("Chat · staged attachments", "A file and a contact card, staged above the text; each can be removed before sending.", composer(kinds=False, staged=stg, placeholder="Message Thursday table crew", attach=True, hint="⌘↵ to send", label="Message", cid="k6"), 340)}
</div>'''
write("Composer.dc.html", "Composer states", 1320, 900, sheet)

# ── Feedback Follow-ups (Your notes) ───────────────────────────────
fu_stream = "".join([
    msg("JP", "p-j", "Josh Park", "Sep 18", "Is there a way to see who else is tied to a contact before I post? I wasn't sure Grace would see mine."),
    msg("T", "p-t", "The team", "Sep 19", "Good question — the Conversation header now says who sees it. Can you tell us if that's enough?"),
    msg("JP", "p-j", "Josh Park", "Sep 20", "That helps. Could it also list names, not just “everyone tied”?",
        extra=f'<div class="status" style="margin-top: 4px;"><span class="edited">Edited</span><button class="btn ghost" style="height: 28px; padding: 0 8px;">{ic(P["pencil"],13)}Edit</button></div>'),
])
notes = f'''<div class="pg" style="max-width: 820px;">
<div class="pgh"><div><h1>Your notes</h1><p>Every note you've left, and what came of it. Leave a new one from the note button.</p></div></div>
<div class="nlist">
<article class="note">
<div class="nh"><span class="tag muted">A request</span><span class="when">Sep 16</span><span class="tag" style="background: #E1FCDE; color: #016A1C; margin-left: auto;">Done</span></div>
<p class="nb">When I write in someone's Conversation I don't know who is going to read it. Can it say?</p>
<div class="outcome">{ic(P["check"],16)}<div><b>What came of it</b>We made it: the Conversation now names its audience above the box.</div></div>
<div class="fuh">Follow-ups</div>
<div style="display: flex; flex-direction: column;">{fu_stream}</div>
<div class="composer" style="padding: 10px 0 0;">
<div class="cbox"><label class="sr" for="fu">Ask a follow-up</label><textarea id="fu" class="ta" placeholder="Ask a follow-up…"></textarea>
<div class="ctools"><span class="hint">⌘↵ to send</span><button class="send" aria-label="Send">{ic(P["send"],16)}</button></div></div>
<div class="public">{ic(P["globe"],12)}Replies are posted to our public issue tracker, where anyone can read them.</div>
</div>
</article>
<article class="note shut"><div class="nh"><span class="tag muted">Something's off</span><span class="when">Sep 2</span><span class="tag muted" style="margin-left: auto;">Waiting on the team</span></div><p class="nb" style="color: #52525B;">The prayer list jumps to the top when I mark one answered.</p></article>
</div></div>'''
write("Followups.dc.html", "Your notes · Follow-ups", 1440, 1000, shell(1440, 1000, "My Day", "p-j", "JP", notes))
