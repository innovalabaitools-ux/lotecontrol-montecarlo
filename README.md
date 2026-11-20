# LoteControl · Condominio Campestre Montecarlo

Software de gestión de lotes para una inmobiliaria: plano interactivo 3D y 2D, estados de cada lote, separaciones, ventas de contado y a cuotas, recibos de caja consecutivos, cartera y mora. Pensado para que varias secretarias trabajen al mismo tiempo desde distintos computadores, con todo sincronizado en la nube.

> **Un software por proyecto.** Esta versión es la de Montecarlo (Acacías, Meta). La marca del proyecto (paleta bronce y carbón, tipografía Cinzel, logo) se aplica como tema; la base del diseño es neutra.

## Qué hace

- **Plano 3D y 2D** de 2.291 lotes en 106 manzanas y 6 sectores, extraído del plano CAD (PDF) de la empresa. Navegación con zoom suave hacia el cursor, vuelo de cámara a un lote o sector, fondos intercambiables (por defecto "Maqueta blanca"), números de lote y medidas reales.
- **Estados:** disponible, separado, vendido a cuotas, vendido de contado, en mora. Los vendidos se distinguen con un contorno cobre suave y quedan más bajos en el 3D.
- **Inventario como hoja de celdas:** Manzana · Lote · Estado · Área · Precio · Asesor · Fecha de venta · Anotaciones (se editan en la celda) · Recibos (historial por lote). Buscador flexible ("lote 5", "mz 105", "esquinero", nombre del asesor, texto de las notas) y filtros por ubicación, precio, estado y asesor.
- **Separar y vender:** formularios con validación, asesor que atiende, plan de cuotas, pago recibido en el momento (efectivo, transferencia, consignación, tarjeta, cheque), banco que recibe y **captura del comprobante** como evidencia.
- **Recibos de caja:** diseño imprimible/PDF, valor en letras, estado de cuenta con avance y texto listo para WhatsApp.
- **Cartera:** separaciones activas, ventas con saldo, mora por cuotas vencidas y mensaje de cobro para copiar.
- **Operaciones seguras con varias personas:** cada cambio se guarda completo o no se guarda, con control de versión por lote; el número de recibo lo asigna la base de datos dentro de la misma operación (sin repetidos ni huecos); un pago repetido por un corte de internet no se duplica; si otra persona cambia un lote o una nota al mismo tiempo, la app avisa en vez de pisarla.
- Solo para PC (no hay versión móvil).

## Estructura

```
index.html            Aplicación completa (HTML + CSS + JS, sin paso de compilación)
motor3d.js            Motor del plano 3D (Three.js r160 desde CDN)
plano-montecarlo.json Lotes con polígonos, área, precio de lista, ubicación y sector
precios-montecarlo.json  Lista de precios interpretada (2.278 lotes)
logo-*.png/.webp      Logo e identidad de marca
*.py                  Scripts que generan los datos a partir de los PDF
                      (extraer_plano, leer_precios, enriquecer_plano, paisajismo, preparar_logo)
supabase/             Base de datos: schema.sql, config.public.json, pruebas y limpieza
tests/                Pruebas automáticas con Playwright
docs/superpowers/     Diseños y planes (inventario en hoja)
DIAGNOSTICO-UX.md     Diagnóstico de experiencia de usuario con fuentes
_respaldo-version-suiza-…/  Copia de un rediseño descartado (solo referencia)
```

## Cómo correrlo

Es una página estática. Desde esta carpeta:

```bash
npm run servir
```

y abre `http://127.0.0.1:8765/`.

- **Modo de pruebas (datos solo en tu navegador, sin base de datos):** `http://127.0.0.1:8765/index.html?local=1`
- **Modo normal:** pide correo y contraseña y trabaja contra Supabase.

## Base de datos (Supabase)

1. Crea un proyecto en Supabase y ejecuta [`supabase/schema.sql`](supabase/schema.sql) en el SQL Editor (es repetible: no borra datos).
2. Copia la URL y la llave **publishable** del proyecto en [`supabase/config.public.json`](supabase/config.public.json). La llave publishable está hecha para ir en el navegador; la seguridad la dan las reglas RLS del esquema. **Nunca** pongas aquí la llave `secret` ni la contraseña de la base.
3. Crea un usuario por secretaria en *Authentication → Users → Add user* (con "Auto Confirm User") y desactiva *Allow new users to sign up*.
4. Los lotes y el consecutivo solo se escriben mediante las funciones `guardar_lote` y `guardar_proyecto`; las secretarias leen todo y solo pueden crear comprobantes.

**Prueba real de carga y seguridad** (la corre quien administra el proyecto, con sus credenciales en variables de entorno; en Windows basta con doble clic a [`supabase/correr-prueba.bat`](supabase/correr-prueba.bat)):

```bash
node supabase/prueba-real.js
```

Comprueba 40 recibos simultáneos (números seguidos y sin repetir), 20 escrituras al mismo lote (solo 1 gana), control de versiones, lectura con sesión y que sin sesión no se pueda leer ni escribir. Después de probar, ejecuta [`supabase/limpiar-pruebas.sql`](supabase/limpiar-pruebas.sql) para borrar los datos de prueba y dejar el consecutivo en 0 **antes** de emitir recibos reales.

## Pruebas automáticas

Requieren Node.js y el servidor local en marcha (`npm run servir`).

```bash
npm install
npx playwright install chromium
npm test
```

- `tests/inventario-hoja.test.js` – hoja de inventario, asesor, notas, recibos (34 comprobaciones)
- `tests/movimiento.test.js` – animaciones, "reducir movimiento", vuelos de cámara, hoja con muchas filas (17)
- `tests/operaciones.test.js` – reintentos, conflictos, recibos numerados por el servidor (14), con un Supabase simulado

## Decisiones de producto

- Las separaciones **no tienen fecha de vencimiento** (se quitó de formularios, cartera y mensajes).
- Un solo proyecto por instalación: no hay selector de proyectos.
- Los recibos son documentos internos de caja; **no reemplazan la factura electrónica de la DIAN**.
- Todo lote con un punto de color en el plano original se considera **vendido**.

## Pendientes y puntos por confirmar

- 21 lotes sin precio en la lista (incluidos los bloques SN1–SN6) y diferencias entre la lista y el plano en las manzanas 33, 60 y 76: confirmar con la constructora.
- Los 1.020 lotes vendidos antes de usar el sistema no tienen cliente ni plan de pagos: hay que registrarlos o migrarlos (Google Sheet compartido / Siigo).
- Publicar la página en una dirección web (por ejemplo Netlify) y hacer un simulacro de 3–4 días con 2–3 computadores, en paralelo al proceso actual.
- Siguientes pasos de producto: PDF de recibos, WhatsApp, facturación electrónica, importador desde Google Sheet/Siigo, historial de cambios por lote en su propia tabla y comprobantes en almacenamiento de archivos.

## Privacidad

Este repositorio debe mantenerse **privado**: contiene la lista de precios y el plano de un proyecto comercial.
