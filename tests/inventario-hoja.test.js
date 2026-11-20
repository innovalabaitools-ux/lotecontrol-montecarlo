// Inventario como hoja de celdas — ver docs/superpowers/plans/2026-11-20-inventario-hoja.md
const { abrir, check, fin, paso } = require('./run');
const HEAD = ['Manzana', 'Lote', 'Estado', 'Área m²', 'Precio', 'Asesor', 'Fecha venta', 'Anotaciones', 'Recibos'];

(async () => {
  const { browser, page, errs } = await abrir();
  const celdas = id => page.evaluate(id => [...document.querySelectorAll(`.hoja tr[data-id="${CSS.escape(id)}"] td`)].map(td => td.innerText.trim()), id);
  const verTabla = async () => { await page.evaluate(() => { S.view = 'tabla'; S.sel = null; render(); }); await page.waitForTimeout(300); };
  const separar = async (id, asesor, antes) => {
    await page.evaluate(id => selectLote(id), id); await page.waitForTimeout(400);
    await page.click('#drawer [data-act="separar"]'); await page.waitForTimeout(300);
    await page.fill('.sheet input[name=nombre]', 'Cliente Prueba'); await page.fill('.sheet input[name=cedula]', '1234567'); await page.fill('.sheet input[name=telefono]', '3001234567');
    if (antes) await antes();
    await page.fill('.sheet input[name=asesor]', asesor);
    await page.click('.sheet [type=submit]'); await page.waitForSelector('.recibo'); await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  };
  const [A, B] = await page.evaluate(() => { const d = lotesArr().filter(l => l.estado === 'disponible'); return [d[40].id, d[41].id]; });

  // ---- Task 1: encabezados ----
  await verTabla();
  await paso('encabezados', async () => {
    const h = await page.evaluate(() => [...document.querySelectorAll('.hoja thead th')].map(t => t.textContent.replace(/[↑↓]/g, '').trim()));
    check('encabezados en orden', JSON.stringify(h) === JSON.stringify(HEAD), JSON.stringify(h));
  });

  // ---- Task 2: asesor en formularios ----
  await paso('separar con asesor', async () => {
    await separar(A, 'Carlos Gómez');
    check('separar guarda asesor', await page.evaluate(id => S.lotes[id].asesor, A) === 'Carlos Gómez');
    check('historial menciona al asesor', await page.evaluate(id => S.lotes[id].historial.some(h => /Carlos Gómez/.test(h.accion)), A));
  });
  await paso('vender precarga asesor', async () => {
    await page.evaluate(id => selectLote(id), A); await page.waitForTimeout(400);
    await page.click('#drawer [data-act="vender"]'); await page.waitForTimeout(300);
    check('vender precarga asesor', await page.inputValue('.sheet input[name=asesor]') === 'Carlos Gómez');
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  });
  await paso('autocompletado', async () => {
    await separar(B, '<b>x</b>', async () => {
      const ops = await page.evaluate(() => [...document.querySelectorAll('#dlAsesores option')].map(o => o.value));
      check('autocompletado ofrece asesores usados', ops.includes('Carlos Gómez'), JSON.stringify(ops));
    });
  });

  // ---- Task 3: la hoja ----
  await verTabla();
  await paso('fila vendida según plano', async () => {
    const c = await celdas('montecarlo-1-5');
    check('fila Mz 1 · Lote 05', c[0] === 'Mz 1' && c[1] === '05' && /Vendido/.test(c[2]) && c[3] === '324,95' && c[4] === '$100.000.000', JSON.stringify(c));
    check('sin datos de venta muestra —', c[5] === '—' && c[6] === '—' && c[8] === '—', JSON.stringify(c.slice(5)));
  });
  await paso('fila separada', async () => {
    const c = await celdas(A);
    check('fecha de separación', /^Sep\. \d\d\/\d\d\/\d{4}$/.test(c[6]), c[6]);
    check('botón Ver (1)', c[8] === 'Ver (1)', c[8]);
  });
  await paso('asesor como texto', async () => { const c = await celdas(B); check('asesor con < > se muestra como texto', c[5] === '<b>x</b>', c[5]); });
  await paso('buscar asesor', async () => {
    await page.fill('#q', 'carlos'); await page.waitForTimeout(500); await page.keyboard.press('Escape');
    const as = await page.evaluate(() => [...document.querySelectorAll('.hoja tbody tr[data-id]')].map(tr => tr.children[5].innerText.trim()));
    check('buscador encuentra por asesor', as.length >= 1 && as.every(a => a === 'Carlos Gómez'), JSON.stringify(as));
    await page.fill('#q', ''); await page.waitForTimeout(400);
  });
  await paso('filtro asesor', async () => {
    await page.selectOption('#fAsesor', 'Carlos Gómez'); await page.waitForTimeout(400);
    const as = await page.evaluate(() => [...document.querySelectorAll('.hoja tbody tr[data-id]')].map(tr => tr.children[5].innerText.trim()));
    check('filtro por asesor', as.length >= 1 && as.every(a => a === 'Carlos Gómez'), JSON.stringify(as));
    await page.click('#limpiar'); await page.waitForTimeout(400);
    check('Limpiar quita el filtro de asesor', await page.evaluate(() => !S.asesor));
  });
  await paso('sin scroll horizontal', async () => check('sin scroll horizontal a 1366', await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)));
  await paso('ordenar por asesor', async () => {
    await page.click('.hoja th[data-sort="asesor"]'); await page.waitForTimeout(400);
    const first = await page.evaluate(() => document.querySelector('.hoja tbody tr[data-id]').children[5].innerText.trim());
    check('ordenar por asesor pone primero los que tienen asesor', first !== '—', first);
  });
  await paso('copiar a excel', async () => {
    await page.click('#copyCsv'); await page.waitForTimeout(400);
    const txt = await page.evaluate(() => navigator.clipboard.readText());
    const h = txt.split('\n')[0];
    check('Copiar a Excel incluye columnas nuevas', /Asesor/.test(h) && /Fecha venta/.test(h) && /Anotaciones/.test(h), h);
  });

  // ---- Task 4: notas y recibos ----
  await verTabla();
  const nota = `.nota[data-nota="${A}"]`;
  await paso('editar nota', async () => {
    await page.click(nota); await page.keyboard.insertText('Llamar el viernes'); await page.keyboard.press('Tab'); await page.waitForTimeout(500);
    check('nota se guarda al salir', await page.evaluate(id => S.lotes[id].nota, A) === 'Llamar el viernes');
    check('clic en la nota no abre la ficha', await page.evaluate(() => S.sel) == null);
  });
  await paso('nota larga', async () => {
    const otro = `.nota[data-nota="${B}"]`;
    await page.click(otro); await page.keyboard.insertText('x'.repeat(350)); await page.keyboard.press('Enter'); await page.waitForTimeout(500);
    check('nota se recorta a 300', await page.evaluate(id => (S.lotes[id].nota || '').length, B) === 300);
  });
  await paso('escape descarta', async () => {
    await page.click(nota); await page.keyboard.insertText(' zzz'); await page.keyboard.press('Escape'); await page.waitForTimeout(400);
    check('Escape descarta la edición', await page.evaluate(id => S.lotes[id].nota, A) === 'Llamar el viernes' && (await page.innerText(nota)).trim() === 'Llamar el viernes');
    check('Escape no abre ni cierra la ficha', await page.evaluate(() => S.sel) == null);
  });
  await paso('re-render conserva lo escrito', async () => {
    await page.click(nota); await page.keyboard.press('End'); await page.keyboard.insertText(' extra');
    await page.evaluate(() => render()); await page.waitForTimeout(200);
    const r = await page.evaluate(() => ({ t: (document.activeElement?.innerText||'').slice(-60), foco: document.activeElement?.classList.contains('nota') }));
    check('un re-render no borra lo que se escribe', r.foco && /extra$/.test(r.t.trim()), JSON.stringify(r));
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  });
  await paso('buscar nota', async () => {
    await page.fill('#q', 'viernes'); await page.waitForTimeout(500); await page.keyboard.press('Escape');
    const ids = await page.evaluate(() => [...document.querySelectorAll('.hoja tbody tr[data-id]')].map(tr => tr.dataset.id));
    check('buscador encuentra por nota', ids.includes(A), JSON.stringify(ids.slice(0, 5)));
    await page.fill('#q', ''); await page.waitForTimeout(400);
  });
  await paso('ventana de recibos', async () => {
    await page.click(`[data-recibos="${A}"]`); await page.waitForTimeout(400);
    const t = await page.innerText('.ov .t-title');
    const filas = await page.evaluate(() => document.querySelectorAll('.ov [data-ver-recibo]').length);
    check('ventana de recibos del lote', /recibos/i.test(t) && filas === 1, `${t} · ${filas}`);
    check('clic en el botón no abre la ficha', await page.evaluate(() => S.sel) == null);
    await page.click('.ov [data-ver-recibo]'); await page.waitForTimeout(400);
    check('abre el recibo completo', await page.locator('.recibo').count() === 1);
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  });
  await paso('solo lectura', async () => {
    await page.evaluate(() => { S.canWrite = false; render(); });
    check('sin permiso la nota no es editable', await page.getAttribute(nota, 'contenteditable') === 'false');
    await page.evaluate(() => { S.canWrite = true; render(); });
  });

  // ---- Revisión final: no perder lo que se escribe ----
  const C = await page.evaluate(() => lotesArr().filter(l => l.estado === 'disponible')[60].id);
  const notaC = `.nota[data-nota="${C}"]`;
  await verTabla();
  await paso('error en render no bloquea notas', async () => {
    await page.evaluate(() => { const o = window.bindView; window.bindView = () => { window.bindView = o; throw new Error('falla simulada'); }; try { render(); } catch (e) { } render(); });
    await page.click(notaC); await page.keyboard.insertText('Tras error'); await page.keyboard.press('Tab'); await page.waitForTimeout(500);
    check('tras un error de render las notas se siguen guardando', await page.evaluate(id => S.lotes[id].nota, C) === 'Tras error');
  });
  await paso('fila que desaparece guarda la nota', async () => {
    await verTabla();
    await page.click(notaC); await page.keyboard.press('End'); await page.keyboard.insertText(' y más');
    await page.evaluate(id => { S.ocultos.add('disponible'); render(); }, C); await page.waitForTimeout(600);
    check('si la fila sale de la tabla, lo escrito se guarda', await page.evaluate(id => S.lotes[id].nota, C) === 'Tras error y más');
    await page.evaluate(() => { S.ocultos.clear(); render(); });
  });
  await paso('conflicto entre secretarias', async () => {
    await verTabla();
    await page.click(notaC); await page.keyboard.press('End'); await page.keyboard.insertText(' (mía)');
    await page.evaluate(id => Store.mutateLote(id, x => { x.nota = 'Cambio de otra secretaria'; return x; }), C); await page.waitForTimeout(300);
    await page.keyboard.press('Tab'); await page.waitForTimeout(500);
    check('no sobrescribe en silencio la nota de otra persona', await page.evaluate(id => S.lotes[id].nota, C) === 'Cambio de otra secretaria');
    check('avisa del conflicto', /cambi/i.test(await page.evaluate(() => document.querySelector('.ov .t-title')?.textContent || '')));
    await page.click('.ov [type=submit]'); await page.waitForTimeout(500);
    check('puede guardar su versión a propósito', await page.evaluate(id => S.lotes[id].nota, C) === 'Tras error y más (mía)');
  });
  await paso('falla al guardar conserva el texto', async () => {
    await verTabla();
    await page.evaluate(() => { const o = Store.mutateLote; Store.mutateLote = async () => { Store.mutateLote = o; throw new Error('sin conexión'); }; });
    await page.click(notaC); await page.keyboard.press('End'); await page.keyboard.insertText(' X');
    await page.keyboard.press('Tab'); await page.waitForTimeout(500);
    const txt = (await page.innerText(notaC)).replace(/\s+/g, ' ').trim();
    check('si no se puede guardar, el texto sigue en la celda', / X/.test(txt) && await page.evaluate(id => S.lotes[id].nota, C) === 'Tras error y más (mía)', JSON.stringify(txt) + ' · ' + await page.evaluate(() => document.querySelector('.toast')?.textContent));
  });

  check('sin errores de página', errs.length === 0, errs.join(' | '));
  await browser.close(); fin();
})();
