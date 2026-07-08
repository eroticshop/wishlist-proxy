// api/kurye/admin/index.js
// Kurye admin paneli — tek dosya HTML (vanilla JS, harici bağımlılık yok).
// Route: GET /api/kurye/admin  → bu sayfayı servis eder.
// Sayfa JS'i GET /api/kurye/admin/config ile yüklenir, POST ile kaydeder.
// NOT: aşağıdaki gömülü client JS bilinçli olarak backtick/template-literal KULLANMAZ
// (dış template literal ile çakışmasın diye). Dinamik HTML '+' ile kurulur.

const PAGE = `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Kurye Yönetimi — Eroticshop</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Poppins:wght@500;600;700&display=swap" rel="stylesheet">
<style>
  :root{
    --purple:#663399; --pink:#c0427b; --hover:#a8366a;
    --bg:#f5f4f9; --card:#ffffff; --ink:#20242e; --muted:#6b7180;
    --line:#e6e5f0; --ok:#1c8b5a; --err:#c0392b; --warn:#b8860b;
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);
    font-family:'Inter',system-ui,-apple-system,sans-serif;font-size:14px;line-height:1.5}
  h1,h2,h3{font-family:'Poppins','Inter',sans-serif;margin:0}
  a{color:var(--purple)}
  .wrap{max-width:920px;margin:0 auto;padding:0 16px 120px}
  header{background:linear-gradient(100deg,var(--purple),var(--pink));color:#fff;
    padding:18px 16px;position:sticky;top:0;z-index:20;box-shadow:0 2px 10px rgba(102,51,153,.18)}
  header .inner{max-width:920px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;gap:12px}
  header h1{font-size:18px;font-weight:600;letter-spacing:.2px}
  header .sub{opacity:.85;font-size:12px;font-weight:400}
  .btn{font-family:'Inter';font-size:14px;font-weight:500;border:0;border-radius:8px;
    padding:9px 16px;cursor:pointer;transition:background .15s,opacity .15s}
  .btn-primary{background:var(--pink);color:#fff}
  .btn-primary:hover{background:var(--hover)}
  .btn-ghost{background:rgba(255,255,255,.15);color:#fff}
  .btn-ghost:hover{background:rgba(255,255,255,.28)}
  .btn-sm{padding:5px 10px;font-size:12px;border-radius:6px}
  .btn-line{background:transparent;border:1px solid var(--line);color:var(--ink)}
  .btn-line:hover{border-color:var(--purple);color:var(--purple)}
  .btn-danger{background:transparent;border:1px solid #ecc; color:var(--err)}
  .btn-danger:hover{background:#fdecea}
  .card{background:var(--card);border:1px solid var(--line);border-radius:12px;
    padding:18px;margin:16px 0;box-shadow:0 1px 3px rgba(30,36,50,.04)}
  .card h2{font-size:15px;font-weight:600;color:var(--purple);margin-bottom:4px}
  .card .desc{color:var(--muted);font-size:12px;margin-bottom:14px}
  label.fld{display:block;margin:0 0 10px}
  label.fld > span{display:block;font-size:12px;color:var(--muted);margin-bottom:4px}
  input[type=text],input[type=number],input[type=password]{
    width:100%;font-family:'Inter';font-size:14px;padding:9px 11px;
    border:1px solid var(--line);border-radius:8px;background:#fff;color:var(--ink)}
  input:focus{outline:2px solid var(--purple);outline-offset:1px;border-color:var(--purple)}
  .grid{display:grid;gap:12px}
  .grid-2{grid-template-columns:1fr 1fr}
  .grid-3{grid-template-columns:1fr 1fr 1fr}
  .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  table.mini{width:100%;border-collapse:collapse}
  table.mini th{font-size:11px;color:var(--muted);text-align:left;font-weight:500;padding:4px 6px}
  table.mini td{padding:4px 6px}
  .hint{font-size:11px;color:var(--muted);margin-top:4px}
  /* kapsam ağacı */
  .cov-search{margin-bottom:10px}
  .ilce{border:1px solid var(--line);border-radius:8px;margin-bottom:8px;overflow:hidden}
  .ilce-head{display:flex;align-items:center;gap:10px;padding:10px 12px;cursor:pointer;background:#faf9fd}
  .ilce-head:hover{background:#f3f0fa}
  .ilce-head .name{font-weight:500;flex:1}
  .ilce-head .count{font-size:11px;color:var(--muted)}
  .ilce-head .chev{transition:transform .15s;color:var(--muted)}
  .ilce.open .chev{transform:rotate(90deg)}
  .mahalleler{display:none;padding:8px 12px;max-height:280px;overflow:auto;border-top:1px solid var(--line)}
  .ilce.open .mahalleler{display:block}
  .mah{display:flex;align-items:center;gap:8px;padding:3px 0}
  .mah label{font-size:13px;cursor:pointer}
  input[type=checkbox]{accent-color:var(--purple);width:16px;height:16px;cursor:pointer}
  /* toast */
  #toast{position:fixed;left:50%;transform:translateX(-50%);bottom:90px;z-index:50;
    padding:12px 18px;border-radius:10px;color:#fff;font-weight:500;box-shadow:0 6px 20px rgba(0,0,0,.2);
    opacity:0;pointer-events:none;transition:opacity .2s,transform .2s;max-width:90vw}
  #toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
  #toast.ok{background:var(--ok)} #toast.err{background:var(--err)} #toast.info{background:var(--purple)}
  /* sticky kaydet */
  .savebar{position:fixed;left:0;right:0;bottom:0;background:#fff;border-top:1px solid var(--line);
    padding:12px 16px;z-index:30;box-shadow:0 -2px 12px rgba(30,36,50,.06)}
  .savebar .inner{max-width:920px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;gap:12px}
  .savebar .status{font-size:12px;color:var(--muted)}
  /* login */
  .login-wrap{max-width:380px;margin:12vh auto;padding:0 16px}
  .login-card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:28px}
  .login-card h2{font-size:18px;color:var(--purple);margin-bottom:6px}
  .login-card p{color:var(--muted);font-size:13px;margin:0 0 18px}
  .repeat-row{display:grid;grid-template-columns:1fr 1fr 1fr 1fr auto auto;gap:8px;align-items:center;margin-bottom:8px}
  .repeat-row.self{grid-template-columns:1.4fr 1fr 1fr .8fr .8fr auto auto}
  @media(max-width:640px){
    .grid-2,.grid-3{grid-template-columns:1fr}
    .repeat-row,.repeat-row.self{grid-template-columns:1fr 1fr;}
  }
  @media(prefers-reduced-motion:reduce){*{transition:none!important}}
</style>
</head>
<body>
<div id="root"></div>
<div id="toast"></div>
<script>
"use strict";
var API_BASE = "/api/kurye/admin";
var STATE = { config:null, tree:null, selected:null };

function el(id){ return document.getElementById(id); }
function toast(msg, type){
  var t = el("toast"); t.textContent = msg; t.className = "show " + (type||"info");
  setTimeout(function(){ t.className = ""; }, 3200);
}
function esc(s){ return String(s==null?"":s).replace(/[&<>"]/g,function(c){
  return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]; }); }

/* ---- API yardımcı ---- */
function api(path, method, body){
  var opts = { method:method||"GET", headers:{}, credentials:"same-origin" };
  if(body!==undefined){ opts.headers["Content-Type"]="application/json"; opts.body=JSON.stringify(body); }
  return fetch(API_BASE+path, opts).then(function(r){
    return r.json().then(function(j){ return { status:r.status, body:j }; })
      .catch(function(){ return { status:r.status, body:null }; });
  });
}

/* ---- Başlangıç ---- */
function init(){
  api("/config","GET").then(function(res){
    if(res.status===200 && res.body && res.body.ok){
      STATE.config = res.body.config; STATE.tree = res.body.tree;
      renderPanel();
    } else {
      renderLogin();
    }
  }).catch(function(){ renderLogin(); });
}

/* ---- Login ---- */
function renderLogin(){
  el("root").innerHTML =
    '<div class="login-wrap"><div class="login-card">'+
    '<h2>Kurye Yönetimi</h2>'+
    '<p>Devam etmek için parolanı gir.</p>'+
    '<label class="fld"><span>Parola</span>'+
    '<input type="password" id="pw" autocomplete="current-password"></label>'+
    '<button class="btn btn-primary" id="loginBtn" style="width:100%">Giriş yap</button>'+
    '</div></div>';
  el("pw").addEventListener("keydown", function(e){ if(e.key==="Enter") doLogin(); });
  el("loginBtn").addEventListener("click", doLogin);
  el("pw").focus();
}
function doLogin(){
  var pw = el("pw").value;
  if(!pw){ toast("Parola boş olamaz","err"); return; }
  el("loginBtn").disabled = true;
  api("/login","POST",{ password:pw }).then(function(res){
    el("loginBtn").disabled = false;
    if(res.status===200){ init(); }
    else if(res.status===401){ toast("Parola hatalı","err"); }
    else { toast("Sunucu hatası ("+res.status+")","err"); }
  }).catch(function(){ el("loginBtn").disabled=false; toast("Bağlantı hatası","err"); });
}

/* ---- Panel iskeleti ---- */
function renderPanel(){
  var c = STATE.config;
  STATE.selected = new Set((c.coverage && c.coverage.mahalle_ids ? c.coverage.mahalle_ids : []).map(String));
  el("root").innerHTML =
    '<header><div class="inner">'+
      '<div><h1>Kurye Yönetimi</h1><div class="sub">Bursa · adrese dayalı ücret</div></div>'+
      '<button class="btn btn-ghost btn-sm" id="logoutBtn">Çıkış</button>'+
    '</div></header>'+
    '<div class="wrap">'+
      '<div class="card" id="c-tarife"></div>'+
      '<div class="card" id="c-weight"></div>'+
      '<div class="card" id="c-cov"></div>'+
      '<div class="card" id="c-self"></div>'+
      '<div class="card" id="c-over"></div>'+
    '</div>'+
    '<div class="savebar"><div class="inner">'+
      '<span class="status" id="saveStatus">Değişiklikleri kaydetmeyi unutma.</span>'+
      '<button class="btn btn-primary" id="saveBtn">Kaydet</button>'+
    '</div></div>';
  el("logoutBtn").addEventListener("click", function(){
    document.cookie = "kurye_admin=; Max-Age=0; path=/api/kurye/admin";
    renderLogin();
  });
  el("saveBtn").addEventListener("click", save);
  renderTarife(); renderWeight(); renderCoverage(); renderSelf(); renderOverride();
}

/* ---- Tarife ---- */
function renderTarife(){
  var t = STATE.config.courier_tariff || {};
  var store = t.store || {};
  var html =
    '<h2>Tarife</h2><div class="desc">Mesafeye göre km başı ücret. Son bandın üst sınırını boş bırak = sınırsız.</div>'+
    '<div class="grid grid-3">'+
      fld("Taban ücret (TL)","t-base","number",t.base)+
      fld("Minimum ücret (TL)","t-min","number",t.min)+
      fld("Yol katsayısı","t-road","number",t.road_factor)+
    '</div>'+
    '<div class="grid grid-2">'+
      fld("Mağaza enlem (lat)","t-lat","number",store.lat)+
      fld("Mağaza boylam (lon)","t-lon","number",store.lon)+
    '</div>'+
    '<div style="margin-top:8px"><span class="hint">Bantlar (0\\u2019dan başlar, her bant bir öncekinin bittiği yerden devam eder)</span>'+
    '<table class="mini" style="margin-top:6px"><thead><tr>'+
      '<th>Bitiş km</th><th>Km başı (TL)</th><th></th></tr></thead>'+
    '<tbody id="bandBody"></tbody></table>'+
    '<button class="btn btn-line btn-sm" id="addBand" style="margin-top:8px">+ Bant ekle</button></div>';
  el("c-tarife").innerHTML = html;
  var bands = t.bands || [];
  bands.forEach(function(b){ addBandRow(b.to, b.rate); });
  el("addBand").addEventListener("click", function(){ addBandRow("", ""); });
}
function addBandRow(to, rate){
  var tr = document.createElement("tr");
  tr.className = "band-row";
  var toStr = (to==null?"":String(to));
  tr.innerHTML =
    '<td><input type="number" class="band-to" placeholder="\\u221E sınırsız" value="'+esc(toStr)+'"></td>'+
    '<td><input type="number" class="band-rate" value="'+esc(rate==null?"":rate)+'"></td>'+
    '<td><button class="btn btn-danger btn-sm bandDel">Sil</button></td>';
  tr.querySelector(".bandDel").addEventListener("click", function(){ tr.remove(); });
  el("bandBody").appendChild(tr);
}
function collectTarife(){
  var rows = document.querySelectorAll("#bandBody .band-row");
  var bands = []; var prevFrom = 0;
  rows.forEach(function(r,i){
    var toRaw = r.querySelector(".band-to").value.trim();
    var rate = parseFloat(r.querySelector(".band-rate").value);
    var isLast = i === rows.length-1;
    var to = toRaw==="" ? (isLast?null:NaN) : parseFloat(toRaw);
    bands.push({ from:prevFrom, to:to, rate:rate });
    prevFrom = (to===null?prevFrom:to);
  });
  return {
    bands: bands,
    base: numOr(el("t-base").value,0),
    min: numOr(el("t-min").value,0),
    road_factor: numOr(el("t-road").value,1.3),
    store: { lat: parseFloat(el("t-lat").value), lon: parseFloat(el("t-lon").value) }
  };
}

/* ---- Ağırlık ---- */
function renderWeight(){
  var w = STATE.config.weight || { tiers:[] };
  var rows = "";
  (w.tiers||[]).forEach(function(tier,i){
    rows +=
      '<tr class="w-row" data-key="'+esc(tier.key)+'">'+
      '<td style="font-weight:500">'+esc(tier.key)+' kg</td>'+
      '<td><input type="number" class="w-add" value="'+esc(tier.add==null?0:tier.add)+'"></td></tr>';
  });
  el("c-weight").innerHTML =
    '<h2>Ağırlık ek ücreti</h2><div class="desc">Mesafe ücretinin üstüne eklenir (hem kurye hem kendi teslimat).</div>'+
    '<table class="mini"><thead><tr><th>Dilim</th><th>Ek ücret (TL)</th></tr></thead><tbody>'+rows+'</tbody></table>';
}
function collectWeight(){
  var tiers = [];
  document.querySelectorAll("#c-weight .w-row").forEach(function(r){
    tiers.push({ key:r.getAttribute("data-key"), add:numOr(r.querySelector(".w-add").value,0) });
  });
  return { model:"add", tiers:tiers };
}

/* ---- Kapsam ağacı ---- */
function renderCoverage(){
  var tree = STATE.tree; var dists = (tree && tree.districts) || [];
  var head =
    '<h2>Hizmet kapsamı</h2><div class="desc">Hızlı kurye verdiğin ilçe/mahalleleri işaretle. İşaretsiz bölge = standart kargo.</div>'+
    '<input type="text" class="cov-search" id="covSearch" placeholder="Mahalle ara...">'+
    '<div class="row" style="margin-bottom:10px">'+
      '<span class="hint" id="covCount"></span></div>'+
    '<div id="covTree"></div>';
  el("c-cov").innerHTML = head;
  var container = el("covTree");
  dists.forEach(function(d){
    var box = document.createElement("div");
    box.className = "ilce"; box.setAttribute("data-ilce", d.id);
    box.innerHTML =
      '<div class="ilce-head">'+
        '<input type="checkbox" class="ilce-chk">'+
        '<span class="name">'+esc(d.name)+'</span>'+
        '<span class="count"></span>'+
        '<span class="chev">\\u25B6</span>'+
      '</div><div class="mahalleler"></div>';
    container.appendChild(box);
    var head2 = box.querySelector(".ilce-head");
    var chk = box.querySelector(".ilce-chk");
    head2.addEventListener("click", function(e){
      if(e.target===chk) return;
      if(!box.classList.contains("rendered")) renderMahalleler(box, d);
      box.classList.toggle("open");
    });
    chk.addEventListener("click", function(e){ e.stopPropagation(); toggleIlce(box, d, chk.checked); });
    updateIlceState(box, d);
  });
  el("covSearch").addEventListener("input", function(){ filterCoverage(this.value.trim().toLowerCase()); });
  updateCovCount();
}
function renderMahalleler(box, d){
  var wrap = box.querySelector(".mahalleler");
  var frag = document.createDocumentFragment();
  d.neighborhoods.forEach(function(m){
    var id = String(m.id);
    var row = document.createElement("div");
    row.className = "mah"; row.setAttribute("data-name", m.name.toLowerCase()); row.setAttribute("data-id", id);
    var checked = STATE.selected.has(id) ? " checked" : "";
    row.innerHTML =
      '<input type="checkbox" class="mah-chk" id="m'+id+'"'+checked+'>'+
      '<label for="m'+id+'">'+esc(m.name)+'</label>';
    row.querySelector(".mah-chk").addEventListener("change", function(){
      if(this.checked) STATE.selected.add(id); else STATE.selected.delete(id);
      updateIlceState(box, d); updateCovCount();
    });
    frag.appendChild(row);
  });
  wrap.appendChild(frag);
  box.classList.add("rendered");
}
function toggleIlce(box, d, on){
  d.neighborhoods.forEach(function(m){
    var id = String(m.id);
    if(on) STATE.selected.add(id); else STATE.selected.delete(id);
  });
  if(box.classList.contains("rendered")){
    box.querySelectorAll(".mah-chk").forEach(function(cb){ cb.checked = on; });
  }
  updateIlceState(box, d); updateCovCount();
}
function updateIlceState(box, d){
  var total = d.neighborhoods.length, sel = 0;
  d.neighborhoods.forEach(function(m){ if(STATE.selected.has(String(m.id))) sel++; });
  var chk = box.querySelector(".ilce-chk");
  chk.checked = sel>0 && sel===total;
  chk.indeterminate = sel>0 && sel<total;
  box.querySelector(".count").textContent = sel+" / "+total;
}
function updateCovCount(){
  el("covCount").textContent = "Seçili mahalle: " + STATE.selected.size;
}
function filterCoverage(q){
  document.querySelectorAll("#covTree .ilce").forEach(function(box){
    var d = null; var did = box.getAttribute("data-ilce");
    STATE.tree.districts.forEach(function(x){ if(String(x.id)===did) d=x; });
    if(!q){ box.style.display=""; if(box.classList.contains("open")) showAllMah(box); return; }
    if(!box.classList.contains("rendered")) renderMahalleler(box, d);
    var any = false;
    box.querySelectorAll(".mah").forEach(function(row){
      var match = row.getAttribute("data-name").indexOf(q) !== -1;
      row.style.display = match ? "" : "none";
      if(match) any = true;
    });
    box.style.display = any ? "" : "none";
    if(any) box.classList.add("open");
  });
}
function showAllMah(box){ box.querySelectorAll(".mah").forEach(function(r){ r.style.display=""; }); }
function collectCoverage(){
  var mahalle_ids = Array.from(STATE.selected);
  var ilce_ids = [];
  STATE.tree.districts.forEach(function(d){
    var all = d.neighborhoods.length>0 && d.neighborhoods.every(function(m){ return STATE.selected.has(String(m.id)); });
    if(all) ilce_ids.push(String(d.id));
  });
  return { ilce_ids:ilce_ids, mahalle_ids:mahalle_ids };
}

/* ---- Self-delivery ---- */
function renderSelf(){
  el("c-self").innerHTML =
    '<h2>Kendi teslimat noktaları</h2>'+
    '<div class="desc">Metro/hub çevresi. Koordinatı Google Maps\\u2019te sağ tık ile alabilirsin. Yarıçap içi = sabit fiyat.</div>'+
    '<div class="repeat-row self" style="font-size:11px;color:var(--muted)">'+
      '<div>Etiket</div><div>Enlem</div><div>Boylam</div><div>Yarıçap km</div><div>Fiyat TL</div><div>Aktif</div><div></div></div>'+
    '<div id="selfBody"></div>'+
    '<button class="btn btn-line btn-sm" id="addSelf" style="margin-top:8px">+ Nokta ekle</button>';
  (STATE.config.self_points||[]).forEach(addSelfRow);
  el("addSelf").addEventListener("click", function(){ addSelfRow({ active:true }); });
}
function addSelfRow(p){
  p = p||{};
  var row = document.createElement("div");
  row.className = "repeat-row self self-row";
  row.innerHTML =
    '<input type="text" class="s-label" value="'+esc(p.label||"")+'" placeholder="Şehreküstü">'+
    '<input type="number" class="s-lat" value="'+esc(p.lat==null?"":p.lat)+'">'+
    '<input type="number" class="s-lon" value="'+esc(p.lon==null?"":p.lon)+'">'+
    '<input type="number" class="s-rad" value="'+esc(p.radius_km==null?"":p.radius_km)+'">'+
    '<input type="number" class="s-flat" value="'+esc(p.flat_price==null?"":p.flat_price)+'">'+
    '<input type="checkbox" class="s-active"'+(p.active===false?"":" checked")+'>'+
    '<button class="btn btn-danger btn-sm selfDel">Sil</button>';
  row.querySelector(".selfDel").addEventListener("click", function(){ row.remove(); });
  el("selfBody").appendChild(row);
}
function collectSelf(){
  var out = [];
  document.querySelectorAll("#selfBody .self-row").forEach(function(r){
    out.push({
      label: r.querySelector(".s-label").value.trim(),
      lat: parseFloat(r.querySelector(".s-lat").value),
      lon: parseFloat(r.querySelector(".s-lon").value),
      radius_km: numOr(r.querySelector(".s-rad").value,0),
      flat_price: numOr(r.querySelector(".s-flat").value,0),
      active: r.querySelector(".s-active").checked
    });
  });
  return out;
}

/* ---- Override ---- */
function renderOverride(){
  el("c-over").innerHTML =
    '<h2>Sabit fiyat (override)</h2>'+
    '<div class="desc">Belirli mahalle için mesafe fiyatını ez. Mahalle ID\\u2019sini kapsam ağacındaki mahalleden alırsın (ileri seviye).</div>'+
    '<div class="repeat-row" style="grid-template-columns:1fr 1fr auto;font-size:11px;color:var(--muted)">'+
      '<div>Mahalle ID</div><div>Fiyat TL</div><div></div></div>'+
    '<div id="overBody"></div>'+
    '<button class="btn btn-line btn-sm" id="addOver" style="margin-top:8px">+ Satır ekle</button>';
  var ov = STATE.config.overrides || {};
  Object.keys(ov).forEach(function(k){ addOverRow(k, ov[k]); });
  el("addOver").addEventListener("click", function(){ addOverRow("",""); });
}
function addOverRow(id, price){
  var row = document.createElement("div");
  row.className = "repeat-row over-row";
  row.style.gridTemplateColumns = "1fr 1fr auto";
  row.innerHTML =
    '<input type="text" class="o-id" value="'+esc(id)+'" placeholder="140338">'+
    '<input type="number" class="o-price" value="'+esc(price==null?"":price)+'">'+
    '<button class="btn btn-danger btn-sm overDel">Sil</button>';
  row.querySelector(".overDel").addEventListener("click", function(){ row.remove(); });
  el("overBody").appendChild(row);
}
function collectOverride(){
  var out = {};
  document.querySelectorAll("#overBody .over-row").forEach(function(r){
    var id = r.querySelector(".o-id").value.trim();
    var price = parseFloat(r.querySelector(".o-price").value);
    if(id && Number.isFinite(price)) out[id] = price;
  });
  return out;
}

/* ---- Kaydet ---- */
function assemble(){
  return {
    courier_tariff: collectTarife(),
    weight: collectWeight(),
    self_points: collectSelf(),
    coverage: collectCoverage(),
    overrides: collectOverride()
  };
}
function save(){
  var cfg = assemble();
  el("saveBtn").disabled = true;
  el("saveStatus").textContent = "Kaydediliyor...";
  api("/config","POST",{ config:cfg }).then(function(res){
    el("saveBtn").disabled = false;
    if(res.status===200 && res.body && res.body.ok){
      STATE.config = res.body.config;
      el("saveStatus").textContent = "Kaydedildi.";
      toast("Kaydedildi \\u2713","ok");
    } else if(res.status===422){
      el("saveStatus").textContent = "Doğrulama hatası.";
      toast("Geçersiz: "+((res.body&&res.body.detail)||"kontrol et"),"err");
    } else if(res.status===401){
      toast("Oturum doldu, tekrar giriş yap","err"); renderLogin();
    } else {
      el("saveStatus").textContent = "Hata.";
      toast("Kaydedilemedi ("+res.status+")","err");
    }
  }).catch(function(){ el("saveBtn").disabled=false; toast("Bağlantı hatası","err"); });
}

/* ---- yardımcılar ---- */
function numOr(v, d){ var n = parseFloat(v); return Number.isFinite(n)?n:d; }
function fld(label, id, type, val){
  return '<label class="fld"><span>'+esc(label)+'</span>'+
    '<input type="'+type+'" id="'+id+'" value="'+esc(val==null?"":val)+'"></label>';
}

init();
</script>
</body>
</html>`;

export default function handler(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  res.status(200).send(PAGE);
}
