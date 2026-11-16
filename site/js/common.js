/* SB's Garage — helpers shared by the store and the admin panel */
(function () {
  const cfg = Object.assign({
    API_URL: '',
    IMG_TEMPLATE: 'https://lh3.googleusercontent.com/d/{id}=w{w}',
    IMG_FALLBACK: 'https://drive.google.com/thumbnail?id={id}&sz=w{w}',
  }, window.G64_CONFIG || {});
  const DEMO = !cfg.API_URL;

  /* ── Tags: canonical names, aliases, rarity rank, badge style ── */
  const TAGS = [
    { key: 'STH', short: 'STH', label: 'Super Treasure Hunt', rank: 100, cls: 'b-sth', aliases: ['sth', 'super treasure hunt', 'super th', '$th', 'super'] },
    { key: 'RLC', short: 'RLC', label: 'Red Line Club', rank: 90, cls: 'b-rlc', aliases: ['rlc', 'red line club', 'redline club'] },
    { key: 'TH', short: 'TH', label: 'Treasure Hunt', rank: 80, cls: 'b-th', aliases: ['th', 'treasure hunt', 'regular th'] },
    { key: 'Chase', short: 'Chase', label: 'Chase', rank: 75, cls: 'b-chase', aliases: ['chase', 'chase car'] },
    { key: 'Rare', short: 'Rare', label: 'Rare', rank: 70, cls: 'b-rare', aliases: ['rare', 'grail', 'limited'] },
    { key: 'Team Transport', short: 'Team Transport', label: 'Team Transport', rank: 50, cls: 'b-tt', aliases: ['team transport', 'tt', 'transport'] },
    { key: 'Premium', short: 'Premium', label: 'Premium', rank: 45, cls: 'b-prem', aliases: ['premium', 'prem'] },
    { key: 'Silver Series', short: 'Silver', label: 'Silver Series', rank: 35, cls: 'b-silver', aliases: ['silver series', 'silver', 'ss'] },
    { key: 'Pack of 5', short: '5-Pack', label: 'Pack of 5', rank: 25, cls: 'b-5pk', aliases: ['pack of 5', '5 pack', '5-pack', '5pack', 'five pack'] },
    { key: 'Mainline', short: 'Mainline', label: 'Mainline', rank: 10, cls: 'b-main', aliases: ['mainline', 'basic', 'ml'] },
  ];
  const TAG_INDEX = {};
  TAGS.forEach(t => { TAG_INDEX[t.key.toLowerCase()] = t; t.aliases.forEach(a => { TAG_INDEX[a] = t; }); });
  const tagDef = name => TAG_INDEX[String(name || '').toLowerCase().trim()] || null;
  const normTag = name => { const d = tagDef(name); return d ? d.key : String(name || '').trim(); };

  /* ── Brands & car makes: tidy up whatever gets typed in the sheet ── */
  const BRAND_CANON = {
    hotwheels: 'Hot Wheels', hw: 'Hot Wheels', minigt: 'Mini GT', mgt: 'Mini GT', kaidohouse: 'Kaido House', kaido: 'Kaido House',
    inno64: 'Inno64', inno: 'Inno64', poprace: 'Pop Race', matchbox: 'Matchbox', tarmacworks: 'Tarmac Works', tarmac: 'Tarmac Works',
    tomica: 'Tomica', tomicalimitedvintage: 'Tomica', majorette: 'Majorette', greenlight: 'Greenlight', m2machines: 'M2 Machines', m2: 'M2 Machines',
  };
  const normBrand = b => BRAND_CANON[String(b || '').toLowerCase().replace(/[^a-z0-9]/g, '')] || String(b || '').trim();

  const MAKE_CANON = {
    vw: 'Volkswagen', volkswagen: 'Volkswagen', merc: 'Mercedes-Benz', mercedes: 'Mercedes-Benz', mercedesbenz: 'Mercedes-Benz',
    benz: 'Mercedes-Benz', chevy: 'Chevrolet', chevrolet: 'Chevrolet', lambo: 'Lamborghini', bmw: 'BMW', gmc: 'GMC', amg: 'Mercedes-AMG',
    mercedesamg: 'Mercedes-AMG', mclaren: 'McLaren', delorean: 'DeLorean', astonmartin: 'Aston Martin', alfaromeo: 'Alfa Romeo',
    landrover: 'Land Rover', rollsroyce: 'Rolls-Royce', lbworks: 'LB Works', libertywalk: 'LB Works', rwb: 'RWB', tvr: 'TVR',
  };
  const normMake = m => {
    const raw = String(m || '').trim();
    const k = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (MAKE_CANON[k]) return MAKE_CANON[k];
    return raw.length <= 3 ? raw.toUpperCase() : raw.replace(/\b[a-z]/g, c => c.toUpperCase());
  };
  const JDM = ['nissan', 'toyota', 'honda', 'mazda', 'mitsubishi', 'subaru', 'datsun', 'acura', 'lexus', 'suzuki', 'isuzu', 'infiniti', 'daihatsu'];

  /* ── Formatting ── */
  const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
  const money = n => (n == null || isNaN(n) ? '—' : inr.format(n));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isUrl = r => /^(https?:|data:|blob:|\.{0,2}\/)/i.test(r);
  const img = (ref, w) => {
    ref = String(ref || '').trim();
    if (!ref) return '';
    return isUrl(ref) ? ref : cfg.IMG_TEMPLATE.replace('{id}', encodeURIComponent(ref)).replace('{w}', w || 800);
  };
  const imgFallback = (ref, w) => (!ref || isUrl(ref) ? '' : cfg.IMG_FALLBACK.replace('{id}', encodeURIComponent(ref)).replace('{w}', w || 800));
  const PLACEHOLDER = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="#1a1d23"/>' +
    '<path d="M70 190l18-26q16-10 52-12l34-26q18-10 56-10l36 2q24 4 42 30l34 8q18 6 18 22v18H70z" fill="none" stroke="#3a3f4a" stroke-width="6" stroke-linejoin="round"/>' +
    '<circle cx="130" cy="196" r="22" fill="#1a1d23" stroke="#3a3f4a" stroke-width="6"/><circle cx="292" cy="196" r="22" fill="#1a1d23" stroke="#3a3f4a" stroke-width="6"/></svg>');

  // One global handler: Drive URL → fallback URL → placeholder.
  document.addEventListener('error', e => {
    const el = e.target;
    if (!el || el.tagName !== 'IMG') return;
    const fb = el.dataset.ref && !el.dataset.fb ? imgFallback(el.dataset.ref, el.dataset.w) : '';
    el.dataset.fb = '1';
    if (fb) { el.src = fb; return; }
    if (el.src !== PLACEHOLDER) { el.src = PLACEHOLDER; el.classList.add('is-placeholder'); }
  }, true);

  const imgTag = (ref, w, alt, extra) => ref
    ? `<img src="${esc(img(ref, w))}" data-ref="${esc(ref)}" data-w="${w}" alt="${esc(alt || '')}" ${extra || ''}>`
    : `<img src="${PLACEHOLDER}" class="is-placeholder" alt="${esc(alt || '')}" ${extra || ''}>`;

  /* ── Backend calls ── */
  function loadScript(src) {
    return new Promise((res, rej) => {
      if (document.querySelector(`script[src="${src}"]`)) return res();
      const s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src));
      document.head.appendChild(s);
    });
  }

  async function getCatalog(fresh) {
    if (DEMO) { await loadScript('js/demo-data.js'); return window.G64_DEMO_CATALOG(); }
    const url = cfg.API_URL + (cfg.API_URL.includes('?') ? '&' : '?') + 'action=catalog' + (fresh ? '&fresh=1' : '');
    const res = await fetch(url);
    const j = await res.json();
    if (!j.ok) throw new Error(j.error || 'Could not load catalog');
    return j;
  }

  async function post(action, payload) {
    if (DEMO) {
      if (action === 'enquiry') return { ok: true, enquiryId: 'DEMO-' + Math.floor(Math.random() * 9000 + 1000) };
      throw new Error('Demo mode — add your API_URL in config.js to use the admin panel.');
    }
    const res = await fetch(cfg.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // "simple" request → no CORS preflight
      body: JSON.stringify(Object.assign({ action: action }, payload || {})),
    });
    const text = await res.text();
    let j;
    try { j = JSON.parse(text); } catch (e) {
      throw new Error('Backend did not return JSON. Is the Web App deployed with access "Anyone"?');
    }
    if (!j.ok) { const err = new Error(j.error || 'Request failed'); err.code = j.code; throw err; }
    return j;
  }

  const timeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

  window.G64 = {
    cfg, DEMO, TAGS, tagDef, normTag, normBrand, normMake, JDM,
    money, esc, img, imgTag, PLACEHOLDER, getCatalog, post, timeout,
  };
})();
