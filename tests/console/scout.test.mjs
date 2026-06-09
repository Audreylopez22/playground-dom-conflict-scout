// Suite de pruebas de consola para @audreylopez/dom-conflict-scout.
//
// Ejecutar con:  node --test tests/console/
// Cada prueba monta un DOM aislado con jsdom, inyecta uno o varios "fingerprints"
// de extensiones de navegador y verifica que el detector los identifique (o no).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DomConflictScout } from '@audreylopez/dom-conflict-scout';
import { createDom, createCollector, flushMutations } from './helpers.mjs';

// ---------------------------------------------------------------------------
// 1. Detección por CLASE de cada una de las 8 categorías que ofrece el paquete.
//    (escaneo inicial: el elemento ya existe en el body cuando se llama a start)
// ---------------------------------------------------------------------------
const CATEGORIES = [
  { source: 'ADBLOCKER',          html: '<div class="ad-container">ads</div>',          keyword: 'ad-container' },
  { source: 'TRANSLATOR',         html: '<div class="deepl-popup">x</div>',              keyword: 'deepl' },
  { source: 'GRAMMAR',            html: '<div class="grammarly-btn">x</div>',            keyword: 'grammarly' },
  { source: 'COUPONS',            html: '<div class="honey-extension">x</div>',          keyword: 'honey' },
  { source: 'PASSWORD_MANAGERS',  html: '<div class="bitwarden-notification">x</div>',   keyword: 'bitwarden' },
  { source: 'ACCESSIBILITY_DARK', html: '<div class="darkreader-overlay">x</div>',       keyword: 'darkreader' },
  { source: 'WEB3_WALLETS',       html: '<div class="metamask-inpage">x</div>',          keyword: 'metamask' },
  { source: 'DEV_TOOLS_OVERLAYS', html: '<div class="loom-desktop-bar">x</div>',         keyword: 'loom-desktop' },
];

for (const { source, html, keyword } of CATEGORIES) {
  test(`detects category ${source} by className`, () => {
    const { cleanup } = createDom(html);
    const collector = createCollector();
    const scout = new DomConflictScout({ onDetection: collector.onDetection });

    scout.start();
    scout.stop();

    assert.equal(collector.all.length, 1, 'there must be exactly one detection');
    assert.equal(collector.all[0].source, source);
    assert.equal(collector.all[0].matchedKeyword, keyword);
    assert.ok(collector.all[0].element, 'the detection must include the DOM element');
    cleanup();
  });
}

// ---------------------------------------------------------------------------
// 2. Detección por ID (la librería concatena id + className para el match).
// ---------------------------------------------------------------------------
test('detects by id attribute (goog-gt- => TRANSLATOR)', () => {
  const { cleanup } = createDom('<div id="goog-gt-tt">widget</div>');
  const collector = createCollector();
  const scout = new DomConflictScout({ onDetection: collector.onDetection });

  scout.start();
  scout.stop();

  assert.equal(collector.all.length, 1);
  assert.equal(collector.all[0].source, 'TRANSLATOR');
  assert.equal(collector.all[0].matchedKeyword, 'goog-gt-');
  cleanup();
});

// ---------------------------------------------------------------------------
// 3. Inyección DINÁMICA después de start(): debe dispararse vía MutationObserver.
// ---------------------------------------------------------------------------
test('detects dynamic injection via MutationObserver after start()', async () => {
  const { document, cleanup } = createDom('');
  const collector = createCollector();
  const scout = new DomConflictScout({ onDetection: collector.onDetection });

  scout.start();
  assert.equal(collector.all.length, 0, 'the body starts clean');

  // Una extensión inyecta su nodo después de que el vigilante ya está activo.
  const injected = document.createElement('div');
  injected.className = 'adguard-popup';
  document.body.appendChild(injected);

  await flushMutations();
  scout.stop();

  assert.equal(collector.all.length, 1, 'the observer must capture the new node');
  assert.equal(collector.all[0].source, 'ADBLOCKER');
  assert.equal(collector.all[0].matchedKeyword, 'adguard');
  cleanup();
});

// ---------------------------------------------------------------------------
// 4. NO debe haber falsos positivos con DOM legítimo de la aplicación.
// ---------------------------------------------------------------------------
test('does not produce false positives with legitimate elements', () => {
  const { cleanup } = createDom(
    '<header id="main-header" class="site-header"></header>' +
    '<main class="content-wrapper"><p class="paragraph">Hello</p></main>' +
    '<footer id="page-footer" class="footer">End</footer>'
  );
  const collector = createCollector();
  const scout = new DomConflictScout({ onDetection: collector.onDetection });

  scout.start();
  scout.stop();

  assert.equal(collector.all.length, 0, 'no legitimate element must be flagged');
  cleanup();
});

// ---------------------------------------------------------------------------
// 5. Los elementos <script> deben ignorarse aunque tengan un fingerprint.
// ---------------------------------------------------------------------------
test('ignores <script> elements even if they match', () => {
  const { cleanup } = createDom('<script class="adblock-loader"></script>');
  const collector = createCollector();
  const scout = new DomConflictScout({ onDetection: collector.onDetection });

  scout.start();
  scout.stop();

  assert.equal(collector.all.length, 0, '<script> is in the ignore list');
  cleanup();
});

// ---------------------------------------------------------------------------
// 6. Los elementos <style> deben ignorarse aunque tengan un fingerprint.
// ---------------------------------------------------------------------------
test('ignores <style> elements even if they match', () => {
  const { cleanup } = createDom('<style class="ads-injected"></style>');
  const collector = createCollector();
  const scout = new DomConflictScout({ onDetection: collector.onDetection });

  scout.start();
  scout.stop();

  assert.equal(collector.all.length, 0, '<style> is in the ignore list');
  cleanup();
});

// ---------------------------------------------------------------------------
// 7. Subárbol marcado con [data-v-app] (apps Vue) debe ignorarse por completo.
// ---------------------------------------------------------------------------
test('ignores subtrees under [data-v-app]', () => {
  const { cleanup } = createDom(
    '<div data-v-app><div class="sponsor-banner">own content</div></div>'
  );
  const collector = createCollector();
  const scout = new DomConflictScout({ onDetection: collector.onDetection });

  scout.start();
  scout.stop();

  assert.equal(collector.all.length, 0, 'everything under [data-v-app] is ignored');
  cleanup();
});

// ---------------------------------------------------------------------------
// 8. stop() detiene la vigilancia: inyecciones posteriores no se detectan.
// ---------------------------------------------------------------------------
test('stop() halts detection of new injections', async () => {
  const { document, cleanup } = createDom('');
  const collector = createCollector();
  const scout = new DomConflictScout({ onDetection: collector.onDetection });

  scout.start();
  scout.stop();

  const injected = document.createElement('div');
  injected.className = 'lastpass-icon';
  document.body.appendChild(injected);

  await flushMutations();

  assert.equal(collector.all.length, 0, 'after stop() nothing must be recorded');
  cleanup();
});

// ---------------------------------------------------------------------------
// 9. La coincidencia es case-insensitive (la librería normaliza a minúsculas).
// ---------------------------------------------------------------------------
test('matching is case-insensitive', () => {
  const { cleanup } = createDom('<div class="MetaMask-Wrapper">x</div>');
  const collector = createCollector();
  const scout = new DomConflictScout({ onDetection: collector.onDetection });

  scout.start();
  scout.stop();

  assert.equal(collector.all.length, 1);
  assert.equal(collector.all[0].source, 'WEB3_WALLETS');
  assert.equal(collector.all[0].matchedKeyword, 'metamask');
  cleanup();
});

// ---------------------------------------------------------------------------
// 10. Detección de MÚLTIPLES extensiones distintas en el mismo documento.
// ---------------------------------------------------------------------------
test('detects multiple distinct extensions at once', () => {
  const { cleanup } = createDom(
    '<div class="adblock-bar"></div>' +
    '<div id="grammarly-root"></div>' +
    '<div class="joinhoney-widget"></div>' +
    '<div class="dashlane-field"></div>'
  );
  const collector = createCollector();
  const scout = new DomConflictScout({ onDetection: collector.onDetection });

  scout.start();
  scout.stop();

  assert.equal(collector.all.length, 4, 'one detection per extension');
  assert.deepEqual(
    [...collector.sources].sort(),
    ['ADBLOCKER', 'COUPONS', 'GRAMMAR', 'PASSWORD_MANAGERS']
  );
  cleanup();
});

// ---------------------------------------------------------------------------
// 11. El escaneo inicial recorre todo el subárbol pre-existente del body.
// ---------------------------------------------------------------------------
test('the initial scan reaches pre-existing nested nodes', () => {
  const { cleanup } = createDom(
    '<section class="legit"><div class="row"><span class="coupon-flag">x</span></div></section>'
  );
  const collector = createCollector();
  const scout = new DomConflictScout({ onDetection: collector.onDetection });

  scout.start();
  scout.stop();

  assert.equal(collector.all.length, 1, 'must find the nested node');
  assert.equal(collector.all[0].source, 'COUPONS');
  assert.equal(collector.all[0].matchedKeyword, 'coupon');
  cleanup();
});

// ---------------------------------------------------------------------------
// 12. Funciona sin onDetection (no debe lanzar) y respeta el modo debug.
// ---------------------------------------------------------------------------
test('does not throw if onDetection is omitted', () => {
  const { document, cleanup } = createDom('<div class="phantom-wallet"></div>');
  const scout = new DomConflictScout({}); // sin callback

  assert.doesNotThrow(() => {
    scout.start();
    scout.stop();
  });
  cleanup();
});

// ---------------------------------------------------------------------------
// 13. Inyecciones dinámicas en ráfaga (varias mutaciones seguidas).
// ---------------------------------------------------------------------------
test('captures a burst of dynamic injections', async () => {
  const { document, cleanup } = createDom('');
  const collector = createCollector();
  const scout = new DomConflictScout({ onDetection: collector.onDetection });

  scout.start();

  for (const cls of ['ublock-shield', 'deepl-bubble', 'keeper-fill']) {
    const el = document.createElement('div');
    el.className = cls;
    document.body.appendChild(el);
  }

  await flushMutations();
  scout.stop();

  assert.equal(collector.all.length, 3);
  assert.deepEqual(
    [...collector.sources].sort(),
    ['ADBLOCKER', 'PASSWORD_MANAGERS', 'TRANSLATOR']
  );
  cleanup();
});

// ---------------------------------------------------------------------------
// 14. La forma del objeto de detección es la documentada (source/keyword/element).
// ---------------------------------------------------------------------------
test('the detection object exposes source, matchedKeyword and element', () => {
  const { window, cleanup } = createDom('<div class="darkreader-style"></div>');
  const collector = createCollector();
  const scout = new DomConflictScout({ onDetection: collector.onDetection });

  scout.start();
  scout.stop();

  const d = collector.all[0];
  assert.equal(typeof d.source, 'string');
  assert.equal(typeof d.matchedKeyword, 'string');
  assert.ok(d.element instanceof window.HTMLElement, 'element must be an HTMLElement');
  assert.equal(d.element.className, 'darkreader-style');
  cleanup();
});

// ---------------------------------------------------------------------------
// 15. Precedencia por subcadena: gana el primer keyword de la lista que encaje.
//     "skiptranslate" contiene "translate", que aparece antes en el diccionario,
//     por lo que matchedKeyword es "translate" (no "skiptranslate").
// ---------------------------------------------------------------------------
test('matching respects the dictionary order (substring)', () => {
  const { cleanup } = createDom('<div class="skiptranslate">x</div>');
  const collector = createCollector();
  const scout = new DomConflictScout({ onDetection: collector.onDetection });

  scout.start();
  scout.stop();

  assert.equal(collector.all.length, 1);
  assert.equal(collector.all[0].source, 'TRANSLATOR');
  assert.equal(collector.all[0].matchedKeyword, 'translate', 'the earliest matching keyword wins');
  cleanup();
});
