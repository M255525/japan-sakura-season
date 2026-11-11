// 由 tools/manual_tpl.html 產生 manual.html：node tools/build_manual.js . tools/manual_tpl.html
const fs = require('fs'), path = require('path');
const dir = process.argv[2], tplPath = process.argv[3];
global.window = {};
new Function(fs.readFileSync(path.join(dir, 'data.js'), 'utf8'))();
const SK = window.SK;
new Function('SK', fs.readFileSync(path.join(dir, 'photos.js'), 'utf8'))(SK);
const e = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const rows = SK.VARIETIES.map(v => { const p = SK.PHOTOS[v.id];
  return '<tr><td>' + e(v.name) + '</td><td>' + (p ? e(p.author) : '—') + '</td><td>' + (p ? '<a href="' + e(p.licenseUrl || p.page) + '" target="_blank" rel="noopener">' + e(p.license) + '</a>' : '花朵示意圖') + '</td><td>' + (p ? '<a href="' + e(p.page) + '" target="_blank" rel="noopener">' + e(p.file) + '</a>' : '—') + '</td></tr>'; }).join('\n');
const spots = SK.REGIONS.map(r => r.name + '：' + SK.SPOTS.filter(s => s.r === r.id).map(s => s.name).join('、')).join('</li><li>');
const stages = SK.STAGES.map(s => '<tr><td><span class="k" style="background:' + s.c + '"></span> ' + s.name + '（' + s.ja + '）</td><td>' + e(s.tip) + '</td></tr>').join('\n');
let out = fs.readFileSync(tplPath, 'utf8').replace('{{ROWS}}', rows).replace('{{SPOTS}}', spots).replace('{{STAGES}}', stages)
  .replace('{{NAMES}}', SK.VARIETIES.map(v => v.name).join('、')).replace(/\{\{NV\}\}/g, SK.VARIETIES.length).replace(/\{\{NS\}\}/g, SK.SPOTS.length).replace(/\{\{NB\}\}/g, SK.BASE.length);
fs.writeFileSync(path.join(dir, 'manual.html'), out);
console.log('manual ok', SK.SPOTS.length, SK.VARIETIES.length, Object.keys(SK.PHOTOS).length);
