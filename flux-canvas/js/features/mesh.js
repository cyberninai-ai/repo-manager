'use strict';
// @module features/mesh — Mesh relay: every browser passes on what it hears. A record that is new here goes on to every other
// connection (other tabs, the relay, each direct peer) except the one it came from; presence and room signals go on with a hop
// count. So Ana–Ben–Chen connected in a line, or a star of direct connections, all see each other live, with no server.
// Forwarding can't forge anything: records are verified by everyone who receives them, and a known record is never sent again,
// so a message stops as soon as everyone has it.
// @uses core records (post, WIRE_INGEST_HOOKS), features/presence (peers), ui/panels
const MESH = { on: true, records: 0, signals: 0, seen: new Map() };
try { MESH.on = localStorage.getItem('flux:mesh') !== 'off'; } catch {}
WIRE_INGEST_HOOKS.push((msg, from, chan) => {
  if (!MESH.on || !from) return;
  if (msg.records){ post({ records: msg.records }, { from, chan }); MESH.records += msg.records.length; }
  else { post({ raw: msg.raw, blobs: msg.blobs || {} }, { from, chan }); MESH.records++; }
});
// ephemeral signals: forwarded once each, at most three hops. What a peer hears directly is always delivered; copies that
// came through others are delivered once. The memory of what was seen is bounded and pruned on a timer, not per message.
const MESH_KEYS = ['presence', 'spotlight', 'ask', 'roundStart'];
const MESH_CAP = 5000;
function remember(key){ if (MESH.seen.has(key)) return false; if (MESH.seen.size >= MESH_CAP) MESH.seen.delete(MESH.seen.keys().next().value); MESH.seen.set(key, Date.now()); return true; }
setInterval(() => { const now = Date.now(); for (const [k, t] of MESH.seen) if (now - t > 10000) MESH.seen.delete(k); }, 5000);
for (const k of MESH_KEYS){
  const base = WIRE_HOOKS[k]; if (!base) continue;
  WIRE_HOOKS[k] = (p, from, chan) => {
    if (!p || typeof p !== 'object') return;
    const hop = Math.max(0, Math.min(3, p.hop | 0)), { hop: _h, through: _t, ...body } = p;
    const fresh = remember(k + JSON.stringify(body));
    // hearing someone directly beats hearing them through someone else
    const direct = k === 'presence' && hop > 0 && peers.get(p.id)?.via !== 'mesh' && Date.now() - (peers.get(p.id)?.t || 0) < 5000;
    if (hop === 0 || fresh && !direct) base(hop === p.hop ? p : { ...p, hop }, from, chan);
    if (MESH.on && fresh && from && hop < 3 && p.id !== S.me?.id){ post({ [k]: { ...p, hop: hop + 1, through: hop ? p.through : S.me?.id } }, { from, chan }); MESH.signals++; }
  };
}
registerPanel({
  id: 'mesh', title: 'Mesh', blurb: 'Every browser passes on what it hears, so people connected through each other all stay in sync without a server.', sync: true,
  paint(body){
    const rows = [...peers];
    body.innerHTML = `<label class="muted"><input type="checkbox" data-k="on"${MESH.on ? ' checked' : ''} data-autofocus> Pass on records and presence for others</label>
      <p>${MESH.records ? `Passed on ${plural(MESH.records, 'record')} and ${plural(MESH.signals, 'live signal')} this session.` : 'Nothing passed on yet.'}</p>
      <h3>Routes <span class="n">${rows.length}</span></h3>
      ${rows.length ? `<ul class="plain">${rows.map(([id, p]) => `<li class="row2">${avatar(id)}<span class="grow">${esc(whoName(id))}</span><span class="pill ${p.via === 'mesh' ? 'acc' : 'good'}">${p.via === 'mesh' ? `through ${esc(whoName(p.through))}` : { tab: 'this browser', net: 'relay', direct: 'direct' }[p.via] || p.via}</span>${p.root && S.root && p.root !== S.root ? '<span class="pill warn">syncing</span>' : '<span class="pill good">same state</span>'}</li>`).join('')}</ul>` : '<p class="empty">Nobody connected.</p>'}`;
  },
  change(e){ if (e.target.dataset.k === 'on'){ MESH.on = e.target.checked; try { localStorage.setItem('flux:mesh', MESH.on ? 'on' : 'off'); } catch {} } },
});
registerFeature({ id: 'mesh', name: 'Mesh relay', group: 'network', icon: 'mesh', records: [],
  blurb: 'Peers pass records and presence on for each other: groups stay in sync without a server',
  status: () => { const n = [...peers.values()].filter(p => p.via === 'mesh').length; return n ? `${n} through others` : ''; }, open: () => openPanel('mesh') });
