/* ================= 日本櫻花季地圖：介面 ================= */
(function(){
'use strict';
var $ = function(id){ return document.getElementById(id); };
var PREF_KEY = 'sakuraSeasonPrefs', SET_KEY = 'sakuraSeasonSettings', SEEN_KEY = 'sakuraSeasonSeenWarning', SEC_KEY = 'sakuraSeasonSetOpen';
var JUN = ['上旬', '中旬', '下旬'], MN = ['一月', '二月', '三月', '四月', '五月'];

function lsGet(k, d){ try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e){ return d; } }
function lsSet(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch (e){} }
function esc(s){ return String(s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]; }); }
function clampDay(d){ return Math.max(SK.D0, Math.min(SK.D1, Math.round(d))); }
function todayDoy(){ var n = new Date(), s = new Date(n.getFullYear(), 0, 1); return Math.floor((n - s) / 864e5) + 1; }

var set = Object.assign({day:'today', mode:'spots', labels:true, motion:'auto', theme:'auto', play:500}, lsGet(SET_KEY, {}));
var pref = lsGet(PREF_KEY, {});
function startDay(){
  if (set.day === 'last' && pref.day) return clampDay(pref.day);
  if (set.day === 'today'){ var t = todayDoy(); if (t >= SK.D0 && t <= SK.D1) return t; }
  return SK.doy('3/28');
}
var st = {day:startDay(), mode:set.mode === 'vars' ? 'vars' : 'spots', region:SK.regionById[pref.region] ? pref.region : 'all', spot:SK.spotById[pref.spot] ? pref.spot : null};
if (st.spot) st.region = SK.spotById[st.spot].r;
function save(){ lsSet(PREF_KEY, {day:st.day, region:st.region, spot:st.spot}); }
function reduceOn(){ return set.motion === 'reduce' || (set.motion === 'auto' && matchMedia('(prefers-reduced-motion: reduce)').matches); }
function applyTheme(){ if (set.theme === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', set.theme); }
applyTheme();

function junOf(d){ var x = SK.md(d); return MN[x.m - 1] + JUN[x.d <= 10 ? 0 : x.d <= 20 ? 1 : 2]; }
function stChip(id, extra){ var s = SK.stageById[id]; return '<span class="stchip" style="background:' + s.c + '" title="' + esc(s.tip) + '">' + s.name + (extra || '') + '</span>'; }
function photoOf(v){ return SK.PHOTOS && SK.PHOTOS[v.id] || null; }
function thumbOf(ph, w){ return ph.src.indexOf('/960px-') > 0 ? ph.src.replace('/960px-', '/' + w + 'px-') : ph.src; }
/* 沒有照片時的花朵示意圖（依品種顏色與單／八重） */
function flowerSVG(v, size){
  var n = v.petals > 5 ? 3 : 1, g = '';
  for (var L = 0; L < n; L++){
    var sc = 1 - L * .22, rot = L * 24;
    for (var i = 0; i < 5; i++) g += '<path d="M0 -2 C-8 -6 -8 -17 -2.4 -19 L0 -15.5 L2.4 -19 C8 -17 8 -6 0 -2Z" transform="rotate(' + (i * 72 + rot) + ') scale(' + sc + ')" fill="' + v.color + '" stroke="' + v.core + '" stroke-width="1"/>';
  }
  return '<svg width="' + size + '" height="' + size + '" viewBox="-22 -22 44 44" aria-hidden="true">' + g + '<circle r="3.4" fill="' + v.core + '"/></svg>';
}

/* ---------- 選擇器與時間軸 ---------- */
function fillSelectors(){
  $('selRegion').innerHTML = '<option value="all">全日本</option>' + SK.REGIONS.map(function(r){ return '<option value="' + r.id + '">' + r.name + '｜' + r.sub + '</option>'; }).join('');
  $('selRegion').value = st.region;
  var sp = SK.SPOTS.filter(function(p){ return st.region === 'all' || p.r === st.region; });
  $('selSpot').innerHTML = '<option value="">' + (st.region === 'all' ? '選一個賞櫻名所…' : '整個' + SK.regionById[st.region].name) + '</option>' +
    sp.map(function(p){ return '<option value="' + p.id + '">' + p.name + '（' + p.city.replace(/^(.{2,3}[都道府縣]).*/, '$1') + '）</option>'; }).join('');
  $('selSpot').value = st.spot || '';
}
var BINS = [];
(function(){ for (var m = 1; m <= 5; m++) [[1, 10], [11, 20], [21, m === 2 ? 28 : m === 4 ? 30 : 31]].forEach(function(r){ BINS.push([SK.doy(m + '/' + r[0]), SK.doy(m + '/' + r[1])]); }); })();
function spotsInScope(){ return SK.SPOTS.filter(function(p){ return st.region === 'all' || p.r === st.region; }); }
function renderAxis(){
  var sp = spotsInScope(), cnt = BINS.map(function(b){
    return sp.filter(function(p){ for (var d = b[0]; d <= b[1]; d++) if (SK.isPeak(SK.spotStage(p, d))) return true; return false; }).length;
  }), max = Math.max(1, Math.max.apply(null, cnt));
  $('axBars').innerHTML = BINS.map(function(b, i){
    var on = st.day >= b[0] && st.day <= b[1];
    return '<button type="button" class="axc' + (on ? ' on' : '') + '" data-d="' + Math.round((b[0] + b[1]) / 2) + '" title="' + junOf(b[0]) + '：' + cnt[i] + ' 處名所正值見頃"><b>' + cnt[i] + '</b><i style="height:' + Math.round(cnt[i] / max * 30 + 2) + 'px"></i></button>';
  }).join('');
  var r = $('dRange'); r.value = st.day; r.setAttribute('aria-valuetext', SK.fmt(st.day));
}

/* ---------- 櫻前線位置：開花日最接近今天的測站 ---------- */
function frontNow(){
  var d = st.day, near = SK.BASE.filter(function(b){ return Math.abs(b.od - d) <= 3; });
  if (!near.length) return null;
  near.sort(function(a, b){ return Math.abs(a.od - d) - Math.abs(b.od - d); });
  var top = near.slice(0, 4), lon = 0, lat = 0;
  top.forEach(function(b){ lon += b.at[0]; lat += b.at[1]; });
  return {lon:lon / top.length, lat:lat / top.length, names:top.slice(0, 3).map(function(b){ return b.name; }), sp:top[0].sp,
    text:'🌸 ' + (top[0].sp === 'kanhi' ? '寒緋櫻前線' : '櫻前線') + '・' + top.slice(0, 2).map(function(b){ return b.name; }).join('・')};
}

/* ---------- 天空顏色：冬藍→春粉→初夏藍 ---------- */
function skyFor(d){
  var winter = ['#b8c8e6', '#eef1f8'], spring = ['#a9d4f5', '#fde3ec'], summer = ['#8fcaf5', '#e3f4ea'];
  function mix(a, b, t){ var x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16), c = [16, 8, 0].map(function(s){ return Math.round(((x >> s) & 255) * (1 - t) + ((y >> s) & 255) * t); }); return 'rgb(' + c.join(',') + ')'; }
  var t1 = Math.max(0, Math.min(1, (d - 55) / 30)), t2 = Math.max(0, Math.min(1, (d - 125) / 25));
  return [0, 1].map(function(i){ return t2 > 0 ? mix(spring[i], summer[i], t2) : mix(winter[i], spring[i], t1); });
}

/* ---------- 清單 ---------- */
function stageOrder(p){
  var s = SK.spotStage(p, st.day), w = SK.window(p);
  var rank = {full:0, half:1, fall:2, open:3, swell:4, bud:5, leaf:6}[s];
  return rank * 1000 + (rank >= 3 && rank <= 5 ? w.o - st.day : 0);
}
function countdown(p){
  var w = SK.window(p), d = st.day, s = SK.spotStage(p, d);
  if (s === 'bud' || s === 'swell') return '約 ' + (w.o - d) + ' 天後開花';
  if (s === 'open' || s === 'half') return '約 ' + Math.max(1, w.f - d) + ' 天後滿開';
  if (s === 'full') return '滿開中';
  if (s === 'fall') return '落花中，把握最後幾天';
  return '花季已過';
}
function spotCard(p){
  var s = SK.spotStage(p, st.day), w = SK.window(p);
  return '<button type="button" class="scard" data-spot="' + p.id + '"><b>' + esc(p.name) + '</b>' + stChip(s) +
    '<small>' + esc(p.city) + '・開花 ' + SK.fmt(w.o) + '・滿開 ' + SK.fmt(w.f) + '｜' + countdown(p) + (p.night ? '｜🏮 夜櫻' : '') + '</small></button>';
}
function varCard(v, spot){
  var ph = photoOf(v), s = spot ? SK.spotStage(spot, st.day, v.id) : null, sub;
  if (spot){ var w = SK.window(spot, v.id); sub = '開花約 ' + SK.fmt(w.o) + '・滿開約 ' + SK.fmt(w.f); }
  else {
    var on = SK.spotsOfVar(v.id).filter(function(p){ return SK.isPeak(SK.spotStage(p, st.day, v.id)); });
    sub = on.length ? '現在見頃：' + on.slice(0, 2).map(function(p){ return p.name; }).join('、') + (on.length > 2 ? '等 ' + on.length + ' 處' : '') : v.kind;
  }
  return '<button type="button" class="vcard" data-var="' + v.id + '"><span class="pic">' + flowerSVG(v, 56) +
    (ph ? '<img loading="lazy" referrerpolicy="no-referrer" alt="" src="' + esc(thumbOf(ph, 330)) + '" onerror="this.remove()">' : '') +
    (s ? '<span class="st">' + stChip(s) + '</span>' : '') + '</span><b>' + esc(v.name) + '</b><small>' + esc(sub) + '</small></button>';
}
function timeline(p){
  var w = SK.window(p), d0 = SK.D0, d1 = SK.D1, pct = function(d){ return ((Math.max(d0, Math.min(d1, d)) - d0) / (d1 - d0) * 100).toFixed(1) + '%'; };
  var full = Math.max(5, Math.round((w.f - w.o) * .45));
  return '<div class="timeline" title="花期示意：淺粉＝開花到滿開，深粉＝滿開，最淺＝落花">' +
    '<span class="bar base"></span>' +
    '<span class="bar" style="left:' + pct(w.o) + ';width:calc(' + pct(w.f) + ' - ' + pct(w.o) + ');background:#f7c3d3"></span>' +
    '<span class="bar" style="left:' + pct(w.f) + ';width:calc(' + pct(w.f + full) + ' - ' + pct(w.f) + ');background:#ef5f8f"></span>' +
    '<span class="bar" style="left:' + pct(w.f + full) + ';width:calc(' + pct(w.f + full + 6) + ' - ' + pct(w.f + full) + ');background:#fbe0e8"></span>' +
    '<span class="now" style="left:' + pct(st.day) + '"></span>' +
    ['1/10', '2/1', '3/1', '4/1', '5/1', '5/31'].map(function(s){ return '<span class="lab" style="left:' + pct(SK.doy(s)) + '">' + s + '</span>'; }).join('') + '</div>';
}
function render(opts){
  opts = opts || {};
  var d = st.day, sp = st.spot ? SK.spotById[st.spot] : null;
  $('dateBig').textContent = SK.fmt(d);
  $('dateSub').textContent = junOf(d);
  document.querySelectorAll('.mbtn').forEach(function(b){ var on = b.dataset.mode === st.mode; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
  renderAxis();
  var sky = skyFor(d), stage = $('stage'); stage.style.setProperty('--sky1', sky[0]); stage.style.setProperty('--sky2', sky[1]);
  var place = $('place'), list = $('list'), scope = spotsInScope();
  var peakN = scope.filter(function(p){ return SK.isPeak(SK.spotStage(p, d)); }).length;
  if (sp){
    var s = SK.spotStage(sp, d), w = SK.window(sp);
    place.innerHTML = '<h2>' + esc(sp.name) + '<small>' + esc(sp.ja) + '・' + esc(sp.city) + '</small></h2>' +
      '<div class="meta">' + stChip(s, '（' + SK.stageById[s].ja + '）') + '<span>開花約 ' + SK.fmt(w.o) + '</span><span>滿開約 ' + SK.fmt(w.f) + '</span>' + (sp.elev >= 200 ? '<span>海拔約 ' + sp.elev + ' m</span>' : '') + (sp.night ? '<span>🏮 常有夜櫻點燈</span>' : '') + '</div>' +
      timeline(sp) + '<p>' + esc(sp.note) + '</p>' +
      '<details class="tips"' + (innerWidth > 760 ? ' open' : '') + '><summary>📌 這裡要注意</summary><ul>' + sp.tips.map(function(t){ return '<li>' + esc(t) + '</li>'; }).join('') + '</ul></details>' +
      '<div class="rowbtns"><button type="button" class="sbtn" data-jump="' + w.f + '">📅 跳到滿開日 ' + SK.fmt(w.f) + '</button><button type="button" class="sbtn" data-jump="' + w.o + '">開花日 ' + SK.fmt(w.o) + '</button></div>';
    $('sum').innerHTML = '<span>' + SK.fmt(d) + '・' + esc(SK.stageById[s].tip) + '</span>';
    list.className = 'grid';
    list.innerHTML = '<div class="lgrp" style="grid-column:1/-1">這裡的櫻花品種（點開看圖鑑）</div>' + sp.v.map(function(id){ return varCard(SK.varById[id], sp); }).join('');
  } else {
    if (st.region !== 'all'){
      var r = SK.regionById[st.region];
      place.innerHTML = '<h2>' + r.name + '<small>' + r.sub + '</small></h2><p>本區收錄 ' + scope.length + ' 個名所。點地圖上的名所或上方選單看單一名所的花期與品種。</p>';
    } else {
      var fr = frontNow();
      place.innerHTML = '<h2>全日本<small>' + SK.SPOTS.length + ' 個賞櫻名所</small></h2><p>' + (fr ? '櫻前線大約在 <b>' + fr.names.join('、') + '</b> 一帶。' : '目前不在櫻前線推進期間（沖繩一月、本州三～四月、北海道五月）。') +
        '拖曳下方日期，粉紅色會跟著櫻前線往北推進。</p>';
    }
    $('sum').innerHTML = '<span>' + SK.fmt(d) + '・' + (st.region === 'all' ? '全日本' : SK.regionById[st.region].name) + '</span><b>' + peakN + '</b><span>處正值見頃</span>';
    if (st.mode === 'vars'){
      list.className = 'grid';
      list.innerHTML = SK.VARIETIES.map(function(v){ return varCard(v); }).join('');
    } else {
      list.className = '';
      var sorted = scope.slice().sort(function(a, b){ return stageOrder(a) - stageOrder(b); }), html = '', last = '';
      sorted.forEach(function(p){
        var s = SK.spotStage(p, d), g = SK.isPeak(s) ? '🌸 現在見頃' : (s === 'leaf' ? '🍃 今年已結束' : '⏳ 即將開花');
        if (g !== last){ html += '<div class="lgrp">' + g + '</div>'; last = g; }
        html += spotCard(p);
      });
      list.innerHTML = html;
    }
  }
  if (window.SakuraScene && SakuraScene.ready){
    SakuraScene.setDay(d);
    SakuraScene.selectSpot(st.spot);
    var fr2 = frontNow(); SakuraScene.setFront(fr2 && !sp ? fr2 : null);
    if (opts.fly){
      if (sp) SakuraScene.focusSpot(sp.id);
      else if (st.region !== 'all') SakuraScene.focusRegion(scope.map(function(p){ return p.id; }));
      else SakuraScene.overview();
    }
  }
  save();
}

/* ---------- 動作 ---------- */
function setDay(d){ st.day = clampDay(d); render(); }
function selectSpot(id){ if (id && innerWidth <= 760 && $('panel').classList.contains('min')) setSheet(false); st.spot = id || null; if (st.spot) st.region = SK.spotById[st.spot].r; fillSelectors(); render({fly:true}); }
function selectRegion(r){ st.region = r; st.spot = null; fillSelectors(); render({fly:true}); }
function setMode(m){ st.mode = m; if (st.spot && m === 'vars'){ st.spot = null; fillSelectors(); render({fly:true}); return; } render(); }

/* ---------- 品種圖鑑 ---------- */
var lastFocus = null;
function showPhoto(v){
  var ph = photoOf(v), img = $('phImg'), art = $('phArt'), cr = $('phCredit');
  function fallback(){
    img.hidden = true; img.removeAttribute('src');
    art.hidden = false; art.innerHTML = flowerSVG(v, 180);
    cr.innerHTML = '<span class="note">目前沒有可用的授權實景照片（或無法載入），改以花朵示意圖表示：顏色與單瓣／八重依品種特徵繪製。</span>';
  }
  if (!ph){ fallback(); return; }
  art.hidden = true; img.hidden = false;
  img.onerror = fallback;
  img.alt = v.name + '（' + v.ja + '）實景照片';
  img.src = ph.src;
  cr.innerHTML = '📷 ' + esc(ph.author) + '｜<a href="' + esc(ph.licenseUrl || ph.page) + '" target="_blank" rel="noopener">' + esc(ph.license) + '</a>｜來源：<a href="' + esc(ph.page) + '" target="_blank" rel="noopener">Wikimedia Commons</a>' +
    '<br><span class="note">照片為品種示意，拍攝地點與樹齡可能與地圖上的名所不同；未經修改。</span>';
}
function offText(v){
  if (v.id === 'kanhi') return '沖繩・奄美一月開花';
  if (v.id === 'chishima') return '道東五月中旬';
  if (v.off === 0) return '櫻前線的基準';
  return v.off < 0 ? '比同地染井吉野早約 ' + (-v.off) + ' 天' : '比同地染井吉野晚約 ' + v.off + ' 天';
}
function openVar(id){
  var v = SK.varById[id]; if (!v) return;
  lastFocus = document.activeElement;
  $('varTitle').innerHTML = '<h2 id="varName">' + esc(v.name) + '</h2><div class="ja">' + esc(v.ja) + '・' + esc(v.en) + '</div><div class="sci">' + esc(v.sci) + '</div>' +
    '<div class="tags"><span class="tag k">' + esc(v.kind) + '</span><span class="tag">' + offText(v) + '</span><span class="tag">開花到滿開約 ' + v.dur + ' 天</span></div>' +
    '<div class="quick"><b>辨識重點：</b>' + esc(v.feat) + '</div>';
  var sps = SK.spotsOfVar(v.id);
  var rows = sps.map(function(p){
    var w = SK.window(p, v.id), s = SK.spotStage(p, st.day, v.id);
    return '<tr><td><button type="button" data-gospot="' + p.id + '">' + esc(p.name) + '</button><br><small style="color:var(--mute)">' + esc(p.city) + '</small></td><td>' + SK.fmt(w.o) + '</td><td>' + SK.fmt(w.f) + '</td><td>' + stChip(s) + '</td></tr>';
  }).join('');
  $('varBody').innerHTML =
    '<div class="sec cols"><div><h3>由來</h3><p>' + esc(v.story) + '</p></div><div><h3>為什麼值得認識</h3><p>' + esc(v.why) + '</p></div></div>' +
    '<div class="sec"><h3>哪裡看得到（' + SK.fmt(st.day) + ' 的花況）</h3>' + (rows ? '<div style="overflow-x:auto"><table class="vtab"><tr><th>名所</th><th>開花約</th><th>滿開約</th><th>' + SK.fmt(st.day) + '</th></tr>' + rows + '</table></div>' : '<p>本工具收錄的名所中沒有特別標示這個品種，在日本各地公園與寺社常可看到。</p>') +
    '<div class="calnote">日期為一般性推估（附近測站平年值＋品種花期差），點名所會飛到地圖上的位置。</div></div>' +
    '<div class="sec"><h3>容易混淆的櫻花</h3><div class="tipbox">🔍 ' + esc(v.similar) + '</div></div>';
  $('variety').classList.add('show');
  $('variety').querySelector('.sheet').scrollTop = 0;
  showPhoto(v);
  $('variety').querySelector('.x').focus();
}
function openModal(id){ lastFocus = document.activeElement; $(id).classList.add('show'); $(id).querySelector('.x').focus(); }
function closeModal(el){
  el.classList.remove('show');
  if (el.id === 'about') lsSet(SEEN_KEY, 1);
  if (lastFocus && lastFocus.focus) lastFocus.focus();
}
function buildEtiquette(){
  $('etqBody').innerHTML = SK.ETIQUETTE.map(function(e){
    return '<section><h3>' + e.icon + ' ' + esc(e.title) + '</h3><ul>' + e.items.map(function(x){ return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></section>';
  }).join('');
  $('glossBody').innerHTML = SK.GLOSSARY.map(function(g){ return '<div><b>' + esc(g[0]) + '</b><br>' + esc(g[1]) + '</div>'; }).join('');
  $('lgStages').innerHTML = SK.STAGES.map(function(s){ return '<span><i style="background:' + s.c + '"></i>' + s.name + '</span>'; }).join('');
}

/* ---------- 常用設定（收合式） ---------- */
function fillSettings(){
  $('setDay').value = set.day; $('setMode').value = set.mode; $('setLabels').checked = !!set.labels; $('setMotion').value = set.motion; $('setTheme').value = set.theme; $('setPlay').value = String(set.play);
  var txt = function(id){ var s = $(id); return s.options[s.selectedIndex].text; };
  $('sv-day').textContent = txt('setDay'); $('sv-mode').textContent = txt('setMode'); $('sv-labels').textContent = set.labels ? '顯示' : '隱藏';
  $('sv-motion').textContent = txt('setMotion'); $('sv-play').textContent = txt('setPlay').replace(/（.*/, ''); $('sv-theme').textContent = txt('setTheme');
  var open = lsGet(SEC_KEY, []);
  document.querySelectorAll('.set-sec').forEach(function(d){ d.open = open.indexOf(d.dataset.sec) >= 0; });
}
function saveSettings(){
  set = {day:$('setDay').value, mode:$('setMode').value, labels:$('setLabels').checked, motion:$('setMotion').value, theme:$('setTheme').value, play:+$('setPlay').value};
  lsSet(SET_KEY, set); applyTheme();
  if (window.SakuraScene && SakuraScene.ready){ SakuraScene.setLabels(set.labels); SakuraScene.setReduce(reduceOn()); }
  if (playT){ stopPlay(); startPlay(); }
  fillSettings();
}
function saveSecs(){ lsSet(SEC_KEY, [].map.call(document.querySelectorAll('.set-sec[open]'), function(d){ return d.dataset.sec; })); }

/* ---------- 事件 ---------- */
function bind(){
  $('dRange').addEventListener('input', function(){ stopPlay(); if (+this.value !== st.day) setDay(+this.value); });
  $('axBars').addEventListener('click', function(e){ var b = e.target.closest('.axc'); if (b){ stopPlay(); setDay(+b.dataset.d); } });
  $('btnToday').addEventListener('click', function(){ stopPlay(); var t = todayDoy(); setDay(t >= SK.D0 && t <= SK.D1 ? t : SK.doy('3/28')); });
  document.querySelectorAll('.mbtn').forEach(function(b){ b.addEventListener('click', function(){ setMode(b.dataset.mode); }); });
  $('selRegion').addEventListener('change', function(){ selectRegion(this.value); });
  $('selSpot').addEventListener('change', function(){ if (this.value) selectSpot(this.value); else selectRegion(st.region); });
  $('list').addEventListener('click', function(e){
    var c = e.target.closest('.scard'); if (c){ selectSpot(c.dataset.spot); return; }
    var v = e.target.closest('.vcard'); if (v) openVar(v.dataset.var);
  });
  $('place').addEventListener('click', function(e){ var j = e.target.closest('[data-jump]'); if (j){ stopPlay(); setDay(+j.dataset.jump); } });
  $('btnAll').addEventListener('click', function(){ st.region = 'all'; st.spot = null; fillSelectors(); render({fly:true}); });
  $('btnAbout').addEventListener('click', function(){ openModal('about'); });
  ['btnEtq', 'btnEtq2', 'btnEtq3'].forEach(function(id){ $(id).addEventListener('click', function(){ if (id === 'btnEtq3') closeModal($('about')); openModal('etq'); }); });
  $('btnSet').addEventListener('click', function(){ fillSettings(); openModal('settings'); });
  $('settings').addEventListener('change', saveSettings);
  document.querySelectorAll('.set-sec').forEach(function(d){ d.addEventListener('toggle', saveSecs); });
  $('setOpenAll').addEventListener('click', function(){ document.querySelectorAll('.set-sec').forEach(function(d){ d.open = true; }); saveSecs(); });
  $('setCloseAll').addEventListener('click', function(){ document.querySelectorAll('.set-sec').forEach(function(d){ d.open = false; }); saveSecs(); });
  function openAbout(creator){
    if ($('settings').classList.contains('show')) closeModal($('settings'));
    openModal('about'); if (creator) $('creatorBox').scrollIntoView({block:'nearest'});
  }
  $('btnCreator').addEventListener('click', function(){ openAbout(true); });
  document.querySelectorAll('[data-open-about]').forEach(function(b){ b.addEventListener('click', function(){ openAbout(b.dataset.openAbout === 'creator'); }); });
  document.querySelectorAll('[data-open-etq]').forEach(function(b){ b.addEventListener('click', function(){ closeModal($('settings')); openModal('etq'); }); });
  $('btnPrint').addEventListener('click', function(){ window.print(); });
  $('sheetBtn').addEventListener('click', function(){
    setSheet(!$('panel').classList.contains('min'));
  });
  document.querySelectorAll('.modal').forEach(function(m){
    m.addEventListener('click', function(e){ if (e.target === m || e.target.closest('[data-close]')) closeModal(m); });
  });
  $('varBody').addEventListener('click', function(e){
    var g = e.target.closest('[data-gospot]');
    if (g){ closeModal($('variety')); st.mode = 'spots'; selectSpot(g.dataset.gospot); }
  });
  document.addEventListener('keydown', function(e){
    var open = document.querySelector('.modal.show');
    if (e.key === 'Escape' && open){ closeModal(open); return; }
    if (open || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.key === 'ArrowRight'){ stopPlay(); setDay(st.day + (e.shiftKey ? 7 : 1)); }
    if (e.key === 'ArrowLeft'){ stopPlay(); setDay(st.day - (e.shiftKey ? 7 : 1)); }
  });
  $('play').addEventListener('click', function(){ if (playT) stopPlay(); else startPlay(); });
}
function setSheet(min){
  $('panel').classList.toggle('min', min); document.body.classList.toggle('sheet-min', min); $('sheetBtn').textContent = min ? '展開清單' : '收合';
  if (window.SakuraScene) SakuraScene.resize();
}
var playT = 0;
function startPlay(){
  if (st.day >= SK.D1) setDay(SK.D0);
  $('play').classList.add('on'); $('play').textContent = '❚❚';
  playT = setInterval(function(){ if (st.day >= SK.D1){ stopPlay(); return; } setDay(st.day + 2); }, set.play || 500);
}
function stopPlay(){ if (!playT) return; clearInterval(playT); playT = 0; $('play').classList.remove('on'); $('play').textContent = '▶'; }

/* ---------- 啟動 ---------- */
fillSelectors(); buildEtiquette(); bind(); if (innerWidth <= 760) setSheet(true); render();
SakuraScene.onPickSpot = function(id){ if (st.mode === 'vars') st.mode = 'spots'; selectSpot(id); };
function firstVisit(){ if (!lsGet(SEEN_KEY, 0)) openModal('about'); }
SakuraScene.init({host:$('stage'), labels:$('labels'), reduce:reduceOn(), day:st.day}).then(function(){
  SakuraScene.setLabels(set.labels);
  render({fly:true});
  setTimeout(function(){ $('loading').classList.add('hide'); firstVisit(); }, 250);
}).catch(function(err){
  console.error(err);
  $('loadMsg').textContent = '3D 地圖載入失敗（可能是網路無法連到繪圖元件）';
  $('loadSub').textContent = '名所花況與品種圖鑑仍可使用，點畫面任一處繼續。';
  $('loading').addEventListener('click', function(){ $('loading').classList.add('hide'); firstVisit(); }, {once:true});
});

window.__sakura = {state:st, setDay:setDay, selectSpot:selectSpot, selectRegion:selectRegion, setMode:setMode, openVar:openVar,
  closeVar:function(){ closeModal($('variety')); }, frontNow:frontNow, SK:SK, scene:SakuraScene};
})();
