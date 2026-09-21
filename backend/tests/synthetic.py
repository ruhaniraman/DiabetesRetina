"""A synthetic fundus photograph that behaves like a real one for quality checks (random noise looks 'grainy' to a good gate)."""
import cv2
import numpy as np


def realistic_fundus(size=224, brightness=1.0, seed=0, border=0.0):
    """Smooth shading, branching vessel-like lines, a bright disc and a little fine texture, on a black frame."""
    rng = np.random.default_rng(seed)
    s = size
    img = np.zeros((s, s, 3), np.float32)
    yy, xx = np.mgrid[:s, :s]
    r = np.hypot(yy - s / 2, xx - s / 2)
    disc = r < s * (0.46 - border)
    shading = 1.0 - 0.35 * (r / (s / 2)) ** 2
    base = np.array([35, 85, 150], np.float32)                     # BGR: an orange-red fundus
    img[disc] = base[None, :] * shading[disc][:, None]
    for _ in range(14):                                             # vessels
        p = np.array([s / 2, s / 2]) + rng.normal(0, 8, 2)
        pts = [p.copy()]
        ang = rng.uniform(0, 2 * np.pi)
        for _ in range(30):
            ang += rng.normal(0, 0.25)
            p = p + 5 * np.array([np.sin(ang), np.cos(ang)])
            pts.append(p.copy())
        cv2.polylines(img, [np.round(np.array(pts)).astype(np.int32)[:, ::-1]], False, (20, 45, 95), max(1, int(s / 110)), cv2.LINE_AA)
    cv2.circle(img, (int(s * 0.68), int(s * 0.5)), int(s * 0.07), (120, 190, 235), -1, cv2.LINE_AA)   # optic disc
    img += rng.normal(0, 2.0, img.shape)                            # faint sensor texture
    img = cv2.GaussianBlur(img, (0, 0), 0.6)
    img = np.clip(img * brightness, 0, 255)
    img[~disc] = 0
    return img.astype(np.uint8)
