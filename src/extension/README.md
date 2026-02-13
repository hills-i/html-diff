# HTML Diff - Browser Extension

Side-by-side visual comparison tool for web pages with difference highlighting. Built with Manifest V3.

## Install

### Chrome
1. Open `chrome://extensions/`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** → select the `src/extension/` folder
4. Click the extension icon → HTML Diff opens in a new tab

### Edge
1. Open `edge://extensions/`
2. Enable **Developer mode** (bottom left)
3. Click **Load unpacked** → select the `src/extension/` folder
4. Click the extension icon → HTML Diff opens in a new tab

### Firefox (v109+)
1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on**
3. Select any file from the `src/extension/` folder
4. Click the extension icon → HTML Diff opens in a new tab

## Usage

1. **Select Mode** — choose an input mode:
   - **Full URL**: Enter two complete URLs to compare (e.g., `https://example.com/page1.html` vs `https://example.org/page1.html`)
   - **Domain + Path**: Enter two domains and a shared path to compare the same page across environments (e.g., staging vs production)
2. Click **Compare!**
3. Differences are highlighted in yellow with orange outlines; text-level differences are shown in red
4. Scroll is synchronized between both panels
5. Click links inside the compared pages to navigate — in Domain + Path mode the path input updates automatically
6. Optional features:
   - **Auto Compare**: Automatically re-compare when you click a link in either panel
   - **Ignore Domain Differences**: Treats occurrences of the two domains as identical when comparing text and attributes

## How It Works

1. The service worker (`background.js`) fetches both URLs using the browser's `fetch` API with `host_permissions`, bypassing CORS restrictions
2. Fetched HTML is sanitized (scripts and event handlers removed) and a `<base>` tag is injected for correct relative-URL resolution
3. Sanitized HTML is loaded into sandboxed iframes (`allow-same-origin` only)
4. A recursive DOM comparison walks both trees in parallel, comparing node types, tag names, attributes, and text content
5. Differing text is highlighted at the word level; differing elements receive the `.diff-highlight` class

## Security

- Only fetches the two URLs entered by the user — no other external communication
- `<script>` tags and `on*` event handler attributes are stripped from fetched HTML
- Iframes are sandboxed with `allow-same-origin` only — no script execution in fetched pages
- Content Security Policy: `script-src 'self'; object-src 'none'`
- URL validation: only `http://` and `https://` schemes are allowed

## Files

| File | Description |
|------|-------------|
| `manifest.json` | Manifest V3 configuration (Chrome, Edge, Firefox) |
| `background.js` | Service worker — fetches URLs, sanitizes HTML, injects `<base>` tags |
| `diff.html` | UI layout with mode switcher and iframe containers |
| `diff.css` | Styles |
| `diff.js` | DOM comparison, text-level diffing, scroll sync, and link interception |
| `icons/` | Extension icons (16, 48, 128 px) |
