// Tela cheia: aparece no lugar da tela inicial do Google Docs (ou numa aba própria).
import * as S from './store.js';
import * as C from './common.js';
import { icons, h, svg, showMenu, promptBox, toast } from './ui.js';

const store = S.createStore();
const embed = new URLSearchParams(location.search).has('embed');
const $ = (sel) => document.querySelector(sel);
const mainEl = $('#main');

const pref = (k, d) => {
  try {
    return JSON.parse(localStorage.getItem('pd.' + k)) ?? d;
  } catch {
    return d;
  }
};
const setPref = (k, v) => {
  try {
    localStorage.setItem('pd.' + k, JSON.stringify(v));
  } catch {}
};

const PAGE = 120;
const ui = {
  place: pref('appPlace', { kind: 'home' }), // home | all | loose | folder
  q: '',
  sel: new Set(),
  lastSel: null,
  open: new Set(pref('appOpen', [])),
  view: pref('appView', 'grid'),
  limit: PAGE,
  visible: [], // ids de documentos na tela, na ordem (para shift+clique e selecionar todos)
};

let data = null; // calculado a cada render

const st = () => store.get();
const prefs = () => st().prefs;

function compute() {
  const s = st();
  const all = store.docs();
  const byFolder = C.docsByFolder(all);
  const byId = new Map(all.map((d) => [d.id, d]));
  data = { s, all, byFolder, byId };
}

// ---------- render ----------

function render() {
  compute();
  const { s } = data;
  if (ui.place.kind === 'folder' && !s.folders[ui.place.id]) ui.place = { kind: 'home' };
  for (const id of ui.sel) if (!data.byId.has(id)) ui.sel.delete(id);
  document.querySelectorAll('#modeSeg button').forEach((b) => b.classList.toggle('on', b.dataset.mode === prefs().mode));
  renderNav();
  renderHead();
  renderSelbar();
  const scroll = mainEl.scrollTop;
  renderMain();
  mainEl.scrollTop = scroll;
}

function go(place) {
  ui.place = place;
  ui.limit = PAGE;
  ui.sel.clear();
  setPref('appPlace', place);
  if (ui.q) {
    ui.q = '';
    $('#q').value = '';
  }
  render();
  mainEl.scrollTop = 0;
}

const isPlace = (kind, id) => ui.place.kind === kind && (kind !== 'folder' || ui.place.id === id);

// ----- lateral -----

function renderNav() {
  const { s, all, byFolder } = data;
  const loose = byFolder.get(null)?.length || 0;
  const item = (kind, icon, label, count, extra = {}) =>
    h(
      'div',
      { class: 'nav-item' + (isPlace(kind) && !ui.q ? ' on' : ''), onclick: () => go({ kind }), ...extra },
      svg(icon),
      h('span', { class: 'name' }, label),
      count != null ? h('span', { class: 'count' }, String(count)) : null,
    );

  const tree = [];
  const walk = (parent, depth) => {
    for (const f of S.sorted(S.childFolders(s, parent), 'name')) {
      const kids = S.childFolders(s, f.id).length;
      const isOpen = ui.open.has(f.id);
      tree.push(
        h(
          'div',
          {
            class: 'nav-item' + (isPlace('folder', f.id) && !ui.q ? ' on' : ''),
            style: { paddingLeft: 8 + depth * 16 + 'px', '--c': f.color },
            draggable: 'true',
            'data-kind': 'folder',
            'data-id': f.id,
            'data-drop-folder': f.id,
            onclick: () => go({ kind: 'folder', id: f.id }),
            oncontextmenu: (e) => {
              e.preventDefault();
              folderMenu(f.id, e.clientX, e.clientY);
            },
          },
          h(
            'button',
            {
              class: 'twisty' + (isOpen ? ' open' : '') + (kids ? '' : ' empty'),
              onclick: (e) => {
                e.stopPropagation();
                toggleOpen(f.id);
              },
            },
            svg(icons.chevron),
          ),
          svg(icons.folder(18)),
          h('span', { class: 'name' }, f.name),
          h('span', { class: 'count' }, String(C.countDeep(s, byFolder, f.id) || '')),
        ),
      );
      if (isOpen) walk(f.id, depth + 1);
    }
  };
  walk(null, 0);

  $('#nav').replaceChildren(
    item('home', icons.home, 'Início'),
    item('all', icons.docs, 'Todos os documentos', all.length),
    item('loose', icons.inbox, 'Fora das pastas', loose, { 'data-drop-folder': '' }),
    h('div', { class: 'nav-sec' }, 'Pastas', h('button', { class: 'icon-btn', title: 'Nova pasta', onclick: () => newFolder(null) }, svg(icons.plus))),
    h('div', { class: 'nav-tree' }, tree.length ? tree : h('div', { class: 'nav-empty' }, 'Nenhuma pasta ainda.')),
    h(
      'div',
      { class: 'nav-foot' },
      h('div', { class: 'nav-item', onclick: openFlows }, svg(icons.flow), h('span', { class: 'name' }, 'Fluxos (mapa mental)')),
      h('div', { class: 'nav-item', onclick: () => C.openSettings(store) }, svg(icons.gear), h('span', { class: 'name' }, 'Backup e sincronização')),
    ),
  );
}

function toggleOpen(id) {
  ui.open.has(id) ? ui.open.delete(id) : ui.open.add(id);
  setPref('appOpen', [...ui.open]);
  renderNav();
}

// ----- cabeçalho -----

function renderHead() {
  const { s } = data;
  let title;
  if (ui.q) title = h('div', { class: 'title' }, `Resultados para “${ui.q}”`);
  else if (ui.place.kind === 'folder') {
    const path = S.folderPath(s, ui.place.id);
    const parts = [h('button', { class: 'crumb', 'data-drop-folder': '', onclick: () => go({ kind: 'home' }) }, 'Início')];
    path.forEach((f, i) => {
      parts.push(h('span', { class: 'sep' }, '›'));
      parts.push(
        h(
          'button',
          { class: 'crumb' + (i === path.length - 1 ? ' current' : ''), 'data-drop-folder': f.id, onclick: () => go({ kind: 'folder', id: f.id }) },
          f.name,
        ),
      );
    });
    title = h('div', { class: 'title' }, parts);
  } else {
    const names = { home: 'Início', all: 'Todos os documentos', loose: 'Fora das pastas' };
    const sub = prefs().sort === 'recent' && ui.place.kind !== 'home' ? 'na mesma ordem do Google Docs' : null;
    title = h('div', { class: 'title' }, names[ui.place.kind], sub ? h('span', { class: 'sub' }, sub) : null);
  }

  const sortSeg = h(
    'div',
    { class: 'seg', title: 'Ordem' },
    [
      ['recent', 'Recentes', 'Mesma ordem do Google Docs (abertos por último primeiro)'],
      ['name', 'A–Z', 'Ordem alfabética'],
      ['manual', 'Manual', 'Arraste para posicionar do seu jeito'],
    ].map(([id, label, tip]) =>
      h('button', { class: prefs().sort === id ? 'on' : null, title: tip, onclick: () => store.update((d) => (d.prefs.sort = id)) }, label),
    ),
  );
  const viewSeg = h(
    'div',
    { class: 'seg' },
    h('button', { class: ui.view === 'grid' ? 'on' : null, title: 'Grade', onclick: () => setView('grid') }, svg(icons.grid)),
    h('button', { class: ui.view === 'list' ? 'on' : null, title: 'Lista', onclick: () => setView('list') }, svg(icons.list)),
  );
  const canNew = !ui.q && (ui.place.kind === 'home' || ui.place.kind === 'folder');
  $('#head').replaceChildren(
    title,
    h(
      'div',
      { class: 'tools' },
      canNew
        ? h('button', { class: 'btn', onclick: () => newFolder(ui.place.kind === 'folder' ? ui.place.id : null) }, svg(icons.folderPlus), 'Nova pasta')
        : null,
      sortSeg,
      viewSeg,
    ),
  );
}

function setView(v) {
  ui.view = v;
  setPref('appView', v);
  render();
}

function renderSelbar() {
  const bar = $('#selbar');
  const n = ui.sel.size;
  bar.hidden = !n;
  document.body.classList.toggle('selecting', !!n);
  if (!n) return;
  const ids = [...ui.sel];
  bar.replaceChildren(
    h('span', { class: 'n' }, C.plural(n, 'documento selecionado', 'documentos selecionados')),
    h('button', { class: 'btn', onclick: (e) => C.showMenuAtEl(e.currentTarget, pickerFor(ids)) }, svg(icons.move), 'Mover para…'),
    h('button', { class: 'btn', onclick: selectAllVisible }, 'Selecionar todos'),
    h('button', { class: 'btn danger', onclick: () => hideDocs(ids) }, svg(icons.trash), 'Tirar da lista'),
    h('button', { class: 'icon-btn', title: 'Limpar seleção (Esc)', onclick: clearSel }, svg(icons.x)),
  );
}

// ----- conteúdo -----

function renderMain() {
  const { s, all, byFolder } = data;
  const sort = prefs().sort;
  ui.visible = [];
  const out = [];

  if (ui.q) {
    const q = C.norm(ui.q);
    const folders = Object.values(s.folders)
      .filter((f) => C.norm(f.name).includes(q))
      .sort(S.byName);
    const docs = S.sorted(
      all.filter((d) => C.norm(d.title).includes(q)),
      sort,
    );
    if (folders.length) out.push(section('Pastas', folders.length, folderGrid(folders)));
    if (docs.length) out.push(section('Documentos', docs.length, docsView(docs, { chip: true })));
    if (!folders.length && !docs.length) out.push(h('div', { class: 'empty' }, h('p', {}, `Nada encontrado para “${ui.q}”.`)));
  } else if (ui.place.kind === 'home') {
    if (!all.length && !Object.keys(s.folders).length) out.push(emptyAll());
    else {
      const folders = S.sorted(S.childFolders(s, null), sort === 'manual' ? 'manual' : 'name');
      out.push(section('Pastas', folders.length, folderGrid(folders, { newCard: null })));
      const loose = S.sorted(byFolder.get(null) || [], sort);
      out.push(looseSection(loose));
    }
  } else if (ui.place.kind === 'all') {
    out.push(all.length ? docsView(S.sorted(all, sort), { chip: true }) : emptyAll());
  } else if (ui.place.kind === 'loose') {
    const loose = S.sorted(byFolder.get(null) || [], sort);
    out.push(loose.length ? docsView(loose) : h('div', { class: 'hint' }, 'Nenhum documento fora das pastas.'));
  } else if (ui.place.kind === 'folder') {
    const id = ui.place.id;
    const subs = S.sorted(S.childFolders(s, id), sort === 'manual' ? 'manual' : 'name');
    const docs = S.sorted(byFolder.get(id) || [], sort);
    if (subs.length) out.push(section('Subpastas', subs.length, folderGrid(subs, { newCard: id })));
    out.push(
      docs.length
        ? section(subs.length ? 'Documentos' : null, docs.length, docsView(docs))
        : h('div', { class: 'hint' }, 'Pasta vazia. Arraste documentos para cá (de “Fora das pastas” ou de “Todos os documentos”).'),
    );
  }
  mainEl.replaceChildren(...out);
}

function section(label, count, body) {
  return h('div', { class: 'section' }, label ? h('div', { class: 'section-head' }, label, h('span', { class: 'count' }, String(count))) : null, body);
}

function looseSection(loose) {
  const collapsed = prefs().looseCollapsed;
  return h(
    'div',
    { class: 'section' },
    h(
      'button',
      {
        class: 'section-head' + (collapsed ? '' : ' open'),
        'data-drop-folder': '',
        title: collapsed ? 'Mostrar documentos fora das pastas' : 'Esconder documentos fora das pastas',
        onclick: () => store.update((d) => (d.prefs.looseCollapsed = !d.prefs.looseCollapsed)),
      },
      h('span', { class: 'chev' }, svg(icons.chevron)),
      'Fora das pastas',
      h('span', { class: 'count' }, String(loose.length)),
    ),
    collapsed ? null : loose.length ? docsView(loose) : h('div', { class: 'hint' }, 'Todos os documentos já estão em pastas.'),
  );
}

function emptyAll() {
  return h(
    'div',
    { class: 'empty' },
    svg(icons.doc(56)),
    h('h2', {}, 'Seus documentos aparecem aqui'),
    h(
      'p',
      {},
      'Todo Google Doc que você já abriu neste Chrome aparece aqui sozinho, na mesma ordem do Google Docs. Se a lista estiver vazia, abra a tela inicial do Google Docs ou qualquer documento e volte aqui.',
    ),
  );
}

function folderGrid(folders, { newCard } = {}) {
  const { s, byFolder } = data;
  const cards = folders.map((f) => {
    const n = C.countDeep(s, byFolder, f.id);
    return h(
      'div',
      {
        class: 'card folder',
        style: { '--c': f.color },
        draggable: 'true',
        'data-kind': 'folder',
        'data-id': f.id,
        'data-drop-folder': f.id,
        title: f.name,
        onclick: () => go({ kind: 'folder', id: f.id }),
        oncontextmenu: (e) => {
          e.preventDefault();
          folderMenu(f.id, e.clientX, e.clientY);
        },
      },
      svg(icons.folder(34)),
      h('div', { class: 'info' }, h('div', { class: 't' }, f.name), h('div', { class: 's' }, C.plural(n, 'documento', 'documentos'))),
      h(
        'button',
        {
          class: 'more',
          title: 'Opções',
          onclick: (e) => {
            e.stopPropagation();
            const r = e.currentTarget.getBoundingClientRect();
            folderMenu(f.id, r.left, r.bottom + 4);
          },
        },
        svg(icons.more),
      ),
    );
  });
  if (newCard !== undefined)
    cards.push(
      h(
        'div',
        { class: 'card folder new-folder', onclick: () => newFolder(newCard) },
        svg(icons.folderPlus),
        h('div', { class: 'info' }, h('div', { class: 't' }, 'Nova pasta')),
      ),
    );
  return h('div', { class: 'grid folders' }, cards);
}

function docsView(list, opts = {}) {
  const shown = list.slice(0, ui.limit);
  ui.visible.push(...shown.map((d) => d.id));
  const items = shown.map((d) => (ui.view === 'grid' ? docCard(d, opts) : docRow(d, opts)));
  const body =
    ui.view === 'grid'
      ? h('div', { class: 'grid' }, items)
      : h(
          'div',
          { class: 'list' },
          h('div', { class: 'list-head' }, h('span'), h('span', {}, 'Nome'), h('span', {}, 'Pasta'), h('span', { class: 'c-date' }, 'Aberto em'), h('span')),
          items,
        );
  const rest = list.length - shown.length;
  return h(
    'div',
    {},
    body,
    rest > 0
      ? h(
          'div',
          { class: 'more-btn' },
          h(
            'button',
            {
              class: 'btn',
              onclick: () => {
                ui.limit += PAGE * 2;
                render();
              },
            },
            `Mostrar mais (${rest})`,
          ),
        )
      : null,
  );
}

const fmtDay = (ts) => (ts ? new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : '');

function folderChip(d) {
  const f = d.folder && data.s.folders[d.folder];
  return f ? h('span', { class: 'chip', style: { '--c': f.color }, title: C.pathText(data.s, f.id) }, f.name) : null;
}

function docCard(d, { chip } = {}) {
  return h(
    'div',
    {
      class: 'card doc' + (ui.sel.has(d.id) ? ' sel' : ''),
      draggable: 'true',
      'data-kind': 'doc',
      'data-id': d.id,
      title: d.title,
    },
    h('button', { class: 'check', title: 'Selecionar', 'data-check': d.id }, svg(icons.check)),
    h('div', { class: 'thumb' }, h('div', { class: 'page' }, svg(icons.doc(30)))),
    h(
      'div',
      { class: 'info' },
      h('div', { class: 't' }, d.title),
      h('div', { class: 's' }, chip ? folderChip(d) : null, d.last ? h('span', {}, fmtDay(d.last)) : null),
    ),
    h('button', { class: 'more', title: 'Opções', 'data-more': d.id }, svg(icons.more)),
  );
}

function docRow(d) {
  const f = d.folder && data.s.folders[d.folder];
  return h(
    'div',
    {
      class: 'row' + (ui.sel.has(d.id) ? ' sel' : ''),
      draggable: 'true',
      'data-kind': 'doc',
      'data-id': d.id,
      title: d.title,
    },
    svg(icons.doc(22)),
    h('span', { class: 't' }, d.title),
    h('span', { class: 'c' }, f ? folderChip(d) : '—'),
    h('span', { class: 'c c-date' }, fmtDay(d.last)),
    h('button', { class: 'more', title: 'Opções', 'data-more': d.id }, svg(icons.more)),
  );
}

// ---------- seleção ----------

function toggleSel(id, range) {
  if (range && ui.lastSel && ui.visible.includes(ui.lastSel)) {
    const a = ui.visible.indexOf(ui.lastSel);
    const b = ui.visible.indexOf(id);
    for (const x of ui.visible.slice(Math.min(a, b), Math.max(a, b) + 1)) ui.sel.add(x);
  } else if (ui.sel.has(id)) ui.sel.delete(id);
  else ui.sel.add(id);
  ui.lastSel = id;
  render();
}

function clearSel() {
  ui.sel.clear();
  render();
}

function selectAllVisible() {
  ui.visible.forEach((id) => ui.sel.add(id));
  render();
}

// ---------- ações ----------

async function newFolder(parent) {
  const name = await promptBox({
    title: parent ? 'Nova subpasta' : 'Nova pasta',
    placeholder: 'Nome da pasta',
    value: C.uniqueName(st(), 'Nova pasta', parent),
    ok: 'Criar',
  });
  if (!name) return;
  await store.update((s) => S.addFolder(s, name, parent));
  if (parent && !ui.open.has(parent)) toggleOpen(parent);
}

async function renameFolder(id) {
  const f = st().folders[id];
  const v = await promptBox({ title: 'Renomear pasta', value: f.name, ok: 'Salvar' });
  if (v) store.update((s) => (s.folders[id].name = v));
}

async function renameDoc(id) {
  const d = data.byId.get(id);
  const v = await promptBox({
    title: 'Renomear na lista',
    message: 'Muda só o nome mostrado aqui. O documento no Google Docs continua igual.',
    value: d.title,
    ok: 'Salvar',
  });
  if (v)
    store.update((s) => {
      const doc = S.ensureDoc(s, id, store.index());
      Object.assign(doc, { title: v, custom: true });
    });
}

function hideDocs(ids) {
  ids.forEach((id) => ui.sel.delete(id));
  C.hideDocsFlow(store, ids);
}

function pickerFor(ids) {
  const one = ids.length === 1 ? data.byId.get(ids[0]) : null;
  return C.folderPickerItems(st(), {
    title: one ? 'Mover para' : `Mover ${ids.length} documentos para`,
    current: one ? one.folder || null : undefined,
    onPick: async (to) => {
      await C.moveDocsFlow(store, ids, to);
      ui.sel.clear();
      render();
    },
  });
}

function openDoc(id, e) {
  S.openDoc(id, e && (e.metaKey || e.ctrlKey || e.button === 1) ? 'new' : 'here');
}

function docMenu(id, x, y) {
  const ids = ui.sel.has(id) && ui.sel.size > 1 ? [...ui.sel] : [id];
  if (ids.length > 1) {
    showMenu(x, y, [
      { title: C.plural(ids.length, 'documento selecionado', 'documentos selecionados') },
      { label: 'Mover para…', icon: icons.move, onClick: () => showMenu(x, y, pickerFor(ids)) },
      { label: 'Abrir todos em abas novas', icon: icons.external, disabled: ids.length > 15, onClick: () => ids.forEach((i) => S.openDoc(i, 'new')) },
      'sep',
      { label: 'Tirar da lista', icon: icons.trash, danger: true, onClick: () => hideDocs(ids) },
    ]);
    return;
  }
  const d = data.byId.get(id);
  showMenu(x, y, [
    { label: 'Abrir', icon: icons.doc(16), onClick: () => S.openDoc(id, 'here') },
    { label: 'Abrir em nova aba', icon: icons.external, onClick: () => S.openDoc(id, 'new') },
    { label: 'Mover para…', icon: icons.move, onClick: () => showMenu(x, y, pickerFor([id])) },
    d.folder ? { label: 'Ir para a pasta', icon: icons.folder(16), onClick: () => go({ kind: 'folder', id: d.folder }) } : null,
    { label: 'Renomear na lista', icon: icons.pencil, onClick: () => renameDoc(id) },
    { label: 'Copiar link', icon: icons.link, onClick: () => C.copyLink(id) },
    'sep',
    { label: 'Tirar da lista', icon: icons.trash, danger: true, onClick: () => hideDocs([id]) },
  ]);
}

function folderMenu(id, x, y) {
  const f = st().folders[id];
  if (!f) return;
  showMenu(x, y, [
    { label: 'Abrir', icon: icons.folder(16), onClick: () => go({ kind: 'folder', id }) },
    { label: 'Nova subpasta', icon: icons.folderPlus, onClick: () => newFolder(id) },
    { label: 'Renomear', icon: icons.pencil, onClick: () => renameFolder(id) },
    {
      label: 'Mover para…',
      icon: icons.move,
      onClick: () =>
        showMenu(
          x,
          y,
          C.folderPickerItems(st(), {
            title: `Mover “${f.name}” para`,
            current: f.parent || null,
            exclude: id,
            onPick: (to) => store.update((s) => S.moveItem(s, 'folder', id, to)),
          }),
        ),
    },
    'sep',
    { title: 'Cor' },
    { colors: S.COLORS, value: f.color, onPick: (c) => store.update((s) => (s.folders[id].color = c)) },
    'sep',
    { label: 'Apagar pasta', icon: icons.trash, danger: true, onClick: () => C.deleteFolderFlow(store, id) },
  ]);
}

function openFlows() {
  location.href = 'flows.html' + location.search;
}

// ---------- cliques ----------

mainEl.addEventListener('click', (e) => {
  const check = e.target.closest('[data-check]');
  if (check) {
    e.stopPropagation();
    toggleSel(check.dataset.check, e.shiftKey);
    return;
  }
  const more = e.target.closest('[data-more]');
  if (more) {
    e.stopPropagation();
    const r = more.getBoundingClientRect();
    docMenu(more.dataset.more, r.left, r.bottom + 4);
    return;
  }
  const doc = e.target.closest('[data-kind="doc"]');
  if (!doc) return;
  if (ui.sel.size || e.shiftKey) toggleSel(doc.dataset.id, e.shiftKey);
  else openDoc(doc.dataset.id, e);
});

mainEl.addEventListener('auxclick', (e) => {
  const doc = e.target.closest('[data-kind="doc"]');
  if (doc && e.button === 1) S.openDoc(doc.dataset.id, 'new');
});

mainEl.addEventListener('contextmenu', (e) => {
  const doc = e.target.closest('[data-kind="doc"]');
  if (!doc) return;
  e.preventDefault();
  docMenu(doc.dataset.id, e.clientX, e.clientY);
});

document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea, .dialog-backdrop')) return;
  if (e.key === 'Escape' && ui.sel.size) clearSel();
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
    e.preventDefault();
    selectAllVisible();
  }
});

// ---------- arrastar e soltar ----------

let drag = null; // { kind: 'docs', ids } | { kind: 'folder', id }
let marked = null;
let hoverTimer = null;

function clearMark() {
  if (marked) marked.el.classList.remove('drop-into', 'drop-before', 'drop-after');
  marked = null;
  clearTimeout(hoverTimer);
}

function mark(el, cls) {
  if (marked?.el === el && marked.cls === cls) return;
  clearMark();
  el.classList.add(cls);
  marked = { el, cls };
  // Segurar o arraste em cima de uma pasta da lateral abre as subpastas dela.
  const fid = el.dataset.dropFolder;
  if (cls === 'drop-into' && fid && el.classList.contains('nav-item') && !ui.open.has(fid) && S.childFolders(st(), fid).length) {
    hoverTimer = setTimeout(() => toggleOpen(fid), 800);
  }
}

document.addEventListener('dragstart', (e) => {
  const el = e.target.closest?.('[data-kind][data-id]');
  if (!el) return;
  const { kind, id } = el.dataset;
  if (kind === 'doc') {
    const ids = ui.sel.has(id) ? [...ui.sel] : [id];
    drag = { kind: 'docs', ids };
    e.dataTransfer.setData('text/uri-list', ids.map(S.DOC_URL).join('\r\n'));
    e.dataTransfer.setData('text/plain', ids.map(S.DOC_URL).join('\n'));
    if (ids.length > 1) {
      const ghost = h('div', { class: 'drag-ghost' }, C.plural(ids.length, 'documento', 'documentos'));
      document.body.append(ghost);
      e.dataTransfer.setDragImage(ghost, 10, 10);
      setTimeout(() => ghost.remove());
    }
  } else {
    drag = { kind: 'folder', id };
  }
  e.dataTransfer.effectAllowed = 'copyMove';
  e.dataTransfer.setData('application/x-pastas-docs', JSON.stringify(drag));
  requestAnimationFrame(() => el.classList.add('dragging'));
});

document.addEventListener('dragend', () => {
  document.querySelectorAll('.dragging').forEach((x) => x.classList.remove('dragging'));
  drag = null;
  clearMark();
});

function currentFolder() {
  return ui.place.kind === 'folder' ? ui.place.id : ui.place.kind === 'loose' || ui.place.kind === 'home' ? null : undefined;
}

function dropPlan(e) {
  const s = st();
  const manual = prefs().sort === 'manual' && !ui.q;
  const target = e.target.closest?.('[data-drop-folder], [data-kind][data-id]');
  if (target) {
    const kind = target.dataset.kind;
    const id = target.dataset.id;
    const r = target.getBoundingClientRect();
    const horizontal = !target.classList.contains('row');
    const t = horizontal ? (e.clientX - r.left) / r.width : (e.clientY - r.top) / r.height;
    // reordenar à mão
    if (manual && kind === 'doc' && drag?.kind === 'docs' && drag.ids.length === 1 && drag.ids[0] !== id && !target.closest('.nav')) {
      return { el: target, cls: t < 0.5 ? 'drop-before' : 'drop-after', act: { place: 'doc', id: drag.ids[0], target: id, after: t >= 0.5 } };
    }
    if (manual && kind === 'folder' && drag?.kind === 'folder' && drag.id !== id && target.classList.contains('card') && (t < 0.2 || t > 0.8)) {
      return { el: target, cls: t < 0.2 ? 'drop-before' : 'drop-after', act: { place: 'folder', id: drag.id, target: id, after: t > 0.8 } };
    }
    if ('dropFolder' in target.dataset) {
      const into = target.dataset.dropFolder || null;
      if (drag?.kind === 'folder' && into && (drag.id === into || S.isDescendant(s, into, drag.id))) return null;
      return { el: target, cls: 'drop-into', act: { into } };
    }
  }
  // Soltar no espaço vazio da pasta aberta.
  const cur = currentFolder();
  if (cur !== undefined && e.target.closest?.('#main')) {
    if (drag?.kind === 'folder' && cur && (drag.id === cur || S.isDescendant(s, cur, drag.id))) return null;
    return { el: mainEl, cls: 'drop-into', act: { into: cur } };
  }
  return null;
}

document.addEventListener('dragover', (e) => {
  const plan = dropPlan(e);
  if (!plan) return clearMark();
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
  if (drag?.kind === 'docs') {
    if (act.place) {
      await store.update((s) => {
        const ix = store.index();
        S.ensureDoc(s, act.id, ix);
        S.ensureDoc(s, act.target, ix);
        S.placeItem(s, 'doc', act.id, act.target, act.after);
      });
    } else {
      await C.moveDocsFlow(store, drag.ids, act.into);
      ui.sel.clear();
      render();
    }
  } else if (drag?.kind === 'folder') {
    if (act.place) await store.update((s) => S.placeItem(s, 'folder', act.id, act.target, act.after));
    else await store.update((s) => S.moveItem(s, 'folder', drag.id, act.into));
  } else {
    // Link arrastado de outra página/aba.
    const { ids, title } = C.idsFromDrop(e.dataTransfer);
    if (!ids.length) return toast('Solte aqui links de Google Docs');
    await store.update((s) => {
      for (const id of ids) {
        if (!s.docs[id]) S.addDoc(s, id, (ids.length === 1 && title) || store.index().docs[id]?.t, act.into ?? null);
        else S.moveItem(s, 'doc', id, act.into ?? null);
      }
    });
    toast(C.plural(ids.length, 'documento adicionado', 'documentos adicionados'));
  }
});

// ---------- topo ----------

C.iconize();

$('#q').addEventListener('input', (e) => {
  ui.q = e.target.value.trim();
  ui.limit = PAGE;
  render();
});

$('#modeSeg').addEventListener('click', async (e) => {
  const m = e.target.closest('button')?.dataset.mode;
  if (!m) return;
  await C.setMode(store, m);
  // Fora da tela do Google Docs, os outros modos levam para o Google Docs.
  if (!embed && m !== 'full') location.href = 'https://docs.google.com/document/u/0/';
});

$('#newDoc').addEventListener('click', async () => {
  const url = 'https://docs.google.com/document/create';
  const tab = await chrome.tabs.getCurrent().catch(() => null);
  if (tab) chrome.tabs.update(tab.id, { url });
  else window.top.location.href = url;
});

store.subscribe(() => render());
await store.init();
render();
