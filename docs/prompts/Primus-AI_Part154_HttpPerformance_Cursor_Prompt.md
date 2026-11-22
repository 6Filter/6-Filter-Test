# 6 Filter Test — Cursor Build Prompt, Part 154: Compress and cache what the server sends

## Why (measured on the latest build)

`server.js` is a plain Node HTTP server. It sends everything raw and sets no caching header:
- the app bundle is **1.65 MB** (480 KB gzipped) sent as 1,650,178 raw bytes on every visit;
- an evaluated idea is about **17 KB** of JSON in the Log list, so the Log is about **6 MB at 508 ideas, 12 MB at 1,000, 23 MB at the 2,000-idea cap**, all raw;
- no `Cache-Control` anywhere: the browser re-downloads the bundle, and nothing says the private API answers must not be cached.
(Render's own edge may compress some answers; the live response headers tell. Doing it in the app is safe either way, because an answer that already has a `Content-Encoding` is left alone.)

## Decisions (build the DEFAULT; no change to any response's content)

- **D148 Compress text answers.** gzip when the browser sends `Accept-Encoding: gzip`, for text-like types only (HTML, JS, CSS, JSON, SVG), answers of at least 1 KB, and not already encoded. Never for HEAD, 204, 304, images or downloads (PDF, Excel). Add `Vary: Accept-Encoding`. Use the asynchronous `zlib.gzip` so a 6 MB answer never blocks the server. Keep the compressed copy of each file in `dist/` in memory (they do not change between deploys).
- **D149 Cache sensibly.** Files whose name carries a hash (`/assets/index-AbC123.js`) get `Cache-Control: public, max-age=31536000, immutable`. `index.html` gets `no-cache`. Every `/api/*` answer gets `Cache-Control: no-store` (it is private data).
- **D150 Never change what is sent.** The compressed answer must decompress to exactly the same bytes; the security headers (nosniff, no framing, HSTS, CSP) stay on every answer.
- **D151 Then look at the Log itself** (separate, after this passes): the Log loads every idea into the browser at once (23 MB at the cap, even gzipped several MB). Propose server-side paging and filtering, with the counts still exact; do not build it in this part.

## Reference and test (attached; do NOT edit the test)

`Part154_scratch_reference.diff` (a new `lib/httpPerformance.js` and a 2-line hook in `server.js`). `testHttpPerformance.mjs` (7 checks: it starts the real server on a throwaway database and talks to it over HTTP, reading the bytes that really cross the wire). Today it fails four checks; with the reference all pass: bundle 1,650,178 to 495,084 bytes, a Log of 60 ideas 73,174 to 2,756 bytes, assets cached for a year, API never cacheable. Four deliberate breaks (no `Vary`, the page cached for a year, API answers cacheable, tiny answers compressed) were each caught.

## Acceptance checklist

- [ ] The bundle and large API answers are gzip, much smaller, identical when decompressed.
- [ ] Hashed assets are immutable for a year; the page is never stale; `/api` is `no-store`.
- [ ] Images, downloads and HEAD requests are untouched; the security headers are on every answer.
- [ ] `testHttpPerformance.mjs` passes untouched; the regression suite stays green.
