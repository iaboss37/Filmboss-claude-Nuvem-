// Roda na tela inicial do Google Docs (lista de documentos).
// - Modo "full":  cobre a tela com a visualização de pastas da extensão.
// - Modo "side":  mantém o Google Docs e deixa arrastar os documentos para o painel lateral.
// - Modo "off":   não mexe em nada (Google Docs tradicional).
// Em "full" e "side" também lê a lista de documentos, na ordem que o Google mostra.
(() => {
  const HOME = /^\/document(\/u\/\d+)?\/?$/;
  if (!HOME.test(location.pathname)) return;

  const root = document.documentElement;
  const DOC_RE = /\/document\/(?:u\/\d+\/)?d\/([a-zA-Z0-9_-]{25,})/;
  const ID_RE = /^[a-zA-Z0-9_-]{25,}$/;
  let mode = null;
  let frame = null;
  let pill = null;

  // Esconde a página até saber o modo, para não piscar a tela do Google antes das pastas.
  const veil = document.createElement('style');
  veil.textContent = 'html{visibility:hidden!important}';
  root.appendChild(veil);
  const unveil = () => veil.remove();
  setTimeout(unveil, 2000);

  chrome.storage.local
    .get('state')
    .then((r) => apply(r.state?.prefs?.mode || 'full'))
    .catch(() => apply('off'))
    .finally(unveil);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.state) return;
    const m = changes.state.newValue?.prefs?.mode || 'full';
    if (m !== mode) apply(m);
  });

  function apply(m) {
    mode = m;
    if (m === 'full') showFrame();
    else hideFrame();
    if (m === 'side') showPill();
    else hidePill();
    if (m !== 'off') startHarvest();
    // Itens já lidos ficam arrastáveis só no modo lateral.
    document.querySelectorAll('[data-pastas-doc-id]').forEach((el) => (m === 'side' ? el.setAttribute('draggable', 'true') : el.removeAttribute('draggable')));
  }

  // ---------- tela cheia ----------

  function showFrame() {
    if (frame) return;
    frame = document.createElement('iframe');
    frame.src = chrome.runtime.getURL('app.html?embed=1');
    frame.allow = 'clipboard-write';
    frame.setAttribute('aria-label', 'Pastas Docs');
    const dark = matchMedia('(prefers-color-scheme: dark)').matches;
    frame.style.cssText = `position:fixed;inset:0;width:100vw;height:100vh;border:0;margin:0;z-index:2147483647;visibility:visible;background:${dark ? '#1c1c1e' : '#fff'};color-scheme:normal`;
    root.appendChild(frame);
    root.style.setProperty('overflow', 'hidden', 'important');
  }

  function hideFrame() {
    if (!frame) return;
    frame.remove();
    frame = null;
    root.style.removeProperty('overflow');
  }

  // ---------- modo lateral: botão flutuante ----------

  function showPill() {
    if (pill) return;
    pill = document.createElement('div');
    const shadow = pill.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        .wrap{position:fixed;left:16px;bottom:16px;z-index:2147483646;display:flex;gap:2px;padding:3px;border-radius:999px;
          background:#1d1d1f;box-shadow:0 6px 20px rgba(0,0,0,.25);font:600 13px -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
        button{display:flex;align-items:center;gap:6px;height:30px;padding:0 12px;border:0;border-radius:999px;background:none;color:#fff;cursor:pointer;font:inherit}
        button:hover{background:rgba(255,255,255,.14)}
        .tip{position:fixed;left:16px;bottom:58px;z-index:2147483646;max-width:260px;padding:8px 12px;border-radius:10px;background:#1d1d1f;color:#fff;
          font:13px -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.25)}
      </style>
      <div class="wrap">
        <button id="panel" title="Abrir as pastas ao lado">
          <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#6ea2ff" d="M2.5 9.2h19v8.3A2.5 2.5 0 0 1 19 20H5a2.5 2.5 0 0 1-2.5-2.5z"/><path fill="#6ea2ff" opacity=".6" d="M2.5 6.5A2.5 2.5 0 0 1 5 4h4.3c.6 0 1.2.26 1.6.7L12.3 6.2H19A2.5 2.5 0 0 1 21.5 8.7V10h-19z"/></svg>
          Pastas
        </button>
        <button id="full" title="Trocar para a tela cheia de pastas">Tela cheia</button>
      </div>`;
    shadow.getElementById('panel').onclick = async () => {
      const r = await chrome.runtime.sendMessage({ type: 'openSidePanel' }).catch(() => null);
      if (!r?.ok) tip(shadow, 'Clique no ícone do Pastas Docs na barra do Chrome para abrir o painel.');
    };
    shadow.getElementById('full').onclick = () => setMode('full');
    (document.body || root).appendChild(pill);
  }

  function hidePill() {
    pill?.remove();
    pill = null;
  }

  function tip(shadow, text) {
    shadow.querySelector('.tip')?.remove();
    const el = document.createElement('div');
    el.className = 'tip';
    el.textContent = text;
    shadow.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  }

  async function setMode(m) {
    const r = await chrome.storage.local.get('state');
    const s = r.state;
    if (!s) return;
    s.prefs = { ...(s.prefs || {}), mode: m };
    s.updatedAt = Math.max(Date.now(), (s.updatedAt || 0) + 1);
    await chrome.storage.local.set({ state: s });
  }

  // ---------- leitura da lista do Google Docs ----------

  let observer = null;
  let timer = null;
  let lastSent = '';

  function startHarvest() {
    if (observer) return;
    const begin = () => {
      observer = new MutationObserver(() => {
        clearTimeout(timer);
        timer = setTimeout(harvest, 700);
      });
      observer.observe(document.body, { childList: true, subtree: true });
      harvest();
    };
    if (document.body) begin();
    else document.addEventListener('DOMContentLoaded', begin, { once: true });
  }

  // Procura o id do documento no próprio item ou nos filhos (atributos data-*, links).
  function idOf(el) {
    const nodes = [el, ...el.querySelectorAll('*')].slice(0, 80);
    for (const n of nodes) {
      if (n.tagName === 'A' && n.href) {
        const m = DOC_RE.exec(n.href);
        if (m) return m[1];
      }
      for (const a of n.attributes) {
        if (a.name === 'class' || a.name === 'style') continue;
        const m = DOC_RE.exec(a.value);
        if (m) return m[1];
        if (/id/i.test(a.name) && ID_RE.test(a.value)) return a.value;
      }
    }
    return null;
  }

  function titleOf(el) {
    const t =
      el.querySelector('.docs-homescreen-list-item-title-value, [class*="title-value"], [class*="item-title"], [class*="title"]')?.textContent ||
      el.getAttribute('aria-label') ||
      el.getAttribute('title') ||
      (el.innerText || '').split('\n')[0];
    return (t || '').trim().slice(0, 300);
  }

  function harvest() {
    const items = [];
    const seen = new Set();
    const add = (el, id, t) => {
      if (!id || seen.has(id)) return;
      seen.add(id);
      items.push({ id, t });
      el.dataset.pastasDocId = id;
      el.dataset.pastasDocTitle = t;
      if (mode === 'side') el.setAttribute('draggable', 'true');
    };
    const els = document.querySelectorAll('.docs-homescreen-list-item, .docs-homescreen-grid-item, [data-pastas-doc-id]');
    for (const el of els) {
      if (el.parentElement?.closest('.docs-homescreen-list-item, .docs-homescreen-grid-item')) continue;
      add(el, el.dataset.pastasDocId || idOf(el), titleOf(el));
    }
    for (const a of document.querySelectorAll('a[href*="/document/"]')) {
      const m = DOC_RE.exec(a.href);
      if (m) add(a, m[1], (a.textContent || a.getAttribute('aria-label') || '').trim());
    }
    const sig = items.map((i) => i.id).join(',');
    if (!items.length || sig === lastSent) return;
    lastSent = sig;
    chrome.runtime.sendMessage({ type: 'harvest', items }).catch(() => {});
  }

  // Arrastar um documento da lista do Google para uma pasta do painel lateral.
  document.addEventListener(
    'dragstart',
    (e) => {
      if (mode !== 'side') return;
      const el = e.target.closest?.('[data-pastas-doc-id]');
      if (!el) return;
      const url = `https://docs.google.com/document/d/${el.dataset.pastasDocId}/edit`;
      const title = el.dataset.pastasDocTitle || '';
      e.dataTransfer.setData('text/uri-list', url);
      e.dataTransfer.setData('text/plain', url);
      const a = document.createElement('a');
      a.href = url;
      a.textContent = title;
      e.dataTransfer.setData('text/html', a.outerHTML);
      e.dataTransfer.effectAllowed = 'copyLink';
    },
    true,
  );
})();
