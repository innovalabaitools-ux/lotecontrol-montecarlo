// Operaciones seguras: reintentos, versiones, recibos numerados por el servidor y estado fresco.
// Usa un "Supabase falso" dentro de la página que imita guardar_lote (control de versión + número de recibo en la misma operación).
// La prueba contra la base real está en tests/supabase-real.js (la corre la usuaria con sus credenciales).
const { abrir, check, fin, paso } = require('./run');

(async () => {
  const { browser, page, errs } = await abrir();
  await page.evaluate(() => {
    window.mkSb = () => {
      const rows = new Map(); const est = { ultimo: 0, rpc: 0, interferir: null, cortarRespuesta: false, errorRed: false };
      const api = { rows, est,
        from() { return { select() { return { eq(c, id) { return { async maybeSingle() { const r = rows.get(id); return { data: r ? { data: structuredClone(r.data), version: r.version } : null, error: null }; } }; } }; }, insert: async () => ({ error: null }) }; },
        async rpc(name, a) {
          est.rpc++;
          if (est.errorRed) { est.errorRed = false; return { data: null, error: { message: 'TypeError: Failed to fetch' } }; }
          if (est.interferir) { const f = est.interferir; est.interferir = null; f(rows); }
          const r = rows.get(a.p_id), v = r ? r.version : 0;
          if (v !== a.p_esperada) return { data: { ok: false, conflicto: true, version: v, data: r?.data || null }, error: null };
          let d = structuredClone(a.p_data), n = null;
          if (a.p_con_recibo) { n = ++est.ultimo; d = JSON.parse(JSON.stringify(d).replaceAll('{{N}}', String(n).padStart(6, '0'))); d.pagos = d.pagos.map(p => p.recibo === 0 ? { ...p, recibo: n } : p); }
          rows.set(a.p_id, { data: d, version: v + 1 });
          if (est.cortarRespuesta) { est.cortarRespuesta = false; return { data: null, error: { message: 'TypeError: Failed to fetch' } }; }
          return { data: { ok: true, version: v + 1, recibo: n, data: d }, error: null };
        } };
      return api;
    };
    window.enLinea = () => { window.__m = S.mode; window.__sb = sb; sb = mkSb(); S.mode = 'sb'; S.verLeida = {}; return true; };
    window.fueraDeLinea = () => { S.mode = window.__m; sb = window.__sb; };
  });
  const libre = () => page.evaluate(() => lotesArr().filter(l => l.estado === 'disponible')[100 + Math.floor(Math.random() * 500)].id);
  const pago = (extra = {}) => ({ valor: 1000, fecha: '2026-11-20', medio: 'Efectivo', concepto: 'Prueba', ...extra });

  await paso('recibos', async () => {
    const [a, b] = [await libre(), await libre()];
    await page.evaluate(() => enLinea());
    const r = await page.evaluate(async ([a, b]) => { const r1 = await operar(a, null, { valor: 1000, fecha: today(), medio: 'Efectivo', concepto: 'P1', op: 'o1' }); const r2 = await operar(b, null, { valor: 1000, fecha: today(), medio: 'Efectivo', concepto: 'P2', op: 'o2' });
      return { n1: r1.recibo, n2: r2.recibo, hist: sb.rows.get(a).data.historial[0].accion, guardado: sb.rows.get(a).data.pagos[0].recibo }; }, [a, b]);
    check('el recibo trae el número que asignó el servidor', r.n1 === 1 && r.n2 === 2, JSON.stringify(r));
    check('el historial lleva el número real, no el marcador', /N° 000001/.test(r.hist) && !/\{\{N\}\}/.test(r.hist), r.hist);
    await page.evaluate(() => fueraDeLinea());
  });
  await paso('conflicto', async () => {
    const id = await libre();
    await page.evaluate(() => enLinea());
    const r = await page.evaluate(async id => { sb.est.interferir = rows => { rows.set(id, { data: { ...S.base[id], nota: 'otra secretaria' }, version: 1 }); };
      const nx = await Store.mutateLote(id, x => { x.asesor = 'Yo'; return x; }); return { rpc: sb.est.rpc, asesor: nx.asesor, nota: nx.nota }; }, id);
    check('si otra persona cambió el lote, se relee y se reintenta', r.rpc === 2 && r.asesor === 'Yo' && r.nota === 'otra secretaria', JSON.stringify(r));
    await page.evaluate(() => fueraDeLinea());
  });
  await paso('tres conflictos', async () => {
    const id = await libre();
    await page.evaluate(() => enLinea());
    const r = await page.evaluate(async id => { let k = 1; const f = rows => { rows.set(id, { data: { ...S.base[id], nota: 'x' + k }, version: ++k }); };
      const orig = sb.rpc.bind(sb); sb.rpc = async (n, a) => { sb.est.interferir = f; return orig(n, a); };
      try { await Store.mutateLote(id, x => x); return 'guardó'; } catch (e) { return e.message; } }, id);
    check('tras 3 conflictos avisa sin guardar', /modificando este lote/i.test(r), r);
    await page.evaluate(() => fueraDeLinea());
  });
  await paso('revalida', async () => {
    const id = await libre();
    await page.evaluate(() => enLinea());
    const r = await page.evaluate(async id => { sb.est.interferir = rows => { rows.set(id, { data: { ...S.base[id], estado: 'cuotas', cliente: { nombre: 'Otro' }, venta: { precioFinal: 1 } }, version: 1 }); };
      try { await operar(id, x => { if (!(x.estado === 'disponible')) throw new Error('Este lote acaba de cambiar de estado'); x.estado = 'separado'; }, null); return 'guardó'; } catch (e) { return e.message; } }, id);
    check('si el lote ya no está disponible al reintentar, no se pisa', /cambiar de estado/.test(r) && await page.evaluate(id => sb.rows.get(id).data.estado === 'cuotas', id), r);
    await page.evaluate(() => fueraDeLinea());
  });
  await paso('red', async () => {
    const id = await libre();
    await page.evaluate(() => enLinea());
    const m = await page.evaluate(async id => { sb.est.errorRed = true; try { await Store.mutateLote(id, x => x); return 'guardó'; } catch (e) { return e.message; } }, id);
    check('un corte de internet da un mensaje claro', /Se cortó la conexión/.test(m) && /ficha/.test(m), m);
    await page.evaluate(() => fueraDeLinea());
  });
  await paso('respuesta perdida', async () => {
    const id = await libre();
    await page.evaluate(() => enLinea());
    const r = await page.evaluate(async id => { const p = { valor: 5000, fecha: today(), medio: 'Efectivo', concepto: 'Prueba', op: 'op-corte' };
      sb.est.cortarRespuesta = true; let e1 = ''; try { await operar(id, null, p); } catch (e) { e1 = e.message; }
      const r2 = await operar(id, null, p); return { e1, n: sb.rows.get(id).data.pagos.length, num: r2.recibo, ultimo: sb.est.ultimo }; }, id);
    check('si se cortó la respuesta, reintentar no crea un segundo recibo', /Se cortó la conexión/.test(r.e1) && r.n === 1 && r.num === 1 && r.ultimo === 1, JSON.stringify(r));
    await page.evaluate(() => fueraDeLinea());
  });

  // las mismas protecciones en modo local
  await paso('reintento local', async () => {
    const id = await libre();
    const r = await page.evaluate(async id => { const p = { valor: 2000, fecha: today(), medio: 'Efectivo', concepto: 'Prueba', op: 'op-' + id }; const a = await operar(id, null, p); const b = await operar(id, null, p); return { a: a.recibo, b: b?.recibo, n: S.lotes[id].pagos.length }; }, id);
    check('reintentar la misma operación no crea otro recibo', r.n === 1 && r.a === r.b, JSON.stringify(r));
    const d = await page.evaluate(async id => { const p = { valor: 3000, fecha: today(), medio: 'Transferencia', banco: 'Nequi', ref: 'TRX55', concepto: 'Prueba' }; await operar(id, null, { ...p, op: 'x1' }); return operar(id, null, { ...p, op: 'x2' }).then(() => 'ok', e => e.message); }, id);
    check('mismo valor y referencia el mismo día se frena', /referencia/i.test(d), d);
  });
  await paso('op en formulario', async () => {
    const id = await libre();
    await page.evaluate(id => selectLote(id), id); await page.waitForTimeout(400);
    await page.click('#drawer [data-act="separar"]'); await page.waitForTimeout(300);
    check('cada formulario de pago lleva su código de operación', !!(await page.inputValue('.sheet input[name=op]')));
    await page.evaluate(() => cerrarModal()); await page.waitForTimeout(200);
  });
  await paso('estado fresco', async () => {
    const id = await libre();
    await page.evaluate(id => { selectLote(id); Local.lotes[id] = { ...(Local.lotes[id] || S.base[id]), estado: 'separado', separacion: { fecha: today(), valor: 1 }, cliente: { nombre: 'Otra' } }; }, id);
    await page.waitForTimeout(300);
    await page.click('#drawer [data-act="separar"]'); await page.waitForTimeout(400);
    check('si el lote cambió, no abre el formulario', await page.evaluate(() => !document.querySelector('.sheet:not(.cerrando)')));
    check('y avisa que cambió', /cambi/i.test(await page.evaluate(() => [...document.querySelectorAll('.toast')].map(t => t.textContent).join(' | '))));
  });
  await paso('auditoría local', async () => {
    const txt = await page.evaluate(() => { modalAjustes(); return document.querySelector('.ov:not(.cerrando)').innerText; });
    check('Ajustes muestra la revisión del consecutivo', /consecutivo/i.test(txt));
    await page.evaluate(() => cerrarModal());
  });

  check('sin errores de página', errs.length === 0, errs.join(' | '));
  await browser.close(); fin();
})();
