# Inventario como hoja de celdas — diseño corto

Aprobado por la usuaria el 2026-11-20 (conversación de brainstorming, boceto B "Hoja tipo Excel").

## Intención
Facilitar al máximo el trabajo de las secretarias: que el Inventario sea bonito y que encuentren rápido lo que buscan. Se elige una hoja con celdas marcadas (parecida a lo que ya usan en Excel / Google Sheets), con el estilo Montecarlo.

## Qué se construye
- **Vista Inventario** (`tablaHTML` en `index.html`) pasa a ser una hoja de celdas: encabezado fijo, bordes de celda, filas alternas, fila activa resaltada en bronce.
- **Columnas, en este orden (decisión de la usuaria):** Manzana · Lote · Estado · Área m² · Precio · Asesor · Fecha de venta · Anotaciones · Recibos.
  - Salen del Inventario: ubicación, cliente, pagado, saldo, vencido (siguen en Cartera y en "Copiar a Excel").
- **Asesor:** campo nuevo en los formularios **Separar** y **Vender** (decisión de la usuaria). Texto libre con autocompletado de los asesores ya usados en el proyecto (mi propuesta, aceptada). Al formalizar una venta de un lote separado, el campo viene precargado y editable. Se guarda en el lote (`asesor`) y en el historial.
- **Fecha de venta:** `venta.fecha`; para lotes separados muestra la fecha de separación en gris ("Sep. dd/mm/aaaa"); si no hay, "—".
- **Anotaciones:** se editan directo en la celda; se guardan al salir de la celda (o Enter) en el lote (`nota`) y se sincronizan a todos los PCs como cualquier cambio del lote. El buscador también busca en notas y en el nombre del asesor.
- **Recibos:** botón "Ver (n)" con la cantidad; abre una ventana con la lista de recibos del lote (N°, fecha, valor, concepto, medio) y cada uno se abre con el recibo completo (imprimible). Sin recibos: "—".
- **Barra superior:** se mantiene arriba el buscador, los filtros actuales y los chips de estado; se añade un filtro **Asesor**.
- Se conservan: ordenar al tocar el encabezado, "Mostrar más / todos", "Copiar a Excel" (se añaden asesor, fecha de venta y anotaciones a la exportación), clic en la fila abre la ficha del lote.

## No-objetivos
- Asesor y fecha de venta no se editan en la hoja (solo desde los formularios), para evitar cambios por accidente.
- No se completa automáticamente asesor/fecha de los 1.020 lotes vendidos según el plano: muestran "—" hasta registrar la venta.
- No se usa ninguna librería de hojas de cálculo.

## Enfoques considerados
1. **Rehacer la vista dentro de la app con HTML/CSS propio (elegido):** encaja con el estilo Montecarlo, sin dependencias.
2. Librería de hoja de cálculo (Handsontable, AG Grid): pesada, varias con licencia comercial, choca con el diseño.
3. Solo recolorear la tabla actual: no da el aspecto de celdas ni la edición directa de notas.

## Restricciones
- Solo PC. Debe verse completo en 1366×768 sin scroll horizontal de la página (la hoja puede desplazarse dentro de su panel).
- Escritura atómica por lote vía `Store.mutateLote` / `setLote`; respetar `S.canWrite`.

## Lo que queda al constructor
Anchos de columna, cómo se ve la celda en edición, texto vacío de notas, límite de caracteres de la nota (propuesta: 300).
