'use strict';

function buildDatesChips(dispatch){
  const days         = Array.isArray(dispatch.days) ? dispatch.days : [1,2,3,4,5];
  const cutHour      = dispatch.cutHour||'23:59';
  const anticipation = parseInt(dispatch.anticipation)||0;
  const DAY_SHORT    = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  const MON_SHORT    = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

  const now   = new Date();
  const [ch,cm] = cutHour.split(':').map(Number);
  let start = new Date(now);
  start.setHours(0,0,0,0);
  start.setDate(start.getDate()+anticipation);
  const nowMins = now.getHours()*60+now.getMinutes();
  const cutMins = (ch||0)*60+(cm||0);
  if(nowMins>=cutMins) start.setDate(start.getDate()+1);

  const dates=[];
  let probe=new Date(start);
  for(let i=0;i<30&&dates.length<7;i++){
    if(!days.length||days.includes(probe.getDay())) dates.push(new Date(probe));
    probe.setDate(probe.getDate()+1);
  }

  if(!dates.length) return '<div style="color:var(--text2);font-size:13px">No hay fechas disponibles</div>';

  return dates.map(d=>{
    const iso  = isoDate(d);
    const dayN = DAY_SHORT[d.getDay()];
    const num  = d.getDate();
    const mon  = MON_SHORT[d.getMonth()];
    return `<div class="date-opt" id="dopt_${iso}" onclick="selDate('${iso}','${dayN} ${num} ${mon}')">
      <div class="d-day">${dayN}</div>
      <div class="d-num">${num}</div>
      <div class="d-mon">${mon}</div>
    </div>`;
  }).join('');
}

function selDate(iso, lbl){
  const ev = window.event;
  const nueva = iso!==selDateIso && !!(ev && ev.isTrusted);
  selDateIso=iso; selDateLbl=lbl;
  document.querySelectorAll('.date-opt').forEach(el=>el.classList.remove('active'));
  const el=$('dopt_'+iso);
  if(el) el.classList.add('active');
  $('err_date')&&$('err_date').classList.remove('show');
  const ok=$('dateOk');
  if(ok){
    let txt='';
    try{ txt=new Date(iso+'T12:00:00').toLocaleDateString('es-PE',{weekday:'long',day:'numeric',month:'long'}).replace(',',''); }catch(e){ txt=lbl; }
    ok.textContent='📦 Tu pedido sale el '+txt;
    ok.classList.remove('on'); void ok.offsetWidth; ok.classList.add('on');
  }
  if(nueva){ _ttPop(el); _ttVibrar(); _ttBrillo($('confirmBtn')); }
}
function _ttPop(el){ if(!el) return; el.classList.remove('tt-pop'); void el.offsetWidth; el.classList.add('tt-pop'); }
function _ttBrillo(b){ if(!b) return; b.classList.remove('tt-brillo'); void b.offsetWidth; b.classList.add('tt-brillo'); setTimeout(function(){ b.classList.remove('tt-brillo'); }, 1000); }
function _ttVibrar(){
  try{
    if(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if(navigator.vibrate) navigator.vibrate(12);
  }catch(e){}
}
