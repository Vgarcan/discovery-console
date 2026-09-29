#!/usr/bin/env python3
"""
Capture the screenshots used in README.md.

    pip install playwright && playwright install chromium
    python3 tools/screenshots.py

Serves the project over localhost (localStorage is blocked on file://), seeds the
demo session, drives the real UI and writes PNGs to docs/images/.

Note on fonts: the app loads Instrument Sans and Martian Mono from Google Fonts.
If the machine running this cannot reach fonts.googleapis.com, Chromium falls back
to whatever is installed and the screenshots will not match the published app.
"""

import http.server
import json
import os
import socketserver
import threading
import time

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "docs", "images")
PORT = 8765
DEMO = os.path.join(ROOT, "assets", "data", "demo-session-ach-returns.json")
KEY = "process.discovery.console.v1"


def serve():
    os.chdir(ROOT)
    handler = http.server.SimpleHTTPRequestHandler
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(("127.0.0.1", PORT), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def main():
    os.makedirs(OUT, exist_ok=True)
    httpd = serve()

    session = json.load(open(DEMO, encoding="utf-8"))
    session["seconds"] = 3187
    seed = json.dumps(session)

    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--force-color-profile=srgb", "--font-render-hinting=none"])

        def page(width=1500, height=940, state=None):
            ctx = browser.new_context(viewport={"width": width, "height": height}, device_scale_factor=1.5)
            ctx.add_init_script("localStorage.setItem(%s, %s);" % (json.dumps(KEY), json.dumps(state or seed)))
            pg = ctx.new_page()
            pg.goto("http://127.0.0.1:%d/index.html" % PORT)
            pg.wait_for_selector(".channel")
            pg.wait_for_timeout(450)
            return ctx, pg

        def shot(pg, name, selector=None, max_height=None):
            path = os.path.join(OUT, name + ".png")
            if selector and max_height:
                box = pg.locator(selector).bounding_box()
                pg.screenshot(path=path, clip={
                    "x": box["x"], "y": box["y"],
                    "width": box["width"], "height": min(box["height"], max_height)})
            elif selector:
                pg.locator(selector).screenshot(path=path)
            else:
                pg.screenshot(path=path)
            print("  " + name + ".png")

        print("capturing:")

        # 1. the capture console, exceptions area
        ctx, pg = page()
        pg.keyboard.press("Escape")
        pg.keyboard.press("7")
        pg.wait_for_timeout(250)
        shot(pg, "01-capture-console")

        # 2. the inspector: colour-coded tape with an open thread
        pg.click('#tapeFilter .tagf:has-text("Exceptions")')
        pg.wait_for_timeout(250)
        pg.locator("#tape .tape-row .reply-btn").first.click()
        pg.wait_for_timeout(250)
        shot(pg, "02-tape-threads", "#inspector", 880)

        # 3. open questions
        pg.click('.tab[data-tab="gaps"]')
        pg.wait_for_timeout(250)
        shot(pg, "03-open-questions", "#inspector", 880)
        ctx.close()

        # 4. tag filtering on the stage
        ctx, pg = page()
        pg.keyboard.press("Escape")
        pg.keyboard.press("1")
        pg.wait_for_timeout(200)
        pg.click('#tagBar .tagf:has-text("Internal")')
        pg.wait_for_timeout(250)
        shot(pg, "04-tag-filter", "#stage", 780)
        ctx.close()

        # 5. the relationship map
        ctx, pg = page()
        pg.click('.ico[data-view="map"]')
        pg.wait_for_timeout(2600)
        pg.click("#mapFit")
        pg.wait_for_timeout(400)
        shot(pg, "05-relationship-map")

        # 6. the map filtered by a tag, linked items kept
        pg.click('#mapTags .tagf:has-text("Third party")')
        pg.wait_for_timeout(2600)
        pg.click("#mapFit")
        pg.wait_for_timeout(400)
        shot(pg, "06-map-tag-filter")

        # 12. one node selected: everything it is not wired to drops back, and
        #     the panel opens on whatever the session holds about it
        pg.click("#mapClear")
        pg.wait_for_timeout(2600)
        pg.click("#mapFit")
        pg.wait_for_timeout(400)
        pg.evaluate("""() => {
          const c = {};
          M.links.forEach(l => { c[l.s.id]=(c[l.s.id]||0)+1; c[l.t.id]=(c[l.t.id]||0)+1; });
          selectNode(Object.entries(c).sort((a,b)=>b[1]-a[1])[0][0]);
        }""")
        pg.wait_for_timeout(700)
        shot(pg, "12-map-selection")
        # 14. the panel alone: everything the session holds about one node
        shot(pg, "14-map-panel", "#mapDetail", 620)
        ctx.close()

        # 13. the session record: every entry, in order
        ctx, pg = page()
        pg.click('.ico[data-view="review"]')
        pg.wait_for_timeout(500)
        pg.click("#rvTabRecord")
        pg.wait_for_timeout(400)
        shot(pg, "13-session-record")
        ctx.close()

        # 7. review
        ctx, pg = page()
        pg.click('.ico[data-view="review"]')
        pg.wait_for_timeout(500)
        shot(pg, "07-review")
        ctx.close()

        # 8. the PDD draft
        ctx, pg = page()
        pg.click('.ico[data-view="pdd"]')
        pg.wait_for_timeout(500)
        shot(pg, "08-pdd-draft")

        # 9. the exception table, where replies become business actions
        pg.evaluate("""() => {
          const t = [...document.querySelectorAll('.pdd-sec')]
            .find(s => s.textContent.includes('Process Exceptions'));
          t.scrollIntoView({block:'center'});
        }""")
        pg.wait_for_timeout(350)
        pg.locator(".pdd-sec", has_text="Process Exceptions").screenshot(
            path=os.path.join(OUT, "09-pdd-exceptions.png"))
        print("  09-pdd-exceptions.png")

        # 10. importing a session file
        pg.click("#importBtn")
        pg.wait_for_timeout(200)
        pg.set_input_files("#importFile", DEMO)
        pg.wait_for_timeout(400)
        shot(pg, "10-import-session", "#importScrim .sheet")
        ctx.close()

        # 15. the guided tour, on a console with nothing in it yet
        ctx = browser.new_context(viewport={"width": 1500, "height": 940},
                                  device_scale_factor=1.5)
        pg = ctx.new_page()
        pg.goto("http://127.0.0.1:%d/index.html" % PORT)
        pg.wait_for_selector(".channel")
        pg.wait_for_timeout(900)
        pg.click("#tourNext")          # 2: the areas rail
        pg.wait_for_timeout(200)
        pg.click("#tourNext")          # 3: the capture field, mid-screen
        pg.wait_for_timeout(500)
        shot(pg, "15-guided-tour")
        ctx.close()

        # 11. light theme, panels collapsed
        ctx, pg = page()
        pg.click("#themeBtn")
        pg.keyboard.press("Escape")
        pg.keyboard.press("[")
        pg.keyboard.press("]")
        pg.wait_for_timeout(400)
        shot(pg, "11-light-focus")
        ctx.close()

        browser.close()
    httpd.shutdown()
    print("done -> docs/images/")


if __name__ == "__main__":
    main()
