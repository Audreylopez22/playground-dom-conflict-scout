# Suite de pruebas para `@audreylopez/dom-conflict-scout`

Conjunto de pruebas (consola + visuales) para la librería **DOM Conflict Scout**, que
detecta inyecciones en el DOM hechas por extensiones de navegador (adblockers,
traductores, correctores, gestores de contraseñas, billeteras Web3, etc.).

## Qué hace la librería (resumen verificado del código)

- Expone la clase `DomConflictScout` con `start()` y `stop()`.
- Al hacer `start()` monta un `MutationObserver` sobre `document.body` **y** hace un
  escaneo inicial de todo el subárbol existente.
- Por cada elemento, construye la cadena `id + " " + className` (en minúsculas) y la
  compara contra un diccionario de "fingerprints" agrupados en 8 categorías.
- Si hay coincidencia, llama a `onDetection({ source, matchedKeyword, element })`.
- **Ignora** elementos `<script>`, `<style>` y cualquier cosa bajo `[data-v-app]`.
- La detección se basa **solo en `id` y `className`** (no en otros atributos ni en el
  `outerHTML`, pese a lo que sugiere el README oficial).

Las 8 categorías: `ADBLOCKER`, `TRANSLATOR`, `GRAMMAR`, `COUPONS`,
`PASSWORD_MANAGERS`, `ACCESSIBILITY_DARK`, `WEB3_WALLETS`, `DEV_TOOLS_OVERLAYS`.

---

## 1. Pruebas de consola (22 pruebas, todas en verde)

Montan un DOM real con **jsdom** e inyectan firmas de extensiones para comprobar que
el detector las identifica (o que correctamente las ignora).

```bash
pnpm install      # instala dependencias (jsdom, puppeteer-core)
pnpm test         # ejecuta las 22 pruebas de consola
```

También:

```bash
pnpm test:watch   # modo watch
```

Cobertura (qué casos del paquete se ejercitan):

1. Detección por `className` de las **8 categorías** (8 pruebas).
2. Detección por atributo `id` (`goog-gt-` → `TRANSLATOR`).
3. Inyección **dinámica** posterior a `start()` capturada por `MutationObserver`.
4. **Sin falsos positivos** con DOM legítimo.
5. Ignora elementos `<script>` aunque coincidan.
6. Ignora elementos `<style>` aunque coincidan.
7. Ignora subárboles bajo `[data-v-app]` (apps Vue).
8. `stop()` detiene la detección de inyecciones nuevas.
9. Coincidencia **case-insensitive**.
10. Detección de **múltiples extensiones** distintas a la vez.
11. El escaneo inicial alcanza **nodos anidados** pre-existentes.
12. No lanza si se omite `onDetection`.
13. Captura una **ráfaga** de inyecciones dinámicas.
14. Forma del objeto de detección (`source`, `matchedKeyword`, `element`).
15. Precedencia por **subcadena** en el diccionario (`skiptranslate` → `translate`).

---

## 2. Pruebas visuales

### a) Validación automática (headless, con checks)

Abre el playground en Chrome headless, dispara las inyecciones reales, comprueba que
la librería las detecta y marca, y guarda capturas como evidencia.

```bash
pnpm test:visual
```

Genera:
- `tests/visual/resultado-detecciones.png` — las 8 extensiones detectadas y marcadas.
- `tests/visual/resultado-final.png` — estado tras probar falso positivo y `stop()`.

> Requiere Google Chrome en `/usr/bin/google-chrome`. Si está en otra ruta, edita la
> constante `CHROME` en `tests/visual/validate-visual.mjs`.

### b) Playground interactivo (caso de uso real)

```bash
pnpm playground
# Abre en el navegador:  http://localhost:5173/
```

El playground simula un **caso de uso real**: una tienda online ("NovaShop") dentro
de un marco de navegador. Cada botón de la barra superior simula una **extensión del
navegador del visitante** que inyecta su UI sobre tu sitio sin permiso:

- 🍯 **Honey** → pop-up de cupones en la esquina.
- 🔐 **Bitwarden** → menú de autocompletado sobre el campo de login.
- 🌐 **Google Translate** → barra de traducción arriba.
- ✍️ **Grammarly** → botón flotante sobre la caja de reseña.
- 🦊 **MetaMask** → modal de "Conectar billetera" al centro.
- 🚫 **AdBlock** → tapa el espacio publicitario del sitio.
- 🌙 **Dark Reader** → capa de modo oscuro sobre toda la página.
- 🎥 **Loom** → barra de grabación de pantalla.

Cada widget inyectado que la librería detecta se resalta con un **borde rojo punteado
y un badge** con la categoría, y aparece en el **panel del detector** (derecha) con un
reporte en lenguaje natural, el `matchedKeyword` y los contadores en vivo.

Otros botones:
- **⚡ Simular todas**: lanza las 8 extensiones en secuencia.
- **+ Cambio legítimo del sitio**: añade un elemento propio → la librería **no** lo
  marca (demuestra ausencia de falsos positivos).
- **Detener / Reanudar detector**: llama a `stop()` / `start()`.
- **Limpiar página**: reinicia el sitio.

Así el cliente final ve el valor de un vistazo: las extensiones alteran su web y la
librería las identifica en tiempo real.

---

## Estructura

```
tests/
  console/
    helpers.mjs        # montaje de jsdom + utilidades
    scout.test.mjs     # 22 pruebas (node:test)
  visual/
    playground.html    # playground interactivo
    serve.mjs          # servidor estático sin dependencias
    validate-visual.mjs# validación headless con capturas
```
