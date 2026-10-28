import * as core from './study-core.mjs';
import * as plus from './study-plus.mjs';
export {core,plus};
const KEY='study-ai-guest-v2',MODE='study-ai-guest-active';
export class GuestWorkspace{
 constructor(storage,session){this.storage=storage;this.session=session;this.memory=null;this.mode=false;}
 active(){try{return this.session?.getItem(MODE)==='1'||this.mode;}catch{return this.mode;}}
 start(){this.mode=true;try{this.session?.setItem(MODE,'1');}catch{}if(!this.read())this.write(this.empty());}
 leave(){this.mode=false;try{this.session?.removeItem(MODE);}catch{}}
 empty(){return {version:2,user:{id:'guest',name:'Guest student',email:'Saved only in this browser',guest:true},courses:[],items:[],decks:[],attempts:[],extras:[]};}
 read(){try{const raw=this.storage?.getItem(KEY);return raw?JSON.parse(raw):this.memory;}catch{throw new core.Problem('Your guest backup could not be read. Export or restore a saved backup.');}}
 write(data){if(this.storage){try{this.storage.setItem(KEY,JSON.stringify(data));}catch{throw new core.Problem('Browser storage is full or unavailable. Export a backup before continuing.');}}else this.memory=structuredClone(data);}
 hasData(){try{const s=this.read();return !!(s&&(s.courses.length||s.extras.length));}catch{return false;}}
 backup(){return this.read()||this.empty();}
 async call(path,d){const s=structuredClone(this.read()||this.empty()),{need,id,today,itemValues,makeCards,analyze,dayAdd}=core;let result={ok:true};
 const course=cid=>{const c=s.courses.find(c=>c.id===cid);need(c,'Course not found',404);return c;};const deck=did=>{const x=s.decks.find(x=>x.id===did);need(x,'Set not found',404);return x;};
 if(path==='state')return {...s,guest:true,memoryOnly:!this.storage,analyses:s.courses.map(c=>analyze(c,s.items.filter(i=>i.course_id===c.id))),google:{configured:false,connected:false},decks:s.decks.map(d=>({...d,reviews:d.reviews||[]}))};
 need(d&&typeof d==='object','Invalid request');
 if(path.startsWith('google/'))throw new core.Problem('Sign in to use Google connections. Guest study tools work without Google.');
 if(path==='courses'){const c={id:d.id||id(),name:core.text(d,'name',100,true),teacher:core.text(d,'teacher',100),school:core.text(d,'school',100),color:'violet',google_id:null};if(d.id){course(d.id);s.courses=s.courses.map(x=>x.id===d.id?c:x);}else s.courses.push(c);result={id:c.id};}
 else if(path==='items'){course(d.course_id);const old=d.id?s.items.find(i=>i.id===d.id&&i.course_id===d.course_id):null;need(!d.id||old,'Material not found',404);const item={id:old?.id||id(),course_id:d.course_id,...itemValues(d),source:null};s.items=old?s.items.map(i=>i.id===item.id?item:i):[...s.items,item];result={id:item.id};}
 else if(path==='import'){course(d.course_id);need(Array.isArray(d.items)&&d.items.length>0&&d.items.length<=500,'Import 1–500 rows');const batch=d.items.map(i=>({id:id(),course_id:d.course_id,...itemValues(i),source:null}));s.items.push(...batch);result={count:batch.length};}
 else if(path==='generate'){const c=course(d.course_id),cards=makeCards(s.items.filter(i=>i.course_id===c.id));need(cards.length,'Add notes with definitions or complete sentences first.');const set={id:id(),course_id:c.id,title:core.text(d,'title',100)||c.name+' · Study set',cards,reviews:[],created:today()};s.decks.push(set);result={id:set.id};}
 else if(path==='decks'){course(d.course_id);const old=d.id?deck(d.id):null;need(Array.isArray(d.cards)&&d.cards.length>0&&d.cards.length<=200,'Use 1–200 cards');const set={id:old?.id||id(),course_id:d.course_id,title:core.text(d,'title',100,true),cards:d.cards.map(c=>({question:core.text(c,'question',1000,true),answer:core.text(c,'answer',2000,true),source:core.text(c,'source',200),source_id:core.text(c,'source_id',100)})),reviews:[],created:old?.created||today()};s.decks=old?s.decks.map(x=>x.id===old.id?set:x):[...s.decks,set];result={id:set.id};}
 else if(path==='review'){const set=deck(d.deck_id),card=Number(d.card);need(Number.isInteger(card)&&card>=0&&card<set.cards.length,'Invalid card');const previous=(set.reviews||[]).find(r=>r.card===card),interval=d.known?Math.min(90,Math.max(1,(previous?.interval||0)*2)):0;set.reviews=[...(set.reviews||[]).filter(r=>r.card!==card),{card,interval,due:dayAdd(today(),interval)}];}
 else if(path==='attempt'){const set=deck(d.deck_id),total=Number(d.total),correct=Number(d.correct);need(Number.isInteger(total)&&Number.isInteger(correct)&&total>0&&total<=set.cards.length&&correct>=0&&correct<=total,'Invalid result');s.attempts.unshift({id:id(),deck_id:set.id,total,correct,created:today()});}
 else if(path==='tools'){const payload=plus.toolValues(d.kind,d.payload),old=d.id?s.extras.find(e=>e.id===d.id):d.kind==='settings'?s.extras.find(e=>e.kind==='settings'):null;need(!d.id||old,'Tool record not found',404);if(payload.course_id)course(payload.course_id);if(payload.deck_id){const set=deck(payload.deck_id);need(payload.card<set.cards.length,'Invalid card');}const record={id:old?.id||id(),kind:d.kind,payload,created:old?.created||today()};s.extras=old?s.extras.map(e=>e.id===old.id?record:e):[...s.extras,record];result={id:record.id};}
 else if(path==='tools/delete'){need(s.extras.some(e=>e.id===d.id),'Record not found',404);s.extras=s.extras.filter(e=>e.id!==d.id);}
 else if(path==='restore'){const rows=plus.prepareRestore(d.backup);for(const row of rows){if(row.type==='course')s.courses.push(row.data);if(row.type==='item')s.items.push(row.data);if(row.type==='deck')s.decks.push({...row.data,reviews:[]});if(row.type==='tool')s.extras.push(row.data);}result={count:rows.length};}
 else if(path==='delete'){if(d.type==='account'){need(d.confirmation==='DELETE','Type DELETE to erase guest data');this.write(this.empty());return {ok:true};}if(d.type==='course'){course(d.id);s.courses=s.courses.filter(x=>x.id!==d.id);const dids=s.decks.filter(x=>x.course_id===d.id).map(x=>x.id);s.items=s.items.filter(x=>x.course_id!==d.id);s.decks=s.decks.filter(x=>x.course_id!==d.id);s.attempts=s.attempts.filter(x=>!dids.includes(x.deck_id));s.extras=s.extras.filter(x=>x.payload.course_id!==d.id&&!dids.includes(x.payload.deck_id));}else if(d.type==='item')s.items=s.items.filter(x=>x.id!==d.id);else if(d.type==='deck'){deck(d.id);s.decks=s.decks.filter(x=>x.id!==d.id);s.attempts=s.attempts.filter(x=>x.deck_id!==d.id);s.extras=s.extras.filter(x=>x.payload.deck_id!==d.id);}else need(false,'Invalid deletion');}
 else throw new core.Problem('This operation is not available in guest mode.');
 this.write(s);return result;
 }
}
function available(which){try{const storage=globalThis[which];storage.setItem('__study_test','1');storage.removeItem('__study_test');return storage;}catch{return null;}}
export const GuestStore=typeof window==='undefined'?null:new GuestWorkspace(available('localStorage'),available('sessionStorage'));
