# SB's Garage — diecast store

A store for selling your Hot Wheels / Mini GT / Kaido House / Inno64 / Pop Race (any brand) collection.
**Cost to run: ₹0.** No server, no database to manage.

```
 Google Sheet  ◀──▶  Apps Script (backend API)  ◀──▶  Static site (store + admin)
 (your database)     backend/Code.gs                   site/  → Netlify / GitHub Pages
      ▲                     │
 you edit tags,             └─ photos saved to your Google Drive
 price, qty here               web photos pulled from Hot Wheels / Matchbox wiki (+ optional image search)
```

| Piece | What it does |
|---|---|
| `site/index.html` | The store. Search (by car maker, name, series, tag; understands *lambo, chevy, vw, JDM, STH*), filters with live counts (brand, type, car maker, condition, price, in-stock), sort (newest, rarest, price, name, brand), product page with photo gallery, cart → **order request** (buyer leaves name + phone/Instagram; you contact them). |
| `site/admin.html` | Your phone-friendly back office: add cars one by one or **bulk-upload a whole folder of photos** (AI reads each card), price drafts, record sales, convert website enquiries, stats. |
| `backend/Code.gs` | The API. Lives inside your Google Sheet. |

---

## Setup (≈10 minutes)

### 1. Backend (Google Sheet + Apps Script)
1. Open your Google Sheet (personal Gmail account) → **Extensions → Apps Script**.
2. Delete everything in `Code.gs`, paste the whole of `backend/Code.gs`, hit **Save**.
3. **Deploy → New deployment** (or *Manage deployments → ✏️ Edit → Version: New version* if you already have one)
   - Type: **Web app** · Execute as: **Me** · Who has access: **Anyone**
   - **Deploy** → allow the permissions (*Advanced → Go to project → Allow*) → copy the **Web app URL** (ends in `/exec`).
4. That's it. The first visit to your store **sets the sheet up by itself**: it creates the Inventory, Sales, Enquiries, Settings, Dashboard and **Admin** tabs. Your admin-panel key is in the **Admin** tab. Keep that tab private.

### 2. Site
1. Open `site/config.js` and paste the URL:
   ```js
   window.G64_CONFIG = { API_URL: 'https://script.google.com/macros/s/XXXX/exec' };
   ```
2. In the sheet's **Settings** tab set your store name, tagline, Instagram (optional), announcement bar and shipping note.
3. Host the `site` folder (pick one):
   - **Netlify Drop** (fastest): go to app.netlify.com/drop, drag the `site` folder in. Done. Add a custom domain later.
   - **GitHub Pages** (already set up for this repo): Settings → Pages → Branch `main`, folder `/ (root)`. Store: `https://bhatts-creator.github.io/sb-garage-diecast/`, admin: `…/site/admin.html`.
   - **Vercel**: `vercel deploy site`.
4. Open `https://your-site/admin.html`, paste the admin key, add your first car.

> Tip: leave `API_URL` empty to see the store in **demo mode** with sample cars.

---

## Daily workflow

**List a whole shelf at once (bulk upload)** → admin → *Add* → **Bulk upload**:
1. Select all the photos (from your phone gallery or laptop). Pick *1 photo = 1 car*, or *2 = 1 car* if you shot front + back of each card.
2. Optional defaults for the batch: brand, series, condition, tags, qty, even one price for all (e.g. ₹199 for a run of mainlines).
3. **Upload.** Each car becomes a row in the Inventory sheet with its photo. With AI on, it reads the card and fills **name, brand, car maker, series, year, colour, condition and TH / STH / Premium tags**. Your defaults always win over the AI.
4. Rows with no price are **drafts**: highlighted **yellow** in the sheet and *not* on the store. Fill Price + Qty in the sheet, or in admin → *Stock → Drafts* (type price → Enter → next car). The moment a row has a name and a price, it's live.

The **Review** column tells you what the AI was unsure about ("medium confidence · check the TH logo"). It's private, so clear it once you've checked.

**Add a car from your phone** → admin → *Add*: take photo → name, brand, price, qty (+ tags, car maker, series, year, colour, condition, your cost). Hit *Save*. The backend saves your photo to Drive and **auto-adds the top 3 web photos** (or tap *Find photos* and pick). Brand/series/condition stay filled for the next car so listing a whole series is fast.

**Bulk-add from the sheet** → type rows straight into *Inventory*. Each row gets an ID the moment it has a Name + Brand. Then select the rows → **🏁 SB's Garage → Fetch web photos for selected rows**.

**Change tags / price / qty** → just edit the Inventory sheet. The store picks it up on next load (menu **🏁 → Push sheet changes to the store now** if you're impatient). Tick **Hide** to pull a car without deleting it.

**Someone orders on the site** → they fill name + phone/Instagram (+ city, note) in the cart and get a **Ref (ENQ-0007)**. It lands in the *Enquiries* tab and admin → *Enquiries* with their contact. Call or DM them, agree price and shipping → **Convert to sale**.

**Sold on Instagram / a meet / anywhere** → admin → *Stock* → **Sell** (or *Sales → + Record sale* for multi-car orders). Fill buyer, channel, payment and a **Revenue tag**. Stock drops automatically, a row lands in *Sales* with profit. Typo? **Undo sale** puts the stock back.

**Revenue tagging** — the tag is free text with autocomplete. Use it like a UTM campaign: `Diwali drop`, `IG live 12 Nov`, `STH drop`, `Mumbai meet`, `Repeat buyer`. Admin → *Stats* and the sheet's *Dashboard* tab break revenue down by tag, channel, brand, car type, month and top buyers, plus repeat-buyer % and enquiry → sale conversion.

---

## The Inventory sheet

| Column | Notes |
|---|---|
| ID | Auto (`HW-0001`, `MGT-0002`, `KH-…`, `INNO-…`, `PR-…`). Don't edit. |
| Thumb | Auto image preview of the cover photo. Don't type here. |
| Name | `Nissan Skyline GT-R (R34)`. Names starting with an apostrophe need two in the sheet: `''95 Mazda RX-7` (the admin panel handles this for you). |
| Brand | Hot Wheels, Mini GT, Kaido House, Inno64, Pop Race, Matchbox, Tarmac Works… |
| Manufacturer | The car maker — Nissan, Porsche… (searchable + filter on the store) |
| Series, Year, Color, Condition | Shown on the product page; Condition is a filter. |
| Tags | Comma separated. Styled + filterable: **Mainline, TH, STH, Team Transport, Premium, Silver Series, Pack of 5, Rare, Chase, RLC**. Anything else (e.g. `Boulevard`) works as a plain tag. Typos like `super treasure hunt`, `5 pack`, `tt` are normalised. |
| Price, Compare At | Compare At shows a strikethrough + % off. |
| Qty | 0 = shows as **SOLD** (or hidden — Settings → Show Sold Out = No). |
| Cost | Private. Used for profit. Never sent to the website. |
| Hide | Tick to hide from the store. |
| Notes | Shown on the product page (card condition, blister, etc). |
| Photo, Web Photos | Drive file IDs or any image URLs (one per line). Managed by the admin panel. |
| Added On | Auto. |
| Review | Private notes from the AI / bulk upload. Clear once checked. |

**Drafts:** any row with an ID but no Name or no Price is highlighted yellow and stays off the store.

---

## AI identify — free (optional, recommended for bulk)

**Free option: Google Gemini.** No credits or billing.
1. Go to **aistudio.google.com** → sign in with your Google account → accept the terms → **Get API key** (left menu) → **Create API key** → pick or create a project → copy the key (starts with `AIza…`). Don't add billing.
2. Apps Script → **Project Settings ⚙ → Script properties → Add**: `GEMINI_API_KEY` = that key.
3. Reload the admin panel. The ✨ options appear in *Bulk upload*, as **✨ Fill details from photo** on the one-car form, and as **✨ Identify** on each draft.

Free-tier notes:
- The free tier allows only a few requests a minute and a daily cap (Google changes the numbers; check AI Studio). Bulk upload goes one car at a time with AI on, and waits and retries when it gets rate-limited.
- If the daily cap is hit, uploads still finish as drafts with your photo. Tap **✨ Identify** on those drafts the next day.
- Uses the `gemini-flash-latest` model alias. Override with a `GEMINI_MODEL` script property if Google renames it.
- On the free tier Google may use what you send to improve its products. These are toy-car photos, but worth knowing.

**Paid alternative: Claude** (better at small card print, ≈ ₹2–3 per car with credits loaded): set `ANTHROPIC_API_KEY` instead, from console.anthropic.com. Optional `CLAUDE_MODEL`. If you set both keys, add `AI_PROVIDER` = `gemini` or `claude` to pick one (Gemini is used by default).

Without any key, a draft takes its name from the file name if it isn't a camera name (`Datsun 510 Kaido.jpg` → "Datsun 510 Kaido"; `IMG_2041.jpg` → blank).

---

## Web photos

- **Hot Wheels & Matchbox**: pulled from the fan wikis (free, no key). Photos whose filename matches your year / colour / series rank first.
- **Mini GT, Kaido House, Inno64, Pop Race, others**: need an image-search key. Get a free key from **SerpAPI** (Google Images) or **Brave Search API**, then in Apps Script → **Project Settings → Script properties** add `SERPAPI_KEY` or `BRAVE_API_KEY`.
- Picked photos are **copied into your Drive**, so they never break. Your own photo always stays the cover; reorder/remove photos from admin → *Stock → Edit*.
- Wiki photos are fan-shot, CC-BY-SA licensed; your own photo of the exact piece is still what buyers trust most.

---

## Growth tricks baked in

- **Shareable filtered links** — every filter/search is in the URL. Post `your-site/?tag=STH`, `?brand=Mini+GT`, `?q=jdm&stock=1`, `?sort=rarity` in stories/bios.
- **Deep link per car** — `your-site/?item=HW-0012` opens that car directly. The *Share* button on each car does this.
- **Announcement bar** (Settings tab) for drop timings / offers.
- **NEW** ribbon for cars added in the last 7 days (Settings → New Badge Days), **–% off** badge from Compare At, **SOLD** stamps as social proof, "Last one" urgency.
- **Ref IDs** on every order request → you know which buyers came from the site.

---

## Updating / maintenance

- **Changed `Code.gs`?** Deploy → **Manage deployments → ✏️ → Version: New version → Deploy**. Same URL, nothing to change on the site.
- **Changed the site?** Re-drag the folder to Netlify / push to GitHub.
- **Something off in the sheet tabs?** 🏁 SB's Garage → **Setup / repair sheets** (safe to re-run; it never deletes data). Also run it after pasting a newer `Code.gs`, to add new columns (e.g. *Review*) and the yellow draft highlight.
- **Locked out of admin** after 15 wrong keys → wait 10 minutes. **Not sure what's broken?** Open `your-site/site/check.html`: it tests each step and tells you the fix.

**Limits** (Google's free quotas, plenty for a personal store): ~20k web fetches/day, ~30 simultaneous requests. The catalog is cached for speed, so traffic spikes from an Instagram post are fine.

---

## Files

```
backend/Code.gs       Apps Script backend (paste into the Sheet's Apps Script editor)
site/index.html       store
site/admin.html       admin panel (noindex)
site/config.js        ← your Apps Script URL goes here
site/css/             base.css (tokens/components) · store.css · admin.css
site/js/common.js     shared helpers: API, tags, brand/maker normalisation, images
site/js/store.js      store logic
site/js/admin.js      admin logic
site/js/demo-data.js  sample cars for demo mode (safe to delete)
```
