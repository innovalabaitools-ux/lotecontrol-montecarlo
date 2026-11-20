# Diagnóstico de UX/UI — versión de presentación

Revisión hecha como desarrollador que prepara la entrega a cliente final. Usuarias principales: secretarias de oficina que hoy trabajan en Excel / Google Sheets, en PC. Meta: que el sistema sea más fácil que lo que usan hoy, y que el plano sea el centro de la venta.

Principio rector (Shneiderman, "The Eyes Have It", 1996): **vista general primero, después acercar y filtrar, y el detalle cuando se pide**. Cada segmento se evaluó contra eso.

---

## 1. Primera carga y encuadre del plano

**Problema.** El plano abre muy lejos. El encuadre usaba el tamaño total del dibujo (con márgenes y bosque) y una fórmula de distancia que ignora la inclinación de la cámara, así que el condominio queda pequeño en el centro y obliga a hacer mucho zoom.

**Lo que dice la práctica.** Encuadrar un objeto con cámara inclinada no se resuelve con el tamaño de la caja: hay que proyectar sus esquinas al espacio de la cámara y calcular la distancia mínima a la que todas caben, con un margen de 5 a 20 % (foro oficial de three.js, "Camera zoom to fit object").

**Decisión.**
- Encuadre por proyección real de las esquinas del área de lotes, no del dibujo completo, con 6 % de margen.
- Inclinación de la vista general menos rasante (≈ 43°), para que el plano llene más la pantalla sin perder la sensación 3D.
- Entrada suave de un segundo desde un poco más arriba. Si el sistema operativo pide "reducir movimiento", entra sin animación (web.dev, `prefers-reduced-motion`).
- Mientras se construye el 3D, pantalla de carga con el logo y el conteo de lotes (NN/g: indicador visible para esperas de más de 1 s).

## 2. Navegación del plano

**Problema.** Arrastrar con clic izquierdo gira la maqueta. Quien viene de Google Maps espera que arrastrar *mueva* el mapa, y al girar sin querer se pierde la orientación. No hay botones visibles de zoom ni forma de "volver al norte", y se puede salir del condominio y perderse en el vacío.

**Lo que dice la práctica.**
- three.js trae `MapControls` justamente para mapas: clic izquierdo mueve, clic derecho gira, rueda acerca (documentación oficial).
- Los mapas profesionales muestran zoom +/− y una brújula que indica el giro y, al tocarla, vuelve al norte; la brújula solo aparece cuando hay giro (Google Maps SDK, MapTiler).
- En mapas web se espera poder mover y acercar libremente (Axis Maps).

**Decisión.**
- Cambiar a `MapControls`: arrastrar mueve, clic derecho gira, rueda acerca hacia el cursor.
- Control de navegación abajo a la derecha: +, −, brújula (gira con el plano y vuelve al norte al tocarla) y "ver todo".
- Doble clic sobre un lote: vuela a él y abre su ficha. Doble clic en el terreno: acerca a ese punto.
- Teclado (con el plano enfocado): flechas para moverse, + y − para acercar.
- Límites: no se puede alejar más allá de la vista general ni arrastrar el plano fuera de la pantalla.

## 3. Lectura visual del plano

**Problema.** Las etiquetas de manzana son texto suelto con sombra; sobre lotes claros se leen mal. Todo aparece a la vez sin jerarquía por distancia.

**Lo que dice la práctica.** Los mapas profesionales muestran información distinta según el nivel de zoom y priorizan qué etiqueta se ve, para que no se amontonen ni "salten" al moverse (Mapbox, "Map label placement").

**Decisión (zoom semántico).**
- Lejos: solo manzanas, como "pastillas" legibles con fondo translúcido.
- Medio: aparecen los números de lote.
- Cerca: con un lote elegido, aparecen sus medidas.

## 4. Pasar el mouse y seleccionar

**Problema.** El recuadro de información sale instantáneo con cada movimiento y parpadea al cruzar lotes.

**Lo que dice la práctica.** Un pequeño retardo (150–300 ms) evita apariciones accidentales, y una vez abierto se salta el retardo al pasar al siguiente elemento (PatternFly, Visa Design System, "Tooltips need a delay, and then they need to skip it").

**Decisión.** Retardo de 140 ms la primera vez y respuesta inmediata mientras se recorre el plano. El resaltado del lote sí es inmediato.

## 5. Buscador y filtros

**Problema.** Con varios filtros activos no hay una forma rápida de volver a ver todo.

**Lo que dice la práctica.** Un "Limpiar filtros" visible evita que el usuario recargue la página para empezar de cero (guías de tablas empresariales).

**Decisión.** Botón "Limpiar" que aparece solo cuando hay algún filtro, búsqueda o sector activo.

## 6. Accesibilidad y comodidad visual

**Problema.** Algunos textos de apoyo (gris oscuro sobre negro) no llegan al contraste mínimo, y no hay un indicador claro de foco para quien usa el teclado.

**Lo que dice la práctica.** WCAG 2.2: texto normal ≥ 4,5:1; bordes y estados de controles ≥ 3:1; el modo oscuro se verifica aparte, no se invierte (WebAIM, MDN).

**Decisión.** Subir el gris secundario hasta pasar 4,5:1, y agregar un contorno de foco visible en bronce en botones, campos y el plano.

## 7. Formularios de separación y venta

**Estado.** Ya usan etiquetas arriba, secciones y resumen fijo. NN/g recomienda validación en línea junto al campo.

**Decisión.** Validar al salir de cada campo: cédula solo números, teléfono de 10 dígitos, campos obligatorios marcados en el sitio y no solo con un aviso.

## 8. Datos

- Se corrige la Manzana 1 · Lote 8 (esquinero, 179,06 m², $65.000.000), que había quedado sin precio.
- Pendiente de la constructora: las manzanas 33, 60 y 76 tienen distinta cantidad de lotes en la lista y en el plano.

## Lo que queda para la versión de producción (no se hace ahora)

- Deshacer en acciones reversibles (NN/g: confirmar solo lo irreversible).
- Primera columna fija en el inventario y acciones por fila.
- Pruebas con 2 o 3 secretarias reales, midiendo cuánto tardan en encontrar y separar un lote frente a su método actual.

---

### Fuentes

- Shneiderman, B. (1996). *The Eyes Have It* — https://www.cs.umd.edu/users/ben/papers/Shneiderman1997next.pdf
- three.js MapControls — https://threejs.org/docs/pages/MapControls.html
- three.js forum, Camera zoom to fit object — https://discourse.threejs.org/t/camera-zoom-to-fit-object/936
- Google Maps SDK, controles y brújula — https://developers.google.com/maps/documentation/ios-sdk/controls
- MapTiler SDK controls — https://docs.maptiler.com/sdk-js/api/controls/
- Axis Maps, Map interaction — https://www.axismaps.com/guide/map-interaction
- Mapbox, Map label placement — https://blog.mapbox.com/map-label-placement-in-mapbox-gl-c6f843a7caaa
- PatternFly, Tooltip — https://patternfly.org/v4/components/tooltip/design-guidelines
- Tooltips need a delay, and then they need to skip it — https://blog.master.dev/tooltips-need-a-delay-and-then-they-need-to-skip-it/
- NN/g, Skeleton screens — https://nngroup.com/articles/skeleton-screens/
- NN/g, Errores en formularios — https://www.nngroup.com/articles/errors-forms-design-guidelines/
- NN/g, Confirmation dialogs — https://www.nngroup.com/articles/confirmation-dialog/
- WebAIM, Contrast — https://webaim.org/articles/contrast/
- MDN, Color contrast — https://developer.mozilla.org/en-US/docs/Web/Accessibility/Understanding_WCAG/Perceivable/Color_Contrast
- web.dev, prefers-reduced-motion — https://web.dev/prefers-reduced-motion
- Interactive site plans (SharpLaunch) — https://www.sharplaunch.com/blog/interactive-site-and-floor-plans-how-to-show-availabilities-more-clearly-on-your-property-pages
