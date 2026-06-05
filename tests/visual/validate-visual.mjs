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
  check('La librería global se carga en el navegador', hasLib);

  // Estado inicial limpio.
  const initialDetected = await page.$eval('#n-detected', (e) => Number(e.textContent));
  check('Detecciones iniciales = 0 (sin falsos positivos en la UI)', initialDetected === 0, `valor=${initialDetected}`);

  // Inyectar TODAS las extensiones (el botón escalona las inyecciones ~90ms c/u).
  await page.click('#inject-all');
  await new Promise((r) => setTimeout(r, 1500));

  const detectedAll = await page.$eval('#n-detected', (e) => Number(e.textContent));
  check('Tras "Inyectar todas" se detectan las 8 categorías', detectedAll === 8, `detectadas=${detectedAll}`);

  // Cada nodo inyectado debe quedar marcado con .scout-flag y su badge.
  const flagged = await page.$$eval('#stage-live .injected-node.scout-flag', (els) => els.length);
  const badges = await page.$$eval('#stage-live .scout-badge', (els) => els.map((e) => e.textContent.trim()));
  check('Los 8 nodos inyectados reciben marcador visual (.scout-flag)', flagged === 8, `marcados=${flagged}`);
  check('Cada nodo detectado muestra su badge con la categoría', badges.length === 8, badges.join(' | '));

  // Verifica que aparezcan las 8 categorías esperadas en los badges.
  const expected = ['ADBLOCKER','TRANSLATOR','GRAMMAR','COUPONS','PASSWORD_MANAGERS','ACCESSIBILITY_DARK','WEB3_WALLETS','DEV_TOOLS_OVERLAYS'];
  const allCats = expected.every((c) => badges.some((b) => b.includes(c)));
  check('Aparecen las 8 categorías esperadas en los badges', allCats);

  await page.screenshot({ path: path.join(HERE, 'resultado-detecciones.png') });

  // Prueba de FALSO POSITIVO: nodo legítimo no debe sumar detecciones.
  const beforeLegit = await page.$eval('#n-detected', (e) => Number(e.textContent));
  await page.click('#inject-legit');
  await new Promise((r) => setTimeout(r, 300));
  const afterLegit = await page.$eval('#n-detected', (e) => Number(e.textContent));
  check('Un nodo legítimo NO genera detección (sin falso positivo)', afterLegit === beforeLegit, `${beforeLegit} -> ${afterLegit}`);

  // Prueba de stop(): detener el vigilante e inyectar no debe detectar.
  await page.click('#toggle'); // detener
  await new Promise((r) => setTimeout(r, 150));
  const beforeStopped = await page.$eval('#n-detected', (e) => Number(e.textContent));
  await page.click('[data-inject="ADBLOCKER"]');
  await new Promise((r) => setTimeout(r, 300));
  const afterStopped = await page.$eval('#n-detected', (e) => Number(e.textContent));
  check('Con el vigilante detenido (stop) no se detectan inyecciones nuevas', afterStopped === beforeStopped, `${beforeStopped} -> ${afterStopped}`);

  await page.screenshot({ path: path.join(HERE, 'resultado-final.png') });

  // La librería en modo debug debe haber emitido logs en consola.
  check('La librería emite logs de detección en modo debug', libLogs.length > 0, `${libLogs.length} mensajes`);

} finally {
  await browser.close();
  server.close();
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n  Resultado: ${checks.length - failed.length}/${checks.length} checks visuales en verde`);
console.log('  Capturas: tests/visual/resultado-detecciones.png, tests/visual/resultado-final.png\n');
process.exit(failed.length ? 1 : 0);
