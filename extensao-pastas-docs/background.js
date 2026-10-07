import {
  readLocal,
  writeLocal,
  readSync,
  writeSync,
  syncMeta,
  addBackup,
  addDoc,
  docIdFromUrl,
  cleanTitle,
  fetchDocTitle,
  emptyState,
  readIndex,
  writeIndex,
  GENERIC_TITLE,
} from './store.js';

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'save-page',
      title: 'Salvar este Doc no Pastas Docs',
      contexts: ['page'],
      documentUrlPatterns: ['https://docs.google.com/document/*'],
    });
    chrome.contextMenus.create({
      id: 'save-link',
      title: 'Salvar este Doc no Pastas Docs',
      contexts: ['link'],
      targetUrlPatterns: ['https://docs.google.com/document/*'],
    });
  });
  reconcile();
  rebuildIndex();
});

chrome.runtime.onStartup.addListener(() => {
  reconcile();
  rebuildIndex();
});

// ---------- sincronização com a conta do Chrome ----------

let pushTimer = null;
let busy = Promise.resolve();
const serial = (fn) => (busy = busy.then(fn, fn).catch(() => {}));

async function reconcile() {
  return serial(async () => {
    const local = await readLocal();
    const meta = await syncMeta().catch(() => null);
    if (meta && (!local || meta.updatedAt > local.updatedAt)) {
      const remote = await readSync();
      if (remote) {
        if (local) await addBackup(local, 'Antes de receber dados de outro computador', true);
        await writeLocal(remote);
      }
    } else if (local && (!meta || local.updatedAt > meta.updatedAt)) {
      await writeSync(local).catch(() => {});
    }
  });
}

function schedulePush() {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    serial(async () => {
      const local = await readLocal();
      const meta = await syncMeta().catch(() => null);
      if (!local || (meta && meta.updatedAt >= local.updatedAt)) return;
      await writeSync(local).catch(() => {});
      await addBackup(local, 'Cópia automática');
    });
  }, 1500);
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.state) schedulePush();
  if (area === 'sync' && changes.meta) reconcile();
});

// ---------- índice de documentos: histórico do Chrome + tela inicial do Docs ----------

let ixBusy = Promise.resolve();
const ixSerial = (fn) => (ixBusy = ixBusy.then(fn, fn).catch(() => {}));
const goodTitle = (t) => (t && !GENERIC_TITLE.test(t) ? t : '');

function rebuildIndex() {
  return ixSerial(async () => {
    if (!chrome.history) return;
    const results = await chrome.history.search({ text: 'docs.google.com', startTime: 0, maxResults: 100000 });
    const ix = await readIndex();
    const docs = { ...ix.docs };
    for (const r of results) {
      const id = docIdFromUrl(r.url);
      if (!id) continue;
      const t = goodTitle(cleanTitle(r.title));
      const last = r.lastVisitTime || 0;
      const cur = docs[id] || (docs[id] = { t: '', last: 0 });
      if (last >= cur.last) {
        cur.last = last;
        if (t) cur.t = t;
      } else if (!cur.t && t) cur.t = t;
    }
    ix.docs = docs;
    ix.builtAt = Date.now();
    await writeIndex(ix);
  });
}

function touchIndex(id, title, last) {
  return ixSerial(async () => {
    const ix = await readIndex();
    const cur = ix.docs[id] || (ix.docs[id] = { t: '', last: 0 });
    const t = goodTitle(cleanTitle(title));
    if (t === cur.t && (!last || last <= cur.last)) return;
    if (t) cur.t = t;
    if (last) cur.last = Math.max(cur.last, last);
    await writeIndex(ix);
  });
}

// Lista lida da tela inicial do Google Docs, já na ordem que o Google mostra.
function harvest(items) {
  return ixSerial(async () => {
    const ix = await readIndex();
    for (const { id, t } of items) {
      const cur = ix.docs[id] || (ix.docs[id] = { t: '', last: 0 });
      const title = goodTitle(cleanTitle(t));
      if (title && !cur.t) cur.t = title;
    }
    ix.home = { at: Date.now(), ids: items.map((i) => i.id) };
    await writeIndex(ix);
  });
}

chrome.history?.onVisited.addListener((r) => {
  const id = docIdFromUrl(r.url);
  if (id) touchIndex(id, r.title, r.lastVisitTime || Date.now());
});

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg?.type === 'reindex') {
    rebuildIndex();
  } else if (msg?.type === 'harvest' && Array.isArray(msg.items)) {
    harvest(msg.items.filter((i) => i && typeof i.id === 'string').slice(0, 5000));
  } else if (msg?.type === 'openSidePanel') {
    const target = sender.tab ? { tabId: sender.tab.id } : { windowId: msg.windowId };
    chrome.sidePanel
      .open(target)
      .then(() => reply({ ok: true }))
      .catch((e) => reply({ ok: false, error: String(e?.message || e) }));
    return true;
  }
});

// ---------- títulos sempre atualizados ----------

async function mutate(fn) {
  return serial(async () => {
    const s = (await readLocal()) || emptyState();
    if (fn(s) === false) return;
    s.updatedAt = Math.max(Date.now(), s.updatedAt + 1);
    await writeLocal(s);
  });
}

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (!info.title || !tab.url) return;
  const id = docIdFromUrl(tab.url);
  const title = goodTitle(cleanTitle(info.title));
  if (!id || !title) return;
  touchIndex(id, title, Date.now());
  mutate((s) => {
    const d = s.docs[id];
    if (!d || d.custom || d.title === title) return false;
    d.title = title;
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const url = info.menuItemId === 'save-link' ? info.linkUrl : tab?.url;
  const id = docIdFromUrl(url);
  if (!id) return;
  let title = info.menuItemId === 'save-page' ? cleanTitle(tab?.title) : null;
  if (!title) title = (await readIndex()).docs[id]?.t || (await fetchDocTitle(id));
  mutate((s) => {
    addDoc(s, id, title, null);
  });
});
