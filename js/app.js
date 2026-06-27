/* ===========================================================================
   Mi Diario Parkinson — logica de la app (sin librerias, 100% local)
   Todo en espanol. Los datos viven solo en este dispositivo (localStorage).
   =========================================================================== */
'use strict';

const K_REG = 'dp_registros_v1';
const K_CFG = 'dp_config_v1';
const K_EJE = 'dp_ejercicio_v1';

const ICONOS = { medicamento:'💊', on:'🟢', off:'🟠', sintoma:'〰️', animo:'🌧️', sueno:'😴', ejercicio:'🤸', nota:'🗒️' };

const CFG_DEFAULT = {
  paciente: '',
  meds: [{ nombre:'Levodopa', horarios:['08:00','12:00','16:00','20:00'] }],
  vozLectura: true, textoGrande:false, altoContraste:false, recordatorios:true
};

const RUTINA = [
  'Estiramiento de cuello y hombros',
  'Caminar con pasos grandes',
  'Equilibrio: pararse en un pie',
  'Respiracion profunda (pranayama)',
  'Ejercicio de voz: hablar fuerte'
];

let registros = cargar(K_REG, []);
let cfg = Object.assign({}, CFG_DEFAULT, cargar(K_CFG, {}));
let vistaActual = 'hoy';
let periodoRep = 7;
const notificadosHoy = new Set();
let promptInstalar = null;

/* ---------- almacenamiento ---------- */
function cargar(clave, def){ try{ return JSON.parse(localStorage.getItem(clave)) ?? def; }catch(e){ return def; } }
function guardarReg(){ localStorage.setItem(K_REG, JSON.stringify(registros)); }
function guardarCfg(){ localStorage.setItem(K_CFG, JSON.stringify(cfg)); }

/* ---------- utilidades de fecha ---------- */
const HORA = 3600000, DIA = 86400000;
function fmtHora(ts){ const d=new Date(ts); return p2(d.getHours())+':'+p2(d.getMinutes()); }
function fmtFecha(ts){ return new Date(ts).toLocaleDateString('es-CL',{weekday:'short',day:'numeric',month:'short'}); }
function p2(n){ return String(n).padStart(2,'0'); }
function esHoy(ts){ return new Date(ts).toDateString() === new Date().toDateString(); }
function claveDia(ts){ return new Date(ts).toDateString(); }
function horarioADate(hhmm, base){ const [h,m]=hhmm.split(':').map(Number); const d=base?new Date(base):new Date(); d.setHours(h,m,0,0); return d; }

/* ---------- voz (lectura) ---------- */
function hablar(txt){
  if(!cfg.vozLectura) return;
  try{
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(txt);
    u.lang='es-CL'; u.rate=0.95;
    const v = speechSynthesis.getVoices().find(x=>x.lang && x.lang.startsWith('es'));
    if(v) u.voice=v;
    speechSynthesis.speak(u);
  }catch(e){}
}

/* ---------- registrar un evento ---------- */
function registrar(tipo, detalle, ico){
  registros.push({ id:Date.now()+Math.random(), ts:Date.now(), tipo, detalle, ico:ico||ICONOS[tipo]||'🗒️' });
  guardarReg();
  flash('✓ '+detalle);
  hablar('Anotado: '+detalle);
  render();
}
function borrar(id){
  registros = registros.filter(r=>r.id!==id);
  guardarReg(); render();
}
function flash(msg){
  const el = document.getElementById('micLabel');
  if(!el) return;
  el.textContent = msg; el.style.color='var(--green)';
  setTimeout(()=>{ el.textContent = MIC_HINT; el.style.color=''; }, 2600);
}

/* ===========================================================================
   VISTA HOY
   =========================================================================== */
function renderDosis(){
  const cont = document.getElementById('cardDosis');
  const horarios = (cfg.meds||[]).flatMap(m => (m.horarios||[]).map(h => ({ h, nombre:m.nombre })));
  if(horarios.length===0){ cont.classList.add('oculto'); return; }
  cont.classList.remove('oculto');

  const ahora = new Date();
  const tomasHoy = registros.filter(r=>r.tipo==='medicamento' && esHoy(r.ts));
  const tomada = (hd) => tomasHoy.some(t => Math.abs(t.ts - hd.getTime()) <= 60*60000);

  // atrasada: horario ya paso (hasta 3h) y no registrada
  let atrasada=null, prox=null;
  horarios.map(o=>({...o, d:horarioADate(o.h, ahora)})).sort((a,b)=>a.d-b.d).forEach(o=>{
    if(o.d <= ahora){ if(!tomada(o.d) && (ahora-o.d)<=3*HORA && !atrasada) atrasada=o; }
    else if(!prox){ prox=o; }
  });
  if(!prox){ // siguiente es la primera de manana
    const m=horarios[0]; const d=horarioADate(m.h, new Date(Date.now()+DIA)); prox={...m, d};
  }

  if(atrasada){
    cont.classList.add('atrasada');
    cont.innerHTML = `<h3>Toma pendiente</h3>
      <div class="dosis"><div class="reloj">${atrasada.h}</div>
      <div class="det">${atrasada.nombre} — toca cuando la tomes</div>
      <button class="btn-grande" onclick="registrar('medicamento','Tomé ${esc(atrasada.nombre)}','💊')">💊 Registrar toma</button></div>`;
  }else{
    cont.classList.remove('atrasada');
    const falta = prox.d - ahora;
    const hh=Math.floor(falta/HORA), mm=Math.floor((falta%HORA)/60000);
    cont.innerHTML = `<h3>Próxima toma</h3>
      <div class="dosis"><div class="reloj">${prox.h}</div>
      <div class="det">${prox.nombre} — en ${hh>0?hh+'h ':''}${mm}min</div>
      <button class="btn-grande sec" onclick="registrar('medicamento','Tomé ${esc(prox.nombre)}','💊')">💊 Ya la tomé</button></div>`;
  }
}

function renderFranja(){
  const cont = document.getElementById('franjaDia');
  const inicio = new Date(); inicio.setHours(6,0,0,0);
  const finMs = 24*HORA - 6*HORA; // 18h de ventana (06:00 -> 00:00)
  // construir segmentos a partir de eventos on/off de hoy
  const evs = registros.filter(r=>esHoy(r.ts) && (r.tipo==='on'||r.tipo==='off'))
                       .sort((a,b)=>a.ts-b.ts);
  if(evs.length===0){ cont.innerHTML='<span style="width:100%;background:#e4ebe9"></span>'; return; }
  let html=''; let cursor=inicio.getTime(); let estado=evs[0].tipo==='on'?'off':'on';
  const ahora=Date.now();
  const seg=(desde,hasta,est)=>{
    const w=Math.max(0,(hasta-desde)/finMs*100);
    const color = est==='on'?'var(--on)':'var(--off)';
    if(w>0) html+=`<span style="width:${w}%;background:${color}"></span>`;
  };
  evs.forEach(e=>{ seg(cursor, e.ts, estado); estado=e.tipo; cursor=e.ts; });
  seg(cursor, ahora, estado);
  cont.innerHTML = html || '<span style="width:100%;background:#e4ebe9"></span>';
}

function renderRutina(){
  const cont = document.getElementById('rutina');
  const hoy = new Date().toDateString();
  const estado = cargar(K_EJE, {});
  const hechos = estado[hoy] || [];
  cont.innerHTML = RUTINA.map((e,i)=>`
    <div class="check ${hechos.includes(i)?'hecho':''}" onclick="toggleEjercicio(${i})">
      <div class="box">${hechos.includes(i)?'✓':''}</div>
      <div class="lbl">${esc(e)}</div>
    </div>`).join('');
}
function toggleEjercicio(i){
  const hoy=new Date().toDateString();
  const estado=cargar(K_EJE,{}); const arr=new Set(estado[hoy]||[]);
  if(arr.has(i)) arr.delete(i); else { arr.add(i); registrar('ejercicio','Ejercicio: '+RUTINA[i],'🤸'); }
  estado[hoy]=[...arr]; localStorage.setItem(K_EJE,JSON.stringify(estado));
  renderRutina();
}

function renderTimelineHoy(){
  pintarLista(document.getElementById('timelineHoy'), registros.filter(r=>esHoy(r.ts)), false);
}

/* ===========================================================================
   VISTA REPORTE
   =========================================================================== */
function datosPeriodo(){
  const desde = Date.now() - periodoRep*DIA;
  return registros.filter(r=>r.ts>=desde).sort((a,b)=>a.ts-b.ts);
}
function renderReporte(){
  const d = datosPeriodo();
  const tomas=d.filter(r=>r.tipo==='medicamento').length;
  const offs=d.filter(r=>r.tipo==='off').length;
  const sintomas=d.filter(r=>r.tipo==='sintoma').length;
  const dias=new Set(d.map(r=>claveDia(r.ts))).size || 1;
  document.getElementById('stats').innerHTML=`
    <div class="stat"><div class="num">${tomas}</div><div class="lbl">tomas (≈${(tomas/dias).toFixed(1)}/día)</div></div>
    <div class="stat"><div class="num">${offs}</div><div class="lbl">episodios OFF</div></div>
    <div class="stat"><div class="num">${sintomas}</div><div class="lbl">síntomas anotados</div></div>
    <div class="stat"><div class="num">${dias}</div><div class="lbl">días con registro</div></div>`;
  document.getElementById('insight').innerHTML = calcularWearingOff(d);
  document.getElementById('grafico').innerHTML = graficoSVG(d);
  pintarLista(document.getElementById('timelineSemana'), d, true);
}
function calcularWearingOff(d){
  const orden=d.slice().sort((a,b)=>a.ts-b.ts); let difs=[];
  for(let i=0;i<orden.length;i++){
    if(orden[i].tipo==='medicamento'){
      const off=orden.slice(i+1).find(r=>r.tipo==='off');
      if(off){ const min=(off.ts-orden[i].ts)/60000; if(min<360) difs.push(min); }
    }
  }
  if(difs.length<2) return 'Anota tus tomas y tus momentos OFF unos días y aquí verás tu patrón de <b>wearing-off</b> (cuánto te dura el efecto del medicamento).';
  const prom=Math.round(difs.reduce((a,b)=>a+b,0)/difs.length);
  return `Patrón: en promedio pasas a <b>OFF unas ${Math.floor(prom/60)}h ${prom%60}min</b> después de tu toma (${difs.length} mediciones). Muéstraselo a tu neurólogo para ajustar horarios o dosis.`;
}
/* grafico de barras: tomas por dia + puntos de OFF, en SVG puro */
function graficoSVG(d){
  const n=periodoRep, hoy=new Date(); hoy.setHours(0,0,0,0);
  const dias=[];
  for(let i=n-1;i>=0;i--){ const f=new Date(hoy.getTime()-i*DIA); dias.push(f); }
  const porDia = dias.map(f=>{
    const k=f.toDateString();
    return {
      f,
      tomas: d.filter(r=>r.tipo==='medicamento'&&claveDia(r.ts)===k).length,
      offs:  d.filter(r=>r.tipo==='off'&&claveDia(r.ts)===k).length
    };
  });
  const maxT=Math.max(3,...porDia.map(x=>x.tomas));
  const W=560, H=180, padB=26, padT=12, padL=24;
  const bw=(W-padL)/n*0.62, gap=(W-padL)/n;
  let bars='', labels='', dots='';
  porDia.forEach((x,i)=>{
    const cx=padL + i*gap + gap*0.5;
    const h=(x.tomas/maxT)*(H-padB-padT);
    const y=H-padB-h;
    bars+=`<rect x="${(cx-bw/2).toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="#1f7a6d"/>`;
    if(x.offs>0) dots+=`<circle cx="${cx.toFixed(1)}" cy="${(y-7).toFixed(1)}" r="5" fill="#d9763a"/><text x="${cx.toFixed(1)}" y="${(y-3).toFixed(1)}" font-size="8" fill="#fff" text-anchor="middle">${x.offs}</text>`;
    if(n<=7 || i%Math.ceil(n/10)===0)
      labels+=`<text x="${cx.toFixed(1)}" y="${H-8}" font-size="10" fill="#5b6f6a" text-anchor="middle">${x.f.getDate()}</text>`;
  });
  return `<svg class="grafico" viewBox="0 0 ${W} ${H}" role="img" aria-label="Tomas por día">
    <text x="${padL}" y="10" font-size="10" fill="#5b6f6a">Tomas por día · 🟠 = episodios OFF</text>
    ${bars}${dots}${labels}
    <line x1="${padL}" y1="${H-padB}" x2="${W}" y2="${H-padB}" stroke="#dfe8e5"/>
  </svg>`;
}
function setPeriodo(n){ periodoRep=n;
  document.getElementById('per7').classList.toggle('activo',n===7);
  document.getElementById('per30').classList.toggle('activo',n===30);
  renderReporte();
}
function copiarReporte(){
  const d=datosPeriodo();
  const tomas=d.filter(r=>r.tipo==='medicamento').length, offs=d.filter(r=>r.tipo==='off').length;
  let txt=`REPORTE PARKINSON — últimos ${periodoRep} días\n`;
  if(cfg.paciente) txt+=`Paciente: ${cfg.paciente}\n`;
  txt+=`\nTomas de medicamento: ${tomas}\nEpisodios OFF: ${offs}\n`;
  txt+=calcularWearingOff(d).replace(/<[^>]+>/g,'')+'\n\nDETALLE:\n';
  d.forEach(r=>{ txt+=`${fmtFecha(r.ts)} ${fmtHora(r.ts)} — ${r.detalle}\n`; });
  txt+='\n(Generado con Mi Diario Parkinson)';
  navigator.clipboard.writeText(txt)
    .then(()=>aviso('Reporte copiado. Pégalo en WhatsApp o correo para tu neurólogo.','exito'))
    .catch(()=>{ prompt('Copia tu reporte:', txt); });
}
/* Documento PDF para el medico (se imprime / guarda como PDF en 1 clic) */
function reportePDF(){
  const d=datosPeriodo();
  const tomas=d.filter(r=>r.tipo==='medicamento').length;
  const offs=d.filter(r=>r.tipo==='off').length;
  const sintomas=d.filter(r=>r.tipo==='sintoma').length;
  const dias=new Set(d.map(r=>claveDia(r.ts))).size||1;
  const filas=d.slice().reverse().map(r=>
    `<tr><td>${fmtFecha(r.ts)}</td><td>${fmtHora(r.ts)}</td><td>${esc(r.detalle)}</td></tr>`).join('');
  const hoy=new Date().toLocaleDateString('es-CL',{day:'numeric',month:'long',year:'numeric'});
  document.getElementById('printRoot').innerHTML=`
    <div class="pr-head">
      <div class="pr-logo">🌷</div>
      <div><div class="pr-title">Reporte — Mi Diario Parkinson</div>
        <div class="pr-meta">${cfg.paciente?('Paciente: '+esc(cfg.paciente)+' · '):''}Últimos ${periodoRep} días · Generado el ${hoy}</div></div>
    </div>
    <div class="pr-stats">
      <div class="pr-stat"><div class="n">${tomas}</div><div class="l">Tomas</div></div>
      <div class="pr-stat"><div class="n">${(tomas/dias).toFixed(1)}</div><div class="l">Tomas/día</div></div>
      <div class="pr-stat"><div class="n">${offs}</div><div class="l">Episodios OFF</div></div>
      <div class="pr-stat"><div class="n">${dias}</div><div class="l">Días con registro</div></div>
    </div>
    <div class="pr-insight">${calcularWearingOff(d)}${sintomas?(' Síntomas anotados: '+sintomas+'.'):''}</div>
    <div class="pr-h">Tomas por día</div>
    ${graficoSVG(d)}
    <div class="pr-h">Registro detallado</div>
    <table class="pr-tab"><thead><tr><th>Fecha</th><th>Hora</th><th>Evento</th></tr></thead>
      <tbody>${filas||'<tr><td colspan="3">Sin registros en el período.</td></tr>'}</tbody></table>
    <div class="pr-foot">Generado con Mi Diario Parkinson — herramienta de registro y apoyo. No reemplaza el criterio médico.</div>`;
  hablar('Generando tu reporte');
  setTimeout(()=>window.print(), 150);
}

/* ===========================================================================
   LISTA generica
   =========================================================================== */
function pintarLista(cont, lista, conFecha){
  if(!cont) return;
  if(lista.length===0){ cont.innerHTML='<div class="vacio">Sin registros todavía.</div>'; return; }
  cont.innerHTML = lista.slice().reverse().map(r=>`
    <div class="item"><div class="ico">${r.ico}</div>
      <div class="txt"><div class="t1">${esc(r.detalle)}</div>
        <div class="t2">${conFecha?fmtFecha(r.ts)+' · ':''}${fmtHora(r.ts)}</div></div>
      <button class="borrar" onclick="borrar(${r.id})" aria-label="Borrar">×</button>
    </div>`).join('');
}
function esc(s){ return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

/* ===========================================================================
   VISTA AJUSTES
   =========================================================================== */
function renderAjustes(){
  document.getElementById('inpPaciente').value = cfg.paciente||'';
  const cont=document.getElementById('medsEditor');
  cont.innerHTML = (cfg.meds||[]).map((m,i)=>`
    <div class="campo" style="border:1px solid var(--line);border-radius:12px;padding:10px;margin-bottom:10px">
      <div class="med-row">
        <input type="text" value="${esc(m.nombre)}" placeholder="Nombre" onchange="editMed(${i},'nombre',this.value)">
        <button class="borrar" onclick="quitarMed(${i})" aria-label="Quitar">×</button>
      </div>
      <input type="text" value="${(m.horarios||[]).join(', ')}" placeholder="08:00, 12:00, 16:00"
             onchange="editMed(${i},'horarios',this.value)">
    </div>`).join('');
  // toggles
  bindToggle('tgVoz','vozLectura'); bindToggle('tgTexto','textoGrande');
  bindToggle('tgContraste','altoContraste'); bindToggle('tgRecord','recordatorios');
}
function bindToggle(id,key){ const el=document.getElementById(id); if(el) el.checked=!!cfg[key]; }
function onToggle(id,key){ cfg[key]=document.getElementById(id).checked; guardarCfg(); aplicarConfig();
  if(key==='recordatorios'&&cfg[key]) pedirPermisoNotif(); }
function editMed(i,campo,val){
  if(campo==='horarios') cfg.meds[i].horarios = val.split(',').map(s=>s.trim()).filter(s=>/^\d{1,2}:\d{2}$/.test(s));
  else cfg.meds[i][campo]=val;
  guardarCfg(); renderDosis();
}
function quitarMed(i){ cfg.meds.splice(i,1); guardarCfg(); renderAjustes(); renderDosis(); }
function agregarMed(){ cfg.meds.push({nombre:'', horarios:[]}); guardarCfg(); renderAjustes(); }
function guardarPaciente(v){ cfg.paciente=v; guardarCfg(); }

function aplicarConfig(){
  document.body.classList.toggle('texto-grande', !!cfg.textoGrande);
  document.body.classList.toggle('alto-contraste', !!cfg.altoContraste);
}

/* ---------- respaldo de datos ---------- */
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
    if(!confirm('Esto reemplazará tus datos actuales por los del respaldo. ¿Continuar?')) return;
    registros=data.registros||[]; cfg=Object.assign({},CFG_DEFAULT,data.cfg||{});
    if(data.ejercicio) localStorage.setItem(K_EJE,JSON.stringify(data.ejercicio));
    guardarReg(); guardarCfg(); aplicarConfig(); render(); renderAjustes();
    aviso('Respaldo importado.','exito');
  }catch(e){ aviso('Archivo no válido.'); } };
  fr.readAsText(f);
}
function borrarTodo(){
  if(!confirm('¿Borrar TODOS tus registros? Esto no se puede deshacer.')) return;
  if(!confirm('Última confirmación: se borrará todo tu historial.')) return;
  registros=[]; localStorage.removeItem(K_EJE); guardarReg(); render();
  aviso('Historial borrado.');
}

/* ---------- avisos / banner ---------- */
function aviso(msg, tipo){
  const b=document.getElementById('banner');
  b.className='banner'+(tipo==='exito'?' exito':''); b.classList.remove('oculto');
  b.innerHTML=`<span>${esc(msg)}</span><button onclick="document.getElementById('banner').classList.add('oculto')">OK</button>`;
  if(tipo==='exito') setTimeout(()=>b.classList.add('oculto'),5000);
}

/* ---------- recordatorios de toma ---------- */
function pedirPermisoNotif(){
  if('Notification' in window && Notification.permission==='default') Notification.requestPermission();
}
function chequearRecordatorios(){
  if(!cfg.recordatorios) return;
  const ahora=new Date(); const hhmm=p2(ahora.getHours())+':'+p2(ahora.getMinutes());
  (cfg.meds||[]).forEach(m=>(m.horarios||[]).forEach(h=>{
    const clave=h+'|'+ahora.toDateString();
    if(h===hhmm && !notificadosHoy.has(clave)){
      notificadosHoy.add(clave);
      const msg=`Hora de tu ${m.nombre}`;
      aviso('⏰ '+msg, 'exito'); hablar(msg);
      try{ if('Notification' in window && Notification.permission==='granted')
        new Notification('Mi Diario Parkinson', { body: msg, icon:'icons/icon-192.png' }); }catch(e){}
    }
  }));
}

/* ===========================================================================
   VOZ (entrada por microfono)
   =========================================================================== */
const MIC_HINT = 'Toca y habla: "tomé la pastilla"';
function interpretar(t){
  t=t.toLowerCase();
  if(/(pastilla|remedio|medicament|tom[eé]|levodopa|prolopa|carbidopa)/.test(t)) return registrar('medicamento','Tomé medicamento','💊');
  if(/(temblor|tiembl)/.test(t)) return registrar('sintoma','Temblor','〰️');
  if(/(freezing|bloqueo|congel|me trab|pegad)/.test(t)) return registrar('sintoma','Bloqueo / freezing','🧊');
  if(/(rigid|tieso|duro|agarrotad)/.test(t)) return registrar('sintoma','Rigidez','🧱');
  if(/(discinesia|movimiento involunt)/.test(t)) return registrar('sintoma','Discinesia','🌀');
  if(/(off|apagad|me siento mal|sin efecto|decaíd|lento)/.test(t)) return registrar('off','Estoy en OFF (mal)','🟠');
  if(/(on|me siento bien|suelto|activ|mejor)/.test(t)) return registrar('on','Me siento ON (bien)','🟢');
  if(/(triste|ánimo|animo|deprim|bajón|mal humor)/.test(t)) return registrar('animo','Ánimo bajo','🌧️');
  if(/(dorm|sueñ|insomnio|desvel)/.test(t)) return registrar('sueno','Sobre el sueño: '+t,'😴');
  return registrar('nota', t.charAt(0).toUpperCase()+t.slice(1), '🗒️');
}
function initVoz(){
  const mic=document.getElementById('mic');
  const Recog = window.SpeechRecognition || window.webkitSpeechRecognition;
  if(!Recog){ mic.onclick=()=>{ document.getElementById('micLabel').textContent='Este navegador no oye. Usa los botones 👇'; }; return; }
  const rec=new Recog(); rec.lang='es-CL'; rec.continuous=false; rec.interimResults=false;
  let grabando=false;
  rec.onresult=e=>{ const txt=e.results[0][0].transcript; document.getElementById('micLabel').textContent='"'+txt+'"'; interpretar(txt); };
  rec.onerror=()=>{ document.getElementById('micLabel').textContent='No te escuché. Toca de nuevo o usa los botones.'; };
  rec.onend=()=>{ grabando=false; mic.classList.remove('grabando'); };
  mic.onclick=()=>{ if(grabando){ rec.stop(); return; }
    try{ rec.start(); grabando=true; mic.classList.add('grabando');
      document.getElementById('micLabel').textContent='Escuchando… habla ahora'; }catch(e){} };
}

/* ===========================================================================
   NAVEGACION + RENDER GLOBAL
   =========================================================================== */
function cambiarVista(v){
  vistaActual=v;
  ['hoy','reporte','ajustes'].forEach(x=>{
    document.getElementById('vista-'+x).classList.toggle('oculto', x!==v);
    document.getElementById('nav-'+x).classList.toggle('activo', x===v);
  });
  if(v==='reporte') renderReporte();
  if(v==='ajustes') renderAjustes();
  window.scrollTo(0,0);
}
function render(){
  renderDosis(); renderFranja(); renderRutina(); renderTimelineHoy();
  if(vistaActual==='reporte') renderReporte();
}

/* ---------- instalar PWA ---------- */
window.addEventListener('beforeinstallprompt', e=>{ e.preventDefault(); promptInstalar=e;
  const b=document.getElementById('btnInstalar'); if(b) b.classList.remove('oculto'); });
function instalarApp(){ if(!promptInstalar){ aviso('Para instalar: menú del navegador → "Agregar a pantalla de inicio".'); return; }
  promptInstalar.prompt(); promptInstalar=null; }

/* ---------- arranque ---------- */
function init(){
  document.getElementById('micLabel').textContent = MIC_HINT;
  aplicarConfig();
  initVoz();
  render();
  if(cfg.recordatorios) pedirPermisoNotif();
  setInterval(()=>{ renderDosis(); chequearRecordatorios(); }, 30000);
  if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});
}
document.addEventListener('DOMContentLoaded', init);
