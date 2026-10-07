// Camada de dados compartilhada pelo painel, pela tela de fluxos e pelo service worker.
//
// Onde os dados ficam:
// - chrome.storage.local  -> cópia principal deste computador (rápida, sem limite prático)
// - chrome.storage.sync   -> cópia na sua conta do Chrome, para outros computadores.
//                            O estado é comprimido e dividido em pedaços por causa
//                            do limite de 8 KB por item / 100 KB no total.
// - backups (local)        -> fotos automáticas do estado, para restaurar se algo der errado.

export const DOC_URL = (id) => `https://docs.google.com/document/d/${id}/edit`;

const LOCAL_KEY = 'state';
const BACKUPS_KEY = 'backups';
const SYNC_STATUS_KEY = 'syncStatus';
const CHUNK = 7800;
const MAX_BACKUPS = 15;
const BACKUP_EVERY_MS = 6 * 60 * 60 * 1000;

export const COLORS = ['#8E8E93', '#0A84FF', '#30B158', '#FF9F0A', '#FF453A', '#BF5AF2', '#64D2FF', '#FFD60A'];

export function emptyState() {
  return {
    v: 1,
    updatedAt: 0,
    folders: {},
    docs: {},
    boards: {},
    prefs: { sort: 'name', view: 'list', looseCollapsed: false },
  };
}

export function uid() {
  return Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 8);
}

// ---------- Google Docs ----------

const DOC_RE = /docs\.google\.com\/document\/(?:u\/\d+\/)?d\/([a-zA-Z0-9_-]{20,})/;

export function docIdFromUrl(url) {
  const m = DOC_RE.exec(url || '');
  return m ? m[1] : null;
}

export function cleanTitle(title) {
  return (title || '').replace(/\s+[-–—]\s+(Google Docs|Documentos Google|Google Documentos|Documentos do Google)\s*$/i, '').trim();
}

// ---------- compressão para o sync ----------

async function pipe(bytes, stream) {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

function toB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromB64(b64) {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes;
}

async function encode(state) {
  const json = new TextEncoder().encode(JSON.stringify(state));
  return toB64(await pipe(json, new CompressionStream('deflate-raw')));
}

async function decode(b64) {
  const raw = await pipe(fromB64(b64), new DecompressionStream('deflate-raw'));
  return JSON.parse(new TextDecoder().decode(raw));
}

// ---------- leitura / escrita ----------

export function normalize(s) {
  const base = emptyState();
  if (!s || typeof s !== 'object') return base;
  return {
    v: 1,
    updatedAt: s.updatedAt || 0,
    folders: s.folders || {},
    docs: s.docs || {},
    boards: s.boards || {},
    prefs: { ...base.prefs, ...(s.prefs || {}) },
  };
}

export async function readLocal() {
  const r = await chrome.storage.local.get(LOCAL_KEY);
  return r[LOCAL_KEY] ? normalize(r[LOCAL_KEY]) : null;
}

export async function writeLocal(state) {
  await chrome.storage.local.set({ [LOCAL_KEY]: state });
}

// Devolve o estado guardado na conta do Chrome, ou null se não houver / estiver incompleto.
export async function readSync() {
  const all = await chrome.storage.sync.get(null);
  const meta = all.meta;
  if (!meta || !meta.n) return null;
  let b64 = '';
  for (let i = 0; i < meta.n; i++) {
    if (typeof all['c' + i] !== 'string') return null;
    b64 += all['c' + i];
  }
  if (b64.length !== meta.len) return null; // ainda chegando pedaços de outro computador
  try {
    return normalize(await decode(b64));
  } catch {
    return null;
  }
}

export async function syncMeta() {
  const r = await chrome.storage.sync.get('meta');
  return r.meta || null;
}

export async function writeSync(state) {
  try {
    const b64 = await encode(state);
    const n = Math.ceil(b64.length / CHUNK) || 1;
    const prev = (await syncMeta())?.n || 0;
    const items = { meta: { n, len: b64.length, updatedAt: state.updatedAt, v: 1 } };
    for (let i = 0; i < n; i++) items['c' + i] = b64.slice(i * CHUNK, (i + 1) * CHUNK);
    await chrome.storage.sync.set(items);
    const stale = [];
    for (let i = n; i < prev; i++) stale.push('c' + i);
    if (stale.length) await chrome.storage.sync.remove(stale);
    const bytes = b64.length + 200;
    await setSyncStatus({ ok: true, at: Date.now(), used: bytes, quota: chrome.storage.sync.QUOTA_BYTES });
  } catch (e) {
    await setSyncStatus({ ok: false, at: Date.now(), error: String(e?.message || e) });
    throw e;
  }
}

export async function setSyncStatus(s) {
  await chrome.storage.local.set({ [SYNC_STATUS_KEY]: s });
}

export async function getSyncStatus() {
  return (await chrome.storage.local.get(SYNC_STATUS_KEY))[SYNC_STATUS_KEY] || null;
}

// ---------- backups automáticos ----------

export async function listBackups() {
  return (await chrome.storage.local.get(BACKUPS_KEY))[BACKUPS_KEY] || [];
}

export async function addBackup(state, reason, force = false) {
  if (!state || (!Object.keys(state.folders).length && !Object.keys(state.docs).length)) return;
  const list = await listBackups();
  const last = list[0];
  if (!force && last && Date.now() - last.at < BACKUP_EVERY_MS) return;
  if (last && last.updatedAt === state.updatedAt) return;
  list.unshift({
    at: Date.now(),
    updatedAt: state.updatedAt,
    reason,
    folders: Object.keys(state.folders).length,
    docs: Object.keys(state.docs).length,
    state,
  });
  await chrome.storage.local.set({ [BACKUPS_KEY]: list.slice(0, MAX_BACKUPS) });
}

// Na abertura: pega a versão mais nova entre este computador e a conta do Chrome.
export async function loadBest() {
  const local = await readLocal();
  let remote = null;
  try {
    const meta = await syncMeta();
    if (meta && (!local || meta.updatedAt > local.updatedAt)) remote = await readSync();
  } catch {
    /* sem sync disponível */
  }
  if (remote && (!local || remote.updatedAt > local.updatedAt)) {
    if (local) await addBackup(local, 'Antes de receber dados de outro computador', true);
    await writeLocal(remote);
    return remote;
  }
  return local || emptyState();
}

// ---------- store reativo usado pelas páginas ----------

export function createStore() {
  let state = emptyState();
  const subs = new Set();
  const emit = () => subs.forEach((fn) => fn(state));

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[LOCAL_KEY]) return;
    const next = changes[LOCAL_KEY].newValue;
    if (!next || next.updatedAt === state.updatedAt) return;
    state = normalize(next);
    emit();
  });

  return {
    async init() {
      state = await loadBest();
      emit();
      return state;
    },
    get: () => state,
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    // Muda o estado, salva neste computador; o service worker leva para a conta do Chrome.
    update(fn) {
      const draft = structuredClone(state);
      fn(draft);
      draft.updatedAt = Math.max(Date.now(), state.updatedAt + 1);
      state = draft;
      emit();
      return writeLocal(state);
    },
    replace(next) {
      state = normalize(structuredClone(next));
      state.updatedAt = Date.now();
      emit();
      return writeLocal(state);
    },
  };
}

// ---------- operações sobre o estado (recebem o rascunho) ----------

export function childFolders(s, parent) {
  return Object.values(s.folders).filter((f) => (f.parent || null) === (parent || null));
}

export function childDocs(s, folder) {
  return Object.values(s.docs).filter((d) => (d.folder || null) === (folder || null));
}

const collator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });
export const byName = (a, b) => collator.compare(a.name || a.title || '', b.name || b.title || '');
export const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0) || byName(a, b);

export function sorted(list, mode) {
  return [...list].sort(mode === 'manual' ? byOrder : byName);
}

function nextOrder(list) {
  return list.reduce((m, x) => Math.max(m, x.order ?? 0), 0) + 1;
}

export function addFolder(s, name, parent = null) {
  const id = uid();
  s.folders[id] = {
    id,
    name: name || 'Nova pasta',
    parent: parent || null,
    color: COLORS[1],
    order: nextOrder(childFolders(s, parent)),
    created: Date.now(),
  };
  return id;
}

export function addDoc(s, id, title, folder = null) {
  if (s.docs[id]) {
    if (title && !s.docs[id].custom) s.docs[id].title = title;
    return false;
  }
  s.docs[id] = {
    id,
    title: title || 'Documento sem título',
    folder: folder || null,
    order: nextOrder(childDocs(s, folder)),
    added: Date.now(),
  };
  return true;
}

export function isDescendant(s, folderId, maybeAncestor) {
  let cur = s.folders[folderId];
  while (cur) {
    if (cur.id === maybeAncestor) return true;
    cur = cur.parent ? s.folders[cur.parent] : null;
  }
  return false;
}

export function moveItem(s, kind, id, parent) {
  parent = parent || null;
  if (kind === 'folder') {
    if (parent && isDescendant(s, parent, id)) return false;
    const f = s.folders[id];
    if (!f || (f.parent || null) === parent) return false;
    f.parent = parent;
    f.order = nextOrder(childFolders(s, parent));
  } else {
    const d = s.docs[id];
    if (!d || (d.folder || null) === parent) return false;
    d.folder = parent;
    d.order = nextOrder(childDocs(s, parent));
  }
  return true;
}

// Reordena manualmente: coloca o item antes/depois de outro do mesmo tipo.
export function placeItem(s, kind, id, targetId, after) {
  const table = kind === 'folder' ? s.folders : s.docs;
  const item = table[id];
  const target = table[targetId];
  if (!item || !target || id === targetId) return;
  const parentKey = kind === 'folder' ? 'parent' : 'folder';
  const parent = target[parentKey] || null;
  if (kind === 'folder' && parent && isDescendant(s, parent, id)) return;
  item[parentKey] = parent;
  const siblings = sorted(
    (kind === 'folder' ? childFolders(s, parent) : childDocs(s, parent)).filter((x) => x.id !== id),
    'manual',
  );
  const idx = siblings.findIndex((x) => x.id === targetId);
  siblings.splice(after ? idx + 1 : idx, 0, item);
  siblings.forEach((x, i) => (x.order = i + 1));
}

// Pastas apagadas: o conteúdo sobe para a pasta de cima (ou fica solto).
export function deleteFolder(s, id) {
  const f = s.folders[id];
  if (!f) return;
  const parent = f.parent || null;
  for (const sub of childFolders(s, id)) {
    sub.parent = parent;
    sub.order = nextOrder(childFolders(s, parent));
  }
  for (const d of childDocs(s, id)) {
    d.folder = parent;
    d.order = nextOrder(childDocs(s, parent));
  }
  delete s.folders[id];
  for (const b of Object.values(s.boards)) {
    for (const [nid, n] of Object.entries(b.nodes)) {
      if (n.folder === id) {
        delete b.nodes[nid];
        b.edges = b.edges.filter((e) => e.from !== nid && e.to !== nid);
      }
    }
  }
}

export function folderPath(s, id) {
  const path = [];
  let cur = id ? s.folders[id] : null;
  while (cur) {
    path.unshift(cur);
    cur = cur.parent ? s.folders[cur.parent] : null;
  }
  return path;
}

export function countDocsDeep(s, id) {
  let n = childDocs(s, id).length;
  for (const f of childFolders(s, id)) n += countDocsDeep(s, f.id);
  return n;
}

export async function fetchDocTitle(id) {
  try {
    const res = await fetch(DOC_URL(id), { credentials: 'include' });
    if (!res.ok) return null;
    const html = await res.text();
    const og = /<meta property="og:title" content="([^"]*)"/.exec(html);
    const t = og ? og[1] : (/<title>([^<]*)<\/title>/.exec(html) || [])[1];
    if (!t) return null;
    const clean = cleanTitle(
      t
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
        .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&'),
    );
    return clean && !/^(Google Docs|Documentos Google|Sign-in|Fazer login)/i.test(clean) ? clean : null;
  } catch {
    return null;
  }
}

// Abre o Doc: se já estiver aberto numa aba, vai até ela; senão abre uma aba nova.
export async function openDoc(id) {
  const tabs = await chrome.tabs.query({ url: 'https://docs.google.com/document/*' });
  const tab = tabs.find((t) => docIdFromUrl(t.url) === id);
  if (tab) {
    await chrome.tabs.update(tab.id, { active: true });
    chrome.windows.update(tab.windowId, { focused: true });
  } else {
    chrome.tabs.create({ url: DOC_URL(id) });
  }
}
