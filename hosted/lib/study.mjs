export const id=()=>crypto.randomUUID().replaceAll('-','');
export const today=()=>new Date().toISOString().slice(0,10);
export const dayAdd=(day,n)=>new Date(Date.parse(day+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
export class Problem extends Error{constructor(message,status=400){super(message);this.status=status;}}
export function need(ok,message='Invalid request',status=400){if(!ok)throw new Problem(message,status);}
export function text(d,key,max=500,required=false){const v=String(d[key]??'').trim();need(v.length<=max,key+' is too long');need(v||!required,key+' is required');return v;}
export function date(v){need(!v||(/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v),'Use a valid date');return v;}
export const kinds=['note','syllabus','homework','quiz','test','project','activity'];
export function itemValues(d){const kind=text(d,'kind');need(kinds.includes(kind),'Choose a valid material type');const number=k=>d[k]===null||d[k]===undefined||d[k]===''?null:Number(d[k]);const score=number('score'),total=number('total'),weight=number('weight')??1;need([score??0,total??0,weight].every(Number.isFinite)&&weight>0&&weight<=100&&(score===null||score>=0)&&(total===null||total>0),'Check grade and weight values');need(score===null||total!==null,'Possible points are required with a score');return {title:text(d,'title',200,true),kind,date:date(text(d,'date',10)||today()),due:date(text(d,'due',10)),content:text(d,'content',200000),score,total,weight,done:!!d.done};}
const stop=new Set('the and that this with from have your into about their there which when then also were they what where will would should could does been are for not you our can has was its all but how why'.split(' '));
const words=s=>(s.toLowerCase().match(/[a-z]{4,}/g)||[]).filter(w=>!stop.has(w));
const count=a=>{const m=new Map();for(const v of a)m.set(v,(m.get(v)||0)+1);return [...m].sort((a,b)=>b[1]-a[1]);};
const avg=a=>a.reduce((n,x)=>n+x,0)/a.length;
const round=n=>Math.round(n*10)/10;
export function analyze(course,items){
 const graded=items.filter(i=>i.score!==null&&i.total),ordered=[...graded].sort((a,b)=>a.date.localeCompare(b.date));
 const grade=graded.length?round(graded.reduce((n,i)=>n+i.score/i.total*i.weight,0)/graded.reduce((n,i)=>n+i.weight,0)*100):null;
 const exams=items.filter(i=>['test','quiz'].includes(i.kind)&&i.date<=today()).sort((a,b)=>a.date.localeCompare(b.date));
 const gaps=exams.slice(1).map((i,j)=>(Date.parse(i.date)-Date.parse(exams[j].date))/86400000).filter(n=>n>0).sort((a,b)=>a-b);
 let prediction=null;
 if(gaps.length>=2){const m=Math.floor(gaps.length/2),median=gaps.length%2?gaps[m]:(gaps[m-1]+gaps[m])/2;const deviation=Math.sqrt(avg(gaps.map(g=>(g-avg(gaps))**2)));const next=dayAdd(exams.at(-1).date,Math.round(median)),spread=Math.max(2,Math.round(deviation));prediction={date:next,start:dayAdd(next,-spread),end:dayAdd(next,spread),confidence:gaps.length>=4&&deviation<=2?'Moderate':'Low',reason:`${exams.length} assessments; median interval ${median} days. Dates are estimates, not teacher announcements.`,stale:next<today()};}
 const dates=items.map(i=>i.date).sort(),span=dates.length?(Date.parse(dates.at(-1))-Date.parse(dates[0]))/86400000+1:0;
 const topics=count(items.filter(i=>['note','syllabus','homework','test','quiz'].includes(i.kind)).flatMap(i=>[...new Set(words(i.title+' '+i.content))])).slice(0,8);
 const n=Math.floor(ordered.length/2),trend=ordered.length>=4?round((avg(ordered.slice(n).map(i=>i.score/i.total))-avg(ordered.slice(0,n).map(i=>i.score/i.total)))*100):null;
 return {course,grade,trend,graded_count:graded.length,weeks:round(span/7),prediction,assessment_count:exams.length,topics,homework_days:count(items.filter(i=>i.kind==='homework'&&i.due).map(i=>new Date(i.due+'T12:00:00Z').toLocaleDateString('en-US',{weekday:'long',timeZone:'UTC'}))),weak:[...graded].sort((a,b)=>a.score/a.total-b.score/b.total).slice(0,3).map(i=>({title:i.title,percent:Math.round(i.score/i.total*100),id:i.id})),evidence:exams.map(i=>({id:i.id,title:i.title,date:i.date}))};
}
export function makeCards(items){const cards=[],seen=new Set();for(const item of items){for(let line of item.content.split(/\n|(?<=[.!?])\s+/)){line=line.replace(/^[ #*\-\t]+|[ #*\-\t]+$/g,'');if(line.length<15||line.length>600||seen.has(line.toLowerCase())||/^(review|write|read|complete|submit|answer|solve|study|practice)\b/i.test(line))continue;seen.add(line.toLowerCase());const pair=line.match(/^(.{2,85}?)\s*(?::|\s[-–—]\s|\s+is\s+|\s+are\s+)\s*(.{8,})$/);let question,answer;if(pair){question=pair[1].trim();answer=pair[2].trim();}else{const candidates=words(line).sort((a,b)=>b.length-a.length);if(!candidates.length)continue;answer=candidates[0];question=line.replace(new RegExp(answer,'i'),'____');}cards.push({question,answer,source_id:item.id,source:item.title});if(cards.length>=60)return cards;}}return cards;}
