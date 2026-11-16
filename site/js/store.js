/* SB's Garage — storefront */
(() => {
  const G = window.G64;
  const { esc, money } = G;
  const $ = (s, el = document) => el.querySelector(s);
  const PAGE = 36;
  const CART_KEY = 'g64_cart_v1';
  const CAT_KEY = 'g64_catalog_v1';
  const ls = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
  };

  const state = {
    items: [], byId: {}, settings: {}, list: [], toks: [], shown: PAGE, booted: false,
    f: { q: '', brand: new Set(), tag: new Set(), make: new Set(), cond: new Set(), min: null, max: null, stock: false },
    sort: 'new',
    cart: ls.get(CART_KEY) || {},
    openFacets: new Set(), makeQ: '', pdpPushed: false, pdpId: null,
  };

  /* ═══════════ data prep ═══════════ */
  const norm = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/['’`]/g, '');
  const uniq = arr => { const seen = new Set(); return arr.filter(x => { const k = x.toLowerCase(); if (!x || seen.has(k)) return false; seen.add(k); return true; }); };

  function prepare(cat) {
    const s = cat.settings || {};
    const cutoff = Date.now() - Number(s.newBadgeDays || 7) * 864e5;
    const showSold = !/^(no|false|0|hide)$/i.test(String(s.showSoldOut || 'yes').trim());
    const items = (cat.items || []).map(raw => {
      const tags = uniq((raw.tags || []).map(G.normTag));
      const brand = G.normBrand(raw.brand);
      const make = raw.make ? G.normMake(raw.make) : '';
      const rank = tags.reduce((m, t) => Math.max(m, (G.tagDef(t) || {}).rank || 0), 0);
      const labels = tags.map(t => (G.tagDef(t) || {}).label || '');
      const hay = norm([raw.name, brand, make, raw.series, raw.year, raw.color, raw.condition, raw.id, ...tags, ...labels].join(' '));
      return Object.assign({}, raw, {
        brand, make, tags, rank, hay, hayC: hay.replace(/[^a-z0-9]/g, ''),
        price: Number(raw.price) || 0, qty: Number(raw.qty) || 0, photos: raw.photos || [],
        isNew: !!raw.added && raw.added > cutoff, jdm: G.JDM.includes(make.toLowerCase()),
      });
    }).filter(it => showSold || it.qty > 0);
    return { items, settings: s };
  }

  /* ═══════════ search ═══════════ */
  const SYN = {
    vw: 'volkswagen', merc: 'mercedes', benz: 'mercedes', chevy: 'chevrolet', lambo: 'lamborghini', bimmer: 'bmw', beemer: 'bmw',
    porshe: 'porsche', ferarri: 'ferrari', lamborgini: 'lamborghini', '5pack': '5-pack', fivepack: '5-pack', zamac: 'zamac',
  };
  const tokens = q => norm(q).split(/[\s,]+/).filter(Boolean).map(t => SYN[t] || t);
  function matchTok(it, t) {
    if (t === 'jdm') return it.jdm || it.hay.includes('jdm');
    const def = G.tagDef(t);
    if (def && t.length <= 3) { // th / sth / tt / rlc → match the tag, not random substrings
      return it.tags.includes(def.key) || new RegExp('\\b' + t.replace(/[^a-z0-9]/g, '') + '\\b').test(it.hay);
    }
    if (def && it.tags.includes(def.key)) return true;
    const c = t.replace(/[^a-z0-9]/g, '');
    return it.hay.includes(t) || (c.length > 1 && it.hayC.includes(c));
  }

  /* ═══════════ filtering ═══════════ */
  function passes(it, skip) {
    const f = state.f;
    if (skip !== 'brand' && f.brand.size && !f.brand.has(it.brand)) return false;
    if (skip !== 'tag' && f.tag.size && !it.tags.some(t => f.tag.has(t))) return false;
    if (skip !== 'make' && f.make.size && !f.make.has(it.make)) return false;
    if (skip !== 'cond' && f.cond.size && !f.cond.has(it.condition)) return false;
    if (f.min != null && it.price < f.min) return false;
    if (f.max != null && it.price > f.max) return false;
    if (f.stock && it.qty <= 0) return false;
    if (state.toks.length && !state.toks.every(t => matchTok(it, t))) return false;
    return true;
  }

  const SORTS = {
    new: (a, b) => (b.added || 0) - (a.added || 0) || b.n - a.n,
    rarity: (a, b) => b.rank - a.rank || b.price - a.price,
    priceAsc: (a, b) => a.price - b.price,
    priceDesc: (a, b) => b.price - a.price,
    name: (a, b) => a.name.replace(/^'/, '').localeCompare(b.name.replace(/^'/, '')),
    brand: (a, b) => a.brand.localeCompare(b.brand) || a.name.localeCompare(b.name),
  };

  function apply(opts) {
    state.toks = tokens(state.f.q);
    const s = SORTS[state.sort] || SORTS.new;
    state.list = state.items.filter(it => passes(it)).sort((a, b) => (a.qty > 0 ? 0 : 1) - (b.qty > 0 ? 0 : 1) || s(a, b));
    state.shown = PAGE;
    renderGrid();
    renderFacets();
    renderQuick();
    renderActive();
    $('#resultCount').textContent = state.list.length === 1 ? '1 car' : state.list.length + ' cars';
    if (!opts || !opts.keepUrl) syncURL();
  }

  /* ═══════════ cards ═══════════ */
  function badges(it, max) {
    const sorted = it.tags.slice().sort((a, b) => ((G.tagDef(b) || {}).rank || 0) - ((G.tagDef(a) || {}).rank || 0));
    return sorted.slice(0, max || 9).map(t => {
      const d = G.tagDef(t);
      return `<span class="badge ${d ? d.cls : ''}" title="${esc(d ? d.label : t)}">${esc(d ? d.short : t)}</span>`;
    }).join('');
  }

  function addLabel(it) {
    if (it.qty <= 0) return 'Sold out';
    return state.cart[it.id] ? 'In cart ✓' : 'Add to cart';
  }

  function card(it) {
    const sold = it.qty <= 0;
    const off = it.compareAt && it.compareAt > it.price ? Math.round((1 - it.price / it.compareAt) * 100) : 0;
    const sub = [it.series, it.year].filter(Boolean).join(' · ');
    const meta = [it.brand, it.make].filter(Boolean).join(' · ');
    return `<article class="card${sold ? ' is-sold' : ''}" data-id="${esc(it.id)}">
      <button class="card-media" data-open="${esc(it.id)}" aria-label="View ${esc(it.name)}">
        ${G.imgTag(it.photos[0], 600, it.name, 'loading="lazy" decoding="async"')}
        <span class="badges">${badges(it, 3)}</span>
        ${it.isNew && !sold ? '<span class="ribbon">NEW</span>' : ''}
        ${off && !sold ? `<span class="discount">-${off}%</span>` : ''}
        ${sold ? '<span class="sold-stamp">SOLD</span>' : ''}
      </button>
      <div class="card-body">
        <div class="card-meta">${esc(meta)}</div>
        <h3 class="card-title"><button data-open="${esc(it.id)}">${esc(it.name)}</button></h3>
        ${sub ? `<div class="card-sub">${esc(sub)}</div>` : ''}
        <div class="card-foot">
          <span class="price">${money(it.price)}${it.compareAt > it.price ? `<s>${money(it.compareAt)}</s>` : ''}</span>
          ${sold ? '' : `<span class="stock${it.qty === 1 ? ' low' : ''}">${it.qty === 1 ? 'Last one' : it.qty + ' in stock'}</span>`}
        </div>
        <button class="btn small add${state.cart[it.id] ? ' in' : ''}" data-add="${esc(it.id)}" ${sold ? 'disabled' : ''}>${addLabel(it)}</button>
      </div>
    </article>`;
  }

  function renderGrid() {
    const grid = $('#grid');
    grid.innerHTML = state.list.slice(0, state.shown).map(card).join('');
    $('#empty').hidden = state.list.length > 0;
  }
  function renderMore() {
    if (state.shown >= state.list.length) return;
    const next = state.list.slice(state.shown, state.shown + PAGE);
    state.shown += PAGE;
    $('#grid').insertAdjacentHTML('beforeend', next.map(card).join(''));
  }
  function refreshCardButtons() {
    document.querySelectorAll('[data-add]').forEach(b => {
      const it = state.byId[b.dataset.add];
      if (!it) return;
      b.textContent = addLabel(it);
      b.classList.toggle('in', !!state.cart[it.id]);
    });
  }

  /* ═══════════ facets ═══════════ */
  const CONDITION_ORDER = ['Mint (carded)', 'Carded – soft corners', 'Carded – damaged card', 'Boxed', 'Loose', 'Custom'];
  const FACETS = [
    { key: 'brand', title: 'Brand', vals: it => [it.brand], order: 'count' },
    { key: 'tag', title: 'Type', vals: it => it.tags, order: 'rank' },
    { key: 'make', title: 'Car maker', vals: it => [it.make], order: 'count', limit: 8, search: true },
    { key: 'cond', title: 'Condition', vals: it => [it.condition], order: 'cond' },
  ];

  function counts(fc) {
    const m = new Map();
    state.items.forEach(it => fc.vals(it).forEach(v => { if (v && !m.has(v)) m.set(v, 0); }));
    state.items.forEach(it => { if (passes(it, fc.key)) fc.vals(it).forEach(v => { if (v) m.set(v, m.get(v) + 1); }); });
    const arr = [...m.entries()];
    if (fc.order === 'rank') arr.sort((a, b) => ((G.tagDef(b[0]) || {}).rank || 0) - ((G.tagDef(a[0]) || {}).rank || 0) || a[0].localeCompare(b[0]));
    else if (fc.order === 'cond') arr.sort((a, b) => (CONDITION_ORDER.indexOf(a[0]) + 1 || 99) - (CONDITION_ORDER.indexOf(b[0]) + 1 || 99));
    else arr.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    return arr;
  }

  function renderFacets() {
    FACETS.forEach(fc => {
      const el = $('#facet-' + fc.key);
      const all = counts(fc);
      el.hidden = all.length < 2 && !state.f[fc.key].size;
      if (!el.dataset.ready) {
        el.innerHTML = `<h3>${fc.title}</h3>${fc.search ? `<input class="input facet-search" data-facet-search placeholder="Search makers…" hidden>` : ''}<div class="opts"></div><button class="link more" hidden></button>`;
        el.dataset.ready = '1';
      }
      const search = el.querySelector('[data-facet-search]');
      if (search) search.hidden = all.length <= 10;
      let shown = all;
      if (fc.search && state.makeQ) shown = all.filter(([v]) => norm(v).includes(norm(state.makeQ)));
      const open = state.openFacets.has(fc.key) || !!state.makeQ;
      const sel = state.f[fc.key];
      if (fc.limit && !open && shown.length > fc.limit + 2) {
        // always keep selected values visible
        const top = shown.slice(0, fc.limit);
        shown.forEach(e => { if (sel.has(e[0]) && !top.includes(e)) top.push(e); });
        shown = top;
      }
      el.querySelector('.opts').innerHTML = shown.map(([v, n]) => {
        const d = fc.key === 'tag' ? G.tagDef(v) : null;
        const on = sel.has(v);
        return `<label class="opt${!n && !on ? ' zero' : ''}"><input type="checkbox" data-facet="${fc.key}" value="${esc(v)}"${on ? ' checked' : ''}><span class="name">${esc(d ? d.label : v)}</span><span class="n">${n}</span></label>`;
      }).join('') || '<span class="muted">No match</span>';
      const more = el.querySelector('.more');
      const hiddenCount = all.length - shown.length;
      more.hidden = !fc.limit || state.makeQ || (!open && hiddenCount <= 0) || (open && all.length <= fc.limit + 2);
      more.textContent = open ? 'Show less' : `Show all ${all.length}`;
      more.dataset.toggle = fc.key;
    });
    const n = ['brand', 'tag', 'make', 'cond'].reduce((s, k) => s + state.f[k].size, 0) +
      (state.f.min != null) + (state.f.max != null) + (state.f.stock ? 1 : 0);
    const fcEl = $('#filterCount');
    fcEl.hidden = !n;
    fcEl.textContent = n;
  }

  function renderQuick() {
    const tagCounts = counts(FACETS[1]).filter(e => e[1] > 0 || state.f.tag.has(e[0]));
    const brandCounts = counts(FACETS[0]).filter(e => e[1] > 0 || state.f.brand.has(e[0]));
    const none = !state.f.tag.size && !state.f.brand.size;
    let html = `<button class="chip" data-quick="all" aria-pressed="${none}">All</button>`;
    html += tagCounts.map(([v]) => {
      const d = G.tagDef(v);
      return `<button class="chip${v === 'STH' ? ' sth' : ''}" data-quick="tag" data-v="${esc(v)}" aria-pressed="${state.f.tag.has(v)}">${esc(d ? (d.key === 'Silver Series' ? d.label : d.short) : v)}</button>`;
    }).join('');
    if (brandCounts.length > 1) {
      html += brandCounts.map(([v]) => `<button class="chip" data-quick="brand" data-v="${esc(v)}" aria-pressed="${state.f.brand.has(v)}">${esc(v)}</button>`).join('');
    }
    $('#quick').innerHTML = html;
  }

  function renderActive() {
    const f = state.f;
    const x = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 6l12 12M18 6L6 18"/></svg>';
    const chips = [];
    if (f.q) chips.push(['q', '', `“${f.q}”`]);
    ['brand', 'tag', 'make', 'cond'].forEach(k => f[k].forEach(v => {
      const d = k === 'tag' ? G.tagDef(v) : null;
      chips.push([k, v, d ? d.label : v]);
    }));
    if (f.min != null) chips.push(['min', '', 'From ' + money(f.min)]);
    if (f.max != null) chips.push(['max', '', 'Up to ' + money(f.max)]);
    if (f.stock) chips.push(['stock', '', 'In stock']);
    $('#active').innerHTML = chips.map(([k, v, label]) =>
      `<button class="chip" data-rm="${k}" data-v="${esc(v)}">${esc(label)} ${x}</button>`).join('') +
      (chips.length > 1 ? '<button class="link" data-rm="all">Clear all</button>' : '');
  }

  function clearAll() {
    const f = state.f;
    f.q = ''; $('#q').value = '';
    ['brand', 'tag', 'make', 'cond'].forEach(k => f[k].clear());
    f.min = f.max = null; f.stock = false;
    $('#pmin').value = $('#pmax').value = ''; $('#inStock').checked = false;
    state.makeQ = '';
    const ms = $('[data-facet-search]'); if (ms) ms.value = '';
    apply();
  }

  /* ═══════════ URL state (shareable filtered links) ═══════════ */
  function buildParams(extra) {
    const p = new URLSearchParams();
    const f = state.f;
    if (f.q) p.set('q', f.q);
    ['brand', 'tag', 'make', 'cond'].forEach(k => { if (f[k].size) p.set(k, [...f[k]].join(',')); });
    if (f.min != null) p.set('min', f.min);
    if (f.max != null) p.set('max', f.max);
    if (f.stock) p.set('stock', '1');
    if (state.sort !== 'new') p.set('sort', state.sort);
    if (extra && extra.item) p.set('item', extra.item);
    const s = p.toString();
    return location.pathname + (s ? '?' + s : '');
  }
  function syncURL() {
    history.replaceState(history.state, '', buildParams(state.pdpId ? { item: state.pdpId } : null));
  }
  function readURL() {
    const p = new URLSearchParams(location.search);
    const f = state.f;
    f.q = p.get('q') || '';
    ['brand', 'tag', 'make', 'cond'].forEach(k => {
      f[k] = new Set((p.get(k) || '').split(',').map(s => s.trim()).filter(Boolean).map(v => k === 'tag' ? G.normTag(v) : k === 'brand' ? G.normBrand(v) : v));
    });
    f.min = p.get('min') ? Number(p.get('min')) : null;
    f.max = p.get('max') ? Number(p.get('max')) : null;
    f.stock = p.get('stock') === '1';
    state.sort = SORTS[p.get('sort')] ? p.get('sort') : 'new';
    $('#q').value = f.q;
    $('#pmin').value = f.min ?? '';
    $('#pmax').value = f.max ?? '';
    $('#inStock').checked = f.stock;
    $('#sort').value = state.sort;
    return p.get('item');
  }

  /* ═══════════ product detail ═══════════ */
  const dlg = $('#pdp');
  let pdpQty = 1;

  function openItem(id, push) {
    const it = state.byId[id];
    if (!it) return;
    state.pdpId = id;
    pdpQty = 1;
    renderPdp(it);
    if (!dlg.open) dlg.showModal();
    if (push) { history.pushState({ item: id }, '', buildParams({ item: id })); state.pdpPushed = true; }
    else syncURL();
    document.title = it.name + ' · ' + (state.settings.storeName || "SB's Garage");
  }

  function renderPdp(it) {
    const sold = it.qty <= 0;
    const inCart = state.cart[it.id] || 0;
    const room = Math.max(0, it.qty - inCart);
    pdpQty = Math.min(Math.max(1, pdpQty), Math.max(1, room));
    const photos = it.photos.length ? it.photos : [''];
    const specs = [['Brand', it.brand], ['Car maker', it.make], ['Series', it.series], ['Year', it.year],
      ['Colour', it.color], ['Condition', it.condition], ['Item code', it.id]].filter(s => s[1]);
    const off = it.compareAt > it.price ? Math.round((1 - it.price / it.compareAt) * 100) : 0;
    $('#pdpInner').innerHTML = `
      <button class="icon-btn pdp-close" data-close aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      <div class="gallery">
        <div class="slides" id="slides">${photos.map((p, i) => G.imgTag(p, 1200, it.name + ' photo ' + (i + 1), i ? 'loading="lazy"' : '')).join('')}</div>
        ${photos.length > 1 ? `
          <button class="icon-btn g-nav g-prev" data-g="-1" aria-label="Previous photo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 6l-6 6 6 6"/></svg></button>
          <button class="icon-btn g-nav g-next" data-g="1" aria-label="Next photo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg></button>
          <div class="thumbs">${photos.map((p, i) => `<button data-slide="${i}" aria-label="Photo ${i + 1}" aria-current="${i === 0}">${G.imgTag(p, 160, '', 'loading="lazy"')}</button>`).join('')}</div>
          <div class="dots">${photos.map((_, i) => `<span class="${i ? '' : 'on'}"></span>`).join('')}</div>` : ''}
      </div>
      <div class="pdp-info">
        ${it.tags.length ? `<div class="badges">${badges(it)}</div>` : ''}
        <div class="meta">${esc([it.brand, it.make].filter(Boolean).join(' · '))}</div>
        <h2>${esc(it.name)}</h2>
        <div class="pdp-price">
          <span class="price">${money(it.price)}${off ? `<s>${money(it.compareAt)}</s>` : ''}</span>
          ${off ? `<span class="save">You save ${money(it.compareAt - it.price)}</span>` : ''}
        </div>
        <div class="stock-line${it.qty === 1 ? ' low' : ''}">${sold ? 'Sold out — ask on WhatsApp, I may find another.' : it.qty === 1 ? 'Last one on the shelf' : it.qty + ' in stock'}${inCart ? ` · ${inCart} in your cart` : ''}</div>
        ${sold ? '' : `<div class="buy-row">
          <div class="stepper" aria-label="Quantity">
            <button data-pq="-1" aria-label="Less" ${pdpQty <= 1 ? 'disabled' : ''}>−</button><span>${pdpQty}</span><button data-pq="1" aria-label="More" ${pdpQty >= room ? 'disabled' : ''}>+</button>
          </div>
          <button class="btn primary" data-pdp-add ${room <= 0 ? 'disabled' : ''}>${room <= 0 ? 'All in your cart' : 'Add to cart'}</button>
        </div>`}
        <div class="pdp-actions">
          <button class="btn" data-ask>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a8.5 8.5 0 0 1-12.6 7.4L3 21l1.6-5.2A8.5 8.5 0 1 1 21 12z"/></svg>
            ${sold ? 'Ask for this' : 'Ask on WhatsApp'}</button>
          <button class="btn" data-share>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v13M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/></svg>
            Share</button>
        </div>
        <dl class="specs">${specs.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
        ${it.notes ? `<p class="notes">${esc(it.notes)}</p>` : ''}
      </div>`;
    const slides = $('#slides');
    if (slides) slides.addEventListener('scroll', onSlideScroll, { passive: true });
  }

  let slideRaf = 0;
  function onSlideScroll() {
    cancelAnimationFrame(slideRaf);
    slideRaf = requestAnimationFrame(() => {
      const s = $('#slides');
      if (!s) return;
      const i = Math.round(s.scrollLeft / s.clientWidth);
      dlg.querySelectorAll('.thumbs button').forEach((b, k) => b.setAttribute('aria-current', k === i));
      dlg.querySelectorAll('.dots span').forEach((d, k) => d.classList.toggle('on', k === i));
    });
  }
  function goSlide(i) {
    const s = $('#slides');
    const n = s.children.length;
    s.scrollTo({ left: ((i + n) % n) * s.clientWidth, behavior: 'smooth' });
  }

  dlg.addEventListener('click', e => {
    if (e.target === dlg || e.target.closest('[data-close]')) return dlg.close();
    const it = state.byId[state.pdpId];
    const g = e.target.closest('[data-g]');
    if (g) { const s = $('#slides'); return goSlide(Math.round(s.scrollLeft / s.clientWidth) + Number(g.dataset.g)); }
    const sl = e.target.closest('[data-slide]');
    if (sl) return goSlide(Number(sl.dataset.slide));
    const pq = e.target.closest('[data-pq]');
    if (pq) { pdpQty += Number(pq.dataset.pq); return renderPdpKeepSlide(it); }
    if (e.target.closest('[data-pdp-add]')) { addToCart(it.id, pdpQty); pdpQty = 1; renderPdpKeepSlide(it); return; }
    if (e.target.closest('[data-ask]')) return askOne(it);
    if (e.target.closest('[data-share]')) return share(it);
  });
  function renderPdpKeepSlide(it) {
    const s = $('#slides');
    const left = s ? s.scrollLeft : 0;
    renderPdp(it);
    const s2 = $('#slides');
    if (s2) { s2.scrollLeft = left; onSlideScroll(); }
  }
  dlg.addEventListener('close', () => {
    state.pdpId = null;
    document.title = (state.settings.storeName || "SB's Garage") + ' · Diecast Store';
    if (state.pdpPushed) { state.pdpPushed = false; history.back(); } else syncURL();
  });
  window.addEventListener('popstate', () => {
    const id = new URLSearchParams(location.search).get('item');
    if (id && state.byId[id]) { openItem(id, false); return; }
    if (dlg.open) { state.pdpPushed = false; dlg.close(); }
  });

  function itemUrl(it) { return location.origin + location.pathname + '?item=' + encodeURIComponent(it.id); }

  async function share(it) {
    const url = itemUrl(it);
    const text = `${it.name} — ${money(it.price)}`;
    if (navigator.share) { try { await navigator.share({ title: it.name, text, url }); } catch (e) { /* cancelled */ } return; }
    try { await navigator.clipboard.writeText(url); toast('Link copied'); } catch (e) { prompt('Copy this link', url); }
  }

  /* ═══════════ WhatsApp ═══════════ */
  function waNumber() {
    let n = String(state.settings.whatsappNumber || '').replace(/\D/g, '');
    if (n.length === 10) n = '91' + n;
    return n;
  }
  const isTouch = () => matchMedia('(pointer: coarse)').matches;
  function openWa(text, preOpened) {
    const url = 'https://wa.me/' + waNumber() + '?text=' + encodeURIComponent(text);
    if (preOpened && !preOpened.closed) { preOpened.location.href = url; return; }
    if (isTouch()) location.href = url; else window.open(url, '_blank', 'noopener');
  }
  function askOne(it) {
    const msg = it.qty > 0
      ? `Hi! Is this still available?\n\n${it.name} (${it.brand}) [${it.id}] — ${money(it.price)}\n${itemUrl(it)}`
      : `Hi! Looking for this one — any chance you can get it?\n\n${it.name} (${it.brand}) [${it.id}]\n${itemUrl(it)}`;
    openWa(msg);
  }

  /* ═══════════ cart ═══════════ */
  function saveCart() { ls.set(CART_KEY, state.cart); renderCartBadge(); }
  function addToCart(id, n) {
    const it = state.byId[id];
    if (!it || it.qty <= 0) return;
    const cur = state.cart[id] || 0;
    const next = Math.min(it.qty, cur + (n || 1));
    if (next === cur) { toast('That\'s all the stock I have'); return; }
    state.cart[id] = next;
    saveCart();
    refreshCardButtons();
    toast('Added to cart');
    const b = $('#cartCount'); b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump');
  }
  function setQty(id, q) {
    if (q <= 0) delete state.cart[id];
    else state.cart[id] = Math.min(q, (state.byId[id] || {}).qty || q);
    saveCart(); refreshCardButtons(); renderCart();
  }
  function cartLines() {
    return Object.keys(state.cart).map(id => ({ id, qty: state.cart[id], it: state.byId[id] }));
  }
  function renderCartBadge() {
    const n = cartLines().reduce((s, l) => s + (l.it && l.it.qty > 0 ? l.qty : 0), 0);
    const b = $('#cartCount');
    b.hidden = !n; b.textContent = n;
  }
  function renderCart() {
    const lines = cartLines();
    const live = lines.filter(l => l.it && l.it.qty > 0);
    $('#cartFoot').hidden = !live.length;
    if (!lines.length) {
      $('#cartItems').innerHTML = '<div class="cart-empty"><strong>Your cart is empty</strong>Find something shiny and hit “Add to cart”.</div>';
      return;
    }
    $('#cartItems').innerHTML = lines.map(l => {
      const it = l.it;
      if (!it || it.qty <= 0) {
        return `<div class="line gone"><img src="${G.PLACEHOLDER}" alt=""><div><div class="t">${esc(it ? it.name : l.id)}</div><div class="s">No longer available</div></div><div class="r"><button class="rm" data-cart-rm="${esc(l.id)}">Remove</button></div></div>`;
      }
      const q = Math.min(l.qty, it.qty);
      return `<div class="line">
        ${G.imgTag(it.photos[0], 160, it.name)}
        <div><div class="t">${esc(it.name)}</div><div class="s">${esc(it.brand)} · ${money(it.price)}${q > 1 ? ' each' : ''}</div></div>
        <div class="r">
          <div class="stepper"><button data-cart-q="${esc(it.id)}" data-d="-1" aria-label="Less">−</button><span>${q}</span><button data-cart-q="${esc(it.id)}" data-d="1" aria-label="More" ${q >= it.qty ? 'disabled' : ''}>+</button></div>
          <button class="rm" data-cart-rm="${esc(it.id)}">Remove</button>
        </div>
      </div>`;
    }).join('');
    const total = live.reduce((s, l) => s + l.it.price * Math.min(l.qty, l.it.qty), 0);
    $('#cartTotal').textContent = money(total);
    $('#cartShip').textContent = state.settings.shippingNote || '';
  }

  function openCart() {
    renderCart();
    $('#cart').classList.add('open'); $('#cart').setAttribute('aria-hidden', 'false');
    $('#scrim').hidden = false; document.body.style.overflow = 'hidden';
  }
  function closePanels() {
    $('#cart').classList.remove('open'); $('#cart').setAttribute('aria-hidden', 'true');
    $('#filters').classList.remove('open');
    $('#scrim').hidden = true; document.body.style.overflow = '';
  }

  async function checkout() {
    const lines = cartLines().filter(l => l.it && l.it.qty > 0).map(l => ({ id: l.id, qty: Math.min(l.qty, l.it.qty), it: l.it }));
    if (!lines.length) return;
    if (!waNumber()) { toast('WhatsApp number not set up yet', true); return; }
    const name = $('#buyerName').value.trim();
    const city = $('#buyerCity').value.trim();
    ls.set('g64_buyer', { name, city });
    const btn = $('#checkout');
    btn.disabled = true;
    const label = btn.innerHTML;
    btn.lastChild.textContent = ' Opening WhatsApp…';
    const pre = !isTouch() ? window.open('', '_blank') : null; // keep popup-blockers happy on desktop
    let ref = '';
    try {
      const r = await G.timeout(G.post('enquiry', { name, city, items: lines.map(l => ({ id: l.id, qty: l.qty })) }), 6000);
      ref = r.enquiryId || '';
    } catch (e) { /* still send the WhatsApp message */ }
    const total = lines.reduce((s, l) => s + l.it.price * l.qty, 0);
    const body = lines.map((l, i) => `${i + 1}. ${l.it.name} (${l.it.brand}) [${l.it.id}]\n    ${l.qty} × ${money(l.it.price)}`).join('\n');
    const msg = `Hi! I'd like to buy these from ${state.settings.storeName || 'your store'}:\n\n${body}\n\nSubtotal: ${money(total)}` +
      (ref ? `\nRef: ${ref}` : '') + (name || city ? `\n\n${[name, city].filter(Boolean).join(' · ')}` : '');
    openWa(msg, pre);
    btn.disabled = false;
    btn.innerHTML = label;
    toast(ref ? 'Order sent · Ref ' + ref : 'Opening WhatsApp…');
  }

  /* ═══════════ misc UI ═══════════ */
  let toastT;
  function toast(msg, err) {
    const t = $('#toast');
    t.textContent = msg; t.classList.toggle('err', !!err); t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2200);
  }

  function applySettings(s) {
    const name = s.storeName || "SB's Garage";
    $('#storeName').textContent = name;
    $('#footName').textContent = name;
    if (!state.pdpId) document.title = name + ' · Diecast Store';
    if (s.tagline) $('#tagline').textContent = s.tagline;
    const ann = $('#announce');
    ann.hidden = !s.announcement; ann.textContent = s.announcement || '';
    $('#shipNote').textContent = s.shippingNote || '';
    const ig = String(s.instagram || '').trim();
    if (ig) { $('#igLink').hidden = false; $('#igLink').href = /^https?:/.test(ig) ? ig : 'https://instagram.com/' + ig.replace(/^@/, ''); }
    if (waNumber()) { $('#waLink').hidden = false; $('#waLink').href = 'https://wa.me/' + waNumber(); }
  }

  function renderStats() {
    const live = state.items.filter(i => i.qty > 0);
    const cars = live.reduce((s, i) => s + i.qty, 0);
    const grails = live.filter(i => i.tags.some(t => ['STH', 'RLC', 'TH', 'Chase'].includes(t))).length;
    const brands = new Set(live.map(i => i.brand)).size;
    $('#heroStats').innerHTML = `<b>${cars}</b> cars on the shelf` +
      (grails ? ` · <b class="gold">${grails}</b> TH / STH / chase` : '') + (brands > 1 ? ` · <b>${brands}</b> brands` : '');
  }

  function skeleton() {
    $('#grid').innerHTML = Array.from({ length: 8 }, () => '<div class="card sk skeleton"></div>').join('');
  }

  /* ═══════════ boot ═══════════ */
  function boot(cat) {
    const { items, settings } = prepare(cat);
    state.items = items;
    state.byId = Object.fromEntries(items.map(i => [i.id, i]));
    state.settings = settings;
    applySettings(settings);
    renderStats();
    apply({ keepUrl: true });
    renderCartBadge();
    if ($('#cart').classList.contains('open')) renderCart();
    if (state.pdpId && state.byId[state.pdpId]) renderPdpKeepSlide(state.byId[state.pdpId]);
    if (!state.booted) {
      state.booted = true;
      const id = new URLSearchParams(location.search).get('item');
      if (id && state.byId[id]) openItem(id, false);
    }
  }

  async function load() {
    const cached = G.DEMO ? null : ls.get(CAT_KEY);
    if (cached && cached.api === G.cfg.API_URL && cached.data) boot(cached.data);
    else skeleton();
    try {
      const fresh = await G.getCatalog();
      if (!G.DEMO) ls.set(CAT_KEY, { api: G.cfg.API_URL, data: fresh });
      boot(fresh);
    } catch (e) {
      if (!state.booted) {
        $('#grid').innerHTML = '';
        $('#empty').hidden = false;
        $('#empty .empty-title').textContent = 'Couldn’t load the shelf.';
        $('#empty p.muted').textContent = 'Check your connection and refresh. (' + e.message + ')';
      }
    }
  }

  /* ═══════════ events ═══════════ */
  readURL();
  const saved = ls.get('g64_buyer');
  if (saved) { $('#buyerName').value = saved.name || ''; $('#buyerCity').value = saved.city || ''; }

  let qT;
  $('#q').addEventListener('input', e => { clearTimeout(qT); qT = setTimeout(() => { state.f.q = e.target.value.trim(); apply(); }, 140); });
  $('#q').addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); });
  $('#sort').addEventListener('change', e => { state.sort = e.target.value; apply(); });
  $('#inStock').addEventListener('change', e => { state.f.stock = e.target.checked; apply(); });
  const priceInput = (k, el) => el.addEventListener('input', () => {
    clearTimeout(qT);
    qT = setTimeout(() => { state.f[k] = el.value === '' ? null : Math.max(0, Number(el.value)); apply(); }, 350);
  });
  priceInput('min', $('#pmin'));
  priceInput('max', $('#pmax'));

  $('#filters').addEventListener('change', e => {
    const cb = e.target.closest('[data-facet]');
    if (!cb) return;
    const set = state.f[cb.dataset.facet];
    cb.checked ? set.add(cb.value) : set.delete(cb.value);
    apply();
  });
  $('#filters').addEventListener('input', e => {
    if (!e.target.matches('[data-facet-search]')) return;
    state.makeQ = e.target.value; renderFacets();
  });
  $('#filters').addEventListener('click', e => {
    const m = e.target.closest('[data-toggle]');
    if (!m) return;
    const k = m.dataset.toggle;
    state.openFacets.has(k) ? state.openFacets.delete(k) : state.openFacets.add(k);
    renderFacets();
  });

  $('#quick').addEventListener('click', e => {
    const c = e.target.closest('[data-quick]');
    if (!c) return;
    const k = c.dataset.quick;
    if (k === 'all') { state.f.tag.clear(); state.f.brand.clear(); }
    else { const s = state.f[k]; s.has(c.dataset.v) ? s.delete(c.dataset.v) : s.add(c.dataset.v); }
    apply();
  });

  $('#active').addEventListener('click', e => {
    const c = e.target.closest('[data-rm]');
    if (!c) return;
    const k = c.dataset.rm;
    if (k === 'all') return clearAll();
    if (k === 'q') { state.f.q = ''; $('#q').value = ''; }
    else if (k === 'min' || k === 'max') { state.f[k] = null; $('#p' + k).value = ''; }
    else if (k === 'stock') { state.f.stock = false; $('#inStock').checked = false; }
    else state.f[k].delete(c.dataset.v);
    apply();
  });
  $('#clearAll').addEventListener('click', clearAll);
  $('#emptyClear').addEventListener('click', clearAll);

  $('#grid').addEventListener('click', e => {
    const add = e.target.closest('[data-add]');
    if (add) { const it = state.byId[add.dataset.add]; state.cart[it.id] ? openCart() : addToCart(it.id, 1); return; }
    const open = e.target.closest('[data-open]');
    if (open) openItem(open.dataset.open, true);
  });

  $('#cartBtn').addEventListener('click', openCart);
  $('#closeCart').addEventListener('click', closePanels);
  $('#scrim').addEventListener('click', closePanels);
  $('#openFilters').addEventListener('click', () => { $('#filters').classList.add('open'); $('#scrim').hidden = false; document.body.style.overflow = 'hidden'; });
  $('#closeFilters').addEventListener('click', closePanels);
  $('#showResults').addEventListener('click', () => { closePanels(); window.scrollTo({ top: $('.toolbar').offsetTop - 70, behavior: 'smooth' }); });
  $('#cartItems').addEventListener('click', e => {
    const q = e.target.closest('[data-cart-q]');
    if (q) return setQty(q.dataset.cartQ, (state.cart[q.dataset.cartQ] || 0) + Number(q.dataset.d));
    const rm = e.target.closest('[data-cart-rm]');
    if (rm) setQty(rm.dataset.cartRm, 0);
  });
  $('#checkout').addEventListener('click', checkout);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closePanels(); });

  new IntersectionObserver(es => { if (es[0].isIntersecting) renderMore(); }, { rootMargin: '600px' }).observe($('#sentinel'));

  // pick up sheet edits when someone comes back to the tab
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.booted && !G.DEMO) {
      G.getCatalog().then(c => { ls.set(CAT_KEY, { api: G.cfg.API_URL, data: c }); boot(c); }).catch(() => {});
    }
  });

  load();
})();
