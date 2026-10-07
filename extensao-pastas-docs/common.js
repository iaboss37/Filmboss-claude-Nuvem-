// Ações usadas pelo painel lateral e pela tela cheia.
import * as S from './store.js';
import { icons, h, svg, showMenu, confirmBox, toast, fmtDate } from './ui.js';

export const norm = (t) => (t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export const folderIcon = (f, size = 16) => icons.folder(size).replace('class="folder-ico"', `class="folder-ico" style="color:${f.color}"`);

export function uniqueName(s, base, parent) {
  const names = new Set(S.childFolders(s, parent).map((f) => f.name.toLowerCase()));
  if (!names.has(base.toLowerCase())) return base;
  let i = 2;
  while (names.has(`${base} ${i}`.toLowerCase())) i++;
  return `${base} ${i}`;
}

// Agrupa todos os documentos por pasta (null = fora das pastas).
export function docsByFolder(list) {
  const map = new Map();
  for (const d of list) {
    const k = d.folder || null;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(d);
  }
  return map;
}

export function countDeep(s, byFolder, id) {
  let n = byFolder.get(id)?.length || 0;
  for (const f of S.childFolders(s, id)) n += countDeep(s, byFolder, f.id);
  return n;
}

export function pathText(s, folderId) {
  return (
    S.folderPath(s, folderId)
      .map((f) => f.name)
      .join(' › ') || 'Fora das pastas'
  );
}

// Itens de menu para escolher uma pasta de destino.
export function folderPickerItems(s, { title, current, exclude, onPick }) {
  const items = [{ title }];
  items.push({ label: 'Fora das pastas', icon: icons.doc(16), disabled: current === null, onClick: () => onPick(null) });
  const walk = (parent, depth) => {
    for (const f of S.sorted(S.childFolders(s, parent), 'name')) {
      const blocked = exclude && (f.id === exclude || S.isDescendant(s, f.id, exclude));
      items.push({ label: f.name, icon: folderIcon(f), indent: depth, disabled: blocked || f.id === current, onClick: () => onPick(f.id) });
      walk(f.id, depth + 1);
    }
  };
  walk(null, 0);
  if (items.length === 2) items.push({ label: 'Crie uma pasta primeiro', disabled: true });
  return items;
}

export async function moveDocsFlow(store, ids, folder) {
  let n = 0;
  await store.update((s) => (n = S.moveDocs(s, ids, folder, store.index())));
  if (n) toast(`${n > 1 ? `${n} documentos movidos` : 'Movido'} para ${folder ? `“${store.get().folders[folder]?.name}”` : 'fora das pastas'}`);
  return n;
}

export async function deleteFolderFlow(store, id) {
  const s = store.get();
  const f = s.folders[id];
  if (!f) return false;
  const subs = S.childFolders(s, id).length;
  const docs = S.childDocs(s, id).length;
  const dest = f.parent ? `a pasta “${s.folders[f.parent].name}”` : 'fora das pastas';
  const what = [docs && plural(docs, 'documento', 'documentos'), subs && plural(subs, 'subpasta', 'subpastas')].filter(Boolean).join(' e ');
  const ok = await confirmBox({
    title: `Apagar a pasta “${f.name}”?`,
    message: what ? `Nada é perdido: ${what} ${subs + docs > 1 ? 'vão' : 'vai'} para ${dest}.` : 'A pasta está vazia.',
    ok: 'Apagar pasta',
    danger: true,
  });
  if (!ok) return false;
  const snapshot = structuredClone(s);
  await store.update((d) => S.deleteFolder(d, id));
  toast(`Pasta “${f.name}” apagada`, { label: 'Desfazer', onClick: () => store.replace(snapshot) });
  return true;
}

export async function hideDocsFlow(store, ids) {
  const snapshot = structuredClone(store.get());
  await store.update((s) => S.hideDocs(s, ids));
  toast(ids.length > 1 ? `${ids.length} documentos tirados da lista` : 'Tirado da lista (o Doc continua no Google Drive)', {
    label: 'Desfazer',
    onClick: () => store.replace(snapshot),
  });
}

export async function copyLink(id) {
  try {
    await navigator.clipboard.writeText(S.DOC_URL(id));
    toast('Link copiado');
  } catch {
    toast('Não foi possível copiar');
  }
}

// Ids (e título) de Google Docs vindos de um arraste de fora (outra página, outra aba).
export function idsFromDrop(dt) {
  const text = [dt.getData('text/uri-list'), dt.getData('text/plain'), dt.getData('text/html')].join('\n');
  const ids = [...new Set((text.match(/https?:\/\/docs\.google\.com\/document\/[^\s"'<>]+/g) || []).map(S.docIdFromUrl).filter(Boolean))];
  let title = null;
  const html = dt.getData('text/html');
  if (html && ids.length === 1) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    title = S.cleanTitle(doc.querySelector('a')?.textContent?.trim());
    if (title && /^https?:/.test(title)) title = null;
  }
  return { ids, title };
}

// ---------- modos: tela cheia, lateral, tradicional ----------

export const MODES = [
  { id: 'full', label: 'Tela cheia', hint: 'As pastas ocupam a tela inicial do Google Docs' },
  { id: 'side', label: 'Lateral', hint: 'Google Docs normal com as pastas no painel ao lado' },
  { id: 'off', label: 'Tradicional', hint: 'Google Docs como sempre, sem a extensão' },
];

export async function setMode(store, mode) {
  if (store.get().prefs.mode !== mode) await store.update((s) => (s.prefs.mode = mode));
  if (mode === 'side') {
    try {
      const win = await chrome.windows.getCurrent();
      await chrome.sidePanel.open({ windowId: win.id });
    } catch {
      /* o painel abre pelo ícone da extensão */
    }
  }
  toast(`Modo: ${MODES.find((m) => m.id === mode).label}`);
}

export function modeMenuItems(store) {
  const cur = store.get().prefs.mode;
  return [
    { title: 'Como ver o Google Docs' },
    ...MODES.map((m) => ({ label: m.label, icon: m.id === cur ? icons.check : '<svg width="15" height="15"></svg>', onClick: () => setMode(store, m.id) })),
  ];
}

export async function openFlowsTab() {
  const url = chrome.runtime.getURL('flows.html');
  const [tab] = await chrome.tabs.query({ url }).catch(() => []);
  if (tab) {
    chrome.tabs.update(tab.id, { active: true });
    chrome.windows.update(tab.windowId, { focused: true });
  } else chrome.tabs.create({ url });
}

// ---------- backup e sincronização ----------

export function openSettings(store) {
  const sheet = h('div', { class: 'sheet' });
  const close = () => sheet.remove();
  const body = h('div', { class: 'sheet-body' });
  sheet.append(
    h(
      'div',
      { class: 'sheet-head' },
      h('button', { class: 'icon-btn', title: 'Voltar', onclick: close }, svg(icons.back)),
      h('h2', {}, 'Backup e sincronização'),
    ),
    body,
  );
  sheet.addEventListener('keydown', (e) => e.key === 'Escape' && close());
  document.body.append(sheet);

  const fill = async () => {
    const status = await S.getSyncStatus();
    const backups = await S.listBackups();
    const s = store.get();
    const nF = Object.keys(s.folders).length;
    const nD = Object.keys(s.docs).length;
    const nH = (s.hidden || []).length;
    const used = status?.used && status?.quota ? Math.min(100, Math.round((status.used / status.quota) * 100)) : 0;

    body.replaceChildren(
      h('h3', {}, 'Sincronização com sua conta do Chrome'),
      h(
        'div',
        { class: 'status' + (status && !status.ok ? ' bad' : '') },
        h('span', { class: 'dot' }),
        h(
          'div',
          {},
          status?.ok
            ? h('div', {}, `Sincronizado em ${fmtDate(status.at)}`)
            : status
              ? h('div', {}, `Não foi possível sincronizar: ${status.error}. Seus dados continuam salvos neste computador. Baixe um backup por segurança.`)
              : h('div', {}, 'Ainda não sincronizado.'),
          h(
            'div',
            { style: { color: 'var(--text-2)', fontSize: '12px', marginTop: '2px' } },
            `${plural(nF, 'pasta', 'pastas')}, ${plural(nD, 'documento organizado', 'documentos organizados')} · ${used}% do espaço de sincronização usado`,
          ),
          h('div', { class: 'meter' }, h('span', { style: { width: Math.max(used, 2) + '%' } })),
        ),
      ),
      h(
        'p',
        { style: { marginTop: '10px' } },
        'Suas pastas vão junto com a sua conta do Chrome. Em outro computador, entre na mesma conta do Chrome (com a sincronização de “Extensões” ligada) e instale esta mesma pasta da extensão. A organização aparece sozinha.',
      ),
      h(
        'div',
        { class: 'btn-row' },
        h(
          'button',
          {
            class: 'btn',
            onclick: async () => {
              try {
                await S.writeSync(store.get());
                toast('Sincronizado');
              } catch {
                toast('Não foi possível sincronizar agora');
              }
              fill();
            },
          },
          svg(icons.cloud),
          'Sincronizar agora',
        ),
      ),

      h('h3', {}, 'Backup em arquivo'),
      h('p', {}, 'Guarde uma cópia em arquivo (por exemplo, no seu Drive). Dá para restaurar em qualquer computador.'),
      h(
        'div',
        { class: 'btn-row' },
        h('button', { class: 'btn', onclick: () => downloadBackup(store) }, svg(icons.download), 'Baixar backup'),
        h('button', { class: 'btn', onclick: () => importBackup(store, fill) }, svg(icons.upload), 'Restaurar de arquivo'),
      ),

      h('h3', {}, 'Documentos tirados da lista'),
      nH
        ? h(
            'div',
            {},
            h('p', {}, `${plural(nH, 'documento foi tirado', 'documentos foram tirados')} da lista e não aparece${nH === 1 ? '' : 'm'} mais.`),
            h(
              'button',
              {
                class: 'btn',
                onclick: async () => {
                  await store.update((d) => (d.hidden = []));
                  toast('Documentos de volta à lista');
                  fill();
                },
              },
              'Mostrar todos de novo',
            ),
          )
        : h('p', { style: { fontStyle: 'italic' } }, 'Nenhum.'),

      h('h3', {}, 'Cópias automáticas'),
      h('p', {}, 'A extensão guarda sozinha até 15 cópias neste computador, a cada poucas horas de uso e antes de qualquer restauração.'),
      backups.length
        ? h(
            'div',
            {},
            backups.map((b) =>
              h(
                'div',
                { class: 'backup' },
                svg(icons.history),
                h('div', { class: 'meta' }, h('div', {}, fmtDate(b.at)), h('div', { class: 's' }, `${b.folders} pastas, ${b.docs} documentos · ${b.reason}`)),
                h(
                  'button',
                  {
                    class: 'btn',
                    onclick: async () => {
                      const ok = await confirmBox({
                        title: 'Restaurar esta cópia?',
                        message: `Volta para como estava em ${fmtDate(b.at)}. O estado atual vira uma cópia automática, então dá para voltar.`,
                        ok: 'Restaurar',
                      });
                      if (!ok) return;
                      await S.addBackup(store.get(), 'Antes de restaurar uma cópia', true);
                      await store.replace(b.state);
                      toast('Cópia restaurada');
                      fill();
                    },
                  },
                  'Restaurar',
                ),
              ),
            ),
          )
        : h('p', { style: { fontStyle: 'italic' } }, 'Nenhuma cópia ainda.'),

      h('h3', {}, 'Atalho'),
      h(
        'p',
        {},
        'Abra o painel lateral com ',
        h('kbd', {}, 'Alt'),
        ' + ',
        h('kbd', {}, 'Shift'),
        ' + ',
        h('kbd', {}, 'P'),
        '. Para trocar, vá em chrome://extensions/shortcuts.',
      ),
    );
  };
  fill();
}

function downloadBackup(store) {
  const blob = new Blob([JSON.stringify({ app: 'pastas-docs', exportedAt: Date.now(), state: store.get() }, null, 2)], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: `pastas-docs-backup-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function importBackup(store, after) {
  const input = h('input', { type: 'file', accept: '.json,application/json' });
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const state = S.normalize(data.state || data);
      const ok = await confirmBox({
        title: 'Restaurar este backup?',
        message: `O arquivo tem ${plural(Object.keys(state.folders).length, 'pasta', 'pastas')} e ${plural(Object.keys(state.docs).length, 'documento organizado', 'documentos organizados')} e vai substituir a organização atual. A atual vira uma cópia automática, então dá para voltar.`,
        ok: 'Restaurar',
      });
      if (!ok) return;
      await S.addBackup(store.get(), 'Antes de restaurar um arquivo', true);
      await store.replace(state);
      toast('Backup restaurado');
      after?.();
    } catch {
      toast('Esse arquivo não é um backup válido');
    }
  };
  input.click();
}

export function iconize(rootEl = document) {
  rootEl.querySelectorAll('i[data-icon]').forEach((i) => {
    const ic = icons[i.dataset.icon];
    i.replaceWith(svg(typeof ic === 'function' ? ic(16) : ic));
  });
}

export function showMenuAtEl(el, items) {
  const r = el.getBoundingClientRect();
  return showMenu(r.left, r.bottom + 4, items);
}
