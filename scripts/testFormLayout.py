#!/usr/bin/env python3
"""
THE TWO-COLUMN "ONE GLANCE" FORM LAYOUT, MEASURED IN A REAL BROWSER (Chromium through Playwright). Exits 1 if any check fails.

  pip install playwright && playwright install chromium
  python3 scripts/testFormLayout.py --url http://localhost:5173/  [--open-form "<css selector of the button that opens the form>"] [--cookie "primus_session=<value>"]
  (default URL: the mock page formLayout.fixture.html next to this file, so you can run it before building anything)

Contract on the page (the mock page and the real form must both have it):
  .form-wrap  [data-testid="form-wrap"]  : the container (full width of the content area)       .form-layout [data-testid="form-layout"] : the grid inside it
  [data-card="start"|"f1"|"f2"|"f3"|"f4"] in the order of the steps, each (except start) with a toggle   [data-card="fN"] [aria-expanded]   and the body hidden when closed
  .card-grid : a card's boxes (two to a row when the card is wide)     .f4-grid : the seven Filter 4 cards      [data-f4-card] : one dimension card (.f4c-body inside)      [data-testid="submit-bar"] : the sticky bottom bar
Layout contract: from 940px of content width two columns: left Start, F2, F3; right F1; F4 full width below. Below 940px one column. The DOM order is always the step order.
  W1 where things sit    W2 balanced columns    W3 no sideways overflow    W4 how much is visible without scrolling    W5 how much shorter than a single column    W6 Filter 4 left and right, compact, nothing clipped
  W7 keyboard order is the step order    W8 the sticky bar never covers the last card    N1 below 940px it is one clean column    N2 Filter 4 stacks on a phone, nothing overflows
"""
import sys, os, re, argparse
from pathlib import Path
from playwright.sync_api import sync_playwright
ap = argparse.ArgumentParser(); ap.add_argument("--url", default=""); ap.add_argument("--open-form", default=""); ap.add_argument("--cookie", default="", help="name=value of a session cookie when the page needs a sign-in"); args = ap.parse_args()
URL = args.url or (Path(__file__).resolve().parent / "formLayout.fixture.html").as_uri() if not args.url else args.url
if not args.url and not (Path(__file__).resolve().parent / "formLayout.fixture.html").exists(): URL = (Path(__file__).resolve().parent.parent / "formLayout.fixture.html").as_uri()
failed = 0
def check(i, n, ok, d=""):
    global failed; print(f"{'PASS' if ok else 'FAIL'}  {i}  {n}{('  [' + d + ']') if d else ''}");
    if not ok: failed += 1
OLD = "()=>{const s=document.createElement('style');s.id='old-layout';s.textContent='.form-layout{grid-template-columns:minmax(0,1fr)!important;grid-template-areas:none!important;grid-template-rows:none!important}.form-layout>[data-card]{grid-area:auto!important}.f4-grid{grid-template-columns:minmax(0,1fr)!important}.card-grid{grid-template-columns:minmax(0,1fr)!important}';document.head.appendChild(s);}"
RECT = "(s)=>{const e=document.querySelector(s);if(!e)return null;const b=e.getBoundingClientRect();return {l:b.left,r:b.right,t:b.top+scrollY,b:b.bottom+scrollY,w:b.width,h:b.height}}"
def card(pg, k): return pg.evaluate(RECT, f'[data-card="{k}"]')
def set_open(pg, want):
    for k in ("f1", "f2", "f3", "f4"):
        t = pg.query_selector(f'[data-card="{k}"] [aria-expanded]')
        if not t: continue
        is_open = t.get_attribute("aria-expanded") == "true"
        if is_open != (k in want): t.click(); pg.wait_for_timeout(120)
def load(b, w, h, want):
    ctx = b.new_context(viewport={"width": w, "height": h})
    if args.cookie: n, v = args.cookie.split("=", 1); ctx.add_cookies([{"name": n, "value": v, "url": URL}])
    pg = ctx.new_page(); pg.goto(URL); pg.wait_for_timeout(1500 if args.cookie else 300)
    if args.open_form: pg.click(args.open_form); pg.wait_for_timeout(300)
    set_open(pg, want); pg.wait_for_timeout(200); return pg
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = load(b, 1440, 900, {"f1"}); have = pg.evaluate("()=>({wrap:!!document.querySelector('.form-wrap'),layout:!!document.querySelector('.form-layout'),cards:[...document.querySelectorAll('[data-card]')].map(e=>e.dataset.card),bar:!!document.querySelector('[data-testid=\"submit-bar\"]')})"); pg.close()
    ok0 = have["wrap"] and have["layout"] and have["cards"][:5] == ["start", "f1", "f2", "f3", "f4"] and have["bar"]
    check("W0", "the page has the layout contract: a .form-wrap with a .form-layout inside, the cards start, f1, f2, f3, f4 in step order, and a submit bar", ok0, str(have))
    if not ok0: print(f"\n{failed} CHECK(S) FAILED"); sys.exit(1)
    for (w, h) in [(1920, 1080), (1440, 900), (1366, 768)]:
        tag = f"{w}x{h}"; pg = load(b, w, h, {"f1"}); s, f1, f2, f3, f4 = [card(pg, k) for k in ("start", "f1", "f2", "f3", "f4")]; bar = pg.evaluate(RECT, '[data-testid="submit-bar"]')["h"]
        check("W1", f"{tag}: two columns: the idea on the left with Filter 2 then Filter 3 under it, Filter 1 on the right at the same height, Filter 4 across the full width below", s["l"] < f1["l"] and abs(s["t"] - f1["t"]) <= 4 and abs(f2["l"] - s["l"]) <= 2 and abs(f3["l"] - s["l"]) <= 2 and s["t"] < f2["t"] < f3["t"] and abs(f4["l"] - s["l"]) <= 2 and f4["r"] >= f1["r"] - 2 and f4["t"] >= max(f3["b"], f1["b"]) - 1, f"start x{s['l']:.0f} f1 x{f1['l']:.0f} f4 {f4['l']:.0f}-{f4['r']:.0f}")
        check("W2", f"{tag}: the two columns are about the same width (ratio between 0.85 and 1.18)", 0.85 <= s["w"] / f1["w"] <= 1.18, f"{s['w']:.0f} vs {f1['w']:.0f}")
        ov = pg.evaluate("()=>({sx:document.documentElement.scrollWidth>innerWidth,cards:[...document.querySelectorAll('[data-card]')].filter(e=>e.getBoundingClientRect().right>document.querySelector('.form-wrap').getBoundingClientRect().right+1).length})"); check("W3", f"{tag}: nothing overflows sideways", not ov["sx"] and ov["cards"] == 0, str(ov))
        avail = h - bar; bottom = f4["b"]
        check("W4", f"{tag}: in the opening state (Filter 1 open) the whole form is in view or just past it: it ends within {'the first screen' if h >= 1080 else '1.25 screens'}", bottom <= avail + (0 if h >= 1080 else 0.25 * avail), f"ends at {bottom:.0f}px, a screen is {avail:.0f}px")
        pg.close()
        pg = load(b, w, h, {"f1", "f2", "f3", "f4"}); new_h = pg.evaluate("()=>document.querySelector('.form-layout').getBoundingClientRect().height"); s, f1, f2, f3, f4 = [card(pg, k) for k in ("start", "f1", "f2", "f3", "f4")]
        lb, rb = f3["b"] - s["t"], f1["b"] - f1["t"]
        check("W2", f"{tag}: with everything open the columns stay reasonably balanced: the shorter is at least 60% of the taller", min(lb, rb) / max(lb, rb) >= 0.60, f"left {lb:.0f}px, right {rb:.0f}px")
        pg.evaluate(OLD); pg.wait_for_timeout(250); old_h = pg.evaluate("()=>document.querySelector('.form-layout').getBoundingClientRect().height")
        check("W5", f"{tag}: with everything open the page is at least 30% shorter than the same cards in one column ({new_h:.0f}px against {old_h:.0f}px)", new_h <= 0.70 * old_h, f"{100 * (old_h - new_h) / old_h:.0f}% shorter"); pg.close()
        pg = load(b, w, h, {"f1", "f4"}); g = pg.evaluate("()=>{const c=[...document.querySelectorAll('[data-f4-card]')].filter(e=>e.offsetParent);const lefts=[...new Set(c.map(e=>Math.round(e.getBoundingClientRect().left)))];const rows=[...new Set(c.map(e=>Math.round(e.getBoundingClientRect().top)))];return {n:c.length,cols:lefts.length,rows:rows.length,maxH:Math.max(...c.map(e=>e.getBoundingClientRect().height)),clipped:c.filter(e=>e.scrollHeight>e.clientHeight+1).length,webVisible:c.filter(e=>{const wc=[...e.querySelectorAll('*')].filter(x=>/web check/i.test(x.textContent)).pop();if(!wc)return false;const r=wc.getBoundingClientRect();const er=e.getBoundingClientRect();return r.width>40&&r.height>0&&r.bottom<=er.bottom+1&&r.right<=er.right+1}).length}}")
        check("W6", f"{tag}: Filter 4's seven cards sit left and right (2 columns, 4 rows), each at most 260px tall, none clipped, the web check always visible", g["n"] == 7 and g["cols"] == 2 and g["rows"] == 4 and g["maxH"] <= 260 and g["clipped"] == 0 and g["webVisible"] == 7, str(g)); pg.close()
    pg = load(b, 1440, 900, {"f1", "f2", "f3", "f4"}); o = pg.evaluate("()=>({dom:[...document.querySelectorAll('[data-card]')].map(e=>e.dataset.card).join(),pos:[...document.querySelectorAll('[tabindex]')].filter(e=>Number(e.getAttribute('tabindex'))>0).length})")
    check("W7", "keyboard order is the step order: the cards are in the DOM as start, f1, f2, f3, f4 (so Tab goes in the order of the sidebar steps) and nothing uses a positive tabindex", o["dom"].startswith("start,f1,f2,f3,f4") and o["pos"] == 0, str(o))
    pg.evaluate("window.scrollTo(0, document.documentElement.scrollHeight)"); pg.wait_for_timeout(150); last = pg.evaluate("()=>{const c=[...document.querySelectorAll('[data-card]')].pop().getBoundingClientRect();const bar=document.querySelector('[data-testid=submit-bar]').getBoundingClientRect();return {cardBottom:c.bottom,barTop:bar.top}}")
    check("W8", "scrolled to the end, the last card is fully above the sticky bar (the bar never hides a box)", last["cardBottom"] <= last["barTop"] + 1, f"card ends {last['cardBottom']:.0f}, bar starts {last['barTop']:.0f}"); pg.close()
    for (w, h) in [(1024, 768), (768, 1024), (390, 844)]:
        pg = load(b, w, h, {"f1", "f2", "f3", "f4"}); cs = [card(pg, k) for k in ("start", "f1", "f2", "f3", "f4")]; ov = pg.evaluate("()=>document.documentElement.scrollWidth>innerWidth"); cw = pg.evaluate("()=>document.querySelector('.form-wrap').getBoundingClientRect().width")
        two = cw >= 940
        if two: okc = cs[0]["l"] < cs[1]["l"] and abs(cs[0]["t"] - cs[1]["t"]) <= 4 and abs(cs[2]["l"] - cs[0]["l"]) <= 2 and not ov
        else: okc = len({round(c['l']) for c in cs}) == 1 and max(c["w"] for c in cs) - min(c["w"] for c in cs) <= 1 and all(cs[i]["t"] < cs[i + 1]["t"] for i in range(4)) and not ov
        check("N1", f"{w}px wide (the form area is {cw:.0f}px): {'two columns, as the form area is 940px or more' if two else 'one clean column, as the form area is under 940px'}, in step order, and nothing scrolls sideways", okc, f"lefts {sorted({round(c['l']) for c in cs})}")
        g = pg.evaluate("()=>{const f=document.querySelector('[data-card=f4]').getBoundingClientRect().width;const c=[...document.querySelectorAll('[data-f4-card]')].filter(e=>e.offsetParent);return {f4w:Math.round(f),cols:[...new Set(c.map(e=>Math.round(e.getBoundingClientRect().left)))].length,clipped:c.filter(e=>e.scrollHeight>e.clientHeight+1).length,wide:c.filter(e=>e.getBoundingClientRect().right>innerWidth+1).length}}")
        want = 2 if g["f4w"] >= 940 else 1
        check("N2", f"{w}px wide: Filter 4's cards are in {want} column{'s' if want == 2 else ''} (its card is {g['f4w']}px wide), none clipped or wider than the screen", g["cols"] == want and g["clipped"] == 0 and g["wide"] == 0, str(g)); pg.close()
    b.close()
print(f"\n{failed} CHECK(S) FAILED" if failed else "\nPASS the two-column layout holds at every size"); sys.exit(1 if failed else 0)
