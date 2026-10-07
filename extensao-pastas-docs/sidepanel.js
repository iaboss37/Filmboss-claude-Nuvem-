import * as S from './store.js';
import { icons, h, svg, showMenu, menuAt, confirmBox, promptBox, toast, inlineEdit, fmtDate } from './ui.js';

const store = S.createStore();
const $ = (sel) => document.querySelector(sel);
const content = $('#content');

const ui = {
  cwd: null, // pasta aberta no modo ícones
  search: '',
  open: new Set(readLocalPref('open', [])), // pastas expandidas no modo lista (por computador)
  active: null, // { id, title, tabId } do Google Doc aberto na aba atual
  editing: false,
  pendingRender: false,
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

// ---------- render ----------

function render() {
  if (ui.editing) {
    ui.pendingRender = true;
    return;
  }
  const s = st();
  if (ui.cwd && !s.folders[ui.cwd]) ui.cwd = null;
  document.querySelectorAll('#viewSeg button').forEach((b) => b.classList.toggle('on', b.dataset.view === prefs().view));
  document.querySelectorAll('#sortSeg button').forEach((b) => b.classList.toggle('on', b.dataset.sort === prefs().sort));
  renderActive();
  renderCrumbs();

  const scroll = content.scrollTop;
  content.replaceChildren();
  if (ui.search) renderSearch();
  else if (!Object.keys(s.folders).length && !Object.keys(s.docs).length) renderEmpty();
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
      h('h2', {}, 'Nenhuma pasta ainda'),
      h('p', {}, 'Crie uma pasta, ou abra um Google Doc e clique em “Salvar” no cartão que aparece aqui em cima.'),
      h('button', { class: 'btn primary', onclick: () => newFolder(null) }, svg(icons.folderPlus), 'Criar primeira pasta'),
    ),
  );
}

// ----- modo lista (árvore) -----

function renderList() {
  const s = st();
  const sort = prefs().sort;
  const out = [];
  const walk = (parent, depth) => {
    for (const f of S.sorted(S.childFolders(s, parent), sort)) {
      const isOpen = ui.open.has(f.id);
      out.push(folderRow(f, depth, isOpen));
      if (!isOpen) continue;
      const before = out.length;
      walk(f.id, depth + 1);
      for (const d of S.sorted(S.childDocs(s, f.id), sort)) out.push(docRow(d, depth + 1));
      if (out.length === before) out.push(h('div', { class: 'row empty-hint', style: pad(depth + 1) }, 'Pasta vazia'));
    }
  };
  walk(null, 0);
  content.append(...out);
  content.append(looseSection(S.sorted(S.childDocs(s, null), sort).map((d) => docRow(d, 0))));
}

const pad = (depth) => ({ paddingLeft: 6 + depth * 16 + 'px' });

function folderRow(f, depth, isOpen) {
  const s = st();
  const hasKids = S.childFolders(s, f.id).length || S.childDocs(s, f.id).length;
  const n = S.countDocsDeep(s, f.id);
  const name = h('span', { class: 'name' }, f.name);
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
    name,
    n ? h('span', { class: 'count' }, String(n)) : null,
    moreBtn(),
  );
  row.querySelector('.more').onclick = (e) => {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    folderMenu(f.id, r.left, r.bottom + 4);
  };
  return row;
}

function docRow(d, depth, extra) {
  const row = h(
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
    moreBtn(),
  );
  row.querySelector('.more').onclick = (e) => {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    docMenu(d.id, r.left, r.bottom + 4);
  };
  return row;
}

function moreBtn() {
  return h('button', { class: 'more', title: 'Opções', tabindex: '0' }, svg(icons.more));
}

function looseSection(children, asGrid = false) {
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
    h('span', { class: 'count' }, String(children.length)),
  );
  const body = collapsed
    ? null
    : children.length
      ? asGrid
        ? h('div', { class: 'grid' }, children)
        : children
      : h('div', { class: 'row empty-hint', style: { paddingLeft: '30px' } }, 'Nenhum documento solto');
  return h('div', { class: 'loose' }, head, body);
}

// ----- modo ícones (grade) -----

function renderGrid() {
  const s = st();
  const sort = prefs().sort;
  const folders = S.sorted(S.childFolders(s, ui.cwd), sort).map(folderTile);
  const docs = S.sorted(S.childDocs(s, ui.cwd), sort).map(docTile);
  if (ui.cwd) {
    const items = [...folders, ...docs];
    content.append(
      items.length ? h('div', { class: 'grid' }, items) : h('div', { class: 'empty' }, h('p', {}, 'Pasta vazia. Arraste documentos ou pastas para cá.')),
    );
  } else {
    if (folders.length) content.append(h('div', { class: 'grid' }, folders));
    content.append(looseSection(docs, true));
  }
}

function folderTile(f) {
  const n = S.countDocsDeep(st(), f.id);
  const tile = h(
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
    moreBtn(),
  );
  tile.querySelector('.more').onclick = (e) => {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    folderMenu(f.id, r.left, r.bottom + 4);
  };
  return tile;
}

function docTile(d) {
  const tile = h(
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
    moreBtn(),
  );
  tile.querySelector('.more').onclick = (e) => {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    docMenu(d.id, r.left, r.bottom + 4);
  };
  return tile;
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
  const s = st();
  const q = norm(ui.search);
  const pathOf = (folderId) =>
    S.folderPath(s, folderId)
      .map((f) => f.name)
      .join(' › ') || 'Fora das pastas';
  const folders = Object.values(s.folders)
    .filter((f) => norm(f.name).includes(q))
    .sort(S.byName);
  const docs = Object.values(s.docs)
    .filter((d) => norm(d.title).includes(q))
    .sort(S.byName);
  if (!folders.length && !docs.length) {
    content.append(h('div', { class: 'no-results' }, `Nada encontrado para “${ui.search}”.`));
    return;
  }
  for (const f of folders) {
    const row = h(
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
      h('span', { class: 'path' }, f.parent ? pathOf(f.parent) : ''),
    );
    content.append(row);
  }
  for (const d of docs) content.append(docRow(d, 0, { cls: ' result', after: h('span', { class: 'path' }, pathOf(d.folder)) }));
}

const norm = (t) => (t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

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

function uniqueName(base, parent) {
  const names = new Set(S.childFolders(st(), parent).map((f) => f.name.toLowerCase()));
  if (!names.has(base.toLowerCase())) return base;
  let i = 2;
  while (names.has(`${base} ${i}`.toLowerCase())) i++;
  return `${base} ${i}`;
}

async function newFolder(parent) {
  clearSearch();
  let id;
  await store.update((s) => {
    id = S.addFolder(s, uniqueName('Nova pasta', parent), parent);
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
  const current = kind === 'folder' ? st().folders[id]?.name : st().docs[id]?.title;
  ui.editing = true;
  el.closest('[draggable]')?.setAttribute('draggable', 'false');
  inlineEdit(el, current || '', (value) => {
    ui.editing = false;
    ui.pendingRender = false;
    if (value)
      store.update((s) => {
        if (kind === 'folder' && s.folders[id]) s.folders[id].name = value;
        if (kind === 'doc' && s.docs[id]) Object.assign(s.docs[id], { title: value, custom: true });
      });
    else render();
  });
}

async function deleteFolderFlow(id) {
  const s = st();
  const f = s.folders[id];
  if (!f) return;
  const subs = S.childFolders(s, id).length;
  const docs = S.childDocs(s, id).length;
  const dest = f.parent ? `a pasta “${s.folders[f.parent].name}”` : 'fora das pastas';
  const what = [docs && `${docs} documento${docs > 1 ? 's' : ''}`, subs && `${subs} subpasta${subs > 1 ? 's' : ''}`].filter(Boolean).join(' e ');
  const ok = await confirmBox({
    title: `Apagar a pasta “${f.name}”?`,
    message: what ? `Nada é perdido: ${what} ${subs + docs > 1 ? 'vão' : 'vai'} para ${dest}.` : 'A pasta está vazia.',
    ok: 'Apagar pasta',
    danger: true,
  });
  if (!ok) return;
  const snapshot = structuredClone(st());
  if (ui.cwd === id) ui.cwd = f.parent || null;
  ui.open.delete(id);
  if (f.parent && (subs || docs)) ui.open.add(f.parent);
  saveOpen();
  await store.update((d) => S.deleteFolder(d, id));
  toast(`Pasta “${f.name}” apagada`, { label: 'Desfazer', onClick: () => store.replace(snapshot) });
}

async function removeDoc(id) {
  const d = st().docs[id];
  if (!d) return;
  const snapshot = structuredClone(st());
  await store.update((s) => delete s.docs[id]);
  toast('Removido da lista (o Doc continua no Google Drive)', { label: 'Desfazer', onClick: () => store.replace(snapshot) });
}

function moveTo(kind, id, folder) {
  let moved = false;
  store.update((s) => (moved = S.moveItem(s, kind, id, folder)));
  if (moved && folder) {
    ui.open.add(folder);
    saveOpen();
  }
  return moved;
}

// Lista de pastas para escolher destino (mover / salvar).
function folderPicker({ title, current, exclude, onPick }) {
  const s = st();
  const items = [{ title }];
  items.push({ label: 'Fora das pastas', icon: icons.doc(16), disabled: current === null, onClick: () => onPick(null) });
  const walk = (parent, depth) => {
    for (const f of S.sorted(S.childFolders(s, parent), 'name')) {
      const blocked = exclude && (f.id === exclude || S.isDescendant(s, f.id, exclude));
      items.push({
        label: f.name,
        icon: icons.folder(16).replace('class="folder-ico"', `class="folder-ico" style="color:${f.color}"`),
        indent: depth,
        disabled: blocked || f.id === current,
        onClick: () => onPick(f.id),
      });
      walk(f.id, depth + 1);
    }
  };
  walk(null, 0);
  if (items.length === 2) items.push({ label: 'Crie uma pasta primeiro', disabled: true });
  return items;
}

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
        showMenu(x, y, folderPicker({ title: `Mover “${f.name}” para`, current: f.parent || null, exclude: id, onPick: (to) => moveTo('folder', id, to) })),
    },
    { label: 'Abrir nos Fluxos', icon: icons.flow, onClick: () => openFlows() },
    'sep',
    { title: 'Cor' },
    { colors: S.COLORS, value: f.color, onPick: (c) => store.update((s) => (s.folders[id].color = c)) },
    'sep',
    { label: 'Apagar pasta', icon: icons.trash, danger: true, onClick: () => deleteFolderFlow(id) },
  ]);
}

function docMenu(id, x, y) {
  const d = st().docs[id];
  if (!d) return;
  showMenu(x, y, [
    { label: 'Abrir', icon: icons.external, onClick: () => S.openDoc(id) },
    { label: 'Renomear', icon: icons.pencil, onClick: () => afterRender(() => startRename('doc', id)) },
    {
      label: 'Mover para…',
      icon: icons.move,
      onClick: () => showMenu(x, y, folderPicker({ title: 'Mover para', current: d.folder || null, onPick: (to) => moveTo('doc', id, to) })),
    },
    { label: 'Mostrar onde está', icon: icons.target, onClick: () => (clearSearch(), reveal('doc', id)) },
    {
      label: 'Copiar link',
      icon: icons.link,
      onClick: async () => {
        await navigator.clipboard.writeText(S.DOC_URL(id));
        toast('Link copiado');
      },
    },
    'sep',
    { label: 'Remover da lista', icon: icons.trash, danger: true, onClick: () => removeDoc(id) },
  ]);
}

function afterRender(fn) {
  requestAnimationFrame(fn);
}

// Mostra um item: abre as pastas de cima, rola até ele e pisca.
function reveal(kind, id) {
  const s = st();
  const parent = kind === 'folder' ? s.folders[id]?.parent : s.docs[id]?.folder;
  if (prefs().view === 'grid') {
    ui.cwd = parent || null;
  } else {
    S.folderPath(s, parent).forEach((f) => ui.open.add(f.id));
    saveOpen();
  }
  if (!parent && kind === 'doc' && prefs().looseCollapsed) store.update((d) => (d.prefs.looseCollapsed = false));
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

async function openFlows() {
  const url = chrome.runtime.getURL('flows.html');
  const [tab] = await chrome.tabs.query({ url }).catch(() => []);
  if (tab) {
    chrome.tabs.update(tab.id, { active: true });
    chrome.windows.update(tab.windowId, { focused: true });
  } else chrome.tabs.create({ url });
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
  const s = st();
  const saved = s.docs[a.id];
  if (saved) {
    const where = saved.folder
      ? S.folderPath(s, saved.folder)
          .map((f) => f.name)
          .join(' › ')
      : 'Fora das pastas';
    box.replaceChildren(
      svg(icons.doc(22)),
      h('div', { class: 'meta' }, h('div', { class: 't' }, saved.title), h('div', { class: 's' }, 'Salvo em ', h('b', {}, where))),
      h('button', { class: 'icon-btn', title: 'Mostrar na lista', onclick: () => (clearSearch(), reveal('doc', a.id)) }, svg(icons.target)),
      h(
        'button',
        {
          class: 'icon-btn',
          title: 'Mover para outra pasta',
          onclick: (e) =>
            menuAt(e.currentTarget, folderPicker({ title: 'Mover para', current: saved.folder || null, onPick: (to) => moveTo('doc', a.id, to) })),
        },
        svg(icons.move),
      ),
    );
  } else {
    box.replaceChildren(
      svg(icons.doc(22)),
      h('div', { class: 'meta' }, h('div', { class: 't' }, a.title), h('div', { class: 's' }, 'Este documento ainda não está salvo')),
      h(
        'button',
        {
          class: 'btn primary',
          onclick: (e) =>
            menuAt(
              e.currentTarget,
              folderPicker({
                title: 'Salvar em',
                current: undefined,
                onPick: (to) => saveActive(to),
              }),
            ),
        },
        'Salvar',
      ),
    );
  }
}

async function saveActive(folder) {
  const a = ui.active;
  if (!a) return;
  await store.update((s) => S.addDoc(s, a.id, a.title, folder));
  if (folder) {
    ui.open.add(folder);
    saveOpen();
  }
  reveal('doc', a.id);
  toast('Documento salvo');
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
    const into = s.docs[id]?.folder || null;
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
    if (act.place) {
      await store.update((s) => S.placeItem(s, act.kind, act.id, act.target, act.after));
    } else if (!moveTo(drag.kind, drag.id, act.into)) {
      return;
    }
    return;
  }
  // Veio de fora (link de um Google Doc arrastado de outra página).
  await dropExternal(e.dataTransfer, act.into ?? (act.place ? st().docs[act.target]?.folder : null));
});

async function dropExternal(dt, folder) {
  const text = [dt.getData('text/uri-list'), dt.getData('text/plain'), dt.getData('text/html')].join('\n');
  const ids = [...new Set((text.match(/https?:\/\/docs\.google\.com\/document\/[^\s"'<>]+/g) || []).map(S.docIdFromUrl).filter(Boolean))];
  if (!ids.length) {
    toast('Solte aqui links de Google Docs');
    return;
  }
  let anchorText = null;
  const html = dt.getData('text/html');
  if (html && ids.length === 1) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    anchorText = S.cleanTitle(doc.querySelector('a')?.textContent?.trim());
    if (anchorText && /^https?:/.test(anchorText)) anchorText = null;
  }
  const added = [];
  await store.update((s) => {
    for (const id of ids) if (S.addDoc(s, id, ids.length === 1 ? anchorText : null, folder)) added.push(id);
  });
  if (folder) {
    ui.open.add(folder);
    saveOpen();
    render();
  }
  toast(added.length ? `${added.length} documento${added.length > 1 ? 's' : ''} adicionado${added.length > 1 ? 's' : ''}` : 'Esse documento já estava salvo');
  for (const id of added) {
    if (anchorText && ids.length === 1) continue;
    const title = await S.fetchDocTitle(id);
    if (title) store.update((s) => s.docs[id] && !s.docs[id].custom && (s.docs[id].title = title));
  }
}

// ---------- configurações: sincronização e backup ----------

async function openSettings() {
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
    const s = st();
    const nF = Object.keys(s.folders).length;
    const nD = Object.keys(s.docs).length;
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
            `${nF} pasta${nF === 1 ? '' : 's'}, ${nD} documento${nD === 1 ? '' : 's'} · ${used}% do espaço de sincronização usado`,
          ),
          h('div', { class: 'bar' }, h('span', { style: { width: Math.max(used, 2) + '%' } })),
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
                await S.writeSync(st());
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
        h('button', { class: 'btn', onclick: downloadBackup }, svg(icons.download), 'Baixar backup'),
        h('button', { class: 'btn', onclick: () => importBackup(fill) }, svg(icons.upload), 'Restaurar de arquivo'),
      ),

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
                      await S.addBackup(st(), 'Antes de restaurar uma cópia', true);
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
        'Abra o painel com ',
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

function downloadBackup() {
  const s = st();
  const blob = new Blob([JSON.stringify({ app: 'pastas-docs', exportedAt: Date.now(), state: s }, null, 2)], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: `pastas-docs-backup-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function importBackup(after) {
  const input = h('input', { type: 'file', accept: '.json,application/json' });
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const state = S.normalize(data.state || data);
      const nF = Object.keys(state.folders).length;
      const nD = Object.keys(state.docs).length;
      const ok = await confirmBox({
        title: 'Restaurar este backup?',
        message: `O arquivo tem ${nF} pastas e ${nD} documentos e vai substituir a organização atual. A atual vira uma cópia automática, então dá para voltar.`,
        ok: 'Restaurar',
      });
      if (!ok) return;
      await S.addBackup(st(), 'Antes de restaurar um arquivo', true);
      await store.replace(state);
      toast('Backup restaurado');
      after?.();
    } catch {
      toast('Esse arquivo não é um backup válido');
    }
  };
  input.click();
}

// ---------- ligações iniciais ----------

document
  .querySelectorAll('i[data-icon]')
  .forEach((i) => i.replaceWith(svg(typeof icons[i.dataset.icon] === 'function' ? icons[i.dataset.icon](16) : icons[i.dataset.icon])));

$('#viewSeg').addEventListener('click', (e) => {
  const v = e.target.closest('button')?.dataset.view;
  if (v && v !== prefs().view) store.update((s) => (s.prefs.view = v));
});
$('#sortSeg').addEventListener('click', (e) => {
  const v = e.target.closest('button')?.dataset.sort;
  if (v && v !== prefs().sort) store.update((s) => (s.prefs.sort = v));
});
$('#newFolderBtn').addEventListener('click', () => newFolder(prefs().view === 'grid' ? ui.cwd : null));
$('#flowsBtn').addEventListener('click', openFlows);
$('#settingsBtn').addEventListener('click', openSettings);
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
