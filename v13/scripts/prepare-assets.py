# Decodes the text-stored logo and generates app icon / splash images.
import base64, io, os
from PIL import Image, ImageDraw

os.makedirs("src/assets", exist_ok=True)
os.makedirs("assets", exist_ok=True)
try:
    data = base64.b64decode(open("assets-b64/logo.b64").read().strip())
    lg = Image.open(io.BytesIO(data))
    lg.load()
    lg = lg.convert("RGBA")
except Exception as e:  # never fail the build because of the logo
    print("logo decode failed, using placeholder:", e)
    lg = Image.new("RGBA", (368, 417), (0, 0, 0, 0))
    ImageDraw.Draw(lg).ellipse((40, 40, 328, 328), outline=(15, 127, 138, 255), width=28)
lg.save("src/assets/logo.png")


def canvas(size, frac, bg, path):
    c = Image.new("RGBA", (size, size), bg)
    h = int(size * frac)
    w = int(lg.width * h / lg.height)
    l = lg.resize((w, h), Image.LANCZOS)
    c.paste(l, ((size - w) // 2, (size - h) // 2), l)
    c.save(path)


canvas(1024, 0.78, (255, 255, 255, 255), "assets/icon-only.png")
canvas(1024, 0.55, (0, 0, 0, 0), "assets/icon-foreground.png")
Image.new("RGBA", (1024, 1024), (255, 255, 255, 255)).save("assets/icon-background.png")
canvas(2732, 0.28, (255, 255, 255, 255), "assets/splash.png")
canvas(2732, 0.28, (255, 255, 255, 255), "assets/splash-dark.png")
print("assets ready")
