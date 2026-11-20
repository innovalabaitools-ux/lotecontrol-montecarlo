# Inventario como hoja de celdas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the LoteControl Inventario view into a Montecarlo-styled spreadsheet with columns Manzana · Lote · Estado · Área · Precio · Asesor · Fecha de venta · Anotaciones · Recibos, plus an "asesor" field on the Separar/Vender forms.

**Architecture:** Everything lives in the single-page app `software-lotes/index.html` (classic `<script>`, global `S` state, `Store` persistence, `render()` → `viewHTML()` → `tablaHTML(L)`). New lot fields `asesor` (string) and `nota` (string ≤ 300) are stored on the lot document like any other field, so they sync through the existing `Store.mutateLote` path. Tests are plain Node + Playwright scripts against a local static server.

**Tech Stack:** HTML/CSS/vanilla JS; Playwright (`@playwright/test` installed at the repo root `C:/Users/Mayerli/Downloads/WeAreNoCode-YouTube-Editor-Skill/node_modules`) driven from Node scripts; Python `http.server` to serve the folder.

**Spec:** `software-lotes/docs/superpowers/specs/2026-11-20-inventario-hoja-design.md`

## Global Constraints

- Column order exactly: Manzana · Lote · Estado · Área m² · Precio · Asesor · Fecha venta · Anotaciones · Recibos.
- Removed from Inventario: ubicación, cliente, pagado, saldo, vencido (they stay in Cartera and in "Copiar a Excel").
- Asesor and fecha de venta are read-only in the sheet; only the Anotaciones cell is editable.
- Nota max length: 300 characters.
- PC only; at 1366×768 the page must not scroll horizontally (the sheet may scroll inside its own panel).
- Every write goes through `Store.mutateLote(id, fn)`; editing is disabled when `!S.canWrite`.
- All on-screen text in Spanish, Montecarlo palette (charcoal / bronze `#8c7764`, `#b59f88`, `#ecd9b6`).
- Not a git repository: "commit" steps are replaced by copying `index.html` to the scratchpad publish folder only at the very end (Task 5).

## Review Focus

1. Editing a note and pressing Escape must discard the change, not close the drawer or wipe the note (global Escape handler at the `keydown` listener near `focusLote`).
2. A re-render triggered by a sync (`onSnapshot`/`Local.emit`) while a note cell is focused must not lose what the secretary is typing.
3. Notes or asesor names containing `<`, `"` or `&` must render as text (use `esc()`), never as HTML.
4. A lot that is "vendido según el plano" (no `venta`, no `pagos`) must show "—" in Asesor, Fecha venta and Recibos without errors.
5. Clicking inside the Anotaciones cell or the "Ver (n)" button must not open the lot drawer (row click handler in `bindView`).

---

### Task 1: Test harness

**Files:**
- Create: `software-lotes/tests/run.js` (starts nothing; assumes the server is up)
- Create: `software-lotes/tests/inventario-hoja.test.js`

**Interfaces:**
- Produces: `tests/run.js` exporting `async function abrir(viewport?) -> {browser, page, errs}` (launches Chromium with `--enable-unsafe-swiftshader`, opens `http://127.0.0.1:8765/index.html`, waits for `window.P3 && #v3d canvas`, collects `pageerror` into `errs`) and `check(nombre, condicion, extra?)` that prints `OK`/`FALLA` and counts; `fin()` prints totals and exits with code 1 if any FALLA.
- Server command used by every task: `python -m http.server 8765 --bind 127.0.0.1` run from `software-lotes/` (background).

- [ ] **Step 1:** Write `tests/inventario-hoja.test.js` with the first assertion only: after `page.click('#nav [data-view="tabla"]')`, the header cells of `.hoja` read exactly `['Manzana','Lote','Estado','Área m²','Precio','Asesor','Fecha venta','Anotaciones','Recibos']`.
- [ ] **Step 2:** Run `node tests/inventario-hoja.test.js` from `software-lotes/` with the server up. Expected: `FALLA` (no `.hoja` yet), exit code 1.

### Task 2: Asesor field on Separar and Vender

**Files:**
- Modify: `software-lotes/index.html` — `accion()` branches `separar` and `vender`, `clienteFields`/new helper near line 1440, `hist` messages.

**Interfaces:**
- Produces: lot field `asesor: string` ('' when unknown); helper `asesoresUsados(): string[]` (unique, sorted with `localeCompare('es')`, from `Object.values(S.lotes).map(l=>l.asesor)`); helper `asesorField(valor: string): string` returning `<label class="full">Asesor que atiende<input name="asesor" list="dlAsesores" autocomplete="off" maxlength="60" value="…"><datalist id="dlAsesores">…</datalist></label>`.

- [ ] **Step 1: Failing tests** (append to `inventario-hoja.test.js`):
  - Separar a disponible lot with `asesor = 'Carlos Gómez'` → `S.lotes[id].asesor === 'Carlos Gómez'`.
  - Open Vender on that same (now separado) lot → `input[name=asesor]` value is `'Carlos Gómez'` (precargado).
  - Separar a second lot and type `'Car'` → `#dlAsesores option` values include `'Carlos Gómez'`.
  - Asesor `'<b>x</b>'` saved and later shown in the sheet as literal text (Review Focus 3; asserted in Task 3).
- [ ] **Step 2:** Run; expected FALLA on the asesor assertions.
- [ ] **Step 3:** Add `asesorField(l.asesor||'')` right after `${clienteFields(…)}` in both forms; in both `operar` callbacks set `x.asesor = (d.asesor||'').trim()`. The field is optional (no `required`).
- [ ] **Step 4:** Run; expected OK for Task 2 assertions, no page errors.

### Task 3: The sheet (`tablaHTML`) and its styles

**Files:**
- Modify: `software-lotes/index.html` — `tablaHTML(L)` (~line 1110), CSS block near `.bar-top` (~line 304), `bindView()` row click (~line 1275), `copiarCSV()` (~line 1381), `qMatch` free-text haystack (~line 832), `toolbarHTML` (~line 930) for the Asesor filter, `matches()` for `S.asesor`, `filtrosActivos`/`limpiarTodo`.

**Interfaces:**
- Consumes: `asesoresUsados()` from Task 2.
- Produces: markup `<div class="hoja-wrap"><table class="hoja">…<tr data-id="{id}">…<td class="nota" data-nota="{id}" contenteditable="{S.canWrite}">…</td><td><button class="btn sm" data-recibos="{id}">Ver (n)</button></td></tr>`; sort keys `mz`, `lote`, `estado`, `area`, `precio`, `asesor`, `fecha`; state `S.asesor` ('' = all).

- [ ] **Step 1: Failing tests:**
  - Header text exactly as in Task 1.
  - Row for `Mz 1 · Lote 05`: cells 0..4 = `'Mz 1'`, `'05'`, contains `'Vendido'`, `'324,95'`, `'$100.000.000'`; Asesor, Fecha venta and Recibos = `'—'` (Review Focus 4).
  - Separated lot from Task 2: Fecha venta cell matches `/^Sep\. \d\d\/\d\d\/\d{4}$/`; Recibos button text `'Ver (1)'`.
  - Asesor `'<b>x</b>'` cell `innerText === '<b>x</b>'` (Review Focus 3).
  - Search `#q = 'carlos'` → only rows with asesor Carlos Gómez.
  - Asesor filter select set to `'Carlos Gómez'` → same rows; `Limpiar` resets it.
  - At 1366×768: `document.documentElement.scrollWidth <= clientWidth`.
  - Sort by Asesor header → first row asesor `'Carlos Gómez'` (non-empty values first).
  - "Copiar para Excel" text (read via `page.evaluate(()=>navigator.clipboard.readText())` with clipboard permissions) has header containing `Asesor`, `Fecha venta`, `Anotaciones`.
- [ ] **Step 2:** Run; expected FALLA.
- [ ] **Step 3:** Rewrite `tablaHTML` with the columns above. Precio = `l.venta ? fmt(l.venta.precioFinal) : fmtP(l)`; Fecha venta = `l.venta ? fDate(l.venta.fecha) : l.separacion ? 'Sep. '+fDate(l.separacion.fecha) : '—'` (separation shown in `.muted`); Recibos = `(l.pagos||[]).length ? 'Ver (n)' : '—'`. Keep `.bar-top`, "Mostrar más/todos", `vacioHTML`, `S.sinPlan` tag. Styles: bordered cells (`border-right` + `border-bottom` 1px `var(--line)`), sticky `thead th`, zebra `tbody tr:nth-child(even)`, active row (`S.sel`) outlined bronze, numeric cells right-aligned tabular-nums, `.hoja-wrap{overflow:auto;max-height:var(--vh-plano)}`.
- [ ] **Step 4:** Add `S.asesor` select in `toolbarHTML` only when `S.view==='tabla'` (options from `asesoresUsados()`), filter in `matches()`, include in `filtrosActivos` and reset in `limpiarTodo`. Add `l.asesor` and `l.nota` to the `qMatch` haystack. Add Asesor, Fecha venta, Anotaciones columns to `copiarCSV`.
- [ ] **Step 5:** Row click ignores clicks inside `.nota` and `button` (Review Focus 5).
- [ ] **Step 6:** Run; expected all Task 3 assertions OK, no page errors.

### Task 4: Editable notes and receipts window

**Files:**
- Modify: `software-lotes/index.html` — `bindView()`, global `keydown` Escape handler, `render()` focus preservation, new `verRecibosLote(id)` next to `verRecibo`.

**Interfaces:**
- Consumes: `.nota[data-nota]`, `[data-recibos]` from Task 3; existing `verRecibo(l, p)`.
- Produces: `async function guardarNota(id: string, texto: string): Promise<void>` (trims, cuts to 300, no-op if unchanged, `Store.mutateLote(id, x => { x.nota = texto; })`, toast `'Nota guardada'`); `function verRecibosLote(id: string): void` (modal "Recibos · {loteName}" with table N° · Fecha · Valor · Concepto · Medio, newest first; each row button opens `verRecibo`).

- [ ] **Step 1: Failing tests:**
  - Click a `.nota` cell, type `'Llamar el viernes'`, press Tab → `S.lotes[id].nota === 'Llamar el viernes'`, drawer not opened (`S.sel` unchanged).
  - Type 350 chars → saved length 300.
  - Edit, then press Escape → nota unchanged and drawer state unchanged (Review Focus 1).
  - While a nota is focused with unsaved text, call `render()` from `page.evaluate` → focused cell still contains the typed text (Review Focus 2).
  - Search `#q = 'viernes'` finds that lot.
  - Click `Ver (1)` → modal title contains `'Recibos'` and one row `N° 000001`; clicking it opens `.recibo`.
  - With `S.canWrite = false` and re-render, `.nota` has `contenteditable="false"`.
- [ ] **Step 2:** Run; expected FALLA.
- [ ] **Step 3:** Implement `guardarNota` on `blur` and on `Enter` (Enter = save + blur; Shift+Enter not allowed); Escape restores the original text and blurs; the global Escape handler ignores events from `.nota`. In `render()`, if the active element is a `.nota`, remember `{id, text, caret at end}` and restore it after re-render (same pattern as `qFocus`).
- [ ] **Step 4:** Implement `verRecibosLote` and bind `[data-recibos]`.
- [ ] **Step 5:** Run; expected all assertions OK, no page errors.

### Task 5: Regression, visual check and publish

**Files:**
- No code changes expected; fixes go back to the owning task.

- [ ] **Step 1:** Run `node tests/inventario-hoja.test.js` and the existing regression script `C:\Users\Mayerli\AppData\Local\Temp\claude\bc43983599a8cd00\c74b214f-a442-486e-9ca3-0cce180c123b\scratchpad\ux\verify.js` (update its `tbody tr` / area-column selectors to the new sheet if they fail only because of the new markup). Expected: all OK, `0 fallas`.
- [ ] **Step 2:** Screenshot Inventario at 1366×768 and 1920×1080 and look at it: cells aligned, header sticky, no clipped text without "…".
- [ ] **Step 3:** Copy `index.html` to the scratchpad `pub\index.html` and republish the artifact `2e1f99d7-7713-4496-9685-3cca4a6a495f` with `publish_files` (read the live version first with `get_artifact` and pass it as `base_version`).
