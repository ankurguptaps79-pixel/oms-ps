// ─────────────────────────────────────────────────────────────
//  FIREBASE CONFIG
//  1. Go to https://console.firebase.google.com
//  2. Create a project → Add a Web App → copy the config below
//  3. Go to Firestore Database → Create database → Start in test mode
//  Replace the placeholder values below with your own config
// ─────────────────────────────────────────────────────────────

const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyDOjByXk815K4hRRSSNg8km6ufNKX6zokc",
  authDomain:        "pradeep-sales-oms.firebaseapp.com",
  projectId:         "pradeep-sales-oms",
  storageBucket:     "pradeep-sales-oms.firebasestorage.app",
  messagingSenderId: "1082894158097",
  appId:             "1:1082894158097:web:450f01a58580b18fbee4b0"
};

// ─────────────────────────────────────────────────────────────
//  CONSTANTS
// ─────────────────────────────────────────────────────────────

const STATUSES = [
  { key: 'received',   label: 'Received',   dot: '#1e5fa8', pill: 's-received'   },
  { key: 'processing', label: 'Processing', dot: '#b5650a', pill: 's-processing' },
  { key: 'billing',    label: 'Billing',    dot: '#5b3f9e', pill: 's-billing'    },
  { key: 'dispatched', label: 'Dispatched', dot: '#1a7a4a', pill: 's-dispatched' },
];

const SLA = { normal: 120, urgent: 30, critical: 15 };

// ─────────────────────────────────────────────────────────────
//  FIREBASE INIT
// ─────────────────────────────────────────────────────────────

// Firebase loaded via CDN in index.html — available as globals
const firebaseApp = firebase.initializeApp(FIREBASE_CONFIG);
const db          = firebase.firestore();
const ORDERS_COL  = db.collection("orders");

// ─────────────────────────────────────────────────────────────
//  SIMPLE PASSKEY LOGIN
// ─────────────────────────────────────────────────────────────

   const PASSKEY = "0079";

// ─────────────────────────────────────────────────────────────
//  LOCAL STATE  (kept in sync from Firestore listener)
// ─────────────────────────────────────────────────────────────

let orders = [];   // always a mirror of Firestore, newest first

// ─────────────────────────────────────────────────────────────
//  ORDER ID GENERATOR
// ─────────────────────────────────────────────────────────────

function genId() {
  const d  = new Date();
  const ds = `${String(d.getFullYear()).slice(2)}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  const rand = String(Math.floor(Math.random() * 900) + 100); // 3-digit random suffix avoids collisions
  return `ORD-${ds}-${rand}`;
}

// ─────────────────────────────────────────────────────────────
//  REAL-TIME LISTENER  — keeps orders[] synced from Firestore
// ─────────────────────────────────────────────────────────────

function startListener() {
  const q = ORDERS_COL.orderBy("receivedAt", "desc");

  q.onSnapshot((snapshot) => {
    orders = snapshot.docs.map(d => {
      const data = d.data();
      return {
        ...data,
        _docId:     d.id,
        receivedAt: data.receivedAt?.toMillis ? data.receivedAt.toMillis() : data.receivedAt,
        timeline:   (data.timeline || []).map(t => ({
          ...t,
          ts: t.ts?.toMillis ? t.ts.toMillis() : t.ts,
        })),
      };
    });

    renderDash();
    renderBoard();
    renderOrders();

    // Update sidebar open count
    const open = orders.filter(o => o.status !== 'dispatched').length;
    document.getElementById('nc-open').textContent = open;
    document.getElementById('nc-open').classList.toggle('show', open > 0);
  }, (err) => {
    console.error("Firestore listener error:", err);
    showDbError(err.message);
  });
}

function showDbError(msg) {
  const bar = document.getElementById('dbErrorBar');
  if (bar) { bar.style.display = 'flex'; bar.querySelector('span').textContent = msg; }
}

// ─────────────────────────────────────────────────────────────
//  SLA HELPERS
// ─────────────────────────────────────────────────────────────

function slaInfo(o) {
  if (o.status === 'dispatched') return { st: 'done', pct: 100, rem: 0, el: 0 };
  const limitMs = SLA[o.priority] * 60000;
  const el  = Date.now() - o.receivedAt;
  const pct = Math.min(100, Math.round(el / limitMs * 100));
  const rem = Math.max(0, limitMs - el);
  let st = 'ok';
  if (pct >= 100) st = 'breach';
  else if (pct >= 75) st = 'warn';
  return { st, pct, rem, el };
}

function fmtMs(ms) {
  if (ms < 60000) return `${Math.round(ms/1000)}s`;
  if (ms < 3600000) return `${Math.round(ms/60000)}m`;
  const h = Math.floor(ms/3600000), m = Math.round((ms%3600000)/60000);
  return m ? `${h}h ${m}m` : `${h}h`;
}

function fmtDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString('en-IN',{day:'2-digit',month:'short'}) + ' ' +
         d.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true});
}

// ─────────────────────────────────────────────────────────────
//  BADGES / PILLS
// ─────────────────────────────────────────────────────────────

function statusPill(key) {
  const s = STATUSES.find(x => x.key === key);
  return `<span class="status-pill ${s.pill}">${s.label}</span>`;
}

function srcBadge(s) {
  const m = { whatsapp:['src-whatsapp','WhatsApp'], phone:['src-phone','Phone'], salesman:['src-salesman','Salesman'], portal:['src-portal','Portal'] };
  const [cls,lbl] = m[s]||['','—'];
  return `<span class="src ${cls}">${lbl}</span>`;
}

function prioBadge(p) {
  const m = { normal:'badge-normal', urgent:'badge-urgent', critical:'badge-critical' };
  return `<span class="badge ${m[p]||''}">${p}</span>`;
}

function slaChip(o) {
  const s = slaInfo(o);
  if (s.st === 'done')   return `<span class="sla-chip sla-done">Done</span>`;
  if (s.st === 'breach') return `<span class="sla-chip sla-breach">Over SLA</span>`;
  if (s.st === 'warn')   return `<span class="sla-chip sla-warn">${fmtMs(s.rem)}</span>`;
  return `<span class="sla-chip sla-ok">${fmtMs(s.rem)}</span>`;
}

// ─────────────────────────────────────────────────────────────
//  RENDER — DASHBOARD
// ─────────────────────────────────────────────────────────────

function renderDash() {
  const today = new Date(); today.setHours(0,0,0,0);
  const open   = orders.filter(o => o.status !== 'dispatched');
  const done   = orders.filter(o => o.status === 'dispatched' && o.receivedAt >= today.getTime());
  const alerts = open.filter(o => slaInfo(o).st !== 'ok');

  document.getElementById('k-total').textContent = orders.length;
  document.getElementById('k-open').textContent  = open.length;
  document.getElementById('k-done').textContent  = done.length;
  document.getElementById('k-sla').textContent   = alerts.length;

  const tbl = document.getElementById('dashTable');
  if (!orders.length) {
    tbl.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">No orders yet</div><div class="empty-sub">Click <strong>+ New Order</strong> to get started</div></div>`;
    return;
  }

  const rows = orders.slice(0,10).map(o => `
    <tr onclick="openDetail('${o.id}')">
      <td style="color:var(--blue);font-weight:600;font-size:12px">${o.id}</td>
      <td><strong>${o.retailer}</strong></td>
      <td>${o.salesman}</td>
      <td>${srcBadge(o.source)}</td>
      <td>${statusPill(o.status)}</td>
      <td>${prioBadge(o.priority)}</td>
      <td>${slaChip(o)}</td>
      <td style="color:var(--text3);font-size:12px">${fmtDate(o.receivedAt)}</td>
    </tr>`).join('');

  tbl.innerHTML = `<table>
    <thead><tr><th>Order ID</th><th>Retailer</th><th>Salesman</th><th>Source</th><th>Status</th><th>Priority</th><th>SLA</th><th>Received</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

// ─────────────────────────────────────────────────────────────
//  RENDER — LIVE BOARD
// ─────────────────────────────────────────────────────────────

function renderBoard() {
  const board = document.getElementById('pipeline');
  if (!board) return;

  board.innerHTML = STATUSES.map(s => {
    const col   = orders.filter(o => o.status === s.key);
    const cards = col.map(o => {
      const sla = slaInfo(o);
      const cls = sla.st === 'breach' ? 'sla-breach' : sla.st === 'warn' ? 'sla-warn' : '';
      return `<div class="order-card ${cls}" onclick="openDetail('${o.id}')">
        <div class="card-top">
          <span class="card-id">${o.id}</span>
          ${prioBadge(o.priority)}
        </div>
        <div class="card-retailer">${o.retailer}</div>
        <div class="card-meta">${srcBadge(o.source)} · <b>${o.salesman}</b></div>
        <div class="card-footer">
          <span class="card-meta" style="font-size:11px;color:var(--text3)">${fmtDate(o.receivedAt)}</span>
          <span class="card-time">${slaChip(o)}</span>
        </div>
      </div>`;
    }).join('');

    const empty = col.length === 0 ? `<div class="empty-lane">No orders here</div>` : '';

    return `<div class="lane">
      <div class="lane-header">
        <div class="lane-title">
          <div class="lane-dot" style="background:${s.dot}"></div>
          ${s.label}
        </div>
        <span class="lane-count">${col.length}</span>
      </div>
      <div class="lane-body">${cards}${empty}</div>
    </div>`;
  }).join('');
}

// ─────────────────────────────────────────────────────────────
//  RENDER — ALL ORDERS TABLE
// ─────────────────────────────────────────────────────────────

function renderOrders() {
  const q       = (document.getElementById('srch')?.value || '').toLowerCase();
  const fStatus = document.getElementById('fStatus')?.value || '';
  const fPrio   = document.getElementById('fPriority')?.value || '';
  const fSrc    = document.getElementById('fSource')?.value || '';

  let list = [...orders];
  if (q)       list = list.filter(o => o.id.toLowerCase().includes(q) || o.retailer.toLowerCase().includes(q) || o.salesman.toLowerCase().includes(q) || o.mobile.includes(q));
  if (fStatus) list = list.filter(o => o.status === fStatus);
  if (fPrio)   list = list.filter(o => o.priority === fPrio);
  if (fSrc)    list = list.filter(o => o.source === fSrc);

  const wrap = document.getElementById('ordersTable');
  if (!wrap) return;

  if (!list.length) {
    wrap.innerHTML = `<div class="empty-state"><div class="empty-icon">🔍</div><div class="empty-title">${orders.length ? 'No matching orders' : 'No orders yet'}</div><div class="empty-sub">${orders.length ? 'Try adjusting your filters' : 'Click <strong>+ New Order</strong> to get started'}</div></div>`;
    return;
  }

  const rows = list.map(o => `
    <tr onclick="openDetail('${o.id}')">
      <td style="color:var(--blue);font-weight:600;font-size:12px">${o.id}</td>
      <td><strong>${o.retailer}</strong></td>
      <td style="font-size:12px;color:var(--text2)">${o.mobile}</td>
      <td>${o.salesman}</td>
      <td>${srcBadge(o.source)}</td>
      <td>${statusPill(o.status)}</td>
      <td>${prioBadge(o.priority)}</td>
      <td>${slaChip(o)}</td>
      <td style="color:var(--text3);font-size:12px">${fmtDate(o.receivedAt)}</td>
    </tr>`).join('');

  wrap.innerHTML = `<table>
    <thead><tr><th>Order ID</th><th>Retailer</th><th>Mobile</th><th>Salesman</th><th>Source</th><th>Status</th><th>Priority</th><th>SLA</th><th>Received</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

// ─────────────────────────────────────────────────────────────
//  ORDER DETAIL MODAL
// ─────────────────────────────────────────────────────────────

function openDetail(id) {
  const o = orders.find(x => x.id === id);
  if (!o) return;

  document.getElementById('d-id').textContent = o.id;
  document.getElementById('d-sub').innerHTML = `${srcBadge(o.source)} ${prioBadge(o.priority)} · ${o.area || 'No area'}`;

  const si   = STATUSES.findIndex(s => s.key === o.status);
  const next = si < STATUSES.length - 1 ? STATUSES[si + 1] : null;

  const flow = STATUSES.map((s, i) => {
    const done = i < si, cur = i === si;
    const cls  = done ? 'done' : cur ? 'cur' : '';
    return `<div class="prog-step">
      <div class="prog-dot ${cls}">${done ? '✓' : cur ? '●' : ''}</div>
      <div class="prog-label ${cls}">${s.label}</div>
    </div>${i < STATUSES.length - 1 ? `<div class="prog-line ${i < si ? 'done' : ''}"></div>` : ''}`;
  }).join('');

  const tl = o.timeline.map((t, i) => {
    const isLast = i === o.timeline.length - 1;
    const dur    = i > 0 ? fmtMs(t.ts - o.timeline[i-1].ts) : null;
    return `<div class="tl-item">
      <div class="tl-dot ${isLast ? 'cur' : 'done'}">${isLast ? '●' : '✓'}</div>
      <div>
        <div class="tl-status">${t.label}</div>
        <div class="tl-meta">${fmtDate(t.ts)} · by ${t.user}</div>
        ${dur ? `<div class="tl-dur">⏱ ${dur} since previous step</div>` : ''}
      </div>
    </div>`;
  }).join('');

  document.getElementById('d-body').innerHTML = `
    <div class="detail-grid">
      <div class="detail-item"><div class="detail-key">Retailer</div><div class="detail-val">${o.retailer}</div></div>
      <div class="detail-item"><div class="detail-key">Mobile</div><div class="detail-val" style="font-size:12px">${o.mobile}</div></div>
      <div class="detail-item"><div class="detail-key">Salesman</div><div class="detail-val">${o.salesman}</div></div>
      <div class="detail-item"><div class="detail-key">Area</div><div class="detail-val">${o.area || '—'}</div></div>
      <div class="detail-item"><div class="detail-key">Source</div><div class="detail-val">${srcBadge(o.source)}</div></div>
      <div class="detail-item"><div class="detail-key">Priority</div><div class="detail-val">${prioBadge(o.priority)}</div></div>
      <div class="detail-item"><div class="detail-key">Received</div><div class="detail-val">${fmtDate(o.receivedAt)}</div></div>
      <div class="detail-item"><div class="detail-key">SLA</div><div class="detail-val">${slaChip(o)}</div></div>
    </div>
    ${o.remarks ? `<div style="background:var(--bg);border-radius:var(--rad);padding:9px 12px;font-size:12px;color:var(--text2);margin-bottom:14px">📝 ${o.remarks}</div>` : ''}
    <div class="divider"></div>
    <div style="font-size:12px;font-weight:500;color:var(--text2);margin-bottom:10px">Order Progress</div>
    <div class="progress-flow">${flow}</div>
    ${next ? `
    <div class="advance-bar">
      <span class="advance-label">Advance to <strong>${next.label}</strong>?</span>
      <select class="select" id="advUser" style="width:auto;padding:5px 9px;font-size:12px">
        <option>Ankur</option><option>Rajesh</option><option>Meena</option><option>Suresh</option><option>Priya</option>
      </select>
      <button class="btn btn-primary btn-xs" onclick="advance('${o.id}')">Mark →</button>
    </div>` : `<div style="background:var(--green-light);border-radius:var(--rad);padding:9px 12px;font-size:12px;color:var(--green);margin-bottom:14px">✓ Order fully dispatched</div>`}
    <div class="divider"></div>
    <div style="font-size:12px;font-weight:500;color:var(--text2);margin-bottom:10px">Audit Trail</div>
    <div class="timeline">${tl}</div>`;

  document.getElementById('detailModal').classList.add('open');
}

// ─────────────────────────────────────────────────────────────
//  ADVANCE STATUS  — writes to Firestore
// ─────────────────────────────────────────────────────────────

async function advance(id) {
  const o  = orders.find(x => x.id === id);
  if (!o) return;
  const si = STATUSES.findIndex(s => s.key === o.status);
  if (si >= STATUSES.length - 1) return;

  const user    = document.getElementById('advUser')?.value || 'System';
  const next    = STATUSES[si + 1];
  const newStep = { status: next.key, label: next.label, ts: Date.now(), user };

  try {
    const ref = db.collection("orders").doc(o._docId);
    await ref.update({
      status:   next.key,
      timeline: [...o.timeline, newStep],
    });
    toast('Status Updated', `${o.id} → ${next.label}`, '#1a7a4a');
  } catch (err) {
    toast('Save failed', err.message, '#dc2626');
  }

  closeModal('detailModal');
  // No manual refresh needed — onSnapshot fires automatically
}

// ─────────────────────────────────────────────────────────────
//  NEW ORDER MODAL
// ─────────────────────────────────────────────────────────────

function openNew() {
  const id = genId();
  document.getElementById('f-id').value          = id;
  document.getElementById('newOrderId').textContent = id;
  document.getElementById('f-time').value        = new Date().toLocaleString('en-IN');
  ['f-retailer','f-mobile','f-area','f-remarks'].forEach(i => document.getElementById(i).value = '');
  document.getElementById('newModal').classList.add('open');
}

// ─────────────────────────────────────────────────────────────
//  SAVE NEW ORDER  — writes to Firestore
// ─────────────────────────────────────────────────────────────

async function saveOrder() {
  const retailer = document.getElementById('f-retailer').value.trim();
  const mobile   = document.getElementById('f-mobile').value.trim();
  if (!retailer) { alert('Please enter retailer name.'); return; }
  if (!mobile)   { alert('Please enter mobile number.'); return; }

  const now = Date.now();
  const o = {
    id:         document.getElementById('f-id').value,
    retailer,
    mobile,
    area:       document.getElementById('f-area').value.trim(),
    source:     document.getElementById('f-source').value,
    salesman:   document.getElementById('f-salesman').value,
    priority:   document.getElementById('f-priority').value.split(' ')[0],
    remarks:    document.getElementById('f-remarks').value.trim(),
    status:     'received',
    receivedAt: now,
    timeline:   [{ status:'received', label:'Order Received', ts: now, user:'Ankur' }],
  };

  try {
    await ORDERS_COL.add(o);
    closeModal('newModal');
    toast('Order Created', `${o.id} — ${retailer}`, '#1a7a4a');
  } catch (err) {
    toast('Save failed', err.message, '#dc2626');
  }
  // No manual refresh — onSnapshot fires automatically
}

// ─────────────────────────────────────────────────────────────
//  RETAILER PORTAL  — reads from local orders[] (already synced)
// ─────────────────────────────────────────────────────────────

function lookupPortal() {
  const id  = document.getElementById('portalInput').value.trim();
  const o   = orders.find(x => x.id === id);
  const res = document.getElementById('portalResult');

  if (!o) { res.style.display = 'none'; alert('Order not found. Please check the ID.'); return; }

  res.style.display = 'block';
  const si = STATUSES.findIndex(s => s.key === o.status);

  const pubTl = o.timeline.map(t => `
    <div class="tl-item">
      <div class="tl-dot done">✓</div>
      <div><div class="tl-status">${t.label}</div><div class="tl-meta">${fmtDate(t.ts)}</div></div>
    </div>`).join('');

  const pending = STATUSES.slice(si + 1).map(s => `
    <div class="tl-item" style="opacity:0.3">
      <div class="tl-dot"></div>
      <div><div class="tl-status">${s.label}</div><div class="tl-meta">Pending</div></div>
    </div>`).join('');

  const sla    = slaInfo(o);
  const etaTxt = o.status === 'dispatched'
    ? '<span style="color:var(--green)">✓ Your order has been dispatched.</span>'
    : `Estimated ready in approx. <strong>${fmtMs(sla.rem)}</strong>`;

  document.getElementById('portalCard').innerHTML = `
    <div style="font-size:20px;font-weight:600;color:var(--accent);margin-bottom:2px">${o.id}</div>
    <div style="font-size:15px;font-weight:500;margin-bottom:2px">${o.retailer}</div>
    <div style="font-size:12px;color:var(--text3);margin-bottom:14px">Received ${fmtDate(o.receivedAt)} · ${prioBadge(o.priority)}</div>
    <div class="divider"></div>
    <div style="margin:12px 0 6px;font-size:12px;color:var(--text2)">Current Status</div>
    ${statusPill(o.status)}
    <div style="margin:12px 0;font-size:13px;color:var(--text2)">${etaTxt}</div>
    <div class="divider"></div>
    <div style="font-size:12px;font-weight:500;color:var(--text2);margin-bottom:10px">Timeline</div>
    <div class="timeline">${pubTl}${pending}</div>`;
}

// ─────────────────────────────────────────────────────────────
//  NAVIGATION
// ─────────────────────────────────────────────────────────────

const VIEWS = { dashboard:'Dashboard', board:'Live Board', orders:'All Orders', portal:'Retailer Portal' };

function show(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(`view-${name}`).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(`nav-${name}`)?.classList.add('active');
  document.getElementById('pageTitle').textContent = VIEWS[name] || name;
  if (name === 'board')  renderBoard();
  if (name === 'orders') renderOrders();
}

function closeModal(id) { document.getElementById(id).classList.remove('open'); }

document.querySelectorAll('.overlay').forEach(ov => {
  ov.addEventListener('click', e => { if (e.target === ov) ov.classList.remove('open'); });
});

// ─────────────────────────────────────────────────────────────
//  TOAST
// ─────────────────────────────────────────────────────────────

function toast(title, body, color) {
  document.getElementById('toastTitle').textContent = title;
  document.getElementById('toastBody').textContent  = body;
  document.getElementById('toastDot').style.background = color || '#1a7a4a';
  const t = document.getElementById('toast');
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3500);
}

// ─────────────────────────────────────────────────────────────
//  EXPORT — PDF
// ─────────────────────────────────────────────────────────────

function exportPDF() {
  if (!orders.length) { alert('No orders to export.'); return; }

  const date = new Date().toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
  const rows = orders.map(o => {
    const sla     = slaInfo(o);
    const slaText = sla.st === 'done' ? 'Done' : sla.st === 'breach' ? 'Breached' : sla.st === 'warn' ? 'Warning' : 'On Track';
    return `<tr>
      <td>${o.id}</td><td>${o.retailer}</td><td>${o.mobile}</td>
      <td>${o.salesman}</td><td>${o.source}</td>
      <td>${STATUSES.find(s=>s.key===o.status)?.label||o.status}</td>
      <td>${o.priority}</td><td>${fmtDate(o.receivedAt)}</td><td>${slaText}</td>
    </tr>`;
  }).join('');

  const statusSummary = STATUSES.map(s => {
    const cnt = orders.filter(o => o.status === s.key).length;
    return `<div style="display:inline-block;margin:0 12px 8px 0;text-align:center">
      <div style="font-size:22px;font-weight:700;color:#1a1916">${cnt}</div>
      <div style="font-size:10px;color:#6b6860;text-transform:uppercase;letter-spacing:0.05em">${s.label}</div>
    </div>`;
  }).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Pradeep Sales — Orders Report</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;color:#1a1916;background:#fff;padding:32px}
  .header{border-bottom:2px solid #d4570e;padding-bottom:16px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:flex-end}
  .brand{font-size:22px;font-weight:700;color:#1a1916}.brand span{color:#d4570e}
  .summary{background:#f7f6f3;border-radius:8px;padding:16px 20px;margin-bottom:20px}
  table{width:100%;border-collapse:collapse;font-size:11px}
  th{background:#f7f6f3;text-align:left;padding:8px 10px;font-size:10px;font-weight:600;color:#6b6860;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid #e5e2db}
  td{padding:8px 10px;border-bottom:1px solid #f0ede8;color:#1a1916;vertical-align:middle}
  tr:last-child td{border-bottom:none}
  tr:nth-child(even) td{background:#fafaf8}
  .footer{margin-top:24px;padding-top:12px;border-top:1px solid #e5e2db;font-size:10px;color:#a8a49d;display:flex;justify-content:space-between}
  @media print{body{padding:16px}@page{margin:16mm}}
</style></head><body>
  <div class="header">
    <div><div class="brand"><span>Pradeep</span> Sales</div>
    <div style="font-size:11px;color:#6b6860;margin-top:3px">Prayagraj, Uttar Pradesh · Authorised Distributor</div></div>
    <div style="font-size:11px;color:#6b6860;text-align:right;line-height:1.6">
      <div style="font-size:13px;font-weight:600;color:#1a1916">Orders Report</div>
      <div>Generated: ${date}</div><div>Total Orders: ${orders.length}</div>
    </div>
  </div>
  <div class="summary">
    <div style="font-size:11px;font-weight:600;color:#a8a49d;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">Pipeline Summary</div>
    <div style="display:flex;gap:24px;flex-wrap:wrap;margin-bottom:12px">
      <div style="text-align:center"><div style="font-size:26px;font-weight:700;color:#1a1916;line-height:1">${orders.length}</div><div style="font-size:10px;color:#6b6860;text-transform:uppercase;letter-spacing:.05em;margin-top:3px">Total</div></div>
      <div style="text-align:center"><div style="font-size:26px;font-weight:700;color:#1a1916;line-height:1">${orders.filter(o=>o.status!=='dispatched').length}</div><div style="font-size:10px;color:#6b6860;text-transform:uppercase;letter-spacing:.05em;margin-top:3px">Open</div></div>
      <div style="text-align:center"><div style="font-size:26px;font-weight:700;color:#1a1916;line-height:1">${orders.filter(o=>o.status==='dispatched').length}</div><div style="font-size:10px;color:#6b6860;text-transform:uppercase;letter-spacing:.05em;margin-top:3px">Dispatched</div></div>
    </div>
    <div>${statusSummary}</div>
  </div>
  <table><thead><tr><th>Order ID</th><th>Retailer</th><th>Mobile</th><th>Salesman</th><th>Source</th><th>Status</th><th>Priority</th><th>Received</th><th>SLA</th></tr></thead>
  <tbody>${rows}</tbody></table>
  <div class="footer"><div>Pradeep Sales Order Management System</div><div>Printed on ${date}</div></div>
</body></html>`;

  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 400);
}

// ─────────────────────────────────────────────────────────────
//  EXPORT — CSV
// ─────────────────────────────────────────────────────────────

function exportCSV() {
  if (!orders.length) { alert('No orders to export.'); return; }
  const hdr  = ['Order ID','Retailer','Mobile','Salesman','Source','Status','Priority','Received'];
  const rows = orders.map(o => [o.id,o.retailer,o.mobile,o.salesman,o.source,o.status,o.priority,fmtDate(o.receivedAt)]);
  const csv  = [hdr,...rows].map(r => r.join(',')).join('\n');
  const a    = document.createElement('a');
  a.href     = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  a.download = `orders-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
}

// ─────────────────────────────────────────────────────────────
//  EXPOSE FUNCTIONS TO WINDOW
//  Required because type="module" scopes functions away from
//  inline onclick= handlers in HTML
// ─────────────────────────────────────────────────────────────

window.show        = show;
window.openNew     = openNew;
window.saveOrder   = saveOrder;
window.closeModal  = closeModal;
window.openDetail  = openDetail;
window.advance     = advance;
window.lookupPortal= lookupPortal;
window.exportPDF   = exportPDF;
window.exportCSV   = exportCSV;
window.renderOrders= renderOrders;

// ─────────────────────────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────────────────────────

startListener();
