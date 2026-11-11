"""查詢各櫻花品種的 Wikimedia Commons 授權照片，產生 photos.js。
先試英文維基條目代表圖（pilicense=free），沒有就用 Commons 檔案搜尋（SEARCH 字典）。
只收 CC0／公有領域／CC BY／CC BY-SA；結果需人工看過縮圖再提交。
用法（在本資料夾執行）：python tools/fetch_photos.py
"""
import json, re, sys, io, urllib.request, urllib.parse, html, subprocess
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', line_buffering=True)
UA = {'User-Agent': 'japan-sakura-season-build/1.0 (https://github.com/M255525)'}
import time
def get(url):
    for k in range(5):
        try:
            r = json.loads(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30).read()); time.sleep(.6); return r
        except urllib.error.HTTPError as e:
            if e.code != 429: raise
            time.sleep(10 * (k + 1))
    raise SystemExit('rate limited')
# 人工指定（檔名）優先；其次條目；最後搜尋
PIN = {"kanhi": "Prunus campanulata (16979002639).jpg", "takato": "Takato-Joshi-Park Cherry.jpg", "fugenzo": "Fugenzo P297 11.jpg", "ukon": "Prunus lannesiana Grandiflora.jpg", "shidare": "Okkazuma-no Shidarezakura Back side.JPG"}
SEARCH = {'kanhi': ['Prunus campanulata flower', 'Cerasus campanulata', 'Kanhizakura'], 'shidare': ['Shidarezakura', 'weeping cherry Prunus pendula', 'Prunus spachiana Pendula'],
          'kawazu': ['Kawazu-zakura flowers'], 'takato': ['高遠城址公園 桜', 'Takato-Joshi-Park Cherry'],
          'kanzan': ['Prunus Kanzan flowers'], 'fugenzo': ['Fugenzo cherry blossom'], 'ukon': ['Ukon cherry', 'Prunus serrulata Grandiflora', 'Ukon-zakura'],
          'gyoiko': ['Gyoiko', 'Prunus Gioiko', 'Gyoikou'], 'narayae': ['Nara-no-yaezakura', 'Prunus verecunda Antiqua', 'Naranoyaezakura']}
OK = re.compile(r'^(CC0|Public domain|PD.*|CC BY(-SA)? [0-9.]+.*)$', re.I)
data = subprocess.run(['node', '-e', "global.window={};eval(require('fs').readFileSync('data.js','utf8'));console.log(JSON.stringify(window.SK.VARIETIES.map(v=>[v.id,v.wiki])))"], capture_output=True, text=True, encoding='utf-8').stdout
def info(f):
    q = 'https://commons.wikimedia.org/w/api.php?' + urllib.parse.urlencode({'action':'query','format':'json','prop':'imageinfo','iiprop':'url|extmetadata|size|mime','iiurlwidth':960,'titles':'File:' + f})
    pg = next(iter(get(q)['query']['pages'].values()))
    return pg.get('imageinfo', [None])[0]
def accept(ii):
    if not ii or ii.get('mime') not in ('image/jpeg', 'image/png'): return None
    if DEBUG: print('  try', ii.get('extmetadata', {}).get('LicenseShortName', {}).get('value', ''), ii.get('width'))
    md = ii.get('extmetadata', {}); lic = md.get('LicenseShortName', {}).get('value', '')
    if not OK.match(lic): return None
    if ii.get('width', 0) < 600: return None
    art = html.unescape(re.sub(r'<[^>]+>', '', md.get('Artist', {}).get('value', ''))).strip()
    art = re.sub(r'\s+', ' ', art)[:80]
    if not art: return None
    return {'src': ii['thumburl'].split('?')[0], 'page': ii['descriptionurl'], 'author': art, 'license': lic, 'licenseUrl': md.get('LicenseUrl', {}).get('value', '')}
DEBUG = '-v' in sys.argv
out = {}
for vid, wiki in json.loads(data):
    files = []
    if vid in PIN: files = [PIN[vid]]
    if files: wiki = ''
    if wiki:
        q = 'https://en.wikipedia.org/w/api.php?' + urllib.parse.urlencode({'action':'query','format':'json','prop':'pageimages','piprop':'name','pilicense':'free','redirects':1,'titles':wiki})
        p = next(iter(get(q)['query']['pages'].values()))
        if p.get('pageimage'): files.append(p['pageimage'])
    if vid in SEARCH and not files:
        for term in SEARCH[vid]:
            q = 'https://commons.wikimedia.org/w/api.php?' + urllib.parse.urlencode({'action':'query','format':'json','list':'search','srnamespace':6,'srlimit':8,'srsearch':term + ' filetype:bitmap'})
            files += [h['title'][5:] for h in get(q)['query']['search']]
    for f in files:
        r = accept(info(f))
        if r:
            r['file'] = f.replace('_', ' '); out[vid] = r
            print('OK', vid, '|', r['license'], '|', r['author'], '|', f); break
    else: print('NONE', vid, files[:3])
js = '/* 品種實景照片：取自 Wikimedia Commons，僅收錄 CC0／公有領域／CC BY／CC BY-SA 授權，頁面上逐張標示作者、授權與來源。\n * 由 tools/fetch_photos.py 產生並經人工檢視；未收錄者在圖鑑中改用程式繪製的花朵示意圖。 */\nSK.PHOTOS = ' + json.dumps(out, ensure_ascii=False, indent=1) + ';\n'
open('photos.js', 'w', encoding='utf-8').write(js)
print('total', len(out))
