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
const INDEX_KEY = 'docIndex';
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
    hidden: [], // documentos tirados da lista (não voltam pelo histórico)
    prefs: { sort: 'recent', view: 'list', looseCollapsed: false, mode: 'full', m2: 1 },
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

// Títulos que não dizem nada (página ainda carregando, tela de login etc.).
export const GENERIC_TITLE =
  /^(google docs|documentos google|google documentos|documentos do google|docs|sign-in|fazer login|untitled document|documento sem título)?$/i;

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
  const prefs = { ...base.prefs, ...(s.prefs || {}) };
  if (!prefs.m2) {
    // versão 2: documentos na mesma ordem do Google Docs e tela cheia por padrão
    prefs.sort = 'recent';
    prefs.mode = 'full';
    prefs.m2 = 1;
  }
  return {
    v: 1,
    updatedAt: s.updatedAt || 0,
    folders: s.folders || {},
    docs: s.docs || {},
    boards: s.boards || {},
    hidden: s.hidden || [],
    prefs,
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
  let index = emptyIndex();
  const subs = new Set();
  const emit = () => subs.forEach((fn) => fn(state));

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    let changed = false;
    if (changes[INDEX_KEY]) {
      index = changes[INDEX_KEY].newValue || emptyIndex();
      changed = true;
    }
    const next = changes[LOCAL_KEY]?.newValue;
    if (next && next.updatedAt !== state.updatedAt) {
      state = normalize(next);
      changed = true;
    }
    if (changed) emit();
  });

  return {
    async init() {
      [state, index] = await Promise.all([loadBest(), readIndex()]);
      emit();
      chrome.runtime.sendMessage({ type: 'reindex' }).catch(() => {});
      return state;
    },
    get: () => state,
    index: () => index,
    // Todos os documentos: os salvos + os que o Chrome já viu abertos.
    docs: () => allDocs(state, index),
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
export const byRecent = (a, b) => (b.key ?? -1) - (a.key ?? -1) || byName(a, b);
export const byOrder = (a, b) => (a.order ?? 1e15) - (b.order ?? 1e15) || byRecent(a, b);

// 'recent' = mesma ordem do Google Docs (abertos por último primeiro). Pastas ficam em A–Z nesse modo.
export function sorted(list, mode) {
  return [...list].sort(mode === 'manual' ? byOrder : mode === 'recent' ? byRecent : byName);
}

// ---------- índice de documentos (histórico do Chrome + tela inicial do Docs) ----------
//
// docIndex = { docs: { id: { t: título, last: último acesso } }, home: { at, ids: [...] } }
// Fica só neste computador (não ocupa o espaço da sincronização) e nunca é apagado,
// então um documento continua aparecendo mesmo depois que o histórico expira.

export function emptyIndex() {
  return { docs: {}, home: null };
}

export async function readIndex() {
  return (await chrome.storage.local.get(INDEX_KEY))[INDEX_KEY] || emptyIndex();
}

export async function writeIndex(ix) {
  await chrome.storage.local.set({ [INDEX_KEY]: ix });
}

// Junta salvos + índice. Cada item ganha `key` para ordenar igual ao Google Docs.
export function allDocs(s, ix) {
  const hidden = new Set(s.hidden || []);
  const home = ix?.home;
  const rank = new Map((home?.ids || []).map((id, i) => [id, i]));
  const out = new Map();
  for (const [id, e] of Object.entries(ix?.docs || {})) {
    if (hidden.has(id)) continue;
    out.set(id, { id, title: e.t || 'Documento sem título', folder: null, saved: false, last: e.last || 0 });
  }
  for (const d of Object.values(s.docs)) {
    const e = ix?.docs?.[d.id];
    out.set(d.id, { ...d, title: d.custom || !e?.t ? d.title : e.t, saved: true, last: e?.last || d.added || 0 });
  }
  for (const d of out.values()) {
    // Abertos depois da última visita à tela inicial vêm primeiro; depois a ordem que o Google mostrou.
    d.key = home && d.last <= home.at && rank.has(d.id) ? home.at - rank.get(d.id) : d.last;
  }
  return [...out.values()];
}

// Garante que o documento existe no estado (ex.: veio do histórico) antes de mexer nele.
export function ensureDoc(s, id, ix) {
  if (!s.docs[id]) addDoc(s, id, ix?.docs?.[id]?.t, null);
  return s.docs[id];
}

export function moveDocs(s, ids, folder, ix) {
  let n = 0;
  for (const id of ids) {
    const existed = !!s.docs[id];
    if (!existed) {
      addDoc(s, id, ix?.docs?.[id]?.t, folder);
      n++;
    } else if (moveItem(s, 'doc', id, folder)) n++;
  }
  return n;
}

export function hideDocs(s, ids) {
  const hidden = new Set(s.hidden || []);
  for (const id of ids) {
    delete s.docs[id];
    hidden.add(id);
  }
  s.hidden = [...hidden];
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
  if (s.hidden?.includes(id)) s.hidden = s.hidden.filter((x) => x !== id);
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

// Abre o Doc. how: 'here' (nesta aba), 'new' (aba nova) ou padrão (vai até a aba se já estiver aberto).
export async function openDoc(id, how) {
  if (how === 'new') return chrome.tabs.create({ url: DOC_URL(id) });
  if (how === 'here') {
    const tab = await chrome.tabs.getCurrent().catch(() => null);
    if (tab) return chrome.tabs.update(tab.id, { url: DOC_URL(id) });
    window.top.location.href = DOC_URL(id);
    return;
  }
  const tabs = await chrome.tabs.query({ url: 'https://docs.google.com/document/*' });
  const tab = tabs.find((t) => docIdFromUrl(t.url) === id);
  if (tab) {
    await chrome.tabs.update(tab.id, { active: true });
    chrome.windows.update(tab.windowId, { focused: true });
  } else {
    chrome.tabs.create({ url: DOC_URL(id) });
  }
}
