import { useState, useMemo, useRef, useEffect } from "react";
import * as XLSX from "xlsx";

const MONTHS_RU = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];
const DAYS_RU   = ["Пн","Вт","Ср","Чт","Пт","Сб","Вс"];
const C = { bg:"#F4F7FA",card:"#fff",primary:"#1A3F5C",sub:"#2D6A9F",border:"#E0E8F0",muted:"#6B8090",red:"#E74C3C",green:"#27AE60",amber:"#F39C12" };
const COLORS = ["#B5D4F4","#C5E0A0","#FDE8A0","#FBC84A","#D9D6F5","#FAC775","#B8E8D0","#7DC8A8","#DDE8D0","#F7C1C1","#EEECEA","#E8D5F5"];
const WORK_TYPES = ["ТО","Мех. работы","Диагностика","Электро-работы","Chip Tuning","Сложный ремонт","Видеорегистратор","Заправка кондей","Установка фар","Другое"];
const DURATIONS  = [0.5,1,1.5,2,2.5,3,3.5,4,4.5,5,5.5,6,7,8,9,10,12,14,16,18,20,24,28,32,36,40,48,56,64,72];
const HOURS_LIST = [8,8.5,9,9.5,10,10.5,11,11.5,12,12.5,13,13.5,14,14.5,15,15.5,16,16.5,17,17.5,18];
const DAY_START=8, DAY_END=19, STEP=0.5, PPH=54;

const INIT_STAFF = [
  { id:"leg", name:"Лег", role:"Механик", emoji:"🔧", daysPerWeek:6, hoursDay:8, lunch:1,
    color:"#B5D4F4", textColor:"#0C447C", workDays:[1,2,3,4,5,6], slots:[
      {id:"l1",label:"ТО — слот 1",      startTime:9,   hours:1.5,color:"#B5D4F4",textColor:"#0C447C",eff:true},
      {id:"l2",label:"ТО — слот 2",      startTime:10.5,hours:1.5,color:"#B5D4F4",textColor:"#0C447C",eff:true},
      {id:"l3",label:"Мех. работы 1",    startTime:13,  hours:1,  color:"#C5E0A0",textColor:"#27500A",eff:true},
      {id:"l4",label:"Мех. работы 2",    startTime:15,  hours:1,  color:"#C5E0A0",textColor:"#27500A",eff:true},
      {id:"l5",label:"Мех. работы 3",    startTime:17,  hours:1,  color:"#C5E0A0",textColor:"#27500A",eff:true},
      {id:"l6",label:"Буфер",            startTime:14,  hours:1,  color:"#EEECEA",textColor:"#666",   eff:false},
    ]},
  { id:"yuda", name:"Юда", role:"Механик-электрик", emoji:"⚡", daysPerWeek:6, hoursDay:8, lunch:1,
    color:"#B8E8D0", textColor:"#085041", workDays:[1,2,3,4,5,6], slots:[
      {id:"y1",label:"Работы до обеда",   startTime:9,  hours:3,color:"#B8E8D0",textColor:"#085041",eff:true},
      {id:"y2",label:"Работы после обеда",startTime:13, hours:3,color:"#7DC8A8",textColor:"#064030",eff:true},
      {id:"y3",label:"Буфер",             startTime:16, hours:2,color:"#EEECEA",textColor:"#666",   eff:false},
    ]},
  { id:"kirill", name:"Кирилл", role:"Партнёр, электрик", emoji:"🔌", daysPerWeek:5, hoursDay:8, lunch:1,
    color:"#FDE8A0", textColor:"#5A3C00", workDays:[1,2,3,4,5], slots:[
      {id:"k1",label:"Диагностика",       startTime:9,   hours:1.5,color:"#FDE8A0",textColor:"#5A3C00",eff:true},
      {id:"k2",label:"Электро-работы 1",  startTime:10.5,hours:1.5,color:"#FAC775",textColor:"#633806",eff:true},
      {id:"k3",label:"Электро-работы 2",  startTime:13,  hours:1.5,color:"#FAC775",textColor:"#633806",eff:true},
      {id:"k4",label:"Буфер",             startTime:14.5,hours:1.5,color:"#EEECEA",textColor:"#666",   eff:false},
      {id:"k5",label:"Надзор за цехом",   startTime:16,  hours:2,  color:"#DDE8D0",textColor:"#2A4F1A",eff:false},
    ]},
  { id:"alex", name:"Алекс К.", role:"Партнёр, чип-тюнинг", emoji:"💻", daysPerWeek:5, hoursDay:8, lunch:1,
    color:"#D9D6F5", textColor:"#26215C", workDays:[1,2,3,4,5], slots:[
      {id:"a1",label:"Сложная диагностика",startTime:9,   hours:2.5,color:"#FBC84A",textColor:"#5A3C00",eff:true},
      {id:"a2",label:"Сложный ремонт",     startTime:13,  hours:2.5,color:"#D9D6F5",textColor:"#26215C",eff:true},
      {id:"a3",label:"Буфер",              startTime:15.5,hours:2.5,color:"#EEECEA",textColor:"#666",   eff:false},
    ]},
];

const fmt  = h=>`${String(Math.floor(h)).padStart(2,"0")}:${Math.round((h%1)*60)===0?"00":"30"}`;
const fmtH = h=>h<1?`${h*60}мин`:`${h}ч`;
const snap = h=>Math.round(h/STEP)*STEP;
// Перенос текста максимум на 2 строки, дальше «…»
const clamp2 = {display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden",wordBreak:"break-word"};
const clamp= (v,a,b)=>Math.max(a,Math.min(b,v));
// Пхукет = Asia/Bangkok = UTC+7
const TZ = 'Asia/Bangkok';
const today= ()=>{
  const now=new Date();
  // Получаем дату в Bangkok timezone
  const bkk=new Date(now.toLocaleString('en-US',{timeZone:TZ}));
  bkk.setHours(0,0,0,0);
  return bkk;
};

// ── API layer ─────────────────────────────────────────────────────────────────
const API = '/.netlify/functions';
async function apiGet(path) {
  const r = await fetch(API+path);
  return r.json();
}
async function apiPost(path, body) {
  const r = await fetch(API+path, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  return r.json();
}
async function apiDelete(path, body) {
  const r = await fetch(API+path, {method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  return r.json();
}
const addDays=(d,n)=>{const r=new Date(d);r.setDate(r.getDate()+n);return r;};
const isSameDay=(a,b)=>a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate();
const dayKey=d=>`${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
const bKey=(sid,date,slid)=>`${sid}__${dayKey(date)}__${slid}`;
const uid=()=>"s"+Math.random().toString(36).slice(2,7);
const calcStaff=s=>{
  const wh=s.daysPerWeek*s.hoursDay,lw=s.daysPerWeek*s.lunch,av=wh-lw;
  const ew=s.slots.reduce((a,sl)=>a+(sl.eff?sl.hours*s.daysPerWeek:0),0);
  return {wh,lw,av,ew,em:ew*4,mh:wh*4,kpd:av>0?Math.round(ew/av*100):0};
};
const kc=k=>k<70?{bg:C.green,l:"норма"}:k<85?{bg:C.amber,l:"цель"}:{bg:C.red,l:"перегруз"};
const buildSlots=s=>s.slots.map(sl=>({
  id:sl.id,label:sl.label,color:sl.color,textColor:sl.textColor,
  eff:sl.eff,start:sl.startTime,end:sl.startTime+sl.hours,srcId:sl.id,
})).sort((a,b)=>a.start-b.start);

// ── SMART SLOT FINDER (multi-day) ────────────────────────────────────────────
// Returns ALL free slots on a given day (respecting buffer rules within windows)
function getFreeSlotsForDay(staff, date, bookings) {
  const dow=(date.getDay()+6)%7+1;
  if(!staff.workDays.includes(dow)) return [];
  const allSlots=buildSlots(staff);
  const withStatus=allSlots.map(sl=>({
    ...sl, key:bKey(staff.id,date,sl.id), booked:!!bookings[bKey(staff.id,date,sl.id)], date,
  }));
  // Build windows separated by booked slots
  const windows=[];let cur=[];
  for(const sl of withStatus){
    if(sl.booked){if(cur.length){windows.push(cur);cur=[];}}
    else cur.push(sl);
  }
  if(cur.length)windows.push(cur);
  // Flatten free slots, tagging each with its window's buffer capacity
  const freeSlots=[];
  for(const win of windows){
    const totalBuf=win.filter(s=>!s.eff).reduce((a,s)=>a+(s.end-s.start),0);
    win.forEach(sl=>freeSlots.push({...sl,winTotalBuf:totalBuf}));
  }
  return freeSlots;
}

// Core multi-day search:
// Greedily picks free slots across days until effHours >= neededHours
// Buffer slots only used if eff shortfall <= 40% of that day's buffer total
// Collect available hours on one day (greedy, respecting buffer rules)
function collectDaySlots(staff, date, bookings, remaining) {
  const freeSlots=getFreeSlotsForDay(staff,date,bookings);
  if(!freeSlots.length) return null;

  // Rebuild windows by grouping by winTotalBuf
  const windows=[];let cur=[];
  for(let j=0;j<freeSlots.length;j++){
    if(j===0){cur.push(freeSlots[j]);}
    else{
      if(freeSlots[j].winTotalBuf===freeSlots[j-1].winTotalBuf){cur.push(freeSlots[j]);}
      else{windows.push(cur);cur=[freeSlots[j]];}
    }
  }
  if(cur.length)windows.push(cur);

  const chosen=[];let effH=0,bufH=0,rem=remaining;
  for(const win of windows){
    if(rem<=0)break;
    const maxBufUsable=win[0].winTotalBuf*0.4;
    let winBufUsed=0;
    for(const sl of win){
      if(rem<=0)break;
      const dur=sl.end-sl.start;
      if(sl.eff){
        chosen.push(sl);effH+=dur;rem-=dur;
      } else if(rem>0&&winBufUsed+dur<=maxBufUsable){
        chosen.push(sl);bufH+=dur;winBufUsed+=dur;rem-=dur;
      }
    }
  }
  if(!chosen.length)return null;
  return{date,slots:chosen,effH,bufH,remaining:rem};
}

// KEY LOGIC: find a CONSECUTIVE run of working days starting from startDate
// that covers neededHours in total. Days must be consecutive calendar days
// (non-working days like weekends break the chain — they are simply skipped
// since the staff doesn't work them, but we don't count them as "gaps").
// A "gap" = a calendar day where the staff WORKS but has NO free slots.
function findConsecutiveBooking(staff, startDate, neededHours, bookings, maxScan=90) {
  // Try each possible start day
  for(let startOffset=0; startOffset<maxScan; startOffset++){
    const firstDay=addDays(startDate, startOffset);
    const dow=(firstDay.getDay()+6)%7+1;
    // Must start on a working day that has free slots
    if(!staff.workDays.includes(dow)) continue;
    const firstResult=collectDaySlots(staff,firstDay,bookings,neededHours);
    if(!firstResult) continue; // no free slots on this day — try next

    // We have a valid first day. Now extend to consecutive working days.
    let remaining=neededHours - firstResult.effH - firstResult.bufH;
    const plan=[{date:firstDay,slots:firstResult.slots,effH:firstResult.effH,bufH:firstResult.bufH}];

    if(remaining<=0) return plan; // fits in 1 day

    // Walk forward calendar days — skip non-working days (they don't break chain)
    // but if a WORKING day has zero free slots → chain is broken, restart
    let calOffset=1;
    while(remaining>0 && calOffset<=maxScan){
      const nextDay=addDays(firstDay, calOffset);
      calOffset++;
      const nextDow=(nextDay.getDay()+6)%7+1;
      if(!staff.workDays.includes(nextDow)) continue; // weekend / day off — skip, don't break chain

      const dayResult=collectDaySlots(staff,nextDay,bookings,remaining);
      if(!dayResult){
        // This working day has no free slots → chain broken → abort this start
        plan.length=0; break;
      }
      plan.push({date:nextDay,slots:dayResult.slots,effH:dayResult.effH,bufH:dayResult.bufH});
      remaining -= dayResult.effH + dayResult.bufH;
    }

    if(plan.length>0 && remaining<=0) return plan;
    // Otherwise: continue outer loop to try next start day
  }
  return null;
}

// Generate up to 3 options with different consecutive start dates
function findBookingOptions(staff, startDate, neededHours, bookings) {
  const options=[];
  const usedStarts=new Set();
  let scanOffset=0;

  while(options.length<3 && scanOffset<90){
    const tryStart=addDays(startDate,scanOffset);
    const dow=(tryStart.getDay()+6)%7+1;
    if(!staff.workDays.includes(dow)){ scanOffset++;continue; }

    const plan=findConsecutiveBooking(staff,tryStart,neededHours,bookings);
    if(plan&&plan.length>0){
      const key=dayKey(plan[0].date);
      if(!usedStarts.has(key)){
        usedStarts.add(key);
        options.push(plan);
        // Next option: skip past the end of this plan to avoid overlapping
        const lastDay=plan[plan.length-1].date;
        scanOffset=Math.ceil((lastDay-startDate)/(86400000))+1;
        continue;
      }
    }
    scanOffset++;
  }
  return options;
}

// ── ЦЕПОЧКА МАСТЕРОВ (последовательно) ────────────────────────────────────────
// Набирает свободные рабочие слоты дня (начиная не раньше minStart) на need часов.
// Слоты могут идти НЕ подряд (через обед) — так длинные работы помещаются в день.
// used — ключи уже занятых цепочкой слотов.
function findRun(free, need, minStart, used){
  const eff=free.filter(s=>s.eff&&!used.has(s.key)&&s.start>=minStart-1e-9).sort((a,b)=>a.start-b.start);
  let sum=0;const run=[];
  for(const s of eff){
    run.push(s);sum+=s.end-s.start;
    if(sum+1e-9>=need)return{slots:run,startH:run[0].start,endH:run[run.length-1].end};
  }
  return null;
}
// steps=[{staffId,work,hours}] → расписание [{staffId,staff,work,hours,date,slots,startH,endH}] или null
function findChain(steps, startDate, bookings, staffList, maxGapH=6, maxScan=120){
  const schedule=[];const used=new Set();let cursor=null; // {date,endH}
  for(const step of steps){
    const staff=staffList.find(s=>s.id===step.staffId);
    if(!staff)return null;
    const need=step.hours;let placed=null;
    const base=cursor?cursor.date:startDate;
    for(let off=0;off<maxScan;off++){
      const day=addDays(base,off);
      const dow=(day.getDay()+6)%7+1;
      if(!staff.workDays.includes(dow))continue;
      const free=getFreeSlotsForDay(staff,day,bookings);
      if(!free.length)continue;
      const sameDay=cursor&&isSameDay(day,cursor.date);
      const minStart=sameDay?cursor.endH:DAY_START;
      const run=findRun(free,need,minStart,used);
      if(!run)continue;
      if(sameDay&&(run.startH-cursor.endH)>maxGapH+1e-9)continue; // пауза больше лимита → следующий день
      placed={date:day,slots:run.slots,startH:run.startH,endH:run.endH};
      break;
    }
    if(!placed)return null;
    placed.slots.forEach(sl=>used.add(bKey(step.staffId,placed.date,sl.id)));
    schedule.push({staffId:step.staffId,staff,work:step.work,hours:need,date:placed.date,slots:placed.slots,startH:placed.startH,endH:placed.endH});
    cursor={date:placed.date,endH:placed.endH};
  }
  return schedule;
}
// Расписание цепочки → массив броней для confirmMulti
function chainToBookData(schedule, base){
  const grp=uid();const total=schedule.reduce((a,st)=>a+st.slots.length,0);
  const days=new Set(schedule.map(st=>dayKey(st.date))).size;
  let gi=0;const out=[];
  schedule.forEach(st=>{
    st.slots.forEach(sl=>{
      out.push({key:bKey(st.staffId,st.date,sl.id),data:{
        ...base,work:st.work,startH:sl.start,dur:sl.end-sl.start,color:sl.color,endH:sl.end,
        multiGroup:grp,isContinuation:gi>0,totalSlots:total,slotIndex:gi,bookingDays:days,
      }});
      gi++;
    });
  });
  return out;
}
// До `count` ближайших вариантов цепочки с разными датами старта
function findChainOptions(steps, startDate, bookings, staffList, count=3){
  const opts=[];const usedStarts=new Set();let off=0;
  while(opts.length<count && off<120){
    const sch=findChain(steps, addDays(startDate,off), bookings, staffList);
    if(!sch){off++;continue;}
    const key=dayKey(sch[0].date);
    if(usedStarts.has(key)){off++;continue;}
    usedStarts.add(key);opts.push(sch);
    off=Math.max(off+1, Math.round((sch[0].date-startDate)/86400000)+1);
  }
  return opts;
}

// ── SMART BOOKING MODAL ───────────────────────────────────────────────────────
function ChainSteps({allStaff, steps, setSteps, inp, lb}){
  const add=()=>setSteps([...steps,{staffId:(allStaff[0]||{}).id,work:"ТО",hours:1.5}]);
  const upd=(i,p)=>setSteps(steps.map((s,j)=>j===i?{...s,...p}:s));
  const rm=(i)=>setSteps(steps.filter((_,j)=>j!==i));
  return(<div>
    {lb&&lb("Мастера и работы (по порядку)")}
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      {steps.map((st,i)=>(
        <div key={i} style={{background:"#F7FAFD",border:`1px solid ${C.border}`,borderRadius:8,padding:8}}>
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
            <span style={{fontSize:11,fontWeight:800,color:C.sub}}>{i+1}.</span>
            <select value={st.staffId} onChange={e=>upd(i,{staffId:e.target.value})} style={{...inp,flex:1,cursor:"pointer",background:"#fff"}}>
              {allStaff.map(s=><option key={s.id} value={s.id}>{s.emoji} {s.name}</option>)}
            </select>
            {steps.length>1&&<button type="button" onClick={()=>rm(i)} style={{border:"none",background:"transparent",color:C.red,cursor:"pointer",fontSize:15,padding:"0 4px"}}>✕</button>}
          </div>
          <div style={{display:"flex",gap:6}}>
            <select value={st.work} onChange={e=>upd(i,{work:e.target.value})} style={{...inp,flex:2,cursor:"pointer",background:"#fff"}}>
              {WORK_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
            </select>
            <select value={st.hours} onChange={e=>upd(i,{hours:+e.target.value})} style={{...inp,flex:1,cursor:"pointer",background:"#FFFBEF",fontWeight:700}}>
              {DURATIONS.filter(d=>d<=8).map(d=><option key={d} value={d}>{d<1?d*60+" мин":d+" ч"}</option>)}
            </select>
          </div>
        </div>
      ))}
    </div>
    <button type="button" onClick={add} style={{marginTop:8,width:"100%",padding:"8px",border:`1.5px dashed ${C.sub}`,borderRadius:8,background:"transparent",color:C.sub,fontWeight:700,fontSize:12,cursor:"pointer"}}>＋ Добавить мастера</button>
  </div>);
}

function SmartBookingModal({staff,allStaff,startDate,initialSlot,bookings,onConfirm,onClose}){
  const list=allStaff||[staff];
  const [step,setStep]=useState(1);
  const [steps,setSteps]=useState([{staffId:staff.id,work:initialSlot?.label||"ТО",hours:initialSlot?(initialSlot.end-initialSlot.start):1.5}]);
  const [client,setClient]=useState("");
  const [car,setCar]=useState("");
  const [clientId,setClientId]=useState(null);
  const [carId,setCarId]=useState(null);
  const [status,setStatus]=useState("confirmed");
  const [notes,setNotes]=useState("");
  const [options,setOptions]=useState(null);
  const [chosen,setChosen]=useState(0);
  const [searching,setSearching]=useState(false);

  const inp={border:`1.5px solid ${C.border}`,borderRadius:8,padding:"8px 10px",fontSize:12,width:"100%",fontFamily:"inherit",outline:"none",boxSizing:"border-box"};
  const lb=t=><label style={{fontSize:10,fontWeight:700,color:C.muted,textTransform:"uppercase",display:"block",marginBottom:4}}>{t}</label>;
  const doSearch=()=>{
    if(!client.trim())return alert("Введите имя клиента");
    setSearching(true);
    setTimeout(()=>{
      const opts=findChainOptions(steps,startDate,bookings,list);
      setSearching(false);
      if(!opts.length){alert("Не удалось построить цепочку в ближайшие ~4 месяца. Попробуйте меньше времени/этапов или другую дату.");return;}
      setOptions(opts);setChosen(0);setStep(2);
    },200);
  };
  const doConfirm=()=>{if(options&&options[chosen])onConfirm(chainToBookData(options[chosen],{client,car,clientId,carId,status,notes}));};

  if(step===1)return(
    <div style={{position:"fixed",inset:0,background:"rgba(26,63,92,0.55)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:12,overflowY:"auto"}}>
      <div style={{background:C.card,borderRadius:16,width:"100%",maxWidth:460,boxShadow:"0 8px 40px rgba(26,63,92,0.25)",overflow:"hidden",margin:"auto"}}>
        <div style={{background:staff.color,padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div>
            <div style={{fontWeight:800,fontSize:14,color:staff.textColor}}>🔧 Запись — цепочка мастеров</div>
            <div style={{fontSize:11,color:staff.textColor,opacity:0.8}}>Этапы встанут во времени друг за другом</div>
          </div>
          <button onClick={onClose} style={{background:"rgba(0,0,0,0.12)",border:"none",borderRadius:8,width:30,height:30,cursor:"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center",color:staff.textColor}}>×</button>
        </div>
        <div style={{padding:16,display:"flex",flexDirection:"column",gap:11}}>
          <ChainSteps allStaff={list} steps={steps} setSteps={setSteps} inp={inp} lb={lb}/>
          <ClientCarPicker client={client} car={car} clientId={clientId} carId={carId} inp={inp} autoFocus
            onChange={p=>{if('client'in p)setClient(p.client);if('car'in p)setCar(p.car);if('clientId'in p)setClientId(p.clientId);if('carId'in p)setCarId(p.carId);}}/>
          <div>{lb("Заметки")}<textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={2} style={{...inp,resize:"vertical"}}/></div>
          <div>{lb("Статус")}<div style={{display:"flex",gap:6}}>
            {[["confirmed","✅ Подтверждён",C.green],["pending","⏳ Ожидание",C.amber],["cancelled","❌ Отменён",C.red]].map(([v,l,col])=>(
              <button key={v} onClick={()=>setStatus(v)} style={{flex:1,padding:"6px 2px",border:`2px solid ${status===v?col:C.border}`,borderRadius:7,background:status===v?col+"22":"transparent",color:status===v?col:C.muted,fontSize:10,fontWeight:600,cursor:"pointer"}}>{l}</button>
            ))}
          </div></div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={onClose} style={{flex:1,padding:"10px 0",border:`1px solid ${C.border}`,borderRadius:8,background:"#F0F4F8",color:C.primary,cursor:"pointer",fontWeight:600}}>Отмена</button>
            <button onClick={doSearch} disabled={searching}
              style={{flex:2,padding:"10px 0",border:"none",borderRadius:8,background:C.primary,color:"#fff",cursor:"pointer",fontWeight:700,opacity:searching?0.7:1}}>
              {searching?"🔍 Ищу слоты...":"🔍 Найти слоты →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const opts=options||[]; const sch=opts[chosen]||[]; const days=new Set(sch.map(s=>dayKey(s.date))).size;
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(26,63,92,0.55)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:12,overflowY:"auto"}}>
      <div style={{background:C.card,borderRadius:16,width:"100%",maxWidth:520,boxShadow:"0 8px 40px rgba(26,63,92,0.25)",overflow:"hidden",margin:"auto"}}>
        <div style={{background:C.primary,padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div>
            <div style={{fontWeight:800,fontSize:14,color:"#fff"}}>{client}{car?` · ${car}`:""}</div>
            <div style={{fontSize:11,color:"#9BB8D0",marginTop:1}}>{sch.length} этап(ов) · {days} дн.{opts.length>1?` · вариант ${chosen+1} из ${opts.length}`:""}</div>
          </div>
          <button onClick={onClose} style={{background:"rgba(255,255,255,0.15)",border:"none",borderRadius:8,width:30,height:30,cursor:"pointer",fontSize:18,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
        </div>
        <div style={{padding:16,maxHeight:"75vh",overflowY:"auto"}}>
          {opts.length>1&&<div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap"}}>
            {opts.map((o,i)=>{const f=o[0].date,l=o[o.length-1].date,multi=!isSameDay(f,l);return(
              <button key={i} onClick={()=>setChosen(i)} style={{flex:"1 1 30%",minWidth:110,padding:"7px 9px",borderRadius:10,border:`2px solid ${chosen===i?C.primary:C.border}`,background:chosen===i?"#EAF2FF":"#FAFBFC",cursor:"pointer",textAlign:"left"}}>
                <div style={{fontSize:12,fontWeight:800,color:C.primary}}>{f.toLocaleDateString("ru",{day:"numeric",month:"short"})}{multi?` → ${l.toLocaleDateString("ru",{day:"numeric",month:"short"})}`:""}</div>
                <div style={{fontSize:9,color:C.muted}}>{f.toLocaleDateString("ru",{weekday:"short"})} · {o.length} эт.</div>
              </button>);})}
          </div>}
          <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:14}}>
            {sch.map((st,i)=>{
              const prev=sch[i-1];
              const sameDay=prev&&isSameDay(prev.date,st.date);
              const gap=sameDay?(st.startH-prev.endH):null;
              return(<div key={i}>
                {gap!==null&&gap>0.01&&<div style={{fontSize:10,color:C.amber,textAlign:"center",margin:"3px 0"}}>⏳ пауза {fmtH(gap)}</div>}
                {prev&&!sameDay&&<div style={{fontSize:10,color:C.sub,textAlign:"center",margin:"3px 0"}}>↓ следующий рабочий день</div>}
                <div style={{border:`1.5px solid ${C.border}`,borderRadius:10,padding:"10px 12px",display:"flex",alignItems:"center",gap:10}}>
                  <div style={{width:28,height:28,borderRadius:8,background:st.staff.color,color:st.staff.textColor,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,flexShrink:0}}>{st.staff.emoji}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:700,color:C.primary}}>{st.staff.name} · {st.work}</div>
                    <div style={{fontSize:11,color:C.muted}}>{st.date.toLocaleDateString("ru",{weekday:"short",day:"numeric",month:"long"})}</div>
                  </div>
                  <div style={{fontSize:12,fontWeight:800,color:C.sub,whiteSpace:"nowrap"}}>{fmt(st.startH)}–{fmt(st.endH)}</div>
                </div>
              </div>);
            })}
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>setStep(1)} style={{flex:1,padding:"10px 0",border:`1px solid ${C.border}`,borderRadius:8,background:"#F0F4F8",color:C.primary,cursor:"pointer",fontWeight:600}}>← Изменить</button>
            <button onClick={doConfirm} style={{flex:2,padding:"10px 0",border:"none",borderRadius:8,background:C.green,color:"#fff",cursor:"pointer",fontWeight:700,fontSize:13}}>✅ Подтвердить запись</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── SINGLE SLOT MODAL ─────────────────────────────────────────────────────────
function SlotModal({staff,date,slot,existing,onSave,onDelete,onClose}){
  const [client,setClient]=useState(existing?.client||"");
  const [car,setCar]=useState(existing?.car||"");
  const [clientId,setClientId]=useState(existing?.clientId||null);
  const [carId,setCarId]=useState(existing?.carId||null);
  const [work,setWork]=useState(existing?.work||slot.label);
  const [workOther,setWorkOther]=useState("");
  const [status,setStatus]=useState(existing?.status||"confirmed");
  const [notes,setNotes]=useState(existing?.notes||"");
  const inp={border:`1.5px solid ${C.border}`,borderRadius:8,padding:"8px 10px",fontSize:12,width:"100%",fontFamily:"inherit",outline:"none",boxSizing:"border-box"};
  const lb=t=><label style={{fontSize:10,fontWeight:700,color:C.muted,textTransform:"uppercase",display:"block",marginBottom:4}}>{t}</label>;
  const finalWork=work==="Другое"?workOther:work;
  const isCont=existing?.isContinuation;
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(26,63,92,0.55)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:12,overflowY:"auto"}}>
      <div style={{background:C.card,borderRadius:16,width:"100%",maxWidth:420,boxShadow:"0 8px 40px rgba(26,63,92,0.25)",overflow:"hidden",margin:"auto"}}>
        <div style={{background:slot.color,padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div>
            <div style={{fontWeight:800,fontSize:13,color:slot.textColor}}>{staff.emoji} {staff.name} — {slot.label}</div>
            <div style={{fontSize:11,color:slot.textColor,opacity:0.8}}>
              {date.toLocaleDateString("ru",{weekday:"long",day:"numeric",month:"long"})} · {fmt(slot.start)}–{fmt(slot.end)}
              {isCont&&<span style={{marginLeft:8,background:"rgba(0,0,0,0.12)",borderRadius:4,padding:"1px 5px",fontSize:9}}>Продолжение</span>}
            </div>
          </div>
          <button onClick={onClose} style={{background:"rgba(0,0,0,0.12)",border:"none",borderRadius:8,width:28,height:28,cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",color:slot.textColor}}>×</button>
        </div>
        <div style={{padding:14,display:"flex",flexDirection:"column",gap:10}}>
          {isCont&&<div style={{background:"#FFF8E8",borderRadius:6,padding:"6px 10px",fontSize:10,color:"#5A3C00"}}>⛓ Слот {existing.slotIndex+1} из {existing.totalSlots} в групповом заказе.</div>}
          <div style={{background:"#F0F7FF",borderRadius:6,padding:"5px 10px",fontSize:10,color:C.sub}}>
            Время слота: <b>{fmt(slot.start)}–{fmt(slot.end)}</b> · {slot.end-slot.start}ч · {slot.eff?"рабочий":"буфер"}
          </div>
          <div>{lb("Тип работы")}
            <select value={work} onChange={e=>setWork(e.target.value)} style={{...inp,background:"#fff"}}>
              {WORK_TYPES.map(t=><option key={t} value={t}>{t}</option>)}<option value="Другое">Другое...</option>
            </select>
            {work==="Другое"&&<input value={workOther} onChange={e=>setWorkOther(e.target.value)} style={{...inp,marginTop:6}}/>}
          </div>
          <ClientCarPicker client={client} car={car} clientId={clientId} carId={carId} inp={inp} autoFocus
            onChange={p=>{if('client'in p)setClient(p.client);if('car'in p)setCar(p.car);if('clientId'in p)setClientId(p.clientId);if('carId'in p)setCarId(p.carId);}}/>
          <div>{lb("Заметки")}<textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={2} style={{...inp,resize:"vertical"}}/></div>
          <div>{lb("Статус")}<div style={{display:"flex",gap:5}}>
            {[["confirmed","✅ Подтверждён",C.green],["pending","⏳ Ожидание",C.amber],["cancelled","❌ Отменён",C.red]].map(([v,l,col])=>(
              <button key={v} onClick={()=>setStatus(v)} style={{flex:1,padding:"5px 2px",border:`2px solid ${status===v?col:C.border}`,borderRadius:7,background:status===v?col+"22":"transparent",color:status===v?col:C.muted,fontSize:9,fontWeight:600,cursor:"pointer"}}>{l}</button>
            ))}
          </div></div>
          <div style={{display:"flex",gap:8}}>
            {!!existing&&<button onClick={onDelete} style={{padding:"8px 10px",border:`1px solid ${C.red}`,borderRadius:8,background:"transparent",color:C.red,cursor:"pointer",fontWeight:600}}>🗑</button>}
            <button onClick={onClose} style={{flex:1,padding:"8px 0",border:`1px solid ${C.border}`,borderRadius:8,background:"#F0F4F8",color:C.primary,cursor:"pointer",fontWeight:600}}>Отмена</button>
            <button onClick={()=>{if(!client.trim())return alert("Введите имя");onSave({client,car,clientId,carId,work:finalWork,status,notes,startH:slot.start,dur:slot.end-slot.start,color:slot.color,endH:slot.end});}}
              style={{flex:2,padding:"8px 0",border:"none",borderRadius:8,background:C.primary,color:"#fff",cursor:"pointer",fontWeight:700}}>{existing?"Сохранить":"Записать"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── DAY BAR ───────────────────────────────────────────────────────────────────
function DayBar({staff,date,bookings,onSlotClick,compact=false}){
  const dow=(date.getDay()+6)%7+1,works=staff.workDays.includes(dow);
  const slots=buildSlots(staff),total=DAY_END-DAY_START;
  const isPast=date<today()&&!isSameDay(date,today());
  if(!works)return(<div style={{height:compact?18:26,background:"#F2F2F2",borderRadius:4,display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{fontSize:8,color:C.muted,fontStyle:"italic"}}>выходной</span></div>);
  return(<div style={{position:"relative",height:compact?18:30,background:"#EEF2F6",borderRadius:4,overflow:"hidden"}}>
    <div style={{position:"absolute",left:`${(12-DAY_START)/total*100}%`,width:`${1/total*100}%`,top:0,bottom:0,background:"#D3D1C7",zIndex:1}}/>
    {slots.map(sl=>{
      const k=bKey(staff.id,date,sl.id),bk=bookings[k];
      const left=(sl.start-DAY_START)/total*100,width=(sl.end-sl.start)/total*100;
      return(<div key={sl.id} onClick={()=>!isPast&&onSlotClick(staff,sl,date,bk,k)}
        title={`${sl.label} ${fmt(sl.start)}–${fmt(sl.end)}${bk?"\n"+bk.client+(bk.isContinuation?" ⛓":""):""}`}
        style={{position:"absolute",left:`${left}%`,width:`${width}%`,top:2,bottom:2,
          background:bk?sl.color:sl.color+(sl.eff?"77":"33"),borderRadius:3,
          border:bk?`2px solid ${sl.color}`:`1px dashed ${sl.color}88`,
          cursor:isPast?"default":"pointer",zIndex:2,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden"}}
        onMouseEnter={e=>!isPast&&(e.currentTarget.style.opacity="0.8")}
        onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
        {!compact&&bk&&<div style={{padding:"0 3px",overflow:"hidden",textAlign:"center"}}>
          <div style={{fontSize:8,fontWeight:700,color:sl.textColor,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{bk.client}{bk.isContinuation?" ⛓":""}</div>
          {!bk.isContinuation&&<div style={{fontSize:7,color:sl.textColor,opacity:0.8}}>{bk.work}</div>}
        </div>}
        {!compact&&!bk&&<div style={{fontSize:7,color:sl.textColor,opacity:0.6,padding:"0 2px",textAlign:"center"}}>{sl.label}</div>}
      </div>);
    })}
  </div>);
}

// ── MONTH VIEW ────────────────────────────────────────────────────────────────
// ── BATTERY: загрузка сотрудника за день ──────────────────────────────────────
// Норма = сумма часов рабочих (eff) слотов; загрузка = часы броней (кроме отменённых)
function Battery({staff,date,bookings}){
  let norm=0,load=0;
  buildSlots(staff).forEach(sl=>{
    if(!sl.eff)return;
    const dur=sl.end-sl.start;norm+=dur;
    const bk=bookings[bKey(staff.id,date,sl.id)];
    if(bk&&bk.status!=="cancelled")load+=dur;
  });
  if(norm<=0)return null;
  const ratio=clamp(load/norm,0,1),pct=Math.round(ratio*100);
  const col=ratio>=0.85?C.green:C.sub;
  const r1=h=>Math.round(h*10)/10;
  return(<div style={{display:"flex",alignItems:"center",gap:4}}>
    <span style={{fontSize:9,flexShrink:0}}>{staff.emoji}</span>
    <div style={{flex:1,display:"flex",alignItems:"center",minWidth:0}}>
      <div style={{flex:1,height:11,border:`1.5px solid ${col}66`,borderRadius:3,background:"#EEF1F4",position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",left:0,top:0,bottom:0,width:`${pct}%`,background:col,borderRadius:1,transition:"width 0.25s"}}/>
      </div>
      <div style={{width:2.5,height:5,background:`${col}66`,borderRadius:1,marginLeft:1,flexShrink:0}}/>
    </div>
    <span style={{fontSize:8,fontWeight:700,color:col,flexShrink:0}}>{r1(load)}/{r1(norm)}</span>
  </div>);
}

function MonthView({staff,bookings,onDayClick,currentDate,activeStaffId}){
  const year=currentDate.getFullYear(),month=currentDate.getMonth();
  const fd=new Date(year,month,1),ld=new Date(year,month+1,0),sd=(fd.getDay()+6)%7,td=today();
  const weeks=[];let w=Array(sd).fill(null);
  for(let d=1;d<=ld.getDate();d++){w.push(new Date(year,month,d));if(w.length===7){weeks.push(w);w=[];}}
  if(w.length){while(w.length<7)w.push(null);weeks.push(w);}
  const vis=activeStaffId==="all"?staff:staff.filter(s=>s.id===activeStaffId);
  return(<div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:4}}>
      {DAYS_RU.map(d=><div key={d} style={{textAlign:"center",fontSize:10,fontWeight:700,color:C.muted,padding:"3px 0"}}>{d}</div>)}
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4}}>
      {weeks.flat().map((date,i)=>{
        if(!date)return<div key={i} style={{minHeight:80}}/>;
        const isPast=date<td&&!isSameDay(date,td),isToday=isSameDay(date,td);
        const dow=(date.getDay()+6)%7+1,ws=vis.filter(s=>s.workDays.includes(dow));
        return(<div key={i} onClick={()=>onDayClick(date)}
          style={{minHeight:90,borderRadius:8,background:isToday?"#EAF2FF":isPast?"#F8F8F8":C.card,border:`1.5px solid ${isToday?C.sub:C.border}`,padding:"5px 6px",cursor:"pointer"}}
          onMouseEnter={e=>!isPast&&(e.currentTarget.style.boxShadow="0 2px 8px rgba(26,63,92,0.1)")}
          onMouseLeave={e=>e.currentTarget.style.boxShadow="none"}>
          <div style={{fontSize:12,fontWeight:isToday?800:500,color:isToday?C.sub:isPast?C.muted:C.primary,marginBottom:3}}>{date.getDate()}</div>
          {ws.length>0&&<div style={{opacity:isPast?0.5:1,display:"flex",flexDirection:"column",gap:3,marginTop:1}}>
            {ws.map(s=><Battery key={s.id} staff={s} date={date} bookings={bookings}/>)}
          </div>}
        </div>);
      })}
    </div>
  </div>);
}

// ── WEEK VIEW ─────────────────────────────────────────────────────────────────
function WeekView({weekStart,staff,bookings,onDayClick,onSlotClick,activeStaffId}){
  const days=Array.from({length:7},(_,i)=>addDays(weekStart,i));
  const td=today(),filtered=activeStaffId==="all"?staff:staff.filter(s=>s.id===activeStaffId);
  return(<div style={{overflowX:"auto"}}>
    <div style={{display:"grid",gridTemplateColumns:`140px repeat(7,1fr)`,minWidth:940}}>
      <div style={{background:C.bg,borderBottom:`2px solid ${C.border}`,borderRight:`1px solid ${C.border}`,padding:"10px 8px"}}/>
      {days.map((d,i)=>{const isT=isSameDay(d,td),isPast=d<td&&!isT;return(
        <div key={i} onClick={()=>onDayClick(d)} style={{background:isT?"#EAF2FF":C.bg,padding:"8px 4px",textAlign:"center",borderBottom:`2px solid ${isT?C.sub:C.border}`,borderRight:`1px solid ${C.border}`,cursor:"pointer"}}>
          <div style={{fontSize:11,fontWeight:700,color:isT?C.sub:C.muted}}>{DAYS_RU[i]}</div>
          <div style={{fontSize:17,fontWeight:isT?800:500,color:isT?C.sub:isPast?C.muted:C.primary}}>{d.getDate()}</div>
        </div>
      );})}
      {filtered.map(s=>(<>
        <div key={s.id+"l"} style={{background:s.color+"33",padding:"10px 12px",borderBottom:`1px solid ${C.border}`,borderRight:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:7}}>
          <span style={{fontSize:18}}>{s.emoji}</span>
          <div><div style={{fontSize:12,fontWeight:700,color:C.primary}}>{s.name}</div><div style={{fontSize:9,color:C.muted}}>{s.role}</div></div>
        </div>
        {days.map((d,di)=>{
          const isPast=d<td&&!isSameDay(d,td),dow=(d.getDay()+6)%7+1,works=s.workDays.includes(dow);
          const items=[];
          if(works)buildSlots(s).forEach(sl=>{const bk=bookings[bKey(s.id,d,sl.id)];if(bk)items.push({sl,bk});});
          const hasActive=items.some(it=>it.bk.status!=="cancelled");
          const bg=!works?"#F0F0F0":hasActive?"#EAF7EE":(isPast?"#FAFAFA":C.card);
          return(<div key={di} onClick={()=>works&&!isPast&&onDayClick(d)}
            style={{borderBottom:`1px solid ${C.border}`,borderRight:`1px solid ${C.border}`,padding:"7px 8px",background:bg,minHeight:84,display:"flex",flexDirection:"column",cursor:works&&!isPast?"pointer":"default"}}>
            {!works?(
              <div style={{margin:"auto",fontSize:11,color:C.muted,fontStyle:"italic"}}>выходной</div>
            ):items.length===0?null:(
              <div style={{display:"flex",flexDirection:"column",gap:5}}>
                {items.map(({sl,bk})=>{
                  const cancelled=bk.status==="cancelled";
                  const icon=bk.status==="confirmed"?"✅":bk.status==="pending"?"⏳":"❌";
                  const work=bk.isContinuation?"Продолжение":(bk.work||sl.label);
                  return(<div key={sl.id} onClick={e=>{if(!isPast){e.stopPropagation();onSlotClick(s,sl,d,bk,bKey(s.id,d,sl.id));}}}
                    style={{...clamp2,fontSize:11,lineHeight:1.3,color:cancelled?C.muted:C.primary,textDecoration:cancelled?"line-through":"none",cursor:isPast?"default":"pointer"}}>
                    <span style={{marginRight:3}}>{icon}</span>
                    <span style={{color:C.muted,fontWeight:600}}>{fmt(sl.start)}</span>{" "}
                    <b>{bk.car||"—"}</b> — {work}
                  </div>);
                })}
              </div>
            )}
          </div>);
        })}
      </>))}
    </div>
  </div>);
}

// ── DAY VIEW ──────────────────────────────────────────────────────────────────
function DayView({date,staff,bookings,onSlotClick,activeStaffId}){
  const dow=(date.getDay()+6)%7+1;
  const filtered=(activeStaffId==="all"?staff:staff.filter(s=>s.id===activeStaffId)).filter(s=>s.workDays.includes(dow));
  if(!filtered.length)return<div style={{textAlign:"center",padding:40,color:C.muted,fontSize:14}}>В этот день никто не работает</div>;
  const HOURS=Array.from({length:DAY_END-DAY_START+1},(_,i)=>DAY_START+i);
  const isPast=date<today()&&!isSameDay(date,today());
  const toPx=h=>(h-DAY_START)*PPH;
  return(<div style={{overflowX:"auto"}}>
    <div style={{display:"grid",gridTemplateColumns:`44px repeat(${filtered.length},1fr)`,minWidth:Math.max(300,filtered.length*200+44)}}>
      <div style={{background:C.bg,borderBottom:`1px solid ${C.border}`}}/>
      {filtered.map(s=>{
        const slots=buildSlots(s),booked=slots.filter(sl=>bookings[bKey(s.id,date,sl.id)]).length;
        return(<div key={s.id} style={{background:s.color,padding:"10px 8px",textAlign:"center",borderBottom:`1px solid ${C.border}`,borderLeft:`1px solid ${C.border}`}}>
          <div style={{fontSize:20}}>{s.emoji}</div>
          <div style={{fontSize:12,fontWeight:700,color:s.textColor}}>{s.name}</div>
          <div style={{fontSize:9,color:s.textColor,opacity:0.75}}>{s.role}</div>
          <div style={{marginTop:5,fontSize:9,color:s.textColor,opacity:0.9}}>{booked}/{slots.length} слотов</div>
          <div style={{height:3,borderRadius:2,background:"rgba(0,0,0,0.15)",marginTop:3}}>
            <div style={{height:"100%",width:`${booked/Math.max(slots.length,1)*100}%`,background:"rgba(0,0,0,0.35)",borderRadius:2}}/>
          </div>
        </div>);
      })}
      <div style={{position:"relative",height:(DAY_END-DAY_START)*PPH,borderRight:`1px solid ${C.border}`}}>
        {HOURS.map(h=><div key={h} style={{position:"absolute",top:toPx(h),left:0,right:0,display:"flex",alignItems:"center",zIndex:2}}>
          <div style={{fontSize:8,color:C.muted,fontWeight:600,width:44,textAlign:"right",paddingRight:6,flexShrink:0,transform:"translateY(-50%)"}}>{String(h).padStart(2,"0")}:00</div>
          <div style={{flex:1,borderTop:h===12?"2px dashed #C8C4BC":`1px solid ${C.border}`}}/>
        </div>)}
        {HOURS.slice(0,-1).map(h=><div key={h+.5} style={{position:"absolute",top:toPx(h+.5),left:44,right:0,borderTop:"1px dotted #EEF2F6",zIndex:1}}/>)}
        <div style={{position:"absolute",top:toPx(12),left:44,right:0,height:PPH,background:"rgba(211,209,199,0.18)",zIndex:1,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <span style={{fontSize:9,color:C.muted,fontStyle:"italic"}}>Обед</span>
        </div>
      </div>
      {filtered.map(s=>{
        const slots=buildSlots(s);
        return(<div key={s.id} style={{position:"relative",height:(DAY_END-DAY_START)*PPH,borderLeft:`1px solid ${C.border}`}}>
          {HOURS.map(h=><div key={h} style={{position:"absolute",top:toPx(h),left:0,right:0,borderTop:h===12?"2px dashed #C8C4BC":`1px solid ${C.border}`,zIndex:1}}/>)}
          <div style={{position:"absolute",top:toPx(12),left:0,right:0,height:PPH,background:"rgba(211,209,199,0.12)",zIndex:1}}/>
          {slots.map(sl=>{
            const k=bKey(s.id,date,sl.id),bk=bookings[k];
            const top=toPx(sl.start),height=Math.max((sl.end-sl.start)*PPH-4,16);
            const sc=bk?.status==="cancelled"?C.red:bk?.status==="pending"?C.amber:C.green;
            const isCont=bk?.isContinuation;
            return(<div key={sl.id} onClick={()=>!isPast&&onSlotClick(s,sl,date,bk,k)}
              style={{position:"absolute",left:4,right:4,top,height,zIndex:5,
                background:bk?sl.color:sl.color+(sl.eff?"77":"33"),borderRadius:6,
                border:bk?`2px solid ${sl.color}`:sl.eff?`2px dashed ${sl.color}`:`1px dashed ${sl.color}88`,
                cursor:isPast?"default":"pointer",overflow:"hidden",transition:"transform 0.1s,box-shadow 0.1s"}}
              onMouseEnter={e=>{if(!isPast){e.currentTarget.style.transform="scale(1.01)";e.currentTarget.style.boxShadow="0 2px 8px rgba(26,63,92,0.15)";}}}
              onMouseLeave={e=>{e.currentTarget.style.transform="scale(1)";e.currentTarget.style.boxShadow="none";}}>
              <div style={{padding:"4px 7px",height:"100%",display:"flex",flexDirection:"column",justifyContent:"flex-start",gap:1,overflow:"hidden"}}>
                {bk?(<>
                  {bk.car&&<div style={{...clamp2,fontSize:10,fontWeight:800,color:C.primary,lineHeight:1.2}}>{bk.car}</div>}
                  <div style={{...clamp2,fontSize:9,color:C.muted,lineHeight:1.2}}>{bk.client}{isCont?" ⛓":""}</div>
                  <div style={{...clamp2,fontSize:8,fontWeight:700,color:sc,lineHeight:1.2}}>{bk.status==="confirmed"?"✅":bk.status==="pending"?"⏳":"❌"} {isCont?"Продолжение":bk.work}</div>
                </>):(<>
                  <div style={{...clamp2,fontSize:9,fontWeight:700,color:sl.textColor,lineHeight:1.25}}>{sl.label}</div>
                  <div style={{fontSize:8,color:sl.textColor,opacity:0.7}}>{fmt(sl.start)}–{fmt(sl.end)}</div>
                  <div style={{fontSize:8,color:sl.textColor,opacity:sl.eff?0.7:0.4,fontStyle:sl.eff?"normal":"italic"}}>
                    {sl.eff?"▸ Нажмите чтобы записать":"Буфер / надзор"}
                  </div>
                </>)}
              </div>
            </div>);
          })}
        </div>);
      })}
    </div>
  </div>);
}

// ── DayTimeline ───────────────────────────────────────────────────────────────
function DayTimeline({staff,onSlotsChange}){
  const makeBlocks=s=>{const bs=buildSlots(s).map(sl=>({...sl,isLunch:false}));bs.push({id:"__lunch__",label:"Обед",start:12,end:13,color:"#D3D1C7",textColor:"#555",eff:false,isLunch:true});return bs.sort((a,b)=>a.start-b.start);};
  const [blocks,setBlocks]=useState(()=>makeBlocks(staff));
  const [selId,setSelId]=useState(null);
  const [editId,setEditId]=useState(null);
  const blocksRef=useRef(blocks);
  useEffect(()=>{blocksRef.current=blocks;},[blocks]);
  const prevRef=useRef(staff.slots);
  if(prevRef.current!==staff.slots){prevRef.current=staff.slots;const nb=makeBlocks(staff);setBlocks(nb);blocksRef.current=nb;}
  const toPx=h=>(h-DAY_START)*PPH;
  const HOURS=Array.from({length:DAY_END-DAY_START+1},(_,i)=>DAY_START+i);
  const commit=fb=>{const ns=fb.filter(b=>!b.isLunch).map(b=>({id:b.srcId,label:b.label,startTime:Math.round(b.start*100)/100,hours:Math.round((b.end-b.start)*100)/100,color:b.color,textColor:b.textColor||"#333",eff:b.eff}));onSlotsChange(ns);};
  const startDrag=(e,id,type)=>{
    e.preventDefault();e.stopPropagation();setSelId(id);
    const startY=e.clientY,blk0=blocksRef.current.find(b=>b.id===id);
    if(!blk0||blk0.isLunch)return;
    const os=blk0.start,oe=blk0.end,dur=oe-os;
    const onMove=mv=>{const dh=snap((mv.clientY-startY)/PPH);setBlocks(prev=>prev.map(b=>{if(b.id!==id)return b;if(type==="move"){const ns=clamp(snap(os+dh),DAY_START,DAY_END-dur);return{...b,start:ns,end:ns+dur};}else{const ne=clamp(snap(oe+dh),b.start+STEP,DAY_END);return{...b,end:ne};}}));};
    const onUp=()=>{document.removeEventListener("mousemove",onMove);document.removeEventListener("mouseup",onUp);commit(blocksRef.current);};
    document.addEventListener("mousemove",onMove);document.addEventListener("mouseup",onUp);
  };
  const applyProp=(id,prop,val)=>{const upd=blocksRef.current.map(b=>b.id===id?{...b,[prop]:val}:b);setBlocks(upd);commit(upd);};
  const saveLabel=(id,label)=>{setEditId(null);const upd=blocksRef.current.map(b=>b.id===id?{...b,label}:b);setBlocks(upd);commit(upd);};
  return(<div style={{marginTop:12,background:"#F0F4F8",borderRadius:10,padding:12}}>
    <div style={{fontSize:10,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:8,display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:4}}>
      <span>📅 Предпросмотр дня — интерактивный</span>
      <span style={{fontSize:9,color:C.muted,fontWeight:400,fontStyle:"italic"}}>Тяни = сдвинуть · ↕ низ = длина · 2× = переименовать</span>
    </div>
    <div style={{display:"flex",gap:0}}>
      <div style={{width:38,flexShrink:0,position:"relative",height:(DAY_END-DAY_START)*PPH}}>
        {HOURS.map(h=><div key={h} style={{position:"absolute",top:toPx(h),right:4,fontSize:8,color:C.muted,fontWeight:600,transform:"translateY(-50%)",lineHeight:1}}>{String(h).padStart(2,"0")}:00</div>)}
      </div>
      <div style={{flex:1,position:"relative",height:(DAY_END-DAY_START)*PPH,background:C.card,borderRadius:8,border:`1px solid ${C.border}`,overflow:"hidden",userSelect:"none"}}>
        {HOURS.map(h=><div key={h} style={{position:"absolute",top:toPx(h),left:0,right:0,zIndex:1,borderTop:h===12?"2px dashed #C8C4BC":`1px solid ${C.border}`}}/>)}
        {HOURS.slice(0,-1).map(h=><div key={h+.5} style={{position:"absolute",top:toPx(h+.5),left:0,right:0,zIndex:1,borderTop:"1px dotted #EEF2F6"}}/>)}
        <div style={{position:"absolute",top:toPx(12),left:0,right:0,height:PPH,background:"rgba(211,209,199,0.18)",zIndex:1}}/>
        {blocks.map(blk=>{
          const top=toPx(blk.start),height=Math.max((blk.end-blk.start)*PPH-2,14),isSel=selId===blk.id,dur=Math.round((blk.end-blk.start)*100)/100;
          return(<div key={blk.id} style={{position:"absolute",left:4,right:4,top,height,zIndex:isSel?20:10,background:blk.color,borderRadius:6,border:`2px solid ${isSel?C.primary:blk.color}`,boxShadow:isSel?"0 3px 12px rgba(26,63,92,0.25)":"0 1px 3px rgba(0,0,0,0.07)",cursor:blk.isLunch?"default":"grab",overflow:"hidden"}}
            onMouseDown={blk.isLunch?undefined:e=>startDrag(e,blk.id,"move")}
            onClick={()=>!blk.isLunch&&setSelId(isSel?null:blk.id)}>
            <div style={{padding:"3px 7px",height:"100%",display:"flex",flexDirection:"column",justifyContent:"space-between",overflow:"hidden"}}>
              <div>
                {editId===blk.id
                  ?<input autoFocus value={blk.label} onChange={e=>setBlocks(p=>p.map(b=>b.id===blk.id?{...b,label:e.target.value}:b))} onBlur={e=>saveLabel(blk.id,e.target.value)} onKeyDown={e=>e.key==="Enter"&&saveLabel(blk.id,e.target.value)} style={{fontSize:10,fontWeight:700,color:blk.textColor,background:"rgba(255,255,255,0.6)",border:"none",borderRadius:3,padding:"1px 4px",width:"100%",outline:"none"}} onClick={e=>e.stopPropagation()}/>
                  :<div onDoubleClick={e=>{e.stopPropagation();if(!blk.isLunch)setEditId(blk.id);}} style={{fontSize:10,fontWeight:700,color:blk.textColor,lineHeight:1.3,cursor:"text"}}>{blk.label}</div>
                }
                {height>26&&<div style={{fontSize:8,color:blk.textColor,opacity:0.7,marginTop:1}}>{fmt(blk.start)}–{fmt(blk.end)} · {dur}ч</div>}
              </div>
              {isSel&&!blk.isLunch&&height>54&&(<div style={{display:"flex",gap:3,flexWrap:"wrap",marginTop:3}} onClick={e=>e.stopPropagation()}>
                {COLORS.map(c=><div key={c} onClick={()=>applyProp(blk.id,"color",c)} style={{width:13,height:13,borderRadius:3,background:c,cursor:"pointer",border:`2px solid ${blk.color===c?C.primary:"transparent"}`,flexShrink:0}}/>)}
                <label style={{display:"flex",alignItems:"center",gap:2,fontSize:8,color:blk.textColor,cursor:"pointer",marginLeft:2}}>
                  <input type="checkbox" checked={blk.eff} onChange={()=>applyProp(blk.id,"eff",!blk.eff)} style={{width:10,height:10}}/> эфф.
                </label>
              </div>)}
            </div>
            {!blk.isLunch&&<div onMouseDown={e=>{e.stopPropagation();startDrag(e,blk.id,"resize");}} style={{position:"absolute",bottom:0,left:0,right:0,height:8,cursor:"ns-resize",background:"rgba(0,0,0,0.1)",display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{width:22,height:2,borderRadius:1,background:"rgba(0,0,0,0.25)"}}/></div>}
          </div>);
        })}
      </div>
    </div>
    <div style={{marginTop:8,background:C.card,borderRadius:6,padding:"6px 10px",display:"flex",gap:8,flexWrap:"wrap",fontSize:9,color:C.muted}}>
      {blocks.filter(b=>!b.isLunch).sort((a,b)=>a.start-b.start).map(b=>(
        <span key={b.id} style={{display:"flex",alignItems:"center",gap:3,padding:"2px 6px",borderRadius:4,background:b.color+"44"}}>
          <span style={{width:7,height:7,borderRadius:2,background:b.color,flexShrink:0,display:"inline-block"}}/>
          <b style={{color:C.primary,fontSize:9}}>{b.label}</b> {fmt(b.start)}–{fmt(b.end)}
          <span style={{color:b.eff?C.green:C.muted}}>{b.eff?"✓":"○"}</span>
        </span>
      ))}
    </div>
    <div style={{marginTop:4,fontSize:9,color:C.muted,display:"flex",gap:10}}>
      <span>🖱 Тяни = сдвинуть</span><span>↕ Тяни низ = длина</span><span>✏️ 2× = переименовать</span>
      <span style={{marginLeft:"auto",color:C.green,fontWeight:600}}>↑ Изменения сразу в календаре</span>
    </div>
  </div>);
}

// ── SLOT FINDER PANEL ─────────────────────────────────────────────────────────
function SlotFinder({staff, bookings, onConfirm}) {
  const [steps,      setSteps]      = useState([{staffId:staff[0]?.id||"",work:"ТО",hours:1.5}]);
  const [wantDate,   setWantDate]   = useState(""); // ISO yyyy-mm-dd, optional
  const [client,     setClient]     = useState("");
  const [car,        setCar]        = useState("");
  const [clientId,   setClientId]   = useState(null);
  const [carId,      setCarId]      = useState(null);
  const [status,     setStatus]     = useState("confirmed");
  const [notes,      setNotes]      = useState("");
  const [options,    setOptions]    = useState(null);
  const [chosen,     setChosen]     = useState(0);
  const [notFound,   setNotFound]   = useState(false);
  const [searching,  setSearching]  = useState(false);
  const [confirmed,  setConfirmed]  = useState(false);

  const inp={border:`1.5px solid ${C.border}`,borderRadius:8,padding:"8px 10px",fontSize:12,width:"100%",fontFamily:"inherit",outline:"none",boxSizing:"border-box"};
  const lb=t=><label style={{fontSize:10,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:"0.06em",display:"block",marginBottom:4}}>{t}</label>;

  const doSearch = () => {
    if(!client.trim()) return alert("Введите имя клиента");
    setSearching(true);setOptions(null);setConfirmed(false);setNotFound(false);
    setTimeout(()=>{
      const startDate = wantDate ? new Date(wantDate+"T00:00:00") : today();
      const opts = findChainOptions(steps, startDate, bookings, staff);
      setSearching(false);
      if(!opts.length){setNotFound(true);return;}
      setOptions(opts);setChosen(0);
    },300);
  };

  const doConfirm = () => {
    if(!options||!options[chosen]) return;
    onConfirm(chainToBookData(options[chosen],{client,car,clientId,carId,status,notes}));
    setConfirmed(true);setOptions(null);
  };

  const reset = () => {
    setOptions(null);setConfirmed(false);setNotFound(false);setClient("");setCar("");setClientId(null);setCarId(null);setNotes("");
  };

  const opts = options||[]; const sch = opts[chosen]||null;
  const chainDays = sch?new Set(sch.map(s=>dayKey(s.date))).size:0;

  return(
    <div style={{display:"flex",gap:16,flexWrap:"wrap",alignItems:"flex-start"}}>

      {/* ── LEFT: параметры ── */}
      <div style={{flex:"0 0 340px",minWidth:280,display:"flex",flexDirection:"column",gap:12}}>
        <div style={{background:C.card,borderRadius:12,overflow:"hidden",boxShadow:"0 1px 8px rgba(26,63,92,0.07)"}}>
          <div style={{background:C.primary,padding:"10px 14px"}}>
            <div style={{color:"#fff",fontWeight:700,fontSize:13}}>🔍 Параметры подбора</div>
            <div style={{color:"#9BB8D0",fontSize:10,marginTop:2}}>Заполните — система найдёт ближайший вариант</div>
          </div>
          <div style={{padding:14,display:"flex",flexDirection:"column",gap:12}}>

            {/* Цепочка мастеров */}
            <ChainSteps allStaff={staff} steps={steps} setSteps={setSteps} inp={inp} lb={lb}/>

            {/* Желаемая дата */}
            <div>
              {lb("Желаемая дата (необязательно)")}
              <div style={{position:"relative"}}>
                <input type="date" value={wantDate} onChange={e=>setWantDate(e.target.value)}
                  min={today().toISOString().split("T")[0]}
                  style={{...inp,paddingRight:wantDate?32:12}}/>
                {wantDate&&<button onClick={()=>setWantDate("")}
                  style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",background:"transparent",border:"none",color:C.muted,cursor:"pointer",fontSize:16,lineHeight:1}}>×</button>}
              </div>
              {!wantDate&&<div style={{fontSize:10,color:C.muted,marginTop:3}}>Не выбрана — подберём с сегодняшнего дня</div>}
            </div>

            {/* Клиент + авто */}
            <ClientCarPicker client={client} car={car} clientId={clientId} carId={carId} inp={inp}
              onChange={p=>{if('client'in p)setClient(p.client);if('car'in p)setCar(p.car);if('clientId'in p)setClientId(p.clientId);if('carId'in p)setCarId(p.carId);}}/>

            {/* Заметки */}
            <div>{lb("Заметки")}<textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={2} placeholder="Доп. информация..." style={{...inp,resize:"vertical"}}/></div>

            {/* Статус */}
            <div>{lb("Статус")}<div style={{display:"flex",gap:6}}>
              {[["confirmed","✅ Подтверждён",C.green],["pending","⏳ Ожидание",C.amber],["cancelled","❌ Отменён",C.red]].map(([v,l,col])=>(
                <button key={v} onClick={()=>setStatus(v)} style={{flex:1,padding:"6px 2px",border:`2px solid ${status===v?col:C.border}`,borderRadius:7,background:status===v?col+"22":"transparent",color:status===v?col:C.muted,fontSize:10,fontWeight:600,cursor:"pointer"}}>{l}</button>
              ))}
            </div></div>

            {/* Search button */}
            <button onClick={doSearch} disabled={searching}
              style={{padding:"11px 0",border:"none",borderRadius:9,background:C.primary,color:"#fff",cursor:"pointer",fontWeight:700,fontSize:14,opacity:searching?0.7:1,transition:"opacity 0.15s"}}>
              {searching?"🔍 Ищу подходящие слоты...":"🔍 Найти слоты"}
            </button>
          </div>
        </div>
      </div>

      {/* ── RIGHT: результаты ── */}
      <div style={{flex:1,minWidth:280,display:"flex",flexDirection:"column",gap:12}}>

        {/* Confirmed */}
        {confirmed&&(
          <div style={{background:"#EDF9F0",border:`1.5px solid ${C.green}`,borderRadius:12,padding:"20px 16px",textAlign:"center"}}>
            <div style={{fontSize:32,marginBottom:8}}>✅</div>
            <div style={{fontWeight:700,fontSize:15,color:C.green,marginBottom:4}}>Запись подтверждена!</div>
            <div style={{fontSize:12,color:C.muted,marginBottom:14}}>{client}{car?` · ${car}`:""}</div>
            <button onClick={reset} style={{padding:"8px 20px",border:`1px solid ${C.border}`,borderRadius:8,background:C.card,color:C.primary,cursor:"pointer",fontWeight:600,fontSize:12}}>
              + Новый подбор
            </button>
          </div>
        )}

        {/* Не удалось */}
        {notFound&&!confirmed&&(
          <div style={{background:C.card,borderRadius:12,padding:"30px 16px",textAlign:"center",boxShadow:"0 1px 8px rgba(26,63,92,0.07)"}}>
            <div style={{fontSize:28,marginBottom:8}}>😔</div>
            <div style={{fontWeight:700,color:C.primary,marginBottom:6}}>Не удалось построить цепочку</div>
            <div style={{fontSize:12,color:C.muted}}>Попробуйте меньше времени, меньше этапов или другую дату.</div>
            <button onClick={()=>setNotFound(false)} style={{marginTop:14,padding:"7px 18px",border:`1px solid ${C.border}`,borderRadius:8,background:"#F0F4F8",color:C.primary,cursor:"pointer",fontWeight:600,fontSize:12}}>← Изменить параметры</button>
          </div>
        )}

        {/* Варианты цепочки (3 ближайшие даты) */}
        {sch&&!confirmed&&(
          <div style={{background:C.card,borderRadius:12,overflow:"hidden",boxShadow:"0 1px 8px rgba(26,63,92,0.07)"}}>
            <div style={{background:C.sub,padding:"10px 14px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{color:"#fff",fontWeight:700,fontSize:13}}>Цепочка · {sch.length} этап(ов){opts.length>1?` · вариант ${chosen+1}/${opts.length}`:""}</div>
              <div style={{color:"rgba(255,255,255,0.8)",fontSize:10}}>{client||"—"}{car?` · ${car}`:""} · {chainDays} дн.</div>
            </div>
            <div style={{padding:14,display:"flex",flexDirection:"column",gap:6}}>
              {opts.length>1&&<div style={{display:"flex",gap:6,marginBottom:6,flexWrap:"wrap"}}>
                {opts.map((o,i)=>{const f=o[0].date,l=o[o.length-1].date,multi=!isSameDay(f,l);return(
                  <button key={i} onClick={()=>setChosen(i)} style={{flex:"1 1 30%",minWidth:100,padding:"7px 9px",borderRadius:10,border:`2px solid ${chosen===i?C.primary:C.border}`,background:chosen===i?"#EAF2FF":"#FAFBFC",cursor:"pointer",textAlign:"left"}}>
                    <div style={{fontSize:12,fontWeight:800,color:C.primary}}>{f.toLocaleDateString("ru",{day:"numeric",month:"short"})}{multi?` → ${l.toLocaleDateString("ru",{day:"numeric",month:"short"})}`:""}</div>
                    <div style={{fontSize:9,color:C.muted}}>{f.toLocaleDateString("ru",{weekday:"short"})} · {o.length} эт.</div>
                  </button>);})}
              </div>}
              {sch.map((st,i)=>{
                const prev=sch[i-1];
                const sameDay=prev&&isSameDay(prev.date,st.date);
                const gap=sameDay?(st.startH-prev.endH):null;
                return(<div key={i}>
                  {gap!==null&&gap>0.01&&<div style={{fontSize:10,color:C.amber,textAlign:"center",margin:"3px 0"}}>⏳ пауза {fmtH(gap)}</div>}
                  {prev&&!sameDay&&<div style={{fontSize:10,color:C.sub,textAlign:"center",margin:"3px 0"}}>↓ следующий рабочий день</div>}
                  <div style={{border:`1.5px solid ${C.border}`,borderRadius:10,padding:"10px 12px",display:"flex",alignItems:"center",gap:10}}>
                    <div style={{width:28,height:28,borderRadius:8,background:st.staff.color,color:st.staff.textColor,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,flexShrink:0}}>{st.staff.emoji}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:700,color:C.primary}}>{st.staff.name} · {st.work}</div>
                      <div style={{fontSize:11,color:C.muted}}>{st.date.toLocaleDateString("ru",{weekday:"short",day:"numeric",month:"long"})}</div>
                    </div>
                    <div style={{fontSize:12,fontWeight:800,color:C.sub,whiteSpace:"nowrap"}}>{fmt(st.startH)}–{fmt(st.endH)}</div>
                  </div>
                </div>);
              })}
              <button onClick={doConfirm} style={{marginTop:6,padding:"12px 0",border:"none",borderRadius:9,background:C.green,color:"#fff",cursor:"pointer",fontWeight:700,fontSize:14}}>✅ Подтвердить и внести в календарь</button>
            </div>
          </div>
        )}

        {/* Плейсхолдер */}
        {!options&&!confirmed&&!searching&&!notFound&&(
          <div style={{background:C.card,borderRadius:12,padding:"40px 20px",textAlign:"center",boxShadow:"0 1px 8px rgba(26,63,92,0.07)",color:C.muted}}>
            <div style={{fontSize:36,marginBottom:12,opacity:0.4}}>🔍</div>
            <div style={{fontWeight:700,fontSize:14,color:C.primary,marginBottom:6}}>Добавьте мастеров и нажмите «Найти слоты»</div>
            <div style={{fontSize:12,lineHeight:1.6}}>Каждый этап (мастер + работа + время)<br/>встанет во времени друг за другом</div>
          </div>
        )}
      </div>
    </div>
  );
}


function StaffSettings({staff,setStaff}){
  const stats=useMemo(()=>staff.map(s=>({id:s.id,...calcStaff(s)})),[staff]);
  const tEW=stats.reduce((a,s)=>a+s.ew,0),aKpd=stats.length?Math.round(stats.reduce((a,s)=>a+s.kpd,0)/stats.length):0;
  const upS=(id,f,v)=>setStaff(p=>p.map(s=>s.id!==id?s:{...s,[f]:v}));
  const upSl=(sid,slid,f,v)=>setStaff(p=>p.map(s=>s.id!==sid?s:{...s,slots:s.slots.map(sl=>sl.id!==slid?sl:{...sl,[f]:v})}));
  const addSl=sid=>setStaff(p=>p.map(s=>s.id!==sid?s:{...s,slots:[...s.slots,{id:uid(),label:"Новый слот",startTime:9,hours:1,color:"#B5D4F4",textColor:"#0C447C",eff:true}]}));
  const rmSl=(sid,slid)=>setStaff(p=>p.map(s=>s.id!==sid?s:{...s,slots:s.slots.filter(sl=>sl.id!==slid)}));
  const addStaff=()=>setStaff(p=>[...p,{id:uid(),name:"Новый",role:"Сотрудник",emoji:"👨‍🔧",daysPerWeek:5,hoursDay:8,lunch:1,color:"#B8E8D0",textColor:"#085041",workDays:[1,2,3,4,5],slots:[{id:uid(),label:"Работа",startTime:9,hours:2,color:"#B8E8D0",textColor:"#085041",eff:true}]}]);
  const rmStaff=id=>setStaff(p=>p.filter(s=>s.id!==id));
  const [openId,setOpenId]=useState(null);
  const TH={padding:"7px 10px",fontSize:10,fontWeight:700,color:"#fff",background:C.primary,textAlign:"center",whiteSpace:"nowrap"};
  const TD=(ex={})=>({padding:"6px 10px",fontSize:11,borderBottom:`1px solid ${C.border}`,textAlign:"center",verticalAlign:"middle",...ex});
  const i2={border:`1px solid ${C.border}`,borderRadius:6,padding:"5px 7px",fontSize:12,fontFamily:"inherit"};
  return(<div style={{display:"flex",flexDirection:"column",gap:12}}>
    <div style={{background:C.card,borderRadius:12,overflow:"hidden",boxShadow:"0 1px 8px rgba(26,63,92,0.07)"}}>
      <div style={{background:C.primary,padding:"9px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span style={{color:"#fff",fontWeight:700,fontSize:13}}>📊 Нагрузка команды</span>
        <div style={{display:"flex",gap:10,alignItems:"center"}}>
          <span style={{color:"#FBC84A",fontWeight:700,fontSize:11}}>КПД {aKpd}% · {tEW.toFixed(1)}ч/нед</span>
          <button onClick={addStaff} style={{padding:"4px 10px",background:"rgba(255,255,255,0.15)",border:"none",borderRadius:6,color:"#fff",cursor:"pointer",fontSize:11,fontWeight:700}}>＋ Сотрудник</button>
        </div>
      </div>
      <table style={{width:"100%",borderCollapse:"collapse"}}>
        <thead><tr>{["","Сотрудник","Дней","Ч/день","Раб.ч/нед","Эфф.ч/нед","Эфф.ч/мес","КПД",""].map((h,i)=><th key={i} style={TH}>{h}</th>)}</tr></thead>
        <tbody>
          {staff.map((s,i)=>{const cv=stats[i];const k=kc(cv.kpd);return(
            <tr key={s.id} style={{background:i%2===0?"#fff":"#F8FAFC"}}>
              <td style={TD()} onClick={()=>setOpenId(openId===s.id?null:s.id)}><span style={{fontSize:18,cursor:"pointer"}}>{s.emoji}</span></td>
              <td style={TD({textAlign:"left",cursor:"pointer"})} onClick={()=>setOpenId(openId===s.id?null:s.id)}>
                <div style={{display:"flex",alignItems:"center",gap:6}}><div style={{width:8,height:24,borderRadius:2,background:s.color,flexShrink:0}}/><div><b style={{color:C.primary}}>{s.name}</b><div style={{fontSize:9,color:C.muted}}>{s.role}</div></div></div>
              </td>
              <td style={TD()}><input type="number" min={1} max={7} value={s.daysPerWeek} onChange={e=>upS(s.id,"daysPerWeek",+e.target.value)} style={{...i2,width:42,textAlign:"center",fontWeight:700,background:"#FFFBEF",borderColor:"#FBC84A"}}/></td>
              <td style={TD()}><input type="number" min={4} max={12} value={s.hoursDay} onChange={e=>upS(s.id,"hoursDay",+e.target.value)} style={{...i2,width:42,textAlign:"center",fontWeight:700,background:"#FFFBEF",borderColor:"#FBC84A"}}/></td>
              <td style={TD({color:C.sub,fontWeight:700})}>{cv.wh}ч</td>
              <td style={TD({fontWeight:800,color:C.primary})}>{cv.ew.toFixed(1)}ч</td>
              <td style={TD({color:C.primary})}>{cv.em.toFixed(1)}ч</td>
              <td style={TD()}><span style={{padding:"2px 8px",borderRadius:99,background:k.bg,color:"#fff",fontWeight:700,fontSize:11}}>{cv.kpd}%</span></td>
              <td style={TD()}><button onClick={()=>rmStaff(s.id)} style={{background:"transparent",border:"none",color:"#CCC",cursor:"pointer",fontSize:14}}>×</button></td>
            </tr>
          );})}
          <tr style={{background:C.primary}}>
            <td colSpan={2} style={TD({color:"#fff",fontWeight:700,textAlign:"left"})}>ИТОГО</td>
            <td colSpan={2} style={TD({color:"#fff"})}/>
            <td style={TD({color:"#fff",fontWeight:700})}>{stats.reduce((a,s)=>a+s.wh,0)}ч</td>
            <td style={TD({color:"#7DC8A8",fontWeight:800})}>{tEW.toFixed(1)}ч</td>
            <td style={TD({color:"#7DC8A8"})}>{stats.reduce((a,s)=>a+s.em,0).toFixed(1)}ч</td>
            <td colSpan={2} style={TD()}><span style={{padding:"2px 8px",borderRadius:99,background:kc(aKpd).bg,color:"#fff",fontWeight:700,fontSize:11}}>{aKpd}%</span></td>
          </tr>
        </tbody>
      </table>
    </div>
    <div style={{background:"#FFF8E8",border:"1px solid #FBC84A",borderRadius:8,padding:"8px 12px",fontSize:11,color:"#5A3C00"}}>
      ✏️ Нажмите иконку/имя → редактор слотов + интерактивный таймлайн. Каждый слот независим.
    </div>
    {staff.map((s,si)=>{
      const cv=stats[si];const k=kc(cv.kpd);
      if(openId!==s.id)return null;
      return(<div key={s.id} style={{background:C.card,borderRadius:12,overflow:"hidden",boxShadow:"0 1px 6px rgba(26,63,92,0.07)"}}>
        <div style={{background:C.primary,padding:"9px 14px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <input value={s.emoji} onChange={e=>upS(s.id,"emoji",e.target.value)} style={{width:36,fontSize:18,border:"none",background:"transparent",textAlign:"center"}}/>
            <div>
              <input value={s.name} onChange={e=>upS(s.id,"name",e.target.value)} style={{color:"#fff",fontWeight:700,fontSize:14,background:"transparent",border:"none",outline:"none",width:130}}/>
              <input value={s.role} onChange={e=>upS(s.id,"role",e.target.value)} style={{color:"rgba(255,255,255,0.7)",fontSize:10,background:"transparent",border:"none",outline:"none",display:"block",width:170,marginTop:1}}/>
            </div>
          </div>
          <span style={{padding:"2px 10px",borderRadius:99,background:k.bg,color:"#fff",fontWeight:700,fontSize:11}}>{cv.kpd}% КПД</span>
        </div>
        <div style={{padding:14}}>
          <div style={{display:"flex",gap:10,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
            {[["Дней/нед","daysPerWeek",1,7],["Ч/день","hoursDay",4,12],["Обед ч","lunch",0,2]].map(([lbl,field,min,max])=>(
              <label key={field} style={{display:"flex",flexDirection:"column",gap:3}}>
                <span style={{fontSize:9,color:C.muted,fontWeight:700,textTransform:"uppercase"}}>{lbl}</span>
                <input type="number" min={min} max={max} value={s[field]} onChange={e=>upS(s.id,field,+e.target.value)} style={{width:60,padding:"5px",border:"1.5px solid #FBC84A",borderRadius:6,fontSize:13,fontWeight:700,textAlign:"center",background:"#FFFBEF"}}/>
              </label>
            ))}
            <label style={{display:"flex",flexDirection:"column",gap:3}}>
              <span style={{fontSize:9,color:C.muted,fontWeight:700,textTransform:"uppercase"}}>Цвет</span>
              <div style={{display:"flex",gap:4}}>{COLORS.slice(0,8).map(c=><div key={c} onClick={()=>upS(s.id,"color",c)} style={{width:20,height:20,borderRadius:4,background:c,cursor:"pointer",border:`2px solid ${s.color===c?C.primary:"transparent"}`}}/>)}</div>
            </label>
            <div style={{display:"flex",flexDirection:"column",gap:3}}>
              <span style={{fontSize:9,color:C.muted,fontWeight:700,textTransform:"uppercase"}}>Эфф.ч/нед</span>
              <div style={{width:60,padding:"5px",border:`1.5px solid ${C.border}`,borderRadius:6,fontSize:13,fontWeight:800,textAlign:"center",color:k.bg}}>{cv.ew.toFixed(1)}</div>
            </div>
          </div>
          <div style={{fontSize:10,fontWeight:700,color:C.muted,textTransform:"uppercase",marginBottom:5}}>Слоты — каждый независим</div>
          <div style={{display:"grid",gridTemplateColumns:"10px 1fr 82px 72px 36px 48px 28px 18px",gap:4,padding:"2px 8px",marginBottom:2}}>
            {["","Название","Начало","Дл-сть","До","Цвет","Эфф",""].map((h,i)=><div key={i} style={{fontSize:8,fontWeight:700,color:C.muted,textTransform:"uppercase",textAlign:"center"}}>{h}</div>)}
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:4,marginBottom:6}}>
            {s.slots.map(sl=>(
              <div key={sl.id} style={{display:"grid",gridTemplateColumns:"10px 1fr 82px 72px 36px 48px 28px 18px",gap:4,alignItems:"center",background:"#F8FAFC",borderRadius:7,padding:"5px 8px",border:`1px solid ${C.border}`}}>
                <div style={{width:9,height:9,borderRadius:2,background:sl.color,border:"1px solid #ddd"}}/>
                <input value={sl.label} onChange={e=>upSl(s.id,sl.id,"label",e.target.value)} style={{border:`1px solid ${C.border}`,borderRadius:5,padding:"3px 6px",fontSize:11,width:"100%",boxSizing:"border-box"}}/>
                <select value={sl.startTime} onChange={e=>upSl(s.id,sl.id,"startTime",+e.target.value)} style={{border:"1.5px solid #FBC84A",borderRadius:5,padding:"3px 4px",fontSize:10,background:"#FFFBEF",width:"100%",fontWeight:700}}>
                  {HOURS_LIST.map(h=><option key={h} value={h}>{fmt(h)}</option>)}
                </select>
                <select value={sl.hours} onChange={e=>upSl(s.id,sl.id,"hours",+e.target.value)} style={{border:"1.5px solid #FBC84A",borderRadius:5,padding:"3px 4px",fontSize:10,background:"#FFFBEF",width:"100%",fontWeight:700}}>
                  {DURATIONS.map(d=><option key={d} value={d}>{d<1?d*60+"м":d+"ч"}</option>)}
                </select>
                <div style={{fontSize:9,color:C.muted,textAlign:"center",fontWeight:600}}>{fmt(sl.startTime+sl.hours)}</div>
                <select value={sl.color} onChange={e=>upSl(s.id,sl.id,"color",e.target.value)} style={{border:`1px solid ${C.border}`,borderRadius:5,padding:2,fontSize:10,background:sl.color,width:"100%"}}>
                  {COLORS.map(c=><option key={c} value={c} style={{background:c}}>{c}</option>)}
                </select>
                <label style={{display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>
                  <input type="checkbox" checked={sl.eff} onChange={e=>upSl(s.id,sl.id,"eff",e.target.checked)} style={{width:12,height:12}}/>
                </label>
                <button onClick={()=>rmSl(s.id,sl.id)} style={{background:"transparent",border:"none",color:"#CCC",cursor:"pointer",fontSize:13,lineHeight:1}}>×</button>
              </div>
            ))}
          </div>
          <button onClick={()=>addSl(s.id)} style={{background:"transparent",border:`1.5px dashed ${C.border}`,color:C.sub,borderRadius:7,padding:"5px 12px",fontSize:11,cursor:"pointer",width:"100%",marginBottom:4}}>+ Добавить слот</button>
          <DayTimeline staff={s} onSlotsChange={ns=>setStaff(p=>p.map(st=>st.id!==s.id?st:{...st,slots:ns}))}/>
        </div>
      </div>);
    })}
    <div style={{display:"flex",gap:10,flexWrap:"wrap",fontSize:10,color:C.muted}}>
      <span>🟢 &lt;70% норма</span><span>🟡 70–84% цель</span><span>🔴 ≥85% перегруз</span>
    </div>
  </div>);
}

// ── CLIENT DATABASE ─────────────────────────────────────────────────────────
function L({children}){return <div style={{fontSize:11,fontWeight:600,color:C.muted,marginBottom:3}}>{children}</div>;}
function Modal({title,onClose,children}){
  return(<div style={{position:"fixed",inset:0,background:"rgba(26,63,92,0.55)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:12,overflowY:"auto"}} onClick={onClose}>
    <div onClick={e=>e.stopPropagation()} style={{background:C.card,borderRadius:16,width:"100%",maxWidth:440,boxShadow:"0 8px 40px rgba(26,63,92,0.25)",margin:"auto"}}>
      <div style={{padding:"14px 16px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{fontSize:15,fontWeight:800,color:C.primary}}>{title}</div>
        <button onClick={onClose} style={{background:"rgba(0,0,0,0.08)",border:"none",borderRadius:8,width:28,height:28,cursor:"pointer",fontSize:16}}>×</button>
      </div>
      <div style={{padding:16}}>{children}</div>
    </div>
  </div>);
}

// Текст машины для отображения в записи
const carLabel=(cr)=>([cr.make,cr.model].filter(Boolean).join(" ")||cr.plate||"Машина");
// Строка для поиска по ВСЕМ параметрам клиента и его машин
const clientHaystack=c=>[c.name,c.phone,c.email,c.messenger,c.contactPerson,c.taxNumber,c.companyAddress,c.note,
  ...((c.cars||[]).flatMap(x=>[x.make,x.model,x.submodel,x.year,x.fuel,x.vin,x.plate,x.drivetrain,x.transmission,x.bodytype]))
].filter(Boolean).join(" ").toLowerCase();
// Все слова запроса должны встречаться (поиск по любому параметру)
const matchClient=(c,q)=>{const h=clientHaystack(c);return q.toLowerCase().split(/\s+/).filter(Boolean).every(w=>h.includes(w));};

// Умный выбор клиента и машины из базы (используется во всех формах записи)
function ClientCarPicker({client,car,clientId,carId,onChange,inp,autoFocus}){
  const [dir,setDir]=useState([]);
  const [open,setOpen]=useState(false);
  const [addC,setAddC]=useState(null);
  const [addCar,setAddCar]=useState(null);
  const [busy,setBusy]=useState(false);
  const lb=t=><label style={{fontSize:10,fontWeight:700,color:C.muted,textTransform:"uppercase",display:"block",marginBottom:4}}>{t}</label>;
  const load=(cb)=>apiGet('/directory').then(r=>{const l=r.clients||[];setDir(l);if(cb)cb(l);}).catch(()=>{});
  useEffect(()=>{load();},[]);
  const selClient=dir.find(c=>c.id===clientId);
  const s=client.trim().toLowerCase();
  const matches=s?dir.filter(c=>matchClient(c,s)):dir;
  const exact=!!s&&dir.some(c=>(c.name||"").trim().toLowerCase()===s);
  const cars=selClient?(selClient.cars||[]):[];

  const pickClient=(c)=>{const cs=c.cars||[];const patch={client:c.name,clientId:c.id,car:"",carId:null};if(cs.length===1){patch.car=carLabel(cs[0]);patch.carId=cs[0].id;}onChange(patch);setOpen(false);};
  const pickCar=(cr)=>onChange({car:carLabel(cr),carId:cr.id});
  const doAddClient=async()=>{const name=(addC.name||"").trim();if(!name)return alert("Введите имя");setBusy(true);const r=await apiPost('/directory',{op:'upsertClient',client:{name,phone:addC.phone||"",email:addC.email||"",type:addC.type||"individual",contactPerson:addC.contactPerson||"",taxNumber:addC.taxNumber||"",companyAddress:addC.companyAddress||""}}).catch(()=>null);setBusy(false);if(r&&r.success){load(l=>{const nc=l.find(x=>x.id===r.id);if(nc)pickClient(nc);});setAddC(null);}else alert("Не удалось добавить клиента");};
  const doAddCar=async()=>{if(!clientId)return;setBusy(true);const r=await apiPost('/directory',{op:'upsertCar',car:{client_id:clientId,make:addCar.make||"",model:addCar.model||"",vin:addCar.vin||"",plate:addCar.plate||""}}).catch(()=>null);setBusy(false);if(r&&r.success){load(l=>{const nc=l.find(x=>x.id===clientId);const cr=nc&&(nc.cars||[]).find(x=>x.id===r.id);if(cr)pickCar(cr);});setAddCar(null);}else alert("Не удалось добавить машину");};
  const link={fontSize:11,fontWeight:700,color:C.sub,background:"transparent",border:"none",cursor:"pointer",padding:"5px 0",marginTop:2};
  const ghost={flex:1,padding:"8px 0",border:`1px solid ${C.border}`,borderRadius:8,background:"#F0F4F8",color:C.primary,cursor:"pointer",fontWeight:600};
  const prim={flex:2,padding:"8px 0",border:"none",borderRadius:8,background:C.primary,color:"#fff",cursor:"pointer",fontWeight:700,opacity:busy?0.6:1};

  return(<div style={{display:"flex",flexDirection:"column",gap:10}}>
    <div style={{position:"relative"}}>
      {lb("Клиент *")}
      <input value={client} autoFocus={autoFocus} placeholder="Начните вводить имя…"
        onChange={e=>onChange({client:e.target.value,clientId:null,car:"",carId:null})}
        onFocus={()=>setOpen(true)} onBlur={()=>setTimeout(()=>setOpen(false),160)} style={inp}/>
      {clientId?<div style={{fontSize:10,color:C.green,fontWeight:700,marginTop:2}}>✓ выбран из базы</div>:null}
      {open&&<div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:60,background:"#fff",border:`1px solid ${C.border}`,borderRadius:8,boxShadow:"0 6px 20px rgba(0,0,0,0.14)",maxHeight:190,overflowY:"auto",marginTop:2}}>
        {matches.slice(0,40).map(c=>(
          <div key={c.id} onMouseDown={()=>pickClient(c)} style={{padding:"7px 10px",cursor:"pointer",borderBottom:`1px solid ${C.bg}`}}>
            <div style={{fontWeight:600,color:C.primary,fontSize:12}}>{c.type==="company"?"🏢 ":""}{c.name}</div>
            <div style={{fontSize:10,color:C.muted}}>{c.phone||""}{c.phone&&(c.cars||[]).length?"  ·  ":""}{(c.cars||[]).length?(c.cars||[]).map(x=>[carLabel(x),x.plate].filter(Boolean).join(" ")).join(", "):""}</div>
          </div>
        ))}
        {s&&!exact&&<div onMouseDown={()=>setAddC({name:client.trim(),phone:"",email:"",type:"individual",contactPerson:"",taxNumber:"",companyAddress:""})} style={{padding:"9px 10px",cursor:"pointer",color:C.sub,fontWeight:700,fontSize:12,background:"#F0F7FF"}}>＋ Добавить «{client.trim()}» в базу</div>}
        {!matches.length&&!s&&<div style={{padding:"9px 10px",fontSize:11,color:C.muted}}>База пуста — введите имя, чтобы добавить</div>}
      </div>}
    </div>
    <div>
      {lb("Авто")}
      {clientId?(<div>
        {cars.length>0?(
          <select value={carId||""} onChange={e=>{const id=+e.target.value;const cr=cars.find(x=>x.id===id);if(cr)pickCar(cr);}} style={{...inp,cursor:"pointer",background:"#fff"}}>
            <option value="" disabled>Выберите машину…</option>
            {cars.map(cr=><option key={cr.id} value={cr.id}>{carLabel(cr)}{cr.plate?` · ${cr.plate}`:""}</option>)}
          </select>
        ):<div style={{fontSize:11,color:C.muted}}>У клиента пока нет машин</div>}
        <button type="button" onClick={()=>setAddCar({make:"",model:"",vin:"",plate:""})} style={link}>＋ Добавить машину</button>
      </div>):(
        <input value={car} onChange={e=>onChange({car:e.target.value,carId:null})} placeholder="BMW X3… (или выберите клиента)" style={inp}/>
      )}
    </div>
    {addC&&<Modal title="Новый клиент" onClose={()=>setAddC(null)}>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        <div><L>Тип клиента</L>
          <div style={{display:"flex",gap:8}}>
            {[["individual","👤 Индивидуальный"],["company","🏢 Компания"]].map(([v,l])=>(
              <button key={v} type="button" onClick={()=>setAddC({...addC,type:v})} style={{flex:1,padding:"8px 6px",border:`2px solid ${addC.type===v?C.primary:C.border}`,borderRadius:8,background:addC.type===v?"#EAF2FF":"transparent",color:addC.type===v?C.primary:C.muted,fontSize:12,fontWeight:700,cursor:"pointer"}}>{l}</button>
            ))}
          </div>
        </div>
        <div><L>{addC.type==="company"?"Название компании *":"Имя *"}</L><input autoFocus value={addC.name} onChange={e=>setAddC({...addC,name:e.target.value})} placeholder={addC.type==="company"?"ООО «Ромашка»":""} style={inp}/></div>
        {addC.type==="company"&&<>
          <div><L>Контактное лицо</L><input value={addC.contactPerson} onChange={e=>setAddC({...addC,contactPerson:e.target.value})} placeholder="Имя представителя" style={inp}/></div>
          <div><L>Налоговый номер</L><input value={addC.taxNumber} onChange={e=>setAddC({...addC,taxNumber:e.target.value})} placeholder="Необязательно" style={inp}/></div>
          <div><L>Адрес компании</L><textarea value={addC.companyAddress} onChange={e=>setAddC({...addC,companyAddress:e.target.value})} rows={2} placeholder="Необязательно" style={{...inp,resize:"vertical"}}/></div>
        </>}
        <div><L>Телефон</L><input value={addC.phone} onChange={e=>setAddC({...addC,phone:e.target.value})} placeholder="+66…" style={inp}/></div>
        <div><L>Email</L><input value={addC.email} onChange={e=>setAddC({...addC,email:e.target.value})} placeholder="Необязательно" style={inp}/></div>
        <div style={{display:"flex",gap:8}}><button onClick={()=>setAddC(null)} style={ghost}>Отмена</button><button onClick={doAddClient} disabled={busy} style={prim}>Добавить</button></div>
      </div>
    </Modal>}
    {addCar&&<Modal title="Новая машина" onClose={()=>setAddCar(null)}>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <div><L>Марка</L><input autoFocus value={addCar.make} onChange={e=>setAddCar({...addCar,make:e.target.value})} placeholder="BMW" style={inp}/></div>
          <div><L>Модель</L><input value={addCar.model} onChange={e=>setAddCar({...addCar,model:e.target.value})} placeholder="330i" style={inp}/></div>
        </div>
        <div><L>VIN</L><input value={addCar.vin} onChange={e=>setAddCar({...addCar,vin:e.target.value})} placeholder="Необязательно" style={inp}/></div>
        <div><L>Гос. номер</L><input value={addCar.plate} onChange={e=>setAddCar({...addCar,plate:e.target.value})} placeholder="Необязательно" style={inp}/></div>
        <div style={{display:"flex",gap:8}}><button onClick={()=>setAddCar(null)} style={ghost}>Отмена</button><button onClick={doAddCar} disabled={busy} style={prim}>Добавить</button></div>
      </div>
    </Modal>}
  </div>);
}

function ClientBase(){
  const inp={border:`1.5px solid ${C.border}`,borderRadius:8,padding:"8px 10px",fontSize:13,width:"100%",fontFamily:"inherit",outline:"none",boxSizing:"border-box"};
  const [clients,setClients]=useState([]);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [q,setQ]=useState("");
  const [expanded,setExpanded]=useState(null);
  const [clientForm,setClientForm]=useState(null);
  const [carForm,setCarForm]=useState(null);
  const [imp,setImp]=useState(null);
  const fileRef=useRef(null);

  const load=()=>{setLoading(true);apiGet('/directory').then(r=>{if(r.clients)setClients(r.clients);setLoading(false);}).catch(()=>setLoading(false));};
  useEffect(load,[]);

  const filtered=useMemo(()=>{
    const s=q.trim();
    if(!s)return clients;
    return clients.filter(c=>matchClient(c,s));
  },[clients,q]);

  const saveClient=async()=>{
    const c=clientForm;
    if(!c.name||!c.name.trim())return alert("Введите имя клиента");
    setBusy(true);await apiPost('/directory',{op:'upsertClient',client:c}).catch(()=>{});
    setBusy(false);setClientForm(null);load();
  };
  const delClient=async(id)=>{if(!confirm("Удалить клиента и все его машины?"))return;setBusy(true);await apiPost('/directory',{op:'deleteClient',id}).catch(()=>{});setBusy(false);load();};
  const saveCar=async()=>{setBusy(true);await apiPost('/directory',{op:'upsertCar',car:carForm}).catch(()=>{});setBusy(false);setCarForm(null);load();};
  const delCar=async(id)=>{if(!confirm("Удалить машину?"))return;setBusy(true);await apiPost('/directory',{op:'deleteCar',id}).catch(()=>{});setBusy(false);load();};

  // Формат = колонки исходного CRM-файла (для совместимости выгрузки/загрузки)
  const H=["Customer","Customer Email","Customer Phone","Company Name","License Plate","Make","Model","Sub Model","Year","Fuel Type","Vin Number","Drivetrain","Transmission Type","Body Type"];
  const exportXlsx=()=>{
    const rows=[];
    clients.forEach(c=>{
      const isComp=c.type==="company";
      const base={"Customer":isComp?(c.contactPerson||""):c.name,"Customer Email":c.email||"","Customer Phone":c.phone||"","Company Name":isComp?c.name:""};
      const carRow=car=>({...base,"License Plate":car.plate||"","Make":car.make||"","Model":car.model||"","Sub Model":car.submodel||"","Year":car.year||"","Fuel Type":car.fuel||"","Vin Number":car.vin||"","Drivetrain":car.drivetrain||"","Transmission Type":car.transmission||"","Body Type":car.bodytype||""});
      if(!c.cars||!c.cars.length)rows.push(carRow({}));
      else c.cars.forEach(car=>rows.push(carRow(car)));
    });
    const ws=XLSX.utils.json_to_sheet(rows,{header:H});
    ws["!cols"]=H.map(()=>({wch:16}));
    const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"Vehicle Customer Report");
    XLSX.writeFile(wb,`zen-garage-baza-${new Date().toISOString().slice(0,10)}.xlsx`);
  };
  const onFile=(e)=>{
    const file=e.target.files&&e.target.files[0];if(!file)return;
    const reader=new FileReader();
    reader.onload=(ev)=>{
      try{
        const wb=XLSX.read(ev.target.result,{type:'array'});
        const ws=wb.Sheets[wb.SheetNames[0]];
        const aoa=XLSX.utils.sheet_to_json(ws,{header:1,defval:""});
        let hi=aoa.findIndex(row=>row.some(c=>/customer|make|license plate|имя|марка/i.test(String(c))));
        if(hi<0)hi=0;
        const headers=aoa[hi].map(x=>String(x).trim());
        const g=(row,keys)=>{for(const k of keys){const i=headers.indexOf(k);if(i>=0&&row[i]!==undefined&&String(row[i]).trim()!=="")return String(row[i]).trim();}return "";};
        const map=new Map();
        aoa.slice(hi+1).forEach(row=>{
          if(!row.some(c=>c!==undefined&&String(c).trim()!==""))return;
          const customer=g(row,["Customer","Имя","Name","ФИО"]);
          const company=g(row,["Company Name","Компания"]);
          const phone=g(row,["Customer Phone","Телефон","Phone"]);
          const email=g(row,["Customer Email","Email","Почта"]);
          const name=company||customer;if(!name)return;
          const key=name.trim().toLowerCase()+"|"+phone.replace(/\D/g,"");
          if(!map.has(key))map.set(key,{name,type:company?"company":"individual",contactPerson:company?customer:"",phone,email,cars:[]});
          const car={make:g(row,["Make","Марка"]),model:g(row,["Model","Модель"]),submodel:g(row,["Sub Model","Подмодель"]),year:g(row,["Year","Год"]),fuel:g(row,["Fuel Type","Топливо"]),vin:g(row,["Vin Number","VIN","Вин"]),plate:g(row,["License Plate","Гос.номер","Номер","Госномер","Plate"]),drivetrain:g(row,["Drivetrain","Привод"]),transmission:g(row,["Transmission Type","Коробка"]),bodytype:g(row,["Body Type","Кузов"])};
          if(Object.values(car).some(Boolean))map.get(key).cars.push(car);
        });
        const list=[...map.values()];
        if(!list.length){alert("В файле не найдено клиентов. Нужна колонка «Customer» (или «Company Name»).");return;}
        setImp({list,cars:list.reduce((a,c)=>a+c.cars.length,0)});
      }catch(err){alert("Не удалось прочитать файл: "+err.message);}
    };
    reader.readAsArrayBuffer(file);
    e.target.value="";
  };
  const doImport=async(mode)=>{
    if(!imp)return;setBusy(true);
    const res=await apiPost('/directory',{op:'import',mode,clients:imp.list}).catch(()=>null);
    setBusy(false);setImp(null);
    if(res&&res.success)alert(`Готово. Добавлено клиентов: ${res.clientsAdded}, машин: ${res.carsAdded}.${mode==="upsert"?` Обновлено клиентов: ${res.clientsUpdated}, машин: ${res.carsUpdated}.`:` Пропущено дублей-машин: ${res.carsSkipped}.`}`);
    else alert("Ошибка импорта: "+((res&&res.error)||"неизвестно"));
    load();
  };
  const btn=(bg,color)=>({padding:"8px 12px",fontSize:12,fontWeight:700,border:"none",borderRadius:8,cursor:"pointer",background:bg,color});

  if(loading)return<div style={{padding:40,textAlign:"center",color:C.muted}}>Загрузка базы…</div>;

  return(<div style={{maxWidth:900,margin:"0 auto"}}>
    <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center",marginBottom:12}}>
      <input value={q} onChange={e=>setQ(e.target.value)} placeholder="🔍 Поиск: имя, телефон, машина, VIN, номер…" style={{...inp,flex:1,minWidth:220}}/>
      <button onClick={()=>setClientForm({name:"",phone:"",email:"",messenger:"",note:"",type:"individual",contactPerson:"",taxNumber:"",companyAddress:""})} style={btn(C.primary,"#fff")}>＋ Клиент</button>
      <button onClick={exportXlsx} style={btn("#E8F5E9",C.green)}>⬇ Скачать Excel</button>
      <button onClick={()=>fileRef.current&&fileRef.current.click()} style={btn("#EAF2FF",C.sub)}>⬆ Загрузить Excel</button>
      <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={onFile} style={{display:"none"}}/>
    </div>
    <div style={{fontSize:12,color:C.muted,marginBottom:10}}>Клиентов: {clients.length}{q?` · найдено: ${filtered.length}`:""}</div>
    {filtered.length===0?<div style={{padding:30,textAlign:"center",color:C.muted}}>Ничего не найдено</div>:
    filtered.map(c=>{
      const open=expanded===c.id;
      return(<div key={c.id} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,marginBottom:8,overflow:"hidden"}}>
        <div style={{padding:"10px 12px",display:"flex",alignItems:"center",gap:8,cursor:"pointer"}} onClick={()=>setExpanded(open?null:c.id)}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:14,fontWeight:700,color:C.primary}}>{c.type==="company"?"🏢 ":""}{c.name}{c.type==="company"?<span style={{marginLeft:6,fontSize:9,fontWeight:700,color:C.sub,background:"#EAF2FF",borderRadius:4,padding:"1px 6px",verticalAlign:"middle"}}>Компания</span>:null}</div>
            <div style={{fontSize:11,color:C.muted,marginTop:1}}>{c.phone?`📞 ${c.phone}`:""}{c.phone&&c.email?"  ·  ":""}{c.email?`✉ ${c.email}`:""}{(c.phone||c.email)&&c.messenger?"  ·  ":""}{c.messenger?`💬 ${c.messenger}`:""}{c.type==="company"&&c.contactPerson?`  ·  👤 ${c.contactPerson}`:""}</div>
          </div>
          <div style={{fontSize:11,color:C.sub,fontWeight:600,whiteSpace:"nowrap"}}>🚗 {c.cars.length}</div>
          <button onClick={e=>{e.stopPropagation();setClientForm({id:c.id,name:c.name,phone:c.phone||"",email:c.email||"",messenger:c.messenger||"",note:c.note||"",type:c.type||"individual",contactPerson:c.contactPerson||"",taxNumber:c.taxNumber||"",companyAddress:c.companyAddress||""});}} style={{...btn("transparent",C.sub),padding:"5px 7px"}}>✎</button>
          <button onClick={e=>{e.stopPropagation();delClient(c.id);}} style={{...btn("transparent",C.red),padding:"5px 7px"}}>🗑</button>
          <span style={{color:C.muted,fontSize:12}}>{open?"▲":"▼"}</span>
        </div>
        {open&&<div style={{padding:"0 12px 12px",borderTop:`1px solid ${C.border}`}}>
          {c.type==="company"&&(c.taxNumber||c.companyAddress)?<div style={{fontSize:12,color:C.muted,margin:"8px 0"}}>{c.taxNumber?<div>🧾 Налоговый №: {c.taxNumber}</div>:null}{c.companyAddress?<div>📍 {c.companyAddress}</div>:null}</div>:null}
          {c.note?<div style={{fontSize:12,color:C.muted,margin:"8px 0",fontStyle:"italic"}}>📝 {c.note}</div>:null}
          <div style={{marginTop:8}}>
            {c.cars.length===0&&<div style={{fontSize:12,color:C.muted,marginBottom:6}}>Машин пока нет</div>}
            {c.cars.map(car=>(<div key={car.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 8px",background:C.bg,borderRadius:8,marginBottom:5}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:600,color:C.primary}}>{[car.make,car.model,car.submodel].filter(Boolean).join(" ")||"—"}{car.year?` · ${car.year}`:""}</div>
                <div style={{fontSize:10,color:C.muted}}>{car.plate?`№ ${car.plate}`:""}{car.plate&&car.vin?"  ·  ":""}{car.vin?`VIN ${car.vin}`:""}</div>
                {(car.fuel||car.transmission||car.drivetrain||car.bodytype)?<div style={{fontSize:10,color:C.muted}}>{[car.fuel,car.transmission,car.drivetrain,car.bodytype].filter(Boolean).join(" · ")}</div>:null}
              </div>
              <button onClick={()=>setCarForm({id:car.id,client_id:c.id,make:car.make||"",model:car.model||"",submodel:car.submodel||"",year:car.year||"",fuel:car.fuel||"",vin:car.vin||"",plate:car.plate||"",drivetrain:car.drivetrain||"",transmission:car.transmission||"",bodytype:car.bodytype||""})} style={{...btn("transparent",C.sub),padding:"4px 7px"}}>✎</button>
              <button onClick={()=>delCar(car.id)} style={{...btn("transparent",C.red),padding:"4px 7px"}}>🗑</button>
            </div>))}
            <button onClick={()=>setCarForm({client_id:c.id,make:"",model:"",submodel:"",year:"",fuel:"",vin:"",plate:"",drivetrain:"",transmission:"",bodytype:""})} style={{...btn("#EAF2FF",C.sub),marginTop:4}}>＋ Машина</button>
          </div>
        </div>}
      </div>);
    })}
    {clientForm&&<Modal onClose={()=>setClientForm(null)} title={clientForm.id?"Редактировать клиента":"Новый клиент"}>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        <div><L>Тип клиента</L>
          <div style={{display:"flex",gap:8}}>
            {[["individual","👤 Индивидуальный"],["company","🏢 Компания"]].map(([v,l])=>(
              <button key={v} type="button" onClick={()=>setClientForm({...clientForm,type:v})} style={{flex:1,padding:"8px 6px",border:`2px solid ${clientForm.type===v?C.primary:C.border}`,borderRadius:8,background:clientForm.type===v?"#EAF2FF":"transparent",color:clientForm.type===v?C.primary:C.muted,fontSize:12,fontWeight:700,cursor:"pointer"}}>{l}</button>
            ))}
          </div>
        </div>
        <div><L>{clientForm.type==="company"?"Название компании *":"Имя *"}</L><input autoFocus value={clientForm.name} onChange={e=>setClientForm({...clientForm,name:e.target.value})} placeholder={clientForm.type==="company"?"ООО «Ромашка»":"Иван Иванов"} style={inp}/></div>
        {clientForm.type==="company"&&<>
          <div><L>Контактное лицо</L><input value={clientForm.contactPerson} onChange={e=>setClientForm({...clientForm,contactPerson:e.target.value})} placeholder="Имя представителя" style={inp}/></div>
          <div><L>Налоговый номер</L><input value={clientForm.taxNumber} onChange={e=>setClientForm({...clientForm,taxNumber:e.target.value})} placeholder="Необязательно" style={inp}/></div>
          <div><L>Адрес компании</L><textarea value={clientForm.companyAddress} onChange={e=>setClientForm({...clientForm,companyAddress:e.target.value})} rows={2} placeholder="Необязательно" style={{...inp,resize:"vertical"}}/></div>
        </>}
        <div><L>Телефон</L><input value={clientForm.phone} onChange={e=>setClientForm({...clientForm,phone:e.target.value})} placeholder="+66 ..." style={inp}/></div>
        <div><L>Email</L><input value={clientForm.email} onChange={e=>setClientForm({...clientForm,email:e.target.value})} placeholder="Необязательно" style={inp}/></div>
        <div><L>Мессенджер (Telegram/WhatsApp)</L><input value={clientForm.messenger} onChange={e=>setClientForm({...clientForm,messenger:e.target.value})} placeholder="@username / +66..." style={inp}/></div>
        <div><L>Заметка</L><textarea value={clientForm.note} onChange={e=>setClientForm({...clientForm,note:e.target.value})} rows={2} placeholder="Доп. информация" style={{...inp,resize:"vertical"}}/></div>
        <div style={{display:"flex",gap:8,marginTop:4}}>
          <button onClick={()=>setClientForm(null)} style={{...btn("#F0F4F8",C.primary),flex:1}}>Отмена</button>
          <button onClick={saveClient} disabled={busy} style={{...btn(C.primary,"#fff"),flex:2,opacity:busy?0.6:1}}>{busy?"…":"Сохранить"}</button>
        </div>
      </div>
    </Modal>}
    {carForm&&<Modal onClose={()=>setCarForm(null)} title={carForm.id?"Редактировать машину":"Новая машина"}>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <div><L>Марка</L><input autoFocus value={carForm.make} onChange={e=>setCarForm({...carForm,make:e.target.value})} placeholder="BMW" style={inp}/></div>
          <div><L>Модель</L><input value={carForm.model} onChange={e=>setCarForm({...carForm,model:e.target.value})} placeholder="330i" style={inp}/></div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <div><L>Подмодель</L><input value={carForm.submodel} onChange={e=>setCarForm({...carForm,submodel:e.target.value})} placeholder="Необязательно" style={inp}/></div>
          <div><L>Год</L><input value={carForm.year} onChange={e=>setCarForm({...carForm,year:e.target.value})} placeholder="2020" style={inp}/></div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          <div><L>Гос. номер</L><input value={carForm.plate} onChange={e=>setCarForm({...carForm,plate:e.target.value})} placeholder="Необязательно" style={inp}/></div>
          <div><L>VIN</L><input value={carForm.vin} onChange={e=>setCarForm({...carForm,vin:e.target.value})} placeholder="Необязательно" style={inp}/></div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
          <div><L>Топливо</L><input value={carForm.fuel} onChange={e=>setCarForm({...carForm,fuel:e.target.value})} placeholder="Бензин" style={inp}/></div>
          <div><L>Коробка</L><input value={carForm.transmission} onChange={e=>setCarForm({...carForm,transmission:e.target.value})} placeholder="АКПП" style={inp}/></div>
          <div><L>Привод</L><input value={carForm.drivetrain} onChange={e=>setCarForm({...carForm,drivetrain:e.target.value})} placeholder="4WD" style={inp}/></div>
        </div>
        <div><L>Кузов</L><input value={carForm.bodytype} onChange={e=>setCarForm({...carForm,bodytype:e.target.value})} placeholder="Sedan / SUV" style={inp}/></div>
        <div style={{display:"flex",gap:8,marginTop:4}}>
          <button onClick={()=>setCarForm(null)} style={{...btn("#F0F4F8",C.primary),flex:1}}>Отмена</button>
          <button onClick={saveCar} disabled={busy} style={{...btn(C.primary,"#fff"),flex:2,opacity:busy?0.6:1}}>{busy?"…":"Сохранить"}</button>
        </div>
      </div>
    </Modal>}
    {imp&&<Modal title="Загрузка из Excel" onClose={()=>setImp(null)}>
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        <div style={{fontSize:13,color:C.primary}}>В файле: <b>{imp.list.length}</b> клиентов, <b>{imp.cars}</b> машин.</div>
        <div style={{fontSize:12,color:C.muted}}>Дубли определяются по имя+телефон (клиент) и VIN / гос.номеру (машина).</div>
        <button onClick={()=>doImport('add')} disabled={busy} style={{padding:"11px 0",border:"none",borderRadius:8,background:C.primary,color:"#fff",fontWeight:700,cursor:"pointer",opacity:busy?0.6:1}}>➕ Добавить только новые</button>
        <button onClick={()=>doImport('upsert')} disabled={busy} style={{padding:"11px 0",border:`1.5px solid ${C.sub}`,borderRadius:8,background:"#EAF2FF",color:C.sub,fontWeight:700,cursor:"pointer",opacity:busy?0.6:1}}>🔄 Добавить + обновить совпавших</button>
        <button onClick={()=>setImp(null)} style={{padding:"9px 0",border:`1px solid ${C.border}`,borderRadius:8,background:"#F0F4F8",color:C.primary,fontWeight:600,cursor:"pointer"}}>Отмена</button>
      </div>
    </Modal>}
  </div>);
}

// ── JOB CARD (шаг 1: каркас) ─────────────────────────────────────────────────
const money=n=>"THB "+Number(n||0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
function JobCard(){
  const inp={border:`1.5px solid ${C.border}`,borderRadius:8,padding:"8px 10px",fontSize:12,width:"100%",fontFamily:"inherit",outline:"none",boxSizing:"border-box"};
  const [dir,setDir]=useState([]);
  const [client,setClient]=useState(""),[car,setCar]=useState("");
  const [clientId,setClientId]=useState(null),[carId,setCarId]=useState(null);
  const [status,setStatus]=useState("draft");
  const [services,setServices]=useState([]);
  const [parts,setParts]=useState([]);
  const [remarks,setRemarks]=useState("");
  useEffect(()=>{apiGet('/directory').then(r=>setDir(r.clients||[])).catch(()=>{});},[clientId,carId]);
  const selClient=dir.find(c=>c.id===clientId);
  const selCar=selClient&&(selClient.cars||[]).find(x=>x.id===carId);

  const STATUSES=[["draft","📝 Черновик"],["checkin","➡ Приёмка"],["checkout","📤 Выдача"]];
  const calcRow=r=>{const sub=(+r.qty||0)*(+r.rate||0);return sub-sub*((+r.disc||0)/100);};
  const allRows=[...services,...parts];
  const sumSub=allRows.reduce((a,r)=>a+calcRow(r),0);
  const totalCost=allRows.reduce((a,r)=>a+(+r.cost||0),0);
  const vat=sumSub*0.07, total=sumSub+vat, profit=sumSub-totalCost;
  const profitPct=totalCost>0?(profit/totalCost*100):(sumSub>0?100:0);

  const th={padding:"8px 10px",fontSize:10,fontWeight:700,textTransform:"uppercase",color:C.muted,whiteSpace:"nowrap"};
  const td={padding:"9px 10px",fontSize:12,color:C.primary,whiteSpace:"nowrap"};
  const section=(title,icon,rows,onAdd,addLabel,extra)=>(
    <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,marginBottom:14,overflow:"hidden"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",borderBottom:`1px solid ${C.border}`,gap:8,flexWrap:"wrap"}}>
        <div style={{fontWeight:800,color:C.primary,fontSize:14}}>{icon} {title}
          <span style={{marginLeft:8,background:C.sub,color:"#fff",borderRadius:20,padding:"1px 8px",fontSize:11}}>{rows.length}</span></div>
        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
          {extra}
          <input placeholder="Поиск…" style={{...inp,width:140,padding:"6px 10px"}}/>
          <button onClick={onAdd} style={{padding:"7px 14px",fontSize:12,fontWeight:700,border:"none",borderRadius:8,cursor:"pointer",background:C.primary,color:"#fff"}}>＋ {addLabel}</button>
        </div>
      </div>
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",minWidth:820}}>
          <thead><tr style={{textAlign:"left",background:C.bg}}>
            <th style={{...th,width:28}}></th><th style={th}>Позиция</th><th style={th}>Техник</th><th style={th}>Метки</th>
            <th style={th}>Кол-во/ч</th><th style={th}>Ставка</th><th style={th}>Налог</th><th style={th}>Скидка</th><th style={{...th,textAlign:"right"}}>Сумма</th>
          </tr></thead>
          <tbody>
            {rows.length===0?<tr><td colSpan={9} style={{padding:"22px",textAlign:"center",color:C.muted,fontSize:12}}>Пока нет позиций — нажмите «＋ {addLabel}»</td></tr>:
             rows.map((r,i)=>(<tr key={i} style={{borderTop:`1px solid ${C.border}`}}>
               <td style={{...td,width:28}}><input type="checkbox"/></td>
               <td style={td}><div style={{fontWeight:700}}>{r.item}</div>
                 <div style={{fontSize:10,color:C.muted}}>Себест.: {money(r.cost)} · Прибыль: {money(calcRow(r)-(+r.cost||0))}</div>
                 {r.tag&&<div style={{fontSize:10,color:C.muted}}>🏷 {r.tag}</div>}</td>
               <td style={{...td,color:C.sub,fontWeight:600,cursor:"pointer"}}>{r.technician||"Назначить"}</td>
               <td style={td}><span style={{fontSize:11,color:C.muted,border:`1px dashed ${C.border}`,borderRadius:6,padding:"2px 8px"}}>＋ Метка</span></td>
               <td style={td}>{r.qty}</td><td style={td}>{money(r.rate)}</td><td style={td}>{r.tax||0}%</td><td style={td}>{r.disc||0}%</td>
               <td style={{...td,textAlign:"right",fontWeight:700}}>{money(calcRow(r))}</td>
             </tr>))}
            {rows.length>0&&<tr style={{borderTop:`2px solid ${C.border}`,background:C.bg,fontWeight:700}}>
              <td style={td}></td><td style={td}>Итого</td><td style={td}></td><td style={td}></td>
              <td style={td}>{rows.reduce((a,r)=>a+(+r.qty||0),0)}</td>
              <td style={td}>{money(rows.reduce((a,r)=>a+(+r.rate||0),0))}</td><td style={td}></td><td style={td}></td>
              <td style={{...td,textAlign:"right"}}>{money(rows.reduce((a,r)=>a+calcRow(r),0))}</td>
            </tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
  const soon=()=>alert("Форму добавления сделаем на следующем шаге 🙂");

  return(<div style={{maxWidth:1040,margin:"0 auto"}}>
    {/* Верхняя панель: номера + дата + иконки */}
    <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",flexWrap:"wrap",gap:8,marginBottom:12}}>
      <div>
        <div style={{fontSize:17,fontWeight:800,color:C.primary}}>ЗАКАЗ-000001 <span style={{color:C.muted}}>|</span> СМЕТА-000001 <span style={{color:C.sub}}>| СЧЁТ-000001</span></div>
        <div style={{fontSize:12,color:C.muted,marginTop:3,display:"flex",alignItems:"center",gap:8}}>
          {today().toLocaleDateString("ru",{day:"numeric",month:"short",year:"numeric"})}
          <span style={{background:"#EAF7EE",color:C.green,fontWeight:700,fontSize:11,padding:"2px 10px",borderRadius:20}}>Открыта</span>
        </div>
      </div>
      <div style={{display:"flex",gap:10,fontSize:16}}>{["📋","📦","🔔","📊","📈","⏱","⋯"].map((ic,i)=><span key={i} style={{cursor:"pointer",opacity:0.65}}>{ic}</span>)}</div>
    </div>

    {/* Клиент / машина / адреса + ремарки */}
    <div style={{display:"flex",gap:12,flexWrap:"wrap",marginBottom:14}}>
      <div style={{flex:"1 1 340px",minWidth:280,display:"flex",flexDirection:"column",gap:8}}>
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:12}}>
          <ClientCarPicker client={client} car={car} clientId={clientId} carId={carId} inp={inp}
            onChange={p=>{if('client'in p)setClient(p.client);if('car'in p)setCar(p.car);if('clientId'in p)setClientId(p.clientId);if('carId'in p)setCarId(p.carId);}}/>
        </div>
        {selClient&&<div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"10px 12px",display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:36,height:36,borderRadius:10,background:C.sub,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>👤</div>
          <div style={{flex:1,minWidth:0}}><div style={{fontSize:14,fontWeight:700,color:C.sub}}>{selClient.name}</div>
            <div style={{fontSize:11,color:C.muted}}>{selClient.phone?`📞 ${selClient.phone}`:"телефон не указан"}{selClient.messenger?`  ·  💬 ${selClient.messenger}`:""}</div></div>
        </div>}
        {selCar&&<div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"10px 12px",display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:36,height:36,borderRadius:10,background:"#D9D6F5",color:"#26215C",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>🚗</div>
          <div style={{flex:1,minWidth:0}}><div style={{fontSize:14,fontWeight:700,color:C.primary}}>{[selCar.make,selCar.model].filter(Boolean).join(" ")||"Машина"}</div>
            <div style={{fontSize:11,color:C.muted}}>{selCar.plate?`Номер: ${selCar.plate}   `:""}{selCar.vin?`VIN: ${selCar.vin}`:""}</div></div>
        </div>}
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"10px 12px",display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:16}}>📍</span><div><div style={{fontSize:12,fontWeight:700,color:C.primary}}>Адрес счёта</div><div style={{fontSize:11,color:C.muted}}>{selClient?"Пхукет, 83000":"не указан"}</div></div>
        </div>
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"10px 12px",display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:16}}>🚚</span><div><div style={{fontSize:12,fontWeight:700,color:C.primary}}>Адрес доставки</div><div style={{fontSize:11,color:C.muted}}>{selClient?"Пхукет, 83000":"не указан"}</div></div>
        </div>
      </div>
      <div style={{flex:"1 1 300px",minWidth:260}}>
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:12,height:"100%",boxSizing:"border-box"}}>
          <div style={{fontSize:13,fontWeight:800,color:C.primary,marginBottom:8}}>📝 Ремарки клиента и рекомендации</div>
          <textarea value={remarks} onChange={e=>setRemarks(e.target.value)} rows={7} placeholder="Пожелания клиента, рекомендации сервиса, инструкции…" style={{...inp,resize:"vertical"}}/>
        </div>
      </div>
    </div>

    {/* Статусы */}
    <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center",marginBottom:16}}>
      {STATUSES.map(([id,l],i)=>(<span key={id} style={{display:"flex",alignItems:"center",gap:6}}>
        {i>0&&<span style={{color:C.muted}}>›</span>}
        <button onClick={()=>setStatus(id)} style={{padding:"8px 16px",borderRadius:20,border:`1.5px solid ${status===id?C.primary:C.border}`,background:status===id?C.primary:C.card,color:status===id?"#fff":C.muted,fontSize:12,fontWeight:700,cursor:"pointer"}}>{l}</button>
      </span>))}
    </div>

    {/* Услуги и запчасти */}
    {section("Услуги","🛠",services,soon,"Услуга",<span style={{background:C.red,color:"#fff",fontSize:11,fontWeight:700,borderRadius:20,padding:"3px 10px"}}>Авторизации 1</span>)}
    {section("Запчасти","🔩",parts,soon,"Запчасть")}

    {/* Итоги как в референсе */}
    <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:16,maxWidth:380,marginLeft:"auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:14,marginBottom:8}}><span style={{color:C.muted}}>Authorised (сумма)</span><b style={{color:C.primary}}>{money(sumSub)}</b></div>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:8,paddingLeft:8,borderLeft:`2px solid ${C.border}`}}><span style={{color:C.muted}}>НДС [7%]</span><span style={{color:C.muted}}>{money(vat)}</span></div>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:16,fontWeight:800,paddingTop:8,borderTop:`1px solid ${C.border}`,marginBottom:12}}><span style={{color:C.primary}}>Всего</span><span style={{color:C.primary}}>{money(total)}</span></div>
      <div style={{display:"flex",gap:8}}>
        <div style={{flex:1,background:"#FEF3CD",borderRadius:10,padding:"10px 12px"}}><div style={{fontSize:10,color:"#8A6D00",fontWeight:700}}>🛒 Себестоимость</div><div style={{fontSize:14,fontWeight:800,color:"#8A6D00"}}>{money(totalCost)}</div></div>
        <div style={{flex:1,background:"#E6F6E9",borderRadius:10,padding:"10px 12px"}}><div style={{fontSize:10,color:C.green,fontWeight:700}}>📈 Прибыль ({profitPct.toFixed(0)}%)</div><div style={{fontSize:14,fontWeight:800,color:C.green}}>{money(profit)}</div></div>
      </div>
    </div>

    {/* Нижняя панель: Оплатить */}
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:16,padding:"12px 4px",flexWrap:"wrap",gap:10}}>
      <div style={{fontSize:13,color:C.muted,fontWeight:600}}>💵 Оплата по счёту</div>
      <button onClick={()=>alert("Приём оплаты сделаем на следующем шаге 🙂")} style={{padding:"11px 28px",fontSize:14,fontWeight:800,border:"none",borderRadius:10,cursor:"pointer",background:C.primary,color:"#fff"}}>Оплатить</button>
    </div>
  </div>);
}

// ── MAIN APP ──────────────────────────────────────────────────────────────────
export default function App(){
  const [staff,setStaff]      = useState(INIT_STAFF);
  const [bookings,setBook]    = useState({});
  const [loading,setLoading]  = useState(true);
  const [syncing,setSyncing]  = useState(false);
  const [lastSync,setLastSync]= useState(null);
  const [appTab,setAppTab]    = useState("calendar");
  const [view,setView]        = useState("month");
  const [curDate,setCurDate]  = useState(today);
  const [curMonth,setCurMonth]= useState(()=>{const d=today();return new Date(d.getFullYear(),d.getMonth(),1);});
  const [weekStart,setWS]     = useState(()=>{const d=today(),dow=(d.getDay()+6)%7;return addDays(d,-dow);});
  const [activeStaff,setAS]   = useState("all");
  const [modal,setModal]      = useState(null);

  // ── Загрузка данных при старте ─────────────────────────────────────────────
  useEffect(()=>{
    Promise.all([
      apiGet('/bookings').catch(()=>({bookings:{}})),
      apiGet('/staff').catch(()=>({staff:null})),
    ]).then(([bRes, sRes])=>{
      if(bRes.bookings) setBook(bRes.bookings);
      if(sRes.staff)    setStaff(sRes.staff);
      setLastSync(new Date());
      setLoading(false);
    }).catch(()=>setLoading(false));
  },[]);

  // ── Автообновление каждые 30 секунд ───────────────────────────────────────
  useEffect(()=>{
    const interval=setInterval(()=>{
      apiGet('/bookings').then(r=>{ if(r.bookings){ setBook(r.bookings); setLastSync(new Date()); } }).catch(()=>{});
    }, 30000);
    return ()=>clearInterval(interval);
  },[]);

  // ── Сохранение настроек сотрудников при изменении ─────────────────────────
  const staffSaveTimer = useRef(null);
  useEffect(()=>{
    if(loading) return;
    clearTimeout(staffSaveTimer.current);
    staffSaveTimer.current=setTimeout(()=>{
      apiPost('/staff',{staff}).catch(()=>{});
    },1500); // debounce 1.5с
  },[staff]);

  const book=(key,data)=>{
    setBook(p=>({...p,[key]:data}));
    // Сохранить в БД
    setSyncing(true);
    apiPost('/bookings',{bookings:[{key,data}]})
      .then(()=>{setSyncing(false);setLastSync(new Date());})
      .catch(()=>setSyncing(false));
  };

  const unbook=key=>{
    setBook(p=>{const n={...p};delete n[key];return n;});
    setSyncing(true);
    apiDelete('/bookings',{key})
      .then(()=>{setSyncing(false);setLastSync(new Date());})
      .catch(()=>setSyncing(false));
  };

  const openSlot=(s,sl,date,existing,key)=>{
    if(existing){
      setModal({type:"single",staff:s,slot:sl,date,existing:{...existing,key},key});
    } else {
      setModal({type:"smart",staff:s,startDate:date,initialSlot:sl});
    }
  };

  const confirmMulti=bookData=>{
    setBook(p=>{const n={...p};bookData.forEach(({key,data})=>{n[key]=data;});return n;});
    setModal(null);
    // Сохранить все слоты группы в БД
    setSyncing(true);
    apiPost('/bookings',{bookings:bookData})
      .then(()=>{setSyncing(false);setLastSync(new Date());})
      .catch(()=>setSyncing(false));
  };

  const tdStats=useMemo(()=>{
    const td=today(),dow=(td.getDay()+6)%7+1;let t=0,b=0;
    staff.forEach(s=>{if(!s.workDays.includes(dow))return;buildSlots(s).forEach(sl=>{t++;if(bookings[bKey(s.id,td,sl.id)])b++;});});
    return{t,b,free:t-b};
  },[staff,bookings]);

  const prevP=()=>{if(view==="month")setCurMonth(m=>new Date(m.getFullYear(),m.getMonth()-1,1));else if(view==="week")setWS(w=>addDays(w,-7));else setCurDate(d=>addDays(d,-1));};
  const nextP=()=>{if(view==="month")setCurMonth(m=>new Date(m.getFullYear(),m.getMonth()+1,1));else if(view==="week")setWS(w=>addDays(w,7));else setCurDate(d=>addDays(d,1));};
  const goToday=()=>{const t=today();setCurDate(t);setCurMonth(new Date(t.getFullYear(),t.getMonth(),1));setWS(addDays(t,-((t.getDay()+6)%7)));};
  const pLabel=()=>{
    if(view==="month")return`${MONTHS_RU[curMonth.getMonth()]} ${curMonth.getFullYear()}`;
    if(view==="week"){const e=addDays(weekStart,6);return`${weekStart.getDate()} ${MONTHS_RU[weekStart.getMonth()]} — ${e.getDate()} ${MONTHS_RU[e.getMonth()]}`;}
    return curDate.toLocaleDateString("ru",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
  };
  const nb=(l,fn,a)=><button onClick={fn} style={{padding:"5px 11px",fontSize:11,fontWeight:600,border:"none",cursor:"pointer",borderRadius:6,background:a?C.primary:"transparent",color:a?"#fff":C.muted}}>{l}</button>;

  if(loading) return(
    <div style={{fontFamily:"'Inter',system-ui,sans-serif",background:C.primary,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:16}}>
      <div style={{fontSize:48}}>🔧</div>
      <div style={{color:"#fff",fontSize:18,fontWeight:700}}>ZEN GARAGE PHUKET</div>
      <div style={{color:"#7BAAC8",fontSize:13}}>Загрузка данных из базы...</div>
      <div style={{width:40,height:4,borderRadius:2,background:"rgba(255,255,255,0.2)",overflow:"hidden"}}>
        <div style={{width:"40%",height:"100%",background:"#7DC8A8",borderRadius:2,animation:"none"}}/>
      </div>
    </div>
  );

  return(<div style={{fontFamily:"'Inter',system-ui,sans-serif",background:C.bg,minHeight:"100vh"}}>
    {modal?.type==="smart"&&<SmartBookingModal staff={modal.staff} allStaff={staff} startDate={modal.startDate} initialSlot={modal.initialSlot} bookings={bookings} onConfirm={confirmMulti} onClose={()=>setModal(null)}/>}
    {modal?.type==="single"&&<SlotModal staff={modal.staff} slot={modal.slot} date={modal.date} existing={modal.existing} onSave={data=>{book(modal.key,data);setModal(null);}} onDelete={()=>{unbook(modal.key);setModal(null);}} onClose={()=>setModal(null)}/>}

    <div style={{background:C.primary,padding:"10px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
      <div>
        <div style={{fontSize:9,color:"#7BAAC8",fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase"}}>ZEN GARAGE PHUKET</div>
        <div style={{fontSize:16,fontWeight:800,color:"#fff",marginTop:1}}>{appTab==="calendar"?"Календарь записи":appTab==="finder"?"Подбор слота":appTab==="jobcard"?"Джоб-карта":appTab==="clients"?"База клиентов":"Настройки команды"}</div>
        {lastSync&&<div style={{fontSize:8,color:"#5A8AAC",marginTop:1}}>
          {syncing?"⟳ Сохранение...":"✓ Sync "+lastSync.toLocaleTimeString('ru',{timeZone:TZ,hour:'2-digit',minute:'2-digit'})}
        </div>}
      </div>
      <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
        {appTab==="calendar"&&<div style={{display:"flex",gap:12}}>
          {[["🗓",`${tdStats.b}/${tdStats.t} записей`,"#FBC84A"],["✅",`${tdStats.free} своб.`,"#7DC8A8"]].map(([l,v,col])=>(
            <div key={l} style={{textAlign:"center"}}><div style={{fontSize:8,color:"#7BAAC8"}}>{l}</div><div style={{fontSize:13,fontWeight:800,color:col}}>{v}</div></div>
          ))}
        </div>}
        <div style={{display:"flex",gap:3,background:"rgba(255,255,255,0.1)",borderRadius:8,padding:3}}>
          {[["calendar","📅 Календарь"],["finder","🔍 Подбор"],["jobcard","🧾 Джоб-карт"],["clients","👥 База"],["settings","⚙️ Настройки"]].map(([id,l])=>(
            <button key={id} onClick={()=>setAppTab(id)} style={{padding:"5px 11px",fontSize:11,fontWeight:700,border:"none",cursor:"pointer",borderRadius:6,background:appTab===id?"#fff":"transparent",color:appTab===id?C.primary:"rgba(255,255,255,0.8)"}}>{l}</button>
          ))}
        </div>
      </div>
    </div>

    <div style={{maxWidth:1200,margin:"0 auto",padding:14}}>
      {appTab==="calendar"&&(<>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10,flexWrap:"wrap",gap:8}}>
          <div style={{display:"flex",alignItems:"center",gap:5}}>
            <button onClick={prevP} style={{width:28,height:28,borderRadius:7,border:`1px solid ${C.border}`,background:C.card,cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center"}}>‹</button>
            <div style={{fontSize:13,fontWeight:700,color:C.primary,minWidth:200,textAlign:"center"}}>{pLabel()}</div>
            <button onClick={nextP} style={{width:28,height:28,borderRadius:7,border:`1px solid ${C.border}`,background:C.card,cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center"}}>›</button>
            <button onClick={goToday} style={{padding:"4px 9px",border:`1px solid ${C.border}`,borderRadius:7,background:C.card,cursor:"pointer",fontSize:11,fontWeight:600,color:C.sub}}>Сегодня</button>
          </div>
          <div style={{display:"flex",gap:3,background:C.card,borderRadius:8,padding:3,boxShadow:"0 1px 4px rgba(0,0,0,0.06)"}}>
            {nb("Месяц",()=>setView("month"),view==="month")}
            {nb("Неделя",()=>{const d=(today().getDay()+6)%7;setWS(addDays(today(),-d));setView("week");},view==="week")}
            {nb("День",()=>{setCurDate(today());setView("day");},view==="day")}
          </div>
        </div>
        <div style={{display:"flex",gap:5,marginBottom:10,flexWrap:"wrap"}}>
          <button onClick={()=>setAS("all")} style={{padding:"4px 11px",borderRadius:99,border:`2px solid ${activeStaff==="all"?C.primary:C.border}`,background:activeStaff==="all"?C.primary:C.card,color:activeStaff==="all"?"#fff":C.muted,fontSize:11,fontWeight:700,cursor:"pointer"}}>👥 Все</button>
          {staff.map(s=><button key={s.id} onClick={()=>setAS(s.id)} style={{padding:"4px 11px",borderRadius:99,border:`2px solid ${activeStaff===s.id?s.color:"transparent"}`,background:activeStaff===s.id?s.color:C.card,color:activeStaff===s.id?s.textColor:C.muted,fontSize:11,fontWeight:700,cursor:"pointer"}}>{s.emoji} {s.name}</button>)}
        </div>
        <div style={{background:C.card,borderRadius:12,padding:12,boxShadow:"0 1px 8px rgba(26,63,92,0.07)"}}>
          {view==="month"&&<MonthView staff={staff} bookings={bookings} onDayClick={d=>{setCurDate(d);setView("day");}} currentDate={curMonth} activeStaffId={activeStaff}/>}
          {view==="week"&&<WeekView weekStart={weekStart} staff={staff} bookings={bookings} onDayClick={d=>{setCurDate(d);setView("day");}} onSlotClick={openSlot} activeStaffId={activeStaff}/>}
          {view==="day"&&<DayView date={curDate} staff={staff} bookings={bookings} onSlotClick={openSlot} activeStaffId={activeStaff}/>}
        </div>
        <div style={{display:"flex",gap:10,marginTop:10,flexWrap:"wrap",fontSize:10,color:C.muted,alignItems:"center"}}>
          {[["#27AE60","✅ Подтверждён"],["#F39C12","⏳ Ожидание"],["#E74C3C","❌ Отменён"]].map(([col,l])=>(
            <div key={l} style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:9,height:9,borderRadius:2,background:col}}/>{l}</div>
          ))}
          <div style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:9,height:9,borderRadius:2,border:`2px dashed ${C.border}`}}/> Свободный слот</div>
          <div style={{display:"flex",alignItems:"center",gap:4,color:C.primary}}><span>⛓</span> Продолжение</div>
          <div style={{marginLeft:"auto",color:C.sub}}>Нажмите слот → укажите время → система подберёт даты</div>
        </div>
      </>)}
      {appTab==="finder"&&<SlotFinder staff={staff} bookings={bookings} onConfirm={confirmMulti}/>}
      {appTab==="jobcard"&&<div style={{padding:"12px 16px 30px"}}><JobCard/></div>}
      {appTab==="clients"&&<div style={{padding:"12px 16px 30px"}}><ClientBase/></div>}
      {appTab==="settings"&&<StaffSettings staff={staff} setStaff={setStaff}/>}
    </div>
  </div>);
}
