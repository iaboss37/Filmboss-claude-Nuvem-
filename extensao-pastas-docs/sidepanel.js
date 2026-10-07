import * as S from './store.js';
import * as C from './common.js';
import { icons, h, svg, showMenu, menuAt, toast, inlineEdit } from './ui.js';

const store = S.createStore();
const $ = (sel) => document.querySelector(sel);
const content = $('#content');

const LOOSE_PAGE = 100;
const ui = {
  cwd: null, // pasta aberta no modo ícones
  search: '',
  open: new Set(readLocalPref('open', [])), // pastas expandidas no modo lista (por computador)
  active: null, // { id, title, tabId } do Google Doc aberto na aba atual
  editing: false,
  pendingRender: false,
  looseLimit: LOOSE_PAGE,
};

function readLocalPref(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem('pd.' + key)) ?? fallback;
  } catch {
    return fallback;
  }
}
function saveLocalPref(key, value) {
  try {
    localStorage.setItem('pd.' + key, JSON.stringify(value));
  } catch {}
}
const saveOpen = () => saveLocalPref('open', [...ui.open]);

const st = () => store.get();
const prefs = () => st().prefs;
let data = null;

function compute() {
  const all = store.docs();
  data = { s: st(), all, byFolder: C.docsByFolder(all), byId: new Map(all.map((d) => [d.id, d])) };
}
const docsIn = (folder) => S.sorted(data.byFolder.get(folder || null) || [], prefs().sort);
const foldersIn = (parent) => S.sorted(S.childFolders(data.s, parent), prefs().sort === 'manual' ? 'manual' : 'name');

// ---------- render ----------

function render() {
  if (ui.editing) {
    ui.pendingRender = true;
    return;
  }
  compute();
  const s = data.s;
  if (ui.cwd && !s.folders[ui.cwd]) ui.cwd = null;
  document.querySelectorAll('#viewSeg button').forEach((b) => b.classList.toggle('on', b.dataset.view === prefs().view));
  document.querySelectorAll('#sortSeg button').forEach((b) => b.classList.toggle('on', b.dataset.sort === prefs().sort));
  renderActive();
  renderCrumbs();

  const scroll = content.scrollTop;
  content.replaceChildren();
  if (ui.search) renderSearch();
  else if (!Object.keys(s.folders).length && !data.all.length) renderEmpty();
  else if (prefs().view === 'grid') renderGrid();
  else renderList();
  content.scrollTop = scroll;
}

function renderEmpty() {
  content.append(
    h(
      'div',
      { class: 'empty' },
      svg(icons.folder(56)),
      h('h2', {}, 'Nenhum documento ainda'),
      h('p', {}, 'Os Google Docs que você abrir neste Chrome aparecem aqui sozinhos, em “Fora das pastas”. Depois é só arrastar cada um para uma pasta.'),
      h('button', { class: 'btn primary', onclick: () => newFolder(null) }, svg(icons.folderPlus), 'Criar primeira pasta'),
    ),
  );
}

// ----- modo lista (árvore) -----

function renderList() {
  const out = [];
  const walk = (parent, depth) => {
    for (const f of foldersIn(parent)) {
      const isOpen = ui.open.has(f.id);
      out.push(folderRow(f, depth, isOpen));
      if (!isOpen) continue;
      const before = out.length;
      walk(f.id, depth + 1);
      for (const d of docsIn(f.id)) out.push(docRow(d, depth + 1));
      if (out.length === before) out.push(h('div', { class: 'row empty-hint', style: pad(depth + 1) }, 'Pasta vazia'));
    }
  };
  walk(null, 0);
  content.append(...out);
  content.append(looseSection((d) => docRow(d, 0)));
}

const pad = (depth) => ({ paddingLeft: 6 + depth * 16 + 'px' });

function folderRow(f, depth, isOpen) {
  const s = data.s;
  const hasKids = S.childFolders(s, f.id).length || data.byFolder.get(f.id)?.length;
  const n = C.countDeep(s, data.byFolder, f.id);
  const row = h(
    'div',
    {
      class: 'row folder',
      draggable: 'true',
      'data-kind': 'folder',
      'data-id': f.id,
      style: { ...pad(depth), '--c': f.color },
      onclick: () => toggleOpen(f.id),
      oncontextmenu: (e) => {
        e.preventDefault();
        folderMenu(f.id, e.clientX, e.clientY);
      },
      ondblclick: (e) => {
        e.stopPropagation();
        startRename('folder', f.id);
      },
    },
    h(
      'button',
      {
        class: 'twisty' + (isOpen ? ' open' : '') + (hasKids ? '' : ' empty'),
        tabindex: '-1',
        onclick: (e) => {
          e.stopPropagation();
          toggleOpen(f.id);
        },
      },
      svg(icons.chevron),
    ),
    svg(icons.folder(18)),
    h('span', { class: 'name' }, f.name),
    n ? h('span', { class: 'count' }, String(n)) : null,
    moreBtn((e) => folderMenu(f.id, e.left, e.bottom + 4)),
  );
  return row;
}

function docRow(d, depth, extra) {
  return h(
    'div',
    {
      class: 'row doc' + (ui.active?.id === d.id ? ' current-doc' : '') + (extra?.cls || ''),
      draggable: 'true',
      'data-kind': 'doc',
      'data-id': d.id,
      style: pad(depth),
      title: d.title,
      onclick: () => S.openDoc(d.id),
      oncontextmenu: (e) => {
        e.preventDefault();
        docMenu(d.id, e.clientX, e.clientY);
      },
    },
    h('span', { class: 'twisty empty' }),
    svg(icons.doc(18)),
    h('span', { class: 'name' }, d.title),
    extra?.after || null,
    moreBtn((r) => docMenu(d.id, r.left, r.bottom + 4)),
  );
}

function moreBtn(open) {
  return h(
    'button',
    {
      class: 'more',
      title: 'Opções',
      tabindex: '0',
      onclick: (e) => {
        e.stopPropagation();
        open(e.currentTarget.getBoundingClientRect());
      },
    },
    svg(icons.more),
  );
}

// "Fora das pastas": todos os documentos sem pasta, na ordem escolhida, com a setinha para recolher.
function looseSection(make, asGrid = false) {
  const list = docsIn(null);
  const collapsed = prefs().looseCollapsed;
  const head = h(
    'button',
    {
      class: 'loose-head' + (collapsed ? '' : ' open'),
      'data-drop': 'root',
      title: collapsed ? 'Mostrar documentos fora das pastas' : 'Esconder documentos fora das pastas',
      onclick: () => store.update((s) => (s.prefs.looseCollapsed = !s.prefs.looseCollapsed)),
    },
    h('span', { class: 'chev' }, svg(icons.chevron)),
    'Fora das pastas',
    h('span', { class: 'count' }, String(list.length)),
  );
  if (collapsed) return h('div', { class: 'loose' }, head);
  if (!list.length) return h('div', { class: 'loose' }, head, h('div', { class: 'row empty-hint', style: { paddingLeft: '30px' } }, 'Nenhum documento solto'));
  const items = list.slice(0, ui.looseLimit).map(make);
  const rest = list.length - ui.looseLimit;
  return h(
    'div',
    { class: 'loose' },
    head,
    asGrid ? h('div', { class: 'grid' }, items) : items,
    rest > 0
      ? h(
          'button',
          {
            class: 'show-more',
            onclick: () => {
              ui.looseLimit += LOOSE_PAGE * 2;
              render();
            },
          },
          `Mostrar mais (${rest})`,
        )
      : null,
  );
}

// ----- modo ícones (grade) -----

function renderGrid() {
  const folders = foldersIn(ui.cwd).map(folderTile);
  if (ui.cwd) {
    const items = [...folders, ...docsIn(ui.cwd).map(docTile)];
    content.append(
      items.length ? h('div', { class: 'grid' }, items) : h('div', { class: 'empty' }, h('p', {}, 'Pasta vazia. Arraste documentos ou pastas para cá.')),
    );
  } else {
    if (folders.length) content.append(h('div', { class: 'grid' }, folders));
    content.append(looseSection(docTile, true));
  }
}

function folderTile(f) {
  const n = C.countDeep(data.s, data.byFolder, f.id);
  return h(
    'div',
    {
      class: 'tile folder',
      draggable: 'true',
      'data-kind': 'folder',
      'data-id': f.id,
      style: { '--c': f.color },
      title: f.name,
      onclick: () => enter(f.id),
      oncontextmenu: (e) => {
        e.preventDefault();
        folderMenu(f.id, e.clientX, e.clientY);
      },
    },
    svg(icons.folder(46)),
    h('span', { class: 'name' }, f.name),
    h('span', { class: 'sub' }, n === 1 ? '1 doc' : `${n} docs`),
    moreBtn((r) => folderMenu(f.id, r.left, r.bottom + 4)),
  );
}

function docTile(d) {
  return h(
    'div',
    {
      class: 'tile doc' + (ui.active?.id === d.id ? ' current-doc' : ''),
      draggable: 'true',
      'data-kind': 'doc',
      'data-id': d.id,
      title: d.title,
      onclick: () => S.openDoc(d.id),
      oncontextmenu: (e) => {
        e.preventDefault();
        docMenu(d.id, e.clientX, e.clientY);
      },
    },
    svg(icons.doc(42)),
    h('span', { class: 'name' }, d.title),
    moreBtn((r) => docMenu(d.id, r.left, r.bottom + 4)),
  );
}

function renderCrumbs() {
  const nav = $('#crumbs');
  const show = prefs().view === 'grid' && !ui.search;
  nav.hidden = !show;
  if (!show) return;
  const path = S.folderPath(st(), ui.cwd);
  const crumb = (id, label, current) =>
    h('button', { class: 'crumb' + (current ? ' current' : ''), 'data-drop': 'folder', 'data-folder': id || '', onclick: () => enter(id) }, label);
  const parts = [crumb(null, 'Início', !path.length)];
  path.forEach((f, i) => parts.push(h('span', { class: 'sep' }, '›'), crumb(f.id, f.name, i === path.length - 1)));
  if (path.length) parts.unshift(h('button', { class: 'icon-btn', title: 'Voltar', onclick: () => enter(path.at(-2)?.id || null) }, svg(icons.back)));
  nav.replaceChildren(...parts);
}

function enter(id) {
  ui.cwd = id || null;
  content.scrollTop = 0;
  render();
}

// ----- busca -----

function renderSearch() {
  const s = data.s;
  const q = C.norm(ui.search);
  const folders = Object.values(s.folders)
    .filter((f) => C.norm(f.name).includes(q))
    .sort(S.byName);
  const docs = S.sorted(
    data.all.filter((d) => C.norm(d.title).includes(q)),
    prefs().sort,
  ).slice(0, 300);
  if (!folders.length && !docs.length) {
    content.append(h('div', { class: 'no-results' }, `Nada encontrado para “${ui.search}”.`));
    return;
  }
  for (const f of folders) {
    content.append(
      h(
        'div',
        {
          class: 'row folder result',
          'data-kind': 'folder',
          'data-id': f.id,
          draggable: 'true',
          style: { paddingLeft: '6px', '--c': f.color },
          onclick: () => {
            clearSearch();
            reveal('folder', f.id);
          },
          oncontextmenu: (e) => {
            e.preventDefault();
            folderMenu(f.id, e.clientX, e.clientY);
          },
        },
        h('span', { class: 'twisty empty' }),
        svg(icons.folder(18)),
        h('span', { class: 'name' }, f.name),
        h('span', { class: 'path' }, f.parent ? C.pathText(s, f.parent) : ''),
      ),
    );
  }
  for (const d of docs) content.append(docRow(d, 0, { cls: ' result', after: h('span', { class: 'path' }, C.pathText(s, d.folder)) }));
}

function clearSearch() {
  ui.search = '';
  $('#search').value = '';
}

// ---------- ações ----------

function toggleOpen(id) {
  ui.open.has(id) ? ui.open.delete(id) : ui.open.add(id);
  saveOpen();
  render();
}

async function newFolder(parent) {
  clearSearch();
  let id;
  await store.update((s) => {
    id = S.addFolder(s, C.uniqueName(s, 'Nova pasta', parent), parent);
  });
  if (parent) {
    ui.open.add(parent);
    saveOpen();
  }
  if (prefs().view === 'grid') ui.cwd = parent;
  render();
  startRename('folder', id);
}

function startRename(kind, id) {
  const el = content.querySelector(`[data-kind="${kind}"][data-id="${id}"] .name`);
  if (!el) return;
  el.closest('[data-kind]').scrollIntoView({ block: 'nearest' });
  const current = kind === 'folder' ? st().folders[id]?.name : data.byId.get(id)?.title;
  ui.editing = true;
  el.closest('[draggable]')?.setAttribute('draggable', 'false');
  inlineEdit(el, current || '', (value) => {
    ui.editing = false;
    ui.pendingRender = false;
    if (value)
      store.update((s) => {
        if (kind === 'folder' && s.folders[id]) s.folders[id].name = value;
        if (kind === 'doc') Object.assign(S.ensureDoc(s, id, store.index()), { title: value, custom: true });
      });
    else render();
  });
}

async function moveTo(kind, id, folder) {
  let moved = false;
  if (kind === 'doc') moved = (await C.moveDocsFlow(store, [id], folder)) > 0;
  else await store.update((s) => (moved = S.moveItem(s, 'folder', id, folder)));
  if (moved && folder) {
    ui.open.add(folder);
    saveOpen();
    render();
  }
  return moved;
}

const picker = (opts) => C.folderPickerItems(st(), opts);

function folderMenu(id, x, y) {
  const f = st().folders[id];
  if (!f) return;
  showMenu(x, y, [
    {
      label: prefs().view === 'grid' ? 'Abrir' : ui.open.has(id) ? 'Recolher' : 'Expandir',
      icon: icons.folder(16),
      onClick: () => (prefs().view === 'grid' ? enter(id) : toggleOpen(id)),
    },
    { label: 'Nova subpasta', icon: icons.folderPlus, onClick: () => newFolder(id) },
    { label: 'Renomear', icon: icons.pencil, onClick: () => afterRender(() => startRename('folder', id)) },
    {
      label: 'Mover para…',
      icon: icons.move,
      onClick: () =>
        showMenu(x, y, picker({ title: `Mover “${f.name}” para`, current: f.parent || null, exclude: id, onPick: (to) => moveTo('folder', id, to) })),
    },
    { label: 'Abrir nos Fluxos', icon: icons.flow, onClick: C.openFlowsTab },
    'sep',
    { title: 'Cor' },
    { colors: S.COLORS, value: f.color, onPick: (c) => store.update((s) => (s.folders[id].color = c)) },
    'sep',
    {
      label: 'Apagar pasta',
      icon: icons.trash,
      danger: true,
      onClick: async () => {
        const parent = f.parent || null;
        if (await C.deleteFolderFlow(store, id)) {
          if (ui.cwd === id) ui.cwd = parent;
          ui.open.delete(id);
          if (parent) ui.open.add(parent);
          saveOpen();
        }
      },
    },
  ]);
}

function docMenu(id, x, y) {
  const d = data.byId.get(id);
  if (!d) return;
  showMenu(x, y, [
    { label: 'Abrir', icon: icons.external, onClick: () => S.openDoc(id) },
    { label: 'Renomear na lista', icon: icons.pencil, onClick: () => afterRender(() => startRename('doc', id)) },
    {
      label: 'Mover para…',
      icon: icons.move,
      onClick: () => showMenu(x, y, picker({ title: 'Mover para', current: d.folder || null, onPick: (to) => moveTo('doc', id, to) })),
    },
    { label: 'Mostrar onde está', icon: icons.target, onClick: () => (clearSearch(), reveal('doc', id)) },
    { label: 'Copiar link', icon: icons.link, onClick: () => C.copyLink(id) },
    'sep',
    { label: 'Tirar da lista', icon: icons.trash, danger: true, onClick: () => C.hideDocsFlow(store, [id]) },
  ]);
}

function afterRender(fn) {
  requestAnimationFrame(fn);
}

// Mostra um item: abre as pastas de cima, rola até ele e pisca.
function reveal(kind, id) {
  compute();
  const s = data.s;
  const parent = kind === 'folder' ? s.folders[id]?.parent : data.byId.get(id)?.folder;
  if (prefs().view === 'grid') {
    ui.cwd = parent || null;
  } else {
    S.folderPath(s, parent).forEach((f) => ui.open.add(f.id));
    saveOpen();
  }
  if (!parent && kind === 'doc') {
    if (prefs().looseCollapsed) store.update((d) => (d.prefs.looseCollapsed = false));
    const idx = docsIn(null).findIndex((d) => d.id === id);
    if (idx >= ui.looseLimit) ui.looseLimit = idx + 20;
  }
  render();
  afterRender(() => {
    const el = content.querySelector(`[data-kind="${kind}"][data-id="${id}"]`);
    if (!el) return;
    el.scrollIntoView({ block: 'center' });
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
  });
}

// ---------- documento aberto na aba atual ----------

async function refreshActive() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const id = S.docIdFromUrl(tab?.url);
  const next = id ? { id, title: S.cleanTitle(tab.title) || 'Documento sem título', tabId: tab.id } : null;
  if (JSON.stringify(next) === JSON.stringify(ui.active)) return;
  ui.active = next;
  render();
}

function renderActive() {
  const box = $('#active');
  const a = ui.active;
  box.hidden = !a;
  if (!a) return;
  const d = data.byId.get(a.id);
  const folder = d?.folder || null;
  const title = d?.title || a.title;
  box.replaceChildren(
    svg(icons.doc(22)),
    h(
      'div',
      { class: 'meta' },
      h('div', { class: 't' }, title),
      h('div', { class: 's' }, folder ? ['Na pasta ', h('b', {}, C.pathText(data.s, folder))] : 'Fora das pastas'),
    ),
    folder ? h('button', { class: 'icon-btn', title: 'Mostrar na lista', onclick: () => (clearSearch(), reveal('doc', a.id)) }, svg(icons.target)) : null,
    h(
      'button',
      {
        class: folder ? 'icon-btn' : 'btn primary',
        title: folder ? 'Mover para outra pasta' : 'Guardar numa pasta',
        onclick: (e) => menuAt(e.currentTarget, picker({ title: folder ? 'Mover para' : 'Guardar em', current: folder, onPick: (to) => saveActive(to) })),
      },
      folder ? svg(icons.move) : 'Guardar',
    ),
  );
}

async function saveActive(folder) {
  const a = ui.active;
  if (!a) return;
  await store.update((s) => {
    if (!s.docs[a.id]) S.addDoc(s, a.id, a.title, folder);
    else S.moveItem(s, 'doc', a.id, folder);
  });
  if (folder) {
    ui.open.add(folder);
    saveOpen();
  }
  reveal('doc', a.id);
  toast(folder ? `Guardado em “${st().folders[folder].name}”` : 'Fora das pastas');
}

// ---------- arrastar e soltar ----------

let drag = null; // { kind, id } quando o arraste começa dentro do painel
let marked = null;
let hoverTimer = null;

function clearMark() {
  marked?.el.classList.remove('drop-into', 'drop-before', 'drop-after', 'drop-root');
  marked = null;
  clearTimeout(hoverTimer);
}

function mark(el, cls) {
  if (marked?.el === el && marked.cls === cls) return;
  clearMark();
  el.classList.add(cls);
  marked = { el, cls };
  // Passar com o arraste sobre uma pasta fechada abre ela.
  if (cls === 'drop-into' && el.dataset.kind === 'folder' && prefs().view === 'list' && !ui.open.has(el.dataset.id)) {
    const id = el.dataset.id;
    hoverTimer = setTimeout(() => {
      ui.open.add(id);
      saveOpen();
      render();
    }, 800);
  }
}

document.addEventListener('dragstart', (e) => {
  const el = e.target.closest?.('[data-kind][data-id]');
  if (!el) return;
  drag = { kind: el.dataset.kind, id: el.dataset.id };
  e.dataTransfer.effectAllowed = 'copyMove';
  e.dataTransfer.setData('application/x-pastas-docs', JSON.stringify(drag));
  if (drag.kind === 'doc') {
    e.dataTransfer.setData('text/uri-list', S.DOC_URL(drag.id));
    e.dataTransfer.setData('text/plain', S.DOC_URL(drag.id));
  }
  requestAnimationFrame(() => el.classList.add('dragging'));
});

document.addEventListener('dragend', () => {
  document.querySelectorAll('.dragging').forEach((el) => el.classList.remove('dragging'));
  drag = null;
  clearMark();
});

// Decide o que acontece se soltar aqui.
function dropPlan(e) {
  const s = st();
  const manual = prefs().sort === 'manual' && !ui.search;
  const grid = prefs().view === 'grid';
  const item = e.target.closest?.('[data-kind][data-id]');
  const zone = e.target.closest?.('[data-drop]');

  if (item) {
    const { kind, id } = item.dataset;
    const r = item.getBoundingClientRect();
    const t = grid ? (e.clientX - r.left) / r.width : (e.clientY - r.top) / r.height;
    if (kind === 'folder') {
      if (drag?.kind === 'folder' && manual && (t < 0.25 || t > 0.75)) {
        if (drag.id === id) return null;
        return { el: item, cls: t < 0.25 ? 'drop-before' : 'drop-after', act: { place: true, kind: 'folder', id: drag.id, target: id, after: t > 0.75 } };
      }
      if (drag?.kind === 'folder' && (drag.id === id || S.isDescendant(s, id, drag.id))) return null;
      return { el: item, cls: 'drop-into', act: { into: id } };
    }
    // alvo é documento
    if (drag?.kind === 'doc' && manual) {
      if (drag.id === id) return null;
      return { el: item, cls: t < 0.5 ? 'drop-before' : 'drop-after', act: { place: true, kind: 'doc', id: drag.id, target: id, after: t >= 0.5 } };
    }
    const into = data.byId.get(id)?.folder || null;
    return { el: content, cls: 'drop-root', act: { into } };
  }
  if (zone?.dataset.drop === 'root') return { el: zone, cls: 'drop-into', act: { into: null } };
  if (zone?.dataset.drop === 'folder') {
    const into = zone.dataset.folder || null;
    if (drag?.kind === 'folder' && into && (drag.id === into || S.isDescendant(s, into, drag.id))) return null;
    return { el: zone, cls: 'drop-into', act: { into } };
  }
  if (e.target.closest?.('#content')) return { el: content, cls: 'drop-root', act: { into: grid ? ui.cwd : null } };
  return null;
}

document.addEventListener('dragover', (e) => {
  if (ui.search && !drag) return;
  const plan = dropPlan(e);
  if (!plan) {
    clearMark();
    return;
  }
  e.preventDefault();
  e.dataTransfer.dropEffect = drag ? 'move' : 'copy';
  mark(plan.el, plan.cls);
});

document.addEventListener('dragleave', (e) => {
  if (!e.relatedTarget) clearMark();
});

document.addEventListener('drop', async (e) => {
  const plan = dropPlan(e);
  clearMark();
  if (!plan) return;
  e.preventDefault();
  const { act } = plan;
  if (drag) {
    if (act.place && act.kind === 'doc') {
      await store.update((s) => {
        S.ensureDoc(s, act.id, store.index());
        S.ensureDoc(s, act.target, store.index());
        S.placeItem(s, 'doc', act.id, act.target, act.after);
      });
    } else if (act.place) {
      await store.update((s) => S.placeItem(s, act.kind, act.id, act.target, act.after));
    } else {
      await moveTo(drag.kind, drag.id, act.into);
    }
    return;
  }
  // Veio de fora: um documento arrastado da lista do Google Docs ou um link de outra página.
  await dropExternal(e.dataTransfer, act.into ?? (act.place ? data.byId.get(act.target)?.folder : null));
});

async function dropExternal(dt, folder) {
  const { ids, title } = C.idsFromDrop(dt);
  if (!ids.length) {
    toast('Solte aqui links de Google Docs');
    return;
  }
  const missing = [];
  await store.update((s) => {
    for (const id of ids) {
      const known = store.index().docs[id]?.t;
      if (!s.docs[id]) {
        S.addDoc(s, id, (ids.length === 1 && title) || known, folder);
        if (!known && !(ids.length === 1 && title)) missing.push(id);
      } else S.moveItem(s, 'doc', id, folder);
    }
  });
  if (folder) {
    ui.open.add(folder);
    saveOpen();
    render();
  }
  toast(folder ? `Guardado em “${st().folders[folder].name}”` : C.plural(ids.length, 'documento adicionado', 'documentos adicionados'));
  for (const id of missing) {
    const t = await S.fetchDocTitle(id);
    if (t) store.update((s) => s.docs[id] && !s.docs[id].custom && (s.docs[id].title = t));
  }
}

// ---------- ligações iniciais ----------

C.iconize();

$('#viewSeg').addEventListener('click', (e) => {
  const v = e.target.closest('button')?.dataset.view;
  if (v && v !== prefs().view) store.update((s) => (s.prefs.view = v));
});
$('#sortSeg').addEventListener('click', (e) => {
  const v = e.target.closest('button')?.dataset.sort;
  if (v && v !== prefs().sort) store.update((s) => (s.prefs.sort = v));
});
$('#newFolderBtn').addEventListener('click', () => newFolder(prefs().view === 'grid' ? ui.cwd : null));
$('#flowsBtn').addEventListener('click', C.openFlowsTab);
$('#settingsBtn').addEventListener('click', () => C.openSettings(store));
$('#modeBtn').addEventListener('click', (e) =>
  menuAt(e.currentTarget, [
    ...C.modeMenuItems(store),
    'sep',
    { label: 'Abrir a tela cheia numa aba', icon: icons.external, onClick: () => chrome.tabs.create({ url: chrome.runtime.getURL('app.html') }) },
  ]),
);
$('#search').addEventListener('input', (e) => {
  ui.search = e.target.value.trim();
  render();
});

store.subscribe(() => {
  if (!ui.editing) render();
});

chrome.tabs.onActivated.addListener(refreshActive);
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (tab.active && (info.url || info.title || info.status === 'complete')) refreshActive();
});
chrome.windows.onFocusChanged.addListener(refreshActive);

await store.init();
await refreshActive();
render();
