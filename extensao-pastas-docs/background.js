import { readLocal, writeLocal, readSync, writeSync, syncMeta, addBackup, addDoc, docIdFromUrl, cleanTitle, fetchDocTitle, emptyState } from './store.js';

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
});

chrome.runtime.onStartup.addListener(reconcile);

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
  const title = cleanTitle(info.title);
  if (!id || !title || /^(Google Docs|Documentos Google)$/i.test(title)) return;
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
  if (!title) title = await fetchDocTitle(id);
  mutate((s) => {
    addDoc(s, id, title, null);
  });
});
