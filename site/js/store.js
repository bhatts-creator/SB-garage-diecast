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
    sort: 'picks',
    cart: ls.get(CART_KEY) || {},
    openFacets: new Set(), makeQ: '', pdpPushed: false, pdpId: null,
    closedFacets: new Set(ls.get('g64_closed_facets') || []),
  };

  /* ═══════════ data prep ═══════════ */
  const norm = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/['’`]/g, '');
  const uniq = arr => { const seen = new Set(); return arr.filter(x => { const k = x.toLowerCase(); if (!x || seen.has(k)) return false; seen.add(k); return true; }); };

  function prepare(cat) {
    const s = cat.settings || {};
    const cutoff = Date.now() - Number(s.newBadgeDays || 7) * 864e5;
    const showSold = !/^(no|false|0|hide)$/i.test(String(s.showSoldOut || 'yes').trim());
    const items = (cat.items || []).map(raw => {
      const brand = G.normBrand(raw.brand);
      let tags = uniq((raw.tags || []).map(G.normTag));
      if (PREMIUM_BRANDS.includes(brand)) tags = uniq(tags.filter(t => t !== 'Mainline').concat('Premium'));
      const make = raw.make ? G.normMake(raw.make) : '';
      const rank = tags.reduce((m, t) => Math.max(m, (G.tagDef(t) || {}).rank || 0), 0);
      const labels = tags.map(t => (G.tagDef(t) || {}).label || '');
      const hay = norm([raw.name, brand, make, raw.series, raw.year, raw.color, raw.condition, raw.id, raw.modelNo, ...tags, ...labels].join(' '));
      return Object.assign({}, raw, {
        brand, make, tags, rank, hay, hayC: hay.replace(/[^a-z0-9]/g, ''),
        price: Number(raw.price) || 0, qty: Number(raw.qty) || 0, photos: raw.photos || [],
        isNew: !!raw.added && raw.added > cutoff, jdm: G.JDM.includes(make.toLowerCase()),
      });
    }).filter(it => showSold || it.qty > 0);
    const sets = (cat.sets || []).map(x => makeSet(x, items)).filter(Boolean);
    return { items: sets.concat(items), settings: s };
  }

  // a complete set becomes one listing; it's buyable only while every car in it is in stock
  function makeSet(x, items) {
    const ms = (x.members || []).map(m => Object.assign({}, m, { brand: G.normBrand(m.brand), qty: Number(m.qty) || 0, price: Number(m.price) || 0 }));
    if (ms.length < 2) return null;
    const qty = Math.min(...ms.map(m => m.qty));
    if (qty <= 0) return null;
    const one = k => (new Set(ms.map(m => m[k] || '')).size === 1 ? ms[0][k] : '');
    const brand = one('brand') || 'Mixed';
    const sum = ms.reduce((t, m) => t + m.price, 0);
    const allPrem = ms.every(m => PREMIUM_BRANDS.includes(m.brand) || (m.tags || []).map(G.normTag).includes('Premium'));
    const tags = ['Complete Set'].concat(allPrem ? ['Premium'] : []);
    const hay = norm([x.name, brand, one('series'), 'set bundle package complete', ...ms.map(m => [m.name, m.make, m.modelNo].join(' '))].join(' '));
    return {
      id: x.id, isSet: true, name: x.name, brand, make: one('make'), series: one('series') || `Set of ${ms.length}`, year: one('year'),
      tags, rank: 60, hay, hayC: hay.replace(/[^a-z0-9]/g, ''), condition: '', color: '', notes: x.notes || '',
      price: Number(x.price) || 0, compareAt: sum > x.price ? sum : 0, qty, members: ms,
      photos: ms.map(m => (m.photos || [])[0]).filter(Boolean), added: Date.now(), n: 0, isNew: false, jdm: false,
    };
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
    picks: (a, b) => b.rank - a.rank || b.price - a.price || (b.added || 0) - (a.added || 0),
    new: (a, b) => (b.added || 0) - (a.added || 0) || b.n - a.n,
    rarity: (a, b) => b.rank - a.rank || b.price - a.price,
    priceAsc: (a, b) => a.price - b.price,
    priceDesc: (a, b) => b.price - a.price,
    name: (a, b) => a.name.replace(/^'/, '').localeCompare(b.name.replace(/^'/, '')),
    brand: (a, b) => a.brand.localeCompare(b.brand) || a.name.localeCompare(b.name),
  };

  function apply(opts) {
    state.toks = tokens(state.f.q);
    const s = SORTS[state.sort] || SORTS.picks;
    state.list = state.items.filter(it => passes(it)).sort((a, b) => (a.qty > 0 ? 0 : 1) - (b.qty > 0 ? 0 : 1) || s(a, b));
    state.shown = PAGE;
    renderGrid();
    renderFacets();
    renderQuick();
    renderActive();
    $('#resultCount').textContent = state.list.length === 1 ? '1 model on the shelf' : state.list.length + ' models on the shelf';
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
    return state.cart[it.id] ? 'In bag ✓' : 'Add to bag';
  }

  const priceText = it => (it.price > 0 ? money(it.price) : 'Ask for price');

  // brands that only make premium models: never "Mainline"
  const PREMIUM_BRANDS = ['Mini GT', 'Kaido House', 'Inno64', 'Pop Race', 'Tarmac Works', 'Greenlight', 'M2 Machines'];

  function topTag(it) {
    const t = it.tags.slice().sort((a, b) => ((G.tagDef(b) || {}).rank || 0) - ((G.tagDef(a) || {}).rank || 0))[0];
    if (!t) return '';
    const d = G.tagDef(t);
    return `<span class="card-tag${d && d.rank >= 60 ? ' hot' : ''}" title="${esc(d ? d.label : t)}">${esc(d ? d.label : t)}</span>`;
  }

  function card(it, i) {
    const sold = it.qty <= 0;
    const off = it.price > 0 && it.compareAt > it.price ? Math.round((1 - it.price / it.compareAt) * 100) : 0;
    const sub = it.isSet ? `${it.members.length} cars${it.compareAt > it.price ? ' · save ' + money(it.compareAt - it.price) : ''}` : [it.series, it.year].filter(Boolean).join(' · ');
    const meta = it.isSet ? [it.brand, 'Complete set'].join(' · ') : [it.brand, it.make].filter(Boolean).join(' · ');
    const pics = (it.photos.length ? it.photos : ['']).slice(0, it.isSet ? 8 : 6);
    return `<article class="card${it.isSet ? ' is-set' : ''}${sold ? ' is-sold' : ''}" data-id="${esc(it.id)}">
      <div class="card-media" data-open="${esc(it.id)}" role="button" tabindex="0" aria-label="View ${esc(it.name)}">
        <span class="card-no">${String(i + 1).padStart(2, '0')}</span>
        ${topTag(it)}
        <div class="cm-frame">
          <div class="cm-track">${pics.map((p, k) => G.imgTag(p, 600, k ? '' : it.name, 'loading="lazy" decoding="async" draggable="false"')).join('')}</div>
          ${off && !sold ? `<span class="discount">-${off}%</span>` : ''}
          ${sold ? '<span class="sold-stamp">SOLD</span>' : ''}
          ${pics.length > 1 ? `
            <button class="cm-nav cm-prev" data-cm="-1" aria-label="Previous photo">‹</button>
            <button class="cm-nav cm-next" data-cm="1" aria-label="Next photo">›</button>
            <span class="cm-dots">${pics.map((_, k) => `<i class="${k ? '' : 'on'}"></i>`).join('')}</span>` : ''}
        </div>
      </div>
      <div class="card-body">
        <div class="card-meta">${esc(meta)}</div>
        <h3 class="card-title"><button data-open="${esc(it.id)}">${esc(it.name)}</button></h3>
        ${sub ? `<div class="card-sub">${esc(sub)}</div>` : ''}
        <div class="card-foot">
          <span class="price">${priceText(it)}${it.price > 0 && it.compareAt > it.price ? `<s>${money(it.compareAt)}</s>` : ''}</span>
          ${sold ? '' : `<span class="stock">Qty ${it.qty}</span>`}
        </div>
        <button class="btn small add${state.cart[it.id] ? ' in' : ''}" data-add="${esc(it.id)}" ${sold ? 'disabled' : ''}>${addLabel(it)}</button>
      </div>
    </article>`;
  }

  function renderGrid() {
    const grid = $('#grid');
    grid.innerHTML = state.list.slice(0, state.shown).map((it, i) => card(it, i)).join('');
    $('#empty').hidden = state.list.length > 0;
  }
  function renderMore() {
    if (state.shown >= state.list.length) return;
    const start = state.shown;
    const next = state.list.slice(start, start + PAGE);
    state.shown += PAGE;
    $('#grid').insertAdjacentHTML('beforeend', next.map((it, i) => card(it, start + i)).join(''));
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
        el.innerHTML = `<button class="facet-head" data-collapse="${fc.key}" aria-expanded="true"><h3>${fc.title}</h3><span class="chev" aria-hidden="true"></span></button>${fc.search ? `<input class="input facet-search" data-facet-search placeholder="Search makers…" hidden>` : ''}<div class="opts"></div><button class="link more" hidden></button>`;
        el.dataset.ready = '1';
      }
      const closed = state.closedFacets.has(fc.key);
      el.classList.toggle('closed', closed);
      el.querySelector('.facet-head').setAttribute('aria-expanded', !closed);
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

  // fixed shelf tabs; each one is a preset of the brand / tag filters
  const TABS = [
    { id: 'all', label: 'All models', tag: [], brand: [] },
    { id: 'premium', label: 'Premium', tag: ['Premium'], brand: [] },
    { id: 'mainline', label: 'Mainline', tag: ['Mainline'], brand: [] },
    { id: 'rare', label: 'Rare finds', tag: ['STH', 'TH', 'RLC', 'Chase', 'Rare'], brand: [] },
    { id: 'sets', label: 'Complete sets', tag: ['Complete Set'], brand: [] },
    { id: 'tt', label: 'Team Transport', tag: ['Team Transport'], brand: [] },
    { id: 'minigt', label: 'Mini GT', tag: [], brand: ['Mini GT'] },
  ];
  const sameSet = (set, arr) => set.size === arr.length && arr.every(v => set.has(v));
  const tabOn = t => sameSet(state.f.tag, t.tag) && sameSet(state.f.brand, t.brand);
  const tabHas = t => t.id === 'all' || state.items.some(it => (!t.tag.length || it.tags.some(x => t.tag.includes(x))) && (!t.brand.length || t.brand.includes(it.brand)));

  function renderQuick() {
    $('#quick').innerHTML = TABS.filter(t => tabHas(t) || tabOn(t))
      .map(t => `<button class="tab" data-tab="${t.id}" aria-pressed="${tabOn(t)}">${esc(t.label)}</button>`).join('');
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
    if (state.sort !== 'picks') p.set('sort', state.sort);
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
    state.sort = SORTS[p.get('sort')] ? p.get('sort') : 'picks';
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
    const specs = it.isSet ? [['Brand', it.brand], ['Series', it.series], ['Cars', it.members.length], ['Bought separately', it.compareAt ? money(it.compareAt) : '']].filter(s => s[1])
      : [['Brand', it.brand], ['Car maker', it.make], ['Series', it.series], ['Year', it.year],
        ['Colour', it.color], ['Condition', it.condition], ['Model no.', it.modelNo], ['Item code', it.id]].filter(s => s[1]);
    const inSet = !it.isSet && it.set ? state.items.find(x => x.isSet && x.members.some(m => m.id === it.id)) : null;
    const members = it.isSet ? `<div class="set-list"><h3>In this set</h3>${it.members.map(m => {
      const live = state.byId[m.id];
      return `<${live ? `button data-goto="${esc(m.id)}"` : 'div'} class="set-row">${G.imgTag((m.photos || [])[0], 160, '')}<span><b>${esc(m.name)}</b><small>${esc([m.make, m.modelNo].filter(Boolean).join(' · '))}</small></span>${live && m.price > 0 ? `<em>${money(m.price)}</em>` : ''}</${live ? 'button' : 'div'}>`;
    }).join('')}</div>` : '';
    const setNote = inSet ? `<button class="set-promo" data-goto="${esc(inSet.id)}"><span>Also sold as a complete set</span><b>${esc(inSet.name)} · ${inSet.members.length} cars · ${money(inSet.price)}</b></button>` : '';
    const off = it.price > 0 && it.compareAt > it.price ? Math.round((1 - it.price / it.compareAt) * 100) : 0;
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
          <span class="price">${priceText(it)}${off ? `<s>${money(it.compareAt)}</s>` : ''}</span>
          ${off ? `<span class="save">You save ${money(it.compareAt - it.price)}</span>` : ''}
        </div>
        <div class="stock-line${it.qty === 1 ? ' low' : ''}">${sold ? 'Sold out.' : it.isSet ? (it.qty > 1 ? it.qty + ' full sets available' : '1 full set available') : 'Qty ' + it.qty + ' in stock'}${inCart ? ` · ${inCart} in your bag` : ''}</div>
        ${sold ? '' : `<div class="buy-row">
          <div class="stepper" aria-label="Quantity">
            <button data-pq="-1" aria-label="Less" ${pdpQty <= 1 ? 'disabled' : ''}>−</button><span>${pdpQty}</span><button data-pq="1" aria-label="More" ${pdpQty >= room ? 'disabled' : ''}>+</button>
          </div>
          <button class="btn primary" data-pdp-add ${room <= 0 ? 'disabled' : ''}>${room <= 0 ? 'All in your bag' : 'Add to bag'}</button>
        </div>`}
        <div class="pdp-actions">
          ${igHandle() ? `<button class="btn" data-ask>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/></svg>
            ${sold ? 'Ask for this' : 'Ask on Instagram'}</button>` : ''}
          <button class="btn" data-share>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v13M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/></svg>
            Share</button>
        </div>
        ${setNote}
        ${members}
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
    const go = e.target.closest('[data-goto]');
    if (go && state.byId[go.dataset.goto]) { pdpQty = 1; return openItem(go.dataset.goto, false); }
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
    document.title = (state.settings.storeName || "SB's Garage") + ' · Diecast Collection';
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

  /* ═══════════ Instagram (optional) ═══════════ */
  function igHandle() {
    const ig = String(state.settings.instagram || '').trim();
    const m = ig.match(/instagram\.com\/([\w.]+)/i);
    return (m ? m[1] : ig.replace(/^@/, '')).replace(/[^\w.]/g, '');
  }
  async function askOne(it) {
    // Instagram DMs can't be pre-filled, so copy the car's link for the buyer to paste
    try { await navigator.clipboard.writeText(`${it.name} [${it.id}] ${itemUrl(it)}`); toast('Car link copied — paste it in the DM'); } catch (e) { /* ignore */ }
    window.open('https://ig.me/m/' + igHandle(), '_blank', 'noopener');
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
    toast('Added to bag');
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
    b.textContent = n;
  }
  function renderCart() {
    const lines = cartLines();
    const live = lines.filter(l => l.it && l.it.qty > 0);
    $('#cartFoot').hidden = !live.length;
    if (!lines.length) {
      $('#cartItems').innerHTML = '<div class="cart-empty"><strong>Your bag is empty</strong>Find something shiny and hit “Add to bag”.</div>';
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
        <div><div class="t">${esc(it.name)}</div><div class="s">${esc(it.isSet ? 'Complete set · ' + it.members.length + ' cars' : it.brand)} · ${priceText(it)}${q > 1 && it.price > 0 ? ' each' : ''}</div></div>
        <div class="r">
          <div class="stepper"><button data-cart-q="${esc(it.id)}" data-d="-1" aria-label="Less">−</button><span>${q}</span><button data-cart-q="${esc(it.id)}" data-d="1" aria-label="More" ${q >= it.qty ? 'disabled' : ''}>+</button></div>
          <button class="rm" data-cart-rm="${esc(it.id)}">Remove</button>
        </div>
      </div>`;
    }).join('');
    const total = live.reduce((s, l) => s + l.it.price * Math.min(l.qty, l.it.qty), 0);
    const ask = live.filter(l => !(l.it.price > 0)).length;
    $('#cartTotal').textContent = money(total) + (ask ? ` + ${ask} on request` : '');
    $('#cartShip').textContent = state.settings.shippingNote || '';
  }

  function openCart() {
    $('#cartDone').hidden = true; $('#cartItems').hidden = false;
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
    const name = $('#buyerName').value.trim();
    const contact = $('#buyerContact').value.trim();
    const city = $('#buyerCity').value.trim();
    const note = $('#buyerNote').value.trim();
    if (!name) { toast('Please add your name', true); $('#buyerName').focus(); return; }
    if (contact.replace(/[^0-9a-z]/gi, '').length < 4) { toast('Add your phone number or Instagram handle', true); $('#buyerContact').focus(); return; }
    ls.set('g64_buyer', { name, contact, city });
    const btn = $('#checkout');
    btn.disabled = true;
    btn.textContent = 'Sending…';
    try {
      const r = await G.timeout(G.post('enquiry', { name, contact, city, note, items: lines.map(l => ({ id: l.id, qty: l.qty })) }), 20000);
      const total = lines.reduce((s, l) => s + l.it.price * l.qty, 0);
      const cars = lines.reduce((s, l) => s + l.qty * (l.it.isSet ? l.it.members.length : 1), 0);
      $('#cartDone').innerHTML = `<div class="done-ic">✓</div><h3>Order request sent</h3>
        <p>Ref <b>${esc(r.enquiryId || '')}</b> · ${cars} car${cars > 1 ? 's' : ''} · ${money(total)}</p>
        <p class="muted">I'll reach out on <b>${esc(contact)}</b> to confirm availability, shipping and payment. Nothing is charged yet.</p>
        <button class="btn block" data-done-close>Keep browsing</button>`;
      state.cart = {};
      saveCart();
      refreshCardButtons();
      $('#cartItems').hidden = true; $('#cartFoot').hidden = true; $('#cartDone').hidden = false;
      $('#buyerNote').value = '';
    } catch (e) {
      toast(e.message === 'timeout' ? 'That took too long — please try again' : e.message, true);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Send order request';
    }
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
    if (!state.pdpId) document.title = name + ' · Diecast Collection';
    const ann = $('#announce');
    ann.hidden = !s.announcement; ann.textContent = s.announcement || '';
    $('#shipNote').textContent = s.shippingNote || '';
    const ig = String(s.instagram || '').trim();
    if (ig) { $('#igLink').hidden = false; $('#igLink').href = /^https?:/.test(ig) ? ig : 'https://instagram.com/' + ig.replace(/^@/, ''); }
  }

  function renderStats() {
    $('#shelfCount').textContent = state.items.filter(i => !i.isSet).length;
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
        $('#empty p.muted').innerHTML = G.esc(e.message) + ' <a href="check.html">Run the setup check →</a>';
      }
    }
  }

  /* ═══════════ events ═══════════ */
  readURL();
  const saved = ls.get('g64_buyer');
  if (saved) { $('#buyerName').value = saved.name || ''; $('#buyerContact').value = saved.contact || ''; $('#buyerCity').value = saved.city || ''; }

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
    const c = e.target.closest('[data-collapse]');
    if (c) {
      const k = c.dataset.collapse;
      state.closedFacets.has(k) ? state.closedFacets.delete(k) : state.closedFacets.add(k);
      ls.set('g64_closed_facets', [...state.closedFacets]);
      renderFacets();
      return;
    }
    const m = e.target.closest('[data-toggle]');
    if (!m) return;
    const k = m.dataset.toggle;
    state.openFacets.has(k) ? state.openFacets.delete(k) : state.openFacets.add(k);
    renderFacets();
  });

  $('#quick').addEventListener('click', e => {
    const c = e.target.closest('[data-tab]');
    if (!c) return;
    const t = TABS.find(x => x.id === c.dataset.tab);
    state.f.tag = new Set(t.tag);
    state.f.brand = new Set(t.brand);
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
    const nav = e.target.closest('[data-cm]');
    if (nav) {
      const tr = nav.closest('.card-media').querySelector('.cm-track');
      tr.scrollBy({ left: Number(nav.dataset.cm) * tr.clientWidth, behavior: 'smooth' });
      return;
    }
    const add = e.target.closest('[data-add]');
    if (add) { const it = state.byId[add.dataset.add]; state.cart[it.id] ? openCart() : addToCart(it.id, 1); return; }
    const open = e.target.closest('[data-open]');
    if (open) openItem(open.dataset.open, true);
  });

  $('#grid').addEventListener('keydown', e => {
    const m = e.target.closest('.card-media');
    if (m && (e.key === 'Enter' || e.key === ' ') && e.target === m) { e.preventDefault(); openItem(m.dataset.open, true); }
  });
  let dotRaf = 0;
  $('#grid').addEventListener('scroll', e => {
    if (!e.target.classList || !e.target.classList.contains('cm-track')) return;
    const tr = e.target;
    cancelAnimationFrame(dotRaf);
    dotRaf = requestAnimationFrame(() => {
      const i = Math.round(tr.scrollLeft / tr.clientWidth);
      tr.parentElement.querySelectorAll('.cm-dots i').forEach((d, k) => d.classList.toggle('on', k === i));
    });
  }, true);

  $('#cartBtn').addEventListener('click', openCart);
  $('#closeCart').addEventListener('click', closePanels);
  $('#scrim').addEventListener('click', closePanels);
  const applySideHidden = () => document.body.classList.toggle('filters-hidden', !!ls.get('g64_hide_filters'));
  applySideHidden();
  $('#toggleSide').addEventListener('click', () => { ls.set('g64_hide_filters', !ls.get('g64_hide_filters')); applySideHidden(); });
  $('#openFilters').addEventListener('click', () => { $('#filters').classList.add('open'); $('#scrim').hidden = false; document.body.style.overflow = 'hidden'; });
  $('#closeFilters').addEventListener('click', closePanels);
  $('#showResults').addEventListener('click', () => { closePanels(); window.scrollTo({ top: $('#collection').offsetTop - 90, behavior: 'smooth' }); });
  $('#cartItems').addEventListener('click', e => {
    const q = e.target.closest('[data-cart-q]');
    if (q) return setQty(q.dataset.cartQ, (state.cart[q.dataset.cartQ] || 0) + Number(q.dataset.d));
    const rm = e.target.closest('[data-cart-rm]');
    if (rm) setQty(rm.dataset.cartRm, 0);
  });
  $('#checkout').addEventListener('click', checkout);
  $('#cartDone').addEventListener('click', e => { if (e.target.closest('[data-done-close]')) closePanels(); });
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
