// @ts-nocheck
import { env } from 'cloudflare:workers';
import {getChatGPTUser} from '../../chatgpt-auth';
import {id,today,dayAdd,Problem,need,text,date,itemValues,analyze,makeCards} from '../../../lib/study.mjs';
import {toolValues,prepareRestore} from '../../../lib/plus.mjs';
export const dynamic='force-dynamic';
const scopes=['classroom.courses.readonly','classroom.coursework.me.readonly','drive.readonly'].map(s=>'https://www.googleapis.com/auth/'+s).join(' ');
const response=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
async function google(url,token=null,form=null,raw=false){const r=await fetch(url,{headers:token?{Authorization:'Bearer '+token}:{},...(form?{method:'POST',body:new URLSearchParams(form)}:{})});need(r.ok,`Google request failed (${r.status}). Check permissions or reconnect.`,502);const content=await r.text();need(content.length<=2000000,'Google document is too large');return raw?content:JSON.parse(content);}
async function pages(url,key,token){let results=[];for(let n=0;n<20;n++){const r=await google(url,token);results.push(...(r[key]||[]));if(!r.nextPageToken)return results;const u=new URL(url);u.searchParams.set('pageToken',r.nextPageToken);url=u.href;}throw new Problem('Google returned more than 20 pages. Narrow the import and retry.',422);}
async function handle(request){try{
 const url=new URL(request.url),path=url.pathname.slice(5),method=request.method;
 if(method!=='GET'){need(request.headers.get('Origin')===url.origin,'Origin check failed',403);need(request.headers.get('Content-Type')?.startsWith('application/json'),'JSON required',415);}
 const user=await getChatGPTUser();need(user,'Sign in to save your private workspace',401);
 const owner=user.userId,DB=env.DB;need(DB,'Database is not available',503);
 const body=method==='GET'?'':await request.text();need(body.length<=3000000,'Request too large',413);
 const d=body?JSON.parse(body):{};need(d&&typeof d==='object'&&!Array.isArray(d),'JSON object required');
 const result=await DB.prepare('SELECT id,type,course_id,data FROM records WHERE owner=?').bind(owner).all();
 const records=result.results.map(r=>({...JSON.parse(r.data),id:r.id,record_type:r.type,course_id:r.course_id}));
 const ofType=t=>records.filter(r=>r.record_type===t).map(({record_type,...r})=>r);
 const courses=ofType('course'),items=ofType('item').sort((a,b)=>b.date.localeCompare(a.date)),decks=ofType('deck'),reviews=ofType('review'),attempts=ofType('attempt'),extras=ofType('tool');
 const getCourse=cid=>{const c=courses.find(c=>c.id===cid);need(c,'Course not found',404);return c;};
 const getDeck=did=>{const deck=decks.find(x=>x.id===did);need(deck,'Study set not found',404);return deck;};
 const insert=(type,record,cid=null)=>DB.prepare('INSERT INTO records(id,owner,type,course_id,data) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,course_id=excluded.course_id WHERE records.owner=excluded.owner').bind(record.id,owner,type,cid,JSON.stringify(record));
 const save=async(type,record,cid=null)=>{await insert(type,record,cid).run();return record.id;};
 const credential=await DB.prepare('SELECT data FROM credentials WHERE owner=?').bind(owner).first();let tokens=credential?JSON.parse(credential.data):null;
 const configured=!!(env.GOOGLE_CLIENT_ID&&env.GOOGLE_CLIENT_SECRET);
 async function saveTokens(t){tokens=t;await DB.prepare('INSERT INTO credentials(owner,data) VALUES(?,?) ON CONFLICT(owner) DO UPDATE SET data=excluded.data').bind(owner,JSON.stringify(t)).run();}
 async function token(){need(tokens,'Connect Google first');if(tokens.expires_at<Date.now()+60000){need(configured&&tokens.refresh_token,'Reconnect Google to refresh access');const fresh=await google('https://oauth2.googleapis.com/token',null,{client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,refresh_token:tokens.refresh_token,grant_type:'refresh_token'});await saveTokens({...tokens,...fresh,expires_at:Date.now()+fresh.expires_in*1000});}return tokens.access_token;}
 function preparedItem(cid,data,source=null){const old=source?items.find(i=>i.course_id===cid&&i.source===source):null;return {id:old?.id||id(),course_id:cid,...itemValues(data),source};}
 if(path==='state'&&method==='GET')return response({user:{id:owner,email:user.email,name:user.displayName},courses,items,extras,decks:decks.map(d=>({...d,reviews:reviews.filter(r=>r.deck_id===d.id)})),analyses:courses.map(c=>analyze(c,items.filter(i=>i.course_id===c.id))),attempts:attempts.sort((a,b)=>b.created.localeCompare(a.created)).slice(0,50),google:{configured,connected:!!tokens}});
 if(path==='tools'&&method==='POST'){
  const payload=toolValues(d.kind,d.payload),old=d.id?extras.find(e=>e.id===d.id):d.kind==='settings'?extras.find(e=>e.kind==='settings'):null;need(!d.id||old,'Tool record not found',404);
  if(payload.course_id)getCourse(payload.course_id);if(payload.deck_id){const deck=getDeck(payload.deck_id);need(payload.card<deck.cards.length,'Invalid card');}
  const record={id:old?.id||id(),kind:d.kind,payload,created:old?.created||today()};await save('tool',record,payload.course_id||(payload.deck_id?getDeck(payload.deck_id).course_id:null)||null);return response({id:record.id});
 }
 if(path==='tools/delete'&&method==='POST'){need(extras.some(e=>e.id===d.id),'Record not found',404);await DB.prepare("DELETE FROM records WHERE owner=? AND type='tool' AND id=?").bind(owner,d.id).run();return response({ok:true});}
 if(path==='restore'&&method==='POST'){const batch=prepareRestore(d.backup);await DB.batch(batch.map(r=>insert(r.type,r.data,r.course_id)));return response({count:batch.length});}
 if(path==='courses'&&method==='POST'){
  const cid=text(d,'id')||id(),old=d.id?getCourse(cid):null;
  await save('course',{...old,id:cid,user_id:owner,name:text(d,'name',100,true),teacher:text(d,'teacher',100),school:text(d,'school',100),color:'violet',google_id:old?.google_id||null});return response({id:cid});
 }
 if(path==='items'&&method==='POST'){
  const cid=text(d,'course_id');getCourse(cid);let old=null;
  if(d.id){old=items.find(i=>i.id===d.id&&i.course_id===cid);need(old,'Material not found',404);}
  const record={id:old?.id||id(),course_id:cid,...itemValues(d),source:old?.source||null};await save('item',record,cid);return response({id:record.id});
 }
 if(path==='import'&&method==='POST'){
  const cid=text(d,'course_id');getCourse(cid);need(Array.isArray(d.items)&&d.items.length>0&&d.items.length<=500,'Import 1–500 rows at once');
  const batch=d.items.map(i=>preparedItem(cid,i));await DB.batch(batch.map(i=>insert('item',i,cid)));return response({count:batch.length});
 }
 if(path==='generate'&&method==='POST'){
  const cid=text(d,'course_id'),c=getCourse(cid),cards=makeCards(items.filter(i=>i.course_id===cid));need(cards.length,'Add notes with definitions or complete sentences first.');
  const deck={id:id(),user_id:owner,course_id:cid,title:text(d,'title',100)||c.name+' · Study set',cards,created:today()};await save('deck',deck,cid);return response({id:deck.id});
 }
 if(path==='decks'&&method==='POST'){
  const cid=text(d,'course_id');getCourse(cid);const cards=d.cards;need(Array.isArray(cards)&&cards.length>0&&cards.length<=200,'Use 1–200 cards');
  const clean=cards.map(c=>({question:text(c,'question',1000,true),answer:text(c,'answer',2000,true),source:text(c,'source',200),source_id:text(c,'source_id',100)}));const old=d.id?getDeck(d.id):null;
  const deck={id:old?.id||id(),user_id:owner,course_id:cid,title:text(d,'title',100,true),cards:clean,created:old?.created||today()};
  await DB.batch([insert('deck',deck,cid),DB.prepare("DELETE FROM records WHERE owner=? AND type='review' AND json_extract(data,'$.deck_id')=?").bind(owner,deck.id)]);return response({id:deck.id});
 }
 if((path==='review'||path==='attempt')&&method==='POST'){
  const deck=getDeck(d.deck_id);
  if(path==='review'){
   const card=Number(d.card);need(Number.isInteger(card)&&card>=0&&card<deck.cards.length,'Invalid card');const previous=reviews.find(r=>r.deck_id===deck.id&&r.card===card);const interval=d.known?Math.min(90,Math.max(1,(previous?.interval||0)*2)):0;
   await save('review',{id:deck.id+':'+card,user_id:owner,deck_id:deck.id,card,interval,due:dayAdd(today(),interval)},deck.course_id);
  }else{const total=Number(d.total),correct=Number(d.correct);need(Number.isInteger(total)&&Number.isInteger(correct)&&correct>=0&&correct<=total&&total>0&&total<=deck.cards.length,'Invalid score');await save('attempt',{id:id(),user_id:owner,deck_id:deck.id,correct,total,created:today()},deck.course_id);}
  return response({ok:true});
 }
 if(path==='delete'&&method==='POST'){
  if(d.type==='course'){getCourse(d.id);await DB.batch([DB.prepare('DELETE FROM records WHERE owner=? AND course_id=?').bind(owner,d.id),DB.prepare('DELETE FROM records WHERE owner=? AND id=?').bind(owner,d.id)]);}
  else if(d.type==='item'){need(items.some(i=>i.id===d.id),'Material not found',404);await DB.prepare("DELETE FROM records WHERE owner=? AND id=? AND type='item'").bind(owner,d.id).run();}
  else if(d.type==='deck'){getDeck(d.id);await DB.batch([DB.prepare("DELETE FROM records WHERE owner=? AND id=? AND type='deck'").bind(owner,d.id),DB.prepare("DELETE FROM records WHERE owner=? AND type IN ('review','attempt','tool') AND (json_extract(data,'$.deck_id')=? OR json_extract(data,'$.payload.deck_id')=?)").bind(owner,d.id,d.id)]);}
  else if(d.type==='account'){need(d.confirmation==='DELETE','Type DELETE to erase your workspace');if(tokens){try{await google('https://oauth2.googleapis.com/revoke',null,{token:tokens.refresh_token||tokens.access_token},true);}catch{}}
   await DB.batch([DB.prepare('DELETE FROM records WHERE owner=?').bind(owner),DB.prepare('DELETE FROM credentials WHERE owner=?').bind(owner),DB.prepare('DELETE FROM oauth_states WHERE owner=?').bind(owner)]);
  }else throw new Problem('Invalid deletion');return response({ok:true});
 }
 if(path==='google/start'&&method==='POST'){
  need(configured,'Google is not configured on this website',503);const state=id(),verifier=id()+id();const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier));const challenge=btoa(String.fromCharCode(...new Uint8Array(hash))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
  await DB.batch([DB.prepare('DELETE FROM oauth_states WHERE expires<?').bind(Date.now()),DB.prepare('INSERT INTO oauth_states VALUES(?,?,?,?)').bind(state,owner,verifier,Date.now()+600000)]);
  return response({url:'https://accounts.google.com/o/oauth2/v2/auth?'+new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,redirect_uri:url.origin+'/api/google/callback',response_type:'code',scope:scopes,state,access_type:'offline',prompt:'consent',code_challenge:challenge,code_challenge_method:'S256'})});
 }
 if(path==='google/callback'&&method==='GET'){
  const state=url.searchParams.get('state')||'',row=await DB.prepare('SELECT * FROM oauth_states WHERE state=? AND owner=? AND expires>?').bind(state,owner,Date.now()).first();need(row,'Google connection request expired. Try again.');
  await DB.prepare('DELETE FROM oauth_states WHERE state=?').bind(state).run();const code=url.searchParams.get('code');need(code,'Google connection was cancelled');const t=await google('https://oauth2.googleapis.com/token',null,{client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,redirect_uri:url.origin+'/api/google/callback',code,code_verifier:row.verifier,grant_type:'authorization_code'});await saveTokens({...t,expires_at:Date.now()+t.expires_in*1000});return Response.redirect(url.origin+'/?google=connected',302);
 }
 if(path==='google/disconnect'&&method==='POST'){
  if(tokens){try{await google('https://oauth2.googleapis.com/revoke',null,{token:tokens.refresh_token||tokens.access_token},true);}catch{}}
  await DB.prepare('DELETE FROM credentials WHERE owner=?').bind(owner).run();return response({ok:true});
 }
 if(path==='google/sync'&&method==='POST'){
  const access=await token(),classes=await pages('https://classroom.googleapis.com/v1/courses?studentId=me&courseStates=ACTIVE','courses',access),statements=[],cutoff=dayAdd(today(),-42);let count=0;
  for(const c of classes){let local=courses.find(x=>x.google_id===c.id);if(!local){local={id:id(),user_id:owner,name:c.name,teacher:'',school:c.room||'',color:'violet',google_id:c.id};statements.push(insert('course',local));}
   const base='https://classroom.googleapis.com/v1/courses/'+encodeURIComponent(c.id)+'/courseWork',work=await pages(base,'courseWork',access),submissions=await pages(base+'/-/studentSubmissions?userId=me','studentSubmissions',access);
   for(const w of work){const day=(w.creationTime||today()).slice(0,10);if(day<cutoff)continue;const s=submissions.find(s=>s.courseWorkId===w.id)||{};const due=w.dueDate?[w.dueDate.year,String(w.dueDate.month).padStart(2,'0'),String(w.dueDate.day).padStart(2,'0')].join('-'):'';
    const item=preparedItem(local.id,{title:w.title,kind:'homework',date:day,due,content:w.description||'',score:w.maxPoints?s.assignedGrade:null,total:w.maxPoints||null,done:['TURNED_IN','RETURNED'].includes(s.state)},'classroom:'+w.id);statements.push(insert('item',item,local.id));count++;
   }
  }
  if(statements.length)await DB.batch(statements);return response({count});
 }
 if(path==='google/files'&&method==='GET'){
  const access=await token();return response({files:await pages('https://www.googleapis.com/drive/v3/files?'+new URLSearchParams({q:"trashed = false and (mimeType = 'application/vnd.google-apps.document' or mimeType = 'text/plain')",fields:'nextPageToken,files(id,name,mimeType)',pageSize:'100'}),'files',access)});
 }
 if(path==='google/import'&&method==='POST'){
  const cid=text(d,'course_id');getCourse(cid);const access=await token(),base='https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(text(d,'file_id',200,true)),meta=await google(base+'?fields=id,name,mimeType',access);need(['application/vnd.google-apps.document','text/plain'].includes(meta.mimeType),'Select a Google Doc or text file');
  const content=await google(base+(meta.mimeType.endsWith('document')?'/export?mimeType=text%2Fplain':'?alt=media'),access,null,true);const record=preparedItem(cid,{title:meta.name,kind:'note',content},'drive:'+meta.id);await save('item',record,cid);return response({id:record.id});
 }
 throw new Problem('Not found',404);
}catch(e){if(e instanceof Problem)return response({error:e.message},e.status);if(e instanceof SyntaxError)return response({error:'Invalid JSON'},400);console.error('Study request failed:',e?.message);return response({error:'The request could not be completed. Try again.'},500);}}
export const GET=handle;
export const POST=handle;
