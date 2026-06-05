// Helpers compartidos para las pruebas de consola de @audreylopez/dom-conflict-scout.
//
// La librería usa APIs del navegador (document, Node, MutationObserver). Para poder
// ejecutar las pruebas desde la consola con Node, montamos un DOM real con jsdom y
// exponemos sus globales antes de instanciar el detector.
import { JSDOM } from 'jsdom';

// Globales del navegador que la librería consume de forma perezosa (dentro de los métodos).
const BROWSER_GLOBALS = ['window', 'document', 'Node', 'MutationObserver', 'HTMLElement'];

/**
 * Crea un entorno DOM limpio y lo instala en globalThis.
 * Devuelve el window de jsdom y una función de limpieza.
 */
export function createDom(bodyHtml = '') {
  const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body>${bodyHtml}</body></html>`, {
    // pretendToBeVisual habilita requestAnimationFrame y un loop de eventos coherente.
    pretendToBeVisual: true,
  });
  const { window } = dom;

  for (const key of BROWSER_GLOBALS) {
    globalThis[key] = window[key];
  }

  function cleanup() {
    for (const key of BROWSER_GLOBALS) {
      delete globalThis[key];
    }
    window.close();
  }

  return { window, document: window.document, cleanup };
}

/**
 * Crea un recolector de detecciones para pasar como onDetection.
 * Expone .all (array), .sources (set de categorías) y .keywords.
 */
export function createCollector() {
  const all = [];
  const onDetection = (detection) => all.push(detection);
  return {
    onDetection,
    get all() { return all; },
    get sources() { return all.map((d) => d.source); },
    get keywords() { return all.map((d) => d.matchedKeyword); },
    find(source) { return all.find((d) => d.source === source); },
  };
}

/**
 * Espera a que se vacíen las microtareas para que MutationObserver dispare sus callbacks.
 * jsdom entrega las mutaciones de forma asíncrona, igual que un navegador real.
 */
export function flushMutations() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
