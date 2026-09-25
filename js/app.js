// Порция — логика приложения.
// Пока работает в «локальном режиме»: облако и ИИ были возможностями Claude.
// На этапе 3 хранение и вход переедут на Supabase.

/* ============ theme ============ */
// Системное — как на устройстве (на iPhone с «Автоматически» меняется по времени суток).
// Выбор хранится только на этом устройстве, как в настройках телефона.
const THEME_KEY="tarelka-theme";
function applyTheme(t){
  if(t==="light"||t==="dark")document.documentElement.setAttribute("data-app-theme",t);
  else document.documentElement.removeAttribute("data-app-theme");
}
function loadTheme(){try{return localStorage.getItem(THEME_KEY)||"system"}catch(e){return "system"}}
function saveTheme(t){try{localStorage.setItem(THEME_KEY,t)}catch(e){}}
applyTheme(loadTheme());

/* ============ Порция Плюс (демо, без оплаты) ============ */
// ВНИМАНИЕ: статус хранится в браузере — годится только для демо.
// В настоящем приложении подписку проверяет сервер, иначе её включат через DevTools.
const PLUS_KEY="tarelka-demo-plus", AI_KEY="tarelka-ai-uses", FREE_AI=3;
const LOCK_SVG='<svg class="lockic" viewBox="0 0 12 12" aria-hidden="true"><rect x="2" y="5.5" width="8" height="5.5" rx="1.2" fill="currentColor"/><path d="M4 5.5V4a2 2 0 0 1 4 0v1.5" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>';
function isPlus(){try{return localStorage.getItem(PLUS_KEY)==="1"}catch(e){return false}}
function setPlus(on){try{on?localStorage.setItem(PLUS_KEY,"1"):localStorage.removeItem(PLUS_KEY)}catch(e){}}
function aiUsedToday(){try{const v=JSON.parse(localStorage.getItem(AI_KEY)||"{}");return v.date===iso(new Date())?v.n||0:0}catch(e){return 0}}
function countAI(){if(isPlus())return;try{localStorage.setItem(AI_KEY,JSON.stringify({date:iso(new Date()),n:aiUsedToday()+1}))}catch(e){}}
function canUseAI(){return isPlus()||aiUsedToday()<FREE_AI}
function aiLeftText(){return isPlus()?"":`Бесплатно осталось ${Math.max(0,FREE_AI-aiUsedToday())} из ${FREE_AI} ИИ-расчётов на сегодня.`}

/* ============ helpers ============ */
const $=id=>document.getElementById(id);
const pad=n=>String(n).padStart(2,"0");
const iso=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const parse=s=>{const[y,m,d]=s.split("-").map(Number);return new Date(y,m-1,d)};
const addDays=(s,n)=>{const d=parse(s);d.setDate(d.getDate()+n);return iso(d)};
const daysBetween=(a,b)=>Math.round((parse(b)-parse(a))/86400000);
const today=()=>iso(new Date());
const monday=s=>addDays(s,-((parse(s).getDay()+6)%7));
const nowHM=()=>{const d=new Date();return `${pad(d.getHours())}:${pad(d.getMinutes())}`};
const fmtDay=new Intl.DateTimeFormat("ru-RU",{weekday:"long",day:"numeric",month:"long"});
const fmtWd=new Intl.DateTimeFormat("ru-RU",{weekday:"short"});
const fmtShort=new Intl.DateTimeFormat("ru-RU",{day:"numeric",month:"short"});
const _fmtDate=new Intl.DateTimeFormat("ru-RU",{day:"numeric",month:"long",year:"numeric"});
const fmtDate={format:d=>_fmtDate.format(d).replace(/\s*г\.$/,"")};
const fmtN=(n,d=0)=>Number(n).toLocaleString("ru-RU",{maximumFractionDigits:d,minimumFractionDigits:d});
const mk=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e};
const sum=(arr,f)=>arr.reduce((s,x)=>s+(Number(f(x))||0),0);
const isNum=v=>typeof v==="number"&&isFinite(v);

/* ============ state ============ */
const TYPES=[
  {id:"breakfast",label:"Завтрак",c:"--c-breakfast",h:[5,11]},
  {id:"lunch",label:"Обед",c:"--c-lunch",h:[11,16]},
  {id:"dinner",label:"Ужин",c:"--c-dinner",h:[16,23]},
  {id:"snack",label:"Перекус",c:"--c-snack",h:null},
];
const T=Object.fromEntries(TYPES.map(t=>[t.id,t]));
const MAIN=["breakfast","lunch","dinner"];
const ACT=[
  {v:1.2,l:"Сидячая работа, почти без спорта"},
  {v:1.375,l:"Лёгкая: 1–3 тренировки в неделю"},
  {v:1.55,l:"Средняя: 3–5 тренировок в неделю"},
  {v:1.725,l:"Высокая: 6–7 тренировок или физический труд"},
];
const GOALS={weight:"Изменить вес",keep:"Удерживать вес",regular:"Питаться регулярно",veggies:"Больше овощей и фруктов"};
const VEG_TARGET=3;          // приёмов с овощами/фруктами в день
const KCAL_PER_KG=7700;

let selected=today(), statsWeek=monday(today()), currentTab="diary";
let meals=[], weights=[], favorites=[];
let plan=null, editingPlan=false;
let db=null, profileRef=null, mealsCol=null, weightsCol=null, favCol=null, settingsRef=null;
const REM_DEFAULT={on:true,times:{breakfast:"10:00",lunch:"14:00",dinner:"20:00"}};
let settings={reminders:structuredClone(REM_DEFAULT),skipped:{date:"",types:[]}};
const snoozed={};
let editingMeal=null;
let loaded={meals:false,settings:false,profile:false};
const NUDGE_TEXT={
  breakfast:"Пора позавтракать? Завтрак сегодня ещё не записан.",
  lunch:"Время обеда — обед ещё не записан.",
  dinner:"Время ужина — ужин ещё не записан.",
};
const SKIP_TEXT={breakfast:"Сегодня без завтрака",lunch:"Сегодня без обеда",dinner:"Сегодня без ужина"};
let sample=null, est=null;   // est = {name, per100, p100, f100, c100, veg, note}
let pendingDelete=null, pendingWDelete=null;

/* ============ plan math ============ */
// Mifflin–St Jeor + safety limits. Numbers only; wording lives elsewhere.
function calcPlan(p){
  const r={};
  const h=p.height/100;
  r.bmr=10*p.weight+6.25*p.height-5*p.age+(p.sex==="m"?5:-161);
  r.tdee=r.bmr*p.activity;
  r.floor=p.sex==="m"?1500:1200;
  r.minHealthy=Math.ceil(18.5*h*h*10)/10;
  const goal=p.goal||"weight";
  const diff=p.target-p.weight;
  if(goal!=="weight") r.goal="keep";
  else if(Math.abs(diff)<0.5) r.goal="keep";
  else if(p.dir&&Math.sign(diff)!==p.dir){r.goal="keep";r.reached=true}
  else r.goal=diff<0?"lose":"gain";
  if(goal==="weight"&&Math.abs(diff)<0.5&&p.dir)r.reached=true;
  if(r.goal==="lose"&&p.target<r.minHealthy){r.error="underweight";return r}
  if(r.goal==="keep"){r.kcal=Math.round(r.tdee/10)*10;r.pace=0;addMacros(r,p);return r}
  const lose=r.goal==="lose";
  let maxPace=lose?Math.min(1,p.weight*0.01):0.5;
  if(lose)maxPace=Math.min(maxPace,(r.tdee-r.floor)*7/KCAL_PER_KG);
  if(maxPace<0.1){r.error="nofloor";return r}
  r.maxPace=maxPace;
  r.autoPace=Math.min(lose?0.5:0.25,maxPace);
  const kg=Math.abs(diff);
  r.autoDate=addDays(p.start,Math.ceil(kg/r.autoPace*7));
  r.pace=r.autoPace;r.limited=false;
  if(p.deadline){
    const days=daysBetween(p.start,p.deadline);
    if(days<7){r.error="deadline";return r}
    r.neededPace=kg/(days/7);
    if(r.neededPace>maxPace){r.pace=maxPace;r.limited=true}else r.pace=r.neededPace;
  }
  r.eta=addDays(p.start,Math.ceil(kg/r.pace*7));
  const delta=r.pace*KCAL_PER_KG/7;
  r.kcal=Math.round((lose?r.tdee-delta:r.tdee+delta)/10)*10;
  if(lose)r.kcal=Math.max(r.kcal,r.floor);
  r.level=r.pace<=0.5?"Мягкий":r.pace<=0.75?"Умеренный":"Интенсивный";
  addMacros(r,p);
  return r;
}
// Белок от веса (не выше веса при ИМТ 25), жиры 28% калорий, углеводы — остаток.
function addMacros(r,p){
  const h=p.height/100;
  const refW=Math.min(p.weight,25*h*h);
  const perKg=r.goal==="keep"?1.2:1.6;
  r.protein=Math.round(refW*perKg);
  r.fat=Math.round(r.kcal*0.28/9);
  r.carbs=Math.max(0,Math.round((r.kcal-r.protein*4-r.fat*9)/4));
}
// План пересчитывается от последнего записанного веса.
function effPlan(){
  if(!plan)return null;
  const p={goal:"weight",...plan};
  const latest=latestWeight();
  if(isPlus()&&latest&&latest.date>=p.start&&(latest.date!==p.start||latest.kg!==p.weight)){
    return {...p,weight:latest.kg,start:latest.date,anchored:true};
  }
  return p;
}
function latestWeight(){return weights.length?[...weights].sort((a,b)=>b.date.localeCompare(a.date))[0]:null}

/* ============ tabs ============ */
function setTab(t){
  currentTab=t;
  for(const k of ["diary","weight","stats","plan"]){
    $("tab-"+k).setAttribute("aria-selected",k===t);
    $("view-"+k).hidden=k!==t;
  }
  renderAll();
}
function renderAll(){
  if(typeof renderNudges==="function")renderNudges();
  if(currentTab==="diary")renderDiary();
  if(currentTab==="weight")renderWeight();
  if(currentTab==="stats")renderStats();
  if(currentTab==="plan")renderPlan();
}

/* ============ diary ============ */
function guessType(){
  const h=new Date().getHours();
  const t=TYPES.find(t=>t.h&&h>=t.h[0]&&h<t.h[1]);
  return t?t.id:"snack";
}
function buildTypes(){
  const g=guessType();
  for(const t of TYPES){
    const l=mk("label");l.style.setProperty("--c",`var(${t.c})`);
    l.innerHTML=`<input type="radio" name="type" id="type-${t.id}" value="${t.id}" ${t.id===g?"checked":""}><span></span>`;
    l.querySelector("span").textContent=t.label;
    $("types").append(l);
  }
}
const dayMeals=d=>meals.filter(m=>m.date===d).sort((a,b)=>a.time.localeCompare(b.time));

function renderDiary(){
  const day=dayMeals(selected);
  const t=today(), yest=addDays(t,-1);
  const label=fmtDay.format(parse(selected));
  $("dayTitle").textContent=selected===t?"Сегодня, "+label:selected===yest?"Вчера, "+label:label.replace(/^./,c=>c.toUpperCase());
  $("toToday").hidden=selected===t;
  // week strip
  const mon=monday(selected);
  $("week").innerHTML="";
  for(let i=0;i<7;i++){
    const ds=addDays(mon,i);
    const b=mk("button","wd"+(ds===t?" today":""));b.type="button";
    if(ds===selected)b.setAttribute("aria-current","date");
    const dm=dayMeals(ds);
    b.setAttribute("aria-label",`${fmtDay.format(parse(ds))}: приёмов ${dm.length}`);
    b.innerHTML=`<span class="dn">${fmtWd.format(parse(ds))}</span><span class="dd">${parse(ds).getDate()}</span><span class="dots">${dm.slice(0,5).map(m=>`<i style="background:var(${T[m.type]?.c||"--muted"})"></i>`).join("")}</span>`;
    b.onclick=()=>{selected=ds;pendingDelete=null;editingMeal=null;renderDiary()};
    $("week").append(b);
  }
  // summary
  const withK=day.filter(m=>isNum(m.kcal));
  const eaten=sum(withK,m=>m.kcal);
  $("sCount").textContent=day.length;
  $("sKcal").textContent=withK.length?fmtN(eaten):"—";
  $("sLast").textContent=day.length?day[day.length-1].time:"—";
  const ranged=withK.filter(m=>isNum(m.kcalMin));
  $("sRange").hidden=!ranged.length;
  if(ranged.length){
    const lo=sum(withK,m=>isNum(m.kcalMin)?m.kcalMin:m.kcal),hi=sum(withK,m=>isNum(m.kcalMax)?m.kcalMax:m.kcal);
    $("sRange").textContent=`Честный диапазон: ${fmtN(lo)}–${fmtN(hi)} ккал — ${ranged.length===withK.length?"все записи оценены":"часть записей оценена"} ИИ, точная цифра где-то здесь.`;
  }
  const ep=effPlan(), res=ep?calcPlan(ep):null, ok=res&&!res.error;
  $("goalBox").hidden=!ok;
  if(ok){
    $("goalText").textContent=`${fmtN(eaten)} из ${fmtN(res.kcal)} ккал по программе`;
    const left=res.kcal-eaten;
    $("goalLeft").textContent=left>=0?`осталось ${fmtN(left)}`:`сверх нормы ${fmtN(-left)}`;
    $("goalBar").style.width=Math.min(100,eaten/res.kcal*100)+"%";
    $("goalBar").parentElement.classList.toggle("over",left<0);
  }
  // macros
  const mb=$("macroBox");mb.innerHTML="";
  const hasMac=day.some(m=>isNum(m.protein));
  mb.hidden=!(ok||hasMac);
  if(!mb.hidden){
    for(const [k,cls,lbl] of [["protein","p","Белки"],["fat","f","Жиры"],["carbs","c","Углеводы"]]){
      const got=Math.round(sum(day,m=>m[k]));
      const goal=ok&&isPlus()?res[k]:null;
      const box=mk("div","macro "+cls);
      const head=mk("div","mh");head.append(mk("span",null,lbl));
      const v=mk("span");const b=mk("b",null,fmtN(got));v.append(b,document.createTextNode(goal?` / ${fmtN(goal)} г`:" г"));head.append(v);
      const bar=mk("div","bar");const i=mk("i");i.style.width=goal?Math.min(100,got/goal*100)+"%":"0";bar.append(i);
      box.append(head,bar);mb.append(box);
    }
  }
  if(!mb.hidden&&ok&&!isPlus()){
    const l=mk("button","pluslink");l.type="button";l.innerHTML=LOCK_SVG+" Норма БЖУ — в Плюс";l.style.gridColumn="1/-1";l.style.justifySelf="start";
    l.onclick=()=>openPaywall("Норма белков, жиров и углеводов под вашу цель доступна в Порции Плюс.");mb.append(l);
  }
  // habit goals
  const hb=$("habitBox");hb.innerHTML="";
  const g=plan?.goal;
  if(g==="regular"){
    hb.hidden=false;hb.append(mk("span",null,"Основные приёмы:"));
    for(const id of MAIN){const on=day.some(m=>m.type===id);hb.append(mk("span","chip"+(on?" on":""),(on?"✓ ":"")+T[id].label))}
  }else if(g==="veggies"){
    hb.hidden=false;const n=day.filter(m=>m.veg).length;
    hb.append(mk("span",null,"С овощами или фруктами:"),mk("span","chip"+(n>=VEG_TARGET?" on":""),`${n} из ${VEG_TARGET} приёмов`));
  }else hb.hidden=true;
  // favorites
  renderFavs();
  // list
  const ul=$("list");ul.innerHTML="";
  if(!day.length){ul.append(mk("p","empty",selected===t?"Пока ничего не записано. Добавьте первый приём пищи выше.":"В этот день записей нет."));return}
  for(const m of day){
    if(editingMeal===m.id){ul.append(editRow(m));continue}
    const li=mk("li","meal");li.style.setProperty("--c",`var(${T[m.type]?.c||"--muted"})`);
    const what=mk("div","what");
    what.append(mk("span","tag",T[m.type]?.label||m.type),mk("span","nm",m.name));
    const subs=[];
    if(isNum(m.protein))subs.push(`Б ${fmtN(m.protein)} · Ж ${fmtN(m.fat)} · У ${fmtN(m.carbs)}`);
    if(isNum(m.kcalMin))subs.push(`оценка ${m.kcalMin}–${m.kcalMax} ккал · уверенность ${CONF[m.confidence]||"средняя"}`);
    if(m.veg)subs.push("овощи/фрукты");
    subs.forEach(t=>what.append(mk("span","sub",t)));
    const side=mk("div","side");
    const kc=mk("span","kcal",[isNum(m.grams)?`${m.grams} г`:"",isNum(m.kcal)?(isNum(m.kcalMin)?`~${m.kcal} ккал`:`${m.kcal} ккал`):""].filter(Boolean).join(" · "));
    if(isNum(m.kcalMin))kc.title=`Оценка: ${m.kcalMin}–${m.kcalMax} ккал, уверенность ${CONF[m.confidence]||"средняя"}`;
    side.append(kc);
    const fav=findFav(m.name);
    const star=mk("button","star"+(fav?" on":""),fav?"★":"☆");star.type="button";
    star.setAttribute("aria-label",fav?`Убрать «${m.name}» из избранного`:`Добавить «${m.name}» в избранное`);
    star.onclick=()=>fav?removeFav(fav.id):addFav(m);
    const armed=pendingDelete===m.id;
    const del=mk("button","del"+(armed?" confirm":""),armed?"Удалить?":"✕");del.type="button";
    del.setAttribute("aria-label",armed?"Подтвердить удаление":`Удалить «${m.name}»`);
    del.onclick=()=>armed?removeMeal(m.id):(pendingDelete=m.id,renderDiary());
    const ed=mk("button","edit","✎");ed.type="button";ed.setAttribute("aria-label",`Изменить «${m.name}»`);
    ed.onclick=()=>{editingMeal=m.id;pendingDelete=null;renderDiary();setTimeout(()=>$("e-name")?.focus(),0)};
    side.append(ed,star,del);
    li.append(mk("time",null,m.time),what,side);
    ul.append(li);
  }
}

function showErr(msg){const e=$("formErr");e.textContent=msg||"";e.hidden=!msg}
function setStatus(s){$("status").textContent=s}

async function addMeal(ev){
  ev.preventDefault();showErr("");
  const name=$("fName").value.trim(), time=$("fTime").value;
  const type=(document.querySelector('input[name="type"]:checked')||{}).value||"snack";
  if(!name){showErr("Напишите, что вы ели.");return}
  if(!time){showErr("Укажите время.");return}
  const meal={date:selected,time,type,name,createdAt:new Date().toISOString()};
  const gRaw=$("fGrams").value.trim(), kRaw=$("fKcal").value.trim();
  if(gRaw!==""){const g=Math.round(Number(gRaw));if(!(g>=1&&g<=5000)){showErr("Вес: число от 1 до 5000 г.");return}meal.grams=g}
  if(kRaw!==""){const k=Math.round(Number(kRaw));if(!(k>=0&&k<=10000)){showErr("Калории: число от 0 до 10 000.");return}meal.kcal=k}
  if($("fVeg").checked)meal.veg=true;
  if(est&&est.name===name&&isNum(meal.grams)){
    meal.kcalPer100=est.per100;
    if(meal.kcal===Math.round(est.per100*meal.grams/100)){
      meal.kcalSource=est.source||"ai";
      if(isNum(est.lo)&&isNum(est.hi)){meal.kcalMin=Math.round(meal.kcal*est.lo);meal.kcalMax=Math.round(meal.kcal*est.hi);meal.confidence=est.conf||"medium"}
    }
    if(isNum(est.p100)){
      const g=meal.grams/100;
      meal.protein=Math.round(est.p100*g);meal.fat=Math.round(est.f100*g);meal.carbs=Math.round(est.c100*g);
      Object.assign(meal,{p100:est.p100,f100:est.f100,c100:est.c100});
    }
  }
  $("submitBtn").disabled=true;
  try{
    if(mealsCol)await mealsCol.add(meal);
    else{meals.push({id:"local-"+Date.now(),...meal});renderAll()}
    $("fName").value="";$("fKcal").value="";$("fGrams").value="";$("fVeg").checked=false;$("fTime").value=nowHM();clearThumb();
    est=null;resetHint();$("fName").focus();
  }catch(e){showErr(!navigator.onLine?"Нет интернета: запись не сохранена. Добавьте её, когда появится связь.":"Не удалось сохранить. Попробуйте ещё раз.")}
  finally{$("submitBtn").disabled=false}
}
async function removeMeal(id){
  pendingDelete=null;
  if(mealsCol){try{await mealsCol.doc(id).delete()}catch(e){setStatus("Не удалось удалить")}}
  else{meals=meals.filter(m=>m.id!==id);renderAll()}
}

/* ============ favorites ============ */
const findFav=name=>favorites.find(f=>f.name.trim().toLowerCase()===String(name).trim().toLowerCase());
function renderFavs(){
  const box=$("favs");box.innerHTML="";
  box.hidden=!favorites.length;
  if(!favorites.length)return;
  box.append(mk("span","lbl","Избранное:"));
  for(const f of [...favorites].sort((a,b)=>a.name.localeCompare(b.name,"ru"))){
    const w=mk("span","fav");
    const use=mk("button","use",f.name);use.type="button";use.title="Подставить в форму";
    use.onclick=()=>useFav(f);
    const x=mk("button","x","×");x.type="button";x.setAttribute("aria-label",`Удалить «${f.name}» из избранного`);
    x.onclick=()=>removeFav(f.id);
    w.append(use,x);box.append(w);
  }
}
function useFav(f){
  $("fName").value=f.name;
  $("fGrams").value=isNum(f.grams)?f.grams:"";
  $("fKcal").value=isNum(f.kcal)?f.kcal:"";
  $("fVeg").checked=!!f.veg;
  if(f.type&&$("type-"+f.type))$("type-"+f.type).checked=true;
  est=isNum(f.kcalPer100)?{name:f.name,per100:f.kcalPer100,p100:f.p100,f100:f.f100,c100:f.c100,note:"из избранного",source:f.kcalSource||"fav"}:null;
  if(est)applyEstimate();else resetHint();
  $("fGrams").focus();
}
async function addFav(m){
  const f={name:m.name,type:m.type};
  for(const k of ["grams","kcal","kcalPer100","p100","f100","c100","veg","kcalSource"])if(m[k]!==undefined)f[k]=m[k];
  if(favCol){try{await favCol.add(f)}catch(e){setStatus("Не удалось добавить в избранное")}}
  else{favorites.push({id:"local-"+Date.now(),...f});renderDiary()}
}
async function removeFav(id){
  if(favCol){try{await favCol.doc(id).delete()}catch(e){setStatus("Не удалось удалить из избранного")}}
  else{favorites=favorites.filter(f=>f.id!==id);renderDiary()}
}

/* ============ calorie & macro estimate (ИИ через серверную функцию) ============ */
const CONF={high:"высокая",medium:"средняя",low:"низкая"};
const HINT_DEFAULT="По названию и весу. Без веса возьмём обычную порцию.";
function resetHint(){$("estHint").textContent=HINT_DEFAULT+(isPlus()?"":" "+aiLeftText())}
function showAiLeft(){if(isPlus())return;const h=$("estHint");h.append(document.createTextNode(" · "+aiLeftText()))}
function applyEstimate(){
  if(!est)return;
  const g=Number($("fGrams").value);
  if(g>0)$("fKcal").value=Math.round(est.per100*g/100);
  const h=$("estHint");h.textContent="";
  if(g>0&&isNum(est.lo)){
    const k=Math.round(est.per100*g/100);
    h.append(mk("b",null,`≈ ${fmtN(k)} ккал (${fmtN(Math.round(k*est.lo))}–${fmtN(Math.round(k*est.hi))})`));
    h.append(document.createTextNode(` · уверенность ${CONF[est.conf]||"средняя"} · ${est.per100} ккал / 100 г`));
  }else h.append(mk("b",null,`≈ ${est.per100} ккал / 100 г`));
  if(isNum(est.p100)){
    const k=g>0?g/100:1;
    h.append(document.createTextNode(` · Б ${fmtN(est.p100*k)} Ж ${fmtN(est.f100*k)} У ${fmtN(est.c100*k)} г${g>0?"":" на 100 г"}`));
  }
  if(est.note)h.append(document.createTextNode(` · ${est.note}`));
}
async function estimate(){
  if(!canUseAI()){openPaywall(`Бесплатно доступно ${FREE_AI} ИИ-расчёта в день. В Порции Плюс — без ограничений.`);return}
  const name=$("fName").value.trim();
  if(!name){showErr("Сначала напишите, что вы ели.");$("fName").focus();return}
  showErr("");
  const btn=$("estBtn");btn.disabled=true;btn.textContent="Считаю…";
  try{
    const r=await window.porciyaAI("estimate",{name});
    const per=Number(r?.kcal_per_100g), typ=Number(r?.typical_portion_g);
    const note=typeof r?.note==="string"?r.note.slice(0,60):"";
    if(!(per>=0&&per<=950)){showErr(note?`Не получилось оценить: ${note}.`:"Не получилось оценить. Уточните название.");return}
    const P=Number(r.protein_per_100g),F=Number(r.fat_per_100g),C=Number(r.carbs_per_100g);
    const macrosOk=[P,F,C].every(v=>v>=0&&v<=100);
    est={name,per100:Math.round(per),note,source:"ai"};
    const pct=Math.min(60,Math.max(5,Number(r.uncertainty_pct)||20));
    est.lo=1-pct/100;est.hi=1+pct/100;
    est.conf=["high","medium","low"].includes(r.confidence)?r.confidence:(pct<=15?"high":pct<=35?"medium":"low");
    if(macrosOk)Object.assign(est,{p100:Math.round(P*10)/10,f100:Math.round(F*10)/10,c100:Math.round(C*10)/10});
    if(r.has_veg_or_fruit===true)$("fVeg").checked=true;
    if(!$("fGrams").value&&typ>0&&typ<=2000)$("fGrams").value=Math.round(typ);
    applyEstimate();countAI();showAiLeft();
  }catch(e){
    if(e?.code==="not_granted"){$("estRow").hidden=true;showErr("Расчёт калорий отключён: доступ не разрешён.")}
    else if(e?.code==="daily_limit")showErr("Лимит ИИ-запросов на сегодня исчерпан — завтра снова можно. Калории можно ввести вручную.")
    else if(e?.code==="not_signed_in")showErr("Войдите в аккаунт заново, чтобы пользоваться ИИ.")
    else if(e?.code==="rate_limited")showErr("Слишком много запросов, попробуйте через минуту.");
    else if(e?.code!=="cancelled")showErr("Не получилось рассчитать. Попробуйте ещё раз или введите вручную.");
  }finally{btn.disabled=false;btn.textContent="Рассчитать калории и БЖУ"}
}


/* ============ photo recognition (ИИ через серверную функцию) ============ */
let thumbUrl=null, photoSupport="unknown";
function clearThumb(){if(thumbUrl)URL.revokeObjectURL(thumbUrl);thumbUrl=null;$("thumb").hidden=true;$("thumb").removeAttribute("src")}
// Сжимаем фото перед отправкой: телефонные снимки весят мегабайты, ИИ хватает 1280 px
async function shrinkImage(file,max=1280){
  const url=URL.createObjectURL(file);
  try{
    const img=await new Promise((ok,bad)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=bad;i.src=url});
    const k=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight));
    const c=document.createElement("canvas");c.width=Math.round(img.naturalWidth*k);c.height=Math.round(img.naturalHeight*k);
    c.getContext("2d").drawImage(img,0,0,c.width,c.height);
    return c.toDataURL("image/jpeg",0.85);
  }catch(e){throw Object.assign(new Error("bad image"),{code:"image_rejected"})}
  finally{URL.revokeObjectURL(url)}
}
async function analyzePhoto(file){
  showErr("");
  clearThumb();thumbUrl=URL.createObjectURL(file);$("thumb").src=thumbUrl;$("thumb").hidden=false;
  const pb=$("photoBtn"),eb=$("estBtn");
  pb.classList.add("busy");eb.disabled=true;
  $("estHint").textContent="Распознаю фото… это может занять до минуты.";
  const typed=$("fName").value.trim();
  try{
    const image=await shrinkImage(file);
    const r=await window.porciyaAI("photo",{typed,image});
    const items=(Array.isArray(r?.items)?r.items:[]).map(i=>({
      name:String(i?.name||"").slice(0,60),grams:Number(i?.grams),kcal:Number(i?.kcal),
      protein:Number(i?.protein),fat:Number(i?.fat),carbs:Number(i?.carbs)
    })).filter(i=>i.name&&i.grams>0&&i.grams<=3000&&i.kcal>=0&&i.kcal<=5000);
    if(!items.length){
      const t=typeof r?.title==="string"?r.title.slice(0,60):"";
      showErr(t?`Не получилось распознать: ${t}.`:"Не получилось распознать еду на фото. Попробуйте другой ракурс или введите вручную.");
      resetHint();return;
    }
    const g=Math.round(sum(items,i=>i.grams)),k=sum(items,i=>i.kcal);
    const macrosOk=items.every(i=>[i.protein,i.fat,i.carbs].every(v=>v>=0&&v<=500));
    const title=typed||(typeof r.title==="string"&&r.title.trim()?r.title.trim().slice(0,120):items.map(i=>i.name).join(", ").slice(0,120));
    $("fName").value=title;$("fGrams").value=g;
    if(r.has_veg_or_fruit===true)$("fVeg").checked=true;
    const r1=v=>Math.round(v*10)/10;
    est={name:title,per100:Math.round(k/g*100),source:"photo",
      note:("по фото: "+items.map(i=>`${i.name} ~${Math.round(i.grams)} г`).join(", ")).slice(0,160)+(r.confidence==="low"?" · оценка грубая, проверьте вес":"")};
    const lo=Number(r.kcal_low),hi=Number(r.kcal_high);
    est.lo=lo>0&&lo<=k?Math.max(0.4,lo/k):0.75;
    est.hi=hi>=k?Math.min(2,hi/k):1.3;
    est.conf=["high","medium","low"].includes(r.confidence)?r.confidence:"medium";
    if(macrosOk)Object.assign(est,{p100:r1(sum(items,i=>i.protein)/g*100),f100:r1(sum(items,i=>i.fat)/g*100),c100:r1(sum(items,i=>i.carbs)/g*100)});
    applyEstimate();countAI();showAiLeft();
  }catch(e){
    resetHint();
    if(e?.code==="daily_limit")showErr("Лимит ИИ-запросов на сегодня исчерпан — завтра снова можно.")
    else if(e?.code==="not_signed_in")showErr("Войдите в аккаунт заново, чтобы пользоваться ИИ.")
    else if(e?.code==="image_rejected")showErr("Не получилось открыть это фото. Попробуйте другое или сделайте снимок камерой.");
    else if(e?.code==="not_granted")showErr("Распознавание отключено: доступ не разрешён.");
    else if(e?.code==="rate_limited")showErr("Слишком много запросов, попробуйте через минуту.");
    else if(e?.code!=="cancelled")showErr("Не получилось распознать фото. Попробуйте ещё раз или введите вручную.");
  }finally{pb.classList.remove("busy");eb.disabled=false}
}

/* ============ weight log ============ */
function renderWeight(){
  const list=[...weights].sort((a,b)=>a.date.localeCompare(b.date));
  const info=$("weightInfo");info.innerHTML="";
  const ep=effPlan(), res=ep&&ep.goal==="weight"?calcPlan(ep):null;
  if(list.length){
    const first=list[0], last=list[list.length-1];
    const card=mk("div","card");
    const dl=mk("dl","facts");
    const fact=(k,v)=>{const d=mk("div");d.append(mk("dt",null,k),mk("dd",null,v));dl.append(d)};
    fact("Сейчас",`${fmtN(last.kg,1)} кг`);
    if(list.length>1){const d=last.kg-first.kg;fact(`С ${fmtShort.format(parse(first.date))}`,`${d>0?"+":d<0?"−":""}${fmtN(Math.abs(d),1)} кг`)}
    if(ep&&ep.goal==="weight"){
      fact("Цель",`${fmtN(ep.target,1)} кг`);
      const left=ep.target-last.kg;
      if(res&&!res.reached&&Math.abs(left)>=0.5)fact("Осталось",`${fmtN(Math.abs(left),1)} кг`);
    }
    card.append(dl);
    if(res?.reached)card.append(mk("div","good","Цель достигнута! Программа переключилась на удержание веса. Можно поставить новую цель во вкладке «Программа»."));
    else if(res&&!res.error&&!isPlus()&&latestWeight()&&latestWeight().date>plan.start){
      const l=mk("button","pluslink");l.type="button";l.innerHTML=LOCK_SVG+" Пересчитывать норму по новому весу — в Плюс";
      l.onclick=()=>openPaywall("В Порции Плюс норма и прогноз пересчитываются после каждого взвешивания.");card.append(l);
    }
    else if(res&&!res.error&&ep.anchored)card.append(mk("p","small",`Норма пересчитана по весу от ${fmtShort.format(parse(ep.start))}: ${fmtN(res.kcal)} ккал в день, прогноз — ${fmtDate.format(parse(res.eta))}.`));
    info.append(card);
  }
  $("weightChart").innerHTML=list.length>=2?weightChartSVG(list,ep&&ep.goal==="weight"?ep.target:null):"";
  if(list.length===1)$("weightChart").append(mk("p","small","Добавьте ещё одно взвешивание, чтобы увидеть график."));
  const ul=$("wList");ul.innerHTML="";
  if(!list.length){ul.append(mk("p","empty","Записей веса пока нет."));return}
  const desc=[...list].reverse();
  desc.forEach((w,i)=>{
    const prev=desc[i+1];
    const li=mk("li");
    li.append(mk("span","d",fmtDate.format(parse(w.date))),mk("span","kg",`${fmtN(w.kg,1)} кг`));
    const d=prev?w.kg-prev.kg:null;
    li.append(mk("span","dl",d==null?"":`${d>0?"+":d<0?"−":"±"}${fmtN(Math.abs(d),1)}`));
    const armed=pendingWDelete===w.id;
    const del=mk("button","del"+(armed?" confirm":""),armed?"Удалить?":"✕");del.type="button";
    del.setAttribute("aria-label",armed?"Подтвердить удаление":`Удалить запись за ${fmtDate.format(parse(w.date))}`);
    del.onclick=()=>armed?removeWeight(w.id):(pendingWDelete=w.id,renderWeight());
    li.append(del);ul.append(li);
  });
}
function weightChartSVG(list,target){
  const W=400,H=220,L=44,R=12,Tp=14,B=28;
  const pts=list.slice(-60);
  const x0=parse(pts[0].date),span=Math.max(1,daysBetween(pts[0].date,pts[pts.length-1].date));
  let lo=Math.min(...pts.map(p=>p.kg)),hi=Math.max(...pts.map(p=>p.kg));
  if(isNum(target)){lo=Math.min(lo,target);hi=Math.max(hi,target)}
  const padKg=Math.max(0.5,(hi-lo)*0.15);lo=Math.floor((lo-padKg)*2)/2;hi=Math.ceil((hi+padKg)*2)/2;
  const X=d=>L+(daysBetween(pts[0].date,d)/span)*(W-L-R);
  const Y=kg=>Tp+(hi-kg)/(hi-lo)*(H-Tp-B);
  let s=`<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="График веса">`;
  const step=(hi-lo)/4;
  for(let i=0;i<=4;i++){const v=lo+step*i,y=Y(v);s+=`<line class="grid" x1="${L}" x2="${W-R}" y1="${y}" y2="${y}"/><text x="${L-6}" y="${y+4}" text-anchor="end">${fmtN(v,1)}</text>`}
  if(isNum(target)&&target>=lo&&target<=hi){const y=Y(target);s+=`<line class="target" x1="${L}" x2="${W-R}" y1="${y}" y2="${y}"/><text class="target-l" x="${W-R}" y="${y-6}" text-anchor="end">цель ${fmtN(target,1)}</text>`}
  const line=pts.map(p=>`${X(p.date).toFixed(1)},${Y(p.kg).toFixed(1)}`).join(" ");
  s+=`<polygon class="area" points="${X(pts[0].date)},${H-B} ${line} ${X(pts[pts.length-1].date)},${H-B}"/>`;
  s+=`<polyline class="line" points="${line}"/>`;
  pts.forEach((p,i)=>{s+=`<circle class="pt${i===pts.length-1?" last":""}" cx="${X(p.date)}" cy="${Y(p.kg)}" r="${i===pts.length-1?5:3.5}"><title>${fmtShort.format(parse(p.date))}: ${fmtN(p.kg,1)} кг</title></circle>`});
  s+=`<text x="${L}" y="${H-8}">${fmtShort.format(parse(pts[0].date))}</text><text x="${W-R}" y="${H-8}" text-anchor="end">${fmtShort.format(parse(pts[pts.length-1].date))}</text>`;
  return s+"</svg>";
}
async function saveWeight(ev){
  ev.preventDefault();
  const e=$("wErr");e.hidden=true;
  const date=$("wDate").value, kg=Math.round(Number($("wKg").value.replace(",","."))*10)/10;
  if(!date||date>today()){e.textContent="Выберите дату не позже сегодняшней.";e.hidden=false;return}
  if(!(kg>=30&&kg<=300)){e.textContent="Вес: от 30 до 300 кг.";e.hidden=false;return}
  $("wSave").disabled=true;
  try{
    if(weightsCol)await weightsCol.doc(date).set({date,kg});
    else{weights=weights.filter(w=>w.date!==date).concat({id:date,date,kg});renderAll()}
    $("wKg").value="";
  }catch(err){e.textContent="Не удалось сохранить. Попробуйте ещё раз.";e.hidden=false}
  finally{$("wSave").disabled=false}
}
async function removeWeight(id){
  pendingWDelete=null;
  if(weightsCol){try{await weightsCol.doc(id).delete()}catch(e){setStatus("Не удалось удалить")}}
  else{weights=weights.filter(w=>w.id!==id);renderAll()}
}

/* ============ weekly stats ============ */
function renderStats(){
  const start=statsWeek,end=addDays(start,6);
  $("wkTitle").textContent=`${fmtShort.format(parse(start))} — ${fmtShort.format(parse(end))}`;
  $("wkNext").disabled=addDays(start,7)>today();
  const body=$("statsBody");body.innerHTML="";
  const days=[...Array(7)].map((_,i)=>{const d=addDays(start,i),ms=dayMeals(d);return {d,ms,kcal:sum(ms,m=>m.kcal),hasK:ms.some(m=>isNum(m.kcal))}});
  const logged=days.filter(x=>x.ms.length);
  const ep=effPlan(),res=ep?calcPlan(ep):null,norm=res&&!res.error?res.kcal:null;
  if(!logged.length){body.append(mk("p","empty","За эту неделю записей нет."));return}
  const kDays=days.filter(x=>x.hasK&&x.d!==today()); // сегодняшний день ещё не закончен
  const avg=kDays.length?Math.round(sum(kDays,x=>x.kcal)/kDays.length):null;
  // headline
  const card=mk("div","card");
  const big=mk("div","big");big.append(mk("b",null,avg!=null?fmtN(avg):"—"),mk("span",null,"ккал в среднем за день"+(norm?` · норма ${fmtN(norm)}`:"")+(days.some(x=>x.d===today())?" · без сегодняшнего дня":"")));
  card.append(big);
  if(norm&&avg!=null){
    const diff=avg-norm,pct=Math.abs(diff)/norm;
    card.append(mk("p","small",pct<=0.1?"В среднем неделя в пределах нормы — отдельные дни выше или ниже не страшны.":diff>0?`В среднем на ${fmtN(diff)} ккал в день выше нормы.`:`В среднем на ${fmtN(-diff)} ккал в день ниже нормы. Слишком большой недобор тоже не полезен — следите, чтобы еды хватало.`));
  }
  card.insertAdjacentHTML("beforeend",weekChartSVG(days,norm));
  body.append(card);
  // facts
  const st=mk("dl","facts stats");
  const fact=(k,v)=>{const d=mk("div");d.append(mk("dt",null,k),mk("dd",null,v));st.append(d)};
  fact("Дней с записями",`${logged.length} из 7`);
  fact("Приёмов пищи",`${sum(logged,x=>x.ms.length)}`);
  const mDays=logged.filter(x=>x.ms.some(m=>isNum(m.protein)));
  if(mDays.length){
    const a=k=>Math.round(sum(mDays,x=>sum(x.ms,m=>m[k]))/mDays.length);
    fact("Белки в среднем",`${a("protein")}${norm?` / ${res.protein}`:""} г`);
    fact("Жиры в среднем",`${a("fat")}${norm?` / ${res.fat}`:""} г`);
    fact("Углеводы в среднем",`${a("carbs")}${norm?` / ${res.carbs}`:""} г`);
  }
  const full=logged.filter(x=>MAIN.every(t=>x.ms.some(m=>m.type===t))).length;
  fact("Дней с завтраком, обедом и ужином",`${full} из ${logged.length}`);
  const vegAvg=sum(logged,x=>x.ms.filter(m=>m.veg).length)/logged.length;
  fact("С овощами/фруктами",`${fmtN(vegAvg,1)} приёма в день`);
  const wk=weights.filter(w=>w.date>=start&&w.date<=end).sort((a,b)=>a.date.localeCompare(b.date));
  if(wk.length>=2){const d=wk[wk.length-1].kg-wk[0].kg;fact("Вес за неделю",`${d>0?"+":d<0?"−":"±"}${fmtN(Math.abs(d),1)} кг`)}
  else if(wk.length===1)fact("Вес",`${fmtN(wk[0].kg,1)} кг`);
  const c2=mk("div","card");
  if(isPlus())c2.append(st);
  else{
    c2.classList.add("locked");
    const lb=mk("div","lockbody");lb.append(st);
    const ov=mk("div","lockover");ov.append(mk("p",null,"Подробные итоги недели — в Порции Плюс"));
    const b=mk("button","submit","Подробнее");b.type="button";b.onclick=()=>openPaywall("Средние БЖУ, регулярность питания и изменение веса за неделю доступны в Порции Плюс.");
    ov.append(b);c2.append(lb,ov);
  }
  body.append(c2);
}
function weekChartSVG(days,norm){
  const W=400,H=200,L=4,R=4,Tp=22,B=26,gap=8;
  const max=Math.max(norm||0,...days.map(x=>x.kcal),100)*1.1;
  const bw=(W-L-R-gap*6)/7;
  const Y=v=>Tp+(1-v/max)*(H-Tp-B);
  let s=`<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Калории по дням недели">`;
  days.forEach((x,i)=>{
    const x0=L+i*(bw+gap);
    const cls=!x.hasK?"none":norm&&x.kcal>norm*1.1?"over":"";
    const h=x.hasK?Math.max(3,(H-Tp-B)-(Y(x.kcal)-Tp)):3;
    s+=`<rect class="barr ${cls}" x="${x0}" y="${H-B-h}" width="${bw}" height="${h}" rx="4"><title>${fmtDay.format(parse(x.d))}: ${x.hasK?fmtN(x.kcal)+" ккал":"нет данных"}</title></rect>`;
    if(x.hasK)s+=`<text class="val" x="${x0+bw/2}" y="${H-B-h-6}" text-anchor="middle">${fmtN(x.kcal)}</text>`;
    s+=`<text x="${x0+bw/2}" y="${H-8}" text-anchor="middle">${fmtWd.format(parse(x.d))}</text>`;
  });
  if(norm){const y=Y(norm);s+=`<line class="target" x1="${L}" x2="${W-R}" y1="${y}" y2="${y}"/>`}
  return s+"</svg>";
}

/* ============ plan UI ============ */
function readPlanForm(){
  const num=id=>{const v=$(id).value.trim();return v===""?NaN:Number(v.replace(",","."))};
  const goal=document.querySelector('input[name="goal"]:checked').value;
  const p={
    goal,sex:document.querySelector('input[name="sex"]:checked').value,
    age:num("pAge"),height:num("pHeight"),weight:num("pWeight"),
    activity:Number($("pAct").value),start:today(),
  };
  p.target=goal==="weight"?num("pTarget"):p.weight;
  p.deadline=goal==="weight"&&$("dlCustom").checked?($("pDeadline").value||null):null;
  let err=null;
  if(!(p.age>=1&&p.age<=110))err="Укажите возраст.";
  else if(p.age<18)err="under18";
  else if(!(p.height>=120&&p.height<=230))err="Рост: от 120 до 230 см.";
  else if(!(p.weight>=30&&p.weight<=300))err="Вес: от 30 до 300 кг.";
  else if(goal==="weight"&&!(p.target>=30&&p.target<=300))err="Желаемый вес: от 30 до 300 кг.";
  else if(goal==="weight"&&$("dlCustom").checked&&!p.deadline)err="Выберите дату или включите автоматический срок.";
  return {p,err};
}
function explain(p,r){
  const box=document.createDocumentFragment();
  const line=(text,cls)=>{box.append(mk("div",cls,text))};
  if(r.error==="underweight"){line(`Вес ${fmtN(p.target,1)} кг при росте ${p.height} см — ниже нормы (ИМТ меньше 18,5). Программа не строит план ниже ${fmtN(r.minHealthy,1)} кг. Если есть причины стремиться к такому весу, обсудите это с врачом.`,"warn stop");return box}
  if(r.error==="nofloor"){line(`При такой активности норма и так близка к минимуму (${r.floor} ккал), поэтому безопасно снижать калории не получится. Вместо этого можно добавить активность.`,"warn stop");return box}
  if(r.error==="deadline"){line("До выбранной даты меньше недели: выберите срок позже.","warn stop");return box}
  const mac=`Б ${r.protein} · Ж ${r.fat} · У ${r.carbs} г`;
  if(r.goal==="keep"){
    const extra=p.goal==="regular"?" Цель — завтрак, обед и ужин каждый день; дневник будет отмечать их.":p.goal==="veggies"?` Цель — овощи или фрукты минимум в ${VEG_TARGET} приёмах пищи за день.`:"";
    line(`Норма для удержания веса: ${fmtN(r.kcal)} ккал в день · ${mac}.${extra}`);return box;
  }
  const verb=r.goal==="lose"?"снижения":"набора";
  line(`Норма: ${fmtN(r.kcal)} ккал в день · ${mac} · темп ${fmtN(r.pace,2)} кг в неделю (${r.level.toLowerCase()})`);
  line(`Автоматический срок: ${fmtDate.format(parse(r.autoDate))}, темп ${fmtN(r.autoPace,2)} кг/нед.`,"small");
  if(p.deadline&&r.limited)line(`К ${fmtDate.format(parse(p.deadline))} нужен темп ${fmtN(r.neededPace,2)} кг/нед — это быстрее безопасного предела ${verb} (${fmtN(r.maxPace,2)} кг/нед для вас). Программа не будет урезать калории сильнее: план построен на пределе безопасного, цель — примерно к ${fmtDate.format(parse(r.eta))}.`,"warn");
  else if(p.deadline&&r.pace>r.autoPace+0.01)line(`Выбранный срок короче автоматического, поэтому план строже: на ${fmtN(Math.round((r.pace-r.autoPace)*KCAL_PER_KG/7))} ккал в день ${r.goal==="gain"?"больше":"меньше"}, чем при автоматическом сроке. Это ещё в пределах безопасного.`,"small");
  return box;
}
function updatePreview(){
  const pv=$("planPreview");pv.innerHTML="";$("planErr").hidden=true;
  const isW=$("gWeight").checked;
  $("weightGoalFields").hidden=!isW;
  $("dlWrap").hidden=!(isW&&$("dlCustom").checked);
  const {p,err}=readPlanForm();
  if(err==="under18"){pv.append(mk("div","warn stop","Формулы программы рассчитаны на взрослых. До 18 лет план питания лучше составлять вместе с врачом или диетологом."));return}
  if(err)return;
  pv.append(explain(p,calcPlan(p)));
}
function renderPlan(){
  const card=$("planCard"),form=$("planForm");
  const showForm=!plan||editingPlan;
  form.hidden=!showForm;card.hidden=showForm;$("planCancel").hidden=!plan;
  if(showForm){updatePreview();return}
  const ep=effPlan(),r=calcPlan(ep);
  card.innerHTML="";
  card.append(mk("span","pill",GOALS[ep.goal]||GOALS.weight));
  if(r.error)card.append(explain(ep,r));
  else{
    if(r.reached)card.append(mk("div","good","Цель по весу достигнута! Норма переключена на удержание. Можно поставить новую цель."));
    const big=mk("div","big");big.append(mk("b",null,fmtN(r.kcal)),mk("span",null,"ккал в день"));
    if(r.level)big.append(mk("span","pill"+(r.level==="Интенсивный"?" hard":""),r.level));
    card.append(big);
    const dl=mk("dl","facts");
    const fact=(k,v)=>{const d=mk("div");d.append(mk("dt",null,k),mk("dd",null,v));dl.append(d)};
    if(isPlus()){fact("Белки",`${r.protein} г`);fact("Жиры",`${r.fat} г`);fact("Углеводы",`${r.carbs} г`)}
    else{
      const d=mk("div");d.append(mk("dt",null,"Белки · жиры · углеводы"));
      const l=mk("button","pluslink");l.type="button";l.innerHTML=LOCK_SVG+" Открыть в Плюс";
      l.onclick=()=>openPaywall("Норма белков, жиров и углеводов под вашу цель доступна в Порции Плюс.");
      const dd=mk("dd");dd.append(l);d.append(dd);dl.append(d);
    }
    fact("Сейчас",`${fmtN(ep.weight,1)} кг`);
    if(ep.goal==="weight")fact("Цель",`${fmtN(ep.target,1)} кг`);
    if(r.goal!=="keep"){fact("Темп",`${fmtN(r.pace,2)} кг / нед`);fact("Прогноз",fmtDate.format(parse(r.eta)))}
    fact("Обмен в покое",`${fmtN(Math.round(r.bmr))} ккал`);
    fact("Расход за день",`${fmtN(Math.round(r.tdee))} ккал`);
    card.append(dl);
    if(ep.goal==="regular")card.append(mk("p","small","Цель: завтрак, обед и ужин каждый день. В дневнике видно, какие приёмы уже были, а во вкладке «Неделя» — сколько дней получилось полностью."));
    if(ep.goal==="veggies")card.append(mk("p","small",`Цель: овощи или фрукты минимум в ${VEG_TARGET} приёмах пищи в день. Отмечайте галочку «Есть овощи или фрукты» — расчёт через ИИ ставит её сам.`));
    if(ep.deadline&&r.limited)card.append(mk("div","warn",`Вы хотели прийти к цели к ${fmtDate.format(parse(ep.deadline))}, но это быстрее безопасного темпа. План построен на пределе безопасного.`));
    if(ep.anchored)card.append(mk("p","small",`Норма пересчитана по последнему взвешиванию (${fmtDate.format(parse(ep.start))}). Программа создана ${fmtDate.format(parse(plan.start))}.`));
    card.append(mk("p","small","Расчёт по формуле Миффлина — Сан Жеора. Это ориентир, а не медицинская рекомендация."));
  }
  const b=mk("div","btns");const ed=mk("button","ghost","Изменить данные");ed.type="button";
  ed.onclick=()=>{editingPlan=true;fillPlanForm(effPlan());renderPlan()};
  b.append(ed);card.append(b);
}
function fillPlanForm(p){
  if(!p)return;
  ($("g"+{weight:"Weight",keep:"Keep",regular:"Regular",veggies:"Veg"}[p.goal||"weight"])).checked=true;
  (p.sex==="m"?$("sexM"):$("sexF")).checked=true;
  $("pAge").value=p.age;$("pHeight").value=p.height;$("pWeight").value=p.weight;
  $("pTarget").value=(p.goal||"weight")==="weight"?p.target:"";
  $("pAct").value=String(p.activity);
  if(p.deadline){$("dlCustom").checked=true;$("pDeadline").value=p.deadline}else $("dlAuto").checked=true;
}
async function savePlan(ev){
  ev.preventDefault();
  const {p,err}=readPlanForm();
  const pe=$("planErr");
  if(err){pe.textContent=err==="under18"?"Для младше 18 лет программа не строится.":err;pe.hidden=false;return}
  const r=calcPlan(p);
  if(r.error){pe.textContent="Поправьте данные: смотрите подсказку выше.";pe.hidden=false;return}
  const d=p.target-p.weight;
  const data={...p,dir:p.goal==="weight"&&Math.abs(d)>=0.5?Math.sign(d):0,savedAt:new Date().toISOString()};
  $("planSave").disabled=true;
  try{
    if(profileRef){
      await profileRef.set({plan:data});
      await weightsCol.doc(p.start).set({date:p.start,kg:p.weight});
    }else{
      weights=weights.filter(w=>w.date!==p.start).concat({id:p.start,date:p.start,kg:p.weight});
    }
    plan=data;editingPlan=false;renderAll();
  }catch(e){pe.textContent="Не удалось сохранить программу. Попробуйте ещё раз.";pe.hidden=false}
  finally{$("planSave").disabled=false}
}

/* ============ wiring ============ */
buildTypes();resetHint();
{const t=loadTheme();const el=$({system:"thSystem",light:"thLight",dark:"thDark"}[t]||"thSystem");el.checked=true}
$("themeSeg").addEventListener("change",e=>{const t=e.target.value;applyTheme(t);saveTheme(t)});
ACT.forEach((a,i)=>{const o=mk("option",null,a.l);o.value=a.v;if(i===1)o.selected=true;$("pAct").append(o)});
$("fTime").value=nowHM();
$("wDate").value=today();$("wDate").max=today();
$("pDeadline").min=addDays(today(),7);
for(const k of ["diary","weight","stats","plan"])$("tab-"+k).onclick=()=>setTab(k);
$("addForm").addEventListener("submit",addMeal);
$("prev").onclick=()=>{selected=addDays(selected,-1);pendingDelete=null;renderDiary()};
$("next").onclick=()=>{selected=addDays(selected,1);pendingDelete=null;renderDiary()};
$("toToday").onclick=()=>{selected=today();pendingDelete=null;renderDiary()};
$("estBtn").onclick=estimate;
$("fGrams").addEventListener("input",()=>{if(est&&est.name===$("fName").value.trim())applyEstimate()});
$("fName").addEventListener("input",()=>{
  if(!est)return;
  if(est.source==="photo"){est.name=$("fName").value.trim();return}
  if(est.name!==$("fName").value.trim()){est=null;resetHint()}
});
$("fPhoto").addEventListener("click",ev=>{
  if(!canUseAI()){ev.preventDefault();openPaywall(`Бесплатно доступно ${FREE_AI} ИИ-расчёта в день, включая фото. В Порции Плюс — без ограничений.`)}
});
$("fPhoto").addEventListener("change",()=>{const f=$("fPhoto").files[0];$("fPhoto").value="";if(f)analyzePhoto(f)});
$("weightForm").addEventListener("submit",saveWeight);
$("wkPrev").onclick=()=>{statsWeek=addDays(statsWeek,-7);renderStats()};
$("wkNext").onclick=()=>{statsWeek=addDays(statsWeek,7);renderStats()};
$("planForm").addEventListener("input",updatePreview);
$("planForm").addEventListener("change",updatePreview);
$("planForm").addEventListener("submit",savePlan);
$("planCancel").onclick=()=>{editingPlan=false;renderPlan()};
const h=location.hash.slice(1);
setTab(["diary","weight","stats","plan"].includes(h)?h:"diary");


/* ============ "Что приготовить" (ИИ через серверную функцию) ============ */
const COOK_KEY="tarelka-fridge";
function cookTarget(){
  const t=today();
  const eaten=sum(dayMeals(t).filter(m=>isNum(m.kcal)),m=>m.kcal);
  const eatenP=sum(dayMeals(t),m=>m.protein);
  const ep=effPlan(),res=ep?calcPlan(ep):null;
  if(!res||res.error)return {kcal:600,protein:null,text:"Программа не настроена — подберём обычную порцию около 600 ккал."};
  const left=res.kcal-eaten;
  const pLeft=isPlus()?Math.max(0,res.protein-Math.round(eatenP)):null;
  if(left<250)return {kcal:250,protein:null,light:true,text:`Норма на сегодня почти набрана (осталось ${fmtN(Math.max(0,left))} ккал) — подберём лёгкий вариант.`};
  const target=Math.min(left,900);
  return {kcal:target,protein:pLeft,text:`На сегодня осталось ${fmtN(left)} ккал${pLeft!=null?` и ${pLeft} г белка`:""}. Подберём блюдо примерно на ${fmtN(target)} ккал.`};
}
function refreshCookTarget(){$("cookTarget").textContent=cookTarget().text}
async function cook(){
  const err=$("cookErr");err.hidden=true;
  const items=$("cookItems").value.trim();
  if(!items){err.textContent="Перечислите хотя бы пару продуктов.";err.hidden=false;return}
  if(!window.porciyaAI){err.textContent="Подбор блюд временно недоступен. Обновите страницу.";err.hidden=false;return}
  if(!canUseAI()){openPaywall(`Бесплатно доступно ${FREE_AI} ИИ-запроса в день, включая подбор блюд. В Порции Плюс — без ограничений.`);return}
  try{localStorage.setItem(COOK_KEY,items)}catch(e){}
  const tg=cookTarget();
  const btn=$("cookBtn");btn.disabled=true;btn.textContent="Подбираю…";
  const out=$("cookOut");out.innerHTML="";out.append(mk("p","small","Думаю над вариантами… обычно 10–30 секунд."));
  try{
    const r=await window.porciyaAI("cook",{items,kcal:tg.kcal,protein:tg.protein,light:!!tg.light});
    const opts=(Array.isArray(r?.options)?r.options:[]).slice(0,3).filter(o=>o&&typeof o.title==="string"&&Number(o.kcal)>0&&Number(o.kcal)<=3000&&Number(o.portion_g)>0&&Number(o.portion_g)<=3000);
    out.innerHTML="";
    if(!opts.length){out.append(mk("p","small","Не получилось придумать блюдо из этих продуктов. Добавьте ещё что-нибудь."));return}
    countAI();
    for(const o of opts){
      const c=mk("div","recipe");
      c.append(mk("h3",null,o.title.slice(0,80)));
      const n=v=>Math.round(Number(v)||0);
      c.append(mk("div","meta",`${n(o.portion_g)} г · ${n(o.kcal)} ккал · Б ${n(o.protein)} · Ж ${n(o.fat)} · У ${n(o.carbs)}${n(o.time_min)?` · ~${n(o.time_min)} мин`:""}`));
      if(typeof o.why==="string"&&o.why)c.append(mk("p","why",o.why.slice(0,200)));
      if(Array.isArray(o.ingredients)&&o.ingredients.length){
        const ul=mk("ul");o.ingredients.slice(0,15).forEach(i=>ul.append(mk("li",null,`${String(i?.name||"").slice(0,60)}${n(i?.grams)?` — ${n(i.grams)} г`:""}`)));c.append(ul);
      }
      if(Array.isArray(o.steps)&&o.steps.length){
        const ol=mk("ol");o.steps.slice(0,10).forEach(st=>ol.append(mk("li",null,String(st).slice(0,240))));c.append(ol);
      }
      if(typeof o.extra==="string"&&o.extra.trim())c.append(mk("p","extra",`Понадобится ещё: ${o.extra.slice(0,80)}`));
      const b=mk("button","ghost","Записать в дневник");b.type="button";
      b.onclick=()=>useRecipe(o);
      c.append(b);out.append(c);
    }
    out.append(mk("p","small","Калорийность рецептов — оценка ИИ. Проверьте продукты на аллергены."));
  }catch(e){
    out.innerHTML="";
    if(e?.code==="daily_limit")err.textContent="Лимит ИИ-запросов на сегодня исчерпан — завтра снова можно.";
    else if(e?.code==="rate_limited")err.textContent="Слишком много запросов, попробуйте через минуту.";
    else if(e?.code==="not_granted")err.textContent="Подбор блюд отключён: доступ не разрешён.";
    else err.textContent="Не получилось подобрать блюдо. Попробуйте ещё раз.";
    if(e?.code!=="cancelled")err.hidden=false;
  }finally{btn.disabled=false;btn.textContent="Подобрать блюдо"}
}
function useRecipe(o){
  const g=Math.round(Number(o.portion_g)),k=Math.round(Number(o.kcal));
  const title=o.title.slice(0,120);
  selected=today();renderDiary();
  $("fName").value=title;$("fGrams").value=g;$("fTime").value=nowHM();
  $("fVeg").checked=o.has_veg_or_fruit===true;
  const r1=v=>Math.round(v*10)/10;
  est={name:title,per100:Math.round(k/g*100),source:"recipe",note:"рецепт от ИИ",lo:0.85,hi:1.15,conf:"medium"};
  const P=Number(o.protein),F=Number(o.fat),C=Number(o.carbs);
  if([P,F,C].every(v=>v>=0&&v<=500))Object.assign(est,{p100:r1(P/g*100),f100:r1(F/g*100),c100:r1(C/g*100)});
  applyEstimate();
  $("addForm").scrollIntoView({behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth",block:"start"});
  $("fGrams").focus({preventScroll:true});
}
$("cookBtn").onclick=cook;
$("cook").addEventListener("toggle",()=>{if($("cook").open){refreshCookTarget();if(!$("cookItems").value){try{$("cookItems").value=localStorage.getItem(COOK_KEY)||""}catch(e){}}}});


/* ============ reminders ============ */
function dueReminders(){
  const r=settings.reminders;
  if(!r?.on)return [];
  const t=today(),now=nowHM(),dm=dayMeals(t);
  const sk=settings.skipped?.date===t?(settings.skipped.types||[]):[];
  return MAIN.filter(type=>{
    const at=r.times?.[type];
    return at&&now>=at&&!dm.some(m=>m.type===type)&&!sk.includes(type)&&!((snoozed[type]||0)>Date.now());
  });
}
function renderNudges(){
  const box=$("nudges");box.innerHTML="";
  const due=dueReminders();
  document.title=due.length?`(${due.length}) Порция`:"Порция";
  for(const type of due){
    const n=mk("div","nudge");n.style.setProperty("--c",`var(${T[type].c})`);
    n.append(mk("div","nt",NUDGE_TEXT[type]));
    const b=mk("div","btns");
    const log=mk("button","submit","Записать");log.type="button";
    log.onclick=()=>{setTab("diary");selected=today();renderDiary();$("type-"+type).checked=true;$("fTime").value=nowHM();
      $("addForm").scrollIntoView({block:"start",behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"});$("fName").focus({preventScroll:true})};
    const later=mk("button","ghost","Через 30 мин");later.type="button";
    later.onclick=()=>{snoozed[type]=Date.now()+30*60000;renderNudges()};
    const skip=mk("button","quiet",SKIP_TEXT[type]);skip.type="button";
    skip.onclick=()=>skipToday(type);
    b.append(log,later,skip);n.append(b);box.append(n);
  }
}
async function saveSettings(){
  if(settingsRef){try{await settingsRef.set(settings);return true}catch(e){setStatus("Не удалось сохранить настройки");return false}}
  return true;
}
async function skipToday(type){
  const t=today();
  const types=settings.skipped?.date===t?[...(settings.skipped.types||[])]:[];
  if(!types.includes(type))types.push(type);
  settings.skipped={date:t,types};
  renderNudges();await saveSettings();
}
function fillRemForm(){
  const r=settings.reminders||REM_DEFAULT;
  if(document.activeElement?.closest?.("#remForm"))return;
  $("remOn").checked=!!r.on;
  $("remBreakfast").value=r.times?.breakfast||"";$("remLunch").value=r.times?.lunch||"";$("remDinner").value=r.times?.dinner||"";
  $("remTimes").style.opacity=r.on?"1":".5";
}
$("remForm").addEventListener("submit",e=>e.preventDefault());
$("remForm").addEventListener("change",async()=>{
  settings.reminders={on:$("remOn").checked,times:{breakfast:$("remBreakfast").value,lunch:$("remLunch").value,dinner:$("remDinner").value}};
  $("remTimes").style.opacity=settings.reminders.on?"1":".5";
  renderNudges();
  if(await saveSettings())$("remSaved").textContent="Сохранено";
  setTimeout(()=>{$("remSaved").textContent=""},2000);
});
setInterval(renderNudges,60000);
document.addEventListener("visibilitychange",()=>{if(!document.hidden)renderNudges()});


/* ============ edit a meal ============ */
function editRow(m){
  const li=mk("li","meal editing");li.style.setProperty("--c",`var(${T[m.type]?.c||"--muted"})`);
  const f=mk("form","editform");f.noValidate=true;
  f.innerHTML=`
    <div class="field"><label for="e-name">Что ели</label><input id="e-name" maxlength="120"></div>
    <div class="row">
      <div class="field"><label for="e-time">Время</label><input id="e-time" type="time"></div>
      <div class="field"><label for="e-grams">Вес, г</label><input id="e-grams" type="number" min="1" max="5000" inputmode="numeric"></div>
      <div class="field"><label for="e-kcal">Ккал</label><input id="e-kcal" type="number" min="0" max="10000" inputmode="numeric"></div>
    </div>
    <div class="field"><label for="e-type">Приём пищи</label><select id="e-type">${TYPES.map(t=>`<option value="${t.id}">${t.label}</option>`).join("")}</select></div>
    <label class="check"><input type="checkbox" id="e-veg"> Есть овощи или фрукты</label>
    <p class="small" id="e-hint"></p>
    <p class="err" id="e-err" hidden></p>
    <div class="btns"><button class="submit" type="submit" id="e-save">Сохранить</button><button class="ghost" type="button" id="e-cancel">Отмена</button></div>`;
  f.querySelector("#e-name").value=m.name;
  f.querySelector("#e-time").value=m.time;
  f.querySelector("#e-grams").value=isNum(m.grams)?m.grams:"";
  f.querySelector("#e-kcal").value=isNum(m.kcal)?m.kcal:"";
  f.querySelector("#e-type").value=m.type;
  f.querySelector("#e-veg").checked=!!m.veg;
  const hint=f.querySelector("#e-hint");
  const canScale=isNum(m.kcalPer100);
  hint.textContent=canScale?"Если поменять только вес, калории и БЖУ пересчитаются сами.":"";
  f.querySelector("#e-grams").addEventListener("input",()=>{
    const g=Number(f.querySelector("#e-grams").value);
    if(canScale&&g>0&&Number(f.querySelector("#e-kcal").value)===(f._lastAuto??m.kcal)){
      const k=Math.round(m.kcalPer100*g/100);f.querySelector("#e-kcal").value=k;f._lastAuto=k;
    }
  });
  f.querySelector("#e-cancel").onclick=()=>{editingMeal=null;renderDiary()};
  f.addEventListener("submit",async ev=>{
    ev.preventDefault();
    const err=f.querySelector("#e-err");err.hidden=true;
    const name=f.querySelector("#e-name").value.trim(),time=f.querySelector("#e-time").value;
    const gRaw=f.querySelector("#e-grams").value.trim(),kRaw=f.querySelector("#e-kcal").value.trim();
    const fail=t=>{err.textContent=t;err.hidden=false};
    if(!name)return fail("Напишите, что вы ели.");
    if(!time)return fail("Укажите время.");
    const g=gRaw===""?null:Math.round(Number(gRaw)),k=kRaw===""?null:Math.round(Number(kRaw));
    if(g!=null&&!(g>=1&&g<=5000))return fail("Вес: число от 1 до 5000 г.");
    if(k!=null&&!(k>=0&&k<=10000))return fail("Калории: число от 0 до 10 000.");
    const u={...m};delete u.id;
    u.name=name;u.time=time;u.type=f.querySelector("#e-type").value;
    if(f.querySelector("#e-veg").checked)u.veg=true;else delete u.veg;
    if(g!=null)u.grams=g;else delete u.grams;
    if(k!=null)u.kcal=k;else delete u.kcal;
    const autoK=canScale&&g!=null?Math.round(m.kcalPer100*g/100):null;
    if(k!=null&&autoK!=null&&k===autoK){
      // калории пересчитаны от веса — масштабируем диапазон
      if(isNum(m.kcalMin)&&isNum(m.kcal)&&m.kcal>0){u.kcalMin=Math.round(m.kcalMin*k/m.kcal);u.kcalMax=Math.round(m.kcalMax*k/m.kcal)}
    }else if(k!==m.kcal){
      // калории введены вручную — это уже не оценка ИИ
      delete u.kcalMin;delete u.kcalMax;delete u.confidence;u.kcalSource="manual";
    }
    if(g!=null&&isNum(m.p100)){u.protein=Math.round(m.p100*g/100);u.fat=Math.round(m.f100*g/100);u.carbs=Math.round(m.c100*g/100)}
    else if(g==null){delete u.protein;delete u.fat;delete u.carbs}
    u.updatedAt=new Date().toISOString();
    f.querySelector("#e-save").disabled=true;
    try{
      if(mealsCol)await mealsCol.doc(m.id).set(u);
      else meals=meals.map(x=>x.id===m.id?{id:m.id,...u}:x);
      editingMeal=null;renderAll();
    }catch(e){fail("Не удалось сохранить. Попробуйте ещё раз.");f.querySelector("#e-save").disabled=false}
  });
  li.append(f);return li;
}

/* ============ export CSV ============ */
function csvCell(v){v=v==null?"":String(v);return /[";\n\r]/.test(v)?`"${v.replace(/"/g,'""')}"`:v}
const dec=v=>isNum(v)?String(v).replace(".",","):"";
function mealsCSV(){
  const head=["Дата","Время","Приём пищи","Блюдо","Вес, г","Ккал","Ккал мин","Ккал макс","Белки, г","Жиры, г","Углеводы, г","Овощи/фрукты","Источник калорий"];
  const src={ai:"ИИ по названию",photo:"ИИ по фото",recipe:"рецепт ИИ",fav:"избранное",manual:"вручную"};
  const rows=[...meals].sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time)).map(m=>[
    m.date,m.time,T[m.type]?.label||m.type,m.name,m.grams??"",m.kcal??"",m.kcalMin??"",m.kcalMax??"",dec(m.protein),dec(m.fat),dec(m.carbs),m.veg?"да":"",src[m.kcalSource]||(isNum(m.kcal)?"вручную":"")]);
  return "\uFEFF"+[head,...rows].map(r=>r.map(csvCell).join(";")).join("\r\n");
}
function weightsCSV(){
  const rows=[...weights].sort((a,b)=>a.date.localeCompare(b.date)).map(w=>[w.date,dec(w.kg)]);
  return "\uFEFF"+[["Дата","Вес, кг"],...rows].map(r=>r.map(csvCell).join(";")).join("\r\n");
}
async function exportCSV(kind){
  const msg=$("expMsg"),fb=$("expFallback");msg.textContent="";fb.hidden=true;
  const list=kind==="meals"?meals:weights;
  if(!list.length){msg.textContent=kind==="meals"?"В дневнике пока нет записей.":"Записей веса пока нет.";return}
  const data=kind==="meals"?mealsCSV():weightsCSV();
  const filename=`porciya-${kind==="meals"?"dnevnik":"ves"}-${today()}.csv`;
  let dl=null;try{dl=await window.claude?.use?.("downloads")}catch(e){}
  if(dl){
    try{await dl.save({filename,data});msg.textContent="Готово.";return}
    catch(e){if(e?.code==="declined"){msg.textContent="Скачивание отменено.";return}}
  }
  // Обычный сайт: скачиваем файл напрямую
  try{
    const url=URL.createObjectURL(new Blob([data],{type:"text/csv;charset=utf-8"}));
    const link=document.createElement("a");link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),5000);
    msg.textContent="Файл скачан.";
  }catch(e){
    fb.value=data.replace(/^\uFEFF/,"");fb.hidden=false;fb.focus();fb.select();
    msg.textContent="Скачивание недоступно — скопируйте текст ниже и сохраните как файл .csv.";
  }
}
$("expMeals").onclick=()=>exportCSV("meals");
$("expWeights").onclick=()=>exportCSV("weights");

/* ============ delete all data ============ */
$("delStart").onclick=()=>{$("delConfirm").hidden=false;$("delWord").value="";$("delGo").disabled=true;$("delWord").focus()};
$("delCancel").onclick=()=>{$("delConfirm").hidden=true;$("delStart").focus()};
$("delWord").addEventListener("input",()=>{$("delGo").disabled=$("delWord").value.trim().toUpperCase()!=="УДАЛИТЬ"});
$("delGo").onclick=async()=>{
  const msg=$("delMsg");$("delGo").disabled=true;$("delCancel").disabled=true;
  msg.textContent="Удаляю…";
  try{for(const k of [PLUS_KEY,AI_KEY,COOK_KEY,THEME_KEY])localStorage.removeItem(k)}catch(e){}
  applyTheme("system");$("thSystem").checked=true;renderPlusState();
  try{
    if(window.porciyaCloud)await window.porciyaCloud.deleteAccount();
    else{meals=[];weights=[];favorites=[];plan=null;renderAll()}
    msg.textContent="Все данные удалены.";
  }catch(e){msg.textContent="Не удалось удалить аккаунт. Проверьте интернет и попробуйте ещё раз."}
  finally{$("delConfirm").hidden=true;$("delCancel").disabled=false}
};

/* ============ privacy link ============ */
$("openPrivacy").onclick=()=>{setTab("plan");$("privacy").open=true;$("privacy").scrollIntoView({block:"start"})};

/* ============ onboarding ============ */
function maybeOnboard(){
  if(!loaded.meals||!loaded.settings||!loaded.profile)return;
  if(settings.onboarded||meals.length||plan||!$("onboard").hidden)return;
  $("ob1").hidden=false;$("ob2").hidden=true;$("obStep").textContent="Шаг 1 из 2";
  $("onboard").hidden=false;$("obNext").focus();
}
async function finishOnboarding(goal){
  $("onboard").hidden=true;
  settings.onboarded=true;saveSettings();
  if(goal&&goal!=="none"){
    setTab("plan");editingPlan=!!plan;renderPlan();
    const id={weight:"gWeight",keep:"gKeep",regular:"gRegular",veggies:"gVeg"}[goal];
    if(id){$(id).checked=true;updatePreview()}
    $("pAge").focus();
  }else{setTab("diary");$("fName").focus()}
}
$("obNext").onclick=()=>{$("ob1").hidden=true;$("ob2").hidden=false;$("obStep").textContent="Шаг 2 из 2";document.querySelector('input[name="obgoal"]:checked').focus()};
$("obDone").onclick=()=>finishOnboarding(document.querySelector('input[name="obgoal"]:checked').value);
$("obClose").onclick=()=>finishOnboarding("none");
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!$("onboard").hidden)finishOnboarding("none")});

/* ============ paywall UI ============ */
let pwReturnFocus=null;
function openPaywall(reason){
  pwReturnFocus=document.activeElement;
  $("pwReason").textContent=reason||"Больше возможностей для вашей цели.";
  $("pwDemo").hidden=true;
  const plus=isPlus();
  $("pwBuy").textContent=plus?"Плюс уже включён (демо)":"Попробовать 7 дней бесплатно";
  $("pwBuy").disabled=plus;
  $("paywall").hidden=false;
  $("pwClose").focus();
}
function closePaywall(){$("paywall").hidden=true;if(pwReturnFocus?.focus)pwReturnFocus.focus()}
function renderPlusState(){
  const on=isPlus();
  $("plusBadge").hidden=!on;
  const st=$("plusState");st.innerHTML="";
  if(on){
    st.append(mk("span","small","Демо-Плюс включён · "));
    const off=mk("button","pluslink","выключить");off.type="button";
    off.onclick=()=>{setPlus(false);renderPlusState();resetHint();renderAll()};
    st.append(off);
  }else st.append(mk("span","small","Бесплатная версия"));
}
$("openPlus").onclick=()=>openPaywall();
$("pwClose").onclick=closePaywall;
$("paywall").addEventListener("click",e=>{if(e.target===$("paywall"))closePaywall()});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!$("paywall").hidden)closePaywall()});
$("pwBuy").onclick=()=>{$("pwDemo").hidden=false;$("pwDemoOn").focus()};
$("pwDemoOn").onclick=()=>{setPlus(true);closePaywall();renderPlusState();resetHint();renderAll()};
renderPlusState();resetHint();

function lockForms(msg){
  document.querySelectorAll("#addForm input,#addForm button,#weightForm input,#weightForm button,#planForm button[type=submit]").forEach(el=>el.disabled=true);
  $("localNote").textContent=msg;$("localNote").hidden=false;
}

// ИИ работает через серверную функцию Supabase (window.porciyaAI задаётся в js/cloud.js)
$("cook").hidden=false;
$("estRow").hidden=false;
$("photoBtn").hidden=false;

// Хранение данных и вход — в js/cloud.js (Supabase).

/* ============ PWA: установка на телефон и работа без интернета ============ */
if("serviceWorker" in navigator&&location.protocol!=="file:"){
  window.addEventListener("load",()=>navigator.serviceWorker.register("sw.js").catch(()=>{}));
}
let installPrompt=null;
const isStandalone=()=>matchMedia("(display-mode: standalone)").matches||navigator.standalone===true;
function renderInstall(){
  const box=$("installBox");if(!box)return;
  if(isStandalone()){box.hidden=true;return}
  box.hidden=false;
  const ios=/iphone|ipad|ipod/i.test(navigator.userAgent);
  $("installBtn").hidden=!installPrompt;
  $("installHint").textContent=installPrompt?"Порция откроется как отдельное приложение со своей иконкой.":
    ios?"На iPhone: откройте сайт в Safari → кнопка «Поделиться» → «На экран „Домой“».":
    "В браузере откройте меню (⋮) → «Установить приложение» или «Добавить на главный экран».";
}
window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();installPrompt=e;renderInstall()});
window.addEventListener("appinstalled",()=>{installPrompt=null;renderInstall()});
$("installBtn")?.addEventListener("click",async()=>{
  if(!installPrompt)return;
  installPrompt.prompt();
  try{await installPrompt.userChoice}catch(e){}
  installPrompt=null;renderInstall();
});
renderInstall();
