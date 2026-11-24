/* Surge Console — API client + UI */
(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

  const LS_BASE = 'surge.console.base';
  const LS_KEY = 'surge.console.key';
  const SS_KEY = 'surge.console.sessionkey';
  const LS_GROUP_STATE = 'surge.console.groupState';
  const LS_POLICY_LAYOUT = 'surge.console.policyLayout';
  const LS_CONNECTIONS = 'surge.console.connections';

  let savedGroupState = {};
  try { savedGroupState = JSON.parse(localStorage.getItem(LS_GROUP_STATE) || '{}'); } catch { savedGroupState = {}; }
  let savedConnections = [];
  try {
    const raw = JSON.parse(localStorage.getItem(LS_CONNECTIONS) || '[]');
    savedConnections = Array.isArray(raw)
      ? raw.filter((c) => c && c.base).slice(0, 20).map((c) => ({
          base: String(c.base),
          name: String(c.name || c.base),
          key: c.remember ? String(c.key || '') : '',
          remember: !!c.remember,
          lastUsed: Number(c.lastUsed) || 0,
        }))
      : [];
  } catch { savedConnections = []; }

  const state = {
    base: localStorage.getItem(LS_BASE) || '',
    key: sessionStorage.getItem(SS_KEY) || localStorage.getItem(LS_KEY) || '',
    remember: !!localStorage.getItem(LS_KEY),
    groupState: savedGroupState,
    policyLayout: localStorage.getItem(LS_POLICY_LAYOUT) === 'single' ? 'single' : 'double',
    connections: savedConnections,
    selectionCache: {},
    selectionRev: {},
    groupTypesCache: null,
    connected: false,
    demo: true,
    busy: false,
    view: 'overview',
    dnsTab: 'dynamic',
    dnsQuery: '',
    trafficBusy: false,
    requestDetail: null,
    requestDetailTab: 'general',
    trafficSort: {
      ifaces: [{ id: 'total', desc: true }],
      policies: [{ id: 'total', desc: true }],
    },
    traffic: {
      ifaces: [],
      policies: [],
      peaks: { ifaces: {}, policies: {} },
      startTime: null,
      history: [],
      totalIn: 0,
      totalOut: 0,
      up: 0,
      down: 0,
      maxUp: 0,
      maxDown: 0,
    },
    apiLatency: null,
    lastUpdated: null,
    device: { name: '演示设备', platform: 'tvOS', version: '6.0.0', build: '1000' },
    data: {
      outbound: 'rule',
      features: { mitm: true, rewrite: true, scripting: true, capture: false },
      recent: [],
      active: [],
      groups: [],
      resources: [],
      dns: { dynamic: [], static: [] },
      profile: '',
      metrics: null,
      error: null,
    },
    demoTimer: null,
  };

  /* ------------------------------------------------------------------ */
  /* Demo data                                                           */
  /* ------------------------------------------------------------------ */

  const DEMO = {
    outbound: 'rule',
    features: { mitm: true, rewrite: true, scripting: true, capture: false },
    groups: [
      {
        name: '🚀 代理选择', type: 'select', selected: '节点 A',
        members: [
          { name: '节点 A', ms: 42 },
          { name: '节点 B', ms: 78 },
          { name: '节点 C', ms: 96 },
          { name: '节点 D', ms: 210 },
          { name: 'DIRECT', ms: null },
        ],
      },
      {
        name: '♻️ 自动选择', type: 'url-test', selected: '节点 A',
        members: [
          { name: '节点 A', ms: 41 },
          { name: '节点 E', ms: 55 },
          { name: '节点 B', ms: 77 },
          { name: '节点 C', ms: 95 },
        ],
      },
      {
        name: '🎬 流媒体', type: 'select', selected: '节点 B',
        members: [
          { name: '节点 B', ms: 78 },
          { name: '节点 A', ms: 42 },
          { name: '节点 D', ms: 210 },
          { name: 'DIRECT', ms: null },
        ],
      },
      {
        name: '🍎 苹果服务', type: 'select', selected: 'DIRECT',
        members: [
          { name: 'DIRECT', ms: null },
          { name: '节点 A', ms: 42 },
          { name: '节点 B', ms: 78 },
        ],
      },
    ],
    recent: [
      { id: 901, URL: 'https://www.example.com/v1/player?key=AIza', method: 'POST', status: 200, policy: '🎬 流媒体', rule: 'DOMAIN-SUFFIX,example.com', startDate: 1770000000, completedDate: 1770000000.132, completed: true, inBytes: 184320, outBytes: 4210, sourceAddress: 'Client A', processPath: 'demo.player' },
      { id: 902, URL: 'https://api.example.com/v1/items/123', method: 'GET', status: 200, policy: '🎬 流媒体', rule: 'DOMAIN-SUFFIX,example.com', startDate: 1769999998, completedDate: 1769999998.086, completed: true, inBytes: 48210, outBytes: 980, sourceAddress: 'Client A' },
      { id: 903, URL: 'https://gateway.example.com/v1/session', method: 'POST', status: 200, policy: '🍎 苹果服务', rule: 'DOMAIN-SUFFIX,example.com', startDate: 1769999995, completedDate: 1769999995.042, completed: true, inBytes: 10240, outBytes: 2140, sourceAddress: 'Client A' },
      { id: 904, URL: 'https://api.example.com/v1/device/verify', method: 'GET', status: 200, policy: 'DIRECT', rule: 'DOMAIN-SUFFIX,example.com', startDate: 1769999992, completedDate: 1769999992.021, completed: true, inBytes: 6200, outBytes: 640, sourceAddress: 'Client A' },
      { id: 905, URL: 'https://media.example.com/v1/playback', method: 'GET', status: 200, policy: '🎬 流媒体', rule: 'DOMAIN-SUFFIX,example.com', startDate: 1769999988, completedDate: 1769999988.164, completed: true, inBytes: 320100, outBytes: 5120, sourceAddress: 'Client A' },
      { id: 906, URL: 'https://analytics.example.com/collect', method: 'POST', status: 204, policy: 'REJECT', rule: 'DOMAIN-SUFFIX,example.com', startDate: 1769999986, completedDate: 1769999986.004, completed: true, inBytes: 0, outBytes: 0, sourceAddress: 'Client A' },
      { id: 907, URL: 'https://cdn.example.com/lib/demo.min.js', method: 'GET', status: 200, policy: '🚀 代理选择', rule: 'DOMAIN-SUFFIX,example.com', startDate: 1769999982, completedDate: 1769999982.093, completed: true, inBytes: 8820, outBytes: 620, sourceAddress: 'Client B' },
      { id: 908, URL: 'https://api.example.com/v1/updates', method: 'POST', status: 200, policy: '🚀 代理选择', rule: 'DOMAIN-SUFFIX,example.com', startDate: 1769999978, completedDate: 1769999978.071, completed: true, inBytes: 12400, outBytes: 980, sourceAddress: 'Client B' },
    ],
    active: [
      { id: 1001, URL: 'https://media.example.com/watch', method: 'CONNECT', status: 'Active', policy: '🎬 流媒体', rule: 'DOMAIN-SUFFIX,example.com', startDate: 1770000001, completed: false, inBytes: 2048000, outBytes: 12000, sourceAddress: 'Client A' },
      { id: 1002, URL: 'https://api.example.com/v1/status', method: 'GET', status: 'Active', policy: '🚀 代理选择', rule: 'DOMAIN-SUFFIX,example.com', startDate: 1770000002, completed: false, inBytes: 0, outBytes: 0, sourceAddress: 'Client B' },
    ],
    resources: [
      { path: 'https://example.com/rules/media.list', type: 'ruleset', ready: true, local: false, updatedAt: 1770001200, fromModule: null },
      { path: 'https://example.com/rules/apple.list', type: 'domainset', ready: true, local: false, updatedAt: 1770001300, fromModule: null },
      { path: 'https://example.com/scripts/demo.js', type: 'script', ready: false, local: false, updatedAt: 0, fromModule: 'MitM All Hostnames', error: 'timed out' },
      { path: 'https://example.com/rules/streaming.list', type: 'policy-group', ready: true, local: false, updatedAt: 1770001400, fromModule: null },
    ],
    metrics: { uptime: 86400 * 3 + 3600 * 7, mem: 42.6 * 1024 * 1024 },
    dns: {
      dynamic: [
        { domain: 'api.example.com', server: '192.0.2.53', data: ['192.0.2.10', '192.0.2.11'], path: 'api.example.com -> 192.0.2.10' },
        { domain: 'www.example.com', server: '192.0.2.53', data: ['198.51.100.20'], path: 'www.example.com -> edge.example.com -> 198.51.100.20' },
        { domain: 'dns.example.com', server: '192.0.2.53', data: ['0.0.0.0'], path: 'dns.example.com -> 0.0.0.0' },
        { domain: 'time.example.com', server: '192.0.2.53', data: ['192.0.2.12', '192.0.2.13'], path: 'time.example.com -> time.example.net -> 192.0.2.12' },
        { domain: 'media.example.com', server: '192.0.2.53', data: ['203.0.113.30'], path: 'media.example.com -> 203.0.113.30' },
      ],
      static: [
        { domain: 'router.example', data: '192.0.2.1', source: 'Host', comment: 'local router' },
        { domain: 'media.example', data: '192.0.2.2', source: 'Host', comment: 'media server' },
      ],
    },
    traffic: (() => {
      const now = Date.now();
      const mb = 1024 * 1024;
      const gb = 1024 * mb;
      const history = Array.from({ length: 60 }, (_, i) => ({
        x: now - (60 - i) * 1000,
        down: 160000 + 110000 * Math.abs(Math.sin(i / 6)) + (i % 17 === 0 ? 430000 : 0),
        up: 16000 + 12000 * Math.abs(Math.sin(i / 9)),
      }));
      return {
        startTime: Math.floor(now / 1000) - 13 * 3600 - 27 * 60,
        ifaces: [{ name: 'en0', in: 9.64 * gb, out: 151.31 * mb, inCurrentSpeed: 190000, outCurrentSpeed: 22000, inMaxSpeed: 11.31 * mb, outMaxSpeed: 1.09 * mb }],
        policies: [
          { name: 'Proxy A', in: 2.8 * gb, out: 15.29 * mb, inCurrentSpeed: 0, outCurrentSpeed: 0, inMaxSpeed: 7.94 * mb, outMaxSpeed: 85.27 * 1024 },
          { name: 'Proxy B', in: 1.54 * gb, out: 8.3 * mb, inCurrentSpeed: 0, outCurrentSpeed: 0, inMaxSpeed: 3.64 * mb, outMaxSpeed: 57.53 * 1024 },
          { name: 'Proxy C', in: 1.49 * gb, out: 7.04 * mb, inCurrentSpeed: 0, outCurrentSpeed: 0, inMaxSpeed: 3.66 * mb, outMaxSpeed: 184.05 * 1024 },
          { name: 'Proxy D', in: 1.34 * gb, out: 13.79 * mb, inCurrentSpeed: 0, outCurrentSpeed: 0, inMaxSpeed: 7.86 * mb, outMaxSpeed: 74.93 * 1024 },
          { name: 'DIRECT', in: 915.83 * mb, out: 57.26 * mb, inCurrentSpeed: 190000, outCurrentSpeed: 22000, inMaxSpeed: 11.31 * mb, outMaxSpeed: 1.09 * mb },
          { name: 'Proxy E', in: 875.4 * mb, out: 6.57 * mb, inCurrentSpeed: 0, outCurrentSpeed: 0, inMaxSpeed: 5.28 * mb, outMaxSpeed: 43.22 * 1024 },
          { name: 'Proxy F', in: 291.76 * mb, out: 4.82 * mb, inCurrentSpeed: 0, outCurrentSpeed: 0, inMaxSpeed: 3.14 * mb, outMaxSpeed: 100.19 * 1024 },
        ],
        totalIn: 9.64 * gb,
        totalOut: 151.31 * mb,
        up: 22000,
        down: 190000,
        maxUp: 1.09 * mb,
        maxDown: 11.31 * mb,
        history,
      };
    })(),
  };

  /* ------------------------------------------------------------------ */
  /* Helpers                                                             */
  /* ------------------------------------------------------------------ */

  const fmtMs = (n) => {
    if (n === null || n === undefined || Number.isNaN(n)) return '—';
    if (n < 0) return '超时';
    if (n >= 1000) return `${(n / 1000).toFixed(1)}s`;
    return `${Math.round(n)}ms`;
  };
  const fmtDnsMs = (ms) => {
    if (!Number.isFinite(ms) || ms < 0) return '—';
    return ms < 10 ? `${ms.toFixed(2)}ms` : `${Math.round(ms)}ms`;
  };
  const latencyTone = (n) => (n === null || n === undefined ? 'muted' : n < 0 ? 'bad' : n < 100 ? 'good' : n < 250 ? 'warn' : 'bad');
  const fmtBytes = (n) => {
    n = Number(n) || 0;
    if (n < 1024) return `${n} B`;
    const units = ['KB', 'MB', 'GB', 'TB'];
    let v = n / 1024, i = 0;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i += 1; }
    return `${v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)} ${units[i]}`;
  };
  const fmtSpeed = (n) => `${fmtBytes(n)}/s`;
  const fmtSpeedMax = (n) => (n > 0 ? fmtSpeed(n) : '—');
  const fmtUptime = (s) => {
    s = Number(s) || 0;
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    if (d) return `${d}d ${h}h`;
    if (h) return `${h}h ${m}m`;
    return `${m}m`;
  };
  const fmtTime = (unix) => {
    if (!unix) return '—';
    const d = new Date(unix * 1000);
    return d.toLocaleTimeString('zh-CN', { hour12: false });
  };
  const hostOf = (url) => {
    try { return new URL(url).host || url; } catch { return String(url || '—'); }
  };
  const pathOf = (url) => {
    try { const u = new URL(url); return u.pathname + (u.search ? '?' : ''); } catch { return ''; }
  };
  const statusKind = (r) => {
    if (r.completed === false || r.status === 'Active') return 'active';
    const s = Number(r.status);
    if (!Number.isNaN(s) && s >= 400) return 'err';
    if (String(r.status).toLowerCase().includes('fail')) return 'err';
    return 'ok';
  };
  const statusText = (r) => (statusKind(r) === 'active' ? 'ACTIVE' : String(r.status ?? '—'));
  const requestPolicy = (r) => r.policyName || r.policy || '—';

  const ICONS = {
    search: '<circle cx="11" cy="11" r="6.5" stroke="currentColor" stroke-width="1.7"/><path d="m16.2 16.2 4 4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
    zap: '<path d="M13 2 4.5 13.2h6.1L10 22l9.5-11.6h-6.2L13 2Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
    lock: '<rect x="5" y="10" width="14" height="10" rx="2.5" stroke="currentColor" stroke-width="1.6"/><path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" stroke-width="1.6"/>',
    shuffle: '<path d="M4 7h3l10 10h3M4 17h3l10-10h3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="m17 4 3 3-3 3M17 14l3 3-3 3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
    code: '<path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
    record: '<circle cx="12" cy="12" r="7" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="2.4" fill="currentColor"/>',
    file: '<path d="M7 3h7l4 4v14H7V3Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M14 3v4h4M10 12h5M10 16h5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    layers: '<path d="m12 3 8 4.5-8 4.5-8-4.5L12 3Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="m4 12 8 4.5 8-4.5M4 16.5 12 21l8-4.5" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
    refresh: '<path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v4.5h-4.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
    chevron: '<path d="m6 9 6 6 6-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
    close: '<path d="m6 6 12 12M18 6 6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  };
  const icon = (name) => `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">${ICONS[name] || ICONS.file}</svg>`;

  const showToast = (title, message = '', kind = 'ok') => {
    const root = $('#toast-root');
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.innerHTML = `<span class="t-dot"></span><div><b>${esc(title)}</b><span>${esc(message)}</span></div>`;
    root.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateY(6px)'; el.style.transition = 'all .25s ease'; }, 3200);
    setTimeout(() => el.remove(), 3600);
  };

  const setBusy = (busy) => {
    state.busy = busy;
    const btn = $('#btn-refresh');
    if (btn) btn.classList.toggle('busy', busy);
  };

  const isGroupExpanded = (g) => {
    const v = state.groupState[g.name];
    if (v === undefined) return false;
    return !!v;
  };
  const persistGroupState = () => {
    try { localStorage.setItem(LS_GROUP_STATE, JSON.stringify(state.groupState)); } catch { /* ignore */ }
  };
  const setGroupExpanded = (name, expanded) => {
    state.groupState[name] = !!expanded;
    persistGroupState();
  };
  const setAllGroupsExpanded = (expanded) => {
    (state.data.groups || []).forEach((g) => { state.groupState[g.name] = !!expanded; });
    persistGroupState();
  };

  const TYPE_LABELS = {
    select: 'SELECT',
    'url-test': 'URL TEST',
    fallback: 'FALLBACK',
    'load-balance': 'LOAD BALANCE',
    smart: 'SMART',
    manual: 'MANUAL',
    group: 'GROUP',
  };
  const typeLabel = (type) => TYPE_LABELS[String(type || '').toLowerCase()] || String(type || 'GROUP').toUpperCase();

  const parseGroupTypes = (text) => {
    const map = {};
    if (typeof text !== 'string' || !text) return map;
    let inGroup = false;
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('//') || line.startsWith('#')) continue;
      if (/^\[.*\]$/.test(line)) {
        inGroup = /^\[Proxy Group\]$/i.test(line);
        continue;
      }
      if (!inGroup) continue;
      const eq = line.indexOf('=');
      if (eq < 0) continue;
      const name = line.slice(0, eq).trim();
      const rhs = line.slice(eq + 1).trim();
      const type = rhs.split(',')[0].trim().toLowerCase();
      if (name && type) map[name] = type;
    }
    return map;
  };

  const extractProfileText = (p) => {
    if (typeof p === 'string') return p;
    if (Array.isArray(p)) return p.join('\n');
    if (!p || typeof p !== 'object') return '';
    const v = p.profile || p.originalProfile || p.content || p.data || p.text;
    if (typeof v === 'string') return v;
    if (Array.isArray(v)) return v.join('\n');
    return '';
  };

  const applyGroupTypes = (groups, types) => {
    if (!types || typeof types !== 'object') return;
    const byKey = {};
    Object.entries(types).forEach(([name, type]) => { byKey[name.trim().toLowerCase()] = type; });
    groups.forEach((g) => {
      const type = types[g.name] || byKey[g.name.trim().toLowerCase()];
      if (type) g.type = type;
    });
  };

  const loadGroupTypes = async () => {
    if (state.groupTypesCache) return state.groupTypesCache;
    let raw = await api('/v1/profiles/current?sensitive=1').then((r) => r.data).catch(() => null);
    let text = extractProfileText(raw);
    if (!text) {
      raw = await api('/v1/profiles/current').then((r) => r.data).catch(() => null);
      text = extractProfileText(raw);
    }
    const types = parseGroupTypes(text);
    if (text) state.data.profile = text;
    if (Object.keys(types).length) state.groupTypesCache = types;
    return types;
  };

  const nodeTypeLabel = (m) => {
    const raw = String(m.typeDescription || '').trim();
    if (raw) return raw.toUpperCase();
    if (m.name === 'DIRECT') return 'DIRECT';
    if (m.name === 'REJECT') return 'REJECT';
    return 'PROXY';
  };
  const nodeTypeClass = (m) => {
    const t = nodeTypeLabel(m).toLowerCase();
    if (t.includes('direct')) return 'direct';
    if (t.includes('reject')) return 'reject';
    if (t.includes('group')) return 'group';
    return 'proxy';
  };

  /* ------------------------------------------------------------------ */
  /* API                                                                 */
  /* ------------------------------------------------------------------ */

  class ApiError extends Error {
    constructor(status, message, body) { super(message); this.status = status; this.body = body; }
  }

  const api = async (path, { method = 'GET', body, timeout = 9000 } = {}) => {
    const base = String(state.base || '').replace(/\/+$/, '');
    if (!base) throw new ApiError(0, '请先填写 API 地址');
    const url = `${base}${path.startsWith('/v1') ? '' : '/v1'}${path}`;
    const headers = { 'X-Key': state.key };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    const started = performance.now();
    try {
      const res = await fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctrl.signal,
        cache: 'no-store',
      });
      clearTimeout(timer);
      state.apiLatency = Math.round(performance.now() - started);
      const text = await res.text();
      let data = null;
      if (text) { try { data = JSON.parse(text); } catch { data = text; } }
      if (!res.ok) throw new ApiError(res.status, (data && data.error) || `HTTP ${res.status}`, data);
      return { data, headers: res.headers };
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') throw new ApiError(0, '请求超时');
      throw err;
    }
  };

  const normalizeBase = (base) => {
    let b = String(base || '').trim();
    if (!b) return '';
    if (!/^https?:\/\//i.test(b)) b = `http://${b}`;
    return b.replace(/\/+$/, '');
  };

  const saveConnection = (entry) => {
    const base = normalizeBase(entry.base || '');
    if (!base) return;
    const key = entry.remember ? String(entry.key || '') : '';
    const name = String(entry.name || '').trim() || base.replace(/^https?:\/\//i, '');
    const list = (state.connections || []).filter((c) => normalizeBase(c.base) !== base);
    list.unshift({ base, name, key, remember: !!entry.remember, lastUsed: Date.now() });
    state.connections = list.slice(0, 20);
    try { localStorage.setItem(LS_CONNECTIONS, JSON.stringify(state.connections)); } catch { /* ignore */ }
  };

  const connect = async (base, key, remember = false) => {
    const cleanBase = normalizeBase(base);
    if (!cleanBase) throw new Error('请填写 API 地址');
    if (!key) throw new Error('请填写 API Key');
    state.base = cleanBase;
    state.key = key.trim();
    const { data, headers } = await api('/v1/environment', { timeout: 7000 });
    const platform = headers.get('x-system') || 'Unknown';
    state.device = {
      name: (data && (data.deviceName || data.name)) || 'Surge',
      platform,
      version: headers.get('x-surge-version') || '',
      build: headers.get('x-surge-build') || '',
    };
    state.connected = true;
    state.demo = false;
    localStorage.setItem(LS_BASE, cleanBase);
    sessionStorage.setItem(SS_KEY, state.key);
    if (remember) localStorage.setItem(LS_KEY, state.key);
    else localStorage.removeItem(LS_KEY);
    saveConnection({ base: cleanBase, key: state.key, name: state.device.name || cleanBase, remember });
    updateConnectionUI();
    closeModal();
    await loadAll();
    showToast('已连接', `${state.device.name} · ${platform} ${state.device.version}`.trim());
  };

  const loadAll = async () => {
    if (!state.connected) { render(); return; }
    setBusy(true);
    state.data.error = null;
    try {
      if (state.view === 'policies') await loadPolicies();
      else if (state.view === 'requests') await loadRequests();
      else if (state.view === 'dns') await loadDns();
      else if (state.view === 'traffic') await loadTraffic();
      else if (state.view === 'resources') await loadResources();
      else if (state.view === 'settings') await loadSettings();
      else await loadOverview();
      state.lastUpdated = new Date();
    } catch (err) {
      state.data.error = err;
      if (err.status === 401) showToast('鉴权失败', 'API Key 不正确，或已更换', 'err');
      else showToast('请求失败', err.message || '无法连接 Surge', 'err');
    } finally {
      setBusy(false);
      render();
      updateConnectionUI();
    }
  };

  const loadOverview = async () => {
    const [outbound, mitm, rewrite, scripting, capture, active, recent, resources, metrics, policies, groupsRaw, traffic, events] = await Promise.all([
      api('/v1/outbound').then((r) => r.data).catch(() => null),
      api('/v1/features/mitm').then((r) => r.data).catch(() => null),
      api('/v1/features/rewrite').then((r) => r.data).catch(() => null),
      api('/v1/features/scripting').then((r) => r.data).catch(() => null),
      api('/v1/features/capture').then((r) => r.data).catch(() => null),
      api('/v1/requests/active').then((r) => r.data).catch(() => null),
      api('/v1/requests/recent').then((r) => r.data).catch(() => null),
      api('/v1/external_resources').then((r) => r.data).catch(() => null),
      api('/v1/metrics', { timeout: 5000 }).then((r) => parseMetrics(r.data)).catch(() => null),
      api('/v1/policies').then((r) => r.data).catch(() => null),
      api('/v1/policy_groups').then((r) => r.data).catch(() => null),
      api('/v1/traffic').then((r) => r.data).catch(() => null),
      api('/v1/events').then((r) => r.data).catch(() => null),
    ]);
    state.data.outbound = outbound?.mode || state.data.outbound;
    state.data.features = {
      mitm: !!mitm?.enabled,
      rewrite: !!rewrite?.enabled,
      scripting: !!scripting?.enabled,
      capture: !!capture?.enabled,
    };
    state.data.active = toArray(active, 'requests');
    state.data.recent = toArray(recent, 'requests');
    state.data.resources = resources?.defines || [];
    state.data.metrics = metrics;
    if (policies) {
      state.data.policiesRaw = policies;
      state.data.policyGroupsRaw = groupsRaw;
      const groups = normalizeGroups(policies, groupsRaw, null, null);
      groups.forEach((g) => { if (g.name in state.selectionCache) g.selected = state.selectionCache[g.name]; });
      state.data.groups = groups;
    }
    state.data.events = Array.isArray(events) ? events : (events?.events || []);
    if (traffic) applyTraffic(traffic);
  };

  const hydrateSelections = async (groups) => {
    if (!state.connected || state.demo) return;
    const pending = groups.filter((g) => !(g.name in state.selectionCache));
    if (!pending.length) {
      groups.forEach((g) => { if (g.name in state.selectionCache) g.selected = state.selectionCache[g.name]; });
      return;
    }
    let cursor = 0;
    const worker = async () => {
      while (cursor < pending.length) {
        const g = pending[cursor++];
        const rev = state.selectionRev[g.name] || 0;
        const changed = () => (state.selectionRev[g.name] || 0) !== rev;
        try {
          const r = await api(`/v1/policy_groups/select?group_name=${encodeURIComponent(g.name)}`, { timeout: 4000 });
          if (changed()) continue;
          const policy = r.data?.policy || null;
          state.selectionCache[g.name] = policy;
          g.selected = policy;
        } catch {
          if (changed()) continue;
          state.selectionCache[g.name] = null;
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(6, pending.length) }, worker));
    if (state.view === 'policies' || state.view === 'overview') render();
  };

  const loadPolicies = async () => {
    const [pol, groupsRaw, bench, testResults] = await Promise.all([
      api('/v1/policies').then((r) => r.data).catch(() => null),
      api('/v1/policy_groups').then((r) => r.data).catch(() => null),
      api('/v1/policies/benchmark_results').then((r) => r.data).catch(() => null),
      api('/v1/policy_groups/test_results').then((r) => r.data).catch(() => null),
    ]);
    state.data.policiesRaw = pol;
    state.data.policyGroupsRaw = groupsRaw;
    state.data.benchmark = bench;
    state.data.testResults = testResults;
    const groups = normalizeGroups(pol, groupsRaw, bench, testResults);
    applyGroupTypes(groups, await loadGroupTypes());
    groups.forEach((g) => {
      if (g.name in state.selectionCache) g.selected = state.selectionCache[g.name];
    });
    state.data.groups = groups;
    hydrateSelections(groups);
  };

  const loadRequests = async () => {
    const [recent, active] = await Promise.all([
      api('/v1/requests/recent').then((r) => r.data).catch(() => null),
      api('/v1/requests/active').then((r) => r.data).catch(() => null),
    ]);
    state.data.recent = toArray(recent, 'requests');
    state.data.active = toArray(active, 'requests');
  };

  const loadResources = async () => {
    const res = await api('/v1/external_resources');
    state.data.resources = res?.data?.defines || [];
  };

  const loadDns = async () => {
    const r = await api('/v1/dns');
    const d = r.data || {};
    state.data.dns = {
      dynamic: Array.isArray(d.dnsCache) ? d.dnsCache : [],
      static: Array.isArray(d.local) ? d.local : [],
    };
  };

  const SIZE_UNITS = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 };
  const toNum = (v) => {
    if (typeof v === 'string') {
      const m = v.trim().match(/^([\d.]+)\s*(B|KB|MB|GB|TB)(?:\/s)?$/i);
      if (m) return Number(m[1]) * (SIZE_UNITS[m[2].toUpperCase()] || 1);
    }
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  const findNum = (obj, patterns) => {
    if (!obj || typeof obj !== 'object') return 0;
    for (const [k, v] of Object.entries(obj)) {
      const key = String(k).toLowerCase();
      if (patterns.every((re) => re.test(key))) {
        const n = Number(v);
        if (Number.isFinite(n)) return n;
      }
    }
    return 0;
  };

  const normalizeTraffic = (d) => {
    const read = (raw) => {
      const list = Array.isArray(raw)
        ? raw.map((v) => [v.name || v.hostname || v.policy || '', v])
        : Object.entries(raw || {});
      return list.map(([name, v]) => {
        if (!v || typeof v !== 'object') {
          return { name: name || '—', in: 0, out: 0, inCurrentSpeed: 0, outCurrentSpeed: 0, inMaxSpeed: 0, outMaxSpeed: 0 };
        }
        return {
          name: v.name || v.hostname || v.policy || name || '—',
          in: toNum(v.in ?? v.inBytes ?? v.download ?? v.rx),
          out: toNum(v.out ?? v.outBytes ?? v.upload ?? v.tx),
          inCurrentSpeed: toNum(v.inCurrentSpeed ?? v.inSpeed ?? findNum(v, [/current|now|rate/i, /in|down|recv|download/i])),
          outCurrentSpeed: toNum(v.outCurrentSpeed ?? v.outSpeed ?? findNum(v, [/current|now|rate/i, /out|up|send|upload/i])),
          inMaxSpeed: toNum(v.inMaxSpeed ?? v.inMax ?? findNum(v, [/max|peak/i, /in|down|recv|download/i])),
          outMaxSpeed: toNum(v.outMaxSpeed ?? v.outMax ?? findNum(v, [/max|peak/i, /out|up|send|upload/i])),
        };
      });
    };
    const applyPeaks = (list, tableKey) => {
      if (!state.traffic) state.traffic = { peaks: {} };
      const peaksRoot = state.traffic.peaks || (state.traffic.peaks = {});
      const peaks = peaksRoot[tableKey] || (peaksRoot[tableKey] = {});
      list.forEach((x) => {
        const p = peaks[x.name] || (peaks[x.name] = { in: 0, out: 0 });
        p.in = Math.max(p.in, x.inCurrentSpeed);
        p.out = Math.max(p.out, x.outCurrentSpeed);
        x.inMaxSpeed = Math.max(x.inMaxSpeed, p.in);
        x.outMaxSpeed = Math.max(x.outMaxSpeed, p.out);
      });
    };
    const ifaces = read(d.interface);
    const policies = read(d.connector);
    applyPeaks(ifaces, 'ifaces');
    applyPeaks(policies, 'policies');
    const sum = (arr, key) => arr.reduce((n, x) => n + x[key], 0);
    const rawStart = Number(d.startTime);
    return {
      ifaces,
      policies,
      startTime: rawStart ? (rawStart > 1e12 ? Math.floor(rawStart / 1000) : rawStart) : null,
      totalIn: sum(ifaces, 'in'),
      totalOut: sum(ifaces, 'out'),
      up: sum(ifaces, 'outCurrentSpeed'),
      down: sum(ifaces, 'inCurrentSpeed'),
      maxUp: sum(ifaces, 'outMaxSpeed'),
      maxDown: sum(ifaces, 'inMaxSpeed'),
    };
  };

  const applyTraffic = (d) => {
    const norm = normalizeTraffic(d || {});
    const now = Date.now();
    const current = state.traffic || {};
    const peaks = current.peaks || { ifaces: {}, policies: {} };
    const history = [...(current.history || []), { x: now, down: norm.down, up: norm.up }].slice(-90);
    state.traffic = {
      ...current,
      ...norm,
      peaks,
      startTime: norm.startTime || current.startTime || Math.floor(now / 1000),
      history,
    };
  };

  const loadTraffic = async () => {
    const r = await api('/v1/traffic', { timeout: 4000 });
    applyTraffic(r.data || {});
  };

  const tickTraffic = async () => {
    if (!['traffic', 'overview'].includes(state.view) || !state.connected || state.demo || document.hidden || state.trafficBusy) return;
    state.trafficBusy = true;
    try {
      await loadTraffic();
      if (state.view === 'traffic') paintTraffic();
      else paintOverviewTraffic();
    } catch { /* keep last sample */ } finally {
      state.trafficBusy = false;
    }
  };

  const loadSettings = async () => {
    const [mitm, rewrite, scripting, capture] = await Promise.all([
      api('/v1/features/mitm').then((r) => r.data).catch(() => null),
      api('/v1/features/rewrite').then((r) => r.data).catch(() => null),
      api('/v1/features/scripting').then((r) => r.data).catch(() => null),
      api('/v1/features/capture').then((r) => r.data).catch(() => null),
    ]);
    state.data.features = {
      mitm: !!mitm?.enabled,
      rewrite: !!rewrite?.enabled,
      scripting: !!scripting?.enabled,
      capture: !!capture?.enabled,
    };
  };

  const toArray = (data, key) => {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (Array.isArray(data[key])) return data[key];
    if (Array.isArray(data.items)) return data.items;
    if (Array.isArray(data.requests)) return data.requests;
    return [];
  };

  const parseMetrics = (text) => {
    if (typeof text !== 'string') return null;
    const pick = (name) => {
      const m = text.match(new RegExp(`^${name}\\s+([0-9.eE+-]+)`, 'm'));
      return m ? Number(m[1]) : null;
    };
    return {
      uptime: pick('surge_uptime_seconds'),
      mem: pick('surge_memory_bytes'),
      active: pick('surge_active_requests'),
      dns: pick('surge_dns_cache_entries'),
    };
  };

  /* ------------------------------------------------------------------ */
  /* Policy normalization                                                */
  /* ------------------------------------------------------------------ */

  const normalizeGroups = (pol, groupsRaw, bench, testResults) => {
    const names = new Set();
    if (Array.isArray(pol?.['policy-groups'])) pol['policy-groups'].forEach((n) => names.add(n));
    if (Array.isArray(pol?.policyGroups)) pol.policyGroups.forEach((n) => names.add(n));

    const details = indexGroupDetails(groupsRaw);
    entriesOf(groupsRaw).forEach((entry) => {
      if (entry && typeof entry === 'object') {
        const n = entry.name || entry.group || entry.group_name;
        if (n) { names.add(n); if (!details[n]) details[n] = entry; }
      }
    });

    const lineHashByName = {};
    const scan = (obj, depth = 0) => {
      if (!obj || depth > 6) return;
      if (Array.isArray(obj)) { obj.forEach((x) => scan(x, depth + 1)); return; }
      if (typeof obj !== 'object') return;
      if (obj.name && (obj.lineHash || obj.identifier)) {
        lineHashByName[obj.name] = obj.lineHash || obj.identifier;
      }
      Object.values(obj).forEach((v) => { if (v && typeof v === 'object') scan(v, depth + 1); });
    };
    scan(groupsRaw);
    scan(pol);

    const benchmark = bench && typeof bench === 'object' ? bench : {};
    const test = testResults && typeof testResults === 'object' ? testResults : {};

    const groups = [...names].map((name) => {
      const detail = details[name] || {};
      const members = extractMembers(detail);
      const type = String(detail.type || detail.typeDescription || detail.policyType || detail.groupType || 'group').toLowerCase();
      const selected = detail.selected || detail.policy || detail.now || detail.current || detail['selected-policy'] || null;

      const normalizedMembers = members.map((m) => {
        const memberName = typeof m === 'string' ? m : (m.name || m.policy || m.policyName || m);
        const lineHash = (typeof m === 'object' && (m.lineHash || m.identifier)) || lineHashByName[memberName] || null;
        const score = lineHash ? benchmark[lineHash] : null;
        let ms = score ? Number(score.lastTestScoreInMS) : null;
        let error = score?.lastTestErrorMessage || null;
        if (ms === 0 && error) ms = -1;
        return {
          name: memberName,
          ms: Number.isFinite(ms) ? ms : null,
          error,
          avoided: !!(typeof m === 'object' && (m.avoided || m['avoid'])),
          lineHash,
          typeDescription: typeof m === 'object' ? (m.typeDescription || m.type || null) : null,
        };
      });

      return { name, type, selected, members: normalizedMembers, detail };
    });

    if (!groups.length && Array.isArray(pol?.proxies)) {
      groups.push({
        name: '独立节点', type: 'select', selected: null,
        members: pol.proxies.map((name) => {
          const lh = lineHashByName[name];
          const score = lh ? benchmark[lh] : null;
          return {
            name,
            ms: score ? Number(score.lastTestScoreInMS) : null,
            error: score?.lastTestErrorMessage || null,
            typeDescription: name === 'DIRECT' ? 'Direct' : name === 'REJECT' ? 'Reject' : 'Proxy',
          };
        }),
      });
    }

    return groups;
  };

  const entriesOf = (raw) => {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (raw.groups && typeof raw.groups === 'object' && !Array.isArray(raw.groups)) return entriesOf(raw.groups);
    if (raw['policy-groups'] && typeof raw['policy-groups'] === 'object' && !Array.isArray(raw['policy-groups'])) return entriesOf(raw['policy-groups']);
    if (Array.isArray(raw.groups)) return raw.groups;
    if (Array.isArray(raw['policy-groups'])) return raw['policy-groups'];
    return Object.entries(raw).map(([k, v]) => {
      if (Array.isArray(v)) return { name: k, policies: v };
      if (v && typeof v === 'object') return { name: k, ...v };
      return { name: k, value: v };
    });
  };

  const indexGroupDetails = (raw) => {
    const out = {};
    entriesOf(raw).forEach((entry) => {
      if (!entry) return;
      if (typeof entry === 'string') { out[entry] = {}; return; }
      const n = entry.name || entry.group || entry.group_name;
      if (n) out[n] = entry;
    });
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      Object.entries(raw).forEach(([k, v]) => {
        if (v && typeof v === 'object' && !out[k]) out[k] = { name: k, ...v };
      });
    }
    return out;
  };

  const extractMembers = (detail) => {
    if (!detail || typeof detail !== 'object') return [];
    const keys = ['policies', 'options', 'members', 'candidates', 'proxies', 'items', 'list', 'policy-list', 'policies-list'];
    for (const k of keys) {
      if (Array.isArray(detail[k])) return detail[k];
      if (detail[k] && typeof detail[k] === 'object') {
        const values = Object.values(detail[k]);
        if (values.length && values.every((v) => typeof v === 'string' || (v && typeof v === 'object'))) return values;
      }
    }
    if (Array.isArray(detail.value)) return detail.value;
    return [];
  };

  const pickTestResult = (test, groupName, memberName) => {
    const g = test?.[groupName];
    if (!g) return null;
    if (Array.isArray(g)) {
      const hit = g.find((x) => x && (x.name === memberName || x.policy === memberName));
      if (!hit) return null;
      const v = hit.lastTestScoreInMS ?? hit.score ?? hit.delay ?? hit.latency;
      return v === undefined ? null : Number(v);
    }
    if (typeof g === 'object') {
      const v = g[memberName];
      if (v === undefined) return null;
      if (typeof v === 'number') return v;
      const n = v?.lastTestScoreInMS ?? v?.score ?? v?.delay ?? v?.latency;
      return n === undefined ? null : Number(n);
    }
    return null;
  };

  /* ------------------------------------------------------------------ */
  /* Render: shell                                                       */
  /* ------------------------------------------------------------------ */

  const PAGE_META = {
    overview: { title: '概览', eyebrow: 'NETWORK TOOLBOX' },
    traffic: { title: '实时统计', eyebrow: 'LIVE TRAFFIC' },
    policies: { title: '策略', eyebrow: 'POLICIES & LATENCY' },
    requests: { title: '请求', eyebrow: 'LIVE TRAFFIC' },
    dns: { title: 'DNS', eyebrow: 'DNS CACHE' },
    resources: { title: '资源', eyebrow: 'EXTERNAL RESOURCES' },
    settings: { title: '设置', eyebrow: 'ENGINE & CONNECTION' },
  };

  const updateConnectionUI = () => {
    const dot = $('#conn-dot');
    const label = $('#conn-label');
    const sub = $('#conn-sub');
    const chip = $('#platform-text');
    const banner = $('#demo-banner');
    if (!dot) return;
    dot.className = 'status-dot';
    if (state.connected) {
      dot.classList.add('on');
      label.textContent = '已连接';
      sub.textContent = `${state.device.name} · ${state.device.platform} ${state.device.version}`.trim();
      chip.textContent = `${state.device.platform} ${state.device.version}`.trim() || 'connected';
      banner.hidden = true;
    } else {
      label.textContent = '演示模式';
      sub.textContent = '未连接 Surge';
      chip.textContent = 'demo';
      banner.hidden = false;
    }
    const foot = $('#foot-status');
    if (foot) foot.textContent = state.lastUpdated ? `最后更新 ${state.lastUpdated.toLocaleTimeString('zh-CN', { hour12: false })}` : (state.connected ? '已连接' : '等待连接');
  };

  const render = () => {
    const meta = PAGE_META[state.view] || PAGE_META.overview;
    const prevProfile = state.view === 'settings' ? document.querySelector('pre.profile') : null;
    const prevProfileText = prevProfile?.textContent || '';
    const prevProfileScroll = prevProfile?.scrollTop || 0;
    $('#page-title').textContent = meta.title;
    $('#page-eyebrow').textContent = meta.eyebrow;
    $$('.nav-item').forEach((a) => a.classList.toggle('active', a.dataset.nav === state.view));
    const view = $('#view');
    const html = state.view === 'policies' ? renderPolicies()
      : state.view === 'requests' ? renderRequests()
      : state.view === 'dns' ? renderDns()
      : state.view === 'traffic' ? renderTraffic()
      : state.view === 'resources' ? renderResources()
      : state.view === 'settings' ? renderSettings()
      : renderOverview();
    view.innerHTML = html;
    if (prevProfileText) {
      const nextProfile = document.querySelector('pre.profile');
      if (nextProfile && nextProfile.textContent === prevProfileText) nextProfile.scrollTop = prevProfileScroll;
    }
    bindView();
    const count = $('#nav-policy-count');
    if (count) count.textContent = state.data.groups.length ? String(state.data.groups.length) : '—';
    const activeDot = $('#nav-active-dot');
    if (activeDot) activeDot.hidden = !(state.data.active && state.data.active.length);
    const dnsCount = $('#nav-dns-count');
    if (dnsCount) dnsCount.textContent = state.data.dns?.dynamic?.length ? String(state.data.dns.dynamic.length) : '—';
    updateConnectionUI();
  };

  /* ------------------------------------------------------------------ */
  /* Render: overview                                                    */
  /* ------------------------------------------------------------------ */

  const renderGroupOverview = (groups) => {
    const shown = groups.slice(0, 8);
    return `<div class="group-list">${shown.map((g) => {
      const vals = g.members.map((m) => m.ms).filter((v) => typeof v === 'number' && v >= 0);
      const best = vals.length ? Math.min(...vals) : null;
      const selectedMember = g.selected ? g.members.find((m) => m.name === g.selected) : null;
      const value = selectedMember ? (typeof selectedMember.ms === 'number' ? selectedMember.ms : null) : best;
      const source = selectedMember ? '当前节点延迟' : '最佳节点延迟';
      return `<a class="group-row" href="#/policies" data-action="focus-group" data-group="${esc(g.name)}" title="查看 ${esc(g.name)}">
        <span class="type-badge ${esc(g.type)}">${esc(typeLabel(g.type))}</span>
        <span class="group-row-main">
          <b>${esc(g.name)}</b>
          <span>${g.selected ? `当前 ${esc(g.selected)}` : `${g.members.length} 个节点`}</span>
        </span>
        <span class="group-row-count">${g.members.length} 节点</span>
        <span class="group-row-best lat-num ${latencyTone(value)}" title="${source}">${value === null ? '—' : fmtMs(value)}</span>
      </a>`;
    }).join('')}</div>`;
  };

  const eventLevel = (type) => {
    const t = typeof type === 'string' ? type.toLowerCase() : type;
    if (t === 2 || t === 'error') return 'error';
    if (t === 1 || t === 'warn' || t === 'warning') return 'warn';
    return 'info';
  };
  const eventTime = (date) => {
    const d = typeof date === 'number'
      ? new Date(date > 1e12 ? date : date * 1000)
      : new Date(date);
    if (!Number.isNaN(d.getTime())) return d.toLocaleString('zh-CN', { hour12: false });
    return String(date || '');
  };
  const renderEvents = (events) => events.slice(0, 8).map((e) => {
    const level = eventLevel(e.type);
    return `<div class="event-row">
      <div class="event-text">${esc(e.content || e.message || '')}</div>
      <div class="event-meta"><span class="event-badge ${level}">${level}</span><span class="event-time">${esc(eventTime(e.date))}</span></div>
    </div>`;
  }).join('');

  const renderOverview = () => {
    const d = state.data;
    const active = d.active || [];
    const recent = d.recent || [];
    const events = d.events || [];
    const resources = d.resources || [];
    const recentBytes = recent.reduce((n, r) => n + (Number(r.inBytes) || 0) + (Number(r.outBytes) || 0), 0);
    const resourceErrors = resources.filter((r) => r.error || r.ready === false).length;
    const featureList = [
      { key: 'mitm', name: 'HTTPS 解密', desc: 'MITM', icon: 'lock' },
      { key: 'rewrite', name: '请求重写', desc: 'Rewrite', icon: 'shuffle' },
      { key: 'scripting', name: '脚本', desc: 'Scripting', icon: 'code' },
      { key: 'capture', name: '抓包', desc: 'Capture', icon: 'record' },
    ];
    const latency = state.apiLatency;
    const latencyLabel = latency === null ? '—' : latency < 0 ? '超时' : latency < 100 ? '良好' : latency < 250 ? '一般' : '偏慢';
    const ringPct = latency === null || latency < 0 ? 0 : clamp(100 - latency / 5, 15, 100);
    const ringDash = 2 * Math.PI * 40;

    return `
      <div class="hero">
        <div class="card hero-main">
          <div class="hero-top">
            <div>
              <div class="eyebrow">CONNECTED DEVICE</div>
              <h2 class="device-name">${esc(state.device.name)}</h2>
              <div class="device-meta">
                <span class="tag green"><span class="status-dot on" style="width:6px;height:6px"></span>运行中</span>
                <span class="tag cyan">${esc(state.device.platform)}</span>
                <span class="tag">v${esc(state.device.version || '—')}${state.device.build ? ` · ${esc(state.device.build)}` : ''}</span>
                <span class="tag amber">${state.demo ? '演示数据' : 'HTTP API'}</span>
              </div>
            </div>
            <div class="row">
              <button class="btn btn-ghost btn-sm" data-action="refresh">刷新</button>
            </div>
          </div>
          <div class="hero-kpis">
            <div class="kpi">
              <div class="kpi-label">下载</div>
              <div class="kpi-value down" id="kpi-down">${fmtSpeed(state.traffic.down || 0)}</div>
              <div class="kpi-sub">当前速度</div>
            </div>
            <div class="kpi">
              <div class="kpi-label">上传</div>
              <div class="kpi-value up" id="kpi-up">${fmtSpeed(state.traffic.up || 0)}</div>
              <div class="kpi-sub">当前速度</div>
            </div>
            <div class="kpi">
              <div class="kpi-label">总计</div>
              <div class="kpi-value" id="kpi-total">${fmtBytes((state.traffic.totalIn || 0) + (state.traffic.totalOut || 0))}</div>
              <div class="kpi-sub">累计流量</div>
            </div>
          </div>
          <div>
            <div class="spread mb-8">
              <span class="faint" style="font-size:10.5px;letter-spacing:.05em">出站模式</span>
              <span class="mono faint" style="font-size:10px">${state.demo ? 'DEMO' : 'LIVE'}</span>
            </div>
            <div class="segmented" role="group" aria-label="出站模式">
              ${['rule', 'proxy', 'direct'].map((m) => `
                <button class="seg ${d.outbound === m ? 'active' : ''}" data-action="outbound" data-mode="${m}">
                  ${m === 'rule' ? '规则' : m === 'proxy' ? '全局代理' : '直连'}
                </button>`).join('')}
            </div>
          </div>
        </div>

        <div class="card hero-side">
          <div class="status-large">
            <span class="dot"></span>
            <div class="status-copy">
              <strong>${state.connected ? '引擎在线' : '演示预览'}</strong>
              <span>${state.connected ? 'Surge 运行正常' : '当前为本地演示数据'}</span>
            </div>
            <span class="status-time">${state.lastUpdated ? state.lastUpdated.toLocaleTimeString('zh-CN', { hour12: false }) : '—'}</span>
          </div>
          <div class="ring-wrap">
            <div class="ring">
              <svg viewBox="0 0 100 100">
                <defs>
                  <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stop-color="#34d399"/><stop offset="100%" stop-color="#22d3ee"/>
                  </linearGradient>
                </defs>
                <circle class="track" cx="50" cy="50" r="40" fill="none" stroke-width="7"/>
                <circle class="bar" cx="50" cy="50" r="40" fill="none" stroke-width="7"
                  stroke-dasharray="${ringDash}" stroke-dashoffset="${ringDash * (1 - ringPct / 100)}"/>
              </svg>
              <div class="ring-label">${latency === null ? '—' : latency < 0 ? '超时' : `${latency}<span style="font-size:9px;color:var(--faint)">ms</span>`}</div>
            </div>
            <div class="ring-meta">
              <div class="ring-title"><b>API 响应</b><span class="latency-badge ${latencyTone(latency)}">${latencyLabel}</span></div>
              <span>最近一次 /v1/environment</span>
              <span>${state.device.platform} ${state.device.version}</span>
            </div>
          </div>
          <div class="engine-stats">
            <div class="engine-stat"><span>引擎内存</span><b>${d.metrics?.mem ? fmtBytes(d.metrics.mem) : '—'}</b></div>
            <div class="engine-stat"><span>运行时长</span><b>${d.metrics?.uptime ? fmtUptime(d.metrics.uptime) : '—'}</b></div>
            <div class="engine-stat"><span>资源异常</span><b class="${resourceErrors ? 'bad' : ''}">${resourceErrors}</b></div>
          </div>
        </div>
      </div>

      <div class="section-head">
        <h2>功能开关</h2>
        <span class="muted">直接写入 Surge 运行状态</span>
      </div>
      <div class="feature-grid">
        ${featureList.map((f) => `
          <div class="feature">
            <div class="feature-main">
              <div class="feature-icon">${icon(f.icon)}</div>
              <div>
                <div class="feature-name">${f.name}</div>
                <div class="feature-state">${f.desc} · ${d.features[f.key] ? 'ON' : 'OFF'}</div>
              </div>
            </div>
            <label class="switch">
              <input type="checkbox" data-feature="${f.key}" ${d.features[f.key] ? 'checked' : ''}/>
              <span class="track"></span><span class="thumb"></span>
            </label>
          </div>`).join('')}
      </div>

      <div class="section-head">
        <h2>事件</h2>
        <span class="faint" style="font-size:10px">最近 ${Math.min(events.length, 8)} 条</span>
      </div>
      ${events.length ? `<div class="card events-card">${renderEvents(events)}</div>` : `<div class="empty">暂无事件</div>`}

      <div class="section-head">
        <h2>最近请求</h2>
        <a class="btn btn-ghost btn-sm" href="#/requests">查看全部 →</a>
      </div>
      <div class="card">
        ${recent.length ? renderRequestTable(recent.slice(0, 6), false) : `<div class="empty">暂无请求记录</div>`}
      </div>
    `;
  };

  /* ------------------------------------------------------------------ */
  /* Render: policies                                                    */
  /* ------------------------------------------------------------------ */

  const splitGroups = (groups) => {
    const cols = [[], []];
    groups.forEach((g, i) => cols[i % 2].push(g));
    return cols;
  };

  const renderPolicies = () => {
    const groups = state.data.groups || [];
    const q = (state.policyQuery || '').toLowerCase();
    const filtered = q
      ? groups.map((g) => ({ ...g, members: g.members.filter((m) => m.name.toLowerCase().includes(q)) })).filter((g) => g.name.toLowerCase().includes(q) || g.members.length)
      : groups;
    const collapsedCount = filtered.filter((g) => !isGroupExpanded(g)).length;
    const isMobile = window.matchMedia('(max-width: 860px)').matches;
    const layout = isMobile ? 'single' : (state.policyLayout === 'single' ? 'single' : 'double');
    const columns = layout === 'single' ? [filtered] : splitGroups(filtered);
    return `
      <div class="policy-toolbar">
        <div class="search">
          ${icon('search')}
          <input id="policy-search" placeholder="搜索策略组或节点…" value="${esc(state.policyQuery || '')}" />
        </div>
        <div class="segmented policy-layout-toggle" style="max-width:132px;grid-template-columns:1fr 1fr">
          <button class="seg ${layout === 'double' ? 'active' : ''}" data-action="policy-layout" data-layout="double">双列</button>
          <button class="seg ${layout === 'single' ? 'active' : ''}" data-action="policy-layout" data-layout="single">单列</button>
        </div>
        <button class="btn btn-ghost btn-sm" data-action="test-all">测试全部</button>
        <button class="btn btn-ghost btn-sm" data-action="expand-all">全部展开</button>
        <button class="btn btn-ghost btn-sm" data-action="collapse-all">全部折叠</button>
        <button class="btn btn-ghost btn-sm" data-action="refresh">刷新</button>
      </div>
      ${filtered.length ? `
        <div class="policy-grid ${layout === 'single' ? 'single' : ''}">
          ${columns.map((col) => `<div class="policy-col">${col.map((g) => renderGroupCard(g, false, true)).join('')}</div>`).join('')}
        </div>` : `<div class="empty">没有匹配的策略组</div>`}
      ${collapsedCount ? `<div class="faint" style="font-size:10px;text-align:right;margin-top:-6px">${collapsedCount} 个组已折叠</div>` : ''}
    `;
  };

  const renderGroupCard = (g, compact, collapsible = false) => {
    const members = compact ? g.members.slice(0, 4) : g.members;
    const canSelect = ['select', 'manual', 'group'].includes(g.type) || g.type.includes('select');
    const expanded = !collapsible || isGroupExpanded(g);
    return `
      <div class="card policy-card ${expanded ? '' : 'collapsed'}">
        <div class="policy-head ${collapsible ? 'collapsible' : ''}"
             ${collapsible ? `data-action="toggle-group" data-group="${esc(g.name)}" aria-expanded="${expanded}"` : ''}>
          <div class="policy-title">
            <span class="type-badge ${esc(g.type)}">${esc(typeLabel(g.type))}</span>
            <div class="policy-title-text">
              <h3 title="${esc(g.name)}">${esc(g.name)}</h3>
              <div class="policy-summary">${g.members.length} 个节点${g.selected ? ` · 当前 ${esc(g.selected)}` : ''}</div>
            </div>
          </div>
          <div class="policy-actions">
            <button class="icon-btn" title="测试该组" data-action="test-group" data-group="${esc(g.name)}">${icon('zap')}</button>
            ${collapsible ? `<span class="chevron" aria-hidden="true">${icon('chevron')}</span>` : ''}
          </div>
        </div>
        <div class="members-wrap">
          <div class="members">
            ${members.length ? members.map((m) => renderMember(g, m, canSelect)).join('') : `<div class="empty" style="padding:16px;margin:0 8px 8px">API 未返回成员列表</div>`}
            ${compact && g.members.length > 4 ? `<div class="faint" style="font-size:10px;padding:6px 12px">还有 ${g.members.length - 4} 个节点…</div>` : ''}
          </div>
        </div>
      </div>`;
  };

  const renderMember = (g, m, canSelect) => {
    const tone = latencyTone(m.ms);
    const selected = g.selected === m.name;
    const pct = m.ms === null || m.ms < 0 ? 0 : clamp((m.ms / 500) * 100, 6, 100);
    return `
      <div class="member ${selected ? 'selected' : ''} ${canSelect ? 'clickable' : ''}"
           ${canSelect ? `data-action="select-member" data-group="${esc(g.name)}" data-policy="${esc(m.name)}"` : ''}>
        <span class="member-radio" style="${canSelect ? '' : 'opacity:.25'}"></span>
        <span class="member-name" title="${esc(m.name)}">${esc(m.name)}</span>
        <span class="node-type ${nodeTypeClass(m)}" title="${esc(m.typeDescription || '')}">${esc(nodeTypeLabel(m))}</span>
        ${m.avoided ? `<span class="member-avoid">AVOID</span>` : ''}
        <span class="lat">
          <span class="lat-bar"><i class="${tone === 'good' ? '' : tone === 'warn' ? 'warn' : 'bad'}" style="width:${pct}%"></i></span>
          <span class="lat-num ${tone}" title="${esc(m.error || '')}">${fmtMs(m.ms)}</span>
        </span>
      </div>`;
  };

  /* ------------------------------------------------------------------ */
  /* Render: requests                                                    */
  /* ------------------------------------------------------------------ */

  const renderRequests = () => {
    const tab = state.requestTab || 'recent';
    const list = tab === 'active' ? (state.data.active || []) : (state.data.recent || []);
    const q = (state.requestQuery || '').toLowerCase();
    const filtered = q ? list.filter((r) => `${r.URL || ''} ${requestPolicy(r)} ${r.rule || ''} ${r.method || ''}`.toLowerCase().includes(q)) : list;
    return `
      <div class="policy-toolbar">
        <div class="segmented" style="max-width:260px;grid-template-columns:1fr 1fr">
          <button class="seg ${tab === 'recent' ? 'active' : ''}" data-action="request-tab" data-tab="recent">最近</button>
          <button class="seg ${tab === 'active' ? 'active' : ''}" data-action="request-tab" data-tab="active">活动 ${state.data.active?.length ? `(${state.data.active.length})` : ''}</button>
        </div>
        <div class="search">
          ${icon('search')}
          <input id="request-search" placeholder="过滤 URL / 策略 / 规则…" value="${esc(state.requestQuery || '')}" />
        </div>
        <button class="btn btn-ghost btn-sm" data-action="refresh">刷新</button>
      </div>
      <div class="card">
        ${filtered.length ? `${renderRequestTable(filtered, tab === 'active')}${renderRequestCards(filtered, tab === 'active')}` : `<div class="empty">${tab === 'active' ? '当前没有活动请求' : '暂无请求记录'}</div>`}
      </div>
    `;
  };

  const renderRequestTable = (list, showKill) => `
    <div class="table-wrap desktop-only">
      <table class="req">
        <thead>
          <tr>
            <th>时间</th><th>方法</th><th>主机 / URL</th><th>状态</th><th>策略</th><th>规则</th><th>耗时</th><th>流量</th>${showKill ? '<th></th>' : ''}
          </tr>
        </thead>
        <tbody>
          ${list.map((r) => {
            const kind = statusKind(r);
            const dur = r.completed && r.completedDate && r.startDate ? (r.completedDate - r.startDate) * 1000 : null;
            const method = String(r.method || '—').toUpperCase();
            const mcls = ['GET', 'POST', 'CONNECT'].includes(method) ? method : 'OTHER';
            return `<tr class="req-row" data-action="request-detail" data-id="${esc(r.id)}" title="查看请求详情">
              <td class="cell-time">${fmtTime(r.startDate)}</td>
              <td><span class="method ${mcls}">${esc(method)}</span></td>
              <td class="cell-host"><b>${esc(hostOf(r.URL))}</b><span>${esc(pathOf(r.URL))}</span></td>
              <td><span class="status-pill ${kind}">${esc(statusText(r))}</span></td>
              <td><span class="policy-pill" title="${esc(requestPolicy(r))}">${esc(requestPolicy(r))}</span></td>
              <td><span class="policy-pill" title="${esc(r.rule || '')}">${esc(r.rule || '—')}</span></td>
              <td class="num">${dur === null ? '—' : fmtMs(dur)}</td>
              <td class="num">${fmtBytes((Number(r.inBytes) || 0) + (Number(r.outBytes) || 0))}</td>
              ${showKill ? `<td class="row-actions"><button class="btn btn-danger btn-sm" data-action="kill" data-id="${esc(r.id)}">结束</button></td>` : ''}
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;

  const renderRequestCards = (list, showKill) => {
    if (!list.length) return '';
    return `<div class="mobile-only"><div class="mobile-cards">${list.map((r) => {
      const kind = statusKind(r);
      const dur = r.completed && r.completedDate && r.startDate ? (r.completedDate - r.startDate) * 1000 : null;
      const method = String(r.method || '—').toUpperCase();
      const mcls = ['GET', 'POST', 'CONNECT'].includes(method) ? method : 'OTHER';
      return `<div class="mobile-request-card" data-action="request-detail" data-id="${esc(r.id)}" title="查看请求详情">
        <div class="mrc-head">
          <span class="method ${mcls}">${esc(method)}</span>
          <span class="mrc-host">${esc(hostOf(r.URL))}</span>
          <span class="status-pill ${kind}">${esc(statusText(r))}</span>
        </div>
        <div class="mrc-path">${esc(pathOf(r.URL))}</div>
        <div class="mrc-meta">
          <span>${esc(fmtTime(r.startDate))}</span>
          <span>${dur === null ? '—' : esc(fmtMs(dur))}</span>
          <span>${esc(fmtBytes((Number(r.inBytes) || 0) + (Number(r.outBytes) || 0)))}</span>
        </div>
        <div class="mrc-policy">
          <span class="policy-pill" title="${esc(requestPolicy(r))}">${esc(requestPolicy(r))}</span>
          <span class="policy-pill" title="${esc(r.rule || '')}">${esc(r.rule || '—')}</span>
        </div>
        ${showKill ? `<div class="mrc-action"><button class="btn btn-danger btn-sm" data-action="kill" data-id="${esc(r.id)}">结束</button></div>` : ''}
      </div>`;
    }).join('')}</div></div>`;
  };

  const isIpAddress = (v) => /^(\d{1,3}\.){3}\d{1,3}$/.test(String(v || '')) || String(v || '').includes(':');

  const requestDetailRow = (label, value) =>
    `<div class="detail-row"><span>${esc(label)}</span><div class="detail-value">${value}</div></div>`;

  const paintRequestDetail = () => {
    const modal = $('#request-modal');
    const panel = $('#req-detail-panel');
    const r = state.requestDetail;
    if (!modal || !panel) return;
    if (!r) { modal.hidden = true; panel.innerHTML = ''; return; }

    const tab = state.requestDetailTab || 'general';
    const method = String(r.method || '—').toUpperCase();
    const mcls = ['GET', 'POST', 'CONNECT'].includes(method) ? method : 'OTHER';
    const kind = statusKind(r);
    const dur = r.completedDate && r.startDate ? (r.completedDate - r.startDate) * 1000 : null;
    const fullDate = r.startDate ? new Date(r.startDate * 1000).toLocaleString('zh-CN', { hour12: false }) : '—';
    const notes = Array.isArray(r.notes) ? r.notes.join('\n') : (r.notes || '');
    const header = typeof r.requestHeader === 'string'
      ? r.requestHeader
      : (r.requestHeader ? JSON.stringify(r.requestHeader, null, 2) : '');
    const timing = Array.isArray(r.timingRecords)
      ? r.timingRecords
      : Object.entries(r.timingRecords || r.timing || {}).map(([name, v]) => ({
          name,
          durationInMillisecond: typeof v === 'number' ? v : (v && v.durationInMillisecond),
        }));

    const general = `
      <div class="detail-group">
        ${requestDetailRow('URL', `<code class="detail-break">${esc(r.URL || '—')}</code>`)}
        ${requestDetailRow('日期', esc(fullDate))}
        ${requestDetailRow('状态', `<span class="status-pill ${kind}">${esc(statusText(r))}</span>`)}
        ${requestDetailRow('时长', dur === null ? '—' : esc(fmtMs(dur)))}
        ${r.processPath ? requestDetailRow('进程', `<span class="mono">${esc(r.processPath)}${r.pid ? ` (${r.pid})` : ''}</span>`) : ''}
      </div>
      <div class="detail-group">
        ${requestDetailRow('策略', esc(requestPolicy(r)))}
        ${requestDetailRow('规则', esc(r.rule || '—'))}
      </div>
      ${(r.localAddress || r.remoteAddress) ? `<div class="detail-group">
        ${r.localAddress ? requestDetailRow('本地 IP', `<span class="mono">${esc(r.localAddress)}</span>`) : ''}
        ${r.remoteAddress ? requestDetailRow('远程 IP', `<span class="mono">${esc(r.remoteAddress)}</span>${isIpAddress(r.remoteAddress) ? ` <button class="ip-chip" data-action="dns-ip" data-ip="${esc(r.remoteAddress)}">GeoIP</button>` : ''}`) : ''}
      </div>` : ''}
      <div class="detail-group">
        ${requestDetailRow('下载', esc(fmtBytes(r.inBytes || 0)))}
        ${requestDetailRow('上传', esc(fmtBytes(r.outBytes || 0)))}
      </div>
      <div class="detail-group">
        <div class="detail-label">备注</div>
        <pre class="detail-notes">${esc(notes || '无备注')}</pre>
      </div>
      ${kind === 'active' && method !== 'UDP' ? `<div class="detail-actions"><button class="btn btn-danger btn-sm" data-action="kill" data-id="${esc(r.id)}">结束连接</button></div>` : ''}
    `;

    const requestTab = header
      ? `<div class="detail-group"><pre class="detail-code">${esc(header)}</pre></div>`
      : `<div class="empty" style="padding:24px">未开启 HTTP Capture，或该请求没有请求头数据。</div>`;

    const timingTab = timing.length
      ? `<div class="detail-group">${timing.map((t) => requestDetailRow(t.name || '—', `${esc(t.durationInMillisecond ?? '—')} ms`)).join('')}</div>`
      : `<div class="empty" style="padding:24px">没有计时数据。</div>`;

    panel.innerHTML = `
      <div class="req-detail-head">
        <div class="req-detail-title">
          <span class="method ${mcls}">${esc(method)}</span>
          <div>
            <div class="eyebrow">REQUEST DETAIL</div>
            <h2 id="req-detail-title">${esc(hostOf(r.URL))}</h2>
            <div class="req-detail-url">${esc(r.URL || '—')}</div>
          </div>
        </div>
        <button class="icon-btn" data-action="close-request-detail" aria-label="关闭">${icon('close')}</button>
      </div>
      <div class="req-tabs">
        ${['general', 'request', 'timing'].map((t) => `
          <button class="req-tab ${tab === t ? 'active' : ''}" data-action="request-detail-tab" data-tab="${t}">
            ${t === 'general' ? '一般' : t === 'request' ? '请求' : '计时'}
          </button>`).join('')}
      </div>
      <div class="req-detail-body">${tab === 'request' ? requestTab : tab === 'timing' ? timingTab : general}</div>
    `;
    modal.hidden = false;
  };

  const openRequestDetail = (id) => {
    const all = [...(state.data.recent || []), ...(state.data.active || [])];
    const r = all.find((x) => String(x.id) === String(id));
    if (!r) { showToast('请求已失效', '列表可能已经刷新', 'warn'); return; }
    state.requestDetail = r;
    state.requestDetailTab = 'general';
    paintRequestDetail();
  };

  const closeRequestDetail = () => {
    state.requestDetail = null;
    const modal = $('#request-modal');
    if (modal) modal.hidden = true;
  };

  /* ------------------------------------------------------------------ */
  /* Render: realtime traffic                                            */
  /* ------------------------------------------------------------------ */

  const trafficChartSVG = () => {
    const h = state.traffic.history || [];
    if (h.length < 2) return '<div class="traffic-chart-empty">采集实时数据中…</div>';
    const W = 900, H = 180, P = 12;
    const max = Math.max(1, ...h.map((p) => Math.max(p.down, p.up)));
    const x = (i) => (i / (h.length - 1)) * W;
    const y = (v) => H - P - (v / max) * (H - P * 2);
    const down = h.map((p, i) => `${x(i).toFixed(1)},${y(p.down).toFixed(1)}`).join(' ');
    const up = h.map((p, i) => `${x(i).toFixed(1)},${y(p.up).toFixed(1)}`).join(' ');
    return `<svg class="traffic-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      <defs>
        <linearGradient id="trafficDownFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#22d3ee" stop-opacity=".24"/>
          <stop offset="100%" stop-color="#22d3ee" stop-opacity="0"/>
        </linearGradient>
        <linearGradient id="trafficUpFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#34d399" stop-opacity=".16"/>
          <stop offset="100%" stop-color="#34d399" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <g class="traffic-grid">
        <line x1="0" y1="${P}" x2="${W}" y2="${P}"/>
        <line x1="0" y1="${H / 2}" x2="${W}" y2="${H / 2}"/>
        <line x1="0" y1="${H - P}" x2="${W}" y2="${H - P}"/>
      </g>
      <polygon points="0,${H} ${down} ${W},${H}" fill="url(#trafficDownFill)"/>
      <polygon points="0,${H} ${up} ${W},${H}" fill="url(#trafficUpFill)"/>
      <polyline points="${down}" fill="none" stroke="#22d3ee" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
      <polyline points="${up}" fill="none" stroke="#34d399" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
      <text x="6" y="16" class="traffic-chart-label">${esc(fmtSpeed(max))}</text>
    </svg>`;
  };

  const trafficRows = (list) => {
    if (!list.length) return '<tr><td colspan="6"><div class="empty" style="padding:22px">暂无数据</div></td></tr>';
    return list.map((x, i) => `
      <tr>
        <td class="cell-host"><span class="traffic-name"><span class="traffic-dot" style="background:hsl(${(i * 47) % 360} 72% 58%)"></span><b>${esc(x.name)}</b></span></td>
        <td class="num">${fmtBytes(x.out)}</td>
        <td class="num">${fmtBytes(x.in)}</td>
        <td class="num">${fmtBytes(x.in + x.out)}</td>
        <td class="num"><span class="speed-cell"><span class="sp up">↑ ${fmtSpeed(x.outCurrentSpeed)}</span><span class="sp down">↓ ${fmtSpeed(x.inCurrentSpeed)}</span></span></td>
        <td class="num"><span class="speed-cell"><span class="sp up">↑ ${fmtSpeedMax(x.outMaxSpeed)}</span><span class="sp down">↓ ${fmtSpeedMax(x.inMaxSpeed)}</span></span></td>
      </tr>`).join('');
  };

  const trafficMobileCards = (list) => {
    if (!list.length) return '<div class="empty" style="padding:22px">暂无数据</div>';
    return `<div class="mobile-cards">${list.map((x, i) => `
      <div class="mobile-data-card">
        <div class="mdc-head">
          <span class="traffic-name"><span class="traffic-dot" style="background:hsl(${(i * 47) % 360} 72% 58%)"></span><b>${esc(x.name)}</b></span>
          <span class="mdc-total">${fmtBytes(x.in + x.out)}</span>
        </div>
        <div class="mdc-grid">
          <div><span>上传</span><b>${fmtBytes(x.out)}</b></div>
          <div><span>下载</span><b>${fmtBytes(x.in)}</b></div>
          <div><span>当前 ↑</span><b>${fmtSpeed(x.outCurrentSpeed)}</b></div>
          <div><span>当前 ↓</span><b>${fmtSpeed(x.inCurrentSpeed)}</b></div>
          <div><span>峰值 ↑</span><b>${fmtSpeedMax(x.outMaxSpeed)}</b></div>
          <div><span>峰值 ↓</span><b>${fmtSpeedMax(x.inMaxSpeed)}</b></div>
        </div>
      </div>`).join('')}</div>`;
  };

  const trafficHeroHTML = () => {
    const t = state.traffic;
    const start = t.startTime ? new Date(t.startTime * 1000) : null;
    const uptime = start ? Math.max(0, Date.now() / 1000 - t.startTime) : 0;
    return `
      <div class="traffic-hero-main">
        <div class="eyebrow">REAL-TIME TRAFFIC</div>
        <div class="traffic-speed-row">
          <div class="traffic-speed down traffic-stat-card"><span>↓ 下载</span><b>${fmtSpeed(t.down)}</b></div>
          <div class="traffic-speed up traffic-stat-card"><span>↑ 上传</span><b>${fmtSpeed(t.up)}</b></div>
          <div class="traffic-total traffic-stat-card"><span>总流量</span><b>${fmtBytes(t.totalIn + t.totalOut)}</b></div>
        </div>
        <div class="traffic-chart-wrap">${trafficChartSVG()}</div>
      </div>
      <div class="traffic-side">
        <div class="traffic-kv"><span>开启时间</span><b>${start ? start.toLocaleString('zh-CN', { hour12: false }) : '—'}</b></div>
        <div class="traffic-kv"><span>运行时长</span><b>${fmtUptime(uptime)}</b></div>
        <div class="traffic-kv"><span>上传 / 下载</span><b>${fmtBytes(t.totalOut)} / ${fmtBytes(t.totalIn)}</b></div>
        <div class="traffic-kv"><span>峰值 ↑ / ↓</span><b>${fmtSpeedMax(t.maxUp)} / ${fmtSpeedMax(t.maxDown)}</b></div>
        <div class="traffic-legend"><span class="lg down">下载</span><span class="lg up">上传</span></div>
      </div>`;
  };

  const trafficSortValue = {
    name: (x) => x.name.toLowerCase(),
    out: (x) => x.out,
    in: (x) => x.in,
    total: (x) => x.in + x.out,
    current: (x) => x.outCurrentSpeed + x.inCurrentSpeed,
    max: (x) => x.outMaxSpeed + x.inMaxSpeed,
  };
  const sortTraffic = (list, sort) => {
    const order = Array.isArray(sort) ? sort : [];
    if (!order.length) return [...list];
    return [...list].sort((a, b) => {
      for (const s of order) {
        const get = trafficSortValue[s.id];
        if (!get) continue;
        const av = get(a), bv = get(b);
        const cmp = typeof av === 'string' && typeof bv === 'string'
          ? av.localeCompare(bv)
          : av > bv ? 1 : av < bv ? -1 : 0;
        if (cmp) return s.desc ? -cmp : cmp;
      }
      return 0;
    });
  };
  const trafficTh = (table, key, label) => {
    const sorts = state.trafficSort[table] || [];
    const idx = sorts.findIndex((s) => s.id === key);
    const active = idx >= 0;
    const arrow = active ? (sorts[idx].desc ? '↓' : '↑') : '↕';
    const priority = active && sorts.length > 1 ? `<span class="sort-priority">${idx + 1}</span>` : '';
    return `<th class="sortable ${active ? 'sorted' : ''}" data-action="traffic-sort" data-table="${table}" data-key="${key}" title="点击排序，Shift+点击多列">${label}<span class="sort-ind ${active ? '' : 'faint'}">${arrow}${priority}</span></th>`;
  };

  const trafficSortChips = (table) => {
    const keys = [
      { id: 'total', label: '总计' },
      { id: 'current', label: '当前' },
      { id: 'max', label: '峰值' },
      { id: 'out', label: '上传' },
      { id: 'in', label: '下载' },
      { id: 'name', label: '名称' },
    ];
    const sorts = state.trafficSort[table] || [];
    return `<div class="traffic-sort-bar"><span class="faint">排序</span>${keys.map((k) => {
      const idx = sorts.findIndex((s) => s.id === k.id);
      const active = idx >= 0;
      const arrow = active ? (sorts[idx].desc ? '↓' : '↑') : '';
      return `<button class="sort-chip ${active ? 'active' : ''}" data-action="traffic-sort" data-table="${table}" data-key="${k.id}" title="点击切换排序">${k.label}${arrow ? ` ${arrow}` : ''}</button>`;
    }).join('')}</div>`;
  };

  const renderTraffic = () => {
    const ifaces = sortTraffic(state.traffic.ifaces, state.trafficSort.ifaces);
    const policies = sortTraffic(state.traffic.policies, state.trafficSort.policies);
    return `
      <div class="card traffic-hero" id="traffic-hero">${trafficHeroHTML()}</div>
      <div class="card traffic-card">
        <div class="card-head"><div><h3 class="card-title">网络接口</h3><div class="card-sub">按接口统计；当前/峰值速度来自 /v1/traffic</div></div>${trafficSortChips('ifaces')}</div>
        <div class="table-wrap desktop-only">
          <table class="req traffic-table">
            <thead><tr>${trafficTh('ifaces', 'name', '主机名')}${trafficTh('ifaces', 'out', '上传')}${trafficTh('ifaces', 'in', '下载')}${trafficTh('ifaces', 'total', '总计')}${trafficTh('ifaces', 'current', '当前速度')}${trafficTh('ifaces', 'max', '最高速度')}</tr></thead>
            <tbody id="traffic-ifaces">${trafficRows(ifaces)}</tbody>
          </table>
        </div>
        <div class="mobile-only" id="traffic-ifaces-mobile">${trafficMobileCards(ifaces)}</div>
      </div>
      <div class="card traffic-card">
        <div class="card-head"><div><h3 class="card-title">实时统计</h3><div class="card-sub">策略 / 连接器维度，点击表头排序</div></div>${trafficSortChips('policies')}</div>
        <div class="table-wrap desktop-only">
          <table class="req traffic-table">
            <thead><tr>${trafficTh('policies', 'name', '主机名')}${trafficTh('policies', 'out', '上传')}${trafficTh('policies', 'in', '下载')}${trafficTh('policies', 'total', '总计')}${trafficTh('policies', 'current', '当前速度')}${trafficTh('policies', 'max', '最高速度')}</tr></thead>
            <tbody id="traffic-policies">${trafficRows(policies)}</tbody>
          </table>
        </div>
        <div class="mobile-only" id="traffic-policies-mobile">${trafficMobileCards(policies)}</div>
      </div>
    `;
  };

  const paintTraffic = () => {
    if (state.view !== 'traffic') return;
    const hero = $('#traffic-hero');
    if (hero) hero.innerHTML = trafficHeroHTML();
    const ifaceList = sortTraffic(state.traffic.ifaces, state.trafficSort.ifaces);
    const policyList = sortTraffic(state.traffic.policies, state.trafficSort.policies);
    const ifaces = $('#traffic-ifaces');
    if (ifaces) ifaces.innerHTML = trafficRows(ifaceList);
    const ifacesMobile = $('#traffic-ifaces-mobile');
    if (ifacesMobile) ifacesMobile.innerHTML = trafficMobileCards(ifaceList);
    const policies = $('#traffic-policies');
    if (policies) policies.innerHTML = trafficRows(policyList);
    const policiesMobile = $('#traffic-policies-mobile');
    if (policiesMobile) policiesMobile.innerHTML = trafficMobileCards(policyList);
  };

  const paintOverviewTraffic = () => {
    const down = $('#kpi-down');
    const up = $('#kpi-up');
    const total = $('#kpi-total');
    if (down) down.textContent = fmtSpeed(state.traffic.down || 0);
    if (up) up.textContent = fmtSpeed(state.traffic.up || 0);
    if (total) total.textContent = fmtBytes((state.traffic.totalIn || 0) + (state.traffic.totalOut || 0));
  };

  /* ------------------------------------------------------------------ */
  /* Render: DNS                                                         */
  /* ------------------------------------------------------------------ */

  const dnsAddresses = (v) => {
    if (Array.isArray(v)) return v.filter(Boolean).map(String);
    if (v === undefined || v === null || v === '') return [];
    return [String(v)];
  };

  const renderDns = () => {
    const d = state.data.dns || { dynamic: [], static: [] };
    const tab = state.dnsTab || 'dynamic';
    const list = tab === 'dynamic' ? d.dynamic : d.static;
    const q = (state.dnsQuery || '').trim().toLowerCase();
    const filtered = q
      ? list.filter((r) => `${r.domain || ''} ${r.server || ''} ${dnsAddresses(r.data).join(' ')} ${r.path || ''} ${r.source || ''} ${r.comment || ''}`.toLowerCase().includes(q))
      : list;
    return `
      <div class="policy-toolbar">
        <div class="segmented" style="max-width:300px;grid-template-columns:1fr 1fr">
          <button class="seg ${tab === 'dynamic' ? 'active' : ''}" data-action="dns-tab" data-tab="dynamic">动态记录 ${d.dynamic.length}</button>
          <button class="seg ${tab === 'static' ? 'active' : ''}" data-action="dns-tab" data-tab="static">静态记录 ${d.static.length}</button>
        </div>
        <div class="search">
          ${icon('search')}
          <input id="dns-search" placeholder="搜索域名 / IP / DNS 服务器…" value="${esc(state.dnsQuery || '')}" />
        </div>
        <button class="btn btn-ghost btn-sm" data-action="test-dns">测试 DNS 延迟</button>
        <button class="btn btn-ghost btn-sm" data-action="flush-dns">清理缓存</button>
        <button class="btn btn-ghost btn-sm" data-action="refresh">刷新</button>
      </div>
      <div class="dns-summary">
        <span>${tab === 'dynamic' ? 'DNS 缓存' : '本地静态记录'} · 显示 ${filtered.length} / ${list.length} 条</span>
        <div class="dns-summary-right">
          ${state.data.dnsDelay ? `<span class="dns-delay ${latencyTone(state.data.dnsDelay.ms)}">DNS 延迟 <b>${esc(fmtDnsMs(state.data.dnsDelay.ms))}</b> · ${esc(new Date(state.data.dnsDelay.at).toLocaleTimeString('zh-CN', { hour12: false }))}</span>` : ''}
          ${state.demo ? '<span class="tag amber">演示数据</span>' : ''}
        </div>
      </div>
      <div class="card">
        ${filtered.length ? `<div class="dns-list">${filtered.map((r) => renderDnsRow(r, tab)).join('')}</div>` : `<div class="empty">${q ? '没有匹配的 DNS 记录' : tab === 'dynamic' ? 'DNS 缓存为空' : '没有静态记录'}</div>`}
      </div>
    `;
  };

  const renderDnsRow = (r, tab) => {
    const ips = dnsAddresses(r.data);
    const ipChips = ips.map((ip) => `<button class="ip-chip" data-action="dns-ip" data-ip="${esc(ip)}" title="查看 ${esc(ip)} 的 GeoIP">${esc(ip)}</button>`).join('');
    return `
      <div class="dns-row">
        <div class="dns-main">
          <div class="dns-domain">${esc(r.domain || '—')}</div>
          <div class="dns-meta">
            ${r.server ? `<span class="dns-kv">DNS <b>${esc(r.server)}</b></span>` : ''}
            ${ips.length ? `<span class="dns-kv">结果</span>${ipChips}` : `<span class="dns-kv">结果 <b>N/A</b></span>`}
            ${tab === 'static' && r.source ? `<span class="dns-kv">来源 <b>${esc(r.source)}</b></span>` : ''}
            ${tab === 'static' && r.comment ? `<span class="dns-kv">备注 <b>${esc(r.comment)}</b></span>` : ''}
          </div>
          ${r.path ? `<div class="dns-path" title="${esc(r.path)}">路径 ${esc(r.path)}</div>` : ''}
        </div>
        <div class="dns-actions">
          ${ips.length ? `<button class="icon-btn" title="查看 IP 信息" data-action="dns-ip-all" data-ips="${esc(ips.join(','))}">${icon('search')}</button>` : ''}
        </div>
      </div>`;
  };

  /* ------------------------------------------------------------------ */
  /* Render: resources                                                   */
  /* ------------------------------------------------------------------ */

  const renderResources = () => {
    const list = state.data.resources || [];
    const errors = list.filter((r) => r.error || r.ready === false).length;
    return `
      <div class="section-head" style="margin-top:4px">
        <div>
          <h2>外部资源</h2>
          <div class="muted" style="font-size:11px;margin-top:3px">${list.length} 个资源 · ${errors ? `${errors} 个异常` : '全部正常'}</div>
        </div>
        <div class="row">
          <button class="btn btn-ghost btn-sm" data-action="update-all">全部更新</button>
          <button class="btn btn-ghost btn-sm" data-action="refresh">刷新</button>
        </div>
      </div>
      <div class="card">
        ${list.length ? `<div class="res-list">
          ${list.map((r) => `
            <div class="res-row">
              <div class="res-icon">${icon(r.type === 'script' ? 'code' : r.type === 'policy-group' ? 'layers' : 'file')}</div>
              <div class="res-main">
                <div class="res-name">${esc(r.path || r.key || '未命名资源')}</div>
                <div class="res-path">${esc(r.type || 'resource')}${r.fromModule ? ` · ${esc(r.fromModule)}` : ''}${r.updatedAt ? ` · ${new Date(r.updatedAt * 1000).toLocaleString('zh-CN', { hour12: false })}` : ' · 从未更新'}</div>
              </div>
              <div class="res-meta">
                ${r.error ? `<span class="res-error" title="${esc(r.error)}">${esc(r.error)}</span>` : ''}
                <span class="tag ${r.ready === false || r.error ? 'red' : 'green'}">${r.ready === false || r.error ? '异常' : '就绪'}</span>
                <button class="btn btn-ghost btn-sm" data-action="update-resource" data-key="${esc(r.key || '')}">更新</button>
              </div>
            </div>`).join('')}
        </div>` : `<div class="empty">暂无外部资源</div>`}
      </div>
    `;
  };

  /* ------------------------------------------------------------------ */
  /* Render: settings                                                    */
  /* ------------------------------------------------------------------ */

  const renderSettings = () => {
    const d = state.data;
    const profileLines = d.profile ? d.profile.split('\n').length : 0;
    return `
      <div class="settings-grid">
        <div style="display:flex;flex-direction:column;gap:18px">
          <div class="card card-pad">
            <div class="card-head" style="padding:0 0 14px">
              <div>
                <h3 class="card-title">API 连接</h3>
                <div class="card-sub">HTTP API 直连，不需要额外后端</div>
              </div>
            </div>
            <form id="settings-form" class="form-grid">
              <label class="field"><span>API 地址</span><input id="set-base" type="url" value="${esc(state.base)}" spellcheck="false" placeholder="http://&lt;Apple-TV-IP&gt;:6171" /></label>
              <label class="field"><span>API Key</span><input id="set-key" type="password" value="${esc(state.key)}" autocomplete="off" /></label>
              <label class="check"><input id="set-remember" type="checkbox" ${state.remember ? 'checked' : ''}/><span>记住 key（本机 localStorage，明文）</span></label>
              <div class="row" style="justify-content:flex-end">
                <button type="button" class="btn btn-ghost btn-sm" data-action="disconnect">断开</button>
                <button type="submit" class="btn btn-primary btn-sm">保存并连接</button>
              </div>
            </form>
            <div class="saved-connections">
              <div class="spread" style="margin-bottom:8px">
                <div class="card-sub">已保存的连接</div>
                <button type="button" class="btn btn-ghost btn-sm" data-action="save-connection">保存当前</button>
              </div>
              ${(state.connections || []).length ? `<div class="saved-list">
                ${(state.connections || []).map((c) => {
                  const current = state.connected && normalizeBase(c.base) === normalizeBase(state.base);
                  return `<div class="saved-item">
                    <div class="saved-info">
                      <b>${esc(c.name || c.base)}</b>
                      <span class="mono" title="${esc(c.base)}">${esc(c.base)}</span>
                      <span class="saved-key">${c.key ? '已保存 Key' : '需要 Key'}${current ? ' · 当前连接' : ''}</span>
                    </div>
                    <div class="row">
                      <button type="button" class="btn btn-ghost btn-sm" data-action="use-connection" data-base="${esc(c.base)}">连接</button>
                      <button type="button" class="btn btn-ghost btn-sm" data-action="delete-connection" data-base="${esc(c.base)}">删除</button>
                    </div>
                  </div>`;
                }).join('')}
              </div>` : `<div class="hint mt-8">还没有保存的连接。连接成功后会自动保存。</div>`}
            </div>
          </div>

          <div class="card card-pad">
            <div class="card-head" style="padding:0 0 14px">
              <div>
                <h3 class="card-title">运行状态</h3>
                <div class="card-sub">只读信息，来自 /v1/environment 与 /v1/metrics</div>
              </div>
            </div>
            <div class="form-grid">
              <div class="spread"><span class="faint">设备</span><span class="mono">${esc(state.device.name)}</span></div>
              <div class="spread"><span class="faint">平台</span><span class="mono">${esc(state.device.platform)}</span></div>
              <div class="spread"><span class="faint">版本</span><span class="mono">${esc(state.device.version || '—')} ${esc(state.device.build || '')}</span></div>
              <div class="spread"><span class="faint">运行时长</span><span class="mono">${d.metrics?.uptime ? fmtUptime(d.metrics.uptime) : '—'}</span></div>
              <div class="spread"><span class="faint">内存</span><span class="mono">${d.metrics?.mem ? fmtBytes(d.metrics.mem) : '—'}</span></div>
            </div>
          </div>

          <div class="card card-pad">
            <div class="card-head" style="padding:0 0 14px">
              <div>
                <h3 class="card-title">当前配置</h3>
                <div class="card-sub">读取当前 profile${profileLines ? ` · ${profileLines} 行` : ''} · sensitive=1</div>
              </div>
              <div class="row">
                ${d.profile ? `<button class="btn btn-ghost btn-sm" data-action="copy-profile">复制</button>` : ''}
                <button class="btn btn-ghost btn-sm" data-action="load-profile">读取</button>
              </div>
            </div>
            ${d.profile ? `<pre class="profile">${esc(d.profile)}</pre>` : `<div class="empty">点击「读取」查看当前 profile</div>`}
            <div class="row mt-16" style="justify-content:flex-end">
              <button class="btn btn-ghost btn-sm" data-action="reload-profile">重载配置</button>
            </div>
          </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:18px">
          <div class="card card-pad">
            <div class="card-head" style="padding:0 0 14px">
              <div><h3 class="card-title">快捷操作</h3><div class="card-sub">会立即影响 Surge</div></div>
            </div>
            <div style="display:flex;flex-direction:column;gap:8px">
              <button class="btn btn-ghost" style="justify-content:space-between" data-action="flush-dns"><span>清空 DNS 缓存</span><span class="mono faint">POST /dns/flush</span></button>
              <button class="btn btn-ghost" style="justify-content:space-between" data-action="test-dns"><span>测试 DNS 延迟</span><span class="mono faint">POST /test/dns_delay</span></button>
              <button class="btn btn-ghost" style="justify-content:space-between" data-action="reload-profile"><span>重载配置</span><span class="mono faint">POST /profiles/reload</span></button>
            </div>
          </div>

          <div class="card card-pad danger-zone">
            <div class="card-head" style="padding:0 0 14px">
              <div><h3 class="card-title">危险区域</h3><div class="card-sub">停止 Surge 引擎会中断所有代理</div></div>
            </div>
            <button class="btn btn-danger" style="width:100%;justify-content:center" data-action="stop-surge">停止 Surge 引擎</button>
            <div class="hint mt-8">需要重新启动时，请在设备上手动打开 Surge。</div>
          </div>

          <div class="card card-pad">
            <h3 class="card-title">关于延迟</h3>
            <div class="hint mt-8">
              本页直接读取 <code>/v1/policies/benchmark_results</code>，不依赖 Surge 自带 Web 面板的平台白名单。
              Apple TV（tvOS）上官方面板会跳过这个请求，所以那里延迟是空的；这里不会。
            </div>
          </div>
        </div>
      </div>
    `;
  };

  /* ------------------------------------------------------------------ */
  /* Actions                                                             */
  /* ------------------------------------------------------------------ */

  const bindView = () => {
    const search = $('#policy-search');
    if (search) {
      search.addEventListener('input', (e) => {
        state.policyQuery = e.target.value;
        const q = state.policyQuery.trim().toLowerCase();
        if (q) {
          (state.data.groups || []).forEach((g) => {
            if (g.name.toLowerCase().includes(q) || g.members.some((m) => m.name.toLowerCase().includes(q))) {
              setGroupExpanded(g.name, true);
            }
          });
        }
        const pos = e.target.selectionStart;
        render();
        const next = $('#policy-search');
        if (next) { next.focus(); next.setSelectionRange(pos, pos); }
      });
    }
    const reqSearch = $('#request-search');
    if (reqSearch) {
      reqSearch.addEventListener('input', (e) => {
        state.requestQuery = e.target.value;
        const pos = e.target.selectionStart;
        render();
        const next = $('#request-search');
        if (next) { next.focus(); next.setSelectionRange(pos, pos); }
      });
    }
    const dnsSearch = $('#dns-search');
    if (dnsSearch) {
      dnsSearch.addEventListener('input', (e) => {
        state.dnsQuery = e.target.value;
        const pos = e.target.selectionStart;
        render();
        const next = $('#dns-search');
        if (next) { next.focus(); next.setSelectionRange(pos, pos); }
      });
    }
  };

  const onAction = async (el, event = null) => {
    const action = el.dataset.action;
    if (!action) return;
    if (action === 'refresh') { await loadAll(); return; }
    if (!state.connected) {
      const localActions = ['demo', 'request-detail', 'request-detail-tab', 'close-request-detail', 'focus-group', 'policy-layout', 'save-connection', 'delete-connection', 'use-connection'];
      if (!localActions.includes(action)) { openModal(); return; }
    }
    try {
      if (action === 'outbound') {
        const mode = el.dataset.mode;
        await api('/v1/outbound', { method: 'POST', body: { mode } });
        state.data.outbound = mode;
        showToast('出站模式已切换', mode === 'rule' ? '规则模式' : mode === 'proxy' ? '全局代理' : '直连');
        render();
      } else if (action === 'select-member') {
        const group = el.dataset.group;
        const policy = el.dataset.policy;
        await api('/v1/policy_groups/select', { method: 'POST', body: { group_name: group, policy } });
        const g = state.data.groups.find((x) => x.name === group);
        if (g) g.selected = policy;
        state.selectionCache[group] = policy;
        state.selectionRev[group] = (state.selectionRev[group] || 0) + 1;
        showToast('已切换节点', `${group} → ${policy}`);
        render();
      } else if (action === 'test-group') {
        const group = el.dataset.group;
        showToast('正在测试', group);
        await api('/v1/policy_groups/test', { method: 'POST', body: { group_name: group }, timeout: 30000 });
        await loadPolicies();
        showToast('测试完成', group);
        render();
      } else if (action === 'test-all') {
        showToast('正在测试全部策略组', '可能需要几秒');
        const groups = state.data.groups || [];
        await Promise.all(groups.map((g) => api('/v1/policy_groups/test', { method: 'POST', body: { group_name: g.name }, timeout: 30000 }).catch(() => null)));
        await loadPolicies();
        showToast('测试完成', `${groups.length} 个策略组`);
        render();
      } else if (action === 'toggle-group') {
        const name = el.dataset.group;
        const g = state.data.groups.find((x) => x.name === name);
        if (g) {
          setGroupExpanded(name, !isGroupExpanded(g));
          render();
        }
      } else if (action === 'expand-all') {
        setAllGroupsExpanded(true);
        render();
      } else if (action === 'collapse-all') {
        setAllGroupsExpanded(false);
        render();
      } else if (action === 'request-tab') {
        state.requestTab = el.dataset.tab;
        render();
      } else if (action === 'focus-group') {
        const name = el.dataset.group;
        state.groupState[name] = true;
        persistGroupState();
        state.policyQuery = '';
        location.hash = '#/policies';
        const focus = (tries = 0) => {
          const card = [...document.querySelectorAll('.policy-card')].find(
            (c) => c.querySelector('.policy-title h3')?.textContent === name,
          );
          if (card) { card.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
          if (tries < 20) setTimeout(() => focus(tries + 1), 100);
        };
        setTimeout(() => focus(), 120);
      } else if (action === 'policy-layout') {
        state.policyLayout = el.dataset.layout === 'double' ? 'double' : 'single';
        try { localStorage.setItem(LS_POLICY_LAYOUT, state.policyLayout); } catch { /* ignore */ }
        render();
      } else if (action === 'request-detail') {
        openRequestDetail(el.dataset.id);
      } else if (action === 'request-detail-tab') {
        state.requestDetailTab = el.dataset.tab;
        paintRequestDetail();
      } else if (action === 'close-request-detail') {
        closeRequestDetail();
      } else if (action === 'dns-tab') {
        state.dnsTab = el.dataset.tab;
        render();
      } else if (action === 'traffic-sort') {
        const table = el.dataset.table;
        const key = el.dataset.key;
        const sorts = state.trafficSort[table];
        if (!sorts) return;
        const multi = !!(event && event.shiftKey);
        const firstDesc = key !== 'name';
        const idx = sorts.findIndex((s) => s.id === key);
        let next;
        if (idx < 0) {
          next = multi ? [...sorts, { id: key, desc: firstDesc }] : [{ id: key, desc: firstDesc }];
        } else if (multi) {
          const cur = sorts[idx];
          const nextDesc = cur.desc === firstDesc ? !firstDesc : null;
          next = nextDesc === null
            ? sorts.filter((s, i) => i !== idx)
            : sorts.map((s, i) => (i === idx ? { ...s, desc: nextDesc } : s));
        } else if (sorts.length === 1) {
          const cur = sorts[0];
          const nextDesc = cur.desc === firstDesc ? !firstDesc : null;
          next = nextDesc === null ? [] : [{ id: key, desc: nextDesc }];
        } else {
          next = [{ id: key, desc: firstDesc }];
        }
        state.trafficSort[table] = next;
        const y = window.scrollY;
        render();
        window.scrollTo(0, y);
      } else if (action === 'kill') {
        const id = Number(el.dataset.id);
        await api('/v1/requests/kill', { method: 'POST', body: { id } });
        showToast('已结束请求', `#${id}`);
        if (state.requestDetail && String(state.requestDetail.id) === String(id)) closeRequestDetail();
        await loadRequests();
        render();
      } else if (action === 'update-resource') {
        const key = el.dataset.key;
        await api('/v1/external_resources/update', { method: 'POST', body: { key } });
        showToast('已开始更新', key || '资源');
        await loadResources();
        render();
      } else if (action === 'update-all') {
        await api('/v1/external_resources/update', { method: 'POST', body: { key: 'all' } });
        showToast('已开始更新全部资源');
        await loadResources();
        render();
      } else if (action === 'load-profile') {
        const r = await api('/v1/profiles/current?sensitive=1');
        state.data.profile = typeof r.data === 'string' ? r.data : (r.data?.profile || JSON.stringify(r.data, null, 2));
        render();
      } else if (action === 'copy-profile') {
        const text = state.data.profile || '';
        if (!text) return;
        const lines = text.split('\n').length;
        try {
          await navigator.clipboard.writeText(text);
          showToast('已复制配置', `${lines} 行`);
        } catch {
          const ta = document.createElement('textarea');
          ta.value = text;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          try {
            document.execCommand('copy');
            showToast('已复制配置', `${lines} 行`);
          } catch {
            showToast('复制失败', '请手动选择文本复制', 'warn');
          }
          ta.remove();
        }
      } else if (action === 'reload-profile') {
        await api('/v1/profiles/reload', { method: 'POST' });
        showToast('配置已重载');
      } else if (action === 'flush-dns') {
        await api('/v1/dns/flush', { method: 'POST' });
        showToast('DNS 缓存已清空');
        if (state.view === 'dns') { await loadDns(); render(); }
      } else if (action === 'dns-ip' || action === 'dns-ip-all') {
        const raw = action === 'dns-ip' ? el.dataset.ip : el.dataset.ips;
        const ips = String(raw || '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 4);
        if (!ips.length) return;
        const results = [];
        for (const ip of ips) {
          try {
            const r = await api(`/v1/geoip?ip=${encodeURIComponent(ip)}`);
            const g = r.data || {};
            results.push(`${ip} · ${g.country || '?'} · AS${g.asn || '?'}${g.organization ? ` ${g.organization}` : ''}`);
          } catch {
            results.push(`${ip} · 查询失败`);
          }
        }
        showToast('IP 信息', results.join(' | '));
      } else if (action === 'test-dns') {
        const r = await api('/v1/test/dns_delay', { method: 'POST' });
        const delay = Number(r.data && typeof r.data === 'object' ? r.data.delay : r.data);
        if (Number.isFinite(delay)) {
          const ms = delay * 1000;
          state.data.dnsDelay = { ms, at: Date.now() };
          showToast('DNS 延迟', fmtDnsMs(ms));
        } else {
          state.data.dnsDelay = null;
          showToast('DNS 测试已触发', '接口未返回 delay');
        }
        render();
      } else if (action === 'stop-surge') {
        if (!confirm('确定停止 Surge 引擎？所有代理会立即中断。')) return;
        await api('/v1/stop', { method: 'POST' });
        state.connected = false;
        showToast('已发送停止指令', 'Surge 引擎已停止', 'warn');
        render();
      } else if (action === 'save-connection') {
        const base = $('#set-base')?.value || state.base;
        const key = $('#set-key')?.value || state.key;
        const remember = $('#set-remember') ? $('#set-remember').checked : state.remember;
        saveConnection({ base, key, remember, name: state.device.name || base });
        render();
        showToast('已保存连接', normalizeBase(base));
      } else if (action === 'delete-connection') {
        const base = el.dataset.base;
        state.connections = (state.connections || []).filter((c) => c.base !== base);
        try { localStorage.setItem(LS_CONNECTIONS, JSON.stringify(state.connections)); } catch { /* ignore */ }
        render();
        showToast('已删除连接', base);
      } else if (action === 'use-connection') {
        const base = el.dataset.base;
        const c = (state.connections || []).find((x) => x.base === base);
        if (!c) return;
        if (!c.key) {
          const baseInput = $('#set-base');
          const keyInput = $('#set-key');
          if (baseInput) baseInput.value = c.base;
          if (keyInput) { keyInput.value = ''; keyInput.focus(); }
          const remember = $('#set-remember');
          if (remember) remember.checked = !!c.remember;
          showToast('需要 API Key', '填写后点「保存并连接」');
          return;
        }
        try {
          await connect(c.base, c.key, true);
          state.remember = true;
          showToast('已切换连接', c.name || c.base);
        } catch (err) {
          showToast('连接失败', err.message || '', 'err');
        }
      } else if (action === 'disconnect') {
        state.connected = false;
        state.key = '';
        sessionStorage.removeItem(SS_KEY);
        localStorage.removeItem(LS_KEY);
        state.demo = true;
        updateConnectionUI();
        render();
        showToast('已断开', '当前显示演示数据');
      }
    } catch (err) {
      showToast('操作失败', err.message || '请求被拒绝', 'err');
    }
  };

  /* ------------------------------------------------------------------ */
  /* Feature toggles                                                     */
  /* ------------------------------------------------------------------ */

  const onFeatureToggle = async (input) => {
    const key = input.dataset.feature;
    const enabled = input.checked;
    if (!state.connected) {
      input.checked = !enabled;
      openModal();
      return;
    }
    try {
      await api(`/v1/features/${key}`, { method: 'POST', body: { enabled } });
      state.data.features[key] = enabled;
      showToast(`${key} ${enabled ? '已开启' : '已关闭'}`);
      render();
    } catch (err) {
      input.checked = !enabled;
      showToast('切换失败', err.message || '', 'err');
    }
  };

  /* ------------------------------------------------------------------ */
  /* Modal                                                               */
  /* ------------------------------------------------------------------ */

  const openModal = () => {
    $('#modal-backdrop').hidden = false;
    $('#input-base').value = state.base;
    $('#input-key').value = state.remember ? state.key : '';
    $('#input-remember').checked = state.remember;
    $('#connect-hint').innerHTML = '在 Surge 配置的 <code>[General]</code> 里：<code>http-api = key@0.0.0.0:6171</code>。建议只在可信局域网使用。';
    setTimeout(() => $('#input-base').focus(), 50);
  };
  const closeModal = () => { $('#modal-backdrop').hidden = true; };

  /* ------------------------------------------------------------------ */
  /* Boot                                                                */
  /* ------------------------------------------------------------------ */

  const init = () => {
    if (location.hash) {
      const v = location.hash.replace('#/', '').split('?')[0];
      if (PAGE_META[v]) state.view = v;
    } else {
      location.hash = '#/overview';
    }

    updateConnectionUI();
    render();

    $('#btn-connect').addEventListener('click', openModal);
    $('#btn-connect-banner').addEventListener('click', openModal);
    $('#btn-settings').addEventListener('click', () => { location.hash = '#/settings'; });
    $('#btn-refresh').addEventListener('click', () => loadAll());
    $('#modal-close').addEventListener('click', closeModal);
    $('#modal-backdrop').addEventListener('click', (e) => { if (e.target.id === 'modal-backdrop') closeModal(); });
    const reqModal = $('#request-modal');
    if (reqModal) {
      reqModal.addEventListener('click', (e) => { if (e.target.id === 'request-modal') closeRequestDetail(); });
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && reqModal && !reqModal.hidden) closeRequestDetail();
    });
    $('#btn-demo').addEventListener('click', () => { closeModal(); state.demo = true; state.connected = false; render(); });
    $('#toggle-key').addEventListener('click', () => {
      const input = $('#input-key');
      input.type = input.type === 'password' ? 'text' : 'password';
    });
    $('#menu-btn').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
    $('#sidebar').addEventListener('click', (e) => { if (e.target.closest('.nav-item')) $('#sidebar').classList.remove('open'); });

    $('#connect-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('#btn-test-connect');
      const old = btn.textContent;
      btn.disabled = true;
      btn.innerHTML = `<span class="spin">◌</span> 连接中…`;
      try {
        await connect($('#input-base').value, $('#input-key').value, $('#input-remember').checked);
        state.remember = $('#input-remember').checked;
      } catch (err) {
        const hint = $('#connect-hint');
        hint.innerHTML = `<span style="color:#fecaca">连接失败：${esc(err.message || '无法访问 API')}</span><br/>检查地址、端口、key，以及 Surge 配置里的 <code>http-api</code>。`;
      } finally {
        btn.disabled = false;
        btn.textContent = old;
      }
    });

    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-action]');
      if (el) { e.preventDefault(); onAction(el, e); }
    });
    document.addEventListener('change', (e) => {
      const input = e.target.closest('[data-feature]');
      if (input) onFeatureToggle(input);
    });
    $('#view').addEventListener('submit', async (e) => {
      if (e.target.id !== 'settings-form') return;
      e.preventDefault();
      try {
        await connect($('#set-base').value, $('#set-key').value, $('#set-remember').checked);
        state.remember = $('#set-remember').checked;
      } catch (err) {
        showToast('连接失败', err.message || '', 'err');
      }
    });

    window.addEventListener('hashchange', () => {
      const v = location.hash.replace('#/', '').split('?')[0];
      if (PAGE_META[v]) { state.view = v; render(); loadAll(); }
    });
    let policiesMobile = window.matchMedia('(max-width: 860px)').matches;
    window.addEventListener('resize', () => {
      const m = window.matchMedia('(max-width: 860px)').matches;
      if (m !== policiesMobile) {
        policiesMobile = m;
        if (state.view === 'policies') render();
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && state.connected && !(state.view === 'settings' && state.data.profile)) loadAll();
    });

    // Auto refresh current view
    setInterval(() => {
      if (state.view === 'traffic') return;
      if (state.view === 'settings' && state.data.profile) return;
      if (!document.hidden && state.connected && !state.busy && $('#modal-backdrop').hidden) loadAll();
    }, 6000);
    setInterval(tickTraffic, 1000);

    // Silent connect if a key was already stored
    if (state.key && state.base) {
      connect(state.base, state.key, state.remember).catch((err) => {
        state.connected = false;
        state.demo = true;
        updateConnectionUI();
        render();
        showToast('自动连接失败', err.message || '请重新填写 key', 'err');
      });
    } else {
      // demo data
      loadDemo();
    }
  };

  const loadDemo = () => {
    state.demo = true;
    state.connected = false;
    state.data.outbound = DEMO.outbound;
    state.data.features = { ...DEMO.features };
    state.data.groups = DEMO.groups;
    state.data.recent = DEMO.recent;
    state.data.active = DEMO.active;
    state.data.resources = DEMO.resources;
    state.data.metrics = DEMO.metrics;
    state.data.dns = DEMO.dns;
    state.traffic = { ...DEMO.traffic, peaks: { ifaces: {}, policies: {} }, history: [...DEMO.traffic.history] };
    state.apiLatency = 38;
    state.lastUpdated = new Date();
    updateConnectionUI();
    render();
  };

  init();
})();
