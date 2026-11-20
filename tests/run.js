// Utilidades de prueba: abre la app servida en http://127.0.0.1:8765 con Playwright
// Servidor: desde software-lotes/  →  python -m http.server 8765 --bind 127.0.0.1
const { chromium } = require('@playwright/test');
let ok = 0, bad = 0;
function check(nombre, cond, extra = '') { cond ? ok++ : bad++; console.log((cond ? 'OK    ' : 'FALLA ') + nombre + (extra ? '  ' + extra : '')); }
async function abrir(viewport = { width: 1366, height: 768 }) {
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport, locale: 'es-CO' });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:8765' });
  const page = await ctx.newPage(); page.setDefaultTimeout(15000);
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto('http://127.0.0.1:8765/index.html?local=1');
  await page.waitForFunction(() => window.P3 && document.querySelector('#v3d canvas'), null, { timeout: 60000 });
  return { browser, page, errs };
}
function fin() { console.log(`\n${ok} OK, ${bad} fallas`); process.exitCode = bad ? 1 : 0; }
// intenta un bloque y lo cuenta como falla si lanza error
async function paso(nombre, fn) { try { await fn(); } catch (e) { check(nombre, false, 'error: ' + e.message.split('\n')[0]); } }
module.exports = { abrir, check, fin, paso };
