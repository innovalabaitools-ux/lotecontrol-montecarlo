// Movimiento (skill ux-motion): avisos, ventanas, panel, 3D, reducir movimiento y hoja grande
const { abrir, check, fin, paso } = require('./run');
const hayRegla = (page, re) => page.evaluate(src => { const r = new RegExp(src); for (const sh of document.styleSheets) { let rules; try { rules = sh.cssRules; } catch (e) { continue; } const walk = rs => [...rs].some(x => r.test(x.cssText) || (x.cssRules && walk(x.cssRules))); if (walk(rules)) return true; } return false; }, re.source);

(async () => {
  const { browser, page, errs } = await abrir();

  // 1. avisos apilados
  await paso('avisos', async () => {
    await page.evaluate(() => { toast('Primer aviso'); toast('Segundo aviso'); });
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => [...document.querySelectorAll('.toast')].map(t => { const b = t.getBoundingClientRect(); return [b.top, b.bottom]; }));
    check('dos avisos no se tapan', r.length === 2 && (r[0][1] <= r[1][0] + 1 || r[1][1] <= r[0][0] + 1), JSON.stringify(r));
    check('el aviso entra con animación', await hayRegla(page, /\.toast[^{]*\{[^}]*animation/));
  });

  // 5. botones al presionar
  await paso('botones', async () => check('los botones se hunden al presionar', await hayRegla(page, /\.btn:active[^{]*\{[^}]*scale\(0?\.9/)));

  // 7. ventanas con entrada y salida
  await paso('ventanas', async () => {
    await page.evaluate(() => modalAjustes()); await page.waitForTimeout(50);
    check('la ventana entra con animación', await page.evaluate(() => getComputedStyle(document.querySelector('.ov .modal')).animationName !== 'none'));
    await page.evaluate(() => cerrarModal());
    const durante = await page.evaluate(() => !!document.querySelector('.ov.cerrando'));
    await page.waitForTimeout(250);
    check('la ventana sale con animación corta y luego se quita', durante && await page.evaluate(() => !document.querySelector('.ov')));
  });

  // 8. panel lateral con salida
  await paso('panel', async () => {
    const id = await page.evaluate(() => lotesArr().find(l => l.estado === 'disponible').id);
    await page.evaluate(id => selectLote(id), id); await page.waitForTimeout(400);
    await page.click('#drawer [data-act="separar"]'); await page.waitForTimeout(400);
    await page.evaluate(() => cerrarModal());
    const durante = await page.evaluate(() => !!document.querySelector('.sheet.cerrando'));
    await page.waitForTimeout(250);
    check('el panel sale hacia la derecha y luego se quita', durante && await page.evaluate(() => !document.querySelector('.sheet')));
    await page.evaluate(() => { S.sel = null; render(); });
  });

  // 2. vuelo de cámara según distancia
  await paso('vuelos', async () => {
    const ids = await page.evaluate(() => { const d = lotesArr().filter(l => l.estado === 'disponible'); return [d[0].id, d[1].id, d[d.length - 1].id]; });
    await page.evaluate(id => { P3.flyToLot(id); P3.finish(); }, ids[0]);
    await page.evaluate(id => P3.flyToLot(id), ids[1]); const cerca = await page.evaluate(() => P3.ultimoVuelo());
    await page.evaluate(() => P3.finish());
    await page.evaluate(id => P3.flyToLot(id), ids[2]); const lejos = await page.evaluate(() => P3.ultimoVuelo());
    await page.evaluate(() => P3.finish());
    check('vuelo a un lote cercano es corto', cerca >= 400 && cerca <= 500, cerca);
    check('vuelo largo no pasa de 700 ms', lejos > cerca && lejos <= 700, lejos);
  });

  // 3. nota con ✓ en vez de aviso
  await paso('nota', async () => {
    await page.evaluate(() => { S.view = 'tabla'; render(); });
    const id = await page.evaluate(() => document.querySelector('.hoja td.nota').dataset.nota);
    await page.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove()));
    await page.click(`.nota[data-nota="${id}"]`); await page.keyboard.insertText('Prueba de movimiento'); await page.keyboard.press('Tab'); await page.waitForTimeout(400);
    check('guardar nota no muestra aviso', await page.evaluate(() => !document.querySelector('.toast')));
    check('guardar nota muestra ✓ en la celda', await page.evaluate(id => !!document.querySelector(`.nota[data-nota="${id}"].guardada`), id));
  });

  // 9. hoja grande: solo las filas visibles
  await paso('hoja grande', async () => {
    await page.evaluate(() => { S.view = 'tabla'; S.tablaMax = Infinity; });
    const t = await page.evaluate(() => { const t0 = performance.now(); render(); return Math.round(performance.now() - t0); });
    const filas = await page.evaluate(() => document.querySelectorAll('.hoja tbody tr[data-id]').length);
    check('mostrar todos dibuja en menos de 200 ms', t < 200, t + ' ms');
    check('solo se dibujan las filas visibles', filas > 10 && filas < 200, filas);
    check('el total sigue siendo 2.291', /2\.291 lotes/.test(await page.innerText('.bar-top')));
    await page.evaluate(() => { const w = document.querySelector('.hoja-wrap'); w.scrollTop = w.scrollHeight; w.dispatchEvent(new Event('scroll')); });
    await page.waitForTimeout(300);
    const ult = await page.evaluate(() => { const rs = [...document.querySelectorAll('.hoja tbody tr[data-id]')]; return rs[rs.length - 1]?.dataset.id; });
    const esperado = await page.evaluate(() => { const L = lotesArr(); return L[L.length - 1].id; });
    check('al bajar hasta el final aparece el último lote', ult === esperado, `${ult} vs ${esperado}`);
    await page.evaluate(() => { S.tablaMax = 400; render(); });
  });
  await browser.close();

  // 4. reducir movimiento
  await paso('reducir movimiento', async () => {
    const { chromium } = require('@playwright/test');
    const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
    const p = await (await b.newContext({ viewport: { width: 1366, height: 768 }, reducedMotion: 'reduce' })).newPage();
    await p.goto('http://127.0.0.1:8765/index.html?local=1');
    await p.waitForFunction(() => window.P3 && document.querySelector('#v3d canvas'), null, { timeout: 60000 });
    await p.evaluate(() => { modalAjustes(); toast('x'); });
    const d = await p.evaluate(() => ['.ov .modal', '.toast'].map(s => parseFloat(getComputedStyle(document.querySelector(s)).animationDuration) || 0));
    check('con reducir movimiento, ventanas y avisos casi no se mueven', d.every(x => x <= 0.01), JSON.stringify(d));
    const id = await p.evaluate(() => lotesArr().find(l => l.estado === 'disponible').id);
    await p.evaluate(id => P3.pulse(id), id);
    check('con reducir movimiento, la onda no crece', await p.evaluate(() => P3.ondaEscala ? P3.ondaEscala() <= 1.01 : false));
    await b.close();
  });

  check('sin errores de página', errs.length === 0, errs.join(' | '));
  fin();
})();
