/* ===========================================================================
   Mi Diario Parkinson — logica (sin librerias, 100% local).
   Datos solo en este dispositivo (localStorage). Todo en espanol.
   =========================================================================== */
'use strict';

const K_REG = 'dp_registros_v1';
const K_CFG = 'dp_config_v1';
const K_EJE = 'dp_ejercicio_v1';
const K_NOT = 'dp_notificados_v1';

const ICONOS = { medicamento:'💊', on:'🟢', off:'🟠', sintoma:'〰️', animo:'🌧️', sueno:'😴', ejercicio:'🤸', nota:'🗒️' };

/* Esquema por defecto = regimen actual documentado (editable por el usuario).
   NOTA clinica: Pramipexol (Biopsol) NO se precarga: figura suspendido (control de impulsos).
   Queda disponible en PRESET_MEDS para agregar si el neurologo lo reindica. */
const CFG_DEFAULT = {
  paciente: '',
  meds: [
    { nombre:'Levodopa/Benserazida (Prolopa)', dosis:'200/50 mg', horarios:['07:00','10:00','13:00','16:00','19:00'] },
    { nombre:'Rasagilina (Elbrus)',            dosis:'1 mg',       horarios:['08:00'] }
  ],
  vozLectura:true, textoGrande:false, altoContraste:false, recordatorios:true
};

/* Lista rapida de medicamentos de Parkinson (datalist en Ajustes). */
const PRESET_MEDS = [
  'Levodopa/Benserazida (Prolopa)', 'Levodopa/Carbidopa', 'Rasagilina (Elbrus)',
  'Pramipexol (Biopsol) — agonista: vigilar control de impulsos', 'Selegilina',
  'Entacapona', 'Amantadina', 'Rotigotina (parche)', 'Safinamida',
  'Escitalopram', 'Clonazepam', 'Zolpidem'
];

const RUTINA = [
  'Estiramiento de cuello y hombros', 'Caminar con pasos grandes',
  'Equilibrio: pararse en un pie', 'Respiracion profunda (pranayama)',
  'Ejercicio de voz: hablar fuerte'
];

let registros = cargar(K_REG, []);
let cfg = Object.assign({}, CFG_DEFAULT, cargar(K_CFG, {}));
let vistaActual = 'hoy';
let periodoRep = 7;
let notificados = new Set(cargar(K_NOT, []));
let promptInstalar = null;
let dosisPendiente = null;   // {nombre, dosis} para el boton de la tarjeta de toma
let ultimoBorrado = null;    // para "deshacer"

/* ---------- almacenamiento ---------- */
function cargar(clave, def){ try{ return JSON.parse(localStorage.getItem(clave)) ?? def; }catch(e){ return def; } }
function guardarSeguro(clave, valor){
  try{ localStorage.setItem(clave, JSON.stringify(valor)); return true; }
  catch(e){ aviso('No pude guardar en el teléfono. Descarga un respaldo en Ajustes.'); return false; }
}
function guardarReg(){ guardarSeguro(K_REG, registros); }
function guardarCfg(){ guardarSeguro(K_CFG, cfg); }

/* ---------- fechas ---------- */
const HORA=3600000, DIA=86400000;
function p2(n){ return String(n).padStart(2,'0'); }
function fmtHora(ts){ const d=new Date(ts); return p2(d.getHours())+':'+p2(d.getMinutes()); }
function fmtFecha(ts){ return new Date(ts).toLocaleDateString('es-CL',{weekday:'short',day:'numeric',month:'short'}); }
function esHoy(ts){ return new Date(ts).toDateString()===new Date().toDateString(); }
function claveDia(ts){ return new Date(ts).toDateString(); }
function horarioADate(hhmm, base){ const [h,m]=hhmm.split(':').map(Number); const d=base?new Date(base):new Date(); d.setHours(h,m,0,0); return d; }
function inicioPeriodo(){ const d=new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()-(periodoRep-1)); return d.getTime(); }

/* ---------- voz (lectura) ---------- */
function hablar(txt){
  if(!cfg.vozLectura || !('speechSynthesis' in window)) return;
  try{
    speechSynthesis.cancel();
    const u=new SpeechSynthesisUtterance(txt); u.lang='es-CL'; u.rate=0.95;
    const v=speechSynthesis.getVoices().find(x=>x.lang && x.lang.startsWith('es')); if(v) u.voice=v;
    speechSynthesis.speak(u);
  }catch(e){}
}

/* ---------- registrar / borrar / deshacer ---------- */
function nuevoId(){ try{ return crypto.randomUUID(); }catch(e){ return Date.now()+'-'+Math.random().toString(36).slice(2); } }
function registrar(tipo, detalle, ico){
  registros.push({ id:nuevoId(), ts:Date.now(), tipo, detalle, ico:ico||ICONOS[tipo]||'🗒️' });
  guardarReg(); flash('✓ '+detalle); hablar('Anotado: '+detalle); render();
}
function registrarToma(){
  const n = dosisPendiente ? dosisPendiente.nombre : 'medicamento';
  const ds = dosisPendiente && dosisPendiente.dosis ? ' '+dosisPendiente.dosis : '';
  registrar('medicamento', 'Tomé '+n+ds, '💊');
}
function borrar(id){
  const idx = registros.findIndex(r=>r.id===id);
  if(idx<0) return;
  ultimoBorrado = { item:registros[idx], idx };
  registros.splice(idx,1); guardarReg(); render();
  avisoDeshacer('Registro borrado.');
}
function deshacerBorrado(){
  if(!ultimoBorrado) return;
  registros.splice(Math.min(ultimoBorrado.idx, registros.length), 0, ultimoBorrado.item);
  ultimoBorrado=null; guardarReg(); render();
  aviso('Registro restaurado.','exito');
}
function flash(msg){
  const el=document.getElementById('micLabel'); if(!el) return;
  el.textContent=msg; el.style.color='var(--accent)';
  setTimeout(()=>{ el.textContent=MIC_HINT; el.style.color=''; }, 2600);
}

/* ===========================================================================
   VISTA HOY
   =========================================================================== */
function renderDosis(){
  const cont=document.getElementById('cardDosis');
  const lista=(cfg.meds||[]).flatMap(m=>(m.horarios||[]).map(h=>({ h, nombre:m.nombre, dosis:m.dosis||'' })));
  if(lista.length===0){ cont.classList.add('oculto'); return; }
  cont.classList.remove('oculto');

  const ahora=new Date();
  const conFecha=lista.map(o=>({...o, d:horarioADate(o.h, ahora)})).sort((a,b)=>a.d-b.d);
  const tomados=horariosTomadosHoy(conFecha);

  let atrasada=null, prox=null;
  conFecha.forEach(o=>{
    const key=o.nombre+'|'+o.h;
    if(o.d<=ahora){ if(!tomados.has(key) && (ahora-o.d)<=3*HORA && !atrasada) atrasada=o; }
    else if(!prox){ prox=o; }
  });
  if(!prox){ const m=conFecha[0]; prox={...m, d:horarioADate(m.h, new Date(Date.now()+DIA))}; }

  const obj = atrasada || prox;
  dosisPendiente = { nombre:obj.nombre, dosis:obj.dosis };

  if(atrasada){
    cont.classList.add('atrasada');
    cont.innerHTML=`<h3>⚠ Toma pendiente</h3>
      <div class="dosis"><div class="reloj">${atrasada.h}</div>
      <div class="det">${esc(atrasada.nombre)}${atrasada.dosis?(' · '+esc(atrasada.dosis)):''} — toca cuando la tomes</div>
      <button class="btn-grande" onclick="registrarToma()">💊 Registrar toma</button></div>`;
  }else{
    cont.classList.remove('atrasada');
    const falta=prox.d-ahora, hh=Math.floor(falta/HORA), mm=Math.floor((falta%HORA)/60000);
    cont.innerHTML=`<h3>Próxima toma</h3>
      <div class="dosis"><div class="reloj">${prox.h}</div>
      <div class="det">${esc(prox.nombre)}${prox.dosis?(' · '+esc(prox.dosis)):''} — en ${hh>0?hh+'h ':''}${mm}min</div>
      <button class="btn-grande sec" onclick="registrarToma()">💊 Ya la tomé</button></div>`;
  }
}
/* Asocia cada toma de hoy al horario teorico mas cercano (<=3h). Devuelve Set de "nombre|hh:mm". */
function horariosTomadosHoy(conFecha){
  const tomas=registros.filter(r=>r.tipo==='medicamento'&&esHoy(r.ts)).map(r=>r.ts);
  const set=new Set();
  tomas.forEach(t=>{
    let best=null, bd=Infinity;
    conFecha.forEach(o=>{ const diff=Math.abs(t-o.d.getTime()); if(diff<bd){ bd=diff; best=o; } });
    if(best && bd<=3*HORA) set.add(best.nombre+'|'+best.h);
  });
  return set;
}

function renderFranja(){
  const cont=document.getElementById('franjaDia');
  const inicio=new Date(); inicio.setHours(6,0,0,0);
  const ini=inicio.getTime(), fin=ini+18*HORA, total=fin-ini;
  const clamp=t=>Math.max(ini, Math.min(fin,t));
  const evs=registros.filter(r=>esHoy(r.ts)&&(r.tipo==='on'||r.tipo==='off')).sort((a,b)=>a.ts-b.ts);
  if(evs.length===0){ cont.innerHTML='<span class="nd" style="width:100%"></span>'; return; }
  let html='';
  const seg=(a,b,cls)=>{ const w=(clamp(b)-clamp(a))/total*100; if(w>0.1) html+=`<span class="${cls}" style="width:${w.toFixed(2)}%"></span>`; };
  seg(ini, evs[0].ts, 'nd');               // antes del primer evento = sin dato
  let estado=evs[0].tipo, cursor=evs[0].ts;
  for(let i=1;i<evs.length;i++){ seg(cursor, evs[i].ts, estado); cursor=evs[i].ts; estado=evs[i].tipo; }
  seg(cursor, Math.min(Date.now(),fin), estado);
  cont.innerHTML=html||'<span class="nd" style="width:100%"></span>';
}

function renderRutina(){
  const cont=document.getElementById('rutina');
  const hoy=new Date().toDateString();
  const hechos=(cargar(K_EJE,{})[hoy])||[];
  cont.innerHTML=RUTINA.map((e,i)=>`
    <div class="check ${hechos.includes(i)?'hecho':''}" role="checkbox" tabindex="0"
         aria-checked="${hechos.includes(i)}" onclick="toggleEjercicio(${i})"
         onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleEjercicio(${i})}">
      <div class="box">${hechos.includes(i)?'✓':''}</div><div class="lbl">${esc(e)}</div></div>`).join('');
}
function toggleEjercicio(i){
  const hoy=new Date().toDateString(), estado=cargar(K_EJE,{}), arr=new Set(estado[hoy]||[]);
  if(arr.has(i)) arr.delete(i); else { arr.add(i); registrar('ejercicio','Ejercicio: '+RUTINA[i],'🤸'); }
  estado[hoy]=[...arr]; guardarSeguro(K_EJE, estado); renderRutina();
}
function toggleMasSintomas(){ document.getElementById('masSintomas').classList.toggle('oculto'); }
function renderTimelineHoy(){ pintarLista(document.getElementById('timelineHoy'), registros.filter(r=>esHoy(r.ts)), false); }

/* ===========================================================================
   VISTA REPORTE
   =========================================================================== */
function datosPeriodo(){ const desde=inicioPeriodo(); return registros.filter(r=>r.ts>=desde).sort((a,b)=>a.ts-b.ts); }
function dosisPautadasPorDia(){ return (cfg.meds||[]).reduce((s,m)=>s+((m.horarios||[]).length),0); }

function renderReporte(){
  const d=datosPeriodo();
  const tomas=d.filter(r=>r.tipo==='medicamento').length;
  const offs=d.filter(r=>r.tipo==='off').length;
  const dias=new Set(d.map(r=>claveDia(r.ts)));
  const nDias=dias.size||1;
  const pautadas=dosisPautadasPorDia();
  const esperadas=pautadas*nDias;
  const adh=esperadas>0 ? Math.min(100, Math.round(tomas/esperadas*100)) : 0;
  document.getElementById('stats').innerHTML=`
    <div class="stat"><div class="num">${tomas}</div><div class="lbl">tomas registradas</div></div>
    <div class="stat"><div class="num">${esperadas>0?adh+'%':'—'}</div><div class="lbl">adherencia${esperadas>0?(' ('+tomas+'/'+esperadas+')'):''}</div></div>
    <div class="stat"><div class="num">${offs}</div><div class="lbl">episodios OFF</div></div>
    <div class="stat"><div class="num">${nDias}</div><div class="lbl">días con registro</div></div>`;
  document.getElementById('insight').innerHTML=calcularWearingOff(d);
  document.getElementById('grafico').innerHTML=graficoSVG(d,'pantalla');
  pintarLista(document.getElementById('timelineSemana'), d, true);
}
/* Empareja cada OFF con la toma inmediatamente anterior del MISMO dia (hasta 6h). */
function calcularWearingOff(d){
  const orden=d.slice().sort((a,b)=>a.ts-b.ts), difs=[];
  orden.forEach((r,i)=>{
    if(r.tipo!=='off') return;
    for(let j=i-1;j>=0;j--){
      if(orden[j].tipo==='medicamento'){
        const min=(r.ts-orden[j].ts)/60000;
        if(min<=360 && claveDia(r.ts)===claveDia(orden[j].ts)) difs.push(min);
        break;
      }
    }
  });
  if(difs.length<2) return 'Anota tus tomas y tus momentos OFF unos días y aquí verás tu patrón de <b>wearing-off</b> (cuánto te dura el efecto del medicamento).';
  const prom=Math.round(difs.reduce((a,b)=>a+b,0)/difs.length);
  return `Patrón: en promedio pasas a <b>OFF unas ${Math.floor(prom/60)}h ${prom%60}min</b> después de tu toma (${difs.length} mediciones). Muéstraselo a tu neurólogo para ajustar horarios o dosis.`;
}
function graficoSVG(d, modo){
  const c = modo==='print'
    ? { bar:'#1f7a6d', dot:'#d9763a', txt:'#5b6f6a', line:'#dfe8e5', dotxt:'#fff' }
    : { bar:'#2ee6c8', dot:'#ff9d42', txt:'#a7bdd9', line:'rgba(120,160,220,.25)', dotxt:'#03211c' };
  const n=periodoRep, hoy=new Date(); hoy.setHours(0,0,0,0);
  const dias=[]; for(let i=n-1;i>=0;i--) dias.push(new Date(hoy.getTime()-i*DIA));
  const porDia=dias.map(f=>{ const k=f.toDateString();
    return { f, tomas:d.filter(r=>r.tipo==='medicamento'&&claveDia(r.ts)===k).length,
                 offs:d.filter(r=>r.tipo==='off'&&claveDia(r.ts)===k).length }; });
  const maxT=Math.max(3,...porDia.map(x=>x.tomas));
  const W=560,H=180,padB=26,padT=14,padL=24, gap=(W-padL)/n, bw=gap*0.62;
  let bars='',dots='',labels='';
  porDia.forEach((x,i)=>{
    const cx=padL+i*gap+gap*0.5, h=(x.tomas/maxT)*(H-padB-padT), y=H-padB-h;
    bars+=`<rect x="${(cx-bw/2).toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${c.bar}"/>`;
    if(x.offs>0) dots+=`<circle cx="${cx.toFixed(1)}" cy="${(y-7).toFixed(1)}" r="6" fill="${c.dot}"/><text x="${cx.toFixed(1)}" y="${(y-4).toFixed(1)}" font-size="8" fill="${c.dotxt}" text-anchor="middle">${x.offs}</text>`;
    if(n<=7 || i%Math.ceil(n/10)===0) labels+=`<text x="${cx.toFixed(1)}" y="${H-8}" font-size="10" fill="${c.txt}" text-anchor="middle">${x.f.getDate()}</text>`;
  });
  return `<svg class="grafico" viewBox="0 0 ${W} ${H}" role="img" aria-label="Tomas por día">
    <text x="${padL}" y="10" font-size="10" fill="${c.txt}">Tomas por día · ${modo==='print'?'naranjo':'🟠'} = episodios OFF</text>
    ${bars}${dots}${labels}
    <line x1="${padL}" y1="${H-padB}" x2="${W}" y2="${H-padB}" stroke="${c.line}"/></svg>`;
}
function setPeriodo(n){ periodoRep=n;
  document.getElementById('per7').classList.toggle('activo',n===7);
  document.getElementById('per30').classList.toggle('activo',n===30);
  document.getElementById('per7').setAttribute('aria-pressed', n===7);
  document.getElementById('per30').setAttribute('aria-pressed', n===30);
  renderReporte();
}
function copiarReporte(){
  const d=datosPeriodo();
  const tomas=d.filter(r=>r.tipo==='medicamento').length, offs=d.filter(r=>r.tipo==='off').length;
  let txt=`REPORTE PARKINSON — últimos ${periodoRep} días\n`;
  if(cfg.paciente) txt+=`Paciente: ${cfg.paciente}\n`;
  txt+=`\nTomas registradas: ${tomas}\nEpisodios OFF: ${offs}\n`;
  txt+=calcularWearingOff(d).replace(/<[^>]+>/g,'')+'\n\nDETALLE:\n';
  d.forEach(r=>{ txt+=`${fmtFecha(r.ts)} ${fmtHora(r.ts)} — ${r.detalle}\n`; });
  txt+='\n(Generado con Mi Diario Parkinson)';
  if(navigator.clipboard && navigator.clipboard.writeText)
    navigator.clipboard.writeText(txt).then(()=>aviso('Reporte copiado. Pégalo en WhatsApp o correo.','exito')).catch(()=>prompt('Copia tu reporte:',txt));
  else prompt('Copia tu reporte:',txt);
}
function reportePDF(){
  const d=datosPeriodo();
  const tomas=d.filter(r=>r.tipo==='medicamento').length;
  const offs=d.filter(r=>r.tipo==='off').length;
  const sintomas=d.filter(r=>r.tipo==='sintoma').length;
  const nDias=new Set(d.map(r=>claveDia(r.ts))).size||1;
  const esperadas=dosisPautadasPorDia()*nDias;
  const adh=esperadas>0?Math.min(100,Math.round(tomas/esperadas*100)):null;
  const filas=d.slice().reverse().map(r=>`<tr><td>${fmtFecha(r.ts)}</td><td>${fmtHora(r.ts)}</td><td>${esc(r.detalle)}</td></tr>`).join('');
  const hoy=new Date().toLocaleDateString('es-CL',{day:'numeric',month:'long',year:'numeric'});
  document.getElementById('printRoot').innerHTML=`
    <div class="pr-head"><div class="pr-logo">🌷</div>
      <div><div class="pr-title">Reporte — Mi Diario Parkinson</div>
      <div class="pr-meta">${cfg.paciente?('Paciente: '+esc(cfg.paciente)+' · '):''}Últimos ${periodoRep} días · Generado el ${hoy}</div></div></div>
    <div class="pr-stats">
      <div class="pr-stat"><div class="n">${tomas}</div><div class="l">Tomas</div></div>
      <div class="pr-stat"><div class="n">${adh!=null?adh+'%':'—'}</div><div class="l">Adherencia${esperadas>0?(' '+tomas+'/'+esperadas):''}</div></div>
      <div class="pr-stat"><div class="n">${offs}</div><div class="l">Episodios OFF</div></div>
      <div class="pr-stat"><div class="n">${nDias}</div><div class="l">Días con registro</div></div></div>
    <div class="pr-insight">${calcularWearingOff(d)}${sintomas?(' Síntomas anotados: '+sintomas+'.'):''}</div>
    <div class="pr-h">Tomas por día</div>${graficoSVG(d,'print')}
    <div class="pr-h">Registro detallado</div>
    <table class="pr-tab"><thead><tr><th>Fecha</th><th>Hora</th><th>Evento</th></tr></thead>
      <tbody>${filas||'<tr><td colspan="3">Sin registros en el período.</td></tr>'}</tbody></table>
    <div class="pr-foot">Generado con Mi Diario Parkinson — herramienta de registro y apoyo. No reemplaza el criterio médico.</div>`;
  hablar('Generando tu reporte');
  setTimeout(()=>{ try{ window.print(); }
    catch(e){ copiarReporte(); aviso('No pude abrir el PDF. Te copié el reporte para pegarlo en WhatsApp o correo.'); } }, 150);
}

/* ---------- lista generica ---------- */
function pintarLista(cont, lista, conFecha){
  if(!cont) return;
  if(lista.length===0){ cont.innerHTML='<div class="vacio">Sin registros todavía.</div>'; return; }
  cont.innerHTML=lista.slice().reverse().map(r=>`
    <div class="item"><div class="ico">${r.ico}</div>
      <div class="txt"><div class="t1">${esc(r.detalle)}</div>
        <div class="t2">${conFecha?fmtFecha(r.ts)+' · ':''}${fmtHora(r.ts)}</div></div>
      <button class="borrar" onclick="borrar('${r.id}')" aria-label="Borrar registro: ${esc(r.detalle)}">×</button></div>`).join('');
}
function esc(s){ return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

/* ===========================================================================
   VISTA AJUSTES
   =========================================================================== */
function renderAjustes(){
  document.getElementById('inpPaciente').value=cfg.paciente||'';
  document.getElementById('medsEditor').innerHTML=(cfg.meds||[]).map((m,i)=>`
    <div class="med-card">
      <div class="med-row">
        <input type="text" list="presetMeds" value="${esc(m.nombre)}" placeholder="Medicamento"
               aria-label="Nombre del medicamento" onchange="editMed(${i},'nombre',this.value)">
        <input type="text" class="med-dosis" value="${esc(m.dosis||'')}" placeholder="mg"
               aria-label="Dosis" onchange="editMed(${i},'dosis',this.value)">
      </div>
      <div class="med-row">
        <input type="text" value="${esc((m.horarios||[]).join(', '))}" placeholder="07:00, 10:00, 13:00"
               inputmode="numeric" aria-label="Horarios" onchange="editMed(${i},'horarios',this.value)">
        <button class="borrar" onclick="quitarMed(${i})" aria-label="Quitar ${esc(m.nombre||'medicamento')}">×</button>
      </div>
    </div>`).join('');
  bindToggle('tgVoz','vozLectura'); bindToggle('tgTexto','textoGrande');
  bindToggle('tgContraste','altoContraste'); bindToggle('tgRecord','recordatorios');
}
function bindToggle(id,key){ const el=document.getElementById(id); if(el) el.checked=!!cfg[key]; }
function onToggle(id,key){ cfg[key]=document.getElementById(id).checked; guardarCfg(); aplicarConfig();
  if(key==='recordatorios'&&cfg[key]){ pedirPermisoNotif();
    aviso('Te avisaré solo con la app abierta. Para no olvidar, déjala abierta o usa también la alarma del teléfono.','exito'); } }
function editMed(i,campo,val){
  if(campo==='horarios') cfg.meds[i].horarios=val.split(',').map(s=>s.trim()).filter(s=>{ const m=s.match(/^(\d{1,2}):(\d{2})$/); return m && +m[1]<=23 && +m[2]<=59; });
  else cfg.meds[i][campo]=val;
  guardarCfg(); renderDosis();
}
function quitarMed(i){ cfg.meds.splice(i,1); guardarCfg(); renderAjustes(); renderDosis(); }
function agregarMed(){ cfg.meds.push({nombre:'',dosis:'',horarios:[]}); guardarCfg(); renderAjustes(); }
function guardarPaciente(v){ cfg.paciente=v; guardarCfg(); }
function aplicarConfig(){
  document.body.classList.toggle('texto-grande', !!cfg.textoGrande);
  document.body.classList.toggle('alto-contraste', !!cfg.altoContraste);
}

/* ---------- respaldo ---------- */
function descargarRespaldo(){
  const data={ registros, cfg, ejercicio:cargar(K_EJE,{}), exportado:new Date().toISOString() };
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download='diario-parkinson-'+new Date().toISOString().slice(0,10)+'.json'; a.click();
  aviso('Respaldo descargado. Guárdalo en lugar seguro.','exito');
}
function importarRespaldo(input){
  const f=input.files[0]; if(!f) return;
  const fr=new FileReader();
  fr.onload=()=>{ try{
    const data=JSON.parse(fr.result);
    if(!data || !Array.isArray(data.registros)) throw new Error('formato');
    if(!confirm('Esto reemplazará tus datos actuales por los del respaldo. ¿Continuar?')){ input.value=''; return; }
    registros=data.registros; cfg=Object.assign({},CFG_DEFAULT,data.cfg||{});
    if(data.ejercicio) guardarSeguro(K_EJE,data.ejercicio);
    guardarReg(); guardarCfg(); aplicarConfig(); render(); renderAjustes();
    aviso('Respaldo importado.','exito');
  }catch(e){ aviso('Archivo de respaldo no válido.'); } input.value=''; };
  fr.readAsText(f);
}
function borrarTodo(){
  if(!confirm('¿Borrar TODOS tus registros? Esto no se puede deshacer.')) return;
  if(!confirm('Última confirmación: se borrará todo tu historial.')) return;
  registros=[]; localStorage.removeItem(K_EJE); guardarReg(); render(); aviso('Historial borrado.');
}

/* ---------- avisos ---------- */
function aviso(msg, tipo){
  const b=document.getElementById('banner');
  b.className='banner'+(tipo==='exito'?' exito':''); b.classList.remove('oculto');
  b.innerHTML=`<span>${esc(msg)}</span><button onclick="document.getElementById('banner').classList.add('oculto')">OK</button>`;
  if(tipo==='exito') setTimeout(()=>b.classList.add('oculto'),5000);
}
function avisoDeshacer(msg){
  const b=document.getElementById('banner');
  b.className='banner'; b.classList.remove('oculto');
  b.innerHTML=`<span>${esc(msg)}</span><button onclick="deshacerBorrado()">Deshacer</button>`;
  setTimeout(()=>{ if(ultimoBorrado){ b.classList.add('oculto'); ultimoBorrado=null; } },12000);
}

/* ---------- recordatorios (solo con app abierta) ---------- */
function pedirPermisoNotif(){ if('Notification' in window && Notification.permission==='default') Notification.requestPermission(); }
function chequearRecordatorios(){
  if(!cfg.recordatorios) return;
  const ahora=new Date(), minNow=ahora.getHours()*60+ahora.getMinutes();
  (cfg.meds||[]).forEach(m=>(m.horarios||[]).forEach(h=>{
    const [hh,mm]=h.split(':').map(Number), minDose=hh*60+mm;
    const key=h+'|'+ahora.toDateString();
    if(minNow>=minDose && minNow<minDose+2 && !notificados.has(key)){
      notificados.add(key); guardarSeguro(K_NOT,[...notificados]);
      const msg=`Hora de tu ${m.nombre}`; aviso('⏰ '+msg,'exito'); hablar(msg);
      try{ if('Notification' in window && Notification.permission==='granted')
        new Notification('Mi Diario Parkinson',{ body:msg, icon:'icons/icon-192.png' }); }catch(e){}
    }
  }));
}

/* ===========================================================================
   VOZ (entrada por microfono)
   =========================================================================== */
const MIC_HINT='Toca y habla: "tomé la pastilla"';
function interpretar(t){
  t=t.toLowerCase();
  if(/(pastilla|remedio|medicament|tom[eé]|levodopa|prolopa|rasagilin|elbrus|carbidopa)/.test(t)) return registrarToma();
  if(/(ca[ií]da|me ca[ií]|caer)/.test(t)) return registrar('sintoma','Caída','⚠️');
  if(/(mareo|mareé|presi[oó]n|al pararme|desmay)/.test(t)) return registrar('sintoma','Mareo al pararme','💫');
  if(/(alucinaci|vi algo|escuch[eé] algo|sombras)/.test(t)) return registrar('sintoma','Vi/oí algo que no estaba','👁️');
  if(/(temblor|tiembl)/.test(t)) return registrar('sintoma','Temblor','〰️');
  if(/(freezing|se me pegan|se me traban|congel)/.test(t)) return registrar('sintoma','Se me pegan los pies (freezing)','🧊');
  if(/(rigid|tieso|duro|agarrotad)/.test(t)) return registrar('sintoma','Rigidez','🧱');
  if(/(involuntari|me muevo solo|baile)/.test(t)) return registrar('sintoma','Movimientos involuntarios (estando ON)','🌀');
  if(/(calambre|distonia|distonía|postura|pie torcido)/.test(t)) return registrar('sintoma','Calambre/postura forzada (estando OFF)','🦶');
  if(/(estreñ|estreni|no puedo ir al baño)/.test(t)) return registrar('sintoma','Estreñimiento','🚽');
  if(/(dolor|me duele)/.test(t)) return registrar('sintoma','Dolor','🤕');
  if(/(off|apagad|me siento mal|sin efecto|decaíd|lento)/.test(t)) return registrar('off','Estoy en OFF (mal)','🟠');
  if(/(on|me siento bien|suelto|activ|mejor)/.test(t)) return registrar('on','Me siento ON (bien)','🟢');
  if(/(triste|ánimo|animo|deprim|bajón|ansiedad)/.test(t)) return registrar('animo','Ánimo bajo / ansiedad','🌧️');
  if(/(dorm|sueñ|insomnio|desvel|pesadilla)/.test(t)) return registrar('sueno','Sobre el sueño: '+t,'😴');
  return registrar('nota', t.charAt(0).toUpperCase()+t.slice(1), '🗒️');
}
function initVoz(){
  const mic=document.getElementById('mic'), label=document.getElementById('micLabel');
  const Recog=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!Recog){ mic.onclick=()=>{ label.textContent='Este navegador no oye. Usa los botones 👇'; }; return; }
  const rec=new Recog(); rec.lang='es-CL'; rec.continuous=true; rec.interimResults=true; rec.maxAlternatives=1;
  let grabando=false, finalTxt='', timer=null;
  const PAUSA_MS=5000; // tolera pausas largas dentro de la frase (voz hipofónica)
  const rearmar=()=>{ clearTimeout(timer); timer=setTimeout(()=>{ try{ rec.stop(); }catch(e){} }, PAUSA_MS); };
  rec.onresult=e=>{
    let interim='';
    for(let i=e.resultIndex;i<e.results.length;i++){
      const r=e.results[i];
      if(r.isFinal) finalTxt+=' '+r[0].transcript; else interim+=r[0].transcript;
    }
    if(interim) label.textContent='… '+interim;
    rearmar(); // cada vez que habla, reinicia el reloj de pausa
  };
  rec.onerror=ev=>{
    clearTimeout(timer);
    if(ev.error==='not-allowed'||ev.error==='service-not-allowed') label.textContent='Activa el permiso de micrófono, o usa los botones 👇';
    else if(ev.error==='network') label.textContent='La voz necesita internet. Sin conexión, usa los botones 👇';
    else if(ev.error==='no-speech') label.textContent='No te escuché. Toca otra vez o usa los botones 👇';
    else label.textContent='No pude oír bien. Usa los botones 👇';
  };
  rec.onend=()=>{ clearTimeout(timer); grabando=false; mic.classList.remove('grabando'); mic.setAttribute('aria-pressed','false');
    const txt=finalTxt.trim();
    if(txt){ label.textContent='"'+txt+'"'; interpretar(txt); }
    else if(label.textContent.startsWith('…')||label.textContent.startsWith('Escuchando')) label.textContent=MIC_HINT;
    finalTxt='';
  };
  mic.onclick=()=>{
    if(grabando){ try{ rec.stop(); }catch(e){} return; }
    finalTxt='';
    try{ rec.start(); grabando=true; mic.classList.add('grabando'); mic.setAttribute('aria-pressed','true');
      label.textContent='Escuchando… habla con calma (toca otra vez al terminar)'; rearmar(); }
    catch(e){ grabando=false; mic.classList.remove('grabando');
      label.textContent='No pude iniciar el micrófono. Toca otra vez o usa los botones 👇'; }
  };
}

/* ===========================================================================
   NAVEGACION + RENDER
   =========================================================================== */
function cambiarVista(v){
  vistaActual=v;
  ['hoy','reporte','ajustes'].forEach(x=>{
    document.getElementById('vista-'+x).classList.toggle('oculto', x!==v);
    const nb=document.getElementById('nav-'+x);
    nb.classList.toggle('activo', x===v);
    if(x===v) nb.setAttribute('aria-current','page'); else nb.removeAttribute('aria-current');
  });
  if(v==='reporte') renderReporte();
  if(v==='ajustes') renderAjustes();
  const sec=document.getElementById('vista-'+v); sec.setAttribute('tabindex','-1'); sec.focus();
  window.scrollTo(0,0);
}
function render(){ renderDosis(); renderFranja(); renderRutina(); renderTimelineHoy(); if(vistaActual==='reporte') renderReporte(); }

/* ---------- instalar PWA ---------- */
window.addEventListener('beforeinstallprompt', e=>{ e.preventDefault(); promptInstalar=e;
  const b=document.getElementById('btnInstalar'); if(b) b.classList.remove('oculto'); });
function instalarApp(){ if(!promptInstalar){ aviso('Para instalar: menú del navegador → "Agregar a pantalla de inicio".'); return; }
  promptInstalar.prompt(); promptInstalar=null; }

/* ---------- arranque ---------- */
function init(){
  document.getElementById('micLabel').textContent=MIC_HINT;
  // poblar datalist de medicamentos
  const dl=document.getElementById('presetMeds');
  if(dl) dl.innerHTML=PRESET_MEDS.map(m=>`<option value="${esc(m)}">`).join('');
  aplicarConfig(); initVoz(); render();
  // pedir almacenamiento persistente (reduce riesgo de que el navegador borre los datos)
  if(navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(()=>{});
  setInterval(()=>{ renderDosis(); chequearRecordatorios(); }, 30000);
  // al volver a la app, revisar tomas/recordatorios (el teléfono pudo dormir)
  document.addEventListener('visibilitychange', ()=>{ if(!document.hidden){ renderDosis(); chequearRecordatorios(); } });
  if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').then(r=>{ if(r&&r.update) r.update(); }).catch(()=>{});
}
document.addEventListener('DOMContentLoaded', init);
