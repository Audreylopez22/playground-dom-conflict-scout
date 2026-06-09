// Validación end-to-end del playground visual con Chrome headless.
//
// Arranca el servidor estático, abre el playground en Chrome, dispara las
// inyecciones reales, comprueba que la librería las detecta y marca visualmente,
// y guarda capturas de pantalla como evidencia.
//
// Ejecutar con:  node tests/visual/validate-visual.mjs
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const PORT = 5211;
const CHROME = '/usr/bin/google-chrome';

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

function startServer() {
  const server = http.createServer(async (req, res) => {
    try {
      let urlPath = decodeURIComponent(req.url.split('?')[0]);
      if (urlPath === '/') urlPath = '/tests/visual/playground.html';
      const filePath = path.normalize(path.join(ROOT, urlPath));
      if (!filePath.startsWith(ROOT)) return res.writeHead(403).end('Forbidden');
      const data = await readFile(filePath);
      res.writeHead(200, { 'Content-Type': (MIME[path.extname(filePath)] || 'application/octet-stream') + '; charset=utf-8' });
      res.end(data);
    } catch { res.writeHead(404).end('404'); }
  });
  return new Promise((resolve) => server.listen(PORT, () => resolve(server)));
}

const checks = [];
function check(name, cond, detail = '') {
  checks.push({ name, ok: !!cond, detail });
  console.log(`  ${cond ? '✔' : '✖'} ${name}${detail ? ` — ${detail}` : ''}`);
}

const server = await startServer();
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1400,900'],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  // Captura los logs de consola de la propia librería (debug:true emite warns).
  const libLogs = [];
  page.on('console', (msg) => { if (/DETECTOR|DomConflictScout/.test(msg.text())) libLogs.push(msg.text()); });

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle0' });

  // La librería global debe estar cargada.
  const hasLib = await page.evaluate(() => typeof window.DOMConflictScout?.DomConflictScout === 'function');
  check('The global library loads in the browser', hasLib);

  // Estado inicial limpio.
  const initialDetected = await page.$eval('#n-detected', (e) => Number(e.textContent));
  check('Initial detections = 0 (no false positives in the UI)', initialDetected === 0, `value=${initialDetected}`);

  // Inyectar TODAS las extensiones (el botón escalona las inyecciones ~90ms c/u).
  await page.click('#inject-all');
  await new Promise((r) => setTimeout(r, 1500));

  const detectedAll = await page.$eval('#n-detected', (e) => Number(e.textContent));
  check('After "Inject all" the 8 categories are detected', detectedAll === 8, `detected=${detectedAll}`);

  // Cada nodo inyectado debe quedar marcado con .scout-flag y su badge.
  const flagged = await page.$$eval('#stage-live .injected-node.scout-flag', (els) => els.length);
  const badges = await page.$$eval('#stage-live .scout-badge', (els) => els.map((e) => e.textContent.trim()));
  check('The 8 injected nodes receive a visual marker (.scout-flag)', flagged === 8, `flagged=${flagged}`);
  check('Each detected node shows its category badge', badges.length === 8, badges.join(' | '));

  // Verifica que aparezcan las 8 categorías esperadas en los badges.
  const expected = ['ADBLOCKER','TRANSLATOR','GRAMMAR','COUPONS','PASSWORD_MANAGERS','ACCESSIBILITY_DARK','WEB3_WALLETS','DEV_TOOLS_OVERLAYS'];
  const allCats = expected.every((c) => badges.some((b) => b.includes(c)));
  check('The 8 expected categories appear in the badges', allCats);

  await page.screenshot({ path: path.join(HERE, 'resultado-detecciones.png') });

  // Prueba de FALSO POSITIVO: nodo legítimo no debe sumar detecciones.
  const beforeLegit = await page.$eval('#n-detected', (e) => Number(e.textContent));
  await page.click('#inject-legit');
  await new Promise((r) => setTimeout(r, 300));
  const afterLegit = await page.$eval('#n-detected', (e) => Number(e.textContent));
  check('A legitimate node does NOT trigger a detection (no false positive)', afterLegit === beforeLegit, `${beforeLegit} -> ${afterLegit}`);

  // Prueba de stop(): detener el vigilante e inyectar no debe detectar.
  await page.click('#toggle'); // detener
  await new Promise((r) => setTimeout(r, 150));
  const beforeStopped = await page.$eval('#n-detected', (e) => Number(e.textContent));
  await page.click('[data-inject="ADBLOCKER"]');
  await new Promise((r) => setTimeout(r, 300));
  const afterStopped = await page.$eval('#n-detected', (e) => Number(e.textContent));
  check('With the watcher stopped (stop) new injections are not detected', afterStopped === beforeStopped, `${beforeStopped} -> ${afterStopped}`);

  await page.screenshot({ path: path.join(HERE, 'resultado-final.png') });

  // La librería en modo debug debe haber emitido logs en consola.
  check('The library emits detection logs in debug mode', libLogs.length > 0, `${libLogs.length} messages`);

} finally {
  await browser.close();
  server.close();
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n  Result: ${checks.length - failed.length}/${checks.length} visual checks passing`);
console.log('  Screenshots: tests/visual/resultado-detecciones.png, tests/visual/resultado-final.png\n');
process.exit(failed.length ? 1 : 0);
