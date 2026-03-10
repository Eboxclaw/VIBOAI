# Tauri Content Security Policy (CSP)

This project now uses an explicit CSP in `src-tauri/tauri.conf.json` instead of `null`.

## Final policy

```text
default-src 'self';
base-uri 'self';
form-action 'self';
frame-ancestors 'none';
img-src 'self' data: blob:;
font-src 'self' https://fonts.gstatic.com;
style-src 'self' https://fonts.googleapis.com;
style-src-attr 'unsafe-inline';
script-src 'self';
connect-src 'self' http://localhost:5173 ws://localhost:5173 http://localhost:11434 http://localhost:11435 https://api.anthropic.com https://openrouter.ai https://api.moonshot.cn https://api.minimax.chat;
object-src 'none';
```

## Why each directive exists

- `default-src 'self'`: baseline deny-by-default policy for all unspecified resource types.
- `script-src 'self'`: app scripts are bundled locally (`index.html` loads `/src/main.tsx` in dev, bundled assets in prod).
- `style-src 'self' https://fonts.googleapis.com`: local CSS plus Google Fonts stylesheet import from `src/index.css`.
- `style-src-attr 'unsafe-inline'`: currently required because the React UI uses many inline style attributes (`style={{ ... }}`) in components.
- `font-src 'self' https://fonts.gstatic.com`: allows font files loaded by Google Fonts CSS.
- `img-src 'self' data: blob:`: supports local assets and generated preview/blob/data URLs.
- `connect-src ...`: allows renderer-side fetch/HMR endpoints actually used today:
  - `http://localhost:5173` and `ws://localhost:5173` for Vite dev server + HMR.
  - `http://localhost:11434` (Ollama default) and `http://localhost:11435` (Leap local endpoint) from model provider configs.
  - `https://api.anthropic.com`, `https://openrouter.ai`, `https://api.moonshot.cn`, `https://api.minimax.chat` for cloud model streaming called in `src/lib/lfm.ts`.
- `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`, `object-src 'none'`: hardening directives (prevent base tag injection, form exfiltration, clickjacking embedding, and plugin/object content).

## Validation notes

- Provider calls made from **Rust** are not constrained by renderer CSP. Only browser-context requests (e.g., `fetch` in `src/lib/lfm.ts`) require `connect-src` entries.
- If the app starts calling additional endpoints directly from the renderer, update `connect-src` first.
- If you remove inline style attributes from React components, you can tighten CSP by removing `style-src-attr 'unsafe-inline'`.

## CSP update checklist for future UI/network changes

1. Added a new external fetch/WebSocket/SSE endpoint in frontend code? Add only that origin to `connect-src`.
2. Added a new external stylesheet or font provider? Update `style-src`/`font-src` with exact origins.
3. Added inline `<script>`/`<style>` blocks? Prefer refactoring; if unavoidable, scope narrowly and document why.
4. Re-run app in dev and production to confirm no CSP violations in webview console.
