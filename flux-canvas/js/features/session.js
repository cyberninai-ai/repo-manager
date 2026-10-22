'use strict';
// @module features/session — The live session: who is here and what they are doing, whether everyone sees the same canvas,
// your name and key, and the three ways to work together (other tabs, a relay, or a direct peer-to-peer code)
// @uses presence, profiles, net, rtc, ui/toolbar (menus), dialogs
const SES = { open: false, code: '', mode: '' };   // mode: '' | 'inviting' | 'joining'
const viaName = { tab: 'this browser', net: 'relay', direct: 'direct' };
function syncState(){
  const live = [...peers.values()], linked = NET.state === 'live' || RTC.chans.size > 0;
  const mismatched = live.filter(p => p.root && S.root && p.root !== S.root);
  if (!live.length) return { kind: linked ? 'waiting' : 'solo', text: linked ? 'Live · waiting for people' : 'Just you', detail: linked ? 'Connected. Share an invite and others appear here.' : 'Only on this device. Invite people to work together live.' };
  if (mismatched.length) return { kind: 'syncing', text: `Syncing · ${live.length + 1}`, detail: `Catching up with ${mismatched.map(p => short([...peers].find(([, q]) => q === p)[0])).join(', ')}…` };
  return { kind: 'live', text: `Live · ${live.length + 1}`, detail: `In sync with ${live.length === 1 ? short([...peers.keys()][0]) : `${live.length} people`} · everyone sees state ${S.root.slice(0, 6).toUpperCase()}` };
}
function paintLive(){
  const b = $('liveBtn'); if (!b) return;
  const st = syncState();
  b.dataset.state = st.kind; b.querySelector('span').textContent = st.text;
  b.setAttribute('aria-label', `${st.text}. ${st.detail} Open the live session`);
}
let mismatchSince = 0, lastResync = 0;
// self-healing sync: if a peer's state root differs for a few seconds, ask everyone for what's missing
setInterval(() => {
  const off = [...peers.values()].some(p => p.root && S.root && p.root !== S.root);
  if (!off){ mismatchSince = 0; return; }
  if (!mismatchSince) mismatchSince = Date.now();
  if (Date.now() - mismatchSince > 2500 && Date.now() - lastResync > 6000){ lastResync = Date.now(); sendHello(false); }
}, 1000);

// the team tools of one hub group as tiles, each with its live status
const featureTiles = g => FEATURES.filter(f => f.group === g && f.open).map(f => { let st = ''; try { st = f.status?.() || ''; } catch {}
  return `<button class="se-tile${st ? ' on' : ''}" data-feature="${f.id}">${ic(f.icon)}<span>${esc(f.name)}${st ? `<small><i class="mdot"> · </i>${esc(st)}</small>` : ''}</span></button>`; }).join('');
function paintSession(){
  paintLive();
  if (!SES.open) return;
  const st = syncState(), me = S.me?.id;
  const keep = document.activeElement?.id;
  const people = [...peers].sort((a, b) => short(a[0]).localeCompare(short(b[0])));
  const av = id => `<span class="av" style="background:hsl(${authorHue(id)} 55% 30%)" aria-hidden="true">${esc(initials(id))}</span>`;
  $('sessionBody').innerHTML = `
    <div class="se-sync" data-state="${st.kind}"><i aria-hidden="true"></i><div><b>${esc(st.text)}</b><span>${esc(st.detail)}</span></div></div>
    <h3>You</h3>
    <div class="se-me">${me ? av(me) : ''}<div class="se-who"><label class="sr" for="seName">Your name</label>
      <input id="seName" value="${esc(myName())}" placeholder="Add your name" maxlength="40" autocomplete="name">
      <small title="">${esc(fingerprint(me))} · your key is your identity, kept on this device</small></div></div>
    <h3>Here now <span class="n">${people.length}</span></h3>
    ${people.length ? `<ul class="se-people">${people.map(([id, p]) => `<li>${av(id)}<div class="se-who"><b>${esc(short(id))}</b><small>${esc(activityOf(p))} · ${viaName[p.via] || p.via}${p.root && p.root !== S.root ? ' · syncing' : ''}</small></div>
      <button class="btn sm" data-follow="${esc(id)}" aria-pressed="${S.follow === id}">${S.follow === id ? 'Following' : 'Follow'}</button></li>`).join('')}</ul>
      <button class="btn" id="seSpot">${ic('present')}Bring everyone to my view</button>` : '<p class="se-empty">Nobody else yet. Invite someone below; they appear here the moment they join.</p>'}
    <h3>Run this session</h3>
    <div class="se-acts se-team">${featureTiles('meet')}</div>
    <h3>Invite people</h3>
    ${/^https?:/.test(location.href) ? `<button class="btn" id="seLink">${ic('link')}Copy invite link</button>` : ''}
    <div class="se-p2p">
      <div class="se-row"><b>Peer to peer</b><small>No server: swap two codes, then you are connected browser to browser.</small></div>
      ${SES.mode === 'inviting' ? `<label for="seCode">1. Send them this invite code</label><textarea id="seCode" readonly rows="3">${esc(SES.code)}</textarea>
        <div class="se-acts"><button class="btn" id="seCopy">${ic('copy')}Copy code</button></div>
        <label for="seAnswer">2. Paste the code they send back</label><textarea id="seAnswer" rows="2" placeholder="flux…"></textarea>
        <div class="se-acts"><button class="btn primary" id="seAccept">Connect</button><button class="btn" id="seCancel">Cancel</button></div>`
      : SES.mode === 'joining' ? `<label for="seJoinCode">Paste the invite code you received</label><textarea id="seJoinCode" rows="3" placeholder="flux…"></textarea>
        ${SES.code ? `<label for="seBack">Send this code back to them</label><textarea id="seBack" readonly rows="3">${esc(SES.code)}</textarea><div class="se-acts"><button class="btn" id="seCopyBack">${ic('copy')}Copy code</button><button class="btn" id="seCancel">Done</button></div>`
          : '<div class="se-acts"><button class="btn primary" id="seJoin">Join</button><button class="btn" id="seCancel">Cancel</button></div>'}`
      : `<div class="se-acts"><button class="btn" id="seInvite">${ic('plus')}Create invite code</button><button class="btn" id="seHave">I have a code</button></div>`}
      ${RTC.chans.size ? `<small class="ok">● ${RTC.chans.size} direct connection${RTC.chans.size > 1 ? 's' : ''} open</small>` : ''}
    </div>
    <div class="se-relay"><div class="se-row"><b>Relay</b><small>${NET.state === 'live' ? `Connected to ${esc(NET.url.replace(/^wss?:\/\//, ''))}` : NET.state === 'connecting' ? 'Reconnecting…' : 'A relay keeps the canvas available when people aren’t online at the same time.'}</small></div>
      <div class="se-acts">${NET.state === 'off' ? '<button class="btn" id="seRelay">Connect to a relay…</button>' : '<button class="btn" id="seRelayOff">Disconnect</button>'}</div></div>
    <h3>Network and identity</h3>
    <div class="se-acts se-team">${featureTiles('network')}</div>`;
  if (keep && $(keep) && keep !== 'seName') $(keep).focus();
}
function toggleSession(force){
  SES.open = force ?? !SES.open;
  $('session').hidden = !SES.open; $('liveBtn').setAttribute('aria-expanded', String(SES.open));
  if (SES.open){ paintSession(); setTimeout(() => ($('seName') || $('sessionClose')).focus(), 0); } else { SES.mode = ''; SES.code = ''; $('liveBtn').focus(); }
}
$('liveBtn').onclick = () => toggleSession();
$('sessionClose').onclick = () => toggleSession(false);
$('session').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') toggleSession(false); if (e.key === 'Enter' && e.target.id === 'seName'){ e.preventDefault(); e.target.blur(); } });
$('session').addEventListener('change', e => { if (e.target.id === 'seName') setMyName(e.target.value).then(() => { say('Name saved.'); paintSession(); }); });
$('session').addEventListener('pointerdown', e => e.stopPropagation());
$('session').addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return;
  try {
    if (b.dataset.follow){ S.follow === b.dataset.follow ? stopFollow() : startFollow(b.dataset.follow); return; }
    if (b.dataset.feature){ const f = FEATURES.find(f => f.id === b.dataset.feature); toggleSession(false); f?.open(); return; }
    switch (b.id){
      case 'seSpot': spotlight(); break;
      case 'seLink': copy(location.href.split('#')[0] + '#' + canvasId, 'Invite link copied. Anyone who opens it on this server joins live.'); break;
      case 'seInvite': SES.mode = 'inviting'; SES.code = 'Creating…'; paintSession(); SES.code = await rtcInvite(); paintSession(); break;
      case 'seHave': SES.mode = 'joining'; SES.code = ''; paintSession(); $('seJoinCode')?.focus(); break;
      case 'seCopy': copy(SES.code, 'Invite code copied. Send it to them however you like.'); break;
      case 'seCopyBack': copy(SES.code, 'Answer code copied. Send it back to them.'); break;
      case 'seAccept': await rtcAccept($('seAnswer').value); SES.mode = ''; SES.code = ''; toast('Connecting…'); paintSession(); break;
      case 'seJoin': SES.code = await rtcJoin($('seJoinCode').value); paintSession(); break;
      case 'seCancel': SES.mode = ''; SES.code = ''; paintSession(); break;
      case 'seRelay': toggleSession(false); askRelay(); break;
      case 'seRelayOff': netClose(true); paintSession(); break;
    }
  } catch (err){ toast(/code/.test(err.message) ? 'That doesn’t look like a Flux code. Paste the whole code.' : 'Couldn’t connect: ' + err.message); }
});
SYNC_HOOKS.push(paintSession);
CHANGE_HOOKS.push(paintLive);
PALETTE_HOOKS.push(add => { add('share', 'Live session and invites', () => toggleSession(true)); add('share', 'Bring everyone to my view', spotlight); });
