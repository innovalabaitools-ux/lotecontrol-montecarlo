// Prueba de carga y seguridad contra la base REAL de Supabase.
// La corre la persona dueña del proyecto en su propia terminal: las credenciales van en variables de entorno
// y nunca se escriben en ningún archivo ni se imprimen.
//
//   PowerShell (desde la carpeta software-lotes):
//     $env:TEST_EMAIL = "correo-del-usuario-de-prueba"
//     $env:TEST_PASSWORD = "su-contraseña"
//     node supabase/prueba-real.js
//     Remove-Item Env:TEST_PASSWORD
//
// Usa lotes de proyecto "prueba" (no aparecen en la app). Gasta 41 números del consecutivo:
// al terminar, ejecuta supabase/limpiar-pruebas.sql en el SQL Editor para dejarlo en 0 antes de usar la app de verdad.
const fs = require('fs'), path = require('path');
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.public.json'), 'utf8'));
const { TEST_EMAIL, TEST_PASSWORD } = process.env;
if (!TEST_EMAIL || !TEST_PASSWORD) { console.error('Faltan las variables TEST_EMAIL y TEST_PASSWORD (ver instrucciones al inicio del archivo).'); process.exit(2); }

let ok = 0, bad = 0;
const check = (n, c, x = '') => { c ? ok++ : bad++; console.log((c ? 'OK    ' : 'FALLA ') + n + (x ? '  ' + x : '')); };
const H = (tok) => ({ apikey: cfg.publishableKey, 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) });
const rpc = async (tok, fn, body) => { const r = await fetch(`${cfg.url}/rest/v1/rpc/${fn}`, { method: 'POST', headers: H(tok), body: JSON.stringify(body) }); let j = null; try { j = await r.json(); } catch (e) { } return { status: r.status, body: j }; };
const guardar = (tok, id, esperada, data, conRecibo) => rpc(tok, 'guardar_lote', { p_id: id, p_esperada: esperada, p_data: data, p_con_recibo: conRecibo });
const pagoDe = (id, n) => ({ proyecto: 'prueba', estado: 'cuotas', pagos: [{ id: 'p-' + id, recibo: 0, valor: 1000 * n, fecha: '2026-11-20' }], historial: [{ accion: `Recibo N° {{N}} por $${1000 * n}` }] });

(async () => {
  const t0 = Date.now();
  const login = await fetch(`${cfg.url}/auth/v1/token?grant_type=password`, { method: 'POST', headers: H(), body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }) });
  const sesion = await login.json();
  check('inicio de sesión del usuario de prueba', login.ok && !!sesion.access_token, login.ok ? '' : `(${login.status}: ${sesion.msg || sesion.error_description || sesion.error || ''})`);
  if (!sesion.access_token) { console.log('\nSin sesión no se puede seguir.'); process.exit(1); }
  const tok = sesion.access_token;
  const corrida = Date.now().toString(36);

  // A) 40 recibos al mismo tiempo, cada uno en un lote distinto
  const ids = Array.from({ length: 40 }, (_, i) => `prueba-${corrida}-A${i}`);
  const t1 = Date.now();
  const A = await Promise.all(ids.map((id, i) => guardar(tok, id, 0, pagoDe(id, i + 1), true)));
  const ms = Date.now() - t1;
  const oks = A.filter(r => r.body && r.body.ok);
  const nums = oks.map(r => r.body.recibo).sort((a, b) => a - b);
  check('A1: las 40 operaciones simultáneas se guardaron', oks.length === 40, `(${oks.length}/40, ${ms} ms en total)`);
  check('A2: ningún número de recibo se repite', new Set(nums).size === nums.length);
  check('A3: los números son seguidos, sin huecos', nums.length > 0 && nums[nums.length - 1] - nums[0] + 1 === nums.length, `(${nums[0]} a ${nums[nums.length - 1]})`);
  check('A4: cada historial lleva el mismo número que su pago', oks.every(r => r.body.data.pagos[0].recibo === r.body.recibo && r.body.data.historial[0].accion.includes(String(r.body.recibo).padStart(6, '0')) && !r.body.data.historial[0].accion.includes('{{N}}')));

  // B) 20 personas guardan el MISMO lote nuevo a la vez: solo una gana
  const idB = `prueba-${corrida}-B`;
  const B = await Promise.all(Array.from({ length: 20 }, (_, i) => guardar(tok, idB, 0, { proyecto: 'prueba', nota: 'persona ' + i }, false)));
  check('B1: de 20 escrituras simultáneas al mismo lote, exactamente 1 se guarda', B.filter(r => r.body?.ok).length === 1, `(${B.filter(r => r.body?.ok).length} guardadas, ${B.filter(r => r.body?.conflicto).length} con conflicto)`);

  // C) control de versión
  const C1 = await guardar(tok, idB, 1, { proyecto: 'prueba', nota: 'con la versión correcta' }, false);
  const C2 = await guardar(tok, idB, 1, { proyecto: 'prueba', nota: 'con una versión vieja' }, false);
  check('C1: con la versión correcta guarda y sube la versión', C1.body?.ok && C1.body.version === 2);
  check('C2: con una versión vieja se rechaza y no pisa', C2.body?.conflicto === true && C2.body.data?.nota === 'con la versión correcta');

  // D) si algo falla, el número de recibo no se pierde (todo o nada)
  const antes = (await (await fetch(`${cfg.url}/rest/v1/consecutivo?select=ultimo`, { headers: H(tok) })).json())[0]?.ultimo;
  const D = await guardar(tok, `prueba-${corrida}-D`, 5, pagoDe('d', 1), true);   // versión esperada equivocada → conflicto, no debe gastar número
  const despues = (await (await fetch(`${cfg.url}/rest/v1/consecutivo?select=ultimo`, { headers: H(tok) })).json())[0]?.ultimo;
  check('D1: un guardado rechazado no consume número de recibo', D.body?.conflicto === true && antes === despues, `(antes ${antes}, después ${despues})`);
  check('D2: el consecutivo avanzó exactamente 40 por los 40 recibos', despues - 0 >= 40 && oks.length === 40, `(último = ${despues})`);

  // F) lo que hace la app al abrir: leer proyectos, lotes, perfiles, consecutivo y guardar/leer un comprobante
  const leer = async (tabla, q = 'select=*&limit=1') => { const r = await fetch(`${cfg.url}/rest/v1/${tabla}?${q}`, { headers: H(tok) }); const j = await r.json().catch(() => null); return { status: r.status, filas: Array.isArray(j) ? j : null }; };
  const F1 = await leer('proyectos'); check('F1: con sesión se lee el proyecto Montecarlo', F1.status === 200 && F1.filas?.length === 1, `(HTTP ${F1.status})`);
  const F2 = await leer('lotes', 'select=id,version&proyecto=eq.prueba&limit=100'); check('F2: con sesión se leen los lotes (los 41 de la prueba)', F2.status === 200 && F2.filas?.length >= 41, `(HTTP ${F2.status}, ${F2.filas?.length ?? 0} filas)`);
  const F3 = await leer('consecutivo'); check('F3: con sesión se lee el consecutivo', F3.status === 200 && F3.filas?.[0]?.ultimo >= 40, `(último = ${F3.filas?.[0]?.ultimo})`);
  const F4 = await leer('perfiles'); check('F4: con sesión se leen los nombres de usuarios', F4.status === 200 && F4.filas?.length >= 1, `(HTTP ${F4.status})`);
  const cid = 'prueba-c-' + corrida;
  const F5 = await fetch(`${cfg.url}/rest/v1/comprobantes`, { method: 'POST', headers: { ...H(tok), Prefer: 'return=minimal' }, body: JSON.stringify({ id: cid, lote: 'prueba-x', img: 'data:image/jpeg;base64,AAAA' }) });
  const F6 = await leer('comprobantes', `select=id,img&id=eq.${cid}`);
  check('F5: con sesión se puede adjuntar un comprobante', F5.status === 201, `(HTTP ${F5.status})`);
  check('F6: y se puede leer de vuelta', F6.filas?.[0]?.id === cid);
  const F7 = await fetch(`${cfg.url}/rest/v1/comprobantes?id=eq.${cid}`, { method: 'DELETE', headers: { ...H(tok), Prefer: 'return=representation' } });
  const F7j = await F7.json().catch(() => null);
  check('F7: no se puede borrar un comprobante', F7.status >= 400 || (Array.isArray(F7j) && F7j.length === 0), `(HTTP ${F7.status})`);

  // E) seguridad: sin sesión no se puede nada
  const E1 = await rpc(null, 'guardar_lote', { p_id: 'prueba-intruso', p_esperada: 0, p_data: { proyecto: 'prueba' }, p_con_recibo: true });
  check('E1: sin sesión no se puede guardar un lote', E1.status >= 400, `(HTTP ${E1.status})`);
  const E2 = await fetch(`${cfg.url}/rest/v1/lotes?select=id&limit=1`, { headers: H(null) });
  const E2j = await E2.json().catch(() => null);
  check('E2: sin sesión no se pueden leer los lotes', E2.status >= 400 || (Array.isArray(E2j) && E2j.length === 0), `(HTTP ${E2.status})`);
  const E3 = await fetch(`${cfg.url}/rest/v1/lotes`, { method: 'POST', headers: { ...H(tok), Prefer: 'return=minimal' }, body: JSON.stringify({ id: 'prueba-directo', proyecto: 'prueba', data: {} }) });
  check('E3: aun con sesión, no se puede escribir directo en la tabla (solo por guardar_lote)', E3.status >= 400, `(HTTP ${E3.status})`);
  const E4 = await fetch(`${cfg.url}/rest/v1/consecutivo?id=eq.1`, { method: 'PATCH', headers: { ...H(tok), Prefer: 'return=minimal' }, body: JSON.stringify({ ultimo: 0 }) });
  const ult2 = (await (await fetch(`${cfg.url}/rest/v1/consecutivo?select=ultimo`, { headers: H(tok) })).json())[0]?.ultimo;
  check('E4: nadie puede reiniciar el consecutivo desde fuera', ult2 === despues, `(HTTP ${E4.status}, último = ${ult2})`);

  console.log(`\n${ok} OK, ${bad} fallas · ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  console.log('Siguiente paso: ejecuta supabase/limpiar-pruebas.sql en el SQL Editor para borrar estos lotes de prueba y dejar el consecutivo en 0.');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error('Error inesperado:', e.message); process.exit(1); });
