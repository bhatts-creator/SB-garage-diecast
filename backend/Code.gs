/**
 * ─────────────────────────────────────────────────────────────────────────
 *  SB'S GARAGE · diecast store backend  (Google Apps Script)
 * ─────────────────────────────────────────────────────────────────────────
 *  Your Google Sheet IS the database:
 *    Inventory  – one row per car. Edit tags / price / qty right here.
 *    Sales      – every sale: buyer, price, channel, revenue tag, profit.
 *    Enquiries  – carts sent from the website (WhatsApp orders).
 *    Settings   – store name, WhatsApp number, announcement bar…
 *    Dashboard  – auto-calculated revenue breakdowns.
 *
 *  Setup (full steps in README.md):
 *    1. Sheet → Extensions → Apps Script → paste this file → Save.
 *    2. Run `setup` once (authorise when asked). Copy the admin key it shows.
 *    3. Deploy → New deployment → Web app → Execute as: Me, Access: Anyone.
 *    4. Paste the /exec URL into site/config.js.
 *
 *  Optional — Project Settings → Script properties:
 *    GEMINI_API_KEY      FREE AI photo reading (Google AI Studio key, no billing needed)
 *    GEMINI_MODEL        override the Gemini model (default gemini-flash-latest)
 *    ANTHROPIC_API_KEY   paid alternative: Claude reads the photos (needs API credits)
 *    CLAUDE_MODEL        override the Claude model (default claude-opus-5-5)
 *    AI_PROVIDER         "gemini" or "claude" — only needed if you set both keys
 *    SERPAPI_KEY or BRAVE_API_KEY   web photos for non-Hot Wheels brands
 */

const CFG = {
  INV: 'Inventory',
  SALES: 'Sales',
  ENQ: 'Enquiries',
  SETTINGS: 'Settings',
  DASH: 'Dashboard',
  CACHE_KEY: 'g64_catalog',
  CACHE_TTL: 300,            // seconds. Busted on every admin write + sheet edit.
  AUTO_WEB_PHOTOS: 3,        // photos auto-attached from the web when you add a car
  MAX_WEB_PHOTOS: 8,
  PHOTO_FOLDER_NAME: "SB's Garage · Photos",
  IMG_URL: 'https://lh3.googleusercontent.com/d/',
};

const HEADERS = {};
HEADERS[CFG.INV] = ['ID', 'Thumb', 'Name', 'Brand', 'Manufacturer', 'Series', 'Year', 'Color', 'Condition',
  'Tags', 'Price', 'Compare At', 'Qty', 'Cost', 'Hide', 'Notes', 'Photo', 'Web Photos', 'Added On', 'Review'];
HEADERS[CFG.SALES] = ['Order ID', 'Date', 'Item ID', 'Item Name', 'Brand', 'Qty', 'Unit Price', 'Total',
  'Unit Cost', 'Profit', 'Buyer', 'Contact', 'City', 'Channel', 'Payment', 'Revenue Tag', 'Enquiry ID', 'Notes'];
HEADERS[CFG.ENQ] = ['Enquiry ID', 'Date', 'Name', 'City', 'Items', 'Item IDs', 'Total', 'Status', 'Notes'];

const FORMULA_COLS = ['Thumb']; // never written by the script

const DEFAULT_SETTINGS = [
  ['Store Name', "SB's Garage"],
  ['Tagline', '1:64 grails, straight off my shelf.'],
  ['WhatsApp Number', '919999999999'],
  ['Instagram', 'sbsgarage'],
  ['Announcement', 'New drop every Sunday 8 PM · Shipping across India'],
  ['Shipping Note', 'Shipping ₹80 flat, free above ₹1,500. Bubble-wrapped & boxed.'],
  ['Show Sold Out', 'Yes'],
  ['New Badge Days', '7'],
];

// item field  →  Inventory column
const FIELD_TO_COL = {
  name: 'Name', brand: 'Brand', make: 'Manufacturer', series: 'Series', year: 'Year', color: 'Color',
  condition: 'Condition', tags: 'Tags', price: 'Price', compareAt: 'Compare At', qty: 'Qty', cost: 'Cost',
  hidden: 'Hide', notes: 'Notes', review: 'Review',
};
const NUMERIC_FIELDS = ['price', 'compareAt', 'qty', 'cost'];

const BRANDS = ['Hot Wheels', 'Mini GT', 'Kaido House', 'Inno64', 'Pop Race', 'Matchbox', 'Tarmac Works',
  'Tomica', 'Majorette', 'Greenlight', 'M2 Machines', 'Other'];
const CONDITIONS = ['Mint (carded)', 'Carded – soft corners', 'Carded – damaged card', 'Boxed', 'Loose', 'Custom'];
const CHANNELS = ['Website', 'WhatsApp', 'Instagram', 'Facebook group', 'Meetup / in person', 'Other'];
const PAYMENTS = ['UPI', 'Cash', 'Bank transfer', 'Card', 'Other'];
const ENQ_STATUSES = ['New', 'Converted', 'Lost'];

const ID_PREFIX = {
  'hot wheels': 'HW', 'hotwheels': 'HW', 'mini gt': 'MGT', 'minigt': 'MGT', 'kaido house': 'KH',
  'inno64': 'INNO', 'inno 64': 'INNO', 'pop race': 'PR', 'poprace': 'PR', 'matchbox': 'MB',
  'tarmac works': 'TW', 'tomica': 'TOM', 'majorette': 'MAJ', 'greenlight': 'GL', 'm2 machines': 'M2',
};

/* ═════════════════════════════  HTTP API  ═════════════════════════════ */

function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    if (p.action === 'ping') return json_({ ok: true, at: new Date().toISOString() });
    let s = p.fresh ? null : cacheGet_(CFG.CACHE_KEY);
    if (!s) {
      s = JSON.stringify(buildCatalog_());
      cachePut_(CFG.CACHE_KEY, s);
    }
    return ContentService.createTextOutput(s).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return json_({ ok: false, error: errMsg_(err) });
  }
}

const ADMIN_ACTIONS = {
  login: () => ({}),
  adminData: adminData_,
  saveItem: saveItem_,
  findPhotos: findPhotos_,
  addWebPhotos: addWebPhotos_,
  recordSale: recordSale_,
  voidOrder: voidOrder_,
  setEnquiry: setEnquiry_,
  bulkAdd: bulkAdd_,
  reidentify: reidentify_,
  identify: b => {
    const r = identifyCar_((b.photos || []).filter(p => p && p.data));
    if (!r.ok) throw new Error(r.note);
    return { car: r.car };
  },
};

function doPost(e) {
  let body;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, error: 'Bad JSON' });
  }
  try {
    if (body.action === 'enquiry') return json_(publicEnquiry_(body));
    if (!checkKey_(body.key)) return json_({ ok: false, code: 401, error: 'Wrong admin key' });
    const fn = ADMIN_ACTIONS[body.action];
    if (!fn) return json_({ ok: false, error: 'Unknown action: ' + body.action });
    return json_(Object.assign({ ok: true }, fn(body)));
  } catch (err) {
    return json_({ ok: false, error: errMsg_(err) });
  }
}

/* ═════════════════════════════  CATALOG  ═════════════════════════════ */

function buildCatalog_() {
  let t = readTable_(CFG.INV);
  // rows typed straight into the sheet without an ID get one now
  if (t.rows.some(r => str_(get_(t, r, 'Name')) && !str_(get_(t, r, 'ID')))) {
    withLock_(() => fillMissingIds_());
    t = readTable_(CFG.INV);
  }
  const items = [];
  t.rows.forEach(r => {
    const it = itemFromRow_(t, r);
    if (!it.id || !it.name || it.hidden || !(it.price > 0)) return; // drafts stay off the store
    delete it.cost;
    delete it.hidden;
    delete it.review;
    items.push(it);
  });
  return { ok: true, settings: readSettings_(), items: items, generatedAt: new Date().toISOString() };
}

function itemFromRow_(t, r) {
  const added = get_(t, r, 'Added On');
  return {
    id: str_(get_(t, r, 'ID')),
    name: str_(get_(t, r, 'Name')),
    brand: str_(get_(t, r, 'Brand')),
    make: str_(get_(t, r, 'Manufacturer')),
    series: str_(get_(t, r, 'Series')),
    year: str_(get_(t, r, 'Year')),
    color: str_(get_(t, r, 'Color')),
    condition: str_(get_(t, r, 'Condition')),
    tags: list_(get_(t, r, 'Tags')),
    price: num_(get_(t, r, 'Price')),
    compareAt: num_(get_(t, r, 'Compare At')),
    qty: Math.max(0, num_(get_(t, r, 'Qty')) || 0),
    cost: num_(get_(t, r, 'Cost')),
    hidden: truthy_(get_(t, r, 'Hide')),
    notes: str_(get_(t, r, 'Notes')),
    review: str_(get_(t, r, 'Review')),
    photos: photosOf_(t, r),
    added: added instanceof Date ? added.getTime() : (Date.parse(added) || 0),
    n: r.row,
  };
}

function photosOf_(t, r) {
  const out = [];
  const main = str_(get_(t, r, 'Photo'));
  if (main) out.push(main);
  return out.concat(photoList_(get_(t, r, 'Web Photos')));
}

function readSettings_() {
  const sh = ss_().getSheetByName(CFG.SETTINGS);
  const out = {};
  if (!sh) return out;
  sh.getDataRange().getValues().slice(1).forEach(r => {
    const k = str_(r[0]);
    if (k) out[camel_(k)] = str_(r[1]);
  });
  return out;
}

/* ═════════════════════════════  ADMIN  ═════════════════════════════ */

function adminData_() {
  const inv = readTable_(CFG.INV);
  const items = inv.rows.map(r => itemFromRow_(inv, r)).filter(it => it.id);
  const st = readTable_(CFG.SALES);
  const sales = st.rows.filter(r => str_(get_(st, r, 'Order ID'))).map(r => ({
    orderId: str_(get_(st, r, 'Order ID')),
    date: ts_(get_(st, r, 'Date')),
    itemId: str_(get_(st, r, 'Item ID')),
    itemName: str_(get_(st, r, 'Item Name')),
    brand: str_(get_(st, r, 'Brand')),
    qty: num_(get_(st, r, 'Qty')) || 0,
    unitPrice: num_(get_(st, r, 'Unit Price')) || 0,
    total: num_(get_(st, r, 'Total')) || 0,
    unitCost: num_(get_(st, r, 'Unit Cost')),
    profit: num_(get_(st, r, 'Profit')),
    buyer: str_(get_(st, r, 'Buyer')),
    contact: str_(get_(st, r, 'Contact')),
    city: str_(get_(st, r, 'City')),
    channel: str_(get_(st, r, 'Channel')),
    payment: str_(get_(st, r, 'Payment')),
    tag: str_(get_(st, r, 'Revenue Tag')),
    enquiryId: str_(get_(st, r, 'Enquiry ID')),
    notes: str_(get_(st, r, 'Notes')),
  }));
  const et = readTable_(CFG.ENQ);
  const enquiries = et.rows.filter(r => str_(get_(et, r, 'Enquiry ID'))).map(r => ({
    id: str_(get_(et, r, 'Enquiry ID')),
    date: ts_(get_(et, r, 'Date')),
    name: str_(get_(et, r, 'Name')),
    city: str_(get_(et, r, 'City')),
    items: str_(get_(et, r, 'Items')),
    itemIds: str_(get_(et, r, 'Item IDs')),
    total: num_(get_(et, r, 'Total')) || 0,
    status: str_(get_(et, r, 'Status')) || 'New',
    notes: str_(get_(et, r, 'Notes')),
  }));
  return {
    items: items, sales: sales, enquiries: enquiries, settings: readSettings_(),
    lists: { brands: BRANDS, conditions: CONDITIONS, channels: CHANNELS, payments: PAYMENTS },
    hasSearchKey: !!(prop_('SERPAPI_KEY') || prop_('BRAVE_API_KEY')),
    hasAiKey: !!aiProvider_(),
    aiProvider: aiProvider_(),
  };
}

/**
 * Add or update a car.
 * body: { item:{id?, name, brand, …}, photo?:{data:'data:image/jpeg;base64,…'}, newPhotos?:[{data}],
 *         photos?:[refs in display order], webPhotos?:[{url,thumb}], autoWeb?:bool,
 *         draft?:bool  (name may be blank — the row stays off the store until it has a name + price) }
 */
function saveItem_(body) {
  const it = body.item || {};
  const creating = !it.id;
  const nameMissing = creating ? !str_(it.name) : (it.name !== undefined && !str_(it.name));
  if (nameMissing && !body.draft) throw new Error('Name is required');
  // Drive uploads are the slow part — do them before taking the lock
  const uploads = [].concat(body.photo ? [body.photo] : [], body.newPhotos || []).filter(p => p && p.data);
  const newIds = uploads.map((p, i) => saveBase64Photo_(p, 'car-' + Date.now() + '-' + i));
  let id;
  withLock_(() => {
    const t = readTable_(CFG.INV);
    const r = it.id ? findRow_(t, 'ID', it.id) : null;
    if (it.id && !r) throw new Error('Item not found: ' + it.id);
    id = r ? str_(get_(t, r, 'ID')) : makeId_(it.brand, maxIdNum_(t) + 1);

    const upd = {};
    Object.keys(FIELD_TO_COL).forEach(f => {
      if (it[f] === undefined) return;
      let v = it[f];
      if (f === 'tags') v = (Array.isArray(v) ? v : list_(v)).join(', ');
      else if (NUMERIC_FIELDS.indexOf(f) >= 0) v = num_(v) == null ? '' : num_(v);
      else if (f === 'hidden') v = !!v;
      else v = str_(v);
      upd[FIELD_TO_COL[f]] = v;
    });

    const kept = Array.isArray(body.photos) ? body.photos.map(str_).filter(Boolean) : (r ? photosOf_(t, r) : []);
    const photos = newIds.concat(kept);
    upd['Photo'] = photos[0] || '';
    upd['Web Photos'] = photos.slice(1).join('\n');

    if (r) {
      writeObj_(t, r.row, upd);
    } else {
      upd['ID'] = id;
      upd['Added On'] = new Date();
      if (upd['Qty'] === undefined || upd['Qty'] === '') upd['Qty'] = 1;
      if (upd['Hide'] === undefined) upd['Hide'] = false;
      appendObj_(t, upd);
    }
  });

  // web photos — slow network work, done outside the lock
  const notes = [];
  let cands = Array.isArray(body.webPhotos) ? body.webPhotos : [];
  if (!cands.length && body.autoWeb) {
    const found = searchPhotos_(it, 12);
    cands = found.photos.slice(0, CFG.AUTO_WEB_PHOTOS);
    found.notes.forEach(n => notes.push(n));
  }
  if (cands.length) {
    const res = attachWebPhotos_(id, cands);
    if (res.saved) notes.push('Added ' + res.saved + ' web photo' + (res.saved > 1 ? 's' : ''));
    if (res.failed) notes.push(res.failed + ' web photo(s) could not be downloaded');
  }
  bustCache_();
  const t2 = readTable_(CFG.INV);
  return { item: itemFromRow_(t2, findRow_(t2, 'ID', id)), notes: notes };
}

function findPhotos_(body) {
  return searchPhotos_(body.query || {}, body.limit || 24);
}

function addWebPhotos_(body) {
  if (!body.id) throw new Error('id required');
  const res = attachWebPhotos_(body.id, body.photos || []);
  bustCache_();
  const t = readTable_(CFG.INV);
  return Object.assign(res, { item: itemFromRow_(t, findRow_(t, 'ID', body.id)) });
}

/**
 * Record a sale (one or more lines). Decrements stock.
 * body.sale: { lines:[{id, qty, price}], buyer, contact, city, channel, payment, tag, date?, notes?, enquiryId? }
 */
function recordSale_(body) {
  const s = body.sale || {};
  const lines = (s.lines || []).filter(l => l && l.id && (num_(l.qty) || 0) > 0);
  if (!lines.length) throw new Error('Add at least one item');
  const warnings = [];
  let orderId;
  withLock_(() => {
    const inv = readTable_(CFG.INV);
    const st = readTable_(CFG.SALES);
    orderId = 'ORD-' + pad_(maxIdNum_(st, 'Order ID') + 1, 4);
    const date = s.date ? new Date(s.date) : new Date();
    const plan = lines.map(l => {
      const r = findRow_(inv, 'ID', l.id);
      if (!r) throw new Error('Item not found: ' + l.id);
      return { l: l, r: r, q: Math.floor(num_(l.qty)) };
    });
    plan.forEach(p => {
      p.stock = num_(get_(inv, p.r, 'Qty')) || 0;
      if (p.q > p.stock) warnings.push(p.l.id + ': sold ' + p.q + ' but only ' + p.stock + ' in stock (set to 0)');
      const price = num_(p.l.price) != null ? num_(p.l.price) : (num_(get_(inv, p.r, 'Price')) || 0);
      const cost = num_(get_(inv, p.r, 'Cost'));
      appendObj_(st, {
        'Order ID': orderId, 'Date': date, 'Item ID': str_(get_(inv, p.r, 'ID')),
        'Item Name': str_(get_(inv, p.r, 'Name')), 'Brand': str_(get_(inv, p.r, 'Brand')),
        'Qty': p.q, 'Unit Price': price, 'Total': price * p.q,
        'Unit Cost': cost == null ? '' : cost, 'Profit': cost == null ? '' : (price - cost) * p.q,
        'Buyer': str_(s.buyer), 'Contact': str_(s.contact), 'City': str_(s.city),
        'Channel': str_(s.channel), 'Payment': str_(s.payment), 'Revenue Tag': str_(s.tag),
        'Enquiry ID': str_(s.enquiryId), 'Notes': str_(s.notes),
      });
      writeObj_(inv, p.r.row, { 'Qty': Math.max(0, p.stock - p.q) }); // also updates in-memory row
    });
    if (s.enquiryId) setEnquiryStatus_(s.enquiryId, 'Converted');
  });
  bustCache_();
  return { orderId: orderId, warnings: warnings };
}

/** Undo an order: deletes its Sales rows and (optionally) puts the stock back. */
function voidOrder_(body) {
  const orderId = str_(body.orderId);
  if (!orderId) throw new Error('orderId required');
  let removed = 0;
  withLock_(() => {
    const st = readTable_(CFG.SALES);
    const rows = st.rows.filter(r => str_(get_(st, r, 'Order ID')) === orderId);
    if (!rows.length) throw new Error('Order not found: ' + orderId);
    if (body.restock !== false) {
      const inv = readTable_(CFG.INV);
      rows.forEach(r => {
        const ir = findRow_(inv, 'ID', get_(st, r, 'Item ID'));
        if (!ir) return;
        const q = (num_(get_(inv, ir, 'Qty')) || 0) + (num_(get_(st, r, 'Qty')) || 0);
        writeObj_(inv, ir.row, { 'Qty': q });
      });
    }
    const enq = rows.map(r => str_(get_(st, r, 'Enquiry ID'))).filter(Boolean)[0];
    rows.map(r => r.row).sort((a, b) => b - a).forEach(n => st.sh.deleteRow(n));
    removed = rows.length;
    if (enq) setEnquiryStatus_(enq, 'New');
  });
  bustCache_();
  return { removed: removed };
}

function setEnquiry_(body) {
  if (ENQ_STATUSES.indexOf(body.status) < 0) throw new Error('Bad status');
  withLock_(() => setEnquiryStatus_(body.id, body.status));
  return {};
}

function setEnquiryStatus_(id, status) {
  const t = readTable_(CFG.ENQ);
  const r = findRow_(t, 'Enquiry ID', id);
  if (r) writeObj_(t, r.row, { 'Status': status });
}

/* ═════════════════════════════  BULK UPLOAD + AI  ═════════════════════════════ */

/**
 * One car from the bulk uploader → one draft row.
 * body: { photos:[{data}], fileName?, defaults:{brand, series, condition, tags, qty, price}, ai?:bool, autoWeb?:bool }
 * Your defaults win; AI fills whatever is still blank. No price = draft (highlighted yellow, not on the store).
 */
function bulkAdd_(body) {
  const photos = (body.photos || []).filter(p => p && p.data).slice(0, 4);
  if (!photos.length) throw new Error('No photo');
  const d = body.defaults || {};
  const notes = [];
  let car = {};
  let review = '';
  if (body.ai) {
    const r = identifyCar_(photos);
    if (r.ok) {
      car = r.car || {};
      review = car.is_diecast === false ? 'AI: this does not look like a diecast car'
        : 'AI · ' + (car.confidence || '?') + ' confidence' + (car.seller_note ? ' · ' + car.seller_note : '');
    } else {
      notes.push(r.note);
      review = r.note;
    }
  }
  const defTags = Array.isArray(d.tags) ? d.tags : list_(d.tags);
  const tags = [];
  defTags.concat(car.tags || []).forEach(x => { if (x && tags.indexOf(x) < 0) tags.push(x); });
  const item = {
    name: str_(car.name) || nameFromFile_(body.fileName),
    brand: str_(d.brand) || str_(car.brand),
    make: str_(car.manufacturer),
    series: str_(d.series) || str_(car.series),
    year: str_(car.year),
    color: str_(car.color),
    condition: str_(d.condition) || str_(car.condition),
    tags: tags,
    qty: num_(d.qty) == null ? 1 : num_(d.qty),
    price: num_(d.price) == null ? '' : num_(d.price),
    review: review,
  };
  const res = saveItem_({ item: item, newPhotos: photos, draft: true, autoWeb: !!body.autoWeb && !!item.name });
  res.notes = notes.concat(res.notes || []);
  res.ai = body.ai ? { ok: !!car.name, confidence: car.confidence || '', note: car.seller_note || '' } : null;
  return res;
}

/** Run AI again on a saved car (e.g. after the free limit resets). Fills blank fields only. */
function reidentify_(body) {
  const t0 = readTable_(CFG.INV);
  const r0 = findRow_(t0, 'ID', body.id);
  if (!r0) throw new Error('Item not found: ' + body.id);
  const refs = photosOf_(t0, r0).slice(0, 2);
  if (!refs.length) throw new Error('This car has no photo');
  const photos = refs.map(ref => {
    const blob = /^https?:/i.test(ref) ? UrlFetchApp.fetch(ref).getBlob() : DriveApp.getFileById(ref).getBlob();
    return { data: 'data:' + (blob.getContentType() || 'image/jpeg') + ';base64,' + Utilities.base64Encode(blob.getBytes()) };
  });
  const ai = identifyCar_(photos);
  const cur = itemFromRow_(t0, r0);
  const upd = { id: cur.id };
  if (ai.ok) {
    const c = ai.car;
    const fill = { name: c.name, brand: c.brand, make: c.manufacturer, series: c.series, year: c.year, color: c.color, condition: c.condition };
    Object.keys(fill).forEach(k => { if (!cur[k] && fill[k]) upd[k] = fill[k]; });
    const tags = cur.tags.slice();
    c.tags.forEach(x => { if (tags.indexOf(x) < 0) tags.push(x); });
    upd.tags = tags;
    upd.review = c.is_diecast === false ? 'AI: this does not look like a diecast car'
      : 'AI · ' + c.confidence + ' confidence' + (c.seller_note ? ' · ' + c.seller_note : '');
  } else {
    upd.review = ai.note;
  }
  const res = saveItem_({ item: upd, draft: true });
  res.ok_ai = ai.ok;
  if (!ai.ok) res.notes = [ai.note];
  return res;
}

/** "Datsun_510 Kaido.jpg" → "Datsun 510 Kaido"; camera names (IMG_1234, PXL_…) → "" */
function nameFromFile_(f) {
  const base = str_(f).replace(/\.[a-z0-9]{2,5}$/i, '');
  if (!base || /^(img|dsc|dcim|pxl|mvimg|photo|image|screenshot|whatsapp|signal|wa\d|cam|snapchat|\d)/i.test(base)) return '';
  return base.replace(/[_]+/g, ' ').replace(/\s+-\s+|\s{2,}/g, ' ').trim();
}

const AI_TAGS = ['Mainline', 'Premium', 'Team Transport', 'Silver Series', 'Pack of 5', 'TH', 'STH', 'Chase', 'RLC', 'Rare'];
const AI_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['is_diecast', 'name', 'brand', 'manufacturer', 'series', 'year', 'color', 'condition', 'tags', 'confidence', 'seller_note'],
  properties: {
    is_diecast: { type: 'boolean' },
    name: { type: 'string' },
    brand: { type: 'string' },
    manufacturer: { type: 'string' },
    series: { type: 'string' },
    year: { type: 'string' },
    color: { type: 'string' },
    condition: { type: 'string', enum: CONDITIONS.concat(['']) },
    tags: { type: 'array', items: { type: 'string', enum: AI_TAGS } },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    seller_note: { type: 'string' },
  },
};
const AI_PROMPT = [
  'You are helping a diecast collector in India list 1:64 scale cars for sale. Identify the car in the photo.',
  'If there is a second photo, it is the same item from another angle or the back of the card.',
  '',
  'Fields:',
  '- name: read the text printed on the card or box first and use the exact printed casting name (e.g. "Nissan Skyline GT-R (BNR34)", "\'95 Mazda RX-7"). For a loose car, give the casting name you recognise.',
  '- brand: the diecast brand (Hot Wheels, Matchbox, Mini GT, Kaido House, Inno64, Pop Race, Tarmac Works, Tomica, Majorette, Greenlight, M2 Machines…), never the car maker.',
  '- manufacturer: the real car maker (Nissan, Porsche…). Use "Assorted" for a multi-car pack.',
  '- series: the line as printed, e.g. "HW J-Imports 3/10", "Car Culture: Japan Historics 4", "Team Transport #45", "Boulevard". Empty if not visible.',
  '- year: the year printed on the card or box if visible, else empty.',
  '- color: main body colour in plain words.',
  '- condition: "Mint (carded)" for a clean card/blister; "Carded – soft corners" or "Carded – damaged card" if wear is visible; "Boxed" for window boxes (Mini GT, Inno64, Kaido House, Pop Race, Tarmac Works); "Loose" with no packaging.',
  '- tags, only with visible evidence: Mainline (basic card, plastic wheels); Premium (Real Riders rubber tyres or metal/metal, Car Culture, Boulevard, Pop Culture, premium boxed brands); Team Transport (car + transporter set); Silver Series; Pack of 5; TH (silver circle-flame logo printed on the card behind the car); STH (Spectraflame paint + Real Riders + gold circle-flame logo); Chase (marked chase); RLC (Red Line Club packaging).',
  '- confidence: how sure you are about the name.',
  '- seller_note: one short line telling the seller what to double-check, or empty if nothing.',
  '',
  'Leave a field empty rather than guess. If the photo is not a diecast car, set is_diecast to false.',
].join('\n');

function aiProvider_() {
  const pick = str_(prop_('AI_PROVIDER')).toLowerCase();
  const g = !!prop_('GEMINI_API_KEY');
  const c = !!prop_('ANTHROPIC_API_KEY');
  if (pick === 'gemini' && g) return 'gemini';
  if (pick === 'claude' && c) return 'claude';
  return g ? 'gemini' : c ? 'claude' : '';
}

/** Reads the photo(s) with whichever AI is configured. Returns {ok, car} or {ok:false, note}. Never throws on API errors. */
function identifyCar_(photos) {
  const provider = aiProvider_();
  if (!provider) return { ok: false, note: 'AI is off — add a free GEMINI_API_KEY in Apps Script → Project Settings → Script properties.' };
  if (!photos.length) return { ok: false, note: 'No photo to read' };
  const r = provider === 'gemini' ? identifyCarGemini_(photos) : identifyCarClaude_(photos);
  if (r.ok) r.car = cleanCar_(r.car);
  return r;
}

/** Keep AI output inside the values the sheet understands. */
function cleanCar_(c) {
  c = c || {};
  const out = {};
  ['name', 'brand', 'manufacturer', 'series', 'year', 'color', 'seller_note'].forEach(k => { out[k] = str_(c[k]); });
  out.is_diecast = c.is_diecast !== false;
  out.condition = CONDITIONS.indexOf(str_(c.condition)) >= 0 ? str_(c.condition) : '';
  out.tags = (Array.isArray(c.tags) ? c.tags : []).filter(t => AI_TAGS.indexOf(t) >= 0);
  out.confidence = ['high', 'medium', 'low'].indexOf(c.confidence) >= 0 ? c.confidence : 'low';
  return out;
}

const GEMINI_SCHEMA = {
  type: 'OBJECT',
  properties: {
    is_diecast: { type: 'BOOLEAN' },
    name: { type: 'STRING' },
    brand: { type: 'STRING' },
    manufacturer: { type: 'STRING' },
    series: { type: 'STRING' },
    year: { type: 'STRING' },
    color: { type: 'STRING' },
    condition: { type: 'STRING' },
    tags: { type: 'ARRAY', items: { type: 'STRING', enum: AI_TAGS } },
    confidence: { type: 'STRING', enum: ['high', 'medium', 'low'] },
    seller_note: { type: 'STRING' },
  },
  required: AI_SCHEMA.required,
};

/** Google Gemini — free tier via an AI Studio key (no billing). */
function identifyCarGemini_(photos) {
  const key = prop_('GEMINI_API_KEY');
  const model = prop_('GEMINI_MODEL') || 'gemini-flash-latest';
  const parts = photos.slice(0, 2).map(p => {
    const m = String(p.data).match(/^data:([^;]+);base64,(.*)$/);
    return { inlineData: { mimeType: m ? m[1] : 'image/jpeg', data: m ? m[2] : p.data } };
  });
  parts.push({ text: AI_PROMPT + '\n\nReply with one JSON object with exactly these keys: ' + AI_SCHEMA.required.join(', ') +
    '. condition must be one of: ' + CONDITIONS.join(' | ') + ' (or empty).' });
  let useSchema = true;
  let res;
  let j = {};
  for (let attempt = 0; attempt < 4; attempt++) {
    const gen = { responseMimeType: 'application/json', temperature: 0.2 };
    if (useSchema) gen.responseSchema = GEMINI_SCHEMA;
    res = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent', {
      method: 'post', contentType: 'application/json', headers: { 'x-goog-api-key': key },
      payload: JSON.stringify({ contents: [{ role: 'user', parts: parts }], generationConfig: gen }), muteHttpExceptions: true,
    });
    try { j = JSON.parse(res.getContentText() || '{}'); } catch (e) { j = {}; }
    const code = res.getResponseCode();
    const msg = (j.error && j.error.message) || '';
    if (code === 400 && useSchema && /schema/i.test(msg)) { useSchema = false; continue; } // model rejects the schema → plain JSON mode
    if (code === 429) {
      if (/per ?day|daily|PerDay/i.test(msg)) return { ok: false, note: 'Gemini free daily limit reached — tap ✨ Identify on the draft tomorrow, or fill it in yourself.' };
      Utilities.sleep(8000 * (attempt + 1)); // free tier allows only a few requests a minute
      continue;
    }
    if ([500, 502, 503].indexOf(code) >= 0) { Utilities.sleep(2000 * (attempt + 1)); continue; }
    break;
  }
  const code = res.getResponseCode();
  if (code === 429) return { ok: false, note: 'Gemini free limit is busy — tap ✨ Identify on the draft in a minute.' };
  if (code >= 300) return { ok: false, note: 'Gemini error ' + code + (j.error && j.error.message ? ': ' + j.error.message.slice(0, 160) : '') };
  const cand = (j.candidates || [])[0];
  if (!cand || !cand.content) return { ok: false, note: 'Gemini could not read this photo' + (j.promptFeedback && j.promptFeedback.blockReason ? ' (' + j.promptFeedback.blockReason + ')' : '') };
  const text = (cand.content.parts || []).map(x => x.text || '').join('').replace(/^```(json)?\s*|\s*```$/g, '');
  try {
    return { ok: true, car: JSON.parse(text) };
  } catch (e) {
    return { ok: false, note: 'Gemini reply was not readable' };
  }
}

/** Anthropic Claude — paid (needs API credits). */
function identifyCarClaude_(photos) {
  const key = prop_('ANTHROPIC_API_KEY');
  const model = prop_('CLAUDE_MODEL') || 'claude-opus-5-5';
  const content = photos.slice(0, 2).map(p => {
    const m = String(p.data).match(/^data:([^;]+);base64,(.*)$/);
    return { type: 'image', source: { type: 'base64', media_type: m ? m[1] : 'image/jpeg', data: m ? m[2] : p.data } };
  });
  content.push({ type: 'text', text: AI_PROMPT });
  const req = {
    model: model,
    max_tokens: 16000,
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: AI_SCHEMA } },
    messages: [{ role: 'user', content: content }],
  };
  const headers = { 'x-api-key': key, 'anthropic-version': '2026-10-21' };
  if (/^claude-(opus-5|fable-5|sonnet-5-5)/.test(model)) {
    // if a safety classifier declines, the API retries on a fallback model inside the same call
    req.fallbacks = 'default';
    headers['anthropic-beta'] = 'server-side-fallback-2026-07-01';
  }
  let res;
  let j = {};
  for (let attempt = 0; attempt < 3; attempt++) {
    res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'post', contentType: 'application/json', headers: headers,
      payload: JSON.stringify(req), muteHttpExceptions: true,
    });
    try { j = JSON.parse(res.getContentText() || '{}'); } catch (e) { j = {}; }
    const code = res.getResponseCode();
    if ([429, 500, 502, 503, 529].indexOf(code) < 0) break;
    Utilities.sleep(1500 * (attempt + 1)); // busy — back off and retry
  }
  const code = res.getResponseCode();
  if (code >= 300) return { ok: false, note: 'AI error ' + code + (j.error && j.error.message ? ': ' + j.error.message : '') };
  if (j.stop_reason === 'refusal' || j.stop_reason === 'max_tokens') {
    return { ok: false, note: 'AI could not read this photo (' + j.stop_reason + ')' };
  }
  const text = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  try {
    return { ok: true, car: JSON.parse(text) };
  } catch (e) {
    return { ok: false, note: 'AI reply was not readable' };
  }
}

/* ═════════════════════════════  PUBLIC ENQUIRY  ═════════════════════════════ */

/** Called by the store's "Order on WhatsApp" button. Prices are re-read server-side. */
function publicEnquiry_(body) {
  const cache = CacheService.getScriptCache();
  const hits = Number(cache.get('enq_rate') || 0);
  if (hits > 80) throw new Error('Busy — please message us directly on WhatsApp');
  cache.put('enq_rate', String(hits + 1), 600);

  const req = (Array.isArray(body.items) ? body.items : []).slice(0, 40);
  if (!req.length) throw new Error('Empty cart');
  let id;
  let total = 0;
  withLock_(() => {
    const inv = readTable_(CFG.INV);
    const desc = [];
    const ids = [];
    req.forEach(x => {
      const r = findRow_(inv, 'ID', x && x.id);
      if (!r || truthy_(get_(inv, r, 'Hide'))) return;
      const q = Math.max(1, Math.min(99, Math.floor(num_(x.qty) || 1)));
      const price = num_(get_(inv, r, 'Price')) || 0;
      const iid = str_(get_(inv, r, 'ID'));
      total += price * q;
      desc.push(str_(get_(inv, r, 'Name')) + ' [' + iid + '] ×' + q + ' @ ₹' + price);
      ids.push(iid + (q > 1 ? '×' + q : ''));
    });
    if (!desc.length) throw new Error('Those cars are no longer listed');
    const t = readTable_(CFG.ENQ);
    id = 'ENQ-' + pad_(maxIdNum_(t, 'Enquiry ID') + 1, 4);
    appendObj_(t, {
      'Enquiry ID': id, 'Date': new Date(), 'Name': clean_(body.name, 60), 'City': clean_(body.city, 60),
      'Items': desc.join('\n'), 'Item IDs': ids.join(', '), 'Total': total, 'Status': 'New',
    });
  });
  return { ok: true, enquiryId: id, total: total };
}

/* ═════════════════════════════  WEB PHOTOS  ═════════════════════════════ */

/**
 * Finds candidate photos for a car.
 *   Hot Wheels / Matchbox → their Fandom wikis (free, no key, CC-BY-SA).
 *   Any brand             → SerpAPI (Google Images) or Brave Image Search if a key is set.
 */
function searchPhotos_(q, limit) {
  const brand = String(q.brand || '').toLowerCase();
  let out = [];
  const notes = [];
  const wiki = /hot\s*wheels/.test(brand) ? 'hotwheels' : /matchbox/.test(brand) ? 'matchbox' : null;
  if (wiki) {
    try { out = out.concat(fandomPhotos_(wiki, q)); } catch (e) { notes.push('Wiki search failed: ' + errMsg_(e)); }
  }
  const serp = prop_('SERPAPI_KEY');
  const brave = prop_('BRAVE_API_KEY');
  if (serp || brave) {
    const text = [q.brand, q.name, q.series, q.year, q.color].map(str_).filter(Boolean).join(' ') + ' diecast 1:64';
    try { out = out.concat(serp ? serpPhotos_(serp, text) : bravePhotos_(brave, text)); }
    catch (e) { notes.push('Image search failed: ' + errMsg_(e)); }
  } else if (!wiki) {
    notes.push('Web photos for ' + (q.brand || 'this brand') + ' need a free SerpAPI or Brave key (see README).');
  }
  const seen = {};
  out = out.filter(p => p.url && !seen[p.url] && (seen[p.url] = true));
  if (!out.length && !notes.length) notes.push('No web photos found — try a simpler name (e.g. "Skyline GT-R R34").');
  return { photos: out.slice(0, limit || 24), notes: notes };
}

function fandomPhotos_(wiki, q) {
  const base = 'https://' + wiki + '.fandom.com/api.php?format=json&action=query';
  const term = str_(q.name);
  if (!term) return [];
  const s = fetchJson_(base + '&list=search&srlimit=3&srsearch=' + encodeURIComponent(term));
  const titles = ((s.query && s.query.search) || []).map(x => x.title);
  const hints = [q.year, q.color, q.series].map(str_).join(' ').toLowerCase()
    .split(/[^a-z0-9]+/).filter(w => w.length > 1);
  const res = [];
  titles.slice(0, 2).forEach((title, ti) => {
    const r = fetchJson_(base + '&generator=images&gimlimit=60&prop=imageinfo&iiprop=url%7Csize%7Cmime&iiurlwidth=900&titles=' +
      encodeURIComponent(title));
    const pages = (r.query && r.query.pages) || {};
    Object.keys(pages).forEach(k => {
      const pg = pages[k];
      const ii = pg.imageinfo && pg.imageinfo[0];
      if (!ii || !/jpe?g|png|webp/i.test(ii.mime || '')) return;
      if ((ii.width || 0) < 250) return;
      const fname = String(pg.title || '').replace(/^File:/, '');
      if (/logo|icon|flag|badge|symbol|button|placeholder|wiki/i.test(fname)) return;
      const lower = fname.toLowerCase().replace(/_/g, ' ');
      let score = ti === 0 ? 5 : 0;
      hints.forEach(h => { if (lower.indexOf(h) >= 0) score += 3; });
      res.push({ url: ii.thumburl || ii.url, thumb: ii.thumburl || ii.url, title: fname, source: wiki + '.fandom.com', score: score });
    });
  });
  res.sort((a, b) => b.score - a.score);
  return res;
}

function serpPhotos_(key, text) {
  const r = fetchJson_('https://serpapi.com/search.json?engine=google_images&q=' + encodeURIComponent(text) +
    '&api_key=' + encodeURIComponent(key));
  return (r.images_results || []).slice(0, 24).map(x => ({
    url: x.original || x.thumbnail, thumb: x.thumbnail || x.original, title: x.title || '', source: x.source || 'Google', score: 0,
  }));
}

function bravePhotos_(key, text) {
  const r = fetchJson_('https://api.search.brave.com/res/v1/images/search?count=24&safesearch=strict&q=' +
    encodeURIComponent(text), { 'X-Subscription-Token': key, 'Accept': 'application/json' });
  return (r.results || []).map(x => ({
    url: (x.properties && x.properties.url) || '', thumb: (x.thumbnail && x.thumbnail.src) || '',
    title: x.title || '', source: x.source || 'Brave', score: 0,
  }));
}

/** Downloads candidates into Drive and appends them to the car's Web Photos. */
function attachWebPhotos_(id, cands) {
  const saved = [];
  let failed = 0;
  cands.slice(0, CFG.MAX_WEB_PHOTOS).forEach((c, i) => {
    const urls = typeof c === 'string' ? [c] : [c.url, c.thumb].filter(Boolean);
    for (let j = 0; j < urls.length; j++) {
      try { saved.push(saveRemotePhoto_(urls[j], id + '-web-' + Date.now() + '-' + i)); return; } catch (e) { /* try next */ }
    }
    failed++;
  });
  if (saved.length) {
    withLock_(() => {
      const t = readTable_(CFG.INV);
      const r = findRow_(t, 'ID', id);
      if (!r) return;
      const all = photosOf_(t, r).concat(saved);
      writeObj_(t, r.row, { 'Photo': all[0], 'Web Photos': all.slice(1).join('\n') });
    });
  }
  return { saved: saved.length, failed: failed };
}

/* ═════════════════════════════  DRIVE  ═════════════════════════════ */

function photoFolder_() {
  const id = prop_('PHOTO_FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* recreate */ } }
  const f = DriveApp.createFolder(CFG.PHOTO_FOLDER_NAME);
  PropertiesService.getScriptProperties().setProperty('PHOTO_FOLDER_ID', f.getId());
  return f;
}

function saveBlob_(blob, name) {
  const file = photoFolder_().createFile(blob);
  file.setName(name);
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e) {
    throw new Error('Saved the photo but could not make it public — Google Workspace accounts may block link sharing. Use a personal Gmail account.');
  }
  return file.getId();
}

function saveBase64Photo_(photo, name) {
  const m = String(photo.data).match(/^data:([^;]+);base64,(.*)$/);
  const mime = m ? m[1] : (photo.mimeType || 'image/jpeg');
  const bytes = Utilities.base64Decode(m ? m[2] : photo.data);
  const ext = mime.split('/')[1] || 'jpg';
  return saveBlob_(Utilities.newBlob(bytes, mime, name + '.' + ext), name + '.' + ext);
}

function saveRemotePhoto_(url, name) {
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
  if (res.getResponseCode() >= 300) throw new Error('HTTP ' + res.getResponseCode());
  const blob = res.getBlob();
  const type = String(blob.getContentType() || '');
  if (!/^image\//.test(type)) throw new Error('Not an image');
  if (blob.getBytes().length > 8 * 1024 * 1024) throw new Error('Too large');
  const ext = (type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
  blob.setName(name + '.' + ext);
  return saveBlob_(blob, name + '.' + ext);
}

/* ═════════════════════════════  SHEET MENU + TRIGGERS  ═════════════════════════════ */

function onOpen() {
  SpreadsheetApp.getUi().createMenu("🏁 SB's Garage")
    .addItem('Fetch web photos for selected rows', 'menuFetchPhotos')
    .addItem('Give IDs to new rows', 'menuFillIds')
    .addItem('Push sheet changes to the store now', 'menuRefresh')
    .addSeparator()
    .addItem('Show admin key', 'menuShowKey')
    .addItem('Setup / repair sheets', 'setup')
    .addToUi();
}

/** Simple trigger: gives new rows an ID and makes edits show up on the site quickly. */
function onEdit(e) {
  try {
    const sh = e.range.getSheet();
    const name = sh.getName();
    if (name === CFG.INV || name === CFG.SETTINGS) bustCache_();
    if (name !== CFG.INV || e.range.getRow() < 2) return;
    fillMissingIds_(e.range.getRow(), e.range.getNumRows(), true);
  } catch (err) { /* simple triggers must never throw */ }
}

function menuFillIds() {
  const n = withLock_(() => fillMissingIds_());
  bustCache_();
  toast_(n ? 'Gave IDs to ' + n + ' row(s)' : 'All rows already have IDs');
}

function menuRefresh() {
  bustCache_();
  toast_('Done — the store will show your latest sheet on next load.');
}

function menuShowKey() {
  alert_('Admin key', 'Your admin panel key:\n\n' + prop_('ADMIN_KEY') + '\n\nKeep it private.');
}

function menuFetchPhotos() {
  const sh = SpreadsheetApp.getActiveSheet();
  if (sh.getName() !== CFG.INV) { toast_('Select rows on the Inventory tab first'); return; }
  const sel = sh.getActiveRange();
  const t = readTable_(CFG.INV);
  const rows = t.rows.filter(r => r.row >= sel.getRow() && r.row < sel.getRow() + sel.getNumRows());
  let done = 0;
  rows.forEach(r => {
    const it = itemFromRow_(t, r);
    if (!it.id || !it.name) return;
    toast_('Searching photos for ' + it.name + '…');
    const found = searchPhotos_(it, 12);
    if (found.photos.length) {
      attachWebPhotos_(it.id, found.photos.slice(0, CFG.AUTO_WEB_PHOTOS));
      done++;
    }
  });
  bustCache_();
  toast_('Added web photos to ' + done + ' of ' + rows.length + ' row(s)');
}

/**
 * Gives an ID (+ Added On / Qty defaults) to rows that have a Name but no ID.
 * From onEdit we wait for Brand too, so the ID prefix is right (HW-, MGT-…).
 */
function fillMissingIds_(startRow, numRows, needBrand) {
  const t = readTable_(CFG.INV);
  let next = maxIdNum_(t);
  let changed = 0;
  t.rows.forEach(r => {
    if (startRow && (r.row < startRow || r.row >= startRow + numRows)) return;
    if (!str_(get_(t, r, 'Name')) || str_(get_(t, r, 'ID'))) return;
    if (needBrand && !str_(get_(t, r, 'Brand'))) return;
    next++;
    const upd = { 'ID': makeId_(get_(t, r, 'Brand'), next) };
    if (get_(t, r, 'Added On') === '') upd['Added On'] = new Date();
    if (get_(t, r, 'Qty') === '') upd['Qty'] = 1;
    writeObj_(t, r.row, upd);
    changed++;
  });
  return changed;
}

/* ═════════════════════════════  SETUP  ═════════════════════════════ */

function setup() {
  const ss = ss_();
  const props = PropertiesService.getScriptProperties();

  // reuse the default empty "Sheet1" as Inventory
  const first = ss.getSheets()[0];
  if (!ss.getSheetByName(CFG.INV) && first && /^(Sheet|Sheet1)$/.test(first.getName()) && first.getLastRow() === 0) {
    first.setName(CFG.INV);
  }

  [CFG.INV, CFG.SALES, CFG.ENQ].forEach(name => {
    const sh = ss.getSheetByName(name) || ss.insertSheet(name);
    const want = HEADERS[name];
    const lastCol = Math.max(sh.getLastColumn(), 1);
    const have = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(str_);
    if (!have.some(Boolean)) {
      sh.getRange(1, 1, 1, want.length).setValues([want]);
    } else {
      // repair: append any missing columns at the end
      const missing = want.filter(h => have.indexOf(h) < 0 && FORMULA_COLS.indexOf(h) < 0);
      if (missing.length) sh.getRange(1, have.length + 1, 1, missing.length).setValues([missing]);
    }
    styleHeader_(sh);
  });

  formatInventory_(ss.getSheetByName(CFG.INV));
  formatSales_(ss.getSheetByName(CFG.SALES));
  formatEnquiries_(ss.getSheetByName(CFG.ENQ));

  // Settings
  let set = ss.getSheetByName(CFG.SETTINGS);
  if (!set) {
    set = ss.insertSheet(CFG.SETTINGS);
    set.getRange(1, 1, 1, 2).setValues([['Setting', 'Value']]);
    set.getRange(2, 1, DEFAULT_SETTINGS.length, 2).setValues(DEFAULT_SETTINGS);
    set.getRange(2, 2, DEFAULT_SETTINGS.length, 1).setNumberFormat('@');
    set.setColumnWidth(1, 180);
    set.setColumnWidth(2, 460);
    styleHeader_(set);
  }

  buildDashboard_();

  if (!props.getProperty('ADMIN_KEY')) props.setProperty('ADMIN_KEY', randomKey_(20));
  photoFolder_();
  bustCache_();

  const msg = 'Sheets are ready.\n\nYour admin key:\n' + props.getProperty('ADMIN_KEY') +
    '\n\nNext: Deploy → New deployment → Web app (Execute as: Me, Who has access: Anyone). ' +
    'Paste the URL into site/config.js.';
  Logger.log(msg);
  alert_("SB's Garage setup ✓", msg);
}

function styleHeader_(sh) {
  const n = Math.max(sh.getLastColumn(), 1);
  sh.getRange(1, 1, 1, n).setFontWeight('bold').setBackground('#111318').setFontColor('#ffffff');
  sh.setFrozenRows(1);
}

function formatInventory_(sh) {
  const t = readTable_(CFG.INV);
  const max = sh.getMaxRows();
  const col = h => t.idx[h] + 1;
  const L = h => colLetter_(t.idx[h]);
  if (t.idx['Thumb'] != null && t.idx['Photo'] != null) {
    const p = L('Photo');
    sh.getRange(1, col('Thumb')).setFormula(
      '={"Thumb";ARRAYFORMULA(IF(' + p + '2:' + p + '="",,IMAGE(IF(LEFT(' + p + '2:' + p + ',4)="http",' + p + '2:' + p +
      ',"' + CFG.IMG_URL + '"&' + p + '2:' + p + '&"=w200"))))}');
    sh.setColumnWidth(col('Thumb'), 70);
  }
  ['ID', 'Name', 'Year', 'Tags', 'Photo', 'Web Photos'].forEach(h => {
    if (t.idx[h] != null) sh.getRange(2, col(h), max - 1, 1).setNumberFormat('@');
  });
  ['Price', 'Compare At', 'Cost'].forEach(h => {
    if (t.idx[h] != null) sh.getRange(2, col(h), max - 1, 1).setNumberFormat('₹#,##0');
  });
  if (t.idx['Added On'] != null) sh.getRange(2, col('Added On'), max - 1, 1).setNumberFormat('dd mmm yyyy');
  if (t.idx['Hide'] != null) sh.getRange(2, col('Hide'), max - 1, 1).insertCheckboxes();
  if (t.idx['Brand'] != null) {
    sh.getRange(2, col('Brand'), max - 1, 1).setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(BRANDS, true).setAllowInvalid(true).build());
  }
  if (t.idx['Condition'] != null) {
    sh.getRange(2, col('Condition'), max - 1, 1).setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(CONDITIONS, true).setAllowInvalid(true).build());
  }
  if (t.idx['Name'] != null) sh.setColumnWidth(col('Name'), 240);
  if (t.idx['Tags'] != null) sh.setColumnWidth(col('Tags'), 200);
  if (t.idx['ID'] != null) {
    sh.getRange(1, col('ID')).setNote('Leave blank — filled automatically (HW-0001, MGT-0002…).');
  }
  if (t.idx['Tags'] != null) {
    sh.getRange(1, col('Tags')).setNote('Comma separated, e.g. "Mainline, TH" or "Premium, Team Transport". ' +
      'Known: Mainline, TH, STH, Team Transport, Premium, Silver Series, Pack of 5, Rare, Chase, RLC.');
  }
  if (t.idx['Name'] != null) {
    sh.getRange(1, col('Name')).setNote('Tip: names starting with an apostrophe (\'95 Mazda) need two: \'\'95 Mazda RX-7');
  }
  if (t.idx['Review'] != null) {
    sh.getRange(1, col('Review')).setNote('Private. What the AI was unsure about. Clear it once checked.');
    sh.setColumnWidth(col('Review'), 260);
  }
  // Drafts (no name or no price) are highlighted yellow and stay off the store.
  if (t.idx['ID'] != null && t.idx['Name'] != null && t.idx['Price'] != null) {
    const f = '=AND($' + L('ID') + '2<>"",OR($' + L('Name') + '2="",N($' + L('Price') + '2)<=0))';
    const rules = sh.getConditionalFormatRules().filter(rule => {
      try { return rule.getBooleanCondition().getCriteriaValues()[0] !== f; } catch (e) { return true; }
    });
    rules.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied(f).setBackground('#fff3c4')
      .setRanges([sh.getRange(2, 1, max - 1, t.headers.length)]).build());
    sh.setConditionalFormatRules(rules);
  }
}

function formatSales_(sh) {
  const t = readTable_(CFG.SALES);
  const max = sh.getMaxRows();
  const col = h => t.idx[h] + 1;
  sh.getRange(2, col('Date'), max - 1, 1).setNumberFormat('dd mmm yyyy');
  ['Unit Price', 'Total', 'Unit Cost', 'Profit'].forEach(h => sh.getRange(2, col(h), max - 1, 1).setNumberFormat('₹#,##0'));
  sh.getRange(2, col('Contact'), max - 1, 1).setNumberFormat('@');
  sh.getRange(2, col('Channel'), max - 1, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(CHANNELS, true).setAllowInvalid(true).build());
  sh.getRange(2, col('Payment'), max - 1, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(PAYMENTS, true).setAllowInvalid(true).build());
}

function formatEnquiries_(sh) {
  const t = readTable_(CFG.ENQ);
  const max = sh.getMaxRows();
  const col = h => t.idx[h] + 1;
  sh.getRange(2, col('Date'), max - 1, 1).setNumberFormat('dd mmm yyyy, h:mm am/pm');
  sh.getRange(2, col('Total'), max - 1, 1).setNumberFormat('₹#,##0');
  sh.getRange(2, col('Status'), max - 1, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(ENQ_STATUSES, true).build());
  sh.setColumnWidth(col('Items'), 360);
}

function buildDashboard_() {
  const ss = ss_();
  const sh = ss.getSheetByName(CFG.DASH) || ss.insertSheet(CFG.DASH);
  sh.clear();
  const s = readTable_(CFG.SALES);
  const i = readTable_(CFG.INV);
  const S = h => colLetter_(s.idx[h]);
  const I = h => colLetter_(i.idx[h]);
  const rng = h => 'Sales!' + S(h) + '2:' + S(h);
  const inv = h => 'Inventory!' + I(h) + '2:' + I(h);
  const all = 'Sales!A1:' + colLetter_(s.headers.length - 1);

  sh.getRange('A1').setValue("SB's Garage · Dashboard").setFontSize(16).setFontWeight('bold');
  sh.getRange('A2').setValue('Auto-calculated from the Sales & Inventory tabs. Don\'t type here.').setFontColor('#777777');

  const kpis = [
    ['Revenue', '=SUM(' + rng('Total') + ')', '₹#,##0'],
    ['Profit', '=SUM(' + rng('Profit') + ')', '₹#,##0'],
    ['Margin', '=IFERROR(SUM(' + rng('Profit') + ')/SUMIF(' + rng('Profit') + ',"<>",' + rng('Total') + '),"")', '0%'],
    ['Cars sold', '=SUM(' + rng('Qty') + ')', '#,##0'],
    ['Orders', '=COUNTUNIQUE(' + rng('Order ID') + ')', '#,##0'],
    ['Avg order', '=IFERROR(SUM(' + rng('Total') + ')/COUNTUNIQUE(' + rng('Order ID') + '),0)', '₹#,##0'],
    ['Cars in stock', '=SUM(' + inv('Qty') + ')', '#,##0'],
    ['Stock value (price)', '=SUMPRODUCT(' + inv('Price') + ',' + inv('Qty') + ')', '₹#,##0'],
    ['Stock value (cost)', '=SUMPRODUCT(' + inv('Cost') + ',' + inv('Qty') + ')', '₹#,##0'],
  ];
  kpis.forEach((k, n) => {
    sh.getRange(4, n + 1).setValue(k[0]).setFontColor('#777777');
    sh.getRange(5, n + 1).setFormula(k[1]).setNumberFormat(k[2]).setFontSize(14).setFontWeight('bold');
  });

  const q = (col, label) => '=IFERROR(QUERY(' + all + ',"select ' + S(col) + ', sum(' + S('Total') + '), sum(' + S('Qty') +
    ') where ' + S(col) + ' is not null and ' + S(col) + ' <> \'\' group by ' + S(col) + ' order by sum(' + S('Total') +
    ') desc label ' + S(col) + ' \'' + label + '\', sum(' + S('Total') + ') \'Revenue\', sum(' + S('Qty') + ') \'Cars\'",1),"No sales yet")';
  const blocks = [
    ['A', 'By revenue tag', q('Revenue Tag', 'Revenue tag')],
    ['E', 'By channel', q('Channel', 'Channel')],
    ['I', 'By brand', q('Brand', 'Brand')],
    ['M', 'By month', '=IFERROR(QUERY({ARRAYFORMULA(IF(' + rng('Date') + '="",,TEXT(' + rng('Date') + ',"yyyy-mm"))),' +
      rng('Total') + ',' + rng('Qty') + '},"select Col1, sum(Col2), sum(Col3) where Col1 is not null group by Col1 order by Col1 desc ' +
      'label Col1 \'Month\', sum(Col2) \'Revenue\', sum(Col3) \'Cars\'",0),"No sales yet")'],
    ['Q', 'Top buyers', '=IFERROR(QUERY(' + all + ',"select ' + S('Buyer') + ', count(' + S('Order ID') + '), sum(' + S('Total') +
      ') where ' + S('Buyer') + ' is not null and ' + S('Buyer') + ' <> \'\' group by ' + S('Buyer') + ' order by sum(' + S('Total') +
      ') desc limit 25 label ' + S('Buyer') + ' \'Buyer\', count(' + S('Order ID') + ') \'Lines\', sum(' + S('Total') + ') \'Revenue\'",1),"No sales yet")'],
  ];
  blocks.forEach(b => {
    sh.getRange(b[0] + '8').setValue(b[1]).setFontWeight('bold');
    sh.getRange(b[0] + '9').setFormula(b[2]);
  });
  sh.getRange('A9:T200').setNumberFormat('#,##0');
  ['B', 'F', 'J', 'N', 'S'].forEach(c => sh.getRange(c + '10:' + c + '200').setNumberFormat('₹#,##0'));
  sh.setFrozenRows(5);
}

/* ═════════════════════════════  TABLE HELPERS  ═════════════════════════════ */

function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }

function readTable_(name) {
  const sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('Missing "' + name + '" tab — run setup() in Apps Script.');
  const values = sh.getDataRange().getValues();
  const headers = (values.shift() || []).map(str_);
  const idx = {};
  headers.forEach((h, i) => { if (h && idx[h] == null) idx[h] = i; });
  const skip = {};
  FORMULA_COLS.forEach(h => { if (idx[h] != null) skip[idx[h]] = true; });
  const rows = values.map((v, i) => ({ row: i + 2, v: v }));
  return { sh: sh, headers: headers, idx: idx, rows: rows, skip: skip };
}

function get_(t, r, col) {
  const i = t.idx[col];
  return i == null || !r ? '' : (r.v[i] == null ? '' : r.v[i]);
}

function findRow_(t, col, val) {
  const want = str_(val).toLowerCase();
  if (!want) return null;
  for (let k = 0; k < t.rows.length; k++) {
    if (str_(get_(t, t.rows[k], col)).toLowerCase() === want) return t.rows[k];
  }
  return null;
}

/** Writes only the given columns (in contiguous runs), never touching formula columns. */
function writeObj_(t, rowNum, obj) {
  const cols = Object.keys(obj).filter(h => t.idx[h] != null && !t.skip[t.idx[h]])
    .map(h => ({ c: t.idx[h], v: cellVal_(obj[h]) })).sort((a, b) => a.c - b.c);
  let run = [];
  const flush = () => {
    if (!run.length) return;
    t.sh.getRange(rowNum, run[0].c + 1, 1, run.length).setValues([run.map(x => x.v)]);
    run = [];
  };
  cols.forEach(x => {
    if (run.length && x.c !== run[run.length - 1].c + 1) flush();
    run.push(x);
  });
  flush();
  const r = t.rows.find(rr => rr.row === rowNum);
  if (r) Object.keys(obj).forEach(h => { if (t.idx[h] != null) r.v[t.idx[h]] = obj[h]; });
}

function appendObj_(t, obj) {
  let last = 1;
  t.rows.forEach(r => {
    // FALSE = an untouched checkbox, not data
    if (r.v.some((v, i) => !t.skip[i] && v !== '' && v != null && v !== false)) last = Math.max(last, r.row);
  });
  const rowNum = last + 1;
  if (rowNum > t.sh.getMaxRows()) t.sh.insertRowsAfter(t.sh.getMaxRows(), 200);
  const blank = t.headers.map(() => '');
  const existing = t.rows.find(r => r.row === rowNum);
  if (!existing) t.rows.push({ row: rowNum, v: blank });
  // write every non-formula column so stale junk in that row is cleared
  const full = {};
  t.headers.forEach(h => { if (h) full[h] = obj[h] === undefined ? '' : obj[h]; });
  writeObj_(t, rowNum, full);
  return rowNum;
}

/** Sheets swallows a leading apostrophe and treats "=…" as a formula — escape both. */
function cellVal_(v) {
  if (typeof v === 'string' && /^['=+\-@]/.test(v)) return "'" + v;
  return v;
}

function maxIdNum_(t, col) {
  let max = 0;
  t.rows.forEach(r => {
    const m = str_(get_(t, r, col || 'ID')).match(/(\d+)\s*$/);
    if (m) max = Math.max(max, Number(m[1]));
  });
  return max;
}

function makeId_(brand, n) {
  const key = str_(brand).toLowerCase();
  const prefix = ID_PREFIX[key] ||
    key.replace(/[^a-z0-9 ]/g, '').split(/\s+/).filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 4) || 'DC';
  return prefix + '-' + pad_(n, 4);
}

/* ═════════════════════════════  CACHE / AUTH / MISC  ═════════════════════════════ */

function cachePut_(key, s) {
  try {
    const size = 40000;
    const n = Math.ceil(s.length / size);
    const obj = {};
    for (let i = 0; i < n; i++) obj[key + '_' + i] = s.substr(i * size, size);
    obj[key + '_n'] = String(n);
    CacheService.getScriptCache().putAll(obj, CFG.CACHE_TTL);
  } catch (e) { /* cache is best-effort */ }
}

function cacheGet_(key) {
  try {
    const cache = CacheService.getScriptCache();
    const n = Number(cache.get(key + '_n'));
    if (!n) return null;
    const keys = [];
    for (let i = 0; i < n; i++) keys.push(key + '_' + i);
    const got = cache.getAll(keys);
    let s = '';
    for (let i = 0; i < keys.length; i++) {
      if (got[keys[i]] == null) return null;
      s += got[keys[i]];
    }
    return s;
  } catch (e) { return null; }
}

function bustCache_() {
  try { CacheService.getScriptCache().remove(CFG.CACHE_KEY + '_n'); } catch (e) { /* ignore */ }
}

function checkKey_(key) {
  const real = prop_('ADMIN_KEY');
  if (!real) throw new Error('No admin key yet — run setup() in Apps Script.');
  const cache = CacheService.getScriptCache();
  const fails = Number(cache.get('auth_fails') || 0);
  if (fails >= 15) throw new Error('Too many wrong keys. Locked for 10 minutes.');
  if (String(key || '') === real) return true;
  cache.put('auth_fails', String(fails + 1), 600);
  return false;
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function fetchJson_(url, headers) {
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, headers: headers || {} });
  const code = res.getResponseCode();
  if (code >= 300) throw new Error('HTTP ' + code + ' from ' + url.split('?')[0]);
  return JSON.parse(res.getContentText());
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function prop_(k) { return PropertiesService.getScriptProperties().getProperty(k); }

function str_(v) {
  if (v == null) return '';
  if (v instanceof Date) return Utilities.formatDate(v, ss_().getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  return String(v).trim();
}

function num_(v) {
  if (v === '' || v == null) return null;
  if (typeof v === 'number') return isNaN(v) ? null : v;
  const s = String(v).replace(/[^0-9.\-]/g, '');
  if (!s) return null;
  const n = Number(s);
  return isNaN(n) ? null : n;
}

function ts_(v) { return v instanceof Date ? v.getTime() : (Date.parse(v) || 0); }
function truthy_(v) { return v === true || /^(true|yes|y|1|hide|hidden)$/i.test(str_(v)); }
function list_(v) { return str_(v).split(/\s*[,\n]\s*/).map(s => s.trim()).filter(Boolean); }
function photoList_(v) { return str_(v).split(/\s*[\n|]\s*/).map(s => s.trim()).filter(Boolean); }
function pad_(n, w) { return String(n).padStart(w, '0'); }
function camel_(s) { return s.toLowerCase().replace(/[^a-z0-9]+(.)/g, (m, c) => c.toUpperCase()); }
function clean_(s, max) { return str_(s).slice(0, max || 100).replace(/[\u0000-\u001f]/g, ' '); }
function errMsg_(e) { return String((e && e.message) || e); }

function colLetter_(i) {
  let s = '';
  i += 1;
  while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); }
  return s;
}

function randomKey_(len) {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function toast_(msg) { try { ss_().toast(msg, "SB's Garage", 5); } catch (e) { Logger.log(msg); } }
function alert_(title, msg) {
  try { const ui = SpreadsheetApp.getUi(); ui.alert(title, msg, ui.ButtonSet.OK); } catch (e) { Logger.log(title + ': ' + msg); }
}
