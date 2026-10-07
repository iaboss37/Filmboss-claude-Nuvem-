// Ícones, construtor de elementos e componentes pequenos (menu, diálogo, aviso).

const stroke = (d, size = 16) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

export const icons = {
  folder: (size = 18) =>
    `<svg class="folder-ico" width="${size}" height="${size}" viewBox="0 0 24 24"><path fill="currentColor" opacity=".55" d="M2.5 6.5A2.5 2.5 0 0 1 5 4h4.3c.6 0 1.2.26 1.6.7L12.3 6.2H19A2.5 2.5 0 0 1 21.5 8.7V10h-19z"/><path fill="currentColor" d="M2.5 9.2h19v8.3A2.5 2.5 0 0 1 19 20H5a2.5 2.5 0 0 1-2.5-2.5z"/></svg>`,
  doc: (size = 18) =>
    `<svg class="doc-ico" width="${size}" height="${size}" viewBox="0 0 24 24"><path fill="currentColor" d="M6.2 2.5h8.3l5 5v12.3a1.7 1.7 0 0 1-1.7 1.7H6.2a1.7 1.7 0 0 1-1.7-1.7V4.2a1.7 1.7 0 0 1 1.7-1.7z"/><path fill="#fff" opacity=".45" d="M14.5 2.5v5h5z"/><path stroke="#fff" stroke-width="1.5" stroke-linecap="round" d="M8 11.8h8M8 14.8h8M8 17.8h5"/></svg>`,
  chevron: stroke('<path d="m9 6 6 6-6 6"/>', 14),
  plus: stroke('<path d="M12 5v14M5 12h14"/>'),
  search: stroke('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>', 15),
  list: stroke('<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>'),
  grid: stroke(
    '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  ),
  flow: stroke(
    '<rect x="2.5" y="3" width="7" height="6" rx="1.5"/><rect x="14.5" y="15" width="7" height="6" rx="1.5"/><path d="M6 9v4a2 2 0 0 0 2 2h6.5"/><path d="m12 12.5 2.5 2.5-2.5 2.5"/>',
  ),
  gear: stroke(
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  ),
  more: stroke('<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>'),
  trash: stroke('<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>', 15),
  pencil: stroke('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>', 15),
  folderPlus: stroke('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 10.5v5M9.5 13h5"/>'),
  move: stroke('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 13h6M13 11l2 2-2 2"/>', 15),
  external: stroke('<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>', 15),
  x: stroke('<path d="M18 6 6 18M6 6l12 12"/>', 15),
  download: stroke('<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>', 15),
  upload: stroke('<path d="M12 21V9M7 14l5-5 5 5M5 3h14"/>', 15),
  back: stroke('<path d="m15 18-6-6 6-6"/>'),
  target: stroke('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>', 15),
  link: stroke('<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>', 15),
  minus: stroke('<path d="M5 12h14"/>'),
  fit: stroke('<path d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3"/>'),
  check: stroke('<path d="M20 6 9 17l-5-5"/>', 15),
  cloud: stroke('<path d="M17.5 19H8a5 5 0 1 1 1-9.9A6 6 0 0 1 20.5 11 4 4 0 0 1 17.5 19z"/>', 15),
  history: stroke('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>', 15),
  sortAz: stroke('<path d="M3 6h9M3 12h6M3 18h4M17 4v16M13.5 16.5 17 20l3.5-3.5"/>', 15),
  home: stroke('<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>'),
  layout: stroke('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>'),
  docs: stroke('<path d="M8 3h7l4 4v11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M15 3v4h4M4 7v12a2 2 0 0 0 2 2h9"/>'),
  inbox: stroke(
    '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z"/>',
  ),
  hand: stroke(
    '<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12M11 11V4a1.5 1.5 0 0 1 3 0v7M14 11V5.5a1.5 1.5 0 0 1 3 0V13M17 9.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-2a6 6 0 0 1-5-2.7L4.3 14.8a1.6 1.6 0 0 1 2.6-1.8L8 14.5"/>',
    15,
  ),
};

// h('div', {class: 'x', onclick: fn}, child, 'texto')
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object')
      for (const [prop, val] of Object.entries(v)) {
        if (val == null) continue;
        if (prop.startsWith('--')) el.style.setProperty(prop, val);
        else el.style[prop] = val;
      }
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(c));
  }
  return el;
}

export const svg = (markup) => {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  return t.content.firstChild;
};

// ---------- menu de contexto ----------

let openMenu = null;

export function closeMenu() {
  openMenu?.remove();
  openMenu = null;
}

document.addEventListener('pointerdown', (e) => {
  if (openMenu && !openMenu.contains(e.target)) closeMenu();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeMenu();
});
window.addEventListener('blur', closeMenu);

// items: { label, icon, danger, disabled, onClick, indent } | 'sep' | { title } | { colors, value, onPick }
export function showMenu(x, y, items) {
  closeMenu();
  const el = h('div', { class: 'menu', role: 'menu' });
  for (const it of items) {
    if (!it) continue;
    if (it === 'sep') {
      el.append(h('div', { class: 'menu-sep' }));
    } else if (it.title) {
      el.append(h('div', { class: 'menu-title' }, it.title));
    } else if (it.colors) {
      el.append(
        h(
          'div',
          { class: 'menu-colors' },
          it.colors.map((c) =>
            h('button', {
              class: c === it.value ? 'on' : null,
              style: { background: c },
              title: 'Cor',
              onclick: () => {
                closeMenu();
                it.onPick(c);
              },
            }),
          ),
        ),
      );
    } else {
      el.append(
        h(
          'button',
          {
            class: 'menu-item' + (it.danger ? ' danger' : ''),
            disabled: it.disabled,
            style: it.indent ? { paddingLeft: 8 + it.indent * 14 + 'px' } : null,
            onclick: () => {
              closeMenu();
              it.onClick?.();
            },
          },
          it.icon ? svg(it.icon) : null,
          h('span', { class: 'label' }, it.label),
          it.hint ? h('span', { style: { opacity: 0.5, fontSize: '11px' } }, it.hint) : null,
        ),
      );
    }
  }
  document.body.append(el);
  const r = el.getBoundingClientRect();
  el.style.left = Math.max(6, Math.min(x, innerWidth - r.width - 6)) + 'px';
  el.style.top = Math.max(6, Math.min(y, innerHeight - r.height - 6)) + 'px';
  openMenu = el;
  return el;
}

export function menuAt(target, items) {
  const r = target.getBoundingClientRect();
  return showMenu(r.left, r.bottom + 4, items);
}

// ---------- diálogos ----------

function dialog(build) {
  return new Promise((resolve) => {
    const back = h('div', { class: 'dialog-backdrop' });
    const done = (v) => {
      back.remove();
      resolve(v);
    };
    back.addEventListener('pointerdown', (e) => e.target === back && done(null));
    back.addEventListener('keydown', (e) => e.key === 'Escape' && done(null));
    back.append(build(done));
    document.body.append(back);
    (back.querySelector('input') || back.querySelector('.primary'))?.focus();
    back.querySelector('input')?.select();
  });
}

export function confirmBox({ title, message, ok = 'OK', danger = false }) {
  return dialog((done) =>
    h(
      'div',
      { class: 'dialog' },
      h('h3', {}, title),
      message ? h('p', {}, message) : null,
      h(
        'div',
        { class: 'actions' },
        h('button', { class: 'btn', onclick: () => done(false) }, 'Cancelar'),
        h('button', { class: 'btn primary' + (danger ? ' danger solid' : ''), onclick: () => done(true) }, ok),
      ),
    ),
  ).then(Boolean);
}

export function promptBox({ title, message, value = '', placeholder = '', ok = 'OK' }) {
  return dialog((done) => {
    const input = h('input', { class: 'text', value, placeholder });
    input.addEventListener('keydown', (e) => e.key === 'Enter' && done(input.value.trim() || null));
    return h(
      'div',
      { class: 'dialog' },
      h('h3', {}, title),
      message ? h('p', {}, message) : null,
      input,
      h(
        'div',
        { class: 'actions' },
        h('button', { class: 'btn', onclick: () => done(null) }, 'Cancelar'),
        h('button', { class: 'btn primary', onclick: () => done(input.value.trim() || null) }, ok),
      ),
    );
  });
}

// ---------- aviso rápido com "Desfazer" ----------

let toastEl = null;
let toastTimer = null;

export function toast(message, action) {
  toastEl?.remove();
  clearTimeout(toastTimer);
  toastEl = h(
    'div',
    { class: 'toast', role: 'status' },
    h('span', {}, message),
    action
      ? h(
          'button',
          {
            onclick: () => {
              toastEl?.remove();
              action.onClick();
            },
          },
          action.label,
        )
      : null,
  );
  document.body.append(toastEl);
  toastTimer = setTimeout(() => toastEl?.remove(), action ? 6000 : 2500);
}

// Edição de nome no próprio lugar (Enter salva, Esc cancela).
export function inlineEdit(span, value, onDone) {
  const input = h('input', { class: 'inline-edit', value });
  span.replaceWith(input);
  input.focus();
  input.select();
  let finished = false;
  const finish = (save) => {
    if (finished) return;
    finished = true;
    const v = input.value.trim();
    input.replaceWith(span);
    onDone(save && v && v !== value ? v : null);
  };
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') finish(true);
    if (e.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', () => finish(true));
  input.addEventListener('click', (e) => e.stopPropagation());
  input.addEventListener('pointerdown', (e) => e.stopPropagation());
}

export function fmtDate(ts) {
  return new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}
