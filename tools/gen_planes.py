"""
Генератор піксель-арт літаків для гри.
Силует задається полігонами (64x64), далі автоматичне світло/тінь, контур і масштаб x3.

Запуск: python tools/gen_planes.py public/assets/sprites
"""
import math
import sys

import numpy as np
from PIL import Image, ImageDraw

N = 64
OUT = sys.argv[1] if len(sys.argv) > 1 else 'public/assets/sprites'


def mirror(pts):
    """Дзеркальна копія полігона відносно вертикальної осі."""
    return [(N - 1 - x, y) for x, y in pts]


def sym(pts):
    """Симетричний полігон з точок лівої половини (зверху вниз)."""
    return pts + [(N - 1 - x, y) for x, y in reversed(pts)]


GLASS = (40, 60, 110, 255)
GLINT = (190, 230, 255, 255)
DARK = (40, 40, 52, 255)
STEEL = (150, 156, 172, 255)
OUTLINE = (18, 14, 28, 255)


def shade(img):
    """Світло зліва-згори: світлі краї зверху/зліва, темні справа/знизу."""
    a = np.array(img).astype(float)
    al = a[..., 3] > 0
    out = a.copy()
    for y in range(N):
        for x in range(N):
            if not al[y, x]:
                continue
            left = x > 0 and al[y, x - 1]
            right = x < N - 1 and al[y, x + 1]
            up = y > 0 and al[y - 1, x]
            down = y < N - 1 and al[y + 1, x]
            c = out[y, x, :3]
            if not left or not up:
                c = np.minimum(255, c * 1.25 + 30)
            elif not right or not down:
                c = c * 0.55
            elif x >= N // 2:
                c = c * 0.82
            out[y, x, :3] = c
    return Image.fromarray(out.astype(np.uint8))


def outline(img):
    a = np.array(img)
    al = a[..., 3] > 0
    ring = np.zeros_like(al)
    ring[1:, :] |= al[:-1, :]
    ring[:-1, :] |= al[1:, :]
    ring[:, 1:] |= al[:, :-1]
    ring[:, :-1] |= al[:, 1:]
    ring &= ~al
    a[ring] = OUTLINE
    return Image.fromarray(a)


def draw(d, items):
    for kind, geo, col in items:
        if kind == 'point':
            d.point(geo, fill=col)
        elif kind == 'line':
            d.line(geo, fill=col, width=1)
        else:
            getattr(d, kind)(geo, fill=col)


def layer(body, details=(), holes=()):
    img = Image.new('RGBA', (N, N), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    draw(d, body)
    for geo in holes:
        d.ellipse(geo, fill=(0, 0, 0, 0))
    img = shade(img)
    draw(ImageDraw.Draw(img), details)
    return img


def save(name, img):
    outline(img).resize((N * 3, N * 3), Image.NEAREST).save(f'{OUT}/plane-{name}.png', optimize=True)


def cockpit(x0, y0, x1, y1, col=GLASS):
    return [('ellipse', (x0, y0, x1, y1), col), ('point', [(x0 + 1, y0 + 2), (x0 + 1, y0 + 3)], GLINT)]


def wasp():
    y = (250, 200, 40, 255)
    front = [(26, 22), (8, 12), (5, 17), (26, 32)]
    back = [(26, 38), (11, 50), (14, 54), (27, 48)]
    body = [
        ('polygon', sym([(31, 8), (27, 18), (26, 44), (28, 54), (31, 56)]), y),
        ('polygon', front, y), ('polygon', mirror(front), y),
        ('polygon', back, y), ('polygon', mirror(back), y),
    ]
    details = [
        ('rectangle', (27, 30, 36, 32), DARK), ('rectangle', (27, 37, 36, 39), DARK), ('rectangle', (27, 44, 36, 46), DARK),
        ('line', [(9, 15), (20, 22)], DARK), ('line', mirror([(9, 15), (20, 22)]), DARK),
    ] + cockpit(28, 14, 35, 24, (170, 30, 30, 255))
    return layer(body, details)


def collector():
    t = (40, 190, 170, 255)
    p = (60, 140, 210, 255)
    red = (220, 50, 50, 255)
    body = [
        ('polygon', sym([(31, 6), (24, 12), (22, 40), (24, 56), (31, 58)]), t),
        ('rounded_rectangle', (6, 18, 15, 52), p), ('rounded_rectangle', (48, 18, 57, 52), p),
        ('rectangle', (15, 27, 22, 33), STEEL), ('rectangle', (41, 27, 48, 33), STEEL),
        ('rectangle', (15, 40, 22, 44), STEEL), ('rectangle', (41, 40, 48, 44), STEEL),
    ]
    details = [
        ('rectangle', (7, 13, 14, 18), red), ('rectangle', (49, 13, 56, 18), red),
        ('rectangle', (7, 13, 8, 18), STEEL), ('rectangle', (49, 13, 50, 18), STEEL),
        ('rectangle', (8, 50, 13, 54), DARK), ('rectangle', (50, 50, 55, 54), DARK),
        ('rectangle', (28, 36, 35, 46), (30, 120, 110, 255)),
    ] + cockpit(27, 12, 36, 24)
    return layer(body, details)


def swift():
    w = (225, 232, 245, 255)
    c = (40, 200, 240, 255)
    wing = [(27, 40), (7, 18), (4, 22), (27, 50)]
    canard = [(28, 16), (19, 13), (19, 17), (28, 21)]
    fin = [(27, 52), (19, 61), (27, 59)]
    body = [('polygon', sym([(31, 2), (28, 12), (27, 50), (29, 60), (31, 61)]), w)]
    for part in (wing, canard, fin):
        body += [('polygon', part, w), ('polygon', mirror(part), w)]
    details = [
        ('line', [(8, 20), (26, 44)], c), ('line', mirror([(8, 20), (26, 44)]), c), ('line', [(31, 26), (31, 56)], c),
        ('rectangle', (28, 58, 35, 61), DARK),
    ] + cockpit(28, 9, 35, 20)
    return layer(body, details)


def titan():
    g = (215, 165, 50, 255)
    wing = [(18, 24), (3, 32), (3, 46), (18, 46)]
    body = [
        ('polygon', sym([(31, 4), (22, 10), (18, 30), (18, 52), (24, 58), (31, 58)]), g),
        ('polygon', wing, g), ('polygon', mirror(wing), g),
        ('rectangle', (19, 52, 27, 62), STEEL), ('rectangle', (36, 52, 44, 62), STEEL),
        ('rectangle', (7, 16, 10, 32), STEEL), ('rectangle', (53, 16, 56, 32), STEEL),
    ]
    details = [
        ('rectangle', (20, 59, 26, 62), DARK), ('rectangle', (37, 59, 43, 62), DARK),
        ('rectangle', (4, 40, 17, 42), (150, 100, 30, 255)), ('rectangle', (46, 40, 59, 42), (150, 100, 30, 255)),
        ('rectangle', (25, 30, 38, 48), (180, 130, 40, 255)), ('line', [(31, 30), (31, 48)], (120, 80, 20, 255)),
    ] + cockpit(26, 8, 37, 22)
    return layer(body, details)


def chronos():
    v = (150, 80, 230, 255)
    ring = layer([('ellipse', (8, 16, 55, 54), v)], holes=[(15, 23, 48, 47)])
    dots = []
    for ang in range(0, 360, 45):
        x = 31.5 + math.cos(math.radians(ang)) * 20
        y = 35 + math.sin(math.radians(ang)) * 16
        dots.append(('rectangle', (int(x), int(y), int(x) + 1, int(y) + 1), (90, 240, 255, 255)))
    draw(ImageDraw.Draw(ring), dots)
    fus = layer(
        [('polygon', sym([(31, 3), (28, 12), (27, 56), (31, 60)]), (200, 200, 225, 255))],
        cockpit(28, 10, 35, 22, (60, 230, 240, 255)) + [('line', [(31, 26), (31, 54)], v)],
    )
    # контур фюзеляжу всередині кільця, щоб він читався
    return Image.alpha_composite(ring, outline(fus))


def thunder():
    b = (50, 110, 230, 255)
    yl = (255, 220, 60, 255)
    bolt = [(12, 44), (18, 36), (16, 36), (22, 28)]
    body = [('polygon', sym([(31, 5), (4, 50), (9, 55), (31, 50)]), b), ('rectangle', (24, 46, 39, 61), STEEL)]
    details = [
        ('line', bolt, yl), ('line', mirror(bolt), yl),
        ('rectangle', (26, 57, 37, 61), DARK), ('rectangle', (28, 58, 35, 60), (120, 200, 255, 255)),
    ] + cockpit(27, 16, 36, 30)
    return layer(body, details)


def ufo():
    lights = []
    for i in range(10):
        ang = i / 10 * math.tau
        x = 31.5 + math.cos(ang) * 22
        y = 31.5 + math.sin(ang) * 22
        lights.append(('rectangle', (int(x) - 1, int(y) - 1, int(x), int(y)), (255, 220, 60, 255) if i % 2 else (255, 80, 80, 255)))
    details = [
        ('ellipse', (13, 13, 50, 50), (140, 148, 165, 255)),
        ('ellipse', (20, 20, 43, 43), (70, 210, 120, 255)),
        ('ellipse', (24, 22, 33, 30), (170, 255, 200, 255)),
    ] + lights
    return layer([('ellipse', (5, 5, 58, 58), (180, 190, 205, 255))], details)


def phoenix():
    r = (230, 70, 40, 255)
    o = (250, 170, 40, 255)
    wing = [(27, 18), (14, 15), (2, 22), (7, 25), (3, 31), (10, 31), (7, 37), (16, 35), (27, 34)]
    tail = [(28, 46), (21, 62), (26, 58), (29, 63), (31, 60)]
    inner = [(27, 21), (16, 20), (11, 25), (27, 29)]
    body = [
        ('polygon', sym([(31, 4), (28, 10), (27, 40), (29, 52), (31, 56)]), r),
        ('polygon', wing, r), ('polygon', mirror(wing), r),
        ('polygon', tail, o), ('polygon', mirror(tail), o),
    ]
    details = [
        ('polygon', inner, o), ('polygon', mirror(inner), o),
        ('polygon', [(30, 6), (31, 2), (33, 6)], o), ('line', [(31, 30), (31, 50)], o),
    ] + cockpit(28, 10, 35, 18, (255, 230, 120, 255))
    return layer(body, details)


PLANES = {'wasp': wasp, 'collector': collector, 'swift': swift, 'titan': titan,
          'chronos': chronos, 'thunder': thunder, 'ufo': ufo, 'phoenix': phoenix}

if __name__ == '__main__':
    for name, fn in PLANES.items():
        save(name, fn())
    if len(sys.argv) > 2:
        sheet = Image.new('RGBA', (192 * len(PLANES), 192), (20, 18, 40, 255))
        for i, name in enumerate(PLANES):
            im = Image.open(f'{OUT}/plane-{name}.png')
            sheet.paste(im, (i * 192, 0), im)
        sheet.save(sys.argv[2])
