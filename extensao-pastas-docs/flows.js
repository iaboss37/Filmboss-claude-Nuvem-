import * as S from './store.js';
import { icons, h, svg, showMenu, confirmBox, promptBox, toast, inlineEdit } from './ui.js';

const store = S.createStore();
const $ = (sel) => document.querySelector(sel);
const vp = $('#viewport');
const world = $('#world');
const nodesEl = $('#nodes');
const edgeLayer = $('#edgeLayer');
const tempEdge = $('#tempEdge');

const GRID = 20;
const NODE_W = 200;

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

const ui = {
  boardId: pref('board', null),
  view: { x: 60, y: 60, z: 1 },
  views: pref('views', {}),
  snap: pref('snap', true),
  sel: null, // { type: 'node' | 'edge', id }
  pop: null, // id do bloco com a lista de documentos aberta
  act: null, // interação em andamento (pan, arrastar bloco, ligar seta)
  folderQ: '',
  geo: {}, // posição e tamanho de cada bloco no quadro
  editing: false,
};

const st = () => store.get();
const boardsSorted = () => Object.values(st().boards).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.created - b.created);
const board = () => st().boards[ui.boardId] || null;

// ---------- desfazer (Ctrl/Cmd + Z) ----------

const undoStack = [];
function commit(fn) {
  undoStack.push(structuredClone(st()));
  if (undoStack.length > 50) undoStack.shift();
  return store.update(fn);
}
function undo() {
  const prev = undoStack.pop();
  if (prev) store.replace(prev);
  else toast('Nada para desfazer');
}

// ---------- render ----------

function render() {
  if (ui.act || ui.editing) {
    ui.pending = true;
    return;
  }
  ui.pending = false;
  if (!board()) {
    ui.boardId = boardsSorted()[0]?.id || null;
    if (ui.boardId) loadView();
  }
  renderBoards();
  renderFolders();
  renderStage();
}

function renderBoards() {
  const list = boardsSorted();
  const el = $('#boards');
  if (!list.length) {
    el.replaceChildren(h('div', { class: 'none' }, 'Nenhum fluxo ainda'));
    return;
  }
  el.replaceChildren(
    ...list.map((b) => {
      const more = h('button', { class: 'more', title: 'Opções' }, svg(icons.more));
      const item = h(
        'div',
        {
          class: 'board-item' + (b.id === ui.boardId ? ' on' : ''),
          'data-board': b.id,
          onclick: () => selectBoard(b.id),
          ondblclick: () => renameBoard(b.id, item.querySelector('.name')),
          oncontextmenu: (e) => {
            e.preventDefault();
            boardMenu(b.id, e.clientX, e.clientY);
          },
        },
        svg(icons.flow),
        h('span', { class: 'name' }, b.name),
        h('span', { class: 'n' }, String(Object.keys(b.nodes).length)),
        more,
      );
      more.onclick = (e) => {
        e.stopPropagation();
        const r = more.getBoundingClientRect();
        boardMenu(b.id, r.left, r.bottom + 4);
      };
      return item;
    }),
  );
}

function renderFolders() {
  const s = st();
  const onBoard = new Set(Object.values(board()?.nodes || {}).map((n) => n.folder));
  const q = norm(ui.folderQ);
  const rows = [];
  const walk = (parent, depth) => {
    for (const f of S.sorted(S.childFolders(s, parent), 'name')) {
      if (!q || norm(f.name).includes(q))
        rows.push(
          h(
            'div',
            {
              class: 'folder-item',
              draggable: 'true',
              'data-folder': f.id,
              style: { paddingLeft: 8 + (q ? 0 : depth * 14) + 'px', '--c': f.color },
              title: onBoard.has(f.id) ? 'Já está no quadro (clique para ver)' : 'Arraste para o quadro ou clique para adicionar',
              onclick: () => addOrFocus(f.id),
            },
            svg(icons.folder(16)),
            h('span', { class: 'name' }, f.name),
            onBoard.has(f.id) ? h('span', { class: 'on-board' }) : null,
          ),
        );
      walk(f.id, depth + 1);
    }
  };
  walk(null, 0);
  $('#folders').replaceChildren(
    ...(rows.length ? rows : [h('div', { class: 'hint' }, q ? 'Nenhuma pasta encontrada.' : 'Nenhuma pasta ainda. Crie no botão acima.')]),
  );
}

function renderStage() {
  const b = board();
  const s = st();
  // título
  const title = $('#boardTitle');
  title.replaceChildren(
    b
      ? h('span', { class: 'name', title: 'Clique para renomear', onclick: (e) => renameBoard(b.id, e.currentTarget) }, b.name)
      : h('span', { class: 'name' }, 'Fluxos'),
  );
  $('#snapBtn').classList.toggle('on', ui.snap);

  // blocos
  nodesEl.replaceChildren();
  ui.geo = {};
  if (b) {
    for (const n of Object.values(b.nodes)) {
      const f = s.folders[n.folder];
      if (!f) continue;
      nodesEl.append(nodeEl(n, f));
    }
    for (const el of nodesEl.children) {
      const n = b.nodes[el.dataset.node];
      ui.geo[n.id] = { x: n.x, y: n.y, w: el.offsetWidth, h: el.offsetHeight };
    }
  }
  if (ui.sel?.type === 'node' && !ui.geo[ui.sel.id]) ui.sel = null;
  if (ui.sel?.type === 'edge' && !b?.edges.some((e) => e.id === ui.sel.id)) ui.sel = null;
  if (ui.pop && !ui.geo[ui.pop]) ui.pop = null;
  drawEdges();
  renderEmpty();
  renderOverlays();
  applyView();
}

function nodeEl(n, f) {
  const s = st();
  const count = S.countDocsDeep(s, f.id);
  const parentPath = S.folderPath(s, f.parent)
    .map((p) => p.name)
    .join(' › ');
  return h(
    'div',
    {
      class: 'node' + (ui.sel?.type === 'node' && ui.sel.id === n.id ? ' sel' : ''),
      'data-node': n.id,
      style: { left: n.x + 'px', top: n.y + 'px', width: NODE_W + 'px', '--c': f.color },
    },
    h('div', { class: 'head', style: { '--c': f.color } }, svg(icons.folder(18)), h('span', { class: 'title', title: f.name }, f.name)),
    parentPath ? h('div', { class: 'path', title: parentPath }, 'em ' + parentPath) : null,
    h('button', { class: 'docs-btn', 'data-docs': n.id }, svg(icons.doc(14)), count === 1 ? '1 documento' : `${count} documentos`),
    ...['t', 'r', 'b', 'l'].map((side) => h('span', { class: 'handle ' + side, 'data-handle': n.id, title: 'Puxe até outro bloco para criar uma seta' })),
  );
}

// ---------- setas ----------

function bezier(a, b) {
  const ac = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
  const bc = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  const dx = bc.x - ac.x;
  const dy = bc.y - ac.y;
  let p1, p2, c1, c2;
  if (Math.abs(dx) >= Math.abs(dy)) {
    const sx = Math.sign(dx) || 1;
    p1 = { x: ac.x + (sx * a.w) / 2, y: ac.y };
    p2 = { x: bc.x - (sx * b.w) / 2, y: bc.y };
    const off = Math.max(30, Math.abs(p2.x - p1.x) / 2);
    c1 = { x: p1.x + sx * off, y: p1.y };
    c2 = { x: p2.x - sx * off, y: p2.y };
  } else {
    const sy = Math.sign(dy) || 1;
    p1 = { x: ac.x, y: ac.y + (sy * a.h) / 2 };
    p2 = { x: bc.x, y: bc.y - (sy * b.h) / 2 };
    const off = Math.max(30, Math.abs(p2.y - p1.y) / 2);
    c1 = { x: p1.x, y: p1.y + sy * off };
    c2 = { x: p2.x, y: p2.y - sy * off };
  }
  return {
    d: `M${p1.x},${p1.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${p2.x},${p2.y}`,
    mid: { x: (p1.x + 3 * c1.x + 3 * c2.x + p2.x) / 8, y: (p1.y + 3 * c1.y + 3 * c2.y + p2.y) / 8 },
  };
}

const NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
};

function drawEdges() {
  const b = board();
  edgeLayer.replaceChildren();
  if (!b) return;
  for (const e of b.edges) {
    const a = ui.geo[e.from];
    const z = ui.geo[e.to];
    if (!a || !z) continue;
    const { d, mid } = bezier(a, z);
    const sel = ui.sel?.type === 'edge' && ui.sel.id === e.id;
    const g = svgEl('g', { 'data-edge': e.id });
    g.append(svgEl('path', { d, class: 'edge' + (sel ? ' sel' : ''), 'marker-end': `url(#${sel ? 'arrowSel' : 'arrow'})` }));
    g.append(svgEl('path', { d, class: 'edge-hit', 'data-edge': e.id }));
    if (e.label) {
      const t = svgEl('text', { x: mid.x, y: mid.y - 6, 'text-anchor': 'middle', class: 'edge-label' });
      t.textContent = e.label;
      g.append(t);
    }
    edgeLayer.append(g);
  }
}

function edgeMid(e) {
  const a = ui.geo[e.from];
  const z = ui.geo[e.to];
  return a && z ? bezier(a, z).mid : null;
}

// ---------- sobreposições: barrinha da seta e lista de documentos ----------

function toScreen(p) {
  return { x: p.x * ui.view.z + ui.view.x, y: p.y * ui.view.z + ui.view.y };
}

function renderOverlays() {
  vp.querySelectorAll('.edge-tools, .pop').forEach((el) => el.remove());
  const b = board();
  if (!b) return;

  if (ui.sel?.type === 'edge') {
    const e = b.edges.find((x) => x.id === ui.sel.id);
    if (e) {
      vp.append(
        h(
          'div',
          { class: 'edge-tools', 'data-overlay': 'edge' },
          h('button', { onclick: () => editEdgeLabel(e.id) }, svg(icons.pencil), e.label ? 'Editar texto' : 'Texto'),
          h(
            'button',
            {
              title: 'Inverter direção',
              onclick: () =>
                commit((s) => {
                  const x = s.boards[ui.boardId].edges.find((y) => y.id === e.id);
                  [x.from, x.to] = [x.to, x.from];
                }),
            },
            '⇄ Inverter',
          ),
          h('button', { class: 'danger', onclick: () => deleteEdge(e.id) }, svg(icons.trash), 'Apagar'),
        ),
      );
    }
  }

  if (ui.pop) {
    const n = b.nodes[ui.pop];
    const f = n && st().folders[n.folder];
    if (f) vp.append(docsPopover(n, f));
  }
  positionOverlays();
}

function positionOverlays() {
  const b = board();
  const tools = vp.querySelector('.edge-tools');
  if (tools && ui.sel?.type === 'edge') {
    const e = b?.edges.find((x) => x.id === ui.sel.id);
    const mid = e && edgeMid(e);
    if (mid) {
      const p = toScreen(mid);
      Object.assign(tools.style, { left: p.x + 'px', top: p.y + 'px' });
    }
  }
  const pop = vp.querySelector('.pop');
  const g = ui.pop && ui.geo[ui.pop];
  if (pop && g) {
    const right = toScreen({ x: g.x + g.w, y: g.y });
    const left = toScreen({ x: g.x, y: g.y });
    const W = vp.clientWidth;
    let x = right.x + 12;
    if (x + 280 > W - 8) x = Math.max(8, left.x - 292);
    const y = Math.max(8, Math.min(right.y, vp.clientHeight - pop.offsetHeight - 8));
    Object.assign(pop.style, { left: x + 'px', top: y + 'px' });
  }
}

function docsPopover(n, f) {
  const s = st();
  const docs = S.sorted(S.childDocs(s, f.id), s.prefs.sort);
  const subs = S.sorted(S.childFolders(s, f.id), s.prefs.sort);
  const onBoard = new Set(Object.values(board().nodes).map((x) => x.folder));
  const body = h('div', { class: 'pop-body' });
  if (!docs.length && !subs.length) body.append(h('div', { class: 'pop-empty' }, 'Pasta vazia. Salve documentos nela pelo painel lateral.'));
  for (const d of docs)
    body.append(
      h(
        'div',
        { class: 'pop-row', title: d.title, onclick: () => S.openDoc(d.id) },
        svg(icons.doc(16)),
        h('span', { class: 'name' }, d.title),
        svg(icons.external),
      ),
    );
  if (subs.length) {
    body.append(h('div', { class: 'pop-sub' }, 'Subpastas'));
    for (const sub of subs) {
      const there = onBoard.has(sub.id);
      body.append(
        h(
          'div',
          {
            class: 'pop-row',
            style: { '--c': sub.color },
            title: there ? 'Mostrar no quadro' : 'Colocar no quadro, ligada a esta pasta',
            onclick: () => (there ? addOrFocus(sub.id) : addConnected(n.id, sub.id)),
          },
          svg(icons.folder(16)),
          h('span', { class: 'name' }, sub.name),
          h('span', { class: 'add' }, there ? 'ver' : '+ no quadro'),
        ),
      );
    }
  }
  return h(
    'div',
    { class: 'pop', 'data-overlay': 'pop', style: { '--c': f.color } },
    h(
      'div',
      { class: 'pop-head' },
      svg(icons.folder(18)),
      h('span', { class: 'name' }, f.name),
      h('button', { class: 'icon-btn', title: 'Fechar', onclick: () => closePop() }, svg(icons.x)),
    ),
    body,
  );
}

function closePop() {
  ui.pop = null;
  renderOverlays();
}

function renderEmpty() {
  const box = $('#emptyBoard');
  const b = board();
  if (b && Object.keys(b.nodes).length) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  if (!b) {
    box.replaceChildren(
      svg(icons.flow.replace(/width="16" height="16"/, 'width="48" height="48"')),
      h('h3', {}, 'Crie seu primeiro fluxo'),
      h(
        'p',
        {},
        'Cada fluxo é um quadro onde suas pastas viram blocos ligados por setas. Você pode ter vários fluxos, e a mesma pasta pode aparecer em mais de um.',
      ),
      h('button', { class: 'btn primary', onclick: newBoard }, svg(icons.plus), 'Novo fluxo'),
    );
  } else {
    box.replaceChildren(
      svg(icons.folder(48)),
      h('h3', {}, 'Quadro vazio'),
      h('p', {}, 'Arraste pastas da lista à esquerda para cá, ou dê dois cliques num espaço vazio para criar uma pasta nova.'),
    );
  }
}

// ---------- câmera (arrastar a tela e zoom) ----------

function applyView() {
  const { x, y, z } = ui.view;
  world.style.transform = `translate(${x}px, ${y}px) scale(${z})`;
  vp.style.backgroundSize = `${GRID * z}px ${GRID * z}px`;
  vp.style.backgroundPosition = `${x}px ${y}px`;
  $('#zoomVal').textContent = Math.round(z * 100) + '%';
  positionOverlays();
  saveView();
}

let viewTimer = null;
function saveView() {
  clearTimeout(viewTimer);
  viewTimer = setTimeout(() => {
    if (!ui.boardId) return;
    ui.views[ui.boardId] = ui.view;
    setPref('views', ui.views);
  }, 300);
}

function loadView() {
  const v = ui.views[ui.boardId];
  ui.view = v ? { ...v } : { x: 60, y: 60, z: 1 };
}

function zoomAt(cx, cy, z) {
  z = Math.min(2.5, Math.max(0.25, z));
  const wx = (cx - ui.view.x) / ui.view.z;
  const wy = (cy - ui.view.y) / ui.view.z;
  ui.view = { x: cx - wx * z, y: cy - wy * z, z };
  applyView();
}

function fit() {
  const g = Object.values(ui.geo);
  if (!g.length) {
    ui.view = { x: 60, y: 60, z: 1 };
    applyView();
    return;
  }
  const minX = Math.min(...g.map((a) => a.x));
  const minY = Math.min(...g.map((a) => a.y));
  const maxX = Math.max(...g.map((a) => a.x + a.w));
  const maxY = Math.max(...g.map((a) => a.y + a.h));
  const W = vp.clientWidth;
  const H = vp.clientHeight;
  const z = Math.min(1.2, Math.max(0.25, Math.min((W - 120) / (maxX - minX), (H - 120) / (maxY - minY))));
  ui.view = { z, x: (W - (maxX - minX) * z) / 2 - minX * z, y: (H - (maxY - minY) * z) / 2 - minY * z };
  applyView();
}

function toWorld(clientX, clientY) {
  const r = vp.getBoundingClientRect();
  return { x: (clientX - r.left - ui.view.x) / ui.view.z, y: (clientY - r.top - ui.view.y) / ui.view.z };
}

const snap = (v) => (ui.snap ? Math.round(v / GRID) * GRID : Math.round(v));

function viewCenter() {
  const r = vp.getBoundingClientRect();
  return toWorld(r.left + r.width / 2, r.top + r.height / 2);
}

function centerOn(nid) {
  const g = ui.geo[nid];
  if (!g) return;
  ui.view = { ...ui.view, x: vp.clientWidth / 2 - (g.x + g.w / 2) * ui.view.z, y: vp.clientHeight / 2 - (g.y + g.h / 2) * ui.view.z };
  applyView();
  const el = nodesEl.querySelector(`[data-node="${nid}"]`);
  el?.classList.remove('flash');
  void el?.offsetWidth;
  el?.classList.add('flash');
}

// ---------- ações ----------

function ensureBoard(s) {
  if (s.boards[ui.boardId]) return s.boards[ui.boardId];
  const id = S.uid();
  const order = Object.values(s.boards).reduce((m, b) => Math.max(m, b.order ?? 0), 0) + 1;
  s.boards[id] = { id, name: 'Meu fluxo', order, created: Date.now(), nodes: {}, edges: [] };
  ui.boardId = id;
  setPref('board', id);
  return s.boards[id];
}

function nodeOfFolder(b, folderId) {
  return Object.values(b?.nodes || {}).find((n) => n.folder === folderId) || null;
}

// Coloca a pasta no quadro (ou mostra onde ela já está).
async function addOrFocus(folderId, at) {
  const existing = nodeOfFolder(board(), folderId);
  if (existing) {
    centerOn(existing.id);
    return existing.id;
  }
  const p = at || viewCenter();
  let nid;
  await commit((s) => {
    const b = ensureBoard(s);
    nid = S.uid();
    b.nodes[nid] = { id: nid, folder: folderId, x: snap(p.x - NODE_W / 2), y: snap(p.y - 30) };
  });
  return nid;
}

// Coloca uma pasta ao lado de um bloco, já ligada por uma seta.
async function addConnected(fromNid, folderId, at) {
  const g = ui.geo[fromNid];
  const b = board();
  let p = at;
  if (!p && g) {
    const kids = b.edges.filter((e) => e.from === fromNid).length;
    p = { x: g.x + g.w + 80 + NODE_W / 2, y: g.y + 30 + kids * 90 };
  }
  const existing = nodeOfFolder(b, folderId);
  await commit((s) => {
    const bb = ensureBoard(s);
    let nid = existing?.id;
    if (!nid) {
      nid = S.uid();
      bb.nodes[nid] = { id: nid, folder: folderId, x: snap(p.x - NODE_W / 2), y: snap(p.y - 30) };
    }
    if (!bb.edges.some((e) => e.from === fromNid && e.to === nid) && nid !== fromNid) bb.edges.push({ id: S.uid(), from: fromNid, to: nid, label: '' });
  });
}

async function createFolderAt(p, { connectFrom = null, parent = null } = {}) {
  const name = await promptBox({ title: parent ? 'Nova subpasta' : 'Nova pasta', placeholder: 'Nome da pasta', value: '', ok: 'Criar' });
  if (!name) return;
  let fid;
  await commit((s) => {
    fid = S.addFolder(s, name, parent);
    const b = ensureBoard(s);
    const nid = S.uid();
    b.nodes[nid] = { id: nid, folder: fid, x: snap(p.x - NODE_W / 2), y: snap(p.y - 30) };
    if (connectFrom && b.nodes[connectFrom]) b.edges.push({ id: S.uid(), from: connectFrom, to: nid, label: '' });
  });
}

function removeNode(nid) {
  const b = board();
  const n = b?.nodes[nid];
  if (!n) return;
  const name = st().folders[n.folder]?.name || 'Pasta';
  commit((s) => {
    const bb = s.boards[ui.boardId];
    delete bb.nodes[nid];
    bb.edges = bb.edges.filter((e) => e.from !== nid && e.to !== nid);
  });
  ui.sel = null;
  toast(`“${name}” saiu deste fluxo (a pasta continua existindo)`, { label: 'Desfazer', onClick: undo });
}

function deleteEdge(id) {
  commit((s) => {
    const bb = s.boards[ui.boardId];
    bb.edges = bb.edges.filter((e) => e.id !== id);
  });
  ui.sel = null;
}

async function editEdgeLabel(id) {
  const e = board()?.edges.find((x) => x.id === id);
  if (!e) return;
  const v = await promptBox({ title: 'Texto da seta', placeholder: 'Ex.: depois, aprovado, envia para…', value: e.label || '', ok: 'Salvar' });
  if (v === null && !e.label) return;
  commit((s) => {
    const x = s.boards[ui.boardId].edges.find((y) => y.id === id);
    if (x) x.label = v || '';
  });
}

async function newBoard() {
  const name = await promptBox({ title: 'Novo fluxo', placeholder: 'Ex.: Produção de vídeo', value: '', ok: 'Criar' });
  if (!name) return;
  await commit((s) => {
    const id = S.uid();
    const order = Object.values(s.boards).reduce((m, b) => Math.max(m, b.order ?? 0), 0) + 1;
    s.boards[id] = { id, name, order, created: Date.now(), nodes: {}, edges: [] };
    ui.boardId = id;
    setPref('board', id);
    ui.view = { x: 60, y: 60, z: 1 };
  });
}

function selectBoard(id) {
  if (id === ui.boardId) return;
  ui.boardId = id;
  ui.sel = null;
  ui.pop = null;
  setPref('board', id);
  loadView();
  render();
  if (!ui.views[id]) fit();
}

function renameBoard(id, el) {
  const b = st().boards[id];
  if (!b || !el) return;
  ui.editing = true;
  inlineEdit(el, b.name, (v) => {
    ui.editing = false;
    if (v) commit((s) => (s.boards[id].name = v));
    else render();
  });
}

async function deleteBoard(id) {
  const b = st().boards[id];
  if (!b) return;
  const ok = await confirmBox({
    title: `Apagar o fluxo “${b.name}”?`,
    message: 'Só o quadro é apagado. Suas pastas e documentos continuam iguais.',
    ok: 'Apagar fluxo',
    danger: true,
  });
  if (!ok) return;
  await commit((s) => delete s.boards[id]);
  toast('Fluxo apagado', { label: 'Desfazer', onClick: undo });
}

function boardMenu(id, x, y) {
  showMenu(x, y, [
    { label: 'Renomear', icon: icons.pencil, onClick: () => renameBoard(id, $(`[data-board="${id}"] .name`)) },
    {
      label: 'Duplicar',
      icon: icons.flow,
      onClick: () =>
        commit((s) => {
          const copy = structuredClone(s.boards[id]);
          copy.id = S.uid();
          copy.name += ' (cópia)';
          copy.created = Date.now();
          copy.order = Object.values(s.boards).reduce((m, b) => Math.max(m, b.order ?? 0), 0) + 1;
          s.boards[copy.id] = copy;
        }),
    },
    'sep',
    { label: 'Apagar fluxo', icon: icons.trash, danger: true, onClick: () => deleteBoard(id) },
  ]);
}

function nodeMenu(nid, x, y) {
  const n = board()?.nodes[nid];
  const f = n && st().folders[n.folder];
  if (!f) return;
  const g = ui.geo[nid];
  const right = { x: g.x + g.w + 80 + NODE_W / 2, y: g.y + 30 };
  showMenu(x, y, [
    { label: 'Ver documentos', icon: icons.doc(16), onClick: () => ((ui.pop = nid), renderOverlays()) },
    { label: 'Nova pasta ligada', icon: icons.folderPlus, onClick: () => createFolderAt(right, { connectFrom: nid }) },
    { label: 'Nova subpasta ligada', icon: icons.folderPlus, onClick: () => createFolderAt(right, { connectFrom: nid, parent: f.id }) },
    { label: 'Renomear pasta', icon: icons.pencil, onClick: () => renameFolder(f.id) },
    'sep',
    { title: 'Cor' },
    { colors: S.COLORS, value: f.color, onPick: (c) => commit((s) => (s.folders[f.id].color = c)) },
    'sep',
    { label: 'Tirar deste fluxo', icon: icons.x, onClick: () => removeNode(nid) },
  ]);
}

async function renameFolder(fid) {
  const f = st().folders[fid];
  const v = await promptBox({ title: 'Renomear pasta', value: f.name, ok: 'Salvar' });
  if (v) commit((s) => (s.folders[fid].name = v));
}

function canvasMenu(x, y) {
  const p = toWorld(x, y);
  const b = board();
  const onBoard = new Set(Object.values(b?.nodes || {}).map((n) => n.folder));
  const available = Object.values(st().folders)
    .filter((f) => !onBoard.has(f.id))
    .sort(S.byName);
  showMenu(x, y, [
    { label: 'Nova pasta aqui', icon: icons.folderPlus, onClick: () => createFolderAt(p) },
    { label: 'Mostrar tudo', icon: icons.fit, onClick: fit },
    available.length ? 'sep' : null,
    available.length ? { title: 'Colocar pasta aqui' } : null,
    ...available.slice(0, 40).map((f) => ({
      label: f.name,
      icon: icons.folder(16).replace('class="folder-ico"', `class="folder-ico" style="color:${f.color}"`),
      onClick: () => addOrFocus(f.id, p),
    })),
  ]);
}

// Soltou uma seta no vazio: oferece criar ou escolher a pasta de destino ali.
function linkToEmpty(fromNid, x, y) {
  const p = toWorld(x, y);
  const b = board();
  const onBoard = new Set(Object.values(b.nodes).map((n) => n.folder));
  const available = Object.values(st().folders)
    .filter((f) => !onBoard.has(f.id))
    .sort(S.byName);
  showMenu(x, y, [
    { label: 'Nova pasta aqui', icon: icons.folderPlus, onClick: () => createFolderAt(p, { connectFrom: fromNid }) },
    available.length ? 'sep' : null,
    available.length ? { title: 'Ligar a uma pasta existente' } : null,
    ...available.slice(0, 40).map((f) => ({
      label: f.name,
      icon: icons.folder(16).replace('class="folder-ico"', `class="folder-ico" style="color:${f.color}"`),
      onClick: () => addConnected(fromNid, f.id, p),
    })),
  ]);
}

// ---------- ponteiro: arrastar tela, mover blocos, ligar setas ----------

vp.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || e.target.closest('[data-overlay]')) return;
  const handle = e.target.closest('[data-handle]');
  const node = e.target.closest('.node');
  const edgeHit = e.target.closest('[data-edge]');

  if (handle) {
    ui.act = { type: 'link', from: handle.dataset.handle, pointer: e.pointerId };
  } else if (node && !e.target.closest('.docs-btn')) {
    const nid = node.dataset.node;
    const g = ui.geo[nid];
    selectOnly({ type: 'node', id: nid });
    ui.act = { type: 'move', nid, el: node, sx: e.clientX, sy: e.clientY, ox: g.x, oy: g.y, moved: false };
  } else if (node) {
    return;
  } else if (edgeHit) {
    selectOnly({ type: 'edge', id: edgeHit.dataset.edge });
    return;
  } else {
    if (ui.sel || ui.pop) {
      ui.sel = null;
      ui.pop = null;
      renderStage();
    }
    ui.act = { type: 'pan', sx: e.clientX, sy: e.clientY, vx: ui.view.x, vy: ui.view.y };
  }
});

vp.addEventListener('pointermove', (e) => {
  const a = ui.act;
  if (!a) return;
  // Só prende o ponteiro quando ele de fato se move, para não atrapalhar clique e duplo clique.
  if ((!a.captured && Math.hypot(e.clientX - (a.sx ?? e.clientX), e.clientY - (a.sy ?? e.clientY)) > 2) || (!a.captured && a.type === 'link')) {
    vp.setPointerCapture(e.pointerId);
    a.captured = true;
    if (a.type === 'pan') vp.classList.add('panning');
  }
  if (a.type === 'pan') {
    ui.view = { ...ui.view, x: a.vx + e.clientX - a.sx, y: a.vy + e.clientY - a.sy };
    applyView();
  } else if (a.type === 'move') {
    const dx = (e.clientX - a.sx) / ui.view.z;
    const dy = (e.clientY - a.sy) / ui.view.z;
    if (!a.moved && Math.hypot(dx, dy) < 3) return;
    a.moved = true;
    a.el.classList.add('dragging');
    const g = ui.geo[a.nid];
    g.x = snap(a.ox + dx);
    g.y = snap(a.oy + dy);
    a.el.style.left = g.x + 'px';
    a.el.style.top = g.y + 'px';
    drawEdges();
    positionOverlays();
  } else if (a.type === 'link') {
    const from = ui.geo[a.from];
    const p = toWorld(e.clientX, e.clientY);
    const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('.node');
    nodesEl.querySelectorAll('.link-target').forEach((n) => n !== over && n.classList.remove('link-target'));
    if (over && over.dataset.node !== a.from) over.classList.add('link-target');
    const target = over && over.dataset.node !== a.from ? ui.geo[over.dataset.node] : { x: p.x, y: p.y, w: 0, h: 0 };
    tempEdge.setAttribute('d', bezier(from, target).d);
  }
});

function endPointer(e) {
  const a = ui.act;
  if (!a) return;
  ui.act = null;
  vp.classList.remove('panning');
  tempEdge.setAttribute('d', '');
  nodesEl.querySelectorAll('.link-target, .dragging').forEach((n) => n.classList.remove('link-target', 'dragging'));
  if (e.type === 'pointercancel') {
    render();
    return;
  }

  if (a.type === 'move' && a.moved) {
    const g = ui.geo[a.nid];
    commit((s) => {
      const n = s.boards[ui.boardId]?.nodes[a.nid];
      if (n) Object.assign(n, { x: g.x, y: g.y });
    });
    return;
  }
  if (a.type === 'link') {
    const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('.node');
    const to = over?.dataset.node;
    if (to && to !== a.from) {
      const b = board();
      if (b.edges.some((x) => x.from === a.from && x.to === to)) toast('Essa seta já existe');
      else commit((s) => s.boards[ui.boardId].edges.push({ id: S.uid(), from: a.from, to, label: '' }));
    } else if (!over) {
      linkToEmpty(a.from, e.clientX, e.clientY);
    }
    return;
  }
  if (ui.pending) render();
}

vp.addEventListener('pointerup', endPointer);
vp.addEventListener('pointercancel', endPointer);

vp.addEventListener('click', (e) => {
  const btn = e.target.closest('.docs-btn');
  if (!btn) return;
  ui.pop = ui.pop === btn.dataset.docs ? null : btn.dataset.docs;
  renderOverlays();
});

vp.addEventListener('dblclick', (e) => {
  if (e.target.closest('[data-overlay]')) return;
  const node = e.target.closest('.node');
  const edge = e.target.closest('[data-edge]');
  if (node) {
    ui.pop = node.dataset.node;
    renderOverlays();
  } else if (edge) {
    editEdgeLabel(edge.dataset.edge);
  } else {
    createFolderAt(toWorld(e.clientX, e.clientY));
  }
});

vp.addEventListener('contextmenu', (e) => {
  if (e.target.closest('[data-overlay]')) return;
  e.preventDefault();
  const node = e.target.closest('.node');
  const edge = e.target.closest('[data-edge]');
  if (node) {
    selectOnly({ type: 'node', id: node.dataset.node });
    nodeMenu(node.dataset.node, e.clientX, e.clientY);
  } else if (edge) {
    const id = edge.dataset.edge;
    selectOnly({ type: 'edge', id });
    showMenu(e.clientX, e.clientY, [
      { label: 'Texto da seta', icon: icons.pencil, onClick: () => editEdgeLabel(id) },
      { label: 'Apagar seta', icon: icons.trash, danger: true, onClick: () => deleteEdge(id) },
    ]);
  } else {
    canvasMenu(e.clientX, e.clientY);
  }
});

vp.addEventListener(
  'wheel',
  (e) => {
    if (e.target.closest('.pop-body')) return;
    e.preventDefault();
    const r = vp.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey) zoomAt(e.clientX - r.left, e.clientY - r.top, ui.view.z * Math.exp(-e.deltaY * 0.01));
    else {
      ui.view = { ...ui.view, x: ui.view.x - e.deltaX, y: ui.view.y - e.deltaY };
      applyView();
    }
  },
  { passive: false },
);

function selectOnly(sel) {
  ui.sel = sel;
  nodesEl.querySelectorAll('.node.sel').forEach((n) => n.classList.remove('sel'));
  if (sel?.type === 'node') nodesEl.querySelector(`[data-node="${sel.id}"]`)?.classList.add('sel');
  drawEdges();
  renderOverlays();
}

document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea, .dialog-backdrop')) return;
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    undo();
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    if (ui.sel?.type === 'node') removeNode(ui.sel.id);
    else if (ui.sel?.type === 'edge') deleteEdge(ui.sel.id);
  } else if (e.key === 'Escape') {
    ui.sel = null;
    ui.pop = null;
    renderStage();
  }
});

// ---------- arrastar pastas da lista para o quadro ----------

$('#folders').addEventListener('dragstart', (e) => {
  const item = e.target.closest('[data-folder]');
  if (!item) return;
  e.dataTransfer.setData('application/x-pastas-folder', item.dataset.folder);
  e.dataTransfer.effectAllowed = 'copy';
});
vp.addEventListener('dragover', (e) => {
  if (!e.dataTransfer.types.includes('application/x-pastas-folder')) return;
  e.preventDefault();
  vp.classList.add('drop-ok');
});
vp.addEventListener('dragleave', (e) => {
  if (!vp.contains(e.relatedTarget)) vp.classList.remove('drop-ok');
});
vp.addEventListener('drop', (e) => {
  vp.classList.remove('drop-ok');
  const fid = e.dataTransfer.getData('application/x-pastas-folder');
  if (!fid) return;
  e.preventDefault();
  addOrFocus(fid, toWorld(e.clientX, e.clientY));
});

// ---------- botões ----------

document
  .querySelectorAll('i[data-icon]')
  .forEach((i) => i.replaceWith(svg(typeof icons[i.dataset.icon] === 'function' ? icons[i.dataset.icon](16) : icons[i.dataset.icon])));

$('#newBoardBtn').addEventListener('click', newBoard);
$('#newFolderBtn').addEventListener('click', () => createFolderAt(viewCenter()));
$('#zoomIn').addEventListener('click', () => zoomAt(vp.clientWidth / 2, vp.clientHeight / 2, ui.view.z * 1.2));
$('#zoomOut').addEventListener('click', () => zoomAt(vp.clientWidth / 2, vp.clientHeight / 2, ui.view.z / 1.2));
$('#zoomVal').addEventListener('click', () => zoomAt(vp.clientWidth / 2, vp.clientHeight / 2, 1));
$('#fitBtn').addEventListener('click', fit);
$('#snapBtn').addEventListener('click', () => {
  ui.snap = !ui.snap;
  setPref('snap', ui.snap);
  $('#snapBtn').classList.toggle('on', ui.snap);
  toast(ui.snap ? 'Encaixar na grade: ligado' : 'Encaixar na grade: desligado');
});
$('#folderSearch').addEventListener('input', (e) => {
  ui.folderQ = e.target.value.trim();
  renderFolders();
});
window.addEventListener('resize', positionOverlays);

const norm = (t) => (t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

store.subscribe(render);
await store.init();
if (ui.boardId && !st().boards[ui.boardId]) ui.boardId = null;
if (ui.boardId) loadView();
render();
if (ui.boardId && !ui.views[ui.boardId]) fit();
