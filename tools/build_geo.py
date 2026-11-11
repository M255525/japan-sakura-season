"""從 Natural Earth 1:10m 國界（公有領域）擷取日本島嶼輪廓，簡化後輸出 geo.js。
用法：python tools/build_geo.py <ne_10m_admin_0_countries.geojson>
"""
import json, math, sys
src = sys.argv[1]
d = json.load(open(src, encoding='utf-8'))
NAMES = [((137.15, 36.35), 'honshu', '本州'), ((142.6, 43.17), 'hokkaido', '北海道'), ((130.61, 32.71), 'kyushu', '九州'),
         ((133.33, 33.58), 'shikoku', '四國'), ((127.98, 26.52), 'okinawa', '沖繩本島'), ((138.38, 38.04), 'sado', '佐渡'),
         ((129.45, 28.33), 'amami', '奄美大島'), ((134.86, 34.39), 'awaji', '淡路島'), ((130.51, 30.35), 'yakushima', '屋久島'),
         ((129.37, 34.49), 'tsushima', '對馬'), ((130.97, 30.57), 'tanegashima', '種子島')]
COS = math.cos(math.radians(36))
def proj(p): return ((p[0] - 136.5) * COS * 111.32 / 25, -(p[1] - 35.8) * 111.32 / 25)
def rdp(pts, eps):
    if len(pts) < 3: return pts
    a, b = proj(pts[0]), proj(pts[-1]); dmax, idx = 0, 0
    for i in range(1, len(pts) - 1):
        p = proj(pts[i]); dx, dy = b[0] - a[0], b[1] - a[1]; L = dx * dx + dy * dy
        t = 0 if L == 0 else max(0, min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L))
        dd = math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1])
        if dd > dmax: dmax, idx = dd, i
    if dmax > eps: return rdp(pts[:idx + 1], eps)[:-1] + rdp(pts[idx:], eps)
    return [pts[0], pts[-1]]
out = []
for f in d['features']:
    if f['properties'].get('ADM0_A3') != 'JPN': continue
    for poly in f['geometry']['coordinates']:
        r = poly[0]
        A = sum(r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1] for i in range(len(r) - 1)) / 2
        cx = sum(p[0] for p in r) / len(r); cy = sum(p[1] for p in r) / len(r)
        if abs(A) < 0.006 or cx < 126.5 or cx > 146.5 or cy > 45.6: continue
        big = abs(A) > 1
        s = rdp(r[:-1] + [r[0]], 0.05 if big else 0.04)[:-1]
        if len(s) < 4: continue
        nid, nm = 'isl%d' % len(out), ''
        for c, i2, n2 in NAMES:
            if abs(c[0] - cx) < .3 and abs(c[1] - cy) < .3: nid, nm = i2, n2
        out.append({'id': nid, 'name': nm, 'main': big, 'area': abs(A), 'poly': [[round(p[0], 3), round(p[1], 3)] for p in s]})
out.sort(key=lambda o: -o['area'])
for o in out: del o['area']
with open('geo.js', 'w', encoding='utf-8') as fp:
    fp.write('/* 日本島嶼輪廓：Natural Earth 1:10m Admin 0 Countries（公有領域，naturalearthdata.com），以 tools/build_geo.py 擷取並簡化。座標 [經度, 緯度]。 */\n')
    fp.write('window.SK = window.SK || {};\nSK.GEO = ' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n')
print(len(out), sum(len(o['poly']) for o in out), [ (o['id'], len(o['poly'])) for o in out[:6]])
