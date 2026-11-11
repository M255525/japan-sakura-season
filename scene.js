/* ================= 日本櫻花季地圖：3D 場景 =================
 * Three.js（importmap 指到 jsdelivr）。日本列島輪廓取自 geo.js（Natural Earth），
 * 先算出離岸距離場，再依山脈脊線疊出地形；陸地用 shader 依「日期 × 各地開花日」染上櫻花色、畫出櫻前線、
 * 隨日期退去的積雪。每個名所放一個程式自繪的地標（城、五重塔、鳥居、橋…）與一圈櫻樹，滿開時花瓣飄落。
 * 座標：x = 東西、z = 南北（北為 -z）、y = 高度；1 單位約 25 公里，山高（KM）有誇大。
 */
(function(){
'use strict';
var S = window.SakuraScene = {ready:false};
var T, Orbit;
var EXT = {x0:-41, z0:-47, x1:38, z1:47}, RES = .2, NX = 0, NZ = 0, DIST = null, HGT = null;
var KM = .3, LAPSE = 25;
var U = {time:{value:0}, day:{value:90}};
var renderer, scene, camera, controls, raycaster, ndc, toonGrad, clock, landMat, seaMat;
var SPOT3 = {}, labels = [], clouds = [], pickables = [], petals = null, frontLab = null;
var selId = null, fly = null, showLabels = true, curDay = 90, reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
var host, labelRoot, tmpV;

var COS = Math.cos(36 * Math.PI / 180);
function P(lon, lat){ return [(lon - 136.5) * COS * 111.32 / 25, -(lat - 35.8) * 111.32 / 25]; }
S.proj = P;
function latOf(z){ return 35.8 - z * 25 / 111.32; }
function hash(n){ var x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
function smooth(a, b, x){ var t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
function col(h){ return new T.Color(h); }
function ease(t){ return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
function noise(x, z){ return .5 * Math.sin(x * 1.9 + z * .7) * Math.sin(z * 1.4 - x * .5) + .3 * Math.sin(x * 4.1 + 1.3) * Math.sin(z * 3.7 + .4) + .2 * Math.sin(x * 8.3 + z * 6.1); }

/* ---------- 島嶼與距離場 ---------- */
var ISL = [];
function buildPolys(){
  SK.GEO.forEach(function(I){
    var poly = I.poly.map(function(p){ return P(p[0], p[1]); }), cx = 0, cz = 0, bb = [1e9, 1e9, -1e9, -1e9];
    poly.forEach(function(p){ cx += p[0]; cz += p[1]; bb[0] = Math.min(bb[0], p[0]); bb[1] = Math.min(bb[1], p[1]); bb[2] = Math.max(bb[2], p[0]); bb[3] = Math.max(bb[3], p[1]); });
    ISL.push({id:I.id, name:I.name, main:I.main, poly:poly, bb:bb, c:[cx / poly.length, cz / poly.length]});
  });
}
function buildField(){
  NX = Math.round((EXT.x1 - EXT.x0) / RES) + 1; NZ = Math.round((EXT.z1 - EXT.z0) / RES) + 1;
  var inside = new Uint8Array(NX * NZ), i, j, k;
  // 掃描線填色判斷陸地
  ISL.forEach(function(I){
    var poly = I.poly, n = poly.length;
    var j0 = Math.max(0, Math.floor((I.bb[1] - EXT.z0) / RES)), j1 = Math.min(NZ - 1, Math.ceil((I.bb[3] - EXT.z0) / RES));
    for (j = j0; j <= j1; j++){
      var z = EXT.z0 + j * RES, xs = [];
      for (var a = 0, b = n - 1; a < n; b = a++){
        var A = poly[a], B = poly[b];
        if ((A[1] > z) !== (B[1] > z)) xs.push(A[0] + (z - A[1]) / (B[1] - A[1]) * (B[0] - A[0]));
      }
      xs.sort(function(p, q){ return p - q; });
      for (var m = 0; m + 1 < xs.length; m += 2){
        var i0 = Math.max(0, Math.ceil((xs[m] - EXT.x0) / RES)), i1 = Math.min(NX - 1, Math.floor((xs[m + 1] - EXT.x0) / RES));
        for (i = i0; i <= i1; i++) inside[j * NX + i] ^= 1;
      }
    }
  });
  // 線段分桶，求到海岸線的距離（上限 6）
  var B = 1, BX = Math.ceil((EXT.x1 - EXT.x0) / B) + 1, BZ = Math.ceil((EXT.z1 - EXT.z0) / B) + 1, bucket = [];
  for (k = 0; k < BX * BZ; k++) bucket.push([]);
  ISL.forEach(function(I){
    var poly = I.poly, n = poly.length;
    for (var a = 0, b = n - 1; a < n; b = a++){
      var A = poly[b], C = poly[a], seg = [A[0], A[1], C[0], C[1]];
      var bx0 = Math.floor((Math.min(A[0], C[0]) - EXT.x0) / B), bx1 = Math.floor((Math.max(A[0], C[0]) - EXT.x0) / B);
      var bz0 = Math.floor((Math.min(A[1], C[1]) - EXT.z0) / B), bz1 = Math.floor((Math.max(A[1], C[1]) - EXT.z0) / B);
      for (var q = bz0; q <= bz1; q++) for (var p = bx0; p <= bx1; p++) if (p >= 0 && q >= 0 && p < BX && q < BZ) bucket[q * BX + p].push(seg);
    }
  });
  DIST = new Float32Array(NX * NZ);
  for (j = 0; j < NZ; j++) for (i = 0; i < NX; i++){
    var x = EXT.x0 + i * RES, zz = EXT.z0 + j * RES, cbx = Math.floor((x - EXT.x0) / B), cbz = Math.floor((zz - EXT.z0) / B), best = 36;
    for (var r = 0; r <= 6; r++){
      for (var qz = cbz - r; qz <= cbz + r; qz++) for (var qx = cbx - r; qx <= cbx + r; qx++){
        if (Math.max(Math.abs(qx - cbx), Math.abs(qz - cbz)) !== r || qx < 0 || qz < 0 || qx >= BX || qz >= BZ) continue;
        var L = bucket[qz * BX + qx];
        for (var s = 0; s < L.length; s++){
          var g = L[s], dx = g[2] - g[0], dz = g[3] - g[1], l = dx * dx + dz * dz, t = l ? ((x - g[0]) * dx + (zz - g[1]) * dz) / l : 0;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          var px = g[0] + t * dx - x, pz = g[1] + t * dz - zz, d2 = px * px + pz * pz;
          if (d2 < best) best = d2;
        }
      }
      if (best <= (r * B) * (r * B)) break;
    }
    var d = Math.min(6, Math.sqrt(best));
    DIST[j * NX + i] = inside[j * NX + i] ? -d : d;
  }
}
function field(x, z){
  var fx = (x - EXT.x0) / RES, fz = (z - EXT.z0) / RES;
  if (fx < 0 || fz < 0 || fx >= NX - 1 || fz >= NZ - 1) return 6;
  var i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, k = j * NX + i;
  return (DIST[k] * (1 - u) + DIST[k + 1] * u) * (1 - v) + (DIST[k + NX] * (1 - u) + DIST[k + NX + 1] * u) * v;
}
S.field = field;

/* ---------- 地形 ---------- */
var RIDGES = [
  [[142.2,44.3,.8,1.0],[142.85,43.66,2.2,1.1],[142.9,43.1,1.6,1.0],[142.95,42.6,1.7,.8],[143.25,42.1,1.0,.7]],
  [[144.6,43.6,.9,.6],[145.15,44.07,1.4,.6]],
  [[140.8,42.8,1.2,.7],[140.3,42.3,.8,.7],[140.2,41.6,.7,.7]],
  [[140.9,40.7,1.4,.9],[140.95,40.0,1.4,.9],[140.8,39.3,1.3,.9],[140.6,38.5,1.4,.9],[140.3,37.7,1.6,.9],[139.9,37.0,1.8,1.0]],
  [[140.05,39.1,2.1,.6],[140.0,38.55,1.9,.6]],
  [[141.55,40.0,1.0,.9],[141.55,39.3,1.6,.9],[141.5,38.8,.8,.7]],
  [[140.3,40.65,1.6,.4]],
  [[139.85,38.25,1.8,.8],[139.75,37.85,2.0,.8]],
  [[139.5,37.2,1.9,1.0],[139.4,36.8,2.3,.9],[139.0,36.6,2.0,1.0],[138.5,36.4,2.1,.9]],
  [[137.7,36.8,2.6,.7],[137.65,36.3,3.1,.6],[137.6,35.95,2.9,.6]],
  [[137.85,35.85,2.6,.5],[137.85,35.5,2.5,.5]],
  [[138.2,35.85,2.9,.6],[138.2,35.6,3.1,.6],[138.15,35.25,2.4,.6]],
  [[138.65,35.95,2.2,.7],[139.05,35.85,1.6,.6]],
  [[136.77,36.15,2.5,.6],[136.9,35.9,1.6,.7]],
  [[137.2,36.0,1.6,1.0],[136.9,35.6,1.2,.9]],
  [[139.1,35.45,1.4,.4]], [[138.95,34.9,1.0,.35]],
  [[135.7,34.4,1.4,.8],[135.95,34.0,1.8,.9],[135.8,33.75,1.2,.8]],
  [[136.45,35.2,1.1,.4],[136.4,34.9,.9,.4]],
  [[135.9,35.25,1.1,.4],[135.4,35.25,.8,.8]],
  [[134.6,35.25,1.2,.8],[133.55,35.35,1.6,.6],[132.8,35.0,1.2,.8],[132.0,34.6,1.0,.8],[131.4,34.3,.7,.7]],
  [[132.8,33.6,1.4,.7],[133.12,33.77,1.9,.6],[133.6,33.8,1.6,.7],[134.1,33.85,1.9,.6],[134.5,33.8,1.2,.6]],
  [[130.6,33.4,.8,.7],[131.1,33.1,1.7,.7],[131.1,32.88,1.5,.6],[131.2,32.4,1.7,.8],[131.0,32.0,1.6,.7],[130.87,31.93,1.7,.5]],
  [[130.5,30.34,1.9,.4]], [[127.98,26.68,.45,.4],[128.2,26.75,.5,.4]], [[129.4,28.3,.6,.4]]
];
var RID = [], FUJI;
function prepRidges(){
  RID = RIDGES.map(function(r){ return r.map(function(p){ var q = P(p[0], p[1]); return [q[0], q[1], p[2] * KM, p[3]]; }); });
  FUJI = P(138.727, 35.361);
}
function ridgeH(x, z){
  var best = 0;
  for (var a = 0; a < RID.length; a++){
    var r = RID[a];
    for (var i = 0; i < r.length; i++){
      var A = r[i], B = r[Math.min(i + 1, r.length - 1)], dx = B[0] - A[0], dz = B[1] - A[1], l = dx * dx + dz * dz;
      var t = l ? Math.max(0, Math.min(1, ((x - A[0]) * dx + (z - A[1]) * dz) / l)) : 0;
      var px = A[0] + t * dx - x, pz = A[1] + t * dz - z, d2 = px * px + pz * pz;
      var w = A[3] + (B[3] - A[3]) * t;
      if (d2 > 9 * w * w) continue;
      var v = (A[2] + (B[2] - A[2]) * t) * Math.exp(-d2 / (w * w));
      if (v > best) best = v;
    }
  }
  var fr = Math.hypot(x - FUJI[0], z - FUJI[1]);
  if (fr < 2.2) best = Math.max(best, 3.776 * KM * Math.exp(-Math.pow(fr / .42, 1.35)));
  return best;
}
function heightAt(x, z, d){
  if (d <= 0) return Math.max(-.5, d * .8);
  var n = noise(x, z);
  return .02 + ridgeH(x, z) * smooth(0, .7, d) * (1 + .22 * n) + .025 * smooth(0, .5, d) * (n + 1);
}
function landY(x, z){
  var fx = (x - EXT.x0) / RES, fz = (z - EXT.z0) / RES;
  if (fx < 0 || fz < 0 || fx >= NX - 1 || fz >= NZ - 1) return 0;
  var i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, k = j * NX + i;
  return Math.max(0, (HGT[k] * (1 - u) + HGT[k + 1] * u) * (1 - v) + (HGT[k + NX] * (1 - u) + HGT[k + NX + 1] * u) * v);
}
S.landY = landY;

/* 各地開花日：氣象廳平年值換算到海平面後做反距離加權，再依海拔延後（約每 100 公尺 2.5 天） */
var CTRL = [];
function prepBloom(){
  SK.BASE.forEach(function(b){ var q = P(b.at[0], b.at[1]); CTRL.push([q[0], q[1], b.od, b.fd]); });
  SK.SPOTS.forEach(function(p){
    if (p.v[0] !== 'someiyoshino' && p.v[0] !== 'oyamazakura' && p.v[0] !== 'kanhi') return;
    var q = P(p.at[0], p.at[1]), e = p.elev / 1000 * LAPSE;
    CTRL.push([q[0], q[1], p.od - e, p.fd - e]);
  });
}
function bloomAt(x, z, hKm){
  var so = 0, sf = 0, sw = 0;
  for (var i = 0; i < CTRL.length; i++){
    var c = CTRL[i], d2 = (c[0] - x) * (c[0] - x) + (c[1] - z) * (c[1] - z) + .3, w = 1 / (d2 * d2);
    so += c[2] * w; sf += c[3] * w; sw += w;
  }
  var add = Math.max(0, hKm) * LAPSE;
  return [so / sw + add, sf / sw + add];
}
S.bloomAt = function(lon, lat){ var q = P(lon, lat), b = bloomAt(q[0], q[1], landY(q[0], q[1]) / KM); return {o:b[0], f:b[1]}; };

var LANDC;
function landColor(hKm, d){
  if (d <= 0) return LANDC.under;
  if (d < .06 || hKm < .04) return LANDC.sand;
  if (hKm < .3) return LANDC.plain;
  if (hKm < .9) return LANDC.grass;
  if (hKm < 1.6) return LANDC.forest;
  if (hKm < 2.3) return LANDC.deep;
  if (hKm < 2.9) return LANDC.rock;
  return LANDC.snow;
}
function buildLand(){
  var n = NX * NZ, pos = new Float32Array(n * 3), cols = new Float32Array(n * 3), bl = new Float32Array(n * 2);
  HGT = new Float32Array(n);
  for (var j = 0; j < NZ; j++) for (var i = 0; i < NX; i++){
    var k = j * NX + i, x = EXT.x0 + i * RES, z = EXT.z0 + j * RES, d = -DIST[k], h = d < -.6 ? -.5 : heightAt(x, z, d);
    HGT[k] = h; pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
    var c = landColor(h / KM, d); cols[k * 3] = c.r; cols[k * 3 + 1] = c.g; cols[k * 3 + 2] = c.b;
    if (d > -.3){ var b = bloomAt(x, z, h / KM); bl[k * 2] = b[0]; bl[k * 2 + 1] = b[1]; }
    else { bl[k * 2] = 999; bl[k * 2 + 1] = 999; }
  }
  var idx = [];
  for (j = 0; j < NZ - 1; j++) for (i = 0; i < NX - 1; i++){
    var a = j * NX + i, b2 = a + 1, c2 = a + NX, d2 = c2 + 1;
    if (Math.min(DIST[a], DIST[b2], DIST[c2], DIST[d2]) < .4) idx.push(a, c2, b2, b2, c2, d2);
  }
  var g = new T.BufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(pos, 3));
  g.setAttribute('color', new T.BufferAttribute(cols, 3));
  g.setAttribute('aBloom', new T.BufferAttribute(bl, 2));
  g.setIndex(new T.BufferAttribute(new Uint32Array(idx), 1)); g.computeVertexNormals();
  scene.add(new T.Mesh(g, landMat));
}
function bloomPatch(mat){
  mat.onBeforeCompile = function(sh){
    sh.uniforms.uDay = U.day;
    sh.vertexShader = 'attribute vec2 aBloom; varying vec2 vB; varying vec3 vP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvB = aBloom; vP = position;');
    sh.fragmentShader = 'uniform float uDay; varying vec2 vB; varying vec3 vP;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n' + [
      'float o = vB.x, f = vB.y, dur = max(f - o, 3.), fl = max(5., dur * .45);',
      'float hk = vP.y / ' + KM.toFixed(3) + ';',
      'float lat = 35.8 - vP.z * 25. / 111.32;',
      'float land = smoothstep(.0, .025, vP.y);',
      'float line = .7 + (uDay - 10.) * .016 - (lat - 35.) * .13;',
      'float snow = smoothstep(line, line + .18, hk) * land;',
      'float dorm = (1. - smoothstep(o - 22., o - 2., uDay)) * land;',
      'float mot = .8 + .2 * sin(vP.x * 9. + sin(vP.z * 7.) * 1.5) * sin(vP.z * 8. - vP.x * 3.);',
      'float pink = smoothstep(o - 1., o + dur * .55, uDay) * (1. - smoothstep(f + fl, f + fl + 7., uDay)) * land * (1. - snow);',
      'float leaf = smoothstep(f + fl + 2., f + fl + 10., uDay) * land * (1. - snow);',
      'vec3 c = diffuseColor.rgb;',
      'c = mix(c, c * vec3(.82, .78, .7) + vec3(.07, .055, .03), dorm * .7);',
      'c = mix(c, vec3(.55, .84, .42), leaf * .3);',
      'c = mix(c, mix(vec3(.97, .66, .78), vec3(.93, .42, .62), smoothstep(f - 3., f + 2., uDay)), pink * mot * .9);',
      'c = mix(c, vec3(.97, .98, 1.), snow * .92);',
      'float o0 = o - max(0., hk) * ' + LAPSE.toFixed(1) + ';',
      'float fr = (1. - smoothstep(.0, .8, abs(uDay - o0))) * land * (1. - snow) * .8;',
      'c = mix(c, vec3(.82, .1, .38), fr * .9);',
      'diffuseColor.rgb = c;'].join('\n'));
  };
  mat.customProgramCacheKey = function(){ return 'bloom'; };
  return mat;
}

/* ---------- 海 ---------- */
var SEA_VS = 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }';
var SEA_FS = [
  'uniform sampler2D uDist; uniform vec4 uExt; uniform float uTime, uCalm; uniform vec3 uHorizon; varying vec3 vW;',
  'void main(){',
  '  vec2 uv = (vW.xz - uExt.xy) / uExt.zw;',
  '  float d = texture2D(uDist, uv).r * 6.;',
  '  if (uv.x < 0. || uv.y < 0. || uv.x > 1. || uv.y > 1.) d = 6.;',
  '  vec3 col = mix(vec3(.62,.90,.88), vec3(.36,.74,.86), smoothstep(.05, .7, d));',
  '  col = mix(col, vec3(.18,.47,.75), smoothstep(.6, 2.2, d));',
  '  col = mix(col, vec3(.11,.29,.58), smoothstep(2., 5.5, d));',
  '  float t = uTime * uCalm;',
  '  float w = sin(vW.x*1.3 + sin(vW.z*.9 + t*.5)*1.6 + t*.7) * sin(vW.z*1.7 - t*.5 + sin(vW.x*.8)*1.3);',
  '  col = mix(col, vec3(1.), smoothstep(.88, .97, w) * .35);',
  '  float f = 1. - smoothstep(.02, .09 + .03 * sin(t*2. + vW.x*5. + vW.z*3.), d);',
  '  col = mix(col, vec3(1.), f * .85);',
  '  float alpha = mix(.55, .85, smoothstep(0., 2.5, d));',
  '  float hz = smoothstep(90., 260., length(vW.xz - cameraPosition.xz));',
  '  col = mix(col, uHorizon, hz); alpha = mix(alpha, 1., hz);',
  '  gl_FragColor = vec4(col, alpha);',
  '}'].join('\n');
var BED_FS = [
  'uniform sampler2D uDist; uniform vec4 uExt; uniform vec3 uHorizon; varying vec3 vW;',
  'void main(){',
  '  vec2 uv = (vW.xz - uExt.xy) / uExt.zw; float d = texture2D(uDist, uv).r * 6.;',
  '  if (uv.x < 0. || uv.y < 0. || uv.x > 1. || uv.y > 1.) d = 6.;',
  '  vec3 col = mix(vec3(.66,.84,.76), vec3(.2,.45,.62), smoothstep(.1, 1.2, d));',
  '  col = mix(col, vec3(.06,.17,.38), smoothstep(1.5, 5., d));',
  '  float hz = smoothstep(90., 260., length(vW.xz - cameraPosition.xz)); col = mix(col, uHorizon, hz);',
  '  gl_FragColor = vec4(col, 1.);',
  '}'].join('\n');
function buildSea(){
  var data = new Uint8Array(NX * NZ * 4);
  for (var k = 0; k < NX * NZ; k++){ data[k * 4] = Math.round(Math.max(0, Math.min(6, DIST[k])) / 6 * 255); data[k * 4 + 3] = 255; }
  var tex = new T.DataTexture(data, NX, NZ, T.RGBAFormat);
  tex.magFilter = tex.minFilter = T.LinearFilter; tex.wrapS = tex.wrapT = T.ClampToEdgeWrapping; tex.needsUpdate = true;
  var uni = {uDist:{value:tex}, uExt:{value:new T.Vector4(EXT.x0, EXT.z0, (NX - 1) * RES, (NZ - 1) * RES)},
    uTime:U.time, uCalm:{value:reduce ? .15 : 1}, uHorizon:{value:new T.Vector3(.86, .9, .97)}};
  seaMat = new T.ShaderMaterial({uniforms:uni, vertexShader:SEA_VS, fragmentShader:SEA_FS, transparent:true});
  var sea = new T.Mesh(new T.PlaneGeometry(700, 700), seaMat);
  sea.rotation.x = -Math.PI / 2; sea.renderOrder = 2; scene.add(sea);
  var bed = new T.Mesh(new T.PlaneGeometry(700, 700), new T.ShaderMaterial({uniforms:{uDist:uni.uDist, uExt:uni.uExt, uHorizon:uni.uHorizon}, vertexShader:SEA_VS, fragmentShader:BED_FS}));
  bed.rotation.x = -Math.PI / 2; bed.position.y = -.5; scene.add(bed);
}

/* ---------- 地標與櫻樹 ---------- */
var MC = {}, GC = {};
function M(c){ return MC[c] || (MC[c] = new T.MeshToonMaterial({color:c, gradientMap:toonGrad})); }
function box(w, h, d){ var k = 'b' + w + h + d; return GC[k] || (GC[k] = new T.BoxGeometry(w, h, d)); }
function roof(r, h, top){ var k = 'r' + r + h + (top || 0); if (!GC[k]){ GC[k] = new T.CylinderGeometry(top || 0, r, h, 4, 1); GC[k].rotateY(Math.PI / 4); } return GC[k]; }
function cyl(r0, r1, h, n){ var k = 'c' + r0 + r1 + h + (n || 8); return GC[k] || (GC[k] = new T.CylinderGeometry(r0, r1, h, n || 8)); }
function ball(r){ var k = 's' + r; return GC[k] || (GC[k] = new T.IcosahedronGeometry(r, 1)); }
function mesh(g, c, x, y, z, ry){ var m = new T.Mesh(g, M(c)); m.position.set(x || 0, y || 0, z || 0); if (ry) m.rotation.y = ry; return m; }
function flat(w, d, c, x, z, y){ var g = GC['p' + w + d] || (GC['p' + w + d] = new T.PlaneGeometry(w, d)); var m = new T.Mesh(g, M(c)); m.rotation.x = -Math.PI / 2; m.position.set(x || 0, y || .004, z || 0); return m; }
function disc(r, c, x, z, y){ var g = GC['d' + r] || (GC['d' + r] = new T.CircleGeometry(r, 28)); var m = new T.Mesh(g, M(c)); m.rotation.x = -Math.PI / 2; m.position.set(x || 0, y || .004, z || 0); return m; }
var WATER = '#6cc3e0', STONE = '#a7a196', WOOD = '#7a5236', VERM = '#d9472b';

function castle(o){
  var g = new T.Group(), wall = o.wall || '#f6f2e7', rf = o.roof || '#5d7476';
  g.add(mesh(roof(.27, .1, .2), STONE, 0, .05));
  var y = .1;
  for (var i = 0; i < 3; i++){
    var w = .24 - i * .055, h = .07;
    g.add(mesh(box(w, h, w * .8), wall, 0, y + h / 2));
    g.add(mesh(roof(w * .85, .05, w * .45), rf, 0, y + h + .02));
    y += h + .04;
  }
  g.add(mesh(roof(.07, .06), rf, 0, y + .02));
  return g;
}
function pagoda(c){
  var g = new T.Group(), y = 0;
  for (var i = 0; i < 5; i++){
    var w = .12 - i * .014;
    g.add(mesh(box(w, .05, w), c, 0, y + .025));
    g.add(mesh(roof(w * 1.15, .03, w * .5), '#4a4140', 0, y + .062));
    y += .075;
  }
  g.add(mesh(cyl(.006, .006, .14, 5), '#c9a227', 0, y + .07));
  return g;
}
function torii(){
  var g = new T.Group();
  [-.09, .09].forEach(function(x){ g.add(mesh(cyl(.012, .014, .22, 8), VERM, x, .11)); });
  g.add(mesh(box(.28, .025, .03), '#2f2a2a', 0, .225));
  g.add(mesh(box(.22, .018, .02), VERM, 0, .18));
  return g;
}
function hall(c){
  var g = new T.Group();
  g.add(mesh(box(.22, .08, .16), c || '#a0643f', 0, .04));
  g.add(mesh(roof(.21, .1, .04), '#3e3a3c', 0, .13));
  return g;
}
function bridgeArches(n){
  var g = new T.Group(), tg = GC.tor || (GC.tor = new T.TorusGeometry(.06, .012, 6, 14, Math.PI));
  for (var i = 0; i < n; i++){ var m = new T.Mesh(tg, M(WOOD)); m.position.set(-.06 * (n - 1) + i * .12, .01, 0); g.add(m); }
  g.add(flat(.16 * n, .18, WATER, 0, 0));
  return g;
}
function lanternRow(){
  var g = new T.Group();
  for (var i = 0; i < 6; i++){
    var x = -.25 + i * .1;
    g.add(mesh(cyl(.005, .005, .14, 4), '#5b4636', x, .07));
    g.add(mesh(cyl(.02, .02, .04, 8), i % 2 ? '#fff4e0' : '#e8573f', x, .14));
  }
  return g;
}
function stoneLantern(){
  var g = new T.Group();
  g.add(mesh(cyl(.012, .016, .07, 6), STONE, 0, .035));
  g.add(mesh(box(.035, .025, .035), '#c9c3b5', 0, .085));
  g.add(mesh(roof(.04, .025), STONE, 0, .11));
  return g;
}
function starFort(){
  var g = new T.Group(), sh = new T.Shape(), hole = new T.Path();
  for (var i = 0; i < 10; i++){
    var a = i / 10 * Math.PI * 2 - Math.PI / 2, r = i % 2 ? .13 : .27, ri = i % 2 ? .1 : .22;
    var p = [Math.cos(a) * r, Math.sin(a) * r], q = [Math.cos(a) * ri, Math.sin(a) * ri];
    if (i) { sh.lineTo(p[0], p[1]); hole.lineTo(q[0], q[1]); } else { sh.moveTo(p[0], p[1]); hole.moveTo(q[0], q[1]); }
  }
  sh.holes.push(hole);
  var m = new T.Mesh(new T.ShapeGeometry(sh), M(WATER)); m.rotation.x = -Math.PI / 2; m.position.y = .006; g.add(m);
  g.add(mesh(box(.1, .05, .06), '#f1ead8', .0, .025, .02));
  return g;
}
function stoneWalls(){
  var g = new T.Group();
  g.add(mesh(roof(.24, .12, .17), STONE, 0, .06));
  g.add(mesh(box(.08, .05, .06), '#f4f0e6', .05, .145, 0));
  g.add(mesh(roof(.07, .04, .02), '#55595c', .05, .19, 0));
  return g;
}
function gusuku(){
  var g = new T.Group(), tg = GC.gs || (GC.gs = new T.TorusGeometry(.2, .025, 5, 24, Math.PI * 1.5));
  var w = new T.Mesh(tg, M('#d9c79a')); w.rotation.x = -Math.PI / 2; w.position.y = .025; w.scale.set(1, .75, 2.4); g.add(w);
  var w2 = new T.Mesh(tg, M('#d9c79a')); w2.rotation.x = -Math.PI / 2; w2.position.set(.05, .025, -.02); w2.scale.set(.6, .5, 2.4); w2.rotation.z = 2; g.add(w2);
  return g;
}
function houses(){
  var g = new T.Group();
  for (var i = 0; i < 3; i++){
    var x = -.18 + i * .18;
    g.add(mesh(box(.12, .06, .1), '#2e2a2a', x, .03));
    g.add(mesh(roof(.11, .06, .02), '#4a4a4a', x, .09));
  }
  g.add(flat(.6, .07, '#cdbf9f', 0, .1));
  return g;
}
function volcano(){
  var g = new T.Group();
  g.add(mesh(cyl(.04, .2, .22, 10), '#8c8378', .32, .11, -.25));
  for (var i = 0; i < 3; i++){ var b = new T.Mesh(ball(.04 + i * .015), new T.MeshToonMaterial({color:'#e7e3df', gradientMap:toonGrad, transparent:true, opacity:.8})); b.position.set(.32 + i * .04, .26 + i * .06, -.25); g.add(b); }
  return g;
}
var LM = {
  castle:function(){ return castle({}); }, blackcastle:function(){ return castle({wall:'#2f2c2f', roof:'#3a3d42'}); }, whitecastle:function(){ return castle({wall:'#ffffff', roof:'#9aa4aa'}); },
  pagoda:function(p){ return pagoda(p.id === 'chureito' ? VERM : '#7a5638'); }, torii:torii, temple:function(){ return hall(); },
  mountain:function(){ var g = hall('#8a5a3a'); g.scale.setScalar(.7); return g; },
  lone:function(){ var g = new T.Group(); for (var i = 0; i < 10; i++){ var a = i / 10 * Math.PI * 2; g.add(mesh(cyl(.004, .004, .03, 4), WOOD, Math.cos(a) * .2, .015, Math.sin(a) * .2)); } return g; },
  river:function(){ var g = new T.Group(); g.add(flat(1.0, .1, WATER, 0, 0)); return g; },
  canal:function(){ var g = new T.Group(); g.add(flat(.9, .05, WATER, 0, 0)); g.add(flat(.9, .05, '#cdbf9f', 0, .07)); return g; },
  moat:function(){ var g = new T.Group(); g.add(flat(.9, .14, WATER, 0, 0)); g.add(mesh(box(.9, .04, .04), STONE, 0, .02, -.09)); return g; },
  avenue:function(){ var g = new T.Group(); g.add(flat(1.0, .07, '#b9b2a3', 0, 0)); return g; },
  lantern:lanternRow,
  garden:function(){ var g = new T.Group(); g.add(disc(.13, WATER, -.05, .05)); var l = stoneLantern(); l.position.set(.1, 0, .05); g.add(l); return g; },
  fort:starFort, gate:stoneWalls, gusuku:gusuku, house:houses, volcano:volcano,
  bridge:function(){ return bridgeArches(5); },
  lake:function(){ var g = new T.Group(); g.add(disc(.3, WATER, 0, .15)); g.add(mesh(box(.06, .02, .025), '#ffffff', .05, .012, .15)); return g; },
  park:function(){ var g = new T.Group(); g.add(flat(.4, .06, '#cdbf9f', 0, 0)); return g; }
};
var TRUNK, CROWN;
function tree(big){
  var g = new T.Group(), s = big ? 2.4 : 1;
  var t = new T.Mesh(TRUNK, M('#6e4b37')); t.position.y = .04 * s; t.scale.setScalar(s); g.add(t);
  var crowns = [];
  [[0, .1, 0, 1], [-.035, .085, .02, .8], [.035, .088, -.015, .85]].forEach(function(c){
    var m = new T.Mesh(CROWN, M('#ffffff')); m.position.set(c[0] * s, c[1] * s, c[2] * s); m.scale.setScalar(c[3] * s); m.userData.k = c[3] * s; g.add(m); crowns.push(m);
  });
  g.userData.crowns = crowns;
  return g;
}
/* 樹的位置：依地標型態排成一圈、沿河兩排或單棵 */
function treeLayout(lm, id){
  var out = [], i;
  if (lm === 'lone') return [[0, 0, 1]];
  if (lm === 'river' || lm === 'canal' || lm === 'moat' || lm === 'avenue'){
    for (i = 0; i < 9; i++){ out.push([-.44 + i * .11, -.11, 0]); out.push([-.44 + i * .11 + .05, .11, 0]); }
    return out;
  }
  var n = lm === 'mountain' ? 14 : 9;
  for (i = 0; i < n; i++){
    var a = i / n * Math.PI * 2 + hash(i + id.length), r = (lm === 'mountain' ? .22 : .3) + hash(i * 7.1 + id.length) * .14;
    out.push([Math.cos(a) * r, Math.sin(a) * r, 0]);
  }
  return out;
}
var STAGE_SCALE = {bud:.55, swell:.62, open:.85, half:.95, full:1.12, fall:.98, leaf:1};
var CMAT = {};
function crownMat(vid, st){
  var key = vid + st;
  if (CMAT[key]) return CMAT[key];
  var v = SK.varById[vid], vc = col(v.color), c;
  if (st === 'bud') c = col('#8a7360');
  else if (st === 'swell') c = col('#8a7360').lerp(col(v.core), .45);
  else if (st === 'open') c = col('#f6eef0').lerp(vc, .55);
  else if (st === 'half') c = vc.clone();
  else if (st === 'full') c = vc.clone().lerp(col(v.core), .18);
  else if (st === 'fall') c = vc.clone().lerp(col('#a7d47f'), .35);
  else c = col('#67b456');
  return (CMAT[key] = new T.MeshToonMaterial({color:c, gradientMap:toonGrad}));
}

/* ---------- 標籤 ---------- */
function addLabel(el, pos, pri, kind, extra){
  el.classList.add('lab3d', 'off');
  labelRoot.appendChild(el);
  var L = Object.assign({el:el, pos:pos, pri:pri, kind:kind, w:0, h:0, active:true, off:true}, extra || {});
  labels.push(L);
  return L;
}
function layoutLabels(){
  var W = host.clientWidth, H = host.clientHeight, placed = [];
  var sorted = labels.slice().sort(function(a, b){ return (b.pri + (b.boost || 0)) - (a.pri + (a.boost || 0)); });
  for (var i = 0; i < sorted.length; i++){
    var L = sorted[i];
    if (!L.active || (L.kind === 'spot' && !showLabels && !L.boost)){ hide(L); continue; }
    tmpV.copy(L.pos).project(camera);
    if (tmpV.z > 1 || tmpV.z < -1){ hide(L); continue; }
    var x = (tmpV.x * .5 + .5) * W, y = (-tmpV.y * .5 + .5) * H;
    if (!L.w){ L.w = L.el.offsetWidth; L.h = L.el.offsetHeight; }
    var r = [x - L.w / 2, y - L.h, x + L.w / 2, y];
    if (r[2] < 0 || r[0] > W || r[3] < 0 || r[1] > H){ hide(L); continue; }
    var hit = false;
    if (L.kind !== 'sea') for (var k = 0; k < placed.length; k++){ var q = placed[k]; if (r[0] < q[2] + 2 && r[2] > q[0] - 2 && r[1] < q[3] + 1 && r[3] > q[1] - 1){ hit = true; break; } }
    if (hit){ hide(L); continue; }
    if (L.kind !== 'sea') placed.push(r);
    L.el.style.transform = 'translate(' + Math.round(r[0]) + 'px,' + Math.round(r[1]) + 'px)';
    if (L.off){ L.el.classList.remove('off'); L.off = false; }
  }
  function hide(L){ if (!L.off){ L.el.classList.add('off'); L.off = true; } }
}

/* ---------- 名所 ---------- */
function onLand(x, z){
  if (field(x, z) < -.1) return [x, z];
  for (var r = .05; r < 2; r += .05) for (var a = 0; a < 16; a++){
    var px = x + Math.cos(a / 16 * Math.PI * 2) * r, pz = z + Math.sin(a / 16 * Math.PI * 2) * r;
    if (field(px, pz) < -.12) return [px, pz];
  }
  return [x, z];
}
function layoutSpots(){
  var pos = SK.SPOTS.map(function(p){ return P(p.at[0], p.at[1]); }), used = [], groups = [];
  SK.SPOTS.forEach(function(p, i){
    if (used[i]) return;
    var g = [i]; used[i] = 1;
    for (var k = i + 1; k < pos.length; k++) if (!used[k] && g.some(function(m){ return Math.hypot(pos[m][0] - pos[k][0], pos[m][1] - pos[k][1]) < .75; })){ g.push(k); used[k] = 1; }
    groups.push(g);
  });
  var out = [];
  groups.forEach(function(g){
    if (g.length === 1){ out[g[0]] = onLand(pos[g[0]][0], pos[g[0]][1]); return; }
    var cx = 0, cz = 0; g.forEach(function(m){ cx += pos[m][0]; cz += pos[m][1]; }); cx /= g.length; cz /= g.length;
    var R = .45 + g.length * .08;
    g.forEach(function(m){
      var a = Math.atan2(pos[m][1] - cz, pos[m][0] - cx);
      if (Math.hypot(pos[m][1] - cz, pos[m][0] - cx) < .01) a = m;
      out[m] = [cx + Math.cos(a) * R, cz + Math.sin(a) * R];
    });
    // 均勻分開角度，避免擠在同一側
    var ang = g.map(function(m){ return {m:m, a:Math.atan2(out[m][1] - cz, out[m][0] - cx)}; }).sort(function(p, q){ return p.a - q.a; });
    ang.forEach(function(o, i){
      var a = ang[0].a + i / ang.length * Math.PI * 2;
      out[o.m] = onLand(cx + Math.cos(a) * R, cz + Math.sin(a) * R);
    });
  });
  return out;
}
function buildSpots(){
  TRUNK = new T.CylinderGeometry(.006, .01, .08, 5);
  CROWN = new T.IcosahedronGeometry(.05, 1);
  var places = layoutSpots();
  SK.SPOTS.forEach(function(p, i){
    var x = places[i][0], z = places[i][1], y = landY(x, z), grp = new T.Group();
    grp.position.set(x, y, z);
    var lm = (LM[p.lm] || LM.park)(p); grp.add(lm);
    var rot = p.lm === 'river' || p.lm === 'avenue' || p.lm === 'canal' || p.lm === 'moat' ? hash(i * 2.7) * 3 : 0;
    lm.rotation.y = rot;
    var trees = [];
    treeLayout(p.lm, p.id).forEach(function(t, k){
      var c = Math.cos(rot), s = Math.sin(rot), tx = t[0] * c + t[1] * s, tz = -t[0] * s + t[1] * c;
      var tr = tree(t[2]); tr.position.set(tx, landY(x + tx, z + tz) - y, tz); tr.rotation.y = hash(k + i) * 6; grp.add(tr); trees.push(tr);
    });
    grp.traverse(function(o){ if (o.isMesh){ o.userData.spotId = p.id; pickables.push(o); } });
    scene.add(grp);
    var el = document.createElement('button'); el.type = 'button'; el.className = 'plab'; el.dataset.spot = p.id;
    el.innerHTML = '<i></i>' + p.name;
    el.addEventListener('click', function(e){ e.stopPropagation(); if (S.onPickSpot) S.onPickSpot(p.id); });
    SPOT3[p.id] = {id:p.id, x:x, y:y, z:z, grp:grp, trees:trees, top:y + (p.lm === 'lone' ? .38 : .3), stage:null,
      label:addLabel(el, new T.Vector3(x, y + .45, z), 3, 'spot')};
  });
}
S.spot3 = function(id){ return SPOT3[id]; };
function applyStages(){
  SK.SPOTS.forEach(function(p){
    var S3 = SPOT3[p.id], st = SK.spotStage(p, curDay), stg = SK.stageById[st];
    if (S3.stage === st) return;
    S3.stage = st;
    var m = crownMat(p.v[0], st), sc = STAGE_SCALE[st];
    S3.trees.forEach(function(t){ t.userData.crowns.forEach(function(c){ c.material = m; c.scale.setScalar(c.userData.k * sc); }); });
    S3.label.el.querySelector('i').style.background = stg.c;
    S3.label.el.dataset.st = st;
    S3.label.pri = 3 + (SK.isPeak(st) ? 1 : 0);
  });
}

/* ---------- 花瓣 ---------- */
var PN = 1400, PET;
function petalTex(){
  var c = document.createElement('canvas'); c.width = c.height = 64;
  var x = c.getContext('2d');
  x.translate(32, 34); x.fillStyle = '#ffd9e5'; x.strokeStyle = '#f39ab7'; x.lineWidth = 3;
  x.beginPath(); x.moveTo(0, 24); x.bezierCurveTo(-22, 8, -18, -18, -6, -24); x.lineTo(0, -16); x.lineTo(6, -24); x.bezierCurveTo(18, -18, 22, 8, 0, 24); x.closePath(); x.fill(); x.stroke();
  var t = new T.CanvasTexture(c); return t;
}
function buildPetals(){
  var g = new T.BufferGeometry(), pos = new Float32Array(PN * 3);
  g.setAttribute('position', new T.BufferAttribute(pos, 3));
  var m = new T.PointsMaterial({size:.05, map:petalTex(), transparent:true, depthWrite:false, alphaTest:.15, sizeAttenuation:true});
  petals = new T.Points(g, m); petals.frustumCulled = false; scene.add(petals);
  PET = {pos:pos, v:new Float32Array(PN * 4), em:[], live:0};
  for (var i = 0; i < PN; i++) pos[i * 3 + 1] = -99;
}
function petalEmitters(){
  var em = [];
  SK.SPOTS.forEach(function(p){
    var S3 = SPOT3[p.id], st = S3.stage, w = st === 'fall' ? 1 : st === 'full' ? .45 : st === 'half' ? .12 : 0;
    if (p.id === selId) w *= 3;
    if (w) em.push({S3:S3, w:w});
  });
  var tot = em.reduce(function(a, e){ return a + e.w; }, 0), acc = 0;
  em.forEach(function(e){ acc += e.w / (tot || 1); e.c = acc; });
  PET.em = em;
}
function spawn(i){
  var em = PET.em, r = Math.random(), e = null;
  for (var k = 0; k < em.length; k++) if (r <= em[k].c){ e = em[k]; break; }
  if (!e){ PET.pos[i * 3 + 1] = -99; PET.v[i * 4 + 3] = 0; return; }
  var t = e.S3.trees[(Math.random() * e.S3.trees.length) | 0], wp = t.getWorldPosition(tmpV);
  var s = e.S3.trees.length === 1 ? 2.4 : 1;
  PET.pos[i * 3] = wp.x + (Math.random() - .5) * .1 * s; PET.pos[i * 3 + 1] = wp.y + (.07 + Math.random() * .06) * s; PET.pos[i * 3 + 2] = wp.z + (Math.random() - .5) * .1 * s;
  PET.v[i * 4] = .03 + Math.random() * .05; PET.v[i * 4 + 1] = Math.random() * 6.28; PET.v[i * 4 + 2] = wp.y - .01; PET.v[i * 4 + 3] = 1;
}
function updatePetals(t, dt){
  if (!petals) return;
  var n = PET.em.length ? (reduce ? 350 : PN) : 0, pos = PET.pos, v = PET.v, k = reduce ? .35 : 1;
  for (var i = 0; i < PN; i++){
    if (i >= n){ if (pos[i * 3 + 1] > -50){ pos[i * 3 + 1] = -99; v[i * 4 + 3] = 0; } continue; }
    if (!v[i * 4 + 3] || pos[i * 3 + 1] < v[i * 4 + 2]){ if (Math.random() < .08) spawn(i); else { pos[i * 3 + 1] = -99; v[i * 4 + 3] = 0; } continue; }
    var ph = v[i * 4 + 1] + t * 2.2;
    pos[i * 3] += (Math.sin(ph) * .05 + .04) * dt * k;
    pos[i * 3 + 2] += Math.cos(ph * .7) * .03 * dt * k;
    pos[i * 3 + 1] -= v[i * 4] * dt * k;
  }
  petals.geometry.attributes.position.needsUpdate = true;
}

/* ---------- 雲 ---------- */
function cloud(seed){
  var g = new T.Group(), m = new T.MeshToonMaterial({color:'#ffffff', gradientMap:toonGrad, transparent:true, opacity:.94});
  var n = 4 + (seed % 3);
  for (var i = 0; i < n; i++){
    var r = 1.4 + hash(seed * 7 + i) * 1.3, s = new T.Mesh(new T.SphereGeometry(r, 12, 9), m);
    s.position.set((i - n / 2) * 1.6 + hash(seed + i), hash(seed * 3 + i) * .7, (hash(seed * 5 + i) - .5) * 2);
    s.scale.y = .55; g.add(s);
  }
  return g;
}

/* ---------- 相機 ---------- */
S.flyTo = function(x, z, dist, dur){
  var dir = new T.Vector3().subVectors(camera.position, controls.target);
  if (dir.lengthSq() < 1e-6) dir.set(0, 1, .8);
  var pol = Math.max(.45, Math.min(1.0, Math.acos(dir.clone().normalize().y)));
  var az = Math.atan2(dir.x, dir.z);
  if (dist > 60) { pol = .62; az = -.06; }
  var toT = new T.Vector3(x, 0, z), off = new T.Vector3(Math.sin(pol) * Math.sin(az), Math.cos(pol), Math.sin(pol) * Math.cos(az)).multiplyScalar(dist);
  fly = {fromT:controls.target.clone(), toT:toT, fromP:camera.position.clone(), toP:toT.clone().add(off), t0:clock.elapsedTime, dur:reduce ? .01 : (dur || 1.2)};
};
function fitDist(span){ var a = host.clientWidth / Math.max(1, host.clientHeight); return Math.max(4.5, span * 1.25 + 3) * (a < .6 ? 2 : a < .8 ? 1.6 : 1); }
S.overview = function(){ S.flyTo(-7.5, 9, fitDist(94), 1.1); };
S.focusSpot = function(id){ var S3 = SPOT3[id]; if (S3) S.flyTo(S3.x, S3.z, fitDist(3.2), 1.2); };
S.focusRegion = function(ids){
  var xs = [], zs = [];
  ids.forEach(function(id){ var S3 = SPOT3[id]; if (S3){ xs.push(S3.x); zs.push(S3.z); } });
  if (!xs.length) return;
  var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), z0 = Math.min.apply(null, zs), z1 = Math.max.apply(null, zs);
  S.flyTo((x0 + x1) / 2, (z0 + z1) / 2, fitDist(Math.max(x1 - x0, z1 - z0, 3)), 1.1);
};
S.focusLonLat = function(lon, lat, span){ var q = P(lon, lat); S.flyTo(q[0], q[1], fitDist(span || 10), 1.1); };

/* ---------- 對外 ---------- */
S.setDay = function(d){
  curDay = d; U.day.value = d;
  if (!S.ready) return;
  applyStages(); petalEmitters();
};
S.selectSpot = function(id){
  if (selId && SPOT3[selId]){ SPOT3[selId].label.el.classList.remove('on'); SPOT3[selId].label.boost = 0; }
  selId = id || null;
  if (selId && SPOT3[selId]){ SPOT3[selId].label.el.classList.add('on'); SPOT3[selId].label.boost = 10; SPOT3[selId].label.w = 0; }
  if (S.ready) petalEmitters();
};
S.setLabels = function(on){ showLabels = !!on; };
S.setReduce = function(on){ reduce = !!on; if (seaMat) seaMat.uniforms.uCalm.value = reduce ? .15 : 1; };
S.setFront = function(o){
  if (!frontLab) return;
  if (!o){ frontLab.active = false; return; }
  var q = P(o.lon, o.lat);
  frontLab.active = true; frontLab.pos.set(q[0], landY(q[0], q[1]) + .6, q[1]);
  frontLab.el.textContent = o.text; frontLab.w = 0;
};
S.resize = function(){ if (S.ready) resize(); };
S.setSky = function(c){ if (seaMat) seaMat.uniforms.uHorizon.value.set(c[0], c[1], c[2]); };

/* ---------- 互動 ---------- */
function pick(ev){
  var r = renderer.domElement.getBoundingClientRect();
  ndc.set((ev.clientX - r.left) / r.width * 2 - 1, -(ev.clientY - r.top) / r.height * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  var hit = raycaster.intersectObjects(pickables, false)[0];
  return hit ? hit.object.userData : null;
}
function bindPointer(){
  var el = renderer.domElement, down = null, q = null, pending = false;
  el.addEventListener('pointerdown', function(e){ down = {x:e.clientX, y:e.clientY}; });
  el.addEventListener('pointerup', function(e){
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
    down = null;
    var u = pick(e); if (u && u.spotId && S.onPickSpot) S.onPickSpot(u.spotId);
  });
  el.addEventListener('pointermove', function(e){
    if (e.pointerType !== 'mouse') return;
    q = e; if (pending) return; pending = true;
    requestAnimationFrame(function(){ pending = false; el.style.cursor = pick(q) ? 'pointer' : ''; });
  });
}

/* ---------- 迴圈 ---------- */
function resize(){
  var w = host.clientWidth, h = host.clientHeight;
  renderer.setSize(w, h, false); camera.aspect = w / Math.max(1, h);
  if (w > 760) camera.setViewOffset(w, h, Math.min(190, w * .13), 0, w, h);
  else camera.setViewOffset(w, h, 0, document.body.classList.contains('sheet-min') ? h * .06 : h * .2, w, h);
  camera.updateProjectionMatrix();
  labels.forEach(function(L){ L.w = 0; });
}
function loop(){
  requestAnimationFrame(loop);
  var dt = Math.min(.05, clock.getDelta()), t = clock.elapsedTime;
  U.time.value = t;
  if (fly){
    var k = Math.min(1, (t - fly.t0) / fly.dur), e = ease(k);
    controls.target.lerpVectors(fly.fromT, fly.toT, e); camera.position.lerpVectors(fly.fromP, fly.toP, e);
    if (k >= 1) fly = null;
  }
  controls.update();
  updatePetals(t, dt);
  clouds.forEach(function(C){ C.g.position.x += dt * C.v * (reduce ? .3 : 1); if (C.g.position.x > EXT.x1 + 20) C.g.position.x = EXT.x0 - 20; });
  var S3 = selId && SPOT3[selId];
  if (S3 && !reduce) S3.grp.children.forEach(function(o){ if (o.userData.crowns) o.rotation.z = Math.sin(t * 1.6 + o.position.x * 9) * .03; });
  renderer.render(scene, camera);
  layoutLabels();
}

/* ---------- 啟動 ---------- */
S.init = function(opts){
  host = opts.host; labelRoot = opts.labels;
  if (opts.reduce !== undefined) reduce = opts.reduce;
  if (opts.day) curDay = opts.day;
  return Promise.all([import('three'), import('three/addons/controls/OrbitControls.js')]).then(function(mods){
    T = mods[0]; Orbit = mods[1].OrbitControls; tmpV = new T.Vector3();
    clock = new T.Clock();
    LANDC = {under:col('#a6d7c6'), sand:col('#efe2b4'), plain:col('#b8dc8a'), grass:col('#93c46c'), forest:col('#68a35d'), deep:col('#4f8659'), rock:col('#9a958a'), snow:col('#f5f7fb')};
    renderer = new T.WebGLRenderer({antialias:true, alpha:true});
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    host.appendChild(renderer.domElement);
    scene = new T.Scene();
    camera = new T.PerspectiveCamera(40, 1, .05, 900);
    camera.position.set(-1.5, 70, 50);
    controls = new Orbit(camera, renderer.domElement);
    controls.target.set(-1.5, 0, 0);
    controls.enableDamping = true; controls.dampingFactor = .08;
    controls.maxPolarAngle = 1.3; controls.minDistance = 1.2; controls.maxDistance = 320;
    controls.screenSpacePanning = false; controls.zoomSpeed = .9;
    controls.addEventListener('start', function(){ fly = null; });
    raycaster = new T.Raycaster(); ndc = new T.Vector2();
    toonGrad = new T.DataTexture(new Uint8Array([110, 190, 255]), 3, 1, T.RedFormat);
    toonGrad.minFilter = toonGrad.magFilter = T.NearestFilter; toonGrad.needsUpdate = true;
    landMat = bloomPatch(new T.MeshToonMaterial({vertexColors:true, gradientMap:toonGrad}));
    scene.add(new T.HemisphereLight('#fff4f8', '#a9cf9a', 1.5));
    var sun = new T.DirectionalLight('#fff3e2', 2.3); sun.position.set(-30, 50, 25); scene.add(sun);
    scene.add(new T.AmbientLight('#ffffff', .35));

    buildPolys(); prepRidges(); buildField(); prepBloom();
    buildSea(); buildLand(); buildSpots(); buildPetals();

    ISL.forEach(function(I){
      if (!I.name) return;
      var el = document.createElement('div'); el.className = I.main ? 'ilab main' : 'ilab'; el.textContent = I.name;
      var at = {honshu:[138.6, 37.6], hokkaido:[142.9, 43.4], kyushu:[130.9, 32.6], shikoku:[133.6, 33.7]}[I.id];
      var q = at ? P(at[0], at[1]) : I.c;
      addLabel(el, new T.Vector3(q[0], at ? 1.6 : .5, q[1]), I.main ? 6 : 2, 'isle');
    });
    SK.PEAKS.forEach(function(pk){
      var q = P(pk.at[0], pk.at[1]), el = document.createElement('div'); el.className = 'pk';
      el.textContent = '▲ ' + pk.name + ' ' + pk.m.toLocaleString() + 'm';
      addLabel(el, new T.Vector3(q[0], landY(q[0], q[1]) + .2, q[1]), pk.name === '富士山' ? 4 : 1, 'peak');
    });
    [['日 本 海', 134.8, 39.4], ['太 平 洋', 142.3, 34.6], ['鄂霍次克海', 145.2, 45.3], ['東 海', 127.6, 30.8], ['瀨戶內海', 133.0, 34.2]].forEach(function(s, i){
      var q = P(s[1], s[2]), el = document.createElement('div'); el.className = i === 4 ? 'sealab small' : 'sealab'; el.textContent = s[0];
      addLabel(el, new T.Vector3(q[0], .1, q[1]), 0, 'sea');
    });
    var fe = document.createElement('div'); fe.className = 'frontlab';
    frontLab = addLabel(fe, new T.Vector3(), 9, 'front', {active:false});
    for (var i = 0; i < 7; i++){
      var c = cloud(i + 1); c.position.set(EXT.x0 + hash(i * 3.3) * (EXT.x1 - EXT.x0 + 40), 26 + hash(i * 1.9) * 5, EXT.z0 + hash(i * 4.7) * (EXT.z1 - EXT.z0));
      c.scale.setScalar(.55 + hash(i * 2.2) * .4); scene.add(c); clouds.push({g:c, v:.35 + hash(i) * .4});
    }

    bindPointer();
    window.addEventListener('resize', resize); resize();
    if (window.ResizeObserver) new ResizeObserver(resize).observe(host);
    S.ready = true;
    S.setDay(curDay);
    S.overview(); fly.dur = .01;
    loop();
  });
};
S.stats = function(){
  return {spots:Object.keys(SPOT3).length, islands:ISL.length, labels:labels.length, visibleLabels:labels.filter(function(L){ return !L.off; }).length,
    petals:PET ? PET.em.length : 0, livePetals:PET ? Array.prototype.filter.call(PET.v, function(v, i){ return i % 4 === 3 && v; }).length : 0, day:curDay};
};
})();
