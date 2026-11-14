import sys
from playwright.sync_api import sync_playwright
from PIL import Image
html,base,out=sys.argv[1:4]
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1600,'height':900})
    pg.goto('file:///home/claude/deck/'+html); pg.wait_for_timeout(800)
    pg.screenshot(path='ov.png',omit_background=True); b.close()
bg=Image.open(base).convert('RGBA'); ov=Image.open('ov.png').convert('RGBA')
Image.alpha_composite(bg,ov).convert('RGB').save(out,quality=92)
