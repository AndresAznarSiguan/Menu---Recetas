"use strict";

/* ================= tiny IndexedDB layer ================= */
const DB_NAME = "menurecetas-db";
const DB_VER = 1;
let _db = null;

function openDB(){
  return new Promise((res, rej)=>{
    const r = indexedDB.open(DB_NAME, DB_VER);
    r.onupgradeneeded = e=>{
      const db = e.target.result;
      if(!db.objectStoreNames.contains("recipes")) db.createObjectStore("recipes",{keyPath:"id"});
      if(!db.objectStoreNames.contains("menu")) db.createObjectStore("menu",{keyPath:"id"});
    };
    r.onsuccess = ()=>{ _db = r.result; res(_db); };
    r.onerror = ()=> rej(r.error);
  });
}
function tx(store, mode){ return _db.transaction(store, mode).objectStore(store); }
function getAll(store){
  return new Promise((res,rej)=>{ const rq = tx(store,"readonly").getAll(); rq.onsuccess=()=>res(rq.result||[]); rq.onerror=()=>rej(rq.error); });
}
function getOne(store,id){
  return new Promise((res,rej)=>{ const rq = tx(store,"readonly").get(id); rq.onsuccess=()=>res(rq.result||null); rq.onerror=()=>rej(rq.error); });
}
function put(store,obj){
  return new Promise((res,rej)=>{ const rq = tx(store,"readwrite").put(obj); rq.onsuccess=()=>res(obj); rq.onerror=()=>rej(rq.error); });
}
function del(store,id){
  return new Promise((res,rej)=>{ const rq = tx(store,"readwrite").delete(id); rq.onsuccess=()=>res(); rq.onerror=()=>rej(rq.error); });
}
function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,8); }

/* ================= state ================= */
let recipes = [];
let menu = [];   // {id, date:"YYYY-MM-DD", recipeId}
let term = "";
let filterValue = "";

const CATEGORIES = ["Desayuno","Comida","Cena","Postre","Aperitivo","Ensalada","Sopa","Salsa","Otra"];
const $ = id => document.getElementById(id);
const listHost = $("listHost");

async function loadAll(){
  recipes = await getAll("recipes");
  menu = await getAll("menu");
  recipes.sort((a,b)=> (a.title||"").localeCompare(b.title||"", "es"));
  updateUsage();
  populateFilter();
}

function recipeById(id){ return recipes.find(r=>r.id===id) || null; }
function menuForDate(dateIso){ return menu.filter(m=>m.date===dateIso); }
function escapeHtml(s){ return (s==null?"":String(s)).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function initials(name){ return (name||"·").trim().slice(0,1).toUpperCase(); }

function fmtBytes(b){
  if(b<1024) return b+" B";
  if(b<1024*1024) return (b/1024).toFixed(0)+" KB";
  if(b<1024*1024*1024) return (b/1024/1024).toFixed(1)+" MB";
  return (b/1024/1024/1024).toFixed(2)+" GB";
}
function updateUsage(){
  try{
    const bytes = new Blob([JSON.stringify({recipes, menu})]).size;
    const imgs = recipes.filter(r=>r.photo).length;
    const el = document.getElementById("usage");
    if(el) el.textContent = `Espacio usado: ${fmtBytes(bytes)} · ${imgs} ${imgs===1?"imagen":"imágenes"} · ${recipes.length} recetas · ${menu.length} entradas de menú`;
  }catch(e){}
}

function populateFilter(){
  const sel = $("filter"); if(!sel) return;
  const opts = Array.from(new Set(recipes.map(r=>r.category).filter(Boolean))).sort((x,y)=>x.localeCompare(y,"es"));
  if(filterValue && !opts.includes(filterValue)) filterValue = "";
  sel.innerHTML = `<option value="">Todas las categorías</option>` +
    opts.map(o=>`<option value="${escapeHtml(o)}"${o===filterValue?" selected":""}>${escapeHtml(o)}</option>`).join("");
}
function refreshDatalist(){
  const cats = Array.from(new Set([...CATEGORIES, ...recipes.map(r=>r.category).filter(Boolean)])).sort((x,y)=>x.localeCompare(y,"es"));
  $("catNames").innerHTML = cats.map(c=>`<option value="${escapeHtml(c)}">`).join("");
}

/* ================= recipe list rendering ================= */
function emptyState(){
  return `<div class="empty"><b>Aún no hay recetas</b>Usa "Añadir receta" arriba: escribe el título y pulsa Crear receta.</div>`;
}
function renderList(){
  const t = term.trim().toLowerCase();
  let items = recipes;
  if(filterValue) items = items.filter(r=> (r.category||"") === filterValue);
  if(t) items = items.filter(r=> (r.title||"").toLowerCase().includes(t) || (r.category||"").toLowerCase().includes(t));
  $("count").textContent = items.length + (items.length===1?" receta":" recetas");
  if(!items.length){ listHost.innerHTML = emptyState(); return; }
  const rows = items.map(r=>{
    const thumb = r.photo ? `<img class="thumb" src="${r.photo}" alt="">` : `<div class="thumb">${initials(r.title)}</div>`;
    const nIng = (r.ingredients||[]).length;
    const sub = [r.servings?`${r.servings} raciones`:"", r.time||"", nIng?`${nIng} ingredientes`:""].filter(Boolean).join(" · ");
    return `<div class="row" data-id="${r.id}">
      ${thumb}
      <div class="meta"><div class="name">${escapeHtml(r.title)}</div><div class="sub">${escapeHtml(sub)}</div></div>
      ${r.category?`<span class="badge">${escapeHtml(r.category)}</span>`:""}
    </div>`;
  }).join("");
  listHost.innerHTML = `<div class="list">${rows}</div>`;
}

/* ================= quick add ================= */
let pendingPhoto = "";
function clearPendingPhoto(){ pendingPhoto=""; if($("qPhoto")) $("qPhoto").value=""; if($("qPhotoPrev")) $("qPhotoPrev").innerHTML=""; }
function fileToResizedDataUrl(file){
  return new Promise((res,rej)=>{
    const reader=new FileReader();
    reader.onload=()=>{ const img=new Image(); img.onload=()=>{ const max=1200; let wd=img.width, ht=img.height; if(wd>max||ht>max){ const s=Math.min(max/wd,max/ht); wd=Math.round(wd*s); ht=Math.round(ht*s);} const c=document.createElement("canvas"); c.width=wd; c.height=ht; c.getContext("2d").drawImage(img,0,0,wd,ht); res(c.toDataURL("image/jpeg",0.82)); }; img.onerror=rej; img.src=reader.result; };
    reader.onerror=rej; reader.readAsDataURL(file);
  });
}

async function quickAdd(){
  const title = $("qTitulo").value.trim();
  if(!title){ $("qTitulo").focus(); return; }
  const dupes = recipes.filter(x => (x.title||"").trim().toLowerCase() === title.toLowerCase());
  if(dupes.length){
    const ok = confirm(`Ya existe una receta titulada «${title}». ¿Crear otra de todas formas?`);
    if(!ok){ $("qTitulo").focus(); $("qTitulo").select(); return; }
  }
  const r = {
    id: uid(), title,
    category: $("qCat").value.trim()||"",
    servings: $("qRaciones").value.trim()||"",
    time: $("qTiempo").value.trim()||"",
    ingredients: [], steps: "", notes: "",
    photo: pendingPhoto||""
  };
  await put("recipes", r);
  if(pendingPhoto) uploadPhoto(r.id, pendingPhoto);
  await loadAll(); refreshDatalist();
  $("qTitulo").value=""; $("qCat").value=""; $("qRaciones").value=""; $("qTiempo").value=""; clearPendingPhoto();
  renderList(); schedulePush();
  editRecipe(r);
}

/* ================= detail panel ================= */
const panel = $("panel"), scrim = $("scrim");
function openPanel(){ panel.classList.add("show"); scrim.classList.add("show"); panel.setAttribute("aria-hidden","false"); }
function closePanel(){ panel.classList.remove("show"); scrim.classList.remove("show"); panel.setAttribute("aria-hidden","true"); }

function ingredientsView(r){
  const ings = r.ingredients||[];
  if(!ings.length) return `<p class="hint">Sin ingredientes todavía.</p>`;
  return `<div class="ingtable">${ings.map(i=>`<div class="ingview"><span>${escapeHtml(i.name||"")}</span><span class="iq">${escapeHtml([i.qty,i.unit].filter(Boolean).join(" "))}</span></div>`).join("")}</div>`;
}
function stepsView(r){
  const steps = (r.steps||"").split("\n").map(s=>s.trim()).filter(Boolean);
  if(!steps.length) return `<p class="hint">Sin pasos de elaboración todavía.</p>`;
  return `<ol class="steps">${steps.map(s=>`<li>${escapeHtml(s)}</li>`).join("")}</ol>`;
}
function menuEntriesForRecipe(id){
  return menu.filter(m=>m.recipeId===id).slice().sort((a,b)=> a.date<b.date?-1:1);
}
function fmtDateLong(iso){
  const d = parseISODate(iso);
  return d.toLocaleDateString("es-ES", {weekday:"long", day:"numeric", month:"long", year:"numeric"});
}

function showRecipe(id){
  const r = recipeById(id); if(!r) return;
  $("panelKind").textContent = "Receta";
  const uses = menuEntriesForRecipe(id);
  const usesHtml = uses.length
    ? `<div class="links">${uses.map(m=>`<button class="clink" data-godate="${m.date}">${escapeHtml(fmtDateLong(m.date))}</button>`).join("")}</div>`
    : `<p class="hint">Todavía no está en ningún día del menú.</p>`;
  $("panelBody").innerHTML = `
    ${r.photo?`<img class="photo" src="${r.photo}" alt="">`:""}
    <h2>${escapeHtml(r.title)}</h2>
    <dl class="dl">
      ${r.category?`<dt>Categoría</dt><dd>${escapeHtml(r.category)}</dd>`:""}
      ${r.servings?`<dt>Raciones</dt><dd>${escapeHtml(r.servings)}</dd>`:""}
      ${r.time?`<dt>Tiempo</dt><dd>${escapeHtml(r.time)}</dd>`:""}
    </dl>
    ${r.notes?`<p>${escapeHtml(r.notes)}</p>`:""}
    <div class="actions">
      <label class="ghost filebtn">${r.photo?"Cambiar foto":"Añadir foto"}<input type="file" accept="image/*" id="photoRecipe"></label>
      ${r.photo?`<button class="ghost" id="rmPhotoRecipe">Quitar foto</button>`:""}
      <button class="ghost" id="editR">Editar</button>
      <button class="danger" id="delR">Eliminar</button>
    </div>
    <div class="section-title">Ingredientes</div>
    ${ingredientsView(r)}
    <div class="section-title">Elaboración</div>
    ${stepsView(r)}
    <div class="section-title">En el menú</div>
    ${usesHtml}
  `;
  $("photoRecipe").onchange = e=> handlePhoto(e, id, ()=>showRecipe(id));
  if(r.photo){ $("rmPhotoRecipe").onclick = async ()=>{ await removePhoto(id); showRecipe(id); }; }
  $("editR").onclick = ()=> editRecipe(r);
  $("delR").onclick = async ()=>{
    if(!confirm("¿Eliminar esta receta? También se quitará de todos los días del menú donde esté.")) return;
    if(r.photoPath) removePhotoFile(r.photoPath);
    const linked = menu.filter(m=>m.recipeId===id);
    for(const m of linked) await del("menu", m.id);
    await del("recipes", id); await loadAll(); refreshDatalist(); renderList(); closePanel(); schedulePush();
  };
  $("panelBody").querySelectorAll("[data-godate]").forEach(b=> b.onclick = ()=>{ closePanel(); goToDay(b.dataset.godate); });
  openPanel();
}

/* ---------- edit form ---------- */
function ingredientRow(ing, idx){
  ing = ing || {name:"",qty:"",unit:""};
  return `<div class="ingrow" data-idx="${idx}">
    <input type="text" class="ingName" placeholder="Ingrediente" value="${escapeHtml(ing.name||"")}">
    <input type="text" class="ingQty" placeholder="Cant." value="${escapeHtml(ing.qty||"")}">
    <input type="text" class="ingUnit" list="unitNames" placeholder="Unidad" value="${escapeHtml(ing.unit||"")}">
    <button type="button" class="ingx" title="Quitar" data-rmrow="${idx}">✕</button>
  </div>`;
}
function wireIngredientRows(){
  $("addIngRow").onclick = ()=>{
    const host = $("ingRows");
    const idx = host.children.length;
    host.insertAdjacentHTML("beforeend", ingredientRow(null, idx));
  };
  $("ingRows").addEventListener("click", e=>{
    const b = e.target.closest("[data-rmrow]"); if(!b) return;
    b.closest(".ingrow").remove();
  });
}
function collectIngredients(){
  const rows = Array.from($("ingRows").querySelectorAll(".ingrow"));
  return rows.map(row=>({
    name: row.querySelector(".ingName").value.trim(),
    qty: row.querySelector(".ingQty").value.trim(),
    unit: row.querySelector(".ingUnit").value.trim()
  })).filter(i=> i.name || i.qty || i.unit);
}

function editRecipe(r){
  const ings = (r.ingredients&&r.ingredients.length) ? r.ingredients : [{name:"",qty:"",unit:""}];
  $("panelKind").textContent = "Editar receta";
  $("panelBody").innerHTML = `
    <h2>Editar receta</h2>
    <div class="editgrid">
      <div class="field wide"><label>Título</label><input type="text" id="eTitle" value="${escapeHtml(r.title)}"></div>
      <div class="field"><label>Categoría</label><input type="text" id="eCat" list="catNames" value="${escapeHtml(r.category||"")}"></div>
      <div class="field"><label>Raciones</label><input type="text" id="eServ" value="${escapeHtml(r.servings||"")}"></div>
      <div class="field"><label>Tiempo</label><input type="text" id="eTime" value="${escapeHtml(r.time||"")}"></div>
    </div>
    <div class="section-title">Ingredientes</div>
    <div id="ingRows">${ings.map((i,idx)=>ingredientRow(i,idx)).join("")}</div>
    <div class="pillrow"><button class="ghost" type="button" id="addIngRow">+ Ingrediente</button></div>
    <div class="section-title">Elaboración</div>
    <div class="field wide"><label>Un paso por línea</label><textarea id="eSteps" style="min-height:140px">${escapeHtml(r.steps||"")}</textarea></div>
    <div class="section-title">Notas</div>
    <div class="field wide"><textarea id="eNotes">${escapeHtml(r.notes||"")}</textarea></div>
    <div class="actions"><button class="btn" id="saveR">Guardar</button><button class="ghost" id="cancelR">Cancelar</button></div>
  `;
  wireIngredientRows();
  $("saveR").onclick = async ()=>{
    r.title = $("eTitle").value.trim()||r.title;
    r.category = $("eCat").value.trim();
    r.servings = $("eServ").value.trim();
    r.time = $("eTime").value.trim();
    r.ingredients = collectIngredients();
    r.steps = $("eSteps").value;
    r.notes = $("eNotes").value.trim();
    await put("recipes", r); await loadAll(); refreshDatalist(); renderList(); showRecipe(r.id); schedulePush();
  };
  $("cancelR").onclick = ()=>{ recipeById(r.id) && recipeById(r.id).title ? showRecipe(r.id) : closePanel(); };
  openPanel();
}

/* ---------- photos ---------- */
function handlePhoto(e, id, after){
  const file = e.target.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = ()=>{
    const img = new Image();
    img.onload = async ()=>{
      const max = 1200;
      let {width:wd, height:ht} = img;
      if(wd>max || ht>max){ const s = Math.min(max/wd, max/ht); wd=Math.round(wd*s); ht=Math.round(ht*s); }
      const c = document.createElement("canvas"); c.width=wd; c.height=ht;
      c.getContext("2d").drawImage(img,0,0,wd,ht);
      const data = c.toDataURL("image/jpeg", 0.82);
      const rec = await getOne("recipes", id); rec.photo = data; await put("recipes", rec);
      await loadAll(); renderList(); after();
      uploadPhoto(id, data);
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}
async function removePhoto(id){
  const rec = await getOne("recipes", id); if(!rec) return;
  if(rec.photoPath) removePhotoFile(rec.photoPath);
  rec.photo = ""; rec.photoPath = "";
  await put("recipes", rec);
  await loadAll(); renderList();
  schedulePush();
}

/* ================= export / import ================= */
function exportData(){
  const payload = { app:"menu-recetas", version:1, exported:new Date().toISOString(), recipes, menu };
  const blob = new Blob([JSON.stringify(payload)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const d = new Date().toISOString().slice(0,10);
  a.href=url; a.download=`menu-recetas-copia-${d}.json`; a.click();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
}
function importData(e){
  const file = e.target.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = async ()=>{
    try{
      const data = JSON.parse(reader.result);
      if(!data || !Array.isArray(data.recipes) || !Array.isArray(data.menu)) throw new Error("formato");
      if(!confirm("Restaurar esta copia añadirá/actualizará recetas y menú. ¿Continuar?")) return;
      for(const r of data.recipes) await put("recipes", r);
      for(const m of data.menu) await put("menu", m);
      await loadAll(); refreshDatalist(); renderList(); renderCalendar();
      alert("Copia restaurada.");
      schedulePush();
    }catch(err){ alert("No se pudo leer el archivo. Asegúrate de elegir una copia de Menú (.json)."); }
    e.target.value="";
  };
  reader.readAsText(file);
}

/* ================= tabs / list wiring ================= */
function setMainTabUI(){
  $("tabRecetas").classList.toggle("active", mainTab==="recetas");
  $("tabCalendario").classList.toggle("active", mainTab==="calendario");
  $("viewRecetas").style.display = mainTab==="recetas" ? "" : "none";
  $("viewCalendario").style.display = mainTab==="calendario" ? "" : "none";
  $("fabDrawer").style.display = (mainTab==="calendario" && calState.view!=="year") ? "" : "none";
  if(mainTab!=="calendario") closeDrawer();
}
let mainTab = "calendario";
$("tabRecetas").onclick = ()=>{ mainTab="recetas"; setMainTabUI(); };
$("tabCalendario").onclick = ()=>{ mainTab="calendario"; setMainTabUI(); renderCalendar(); };
$("filter").onchange = ()=>{ filterValue = $("filter").value; renderList(); };
$("search").oninput = e=>{ term=e.target.value; renderList(); };
$("qAdd").onclick = quickAdd;
$("qPhoto").onchange = async (e)=>{
  const f = e.target.files[0]; if(!f) return;
  try{
    pendingPhoto = await fileToResizedDataUrl(f);
    $("qPhotoPrev").innerHTML = `<img src="${pendingPhoto}" style="width:34px;height:34px;border-radius:6px;object-fit:cover;vertical-align:middle"> <a href="#" id="qPhotoClear" style="font-size:12px;color:var(--ink-soft)">quitar</a>`;
    $("qPhotoClear").onclick = (ev)=>{ ev.preventDefault(); clearPendingPhoto(); };
  }catch(err){ clearPendingPhoto(); }
};
["qTitulo","qCat","qRaciones","qTiempo"].forEach(idv=> $(idv).addEventListener("keydown", e=>{ if(e.key==="Enter") quickAdd(); }));
$("btnExport").onclick = exportData;
$("fileImport").onchange = importData;
$("panelClose").onclick = closePanel;
scrim.onclick = closePanel;
document.addEventListener("keydown", e=>{ if(e.key==="Escape"){ closePanel(); closeDrawer(); } });

listHost.addEventListener("click", e=>{
  const row = e.target.closest(".row"); if(!row) return;
  showRecipe(row.dataset.id);
});

/* ================= date helpers ================= */
const MONTH_NAMES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
const WEEKDAY_LETTERS = ["L","M","X","J","V","S","D"];
function pad2(n){ return String(n).padStart(2,"0"); }
function isoDate(y,m,d){ return `${y}-${pad2(m+1)}-${pad2(d)}`; }
function parseISODate(s){ const [y,m,d]=s.split("-").map(Number); return new Date(y,m-1,d); }
function todayISO(){ const d=new Date(); return isoDate(d.getFullYear(), d.getMonth(), d.getDate()); }
function addDays(date,n){ const d=new Date(date); d.setDate(d.getDate()+n); return d; }
function startOfWeekMonday(date){ const d=new Date(date); const day=(d.getDay()+6)%7; d.setDate(d.getDate()-day); d.setHours(0,0,0,0); return d; }
function daysInMonth(y,m){ return new Date(y,m+1,0).getDate(); }

/* ================= calendar state ================= */
const TODAY = todayISO();
let calState = { view:"week", year:new Date().getFullYear(), month:new Date().getMonth(), weekStart:startOfWeekMonday(new Date()), day:null };

function renderCrumbs(){
  const c = [];
  c.push({label:String(calState.year), fn:()=>showYear(calState.year)});
  if(calState.view==="month" || calState.view==="week" || calState.view==="day"){
    const mIdx = calState.view==="month" ? calState.month : (calState.weekStart? calState.weekStart.getMonth() : parseISODate(calState.day).getMonth());
    c.push({label:MONTH_NAMES[mIdx], fn:()=>showMonth(calState.year, mIdx)});
  }
  if(calState.view==="week" || (calState.view==="day" && calState.day)){
    let ws = calState.weekStart;
    if(!ws && calState.day) ws = startOfWeekMonday(parseISODate(calState.day));
    if(ws){
      const we = addDays(ws,6);
      c.push({label:`Semana del ${ws.getDate()} al ${we.getDate()}`, fn:()=>showWeek(ws)});
    }
  }
  if(calState.view==="day"){
    c.push({label: fmtDateLong(calState.day), fn:null});
  }
  const html = c.map((seg,i)=>{
    const isLast = i===c.length-1;
    const el = seg.fn && !isLast ? `<button data-i="${i}">${escapeHtml(seg.label)}</button>` : `<span class="cur">${escapeHtml(seg.label)}</span>`;
    return el;
  }).join(`<span class="sep">/</span>`);
  $("crumbs").innerHTML = html;
  $("crumbs").querySelectorAll("button[data-i]").forEach(b=>{
    b.onclick = ()=> c[Number(b.dataset.i)].fn();
  });
}

function showYear(year){ calState = {view:"year", year, month:calState.month, weekStart:null, day:null}; renderCalendar(); }
function showMonth(year, month){ calState = {view:"month", year, month, weekStart:null, day:null}; renderCalendar(); }
function showWeek(weekStartDate){ calState = {view:"week", year:weekStartDate.getFullYear(), month:weekStartDate.getMonth(), weekStart:weekStartDate, day:null}; renderCalendar(); }
function showDay(dateIso){ calState = {view:"day", year:parseISODate(dateIso).getFullYear(), month:parseISODate(dateIso).getMonth(), weekStart:calState.weekStart, day:dateIso}; renderCalendar(); }
function goToDay(dateIso){ mainTab="calendario"; setMainTabUI(); showDay(dateIso); }

function renderCalendar(){
  renderCrumbs();
  $("fabDrawer").style.display = (mainTab==="calendario" && calState.view!=="year") ? "" : "none";
  if(calState.view==="year") renderYearView();
  else if(calState.view==="month") renderMonthView();
  else if(calState.view==="week") renderWeekView();
  else renderDayView();
}

/* ---------- year view ---------- */
function renderYearView(){
  const y = calState.year;
  let minis = "";
  for(let m=0;m<12;m++){
    let days = "";
    const first = new Date(y,m,1);
    const startOffset = (first.getDay()+6)%7; // Monday=0
    const total = daysInMonth(y,m);
    const prevTotal = daysInMonth(y, m===0?11:m-1);
    let cells = [];
    for(let i=0;i<startOffset;i++){ cells.push({d:prevTotal-startOffset+1+i, outside:true}); }
    for(let d=1;d<=total;d++){ cells.push({d, outside:false, iso:isoDate(y,m,d)}); }
    let nextDay = 1;
    while(cells.length % 7 !== 0){ cells.push({d:nextDay, outside:true}); nextDay++; }
    days = cells.map(c=>{
      if(c.outside) return `<div class="mini-day outside">${c.d}</div>`;
      const has = menuForDate(c.iso).length>0;
      const isToday = c.iso===TODAY;
      return `<div class="mini-day${has?" has-entries":""}${isToday?" today":""}" data-jump="${c.iso}">${c.d}</div>`;
    }).join("");
    minis += `<div class="mini-month">
      <button class="mini-head" data-month="${m}">${MONTH_NAMES[m]}</button>
      <div class="mini-wd">${WEEKDAY_LETTERS.map(l=>`<span>${l}</span>`).join("")}</div>
      <div class="mini-days">${days}</div>
    </div>`;
  }
  $("calHost").innerHTML = `
    <div class="calnav">
      <button class="navbtn" id="yPrev">‹</button>
      <h2>Año ${y}</h2>
      <button class="navbtn" id="yNext">›</button>
    </div>
    <div class="year-grid">${minis}</div>
  `;
  $("yPrev").onclick = ()=> showYear(y-1);
  $("yNext").onclick = ()=> showYear(y+1);
  $("calHost").querySelectorAll(".mini-head").forEach(b=> b.onclick = ()=> showMonth(y, Number(b.dataset.month)));
  $("calHost").querySelectorAll(".mini-day[data-jump]").forEach(el=> el.onclick = ()=> showDay(el.dataset.jump));
}

/* ---------- month view ---------- */
function renderMonthView(){
  const y = calState.year, m = calState.month;
  const first = new Date(y,m,1);
  const startOffset = (first.getDay()+6)%7;
  const total = daysInMonth(y,m);
  const prevTotal = daysInMonth(y, m===0?11:m-1);
  let cells = [];
  for(let i=0;i<startOffset;i++){ const d=prevTotal-startOffset+1+i; cells.push({d, outside:true}); }
  for(let d=1;d<=total;d++){ cells.push({d, outside:false, iso:isoDate(y,m,d)}); }
  let nextDay = 1;
  while(cells.length % 7 !== 0){ cells.push({d:nextDay, outside:true}); nextDay++; }
  const rows = [];
  for(let i=0;i<cells.length;i+=7) rows.push(cells.slice(i,i+7));

  const head = `<div></div>` + WEEKDAY_LETTERS.map(l=>`<div class="wd-head">${l}</div>`).join("");
  const body = rows.map((row,ri)=>{
    const firstRealCell = row.find(c=>!c.outside) || row[0];
    let weekStartDate;
    if(row[0].outside){
      // compute based on the first day of row via offset math
      weekStartDate = addDays(new Date(y,m,1), ri*7 - startOffset);
    } else {
      weekStartDate = new Date(y,m,row[0].d);
    }
    const wLabel = `<button class="weeklab" data-weekstart="${isoDate(weekStartDate.getFullYear(),weekStartDate.getMonth(),weekStartDate.getDate())}">Sem</button>`;
    const dayCells = row.map(c=>{
      if(c.outside) return `<div class="daycell outside"><div class="daynum">${c.d}</div></div>`;
      const entries = menuForDate(c.iso);
      const isToday = c.iso===TODAY;
      const shown = entries.slice(0,3);
      const chips = shown.map(e=>{
        const r = recipeById(e.recipeId);
        return `<div class="chip"><span class="ct">${escapeHtml(r?r.title:"(receta borrada)")}</span><button class="cx" data-rment="${e.id}" title="Quitar">✕</button></div>`;
      }).join("");
      const more = entries.length>shown.length ? `<div class="chipmore">+${entries.length-shown.length} más</div>` : "";
      return `<div class="daycell${isToday?" today":""}${c.iso===armedDate?" armed":""}" data-drop-date="${c.iso}" data-goday="${c.iso}">
        <div class="daynum">${c.d}</div>
        <div class="chiplist">${chips}${more}</div>
      </div>`;
    }).join("");
    return wLabel + dayCells;
  }).join("");

  $("calHost").innerHTML = `
    <div class="calnav">
      <button class="navbtn" id="mPrev">‹</button>
      <h2>${MONTH_NAMES[m]} ${y}</h2>
      <button class="navbtn" id="mNext">›</button>
    </div>
    <div class="month-grid-wrap"><div class="month-grid">${head}${body}</div></div>
  `;
  $("mPrev").onclick = ()=>{ const nm = m===0?11:m-1; const ny = m===0?y-1:y; showMonth(ny,nm); };
  $("mNext").onclick = ()=>{ const nm = m===11?0:m+1; const ny = m===11?y+1:y; showMonth(ny,nm); };
  $("calHost").querySelectorAll(".weeklab").forEach(b=> b.onclick = ()=> showWeek(parseISODate(b.dataset.weekstart)));
  wireDayCells();
}

/* ---------- week view ---------- */
function renderWeekView(){
  const ws = calState.weekStart || startOfWeekMonday(new Date(calState.year, calState.month, 1));
  const we = addDays(ws,6);
  const days = [];
  for(let i=0;i<7;i++) days.push(addDays(ws,i));
  const cols = days.map(d=>{
    const iso = isoDate(d.getFullYear(), d.getMonth(), d.getDate());
    const entries = menuForDate(iso);
    const isToday = iso===TODAY;
    const chips = entries.map(e=>{
      const r = recipeById(e.recipeId);
      return `<div class="chip"><span class="ct">${escapeHtml(r?r.title:"(receta borrada)")}</span><button class="cx" data-rment="${e.id}" title="Quitar">✕</button></div>`;
    }).join("");
    return `<div class="week-day${isToday?" today":""}${iso===armedDate?" armed":""}" data-drop-date="${iso}" data-goday="${iso}">
      <div class="wname">${WEEKDAY_LETTERS[(d.getDay()+6)%7]}</div>
      <div class="wnum">${d.getDate()}</div>
      <div class="chiplist">${chips || '<p class="hint">Sin recetas</p>'}</div>
    </div>`;
  }).join("");

  $("calHost").innerHTML = `
    <div class="calnav">
      <button class="navbtn" id="wPrev">‹</button>
      <h2>Semana del ${ws.getDate()} ${MONTH_NAMES[ws.getMonth()]} al ${we.getDate()} ${MONTH_NAMES[we.getMonth()]}</h2>
      <button class="navbtn" id="wNext">›</button>
    </div>
    <div class="week-grid">${cols}</div>
  `;
  $("wPrev").onclick = ()=> showWeek(addDays(ws,-7));
  $("wNext").onclick = ()=> showWeek(addDays(ws,7));
  wireDayCells({selectDayInstead:true});
}

/* ---------- day view ---------- */
function renderDayView(){
  const iso = calState.day;
  const entries = menuForDate(iso);
  const d = parseISODate(iso);
  const rows = entries.length ? entries.map(e=>{
    const r = recipeById(e.recipeId);
    return `<div class="dayview-row">
      <div class="dname" data-openrecipe="${e.recipeId}">${escapeHtml(r?r.title:"(receta borrada)")}</div>
      <div class="dsub">${r&&r.category?escapeHtml(r.category):""}</div>
      <button class="x" data-rment="${e.id}" title="Quitar">✕</button>
    </div>`;
  }).join("") : `<div class="empty"><b>Nada planeado todavía</b>Toca "Añadir receta" y elige una de tu índice.</div>`;

  $("calHost").innerHTML = `
    <div class="calnav">
      <button class="navbtn" id="dPrev">‹</button>
      <h2>${escapeHtml(fmtDateLong(iso))}</h2>
      <button class="navbtn" id="dNext">›</button>
    </div>
    <div class="pillrow"><button class="btn" id="addToDay">+ Añadir receta</button></div>
    <div class="dropzone" data-drop-date="${iso}" id="dayDropzone">Suelta aquí una receta, o tócala en el índice</div>
    <div class="dayview-list">${rows}</div>
  `;
  $("dPrev").onclick = ()=> showDay(isoDate(addDays(d,-1).getFullYear(),addDays(d,-1).getMonth(),addDays(d,-1).getDate()));
  $("dNext").onclick = ()=> showDay(isoDate(addDays(d,1).getFullYear(),addDays(d,1).getMonth(),addDays(d,1).getDate()));
  $("addToDay").onclick = ()=> openDrawer();
  $("calHost").querySelectorAll("[data-openrecipe]").forEach(el=> el.onclick = ()=>{ mainTab="recetas"; setMainTabUI(); showRecipe(el.dataset.openrecipe); });
  $("calHost").querySelectorAll("[data-rment]").forEach(el=> el.onclick = async (ev)=>{ ev.stopPropagation(); await removeMenuEntry(el.dataset.rment); });
}

/* ---------- shared: wire day cells (month/week views) ---------- */
function wireDayCells(opts){
  opts = opts || {};
  $("calHost").querySelectorAll("[data-drop-date]").forEach(cell=>{
    cell.addEventListener("click", (e)=>{
      if(e.target.closest("[data-rment]")) return; // handled separately
      const date = cell.dataset.dropDate;
      if(armedRecipeId){ addMenuEntry(date, armedRecipeId); clearArmed(); return; }
      if(opts.selectDayInstead){ toggleArmedDate(date); return; }
      if(cell.dataset.goday) showDay(cell.dataset.goday);
    });
  });
  $("calHost").querySelectorAll("[data-rment]").forEach(el=> el.addEventListener("click", async (e)=>{
    e.stopPropagation(); await removeMenuEntry(el.dataset.rment);
  }));
}

/* ================= menu entries CRUD ================= */
async function addMenuEntry(dateIso, recipeId){
  if(!dateIso || !recipeId) return;
  const dup = menu.find(m=>m.date===dateIso && m.recipeId===recipeId);
  if(dup){ showToast("Ya estaba en ese día."); return; }
  const entry = { id: uid(), date: dateIso, recipeId };
  await put("menu", entry);
  await loadAll();
  renderCalendar();
  const r = recipeById(recipeId);
  showToast(`${r?r.title:"Receta"} añadida al ${fmtDateShort(dateIso)}.`);
  schedulePush();
}
async function removeMenuEntry(id){
  await del("menu", id);
  await loadAll();
  renderCalendar();
  schedulePush();
}
function fmtDateShort(iso){
  const d = parseISODate(iso);
  return d.toLocaleDateString("es-ES", {day:"numeric", month:"short"});
}

/* ================= toast ================= */
let toastTimer=null;
function showToast(msg){
  const t = $("toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(()=> t.classList.remove("show"), 1800);
}

/* ================= recipe drawer + drag/tap-to-place ================= */
let armedRecipeId = null;
let armedDate = null;
function renderDrawerList(){
  const t = ($("rdrawerSearch").value||"").trim().toLowerCase();
  let items = recipes;
  if(t) items = items.filter(r=> (r.title||"").toLowerCase().includes(t) || (r.category||"").toLowerCase().includes(t));
  const host = $("rnodes");
  if(!items.length){ host.innerHTML = `<p class="hint">No hay recetas que coincidan.</p>`; return; }
  host.innerHTML = items.map(r=>{
    const thumb = r.photo ? `<img class="rthumb" src="${r.photo}" alt="">` : `<div class="rthumb">${initials(r.title)}</div>`;
    return `<div class="rnode${armedRecipeId===r.id?" armed":""}" data-rnode="${r.id}">
      ${thumb}<span class="rname">${escapeHtml(r.title)}</span><span class="rcat">${escapeHtml(r.category||"")}</span>
    </div>`;
  }).join("");
  host.querySelectorAll(".rnode").forEach(el=> makeDraggable(el, el.dataset.rnode));
}
function openDrawer(){ $("rdrawer").classList.add("show"); $("rdrawer").setAttribute("aria-hidden","false"); renderDrawerList(); }
function closeDrawer(){ $("rdrawer").classList.remove("show"); $("rdrawer").setAttribute("aria-hidden","true"); }
$("fabDrawer").onclick = ()=> openDrawer();
$("rdrawerClose").onclick = ()=> closeDrawer();
$("rdrawerSearch").oninput = ()=> renderDrawerList();

function setArmed(recipeId){
  armedRecipeId = recipeId;
  armedDate = null;
  const r = recipeById(recipeId);
  $("armedText").textContent = `Colocando "${r?r.title:""}" — toca un día para añadirla.`;
  $("armedBar").classList.add("show");
  renderDrawerList();
  renderCalendar();
}
function toggleArmedDate(date){
  if(armedDate === date){ clearArmed(); return; }
  armedRecipeId = null;
  armedDate = date;
  $("armedText").textContent = `Añadiendo receta al ${fmtDateLong(date)} — toca una receta del índice.`;
  $("armedBar").classList.add("show");
  renderCalendar();
  openDrawer();
}
function clearArmed(){
  armedRecipeId = null;
  armedDate = null;
  $("armedBar").classList.remove("show");
  renderDrawerList();
  renderCalendar();
}
$("armedCancel").onclick = clearArmed;

let dropTargetHover = null;
function positionGhost(ghost,x,y){ ghost.style.left=(x+12)+"px"; ghost.style.top=(y+12)+"px"; }

function makeDraggable(nodeEl, recipeId){
  nodeEl.addEventListener("pointerdown", e=>{
    if(e.pointerType==="mouse" && e.button!==0) return;
    const startX=e.clientX, startY=e.clientY;
    let dragging=false, ghost=null;
    const THRESH=9;
    function move(ev){
      const dx=ev.clientX-startX, dy=ev.clientY-startY;
      if(!dragging){
        if(Math.hypot(dx,dy)<THRESH) return;
        dragging=true;
        ghost=document.createElement("div"); ghost.className="dragghost";
        ghost.textContent = (recipeById(recipeId)||{}).title || "Receta";
        document.body.appendChild(ghost);
      }
      if(ev.cancelable) ev.preventDefault();
      positionGhost(ghost, ev.clientX, ev.clientY);
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const cell = el && el.closest ? el.closest("[data-drop-date]") : null;
      if(dropTargetHover && dropTargetHover!==cell) dropTargetHover.classList.remove("dropover");
      if(cell) cell.classList.add("dropover");
      dropTargetHover = cell;
    }
    function up(ev){
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      if(dragging){
        if(ghost) ghost.remove();
        if(dropTargetHover){
          dropTargetHover.classList.remove("dropover");
          addMenuEntry(dropTargetHover.dataset.dropDate, recipeId);
        }
        dropTargetHover = null;
      } else if(armedDate){
        addMenuEntry(armedDate, recipeId);
        clearArmed();
      } else if(armedRecipeId === recipeId){
        clearArmed();
      } else {
        setArmed(recipeId);
      }
    }
    document.addEventListener("pointermove", move, {passive:false});
    document.addEventListener("pointerup", up, {once:true});
  });
}

/* click on the dropzone in day view arms/places directly too (covered by wireDayCells for month/week; day view dropzone handled below) */
document.addEventListener("click", e=>{
  const dz = e.target.closest("#dayDropzone");
  if(dz && armedRecipeId){ addMenuEntry(dz.dataset.dropDate, armedRecipeId); clearArmed(); }
});

/* ================= sync (Supabase) ================= */
const SB_CFG_KEY = "menurecetas-sb-config";
const SB_SEEDED_KEY = "menurecetas-sb-seeded";
let sb = null, sbSession = null, pushTimer = null, rtChannel = null, sbLastEmail = "";

function loadSbConfig(){ try{ return JSON.parse(localStorage.getItem(SB_CFG_KEY)||"null"); }catch(e){ return null; } }
function saveSbConfig(cfg){ try{ localStorage.setItem(SB_CFG_KEY, JSON.stringify(cfg)); }catch(e){} }
function clearSbConfig(){ try{ localStorage.removeItem(SB_CFG_KEY); localStorage.removeItem(SB_SEEDED_KEY); }catch(e){} }

async function ensureClient(){
  if(sb) return sb;
  const cfg = loadSbConfig();
  if(!cfg || !cfg.url || !cfg.key) return null;
  const mod = await import("https://esm.sh/@supabase/supabase-js@2");
  sb = mod.createClient(cfg.url, cfg.key);
  return sb;
}

function setSyncBadge(){ const b=$("btnSync"); if(b) b.textContent = sbSession ? "Sincronizado" : "Sincronizar"; }

const syncScrim = $("syncScrim");
function openSync(){ syncScrim.classList.add("show"); renderSyncUI(); }
function closeSync(){ syncScrim.classList.remove("show"); }

function renderSyncUI(msg, cls){
  const cfg = loadSbConfig();
  const m = $("syncModal");
  if(!cfg){
    m.innerHTML = `
      <h2>Sincronización</h2>
      <p class="sub">Conecta tu proyecto de Supabase para mantener el móvil y el PC al día. Pega los dos datos que copiaste.</p>
      <div class="field"><label>Project URL</label><input type="text" id="sbUrl" placeholder="https://....supabase.co" autocomplete="off"></div>
      <div class="field"><label>Publishable key</label><input type="text" id="sbKey" placeholder="sb_publishable_..." autocomplete="off"></div>
      <div class="actions"><button class="btn" id="sbConnect">Conectar</button><button class="ghost" id="sbClose">Cerrar</button></div>
      <div class="msg ${cls||''}" id="sbMsg">${msg?escapeHtml(msg):""}</div>`;
    $("sbConnect").onclick = async ()=>{
      let url = $("sbUrl").value.trim();
      if(url && !/^https?:\/\//i.test(url)) url = "https://" + url;
      try{ url = new URL(url).origin; }catch(e){}
      const key = $("sbKey").value.trim();
      if(!url||!key){ renderSyncUI("Pega los dos datos.","err"); return; }
      saveSbConfig({url,key}); sb=null;
      try{ await ensureClient(); renderSyncUI(); }
      catch(e){ clearSbConfig(); renderSyncUI("No se pudo conectar. Revisa la URL, la clave y tu conexión.","err"); }
    };
    $("sbClose").onclick = closeSync;
    return;
  }
  if(!sbSession){
    m.innerHTML = `
      <h2>Entrar</h2>
      <p class="sub">Identifícate con el correo y la contraseña que creaste en Supabase.</p>
      <div class="field"><label>Correo</label><input type="email" id="sbEmail" autocomplete="username" value="${escapeHtml(sbLastEmail)}"></div>
      <div class="field"><label>Contraseña</label><input type="password" id="sbPass" autocomplete="current-password"></div>
      <div class="actions"><button class="btn" id="sbLogin">Entrar</button><button class="ghost" id="sbClose">Cerrar</button></div>
      <div class="actions" style="margin-top:2px"><button class="ghost" id="sbForget" style="font-size:12px">Cambiar de proyecto</button></div>
      <div class="msg ${cls||''}" id="sbMsg">${msg?escapeHtml(msg):""}</div>`;
    $("sbLogin").onclick = doLogin;
    $("sbClose").onclick = closeSync;
    $("sbForget").onclick = ()=>{ clearSbConfig(); sb=null; renderSyncUI(); };
    return;
  }
  m.innerHTML = `
    <h2>Sincronización activa</h2>
    <p class="sub"><span class="syncdot on"></span>Conectado como ${escapeHtml(sbSession.user.email||"")}</p>
    <p class="sub">Tus recetas y tu menú se sincronizan automáticamente. Las fotos, de momento, se quedan en cada dispositivo.</p>
    <div class="actions">
      <button class="btn" id="sbSyncNow">Sincronizar ahora</button>
      <button class="ghost" id="sbLogout">Cerrar sesión</button>
      <button class="ghost" id="sbClose">Cerrar</button>
    </div>
    <div class="msg ${cls||'ok'}" id="sbMsg">${msg?escapeHtml(msg):""}</div>`;
  $("sbSyncNow").onclick = async ()=>{ renderSyncUI("Sincronizando…"); await pullRemote(); await pushRemote(); await syncPhotos(); renderSyncUI("Hecho.","ok"); };
  $("sbLogout").onclick = doLogout;
  $("sbClose").onclick = closeSync;
}

async function doLogin(){
  const email = $("sbEmail")?$("sbEmail").value.trim():"";
  const pass = $("sbPass")?$("sbPass").value:"";
  sbLastEmail = email;
  if(!email || !pass){ renderSyncUI("Pon tu correo y tu contraseña.","err"); return; }
  renderSyncUI("Entrando…");
  try{
    const c = await ensureClient();
    if(!c){ renderSyncUI("Falta configurar el proyecto.","err"); return; }
    const { data, error } = await c.auth.signInWithPassword({ email, password: pass });
    if(error){ renderSyncUI("No se pudo entrar: "+error.message,"err"); return; }
    sbSession = data.session; setSyncBadge();
    await afterLogin();
    renderSyncUI("Conectado. Ya estás sincronizando.","ok");
  }catch(e){ renderSyncUI("Error de conexión. ¿Tienes internet?","err"); }
}

async function doLogout(){
  try{ const c = await ensureClient(); if(c) await c.auth.signOut(); }catch(e){}
  if(rtChannel && sb){ try{ sb.removeChannel(rtChannel); }catch(e){} rtChannel=null; }
  sbSession = null; setSyncBadge(); renderSyncUI();
}

async function afterLogin(){
  const remote = await fetchRemote();
  const seeded = localStorage.getItem(SB_SEEDED_KEY) === "1";
  const localEmpty = (recipes.length===0 && menu.length===0);
  const remoteEmpty = !remote || ((remote.recipes||[]).length===0 && (remote.menu||[]).length===0);
  if(!seeded){
    if(remoteEmpty && !localEmpty){ await pushRemote(); }
    else if(!remoteEmpty){ await unionMerge(remote); await pushRemote(); }
    try{ localStorage.setItem(SB_SEEDED_KEY,"1"); }catch(e){}
  } else if(remote){
    await mirror(remote);
  }
  await syncPhotos();
  subscribeRealtime();
}

async function fetchRemote(){
  try{
    const c = await ensureClient(); if(!c || !sbSession) return null;
    const { data, error } = await c.from("menu_recetas_data").select("data").eq("user_id", sbSession.user.id).maybeSingle();
    if(error || !data) return null;
    return data.data || null;
  }catch(e){ return null; }
}
function stripPhoto(r){ const o = Object.assign({}, r); delete o.photo; return o; }

async function pushRemote(){
  try{
    const c = await ensureClient(); if(!c || !sbSession) return;
    const payload = { recipes: recipes.map(stripPhoto), menu };
    await c.from("menu_recetas_data").upsert({ user_id: sbSession.user.id, data: payload, updated_at: new Date().toISOString() });
  }catch(e){}
}
async function pullRemote(){ const r = await fetchRemote(); if(r) await mirror(r); await syncPhotos(); }

async function unionMerge(remote){
  const rL = new Map(recipes.map(r=>[r.id,r]));
  for(const rr of (remote.recipes||[])){ const loc=rL.get(rr.id); await put("recipes", Object.assign({}, rr, {photo: keepPhoto(loc, rr)})); }
  const seen = new Set();
  for(const me of (remote.menu||[])){ seen.add(me.id); await put("menu", me); }
  await loadAll();
  refreshDatalist(); renderList(); renderCalendar();
}
function keepPhoto(loc, rem){ return (loc && loc.photoPath===rem.photoPath) ? (loc.photo||"") : ""; }
async function mirror(remote){
  const rR = remote.recipes||[], rM = remote.menu||[];
  // Safety: an empty cloud must never wipe a device that has data. Push local up instead.
  if(rR.length===0 && rM.length===0 && (recipes.length>0 || menu.length>0)){
    await pushRemote();
    return;
  }
  const rRids = new Set(rR.map(r=>r.id)), rMids = new Set(rM.map(m=>m.id));
  const rL = new Map(recipes.map(r=>[r.id,r]));
  for(const rr of rR){ const loc=rL.get(rr.id); await put("recipes", Object.assign({}, rr, {photo: keepPhoto(loc, rr)})); }
  for(const rm of rM){ await put("menu", rm); }
  for(const r of recipes){ if(!rRids.has(r.id)) await del("recipes", r.id); }
  for(const m of menu){ if(!rMids.has(m.id)) await del("menu", m.id); }
  await loadAll();
  refreshDatalist(); renderList(); renderCalendar();
}

/* ---------- photo storage (Supabase) ---------- */
let photoBusy = false;
function b64ToBlob(dataUrl){
  const parts = dataUrl.split(","); const head = parts[0]||""; const body = parts[1]||"";
  const mime = (head.match(/:(.*?);/)||[])[1] || "image/jpeg";
  const bin = atob(body); const len = bin.length; const arr = new Uint8Array(len);
  for(let i=0;i<len;i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
function blobToDataUrl(blob){ return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(blob); }); }
async function uploadPhoto(id, dataUrl){
  try{
    const c = await ensureClient(); if(!c || !sbSession) return;
    const rec = await getOne("recipes", id); if(!rec) return;
    const oldPath = rec.photoPath || "";
    const path = sbSession.user.id + "/recipes/" + id + "-" + Date.now() + ".jpg";
    const { error } = await c.storage.from("recipe-photos").upload(path, b64ToBlob(dataUrl), { upsert:true, contentType:"image/jpeg" });
    if(error) return;
    rec.photoPath = path; await put("recipes", rec);
    if(oldPath && oldPath!==path){ try{ await c.storage.from("recipe-photos").remove([oldPath]); }catch(e){} }
    await loadAll(); schedulePush();
  }catch(e){}
}
async function downloadPhoto(id, path){
  try{
    const c = await ensureClient(); if(!c || !sbSession) return;
    const { data, error } = await c.storage.from("recipe-photos").download(path);
    if(error || !data) return;
    const dataUrl = await blobToDataUrl(data);
    const rec = await getOne("recipes", id); if(!rec) return;
    rec.photo = dataUrl; await put("recipes", rec);
  }catch(e){}
}
async function removePhotoFile(path){
  try{ const c = await ensureClient(); if(c && sbSession && path) await c.storage.from("recipe-photos").remove([path]); }catch(e){}
}
async function syncPhotos(){
  if(photoBusy || !sbSession) return;
  photoBusy = true;
  try{
    const R = recipes.slice();
    for(const r of R){ if(r.photo && !r.photoPath) await uploadPhoto(r.id, r.photo); }
    const R2 = recipes.slice();
    for(const r of R2){ if(r.photoPath && !r.photo) await downloadPhoto(r.id, r.photoPath); }
    await loadAll(); renderList();
  }catch(e){}
  finally{ photoBusy = false; }
}

function subscribeRealtime(){
  try{
    if(!sb || !sbSession) return;
    if(rtChannel){ try{ sb.removeChannel(rtChannel); }catch(e){} rtChannel=null; }
    rtChannel = sb.channel("menu-recetas-rt")
      .on("postgres_changes", { event:"*", schema:"public", table:"menu_recetas_data", filter:"user_id=eq."+sbSession.user.id },
        async (payload)=>{ const d = payload && payload.new && payload.new.data; if(d){ await mirror(d); await syncPhotos(); } })
      .subscribe();
  }catch(e){}
}

function schedulePush(){
  if(!sbSession) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(()=>{ pushRemote(); }, 700);
}

/* ---------- storage info modal ---------- */
async function openStorageInfo(){
  const m = $("infoModal");
  const dataBytes = new Blob([JSON.stringify({recipes:recipes.map(stripPhoto), menu})]).size;
  const totalBytes = new Blob([JSON.stringify({recipes, menu})]).size;
  const photoBytes = Math.max(0, totalBytes - dataBytes);
  const nPhotos = recipes.filter(r=>r.photo).length;
  const nCloudPhotos = recipes.filter(r=>r.photoPath).length;
  let quotaLine = "";
  try{
    if(navigator.storage && navigator.storage.estimate){
      const est = await navigator.storage.estimate();
      if(est && est.quota){ quotaLine = `Espacio del navegador: ${fmtBytes(est.usage||0)} usados de ~${fmtBytes(est.quota)} disponibles.`; }
    }
  }catch(e){}
  let persisted = false;
  try{ if(navigator.storage && navigator.storage.persisted) persisted = await navigator.storage.persisted(); }catch(e){}
  const cloud = sbSession
    ? `Conectado como ${escapeHtml(sbSession.user.email||"")}. Las fotos (${nCloudPhotos}) se guardan en el cajón <code>recipe-photos</code> de tu proyecto Supabase. En el panel de Supabase, entra en <b>Storage → recipe-photos</b>.`
    : "Sin sincronización activa: tus datos están solo en este dispositivo.";
  m.innerHTML = `
    <h2>Almacenamiento</h2>
    <p class="sub">Dónde vive cada cosa y cuánto ocupa.</p>
    <div class="info-block">
      <div class="info-h">En este dispositivo</div>
      <p>Todo se guarda en el almacén interno de este navegador (una base de datos llamada <code>menurecetas-db</code>). No es una carpeta que puedas abrir a mano: por seguridad, el navegador la mantiene oculta y la gestiona él.</p>
      <ul>
        <li>${recipes.length} recetas · ${menu.length} entradas de menú · ${nPhotos} fotos</li>
        <li>Datos: ${fmtBytes(dataBytes)} · Fotos: ${fmtBytes(photoBytes)}</li>
        ${quotaLine?`<li>${quotaLine}</li>`:""}
        <li>Protección contra borrado automático: ${persisted?"activada ✓":"no concedida"}</li>
      </ul>
    </div>
    <div class="info-block">
      <div class="info-h">En la nube</div>
      <p>${cloud}</p>
    </div>
    <div class="info-block">
      <div class="info-h">Tu copia portable</div>
      <p>El botón "Copia de seguridad" descarga un archivo con todo, en la carpeta que tú elijas. Esa sí es una carpeta tuya y abierta, y es tu red de seguridad.</p>
    </div>
    <div class="actions"><button class="ghost" id="infoClose">Cerrar</button></div>`;
  $("infoClose").onclick = ()=> $("infoScrim").classList.remove("show");
  $("infoScrim").classList.add("show");
}
$("infoScrim").addEventListener("click", e=>{ if(e.target===$("infoScrim")) $("infoScrim").classList.remove("show"); });
$("usage").onclick = openStorageInfo;

$("btnSync").onclick = openSync;
syncScrim.addEventListener("click", e=>{ if(e.target===syncScrim) closeSync(); });

/* ================= boot ================= */
(async function(){
  try{
    try{ if("serviceWorker" in navigator){ navigator.serviceWorker.register("sw.js").catch(()=>{}); } }catch(e){}
    try{ if(navigator.storage && navigator.storage.persist){ await navigator.storage.persist(); } }catch(e){}
    await openDB(); await loadAll(); refreshDatalist(); setMainTabUI(); populateFilter(); renderList(); renderCalendar();
    // restore sync session if previously logged in
    try{
      if(loadSbConfig()){
        const c = await ensureClient();
        if(c){
          const { data } = await c.auth.getSession();
          if(data && data.session){ sbSession = data.session; setSyncBadge(); await afterLogin(); }
        }
      }
    }catch(e){}
  }catch(err){
    listHost.innerHTML = `<div class="empty"><b>No se pudo abrir el almacén</b>Prueba a abrir este archivo en Chrome o Firefox actualizados.</div>`;
    console.error(err);
  }
})();
