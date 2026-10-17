# Generates app icon / splash images from the logo (runs in CI).
from PIL import Image

lg = Image.open('src/assets/logo.png').convert('RGBA')

def canvas(size, frac, bg, path):
    c = Image.new('RGBA', (size, size), bg)
    h = int(size * frac)
    w = int(lg.width * h / lg.height)
    l = lg.resize((w, h), Image.LANCZOS)
    c.paste(l, ((size - w) // 2, (size - h) // 2), l)
    c.save(path)

canvas(1024, 0.78, (255, 255, 255, 255), 'assets/icon-only.png')
canvas(1024, 0.55, (0, 0, 0, 0), 'assets/icon-foreground.png')
Image.new('RGBA', (1024, 1024), (255, 255, 255, 255)).save('assets/icon-background.png')
canvas(2732, 0.28, (255, 255, 255, 255), 'assets/splash.png')
canvas(2732, 0.28, (255, 255, 255, 255), 'assets/splash-dark.png')
print('icons ok')
