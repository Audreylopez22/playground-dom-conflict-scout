# Test suite for `@audreylopez/dom-conflict-scout`

Test set (console + visual) for the **DOM Conflict Scout** library, which
detects DOM injections made by browser extensions (adblockers,
translators, grammar checkers, password managers, Web3 wallets, etc.).

## What the library does (verified summary from the code)

- Exposes the `DomConflictScout` class with `start()` and `stop()`.
- On `start()` it mounts a `MutationObserver` on `document.body` **and** performs an
  initial scan of the entire existing subtree.
- For each element, it builds the string `id + " " + className` (lowercased) and
  compares it against a dictionary of "fingerprints" grouped into 8 categories.
- On a match, it calls `onDetection({ source, matchedKeyword, element })`.
- It **ignores** `<script>` and `<style>` elements and anything under `[data-v-app]`.
- Detection is based **only on `id` and `className`** (not on other attributes nor on
  `outerHTML`, despite what the official README suggests).

The 8 categories: `ADBLOCKER`, `TRANSLATOR`, `GRAMMAR`, `COUPONS`,
`PASSWORD_MANAGERS`, `ACCESSIBILITY_DARK`, `WEB3_WALLETS`, `DEV_TOOLS_OVERLAYS`.

---

## 1. Console tests (22 tests, all green)

They mount a real DOM with **jsdom** and inject extension fingerprints to check that
the detector identifies them (or correctly ignores them).

```bash
pnpm install      # install dependencies (jsdom, puppeteer-core)
pnpm test         # run the 22 console tests
```

Also:

```bash
pnpm test:watch   # watch mode
```

Coverage (which package cases are exercised):

1. Detection by `className` of the **8 categories** (8 tests).
2. Detection by `id` attribute (`goog-gt-` → `TRANSLATOR`).
3. **Dynamic** injection after `start()` captured by `MutationObserver`.
4. **No false positives** with legitimate DOM.
5. Ignores `<script>` elements even if they match.
6. Ignores `<style>` elements even if they match.
7. Ignores subtrees under `[data-v-app]` (Vue apps).
8. `stop()` halts detection of new injections.
9. **Case-insensitive** matching.
10. Detection of **multiple different extensions** at once.
11. The initial scan reaches pre-existing **nested nodes**.
12. Does not throw if `onDetection` is omitted.
13. Captures a **burst** of dynamic injections.
14. Shape of the detection object (`source`, `matchedKeyword`, `element`).
15. **Substring** precedence in the dictionary (`skiptranslate` → `translate`).

---

## 2. Visual tests

### a) Automatic validation (headless, with checks)

Opens the playground in headless Chrome, fires the real injections, checks that
the library detects and flags them, and saves screenshots as evidence.

```bash
pnpm test:visual
```

Generates:
- `tests/visual/resultado-detecciones.png` — the 8 extensions detected and flagged.
- `tests/visual/resultado-final.png` — state after testing a false positive and `stop()`.

> Requires Google Chrome at `/usr/bin/google-chrome`. If it lives elsewhere, edit the
> `CHROME` constant in `tests/visual/validate-visual.mjs`.

### b) Interactive playground (real use case)

```bash
pnpm playground
# Open in the browser:  http://localhost:5173/
```

The playground simulates a **real use case**: an online store ("NovaShop") inside
a browser frame. Each button in the top bar simulates a **visitor's browser
extension** that injects its UI on top of your site without permission:

- 🍯 **Honey** → coupon pop-up in the corner.
- 🔐 **Bitwarden** → autofill menu over the login field.
- 🌐 **Google Translate** → translation bar at the top.
- ✍️ **Grammarly** → floating button over the review box.
- 🦊 **MetaMask** → "Connect wallet" modal in the center.
- 🚫 **AdBlock** → covers the site's ad slot.
- 🌙 **Dark Reader** → dark-mode layer over the whole page.
- 🎥 **Loom** → screen-recording bar.

Each injected widget the library detects is highlighted with a **dashed red border
and a badge** showing the category, and it appears in the **detector panel** (right)
with a natural-language report, the `matchedKeyword`, and live counters.

Other buttons:
- **⚡ Simulate all**: fires the 8 extensions in sequence.
- **+ Legitimate site change**: adds an element of your own → the library does **not**
  flag it (proves the absence of false positives).
- **Stop / Resume detector**: calls `stop()` / `start()`.
- **Clear page**: resets the site.

This way the end client sees the value at a glance: extensions alter their site and the
library identifies them in real time.

---

## Structure

```
tests/
  console/
    helpers.mjs        # jsdom setup + utilities
    scout.test.mjs     # 22 tests (node:test)
  visual/
    playground.html    # interactive playground
    serve.mjs          # dependency-free static server
    validate-visual.mjs# headless validation with screenshots
```
