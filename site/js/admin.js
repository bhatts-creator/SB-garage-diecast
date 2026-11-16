/* SB's Garage — admin panel */
(() => {
  const G = window.G64;
  const { esc, money } = G;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const ls = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
  };
  const KEY = 'g64_admin_key';
  const COMMON_MAKES = ['Nissan', 'Toyota', 'Honda', 'Mazda', 'Mitsubishi', 'Subaru', 'Datsun', 'Porsche', 'Ferrari', 'Lamborghini',
    'BMW', 'Mercedes-Benz', 'Audi', 'Volkswagen', 'Ford', 'Chevrolet', 'Dodge', 'Plymouth', 'McLaren', 'Bugatti', 'Pagani',
    'Koenigsegg', 'Aston Martin', 'Jaguar', 'Land Rover', 'Mini', 'Fiat', 'Alfa Romeo', 'Lancia', 'Volvo', 'Tesla', 'Jeep',
    'Lotus', 'Maserati', 'Bentley', 'Rolls-Royce', 'Hyundai', 'Kia', 'Tata', 'Mahindra', 'Maruti Suzuki', 'Suzuki', 'Lexus', 'Acura'];

  const S = {
    key: ls.get(KEY) || '', data: null, byId: {}, tab: 'add',
    edit: null, photo: null, curPhotos: [], web: [], webSel: new Set(), tags: new Set(),
    sale: { lines: [], enquiryId: '' },
    mode: 'one',
    bulk: { files: [], st: {}, tags: new Set(), running: false, uid: 0 },
  };
  const isDraft = it => !it.name || !(it.price > 0);

  const api = (action, payload) => G.post(action, Object.assign({ key: S.key }, payload || {}));

  /* ═══════════ boot / login ═══════════ */
  async function loadData(silent) {
    if (!silent) $('#reload').classList.add('spin');
    try {
      S.data = await api('adminData');
      S.data.items.forEach(it => { it.brand = G.normBrand(it.brand); it.tags = it.tags.map(G.normTag); });
      S.byId = Object.fromEntries(S.data.items.map(i => [i.id, i]));
      $('#aStore').textContent = (S.data.settings.storeName || "SB's Garage") + ' · Admin';
      fillLists();
      renderTab();
    } finally { $('#reload').classList.remove('spin'); }
  }

  async function login(key) {
    S.key = key.trim();
    $('#loginErr').hidden = true;
    $('#loginBtn').disabled = true;
    try {
      await loadData();
      ls.set(KEY, S.key);
      $('#login').hidden = true;
      $('#app').hidden = false;
    } catch (e) {
      $('#loginErr').textContent = e.code === 401 ? 'Wrong key.' : e.message;
      $('#loginErr').hidden = false;
      ls.del(KEY);
    } finally { $('#loginBtn').disabled = false; }
  }

  function handleErr(e) {
    if (e && e.code === 401) { ls.del(KEY); location.reload(); return; }
    toast(e.message || String(e), true);
  }

  /* ═══════════ tabs ═══════════ */
  function setTab(t) {
    S.tab = t;
    $$('#tabs [data-tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === t));
    $$('[data-panel]').forEach(p => { p.hidden = p.dataset.panel !== t; });
    renderTab();
    window.scrollTo(0, 0);
  }
  function renderTab() {
    if (!S.data) return;
    $('#enqDot').hidden = !S.data.enquiries.some(e => e.status === 'New');
    $('#stockDot').hidden = !S.data.items.some(isDraft);
    ({ add: renderForm, stock: renderStock, sales: renderSales, enq: renderEnq, stats: renderStats })[S.tab]();
  }

  function fillLists() {
    const d = S.data;
    const opts = arr => [...new Set(arr.filter(Boolean))].sort((a, b) => a.localeCompare(b)).map(v => `<option value="${esc(v)}">`).join('');
    $('#dlBrands').innerHTML = opts(d.lists.brands.concat(d.items.map(i => i.brand)));
    $('#dlMakes').innerHTML = opts(COMMON_MAKES.concat(d.items.map(i => i.make)));
    $('#dlSeries').innerHTML = opts(d.items.map(i => i.series));
    $('#dlItems').innerHTML = d.items.slice().sort((a, b) => b.qty - a.qty)
      .map(i => `<option value="${esc(i.id)} — ${esc(i.name)}">${i.qty > 0 ? i.qty + ' in stock' : 'sold out'} · ${money(i.price)}</option>`).join('');
    $('#dlBuyers').innerHTML = opts(d.sales.map(s => s.buyer));
    $('#dlTags').innerHTML = opts(d.sales.map(s => s.tag));
    $('#condSel').innerHTML = '<option value="">—</option>' + d.lists.conditions.map(c => `<option>${esc(c)}</option>`).join('');
    const bc = $('#bulkCond').value;
    $('#bulkCond').innerHTML = '<option value="">Let AI decide / blank</option>' + d.lists.conditions.map(c => `<option>${esc(c)}</option>`).join('');
    $('#bulkCond').value = bc;
    $('#chanSel').innerHTML = d.lists.channels.map(c => `<option>${esc(c)}</option>`).join('');
    $('#paySel').innerHTML = d.lists.payments.map(c => `<option>${esc(c)}</option>`).join('');
  }

  /* ═══════════ add / edit ═══════════ */
  const form = $('#itemForm');

  function renderForm() {
    const known = G.TAGS.map(t => t.key);
    const custom = [...new Set(S.data.items.flatMap(i => i.tags))].filter(t => !known.includes(t));
    const all = [...known.slice().reverse(), ...custom, ...[...S.tags].filter(t => !known.includes(t) && !custom.includes(t))];
    $('#tagPicker').innerHTML = all.map(t => {
      const d = G.tagDef(t);
      return `<button type="button" class="chip" data-tag="${esc(t)}" aria-pressed="${S.tags.has(t)}">${esc(d ? d.label : t)}</button>`;
    }).join('');
    $('#bulkTags').innerHTML = known.slice().reverse().concat(custom).map(t => {
      const d = G.tagDef(t);
      return `<button type="button" class="chip" data-btag="${esc(t)}" aria-pressed="${S.bulk.tags.has(t)}">${esc(d ? d.label : t)}</button>`;
    }).join('');
    $('#bulkAiRow').hidden = !S.data.hasAiKey;
    $('#bulkAiOff').hidden = !!S.data.hasAiKey;
    renderPhotos();
    renderWeb();
    renderBulk();
  }

  function renderPhotos() {
    const prev = $('#photoPreview');
    prev.hidden = !S.photo;
    if (S.photo) prev.src = S.photo;
    $('#dropEmpty').hidden = !!S.photo;
    $('#aiFill').hidden = !(S.photo && S.data && S.data.hasAiKey);
    if (S.edit && !S.photo) $('#dropEmpty').querySelector('b').textContent = 'Tap to add a new cover photo';
    else $('#dropEmpty').querySelector('b').textContent = 'Tap to add your photo';
    const box = $('#curPhotos');
    box.hidden = !S.edit || !S.curPhotos.length;
    box.innerHTML = S.curPhotos.map((p, i) => `<div class="ph${i === 0 && !S.photo ? ' cover' : ''}">
        ${G.imgTag(p, 300, '')}
        <button type="button" class="star" data-cover="${i}" title="Make cover">★</button>
        <button type="button" class="x" data-rmphoto="${i}" title="Remove">×</button>
      </div>`).join('');
  }

  function renderWeb() {
    $('#webGrid').innerHTML = S.web.map((p, i) =>
      `<button type="button" data-web="${i}" aria-pressed="${S.webSel.has(i)}" title="${esc(p.title || p.source || '')}"><img src="${esc(p.thumb || p.url)}" loading="lazy" alt="" referrerpolicy="no-referrer"></button>`).join('');
    $('#autoWeb').closest('.check').hidden = !!S.edit;
  }

  function resetForm(keepSticky) {
    const sticky = keepSticky ? { brand: form.brand.value, series: form.series.value, condition: form.condition.value, year: form.year.value } : {};
    form.reset();
    Object.keys(sticky).forEach(k => { form[k].value = sticky[k]; });
    S.edit = null; S.photo = null; S.curPhotos = []; S.web = []; S.webSel = new Set(); S.tags = new Set();
    $('#photoInput').value = '';
    $('#webNote').textContent = '';
    $('#formTitle').textContent = S.mode === 'bulk' ? 'Bulk upload' : 'Add a car';
    $('#saveBtn').textContent = 'Save car';
    $('#cancelEdit').hidden = true;
    renderForm();
  }

  function startEdit(id) {
    const it = S.byId[id];
    if (!it) return;
    setTab('add');
    resetForm(false);
    setMode('one');
    S.edit = id;
    ['name', 'brand', 'make', 'series', 'year', 'color', 'notes'].forEach(k => { form[k].value = it[k] || ''; });
    form.condition.value = it.condition || '';
    ['price', 'qty', 'compareAt', 'cost'].forEach(k => { form[k].value = it[k] == null ? '' : it[k]; });
    form.hidden.checked = !!it.hidden;
    S.tags = new Set(it.tags);
    S.curPhotos = it.photos.slice();
    $('#formTitle').textContent = 'Edit ' + it.id;
    $('#saveBtn').textContent = 'Save changes';
    $('#cancelEdit').hidden = false;
    renderForm();
  }

  async function compress(file, max, q) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', q);
    } finally { URL.revokeObjectURL(url); }
  }

  $('#photoInput').addEventListener('change', async e => {
    const f = e.target.files[0];
    if (!f) return;
    try { S.photo = await compress(f, 1600, 0.85); renderPhotos(); } catch (err) { toast('Could not read that image', true); }
  });

  $('#findPhotos').addEventListener('click', async () => {
    const q = { name: form.name.value, brand: form.brand.value, series: form.series.value, year: form.year.value, color: form.color.value };
    if (!q.name.trim()) { toast('Type the car name first', true); return; }
    const b = $('#findPhotos');
    b.disabled = true; b.textContent = 'Searching…';
    $('#webNote').textContent = '';
    try {
      const r = await api('findPhotos', { query: q });
      S.web = r.photos || []; S.webSel = new Set();
      $('#webNote').textContent = (r.notes || []).join(' ') || (S.web.length ? 'Tap to pick. Picked photos get copied to your Drive.' : 'Nothing found.');
      renderWeb();
    } catch (e) { handleErr(e); } finally { b.disabled = false; b.textContent = 'Find photos'; }
  });

  $('#webGrid').addEventListener('click', e => {
    const b = e.target.closest('[data-web]');
    if (!b) return;
    const i = Number(b.dataset.web);
    S.webSel.has(i) ? S.webSel.delete(i) : S.webSel.add(i);
    b.setAttribute('aria-pressed', S.webSel.has(i));
  });

  $('#curPhotos').addEventListener('click', e => {
    const c = e.target.closest('[data-cover]');
    const x = e.target.closest('[data-rmphoto]');
    if (c) { const i = Number(c.dataset.cover); S.curPhotos.unshift(S.curPhotos.splice(i, 1)[0]); }
    if (x) S.curPhotos.splice(Number(x.dataset.rmphoto), 1);
    renderPhotos();
  });

  $('#tagPicker').addEventListener('click', e => {
    const c = e.target.closest('[data-tag]');
    if (!c) return;
    const t = c.dataset.tag;
    S.tags.has(t) ? S.tags.delete(t) : S.tags.add(t);
    c.setAttribute('aria-pressed', S.tags.has(t));
  });
  const addCustomTag = () => {
    const v = G.normTag($('#tagCustom').value);
    if (!v) return;
    S.tags.add(v); $('#tagCustom').value = ''; renderForm();
  };
  $('#tagAddBtn').addEventListener('click', addCustomTag);
  $('#tagCustom').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addCustomTag(); } });
  $('#cancelEdit').addEventListener('click', () => { resetForm(false); setTab('stock'); });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const item = {};
    ['name', 'brand', 'make', 'series', 'year', 'color', 'condition', 'notes'].forEach(k => { item[k] = form[k].value.trim(); });
    ['price', 'qty', 'compareAt', 'cost'].forEach(k => { item[k] = form[k].value; });
    item.brand = G.normBrand(item.brand);
    item.hidden = form.hidden.checked;
    item.tags = [...S.tags];
    if (S.edit) item.id = S.edit;
    const payload = {
      item,
      photo: S.photo ? { data: S.photo } : null,
      webPhotos: [...S.webSel].sort((a, b) => a - b).map(i => S.web[i]),
      autoWeb: !S.edit && $('#autoWeb').checked,
    };
    if (S.edit) payload.photos = S.curPhotos;
    const btn = $('#saveBtn');
    btn.disabled = true;
    btn.textContent = payload.webPhotos.length || payload.autoWeb ? 'Saving + fetching photos…' : 'Saving…';
    try {
      const r = await api('saveItem', payload);
      const it = r.item;
      it.brand = G.normBrand(it.brand); it.tags = it.tags.map(G.normTag);
      const idx = S.data.items.findIndex(x => x.id === it.id);
      if (idx >= 0) S.data.items[idx] = it; else S.data.items.push(it);
      S.byId[it.id] = it;
      fillLists();
      const wasEdit = !!S.edit;
      toast((wasEdit ? 'Updated ' : 'Added ') + it.id + ' ✓' + (r.notes && r.notes.length ? ' · ' + r.notes.join(' · ') : ''));
      resetForm(!wasEdit);
      if (wasEdit) setTab('stock'); else form.name.focus();
    } catch (err) { handleErr(err); } finally { btn.disabled = false; btn.textContent = S.edit ? 'Save changes' : 'Save car'; }
  });

  /* ═══════════ AI fill (single car) ═══════════ */
  $('#aiFill').addEventListener('click', async () => {
    const b = $('#aiFill');
    b.disabled = true; b.textContent = '✨ Reading the card…';
    try {
      const { car } = await api('identify', { photos: [{ data: S.photo }] });
      if (car.is_diecast === false) { toast('That doesn\'t look like a diecast car', true); return; }
      const map = { name: car.name, brand: G.normBrand(car.brand), make: car.manufacturer, series: car.series, year: car.year, color: car.color };
      Object.keys(map).forEach(k => { if (map[k] && !form[k].value.trim()) form[k].value = map[k]; });
      if (car.condition && !form.condition.value) form.condition.value = car.condition;
      (car.tags || []).forEach(t => S.tags.add(G.normTag(t)));
      renderForm();
      toast(`Filled · ${car.confidence} confidence${car.seller_note ? ' · ' + car.seller_note : ''}`);
    } catch (e) { handleErr(e); } finally { b.disabled = false; b.textContent = '✨ Fill details from photo'; }
  });

  /* ═══════════ add mode: one car / bulk ═══════════ */
  function setMode(m) {
    S.mode = m;
    $$('#addMode [data-mode]').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === m));
    $('#itemForm').hidden = m !== 'one';
    $('#bulkBox').hidden = m !== 'bulk';
    $('#formTitle').textContent = m === 'bulk' ? 'Bulk upload' : (S.edit ? 'Edit ' + S.edit : 'Add a car');
  }
  $('#addMode').addEventListener('click', e => { const b = e.target.closest('[data-mode]'); if (b && !S.edit) setMode(b.dataset.mode); });

  /* ═══════════ bulk upload ═══════════ */
  const B = S.bulk;
  function bulkGroups() {
    const per = Number($('#bulkPer').value) || 1;
    const out = [];
    for (let i = 0; i < B.files.length; i += per) out.push(B.files.slice(i, i + per));
    return out;
  }
  const gst = g => B.st[g[0].uid] || { state: 'queued' };

  function renderBulk() {
    const gs = bulkGroups();
    const has = B.files.length > 0;
    $('#bulkOpts').hidden = !has;
    $('#bulkMore').hidden = !has || B.running;
    $('#bulkCount').textContent = has ? `${B.files.length} photo${B.files.length > 1 ? 's' : ''} selected` : '';
    $('#bulkBar').hidden = !has;
    $('#bulkPer').disabled = B.running || gs.some(g => gst(g).state === 'done');
    $('#bulkGrid').innerHTML = gs.map((g, i) => {
      const st = gst(g);
      const body = {
        queued: `<span class="muted">Ready</span><span class="muted small">${esc(g[0].file.name)}</span>`,
        busy: `<span><i class="spin-dot"></i>${esc(st.text)}</span>`,
        done: `<b>${esc(st.text)}</b><span class="muted small">${esc(st.sub)}</span>`,
        err: `<b style="color:var(--danger)">Failed</b><span class="muted small">${esc(st.sub)}</span>`,
      }[st.state];
      return `<div class="bcar ${st.state}">
        <div class="ph">${g.map(f => `<img src="${f.url}" alt="">`).join('')}</div>
        <span class="n">#${i + 1}</span>
        ${!B.running && st.state !== 'done' ? `<button type="button" class="rm" data-brm="${g[0].uid}" aria-label="Remove">×</button>` : ''}
        <div class="st">${body}</div>
      </div>`;
    }).join('');
    const done = gs.filter(g => gst(g).state === 'done').length;
    const failed = gs.filter(g => gst(g).state === 'err').length;
    const left = gs.length - done;
    $('#bulkSummary').textContent = B.running ? `Uploading… ${done} of ${gs.length} done`
      : done ? `${done} added${failed ? ` · ${failed} failed` : ''}${left - failed > 0 ? ` · ${left - failed} ready` : ''}`
        : `${gs.length} car${gs.length > 1 ? 's' : ''} · ${B.files.length} photo${B.files.length > 1 ? 's' : ''}`;
    const btn = $('#bulkStart');
    btn.disabled = B.running;
    btn.textContent = B.running ? 'Uploading…' : left === 0 ? 'Price them now →' : failed && left === failed ? 'Retry failed' : `Upload ${left} car${left > 1 ? 's' : ''}`;
    btn.dataset.next = !B.running && left === 0 ? 'price' : '';
    $('#bulkClear').hidden = B.running;
  }

  function setGroupState(uid, state, text, sub) { B.st[uid] = { state, text, sub }; renderBulk(); }

  const mergeItem = (it, oldId) => {
    if (oldId && oldId !== it.id) { S.data.items = S.data.items.filter(x => x.id !== oldId); delete S.byId[oldId]; }
    it.brand = G.normBrand(it.brand); it.tags = it.tags.map(G.normTag);
    const idx = S.data.items.findIndex(x => x.id === it.id);
    if (idx >= 0) S.data.items[idx] = it; else S.data.items.push(it);
    S.byId[it.id] = it;
    return it;
  };
  const subLine = (it, extra) => [it.id, it.brand, extra, it.price > 0 ? money(it.price) : 'needs price'].filter(Boolean).join(' · ');

  // Step 1: save photo + draft row (fast). Step 2: AI reads the card, with a time limit.
  // A slow or rate-limited AI never blocks the queue: the car is already saved.
  async function uploadGroup(g, opts) {
    const uid = g[0].uid;
    let it;
    try {
      setGroupState(uid, 'busy', 'Compressing…');
      const photos = [];
      for (const f of g) photos.push({ data: await compress(f.file, 1600, 0.85) });
      setGroupState(uid, 'busy', 'Saving…');
      const r = await G.timeout(api('bulkAdd', { photos, fileName: g[0].file.name, defaults: opts.defaults, ai: false, autoWeb: false }), 90000);
      it = mergeItem(r.item);
    } catch (e) {
      if (e.code === 401) { handleErr(e); throw e; }
      setGroupState(uid, 'err', '', e.message === 'timeout' ? 'Saving took too long — check the Stock tab before retrying' : e.message);
      return;
    }
    if (opts.ai) {
      setGroupState(uid, 'busy', 'Saved ✓ Reading card…');
      try {
        const r = await G.timeout(api('reidentify', { id: it.id }), 100000);
        it = mergeItem(r.item, r.oldId);
        const conf = (it.review.match(/(high|medium|low) confidence/) || [])[1];
        setGroupState(uid, 'done', it.name || 'Untitled — add a name', subLine(it, r.ok_ai ? 'AI ' + (conf || 'done') : 'AI: ' + (r.notes || [''])[0].slice(0, 40)));
        return;
      } catch (e) {
        if (e.code === 401) { handleErr(e); throw e; }
        setGroupState(uid, 'done', it.name || 'Saved — AI was slow', subLine(it, 'tap ✨ Identify in Drafts'));
        return;
      }
    }
    if (opts.autoWeb && it.name) {
      try { it = mergeItem((await G.timeout(api('addWebPhotos', { id: it.id, photos: (await api('findPhotos', { query: it })).photos.slice(0, 3) }), 60000)).item); } catch (e) { /* optional */ }
    }
    setGroupState(uid, 'done', it.name || 'Untitled — add a name', subLine(it));
  }

  async function runBulk() {
    const queue = bulkGroups().filter(g => gst(g).state !== 'done');
    if (!queue.length) return;
    const opts = {
      defaults: {
        brand: G.normBrand($('#bulkBrand').value.trim()), series: $('#bulkSeries').value.trim(), condition: $('#bulkCond').value,
        tags: [...B.tags], qty: $('#bulkQty').value, price: $('#bulkPrice').value,
      },
      ai: !!S.data.hasAiKey && $('#bulkAi').checked,
      autoWeb: $('#bulkWeb').checked,
    };
    B.running = true;
    renderBulk();
    let i = 0;
    const worker = async () => { while (i < queue.length) await uploadGroup(queue[i++], opts); };
    // saving is quick, so run 3 at once; Gemini's free tier is a few requests a minute, so 2 when AI is on
    const lanes = opts.ai && S.data.aiProvider === 'gemini' ? 2 : 3;
    try { await Promise.all(Array.from({ length: lanes }, worker)); } catch (e) { /* 401 handled */ }
    B.running = false;
    renderBulk();
    fillLists();
    renderTab();
    const failed = bulkGroups().filter(g => gst(g).state === 'err').length;
    toast(failed ? `${failed} failed — tap Retry` : 'All uploaded ✓ Drafts are highlighted yellow in your sheet');
  }

  function addBulkFiles(list) {
    const seen = new Set(B.files.map(f => f.file.name + '|' + f.file.size));
    const imgs = [...list].filter(f => /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })); // keeps front/back pairs together
    let added = 0;
    imgs.forEach(file => {
      const k = file.name + '|' + file.size;
      if (seen.has(k)) return; // same photo picked twice
      seen.add(k);
      B.files.push({ uid: ++B.uid, file, url: URL.createObjectURL(file) });
      added++;
    });
    if (added) toast(`Added ${added} photo${added > 1 ? 's' : ''} · ${B.files.length} total`);
    renderBulk();
  }
  $('#bulkInput').addEventListener('change', e => { addBulkFiles(e.target.files); e.target.value = ''; });
  $('#bulkFolder').addEventListener('change', e => { addBulkFiles(e.target.files); e.target.value = ''; });
  $('#bulkMore').addEventListener('click', () => $('#bulkInput').click());
  const drop = $('#bulkDrop');
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => addBulkFiles(e.dataTransfer.files));
  $('#bulkPer').addEventListener('change', renderBulk);
  $('#bulkGrid').addEventListener('click', e => {
    const r = e.target.closest('[data-brm]');
    if (!r || B.running) return;
    const g = bulkGroups().find(x => String(x[0].uid) === r.dataset.brm);
    g.forEach(f => URL.revokeObjectURL(f.url));
    B.files = B.files.filter(f => !g.includes(f));
    renderBulk();
  });
  $('#bulkTags').addEventListener('click', e => {
    const c = e.target.closest('[data-btag]');
    if (!c) return;
    B.tags.has(c.dataset.btag) ? B.tags.delete(c.dataset.btag) : B.tags.add(c.dataset.btag);
    c.setAttribute('aria-pressed', B.tags.has(c.dataset.btag));
  });
  $('#bulkClear').addEventListener('click', () => {
    if (B.running) return;
    B.files.forEach(f => URL.revokeObjectURL(f.url));
    B.files = []; B.st = {};
    renderBulk();
  });
  $('#bulkStart').addEventListener('click', () => {
    if ($('#bulkStart').dataset.next === 'price') {
      $('#bulkClear').click();
      $('#stockF').value = 'drafts';
      setTab('stock');
      return;
    }
    runBulk();
  });

  /* ═══════════ stock ═══════════ */
  function badgeHtml(tags) {
    return tags.map(t => { const d = G.tagDef(t); return `<span class="badge ${d ? d.cls : ''}">${esc(d ? d.short : t)}</span>`; }).join('');
  }
  function renderStock() {
    const q = $('#stockQ').value.trim().toLowerCase();
    const f = $('#stockF').value;
    const items = S.data.items.filter(it => {
      if (f === 'in' && it.qty <= 0) return false;
      if (f === 'out' && it.qty > 0) return false;
      if (f === 'hidden' && !it.hidden) return false;
      if (f === 'nophoto' && it.photos.length) return false;
      if (f === 'drafts' && !isDraft(it)) return false;
      if (!q) return true;
      return [it.id, it.name, it.brand, it.make, it.series, it.color, ...it.tags].join(' ').toLowerCase().includes(q);
    }).sort(f === 'drafts' ? (a, b) => a.n - b.n : (a, b) => (b.added || 0) - (a.added || 0) || b.n - a.n);
    renderDraftBar();
    const live = S.data.items.filter(i => i.qty > 0 && !i.hidden && !isDraft(i));
    const drafts = S.data.items.filter(isDraft).length;
    $('#stockSummary').innerHTML = `${live.length} listings · ${live.reduce((s, i) => s + i.qty, 0)} cars · ${money(live.reduce((s, i) => s + i.qty * (i.price || 0), 0))}` +
      (drafts && f !== 'drafts' ? ` · <button class="link" data-showdrafts>${drafts} draft${drafts > 1 ? 's' : ''} need a price →</button>` : '');
    $('#stockList').innerHTML = items.length ? items.map(it => isDraft(it) ? draftRow(it) : `
      <div class="srow${it.hidden ? ' is-hidden' : ''}">
        ${G.imgTag(it.photos[0], 160, '', 'loading="lazy"')}
        <div>
          <div class="t">${esc(it.name)}</div>
          <div class="s">${esc([it.id, it.brand, it.make, it.series].filter(Boolean).join(' · '))}${it.hidden ? ' · <span class="pill">hidden</span>' : ''}${!it.photos.length ? ' · <span class="pill warn">no photo</span>' : ''}</div>
          ${it.tags.length ? `<div class="tg">${badgeHtml(it.tags)}</div>` : ''}
        </div>
        <div class="r">
          <div class="pq">${money(it.price)} <span class="q${it.qty <= 0 ? ' zero' : ''}">× ${it.qty}</span></div>
          <div class="btns">
            <button class="btn small" data-edit="${esc(it.id)}">Edit</button>
            <button class="btn small primary" data-sell="${esc(it.id)}" ${it.qty <= 0 ? 'disabled' : ''}>Sell</button>
          </div>
        </div>
      </div>`).join('') : (f === 'drafts' ? '<div class="empty-state">No drafts — everything is priced and live. 🏁</div>'
      : '<div class="empty-state">No cars here yet. Add one from the <b>Add</b> tab — or type rows straight into the Inventory sheet.</div>');
  }

  // ── fast draft editor: type everything, save once ──
  S.dirty = {};
  const DFIELDS = ['name', 'brand', 'make', 'price', 'qty'];
  function draftRow(it) {
    const d = S.dirty[it.id] || {};
    const v = f => esc(d[f] !== undefined ? d[f] : (f === 'price' ? (it.price > 0 ? it.price : '') : it[f] == null ? '' : it[f]));
    return `<div class="srow draft${S.dirty[it.id] ? ' dirty' : ''}" data-did="${esc(it.id)}">
      ${G.imgTag(it.photos[0], 300, '', 'loading="lazy" data-zoom')}
      <div>
        <div class="dgrid">
          <input class="input" data-f="name" value="${v('name')}" placeholder="Car name" aria-label="Car name">
          <input class="input" data-f="brand" value="${v('brand')}" list="dlBrands" placeholder="Brand" aria-label="Brand">
          <input class="input" data-f="make" value="${v('make')}" list="dlMakes" placeholder="Car maker" aria-label="Car maker">
          <input class="input" data-f="price" value="${v('price')}" type="number" inputmode="numeric" min="0" placeholder="₹ price" aria-label="Price">
          <input class="input" data-f="qty" value="${v('qty')}" type="number" inputmode="numeric" min="0" aria-label="Qty">
        </div>
        <div class="dmeta">
          <span>${esc([it.id, it.series, it.year, it.color].filter(Boolean).join(' · '))}</span>
          ${it.tags.length ? `<span class="tg">${badgeHtml(it.tags)}</span>` : ''}
          ${it.review ? `<span class="review">${esc(it.review)}</span>` : ''}
          <span class="links">${S.data.hasAiKey && it.photos.length ? `<button class="link" data-reid="${esc(it.id)}">✨ Identify</button>` : ''}<button class="link" data-edit="${esc(it.id)}">Full edit</button></span>
        </div>
      </div>
    </div>`;
  }
  function renderDraftBar() {
    const n = Object.keys(S.dirty).length;
    $('#draftBar').hidden = !n;
    $('#draftBarText').textContent = `${n} car${n > 1 ? 's' : ''} changed`;
    $('#draftSaveAll').textContent = `Save all (${n})`;
  }
  async function saveMany(items, btn) {
    const label = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    try {
      const r = await api('saveMany', { items });
      let live = 0;
      r.results.forEach(x => { const it = mergeItem(x.item, x.oldId); delete S.dirty[x.oldId || it.id]; if (!isDraft(it)) live++; });
      toast(`Saved ${r.results.length} car${r.results.length > 1 ? 's' : ''}${live ? ` · ${live} now live` : ''}${r.errors.length ? ` · ${r.errors.length} not found` : ''}`, !!r.errors.length);
      fillLists();
      renderTab();
      return r;
    } catch (e) { handleErr(e); } finally { if (btn) { btn.disabled = false; btn.textContent = label; } }
  }
  $('#draftSaveAll').addEventListener('click', () => {
    const items = Object.entries(S.dirty).map(([id, d]) => {
      const it = Object.assign({ id }, d);
      if (it.brand !== undefined) it.brand = G.normBrand(it.brand);
      const name = d.name !== undefined ? d.name : (S.byId[id] || {}).name;
      const price = d.price !== undefined ? d.price : (S.byId[id] || {}).price;
      if (name && Number(price) > 0) it.review = ''; // you've checked it — clear the AI note
      return it;
    });
    saveMany(items, $('#draftSaveAll'));
  });
  $('#draftDiscard').addEventListener('click', () => { S.dirty = {}; renderDraftBar(); renderStock(); });
  window.addEventListener('beforeunload', e => { if (Object.keys(S.dirty).length) { e.preventDefault(); e.returnValue = ''; } });

  // ── paste details (from Claude, a spreadsheet, anywhere) ──
  const PCOLS = ['id', 'name', 'brand', 'make', 'series', 'year', 'color', 'condition', 'tags', 'price', 'qty'];
  function parsePaste(text) {
    const t = text.trim();
    if (!t) return [];
    if (t[0] === '[') { try { return JSON.parse(t).filter(x => x && x.id); } catch (e) { /* fall through */ } }
    return t.split(/\r?\n/).map(line => {
      const cells = (line.includes('\t') ? line.split('\t') : line.split('|')).map(c => c.trim());
      if (!cells[0] || /^id$/i.test(cells[0]) || /^-+$/.test(cells[0])) return null;
      const it = {};
      PCOLS.forEach((k, i) => { if (cells[i]) it[k] = cells[i]; });
      if (it.brand) it.brand = G.normBrand(it.brand);
      if (it.tags) it.tags = it.tags.split(/\s*[,;]\s*/).map(G.normTag);
      if (it.price) it.price = it.price.replace(/[^0-9.]/g, '');
      if (it.name && Number(it.price) > 0) it.review = '';
      return it.id ? it : null;
    }).filter(Boolean);
  }
  const pasteDlg = $('#pasteDlg');
  $('#pasteBtn').addEventListener('click', () => { $('#pastePreview').textContent = ''; pasteDlg.showModal(); $('#pasteText').focus(); });
  pasteDlg.addEventListener('click', e => { if (e.target === pasteDlg || e.target.closest('[data-close]')) pasteDlg.close(); });
  $('#pasteText').addEventListener('input', () => {
    const items = parsePaste($('#pasteText').value);
    const unknown = items.filter(it => !S.byId[it.id] && !S.data.items.some(x => x.id.toLowerCase() === String(it.id).toLowerCase()));
    $('#pastePreview').textContent = items.length ? `${items.length} car${items.length > 1 ? 's' : ''} found${unknown.length ? ` · not in stock: ${unknown.map(x => x.id).join(', ')}` : ''}` : '';
  });
  $('#pasteForm').addEventListener('submit', async e => {
    e.preventDefault();
    const items = parsePaste($('#pasteText').value);
    if (!items.length) { toast('Nothing to update — check the format', true); return; }
    const r = await saveMany(items, $('#pasteApply'));
    if (r) { $('#pasteText').value = ''; pasteDlg.close(); }
  });

  // ── photo zoom (read the card while you type) ──
  const zoomDlg = $('#zoomDlg');
  zoomDlg.addEventListener('click', () => zoomDlg.close());

  $('#stockQ').addEventListener('input', renderStock);
  $('#stockF').addEventListener('change', renderStock);
  $('#stockSummary').addEventListener('click', e => {
    if (e.target.closest('[data-showdrafts]')) { $('#stockF').value = 'drafts'; renderStock(); }
  });
  $('#stockList').addEventListener('input', e => {
    const f = e.target.dataset.f;
    const row = e.target.closest('.srow.draft');
    if (!f || !row) return;
    const id = row.dataset.did;
    (S.dirty[id] = S.dirty[id] || {})[f] = e.target.value;
    row.classList.add('dirty');
    renderDraftBar();
  });
  $('#stockList').addEventListener('keydown', e => {
    // Enter jumps to the same field on the next car — fast column-by-column entry
    if (e.key !== 'Enter' || !e.target.dataset.f) return;
    e.preventDefault();
    const rows = [...document.querySelectorAll('#stockList .srow.draft')];
    const i = rows.indexOf(e.target.closest('.srow.draft'));
    const next = rows[i + 1] && rows[i + 1].querySelector(`[data-f="${e.target.dataset.f}"]`);
    if (next) next.focus(); else $('#draftSaveAll').focus();
  });
  $('#stockList').addEventListener('click', e => {
    const z = e.target.closest('[data-zoom]');
    if (z) { $('#zoomImg').src = G.img(z.dataset.ref, 1400) || z.src; zoomDlg.showModal(); return; }
    const ri = e.target.closest('[data-reid]');
    if (ri) {
      ri.textContent = '✨ Reading…'; ri.disabled = true;
      api('reidentify', { id: ri.dataset.reid }).then(r => {
        const it = mergeItem(r.item, r.oldId);
        toast(r.ok_ai ? 'Filled ' + (it.name || it.id) : (r.notes || ['AI could not read it'])[0], !r.ok_ai);
        renderTab();
      }).catch(handleErr);
      return;
    }
    const ed = e.target.closest('[data-edit]');
    if (ed) return startEdit(ed.dataset.edit);
    const sl = e.target.closest('[data-sell]');
    if (sl) { const it = S.byId[sl.dataset.sell]; openSale({ lines: [{ id: it.id, qty: 1, price: it.price }] }); }
  });

  /* ═══════════ record sale ═══════════ */
  const dlg = $('#saleDlg');
  const sf = $('#saleForm');
  const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };

  function openSale(pre) {
    pre = pre || {};
    sf.reset();
    const last = ls.get('g64_last_sale') || {};
    S.sale = { lines: (pre.lines || []).map(l => Object.assign({}, l)), enquiryId: pre.enquiryId || '' };
    sf.buyer.value = pre.buyer || '';
    sf.contact.value = pre.contact || '';
    sf.city.value = pre.city || '';
    sf.date.value = today();
    sf.channel.value = pre.channel || last.channel || S.data.lists.channels[0];
    sf.payment.value = last.payment || 'UPI';
    sf.tag.value = pre.tag != null ? pre.tag : (last.tag || '');
    $('#saleTitle').textContent = pre.enquiryId ? 'Convert ' + pre.enquiryId : 'Record a sale';
    renderSaleLines();
    dlg.showModal();
  }

  function renderSaleLines() {
    $('#saleLines').innerHTML = S.sale.lines.map((l, i) => {
      const it = S.byId[l.id] || { name: l.id, photos: [], qty: 0 };
      return `<div class="sline">
        ${G.imgTag(it.photos[0], 120, '')}
        <div><div class="t">${esc(it.name)}</div><div class="s">${esc(l.id)} · ${it.qty} in stock</div></div>
        <input class="input" type="number" min="1" inputmode="numeric" value="${l.qty}" data-lq="${i}" aria-label="Qty">
        <input class="input" type="number" min="0" inputmode="numeric" value="${l.price}" data-lp="${i}" aria-label="Unit price ₹">
        <button type="button" class="rm" data-lrm="${i}" aria-label="Remove">×</button>
      </div>`;
    }).join('') || '<p class="muted small" style="margin:0">Add the cars sold below.</p>';
    $('#saleTotal').textContent = money(S.sale.lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.price) || 0), 0));
  }

  $('#saleLines').addEventListener('input', e => {
    const q = e.target.dataset.lq, p = e.target.dataset.lp;
    if (q != null) S.sale.lines[q].qty = Number(e.target.value);
    if (p != null) S.sale.lines[p].price = Number(e.target.value);
    $('#saleTotal').textContent = money(S.sale.lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.price) || 0), 0));
  });
  $('#saleLines').addEventListener('click', e => {
    const r = e.target.closest('[data-lrm]');
    if (r) { S.sale.lines.splice(Number(r.dataset.lrm), 1); renderSaleLines(); }
  });
  $('#linePick').addEventListener('change', e => {
    const id = e.target.value.split(' — ')[0].trim();
    const it = S.byId[id] || S.data.items.find(i => i.id.toLowerCase() === id.toLowerCase());
    e.target.value = '';
    if (!it) { toast('Pick a car from the list', true); return; }
    const ex = S.sale.lines.find(l => l.id === it.id);
    if (ex) ex.qty += 1; else S.sale.lines.push({ id: it.id, qty: 1, price: it.price || 0 });
    renderSaleLines();
  });
  sf.buyer.addEventListener('change', () => {
    const prev = S.data.sales.filter(s => s.buyer && s.buyer.toLowerCase() === sf.buyer.value.trim().toLowerCase()).sort((a, b) => b.date - a.date)[0];
    if (prev) {
      if (!sf.contact.value) sf.contact.value = prev.contact || '';
      if (!sf.city.value) sf.city.value = prev.city || '';
      const orders = new Set(S.data.sales.filter(s => s.buyer === prev.buyer).map(s => s.orderId)).size;
      toast(`Repeat buyer · ${orders} earlier order${orders > 1 ? 's' : ''}`);
    }
  });
  dlg.addEventListener('click', e => { if (e.target === dlg || e.target.closest('[data-close]')) dlg.close(); });

  sf.addEventListener('submit', async e => {
    e.preventDefault();
    if (!S.sale.lines.length) { toast('Add at least one car', true); return; }
    const sale = {
      lines: S.sale.lines, enquiryId: S.sale.enquiryId,
      buyer: sf.buyer.value.trim(), contact: sf.contact.value.trim(), city: sf.city.value.trim(),
      date: sf.date.value ? sf.date.value + 'T12:00:00' : '', channel: sf.channel.value, payment: sf.payment.value,
      tag: sf.tag.value.trim(), notes: sf.notes.value.trim(),
    };
    ls.set('g64_last_sale', { channel: sale.channel, payment: sale.payment, tag: sale.tag });
    const b = $('#saleSave');
    b.disabled = true; b.textContent = 'Saving…';
    try {
      const r = await api('recordSale', { sale });
      dlg.close();
      toast(`${r.orderId} saved · ${money(sale.lines.reduce((s, l) => s + l.qty * l.price, 0))}` + (r.warnings.length ? ' · ' + r.warnings.join('; ') : ''));
      await loadData(true);
    } catch (err) { handleErr(err); } finally { b.disabled = false; b.textContent = 'Save sale & reduce stock'; }
  });
  $('#newSale').addEventListener('click', () => openSale());

  /* ═══════════ sales list ═══════════ */
  const monthKey = ts => { const d = new Date(ts); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
  const monthLabel = k => { const [y, m] = k.split('-'); return new Date(+y, +m - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }); };
  const dateLabel = ts => new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  function groupOrders(sales) {
    const m = new Map();
    sales.forEach(s => {
      if (!m.has(s.orderId)) m.set(s.orderId, { id: s.orderId, date: s.date, buyer: s.buyer, contact: s.contact, city: s.city, channel: s.channel, payment: s.payment, tag: s.tag, lines: [], total: 0, profit: 0, costed: true });
      const o = m.get(s.orderId);
      o.lines.push(s); o.total += s.total;
      if (s.profit == null) o.costed = false; else o.profit += s.profit;
    });
    return [...m.values()].sort((a, b) => b.date - a.date);
  }

  function renderSales() {
    const sales = S.data.sales;
    const sel = (id, label, vals, fmt) => {
      const el = $(id), cur = el.value;
      el.innerHTML = `<option value="">${label}</option>` + vals.map(v => `<option value="${esc(v)}">${esc(fmt ? fmt(v) : v)}</option>`).join('');
      el.value = vals.includes(cur) ? cur : '';
    };
    sel('#salesMonth', 'All months', [...new Set(sales.map(s => monthKey(s.date)))].sort().reverse(), monthLabel);
    sel('#salesTag', 'All revenue tags', [...new Set(sales.map(s => s.tag).filter(Boolean))].sort());
    sel('#salesChannel', 'All channels', [...new Set(sales.map(s => s.channel).filter(Boolean))].sort());
    const m = $('#salesMonth').value, t = $('#salesTag').value, c = $('#salesChannel').value;
    const f = sales.filter(s => (!m || monthKey(s.date) === m) && (!t || s.tag === t) && (!c || s.channel === c));
    const orders = groupOrders(f);
    const rev = f.reduce((s, x) => s + x.total, 0);
    const prof = f.reduce((s, x) => s + (x.profit || 0), 0);
    $('#salesKpis').innerHTML = [['Revenue', money(rev)], ['Profit', money(prof)], ['Orders', orders.length], ['Cars', f.reduce((s, x) => s + x.qty, 0)]]
      .map(([l, v]) => `<div class="kpi"><div class="l">${l}</div><div class="v">${v}</div></div>`).join('');
    $('#ordersList').innerHTML = orders.length ? orders.map(o => `
      <div class="order">
        <div class="order-top"><span class="who">${esc(o.buyer || 'Unnamed buyer')}${o.city ? ` <span class="muted">· ${esc(o.city)}</span>` : ''}</span><span class="amt">${money(o.total)}</span></div>
        <div class="meta">${dateLabel(o.date)} · ${esc(o.id)}${o.channel ? ` <span class="pill">${esc(o.channel)}</span>` : ''}${o.tag ? ` <span class="pill good">${esc(o.tag)}</span>` : ''}${o.payment ? ` <span class="pill">${esc(o.payment)}</span>` : ''}${o.costed ? ` · profit ${money(o.profit)}` : ''}</div>
        <ul>${o.lines.map(l => `<li><span>${esc(l.itemName)} <span class="muted">${esc(l.itemId)}</span></span><span>${l.qty} × ${money(l.unitPrice)}</span></li>`).join('')}</ul>
        <div class="acts">${o.contact ? `<span class="muted small" style="margin-right:auto">${esc(o.contact)}</span>` : ''}<button class="btn small ghost" data-void="${esc(o.id)}">Undo sale</button></div>
      </div>`).join('') : '<div class="empty-state">No sales yet. Hit <b>+ Record sale</b> or convert an enquiry.</div>';
  }
  ['#salesMonth', '#salesTag', '#salesChannel'].forEach(id => $(id).addEventListener('change', renderSales));
  $('#ordersList').addEventListener('click', async e => {
    const v = e.target.closest('[data-void]');
    if (!v) return;
    if (!confirm(`Undo ${v.dataset.void}? The sale rows are deleted and stock goes back on the shelf.`)) return;
    try { await api('voidOrder', { orderId: v.dataset.void, restock: true }); toast('Undone · stock restored'); await loadData(true); } catch (err) { handleErr(err); }
  });

  /* ═══════════ enquiries ═══════════ */
  function parseIds(s) {
    return String(s || '').split(/\s*,\s*/).filter(Boolean).map(x => {
      const m = x.match(/^(.+?)(?:×(\d+))?$/);
      return { id: m[1].trim(), qty: Number(m[2] || 1) };
    });
  }
  function renderEnq() {
    const f = $('#enqF').value;
    const list = S.data.enquiries.filter(e => f === 'all' || e.status === f).sort((a, b) => b.date - a.date);
    $('#enqList').innerHTML = list.length ? list.map(e => {
      const lines = parseIds(e.itemIds);
      const gone = lines.filter(l => !S.byId[l.id] || S.byId[l.id].qty < l.qty).map(l => l.id);
      const pill = e.status === 'New' ? 'warn' : e.status === 'Converted' ? 'good' : 'bad';
      return `<div class="order enq">
        <div class="order-top"><span class="who">${esc(e.name || 'No name')}${e.city ? ` <span class="muted">· ${esc(e.city)}</span>` : ''}</span><span class="amt">${money(e.total)}</span></div>
        <div class="meta">${esc(e.id)} · ${new Date(e.date).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} <span class="pill ${pill}">${esc(e.status)}</span>${gone.length ? ` <span class="pill bad">stock gone: ${esc(gone.join(', '))}</span>` : ''}</div>
        ${e.contact ? `<div class="meta">📞 <b>${esc(e.contact)}</b>${e.buyerNote ? ` · “${esc(e.buyerNote)}”` : ''}</div>` : ''}
        <div class="items">${esc(e.items)}</div>
        <div class="acts">
          ${e.status === 'New' ? `<button class="btn small ghost" data-lost="${esc(e.id)}">Mark lost</button><button class="btn small primary" data-convert="${esc(e.id)}">Convert to sale</button>`
            : `<button class="btn small ghost" data-reopen="${esc(e.id)}">Reopen</button>`}
        </div>
      </div>`;
    }).join('') : `<div class="empty-state">No ${f === 'all' ? '' : f.toLowerCase() + ' '}enquiries.</div>`;
  }
  $('#enqF').addEventListener('change', renderEnq);
  $('#enqList').addEventListener('click', async e => {
    const cv = e.target.closest('[data-convert]');
    if (cv) {
      const q = S.data.enquiries.find(x => x.id === cv.dataset.convert);
      const lines = parseIds(q.itemIds).filter(l => S.byId[l.id]).map(l => ({ id: l.id, qty: l.qty, price: S.byId[l.id].price || 0 }));
      return openSale({ lines, buyer: q.name, contact: q.contact, city: q.city, channel: 'Website', enquiryId: q.id });
    }
    const b = e.target.closest('[data-lost],[data-reopen]');
    if (!b) return;
    const id = b.dataset.lost || b.dataset.reopen;
    const status = b.dataset.lost ? 'Lost' : 'New';
    try {
      await api('setEnquiry', { id, status });
      S.data.enquiries.find(x => x.id === id).status = status;
      renderTab();
    } catch (err) { handleErr(err); }
  });

  /* ═══════════ stats ═══════════ */
  function inRange(ts, r) {
    const d = new Date(ts), n = new Date();
    if (r === 'all') return true;
    if (r === 'month') return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth();
    if (r === 'year') return d.getFullYear() === n.getFullYear();
    return ts >= Date.now() - Number(r) * 864e5;
  }
  function breakdown(title, rows, cols) {
    if (!rows.length) return `<div class="bd"><h3>${title}</h3><p class="none">No sales in this range.</p></div>`;
    const max = Math.max(...rows.map(r => r.rev)) || 1;
    return `<div class="bd"><h3>${title}</h3><table>
      <thead><tr><th>${cols[0]}</th><th>Revenue</th><th>${cols[1]}</th><th>${cols[2]}</th></tr></thead>
      <tbody>${rows.map(r => `<tr title="${esc(r.k)}: ${money(r.rev)}">
        <td>${esc(r.label || r.k)}<div class="bar" style="width:${Math.max(2, (r.rev / max) * 100).toFixed(1)}%"></div></td>
        <td>${money(r.rev)}</td><td>${r.c2}</td><td>${r.c3}</td></tr>`).join('')}</tbody></table></div>`;
  }
  function group(sales, keyFn) {
    const m = new Map();
    sales.forEach(s => {
      [].concat(keyFn(s)).forEach(k => {
        k = k || '(none)';
        if (!m.has(k)) m.set(k, { k, rev: 0, cars: 0, profit: 0, orders: new Set() });
        const g = m.get(k);
        g.rev += s.total; g.cars += s.qty; g.profit += s.profit || 0; g.orders.add(s.orderId);
      });
    });
    return [...m.values()];
  }

  function renderStats() {
    const r = $('#statsRange').value;
    const d = S.data;
    const sales = d.sales.filter(s => inRange(s.date, r));
    const enqs = d.enquiries.filter(e => inRange(e.date, r));
    const orders = groupOrders(sales);
    const rev = sales.reduce((s, x) => s + x.total, 0);
    const costed = sales.filter(s => s.profit != null);
    const prof = costed.reduce((s, x) => s + x.profit, 0);
    const costedRev = costed.reduce((s, x) => s + x.total, 0);
    const buyers = group(sales.filter(s => s.buyer), s => s.buyer.toLowerCase());
    const repeat = buyers.filter(b => b.orders.size > 1).length;
    const conv = enqs.length ? Math.round(enqs.filter(e => e.status === 'Converted').length / enqs.length * 100) : null;
    const stock = d.items.filter(i => i.qty > 0 && !isDraft(i));
    const units = stock.reduce((s, i) => s + i.qty, 0);
    const listVal = stock.reduce((s, i) => s + i.qty * (i.price || 0), 0);
    const costVal = stock.reduce((s, i) => s + i.qty * (i.cost || 0), 0);
    const tiles = [
      ['Revenue', money(rev), `${orders.length} orders`],
      ['Profit', costed.length ? money(prof) : '—', costed.length ? `${Math.round(prof / (costedRev || 1) * 100)}% margin on costed cars` : 'Add “Your cost” to cars to see profit'],
      ['Cars sold', sales.reduce((s, x) => s + x.qty, 0), `${buyers.length} buyers`],
      ['Avg order', money(orders.length ? rev / orders.length : 0), 'per order'],
      ['Repeat buyers', buyers.length ? Math.round(repeat / buyers.length * 100) + '%' : '—', `${repeat} of ${buyers.length} came back`],
      ['Enquiry → sale', conv == null ? '—' : conv + '%', `${enqs.length} website enquiries`],
      ['In stock', units, `${stock.length} listings`],
      ['Stock value', money(listVal), costVal ? `cost ${money(costVal)} · upside ${money(listVal - costVal)}` : 'at list price'],
    ];
    $('#kpis').innerHTML = tiles.map(([l, v, s]) => `<div class="kpi"><div class="l">${l}</div><div class="v">${v}</div><div class="d">${s}</div></div>`).join('');

    const byRev = a => a.sort((x, y) => y.rev - x.rev);
    const tagRows = byRev(group(sales, s => s.tag || '(untagged)')).map(g => ({ k: g.k, rev: g.rev, c2: g.cars, c3: money(g.profit) }));
    const chanRows = byRev(group(sales, s => s.channel)).map(g => ({ k: g.k, rev: g.rev, c2: g.orders.size, c3: money(g.profit) }));
    const brandRows = byRev(group(sales, s => G.normBrand(s.brand))).map(g => ({ k: g.k, rev: g.rev, c2: g.cars, c3: money(g.profit) }));
    const typeRows = byRev(group(sales, s => { const it = S.byId[s.itemId]; const t = it && it.tags.length ? it.tags.slice().sort((a, b) => ((G.tagDef(b) || {}).rank || 0) - ((G.tagDef(a) || {}).rank || 0))[0] : 'Untagged'; return t; }))
      .map(g => ({ k: g.k, label: (G.tagDef(g.k) || {}).label || g.k, rev: g.rev, c2: g.cars, c3: money(g.profit) }));
    const monthRows = group(sales, s => monthKey(s.date)).sort((a, b) => b.k.localeCompare(a.k)).map(g => ({ k: g.k, label: monthLabel(g.k), rev: g.rev, c2: g.orders.size, c3: money(g.profit) }));
    const buyerRows = byRev(buyers).slice(0, 15).map(g => {
      const name = sales.find(s => s.buyer.toLowerCase() === g.k).buyer;
      return { k: name, rev: g.rev, c2: g.orders.size, c3: g.cars };
    });
    $('#breakdowns').innerHTML =
      breakdown('By revenue tag', tagRows, ['Tag', 'Cars', 'Profit']) +
      breakdown('By channel', chanRows, ['Channel', 'Orders', 'Profit']) +
      breakdown('By car type', typeRows, ['Type', 'Cars', 'Profit']) +
      breakdown('By brand', brandRows, ['Brand', 'Cars', 'Profit']) +
      breakdown('By month', monthRows, ['Month', 'Orders', 'Profit']) +
      breakdown('Top buyers', buyerRows, ['Buyer', 'Orders', 'Cars']);
  }
  $('#statsRange').addEventListener('change', renderStats);

  /* ═══════════ misc ═══════════ */
  let toastT;
  function toast(msg, err) {
    const t = $('#toast');
    t.textContent = msg; t.classList.toggle('err', !!err); t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), err ? 4500 : 2800);
  }

  $('#tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) setTab(b.dataset.tab); });
  $('#reload').addEventListener('click', () => loadData().then(() => toast('Synced with sheet')).catch(handleErr));
  $('#loginForm').addEventListener('submit', e => { e.preventDefault(); login($('#keyInput').value); });

  if (G.DEMO) {
    $('#loginErr').textContent = 'Demo mode: add your Apps Script URL to config.js first.';
    $('#loginErr').hidden = false;
    $('#loginBtn').disabled = true;
  } else if (S.key) {
    login(S.key);
  }
})();
