/* 4분 체육관 — 화면 로직. 등급 계산식은 pipeline/build.py 와 같다 */
const COLORS = {A:'#1b9e5a', B:'#6cc24a', C:'#f2a007', D:'#d62828'};
const DOW = ['월','화','수','목','금','토','일','공휴일'];
let P, SCHED = [], FAC = [], SUMMARY, PLACE, markers = [], filt = 'all', selected = null;

const map = L.map('map', {preferCanvas:true, zoomControl:true}).setView([36.35, 127.8], 7);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom:19, attribution:'© OpenStreetMap'}).addTo(map);
const renderer = L.canvas({padding:.5});

const $ = s => document.querySelector(s);
const hhmm = s => { if (!/^\d{3,4}$/.test(s||'')) return null; s = s.padStart(4,'0'); return +s.slice(0,2)*60 + +s.slice(2); };

function available(si, dow, minute){
  const part = (SCHED[si]||'').split('|')[dow] || '-';
  const [s, e] = part.split('-'); let a = hhmm(s), b = hhmm(e);
  if (a === null || b === null)                        // 이 요일만 비어 있으면 휴무(잠김), 전부 비어 있으면 미기재
    return (SCHED[si]||'').split('|').some(p => hhmm(p.split('-')[0]) !== null) ? false : null;
  if (b <= a) b += 1440; const m = minute >= a ? minute : minute + 1440;
  return a <= m && m < b;
}
const oneway = d => d * P.detour / P.walk_mps;
function gradeFrom(ow){ if (ow == null) return 'D'; if (ow <= P.grade_A) return 'A'; if (ow <= P.oneway_4min) return 'B'; if (ow <= P.grade_C) return 'C'; return 'D'; }
function gradeAt(f, dow, minute){
  for (const [d, si] of f.aed){ const ok = available(si, dow, minute); if (ok === null || ok) return {g:gradeFrom(oneway(d)), d, unknown: ok === null}; }
  return {g:'D', d:null};
}

function curTime(){ return {dow:+$('#dow').value, minute:+$('#hour').value*60}; }

function passes(f){
  if (filt === 'public' && f.gb !== '공공') return false;
  if (filt === 'private' && f.gb === '공공') return false;
  if (filt === 'outdoor' && !(f.io === '실외' || f.io === '실내외')) return false;
  if (filt === 'seat' && !(f.seat > 0)) return false;
  if (filt === 'bad' && !'CD'.includes(f._g)) return false;
  const s = $('#sido').value; if (s && f.sido !== s) return false;
  const q = $('#q').value.trim(); if (q && !(f.nm + ' ' + f.addr).includes(q)) return false;
  return true;
}

function recolor(){
  const {dow, minute} = curTime(); const cnt = {A:0,B:0,C:0,D:0}; let n = 0;
  FAC.forEach((f, i) => { const r = gradeAt(f, dow, minute); f._g = r.g; });
  FAC.forEach((f, i) => {
    const m = markers[i], show = passes(f);
    if (show){ cnt[f._g]++; n++; m.setStyle({fillColor:COLORS[f._g], color:COLORS[f._g], opacity:.9, fillOpacity:.85}); if (!map.hasLayer(m)) m.addTo(map); }
    else if (map.hasLayer(m)) map.removeLayer(m);
  });
  const ok = cnt.A + cnt.B;
  $('#kpiPct').textContent = n ? Math.round(ok / n * 100) + '%' : '–';
  $('#gradeBar').innerHTML = 'ABCD'.split('').map(g => `<i style="width:${n?cnt[g]/n*100:0}%;background:${COLORS[g]}" title="${g} ${cnt[g].toLocaleString()}곳"></i>`).join('');
  $('.kpi .big span').textContent = `${DOW[dow]}요일 ${String(minute/60).padStart(2,'0')}:00, 4분 안에 AED가 닿는 체육시설 (${ok.toLocaleString()} / ${n.toLocaleString()}곳)`;
  if (selected !== null) showCard(selected);
}

function timeline(f, dow){
  let h = '';
  for (let hr = 0; hr < 24; hr++){ const g = gradeAt(f, dow, hr*60).g; h += `<i style="background:${COLORS[g]}" title="${hr}시 ${g}"></i>`; }
  return `<div class="timeline">${h}</div><div class="tl-axis"><span>0시</span><span>6시</span><span>12시</span><span>18시</span><span>24시</span></div>`;
}

let aedLayer = L.layerGroup().addTo(map);
function showCard(i){
  selected = i;
  aedLayer.clearLayers();
  { const ff = FAC[i]; const {dow, minute} = curTime();
    L.circleMarker([ff.lat, ff.lon], {radius:9, color:'#111', weight:3, fill:false}).addTo(aedLayer);
    ff.aed.forEach(([d, si, org, place, k]) => { const a = window.AED[k]; const ok = available(si, dow, minute);
      L.marker([a[0], a[1]], {icon: L.divIcon({className:'aedpin', iconSize:null, html:`<div style="background:${ok===false?'#777':'#d62828'};color:#fff;font:700 10px sans-serif;padding:2px 4px;border-radius:4px;white-space:nowrap">AED${ok===false?' 잠김':''}</div>`})}).bindTooltip(`${org} ${place} · ${d}m`).addTo(aedLayer); }); } const f = FAC[i]; const {dow, minute} = curTime(); const r = gradeAt(f, dow, minute);
  const need = r.d == null ? null : Math.round(P.t_recog + 2*oneway(r.d) + P.t_apply);
  const aed = f.aed.map(([d, si, org, place]) => { const ok = available(si, dow, minute);
    return `<li class="${ok===false?'off':''}">${d}m · 왕복 ${Math.round(2*oneway(d))}초 · ${org||'설치기관 미상'} ${place?'('+place+')':''} <span class="badge">${ok===null?'가용시간 미기재':ok?'지금 사용 가능':'지금 잠김'}</span></li>`; }).join('') || '<li>반경 '+P.search_m+'m 안에 등록된 AED 없음</li>';
  const badges = [
    `<span class="badge">공단 안전점검 · ${f.gb==='공공'?'공공체육시설':'체육시설업('+(f.gb||'')+')'}</span>`,
    (f.io==='실외'||f.io==='실내외') ? '<span class="badge warn">☀ 실외 — 폭염 주의 대상</span>' : '',
    f.seat>0 ? `<span class="badge hot">🏟 관람석 ${f.seat.toLocaleString()}명</span>` : ''].join('');
  const heat = f.heat ? (()=>{ const [t, at] = f.heat; const lv = t>=38?['폭염중대경보 수준 — 야외 운동 중지 권고','hot']:t>=35?['폭염경보 수준','hot']:t>=33?['폭염주의보 수준','warn']:['폭염 기준 미만','']; return `<dt>오늘 최고 체감</dt><dd><span class="badge ${lv[1]}">${t}℃ · ${at.slice(9,11)}시</span> ${lv[0]}</dd>`; })() : ((f.io==='실외'||f.io==='실내외') ? '<dt>폭염</dt><dd>실외 시설 — 운동장 온열질환자의 34.4%가 19세 이하(질병청 2011~2025)</dd>' : '');
  const defect = (f.defect||[]).map(d => `<div class="defect"><b>${d.t}</b> · ${d.d}<br>${d.s}${d.img?`<img loading="lazy" src="${d.img}" alt="결함사진">`:''}</div>`).join('');
  $('#tab-card').innerHTML = `<div class="card">
    <h2>${f.nm}</h2><div class="sub">${f.type||''} · ${f.addr||''}</div>${badges}
    <div class="gradebox"><div class="gl" style="background:${COLORS[r.g]}">${r.g}</div>
      <p><b>${DOW[dow]}요일 ${String(minute/60).padStart(2,'0')}:00 기준</b><br>${need==null?'이 시각 사용 가능한 AED가 반경 안에 없습니다':`쓰러진 뒤 제세동까지 약 <b>${Math.floor(need/60)}분 ${need%60}초</b>`}${r.unknown?'<br><small>가용시간 미기재 AED를 사용 가능으로 계산</small>':''}</p></div>
    <b>하루 동안의 등급 (${DOW[dow]}요일)</b>${timeline(f, dow)}
    <dl class="kv">
      <dt>가장 가까운 119</dt><dd>${f.ctr||'–'} (${f.ctr_m?Math.round(f.ctr_m/100)/10+'km':'–'}) · 도착 추정 ${f.ems_min??'–'}분</dd>
      <dt>공단 안전등급</dt><dd>${f.sgrade||'–'} ${f.sdate?'('+f.sdate+' 점검)':''}</dd>
      ${f.seat>0?`<dt>관람석</dt><dd>${f.seat.toLocaleString()}명 · 반경 300m 안 AED ${f.aed.filter(a=>a[0]<=300).length}대 · 관중 1천명당 ${(f.aed.filter(a=>a[0]<=300).length/f.seat*1e3).toFixed(2)}대</dd>`:''}
      ${heat}
      <dt>주변 정류장</dt><dd>${f.bus??'–'}곳 (반경 ${P.bus_radius}m)</dd>
    </dl>
    <b>가까운 AED</b><ul class="aedlist">${aed}</ul>${defect?'<b>공단 안전점검 결함</b>'+defect:''}</div>`;
  activate('card');
}

function activate(t){ document.querySelectorAll('.tabs nav button').forEach(b => b.classList.toggle('on', b.dataset.t === t)); document.querySelectorAll('.tab').forEach(d => d.classList.toggle('on', d.id === 'tab-' + t)); }

function rankTab(){
  const rows = SUMMARY.sgg.slice(0, 40).map((r, i) => `<tr><td>${i+1}</td><td>${r.sido} ${r.sgg}</td><td class="num">${r.n}</td><td class="num">${Math.round(r.share*100)}%</td></tr>`).join('');
  $('#tab-rank').innerHTML = `<p>평일 21시 기준, 4분 안에 AED가 닿지 않는(C·D) 체육시설 비율이 높은 시군구입니다(시설 5곳 이상).</p><table><tr><th>#</th><th>시군구</th><th class="num">시설</th><th class="num">C·D 비율</th></tr>${rows}</table>`;
}
function placeTab(){
  if (!PLACE || !PLACE.picks.length){ $('#tab-place').innerHTML = '<p>계산 결과 없음</p>'; return; }
  const top = PLACE.picks.slice(0, 30).map(p => `<tr data-lat="${p.lat}" data-lon="${p.lon}"><td>${p.rank}</td><td>${p.sido} ${p.sgg} ${p.nm}</td><td class="num">+${p.gain}</td><td class="num">${p.cum}</td></tr>`).join('');
  const last = PLACE.picks[PLACE.picks.length-1];
  $('#tab-place').innerHTML = `<p>야간 C·D 시설 <b>${PLACE.bad_total.toLocaleString()}곳</b> 중, AED를 한 대씩 어디에 두면 4분 안에 드는 시설이 가장 많이 늘어나는지 계산했습니다(반경 ${PLACE.radius_m}m). 상위 ${PLACE.picks.length}대로 <b>${last.cum.toLocaleString()}곳</b>이 4분 안에 들어옵니다.</p><table><tr><th>#</th><th>설치 위치</th><th class="num">이득</th><th class="num">누적</th></tr>${top}</table>`;
  document.querySelectorAll('#tab-place tr[data-lat]').forEach(tr => tr.onclick = () => map.setView([+tr.dataset.lat, +tr.dataset.lon], 17));
}
function aboutTab(){
  $('#tab-about').innerHTML = `<p><b>E-Grade(응급대응 등급)</b>는 체육시설에서 사람이 쓰러졌을 때 <b>제세동까지 걸리는 시간</b>으로 매깁니다.</p>
  <p>제세동 시간 = 인지·119신고 ${P.t_recog}초 + AED 왕복(거리×${P.detour}÷${P.walk_mps}m/s) + 패드 부착 ${P.t_apply}초. 4분(240초) 안이면 B 이상입니다.</p>
  <p>AED는 <b>요일·시각별 사용 가능 시간</b>을 반영합니다. 잠긴 건물 안 AED는 그 시각에 없는 것으로 봅니다.</p>
  <p>119 도착은 가장 가까운 119안전센터까지의 거리로 추정한 참고값입니다(심정지 골든타임 4분 안 구급대 도착 비율은 전국 1.7% — 권혜지·신영전 2025).</p>
  <p class="note">데이터: 국민체육진흥공단 전국체육시설 안전점검 정보·공공체육시설 상세·결함사진 학습데이터, 국립중앙의료원 AED, 소방청 119안전센터 좌표, 국토교통부 버스정류장, 행정안전부 체육시설업 인허가. 빌드 ${SUMMARY.built}</p>`;
}

async function init(){
  SUMMARY = await (await fetch('data/summary.json')).json();
  P = SUMMARY.log.params; SCHED = await (await fetch('data/schedules.json')).json();
  try { PLACE = await (await fetch('data/placement.json')).json(); } catch(e){}
  const sidos = Object.keys(SUMMARY.sido).sort((a,b)=>SUMMARY.sido[b].n-SUMMARY.sido[a].n);
  $('#sido').innerHTML += sidos.map(s => `<option>${s}</option>`).join('');
  let PARTS = null; try { const r = await fetch('data/parts.json'); if (r.ok) PARTS = await r.json(); } catch(e){}
  const aedFiles = PARTS ? PARTS.aed : ['aed.json'], facFiles = PARTS ? PARTS.fac : sidos.map(s => `facilities_${s}.json`);
  const [aedParts, CENTERS] = await Promise.all([Promise.all(aedFiles.map(f => fetch('data/' + f).then(r => r.json()))), fetch('data/centers.json').then(r => r.json())]);
  const AED = aedParts.flat(); window.AED = AED;
  const parts = await Promise.all(facFiles.map(f => fetch('data/' + f).then(r => r.json())));
  FAC = parts.flatMap(p => p.rows.map(r => { const f = {}; p.cols.forEach((c, i) => f[c] = r[i]);
    f.aed = (f.a || []).map(([d, k]) => [d, AED[k][4], AED[k][2], AED[k][3], k]);
    f.ctr = f.ctr == null ? null : CENTERS[f.ctr]; f.addr = f.addr || ''; return f; }));
  FAC.forEach((f, i) => { const m = L.circleMarker([f.lat, f.lon], {renderer, radius:4, weight:1}); m.on('click', () => showCard(i)); markers.push(m); });
  $('#dataNote').textContent = `체육시설 ${FAC.length.toLocaleString()}곳 · AED ${SUMMARY.log.aed.toLocaleString()}대 · 119안전센터 ${SUMMARY.log.centers.toLocaleString()}곳 결합 (빌드 ${SUMMARY.built})`;
  if (SUMMARY.log.mock) document.body.insertAdjacentHTML('afterbegin','<div style="background:#111;color:#ffd24d;padding:6px 16px;font-size:13px">개발용 가상 데이터로 그린 화면입니다 — 실데이터 결합 전</div>');
  $('#dataNote').insertAdjacentHTML('beforeend', `<br>낮(수 14시)엔 4분 안인데 밤(수 21시)엔 벗어나는 시설 <b>${SUMMARY.night_drop.toLocaleString()}곳</b> — AED가 잠긴 건물 안에 있기 때문입니다.`);
  rankTab(); placeTab(); aboutTab(); recolor();
}

$('#hour').oninput = e => { $('#hourLabel').textContent = String(e.target.value).padStart(2,'0') + ':00'; recolor(); };
$('#dow').onchange = recolor; $('#sido').onchange = () => { recolor(); const s = $('#sido').value; if (s){ const pts = FAC.filter(f => f.sido === s).map(f => [f.lat, f.lon]); if (pts.length) map.fitBounds(pts); } };
$('#q').oninput = () => recolor();
$('#nowBtn').onclick = () => { const d = new Date(); $('#dow').value = (d.getDay()+6)%7; $('#hour').value = d.getHours(); $('#hourLabel').textContent = String(d.getHours()).padStart(2,'0')+':00'; recolor(); };
document.querySelectorAll('#chips button').forEach(b => b.onclick = () => { filt = b.dataset.f; document.querySelectorAll('#chips button').forEach(x => x.classList.toggle('on', x === b)); recolor(); });
document.querySelectorAll('.tabs nav button').forEach(b => b.onclick = () => activate(b.dataset.t));
init();
