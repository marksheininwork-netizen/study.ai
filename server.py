"""Study.ai: dependency-free, self-hosted student workspace."""
import os, json, sqlite3, secrets, hashlib, hmac, time, re, statistics, datetime, collections, urllib.request, urllib.parse, urllib.error
from pathlib import Path
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from http.cookies import SimpleCookie

ROOT = Path(__file__).parent
DB = os.environ.get('STUDY_DB', str(ROOT / 'data' / 'study.db'))
ORIGIN = os.environ.get('APP_ORIGIN', 'http://localhost:8000').rstrip('/')
SCOPES = ' '.join('https://www.googleapis.com/auth/' + s for s in ['classroom.courses.readonly', 'classroom.coursework.me.readonly', 'drive.readonly'])
KINDS = ['note', 'syllabus', 'homework', 'quiz', 'test', 'project', 'activity']

def connect():
    db = sqlite3.connect(DB, timeout=20)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA foreign_keys=ON')
    return db

def init_db():
    Path(DB).parent.mkdir(parents=True, exist_ok=True)
    with connect() as db:
        db.executescript('''
        PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE,name TEXT,password TEXT,salt TEXT);
        CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id) ON DELETE CASCADE,expires REAL);
        CREATE TABLE IF NOT EXISTS courses(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id) ON DELETE CASCADE,name TEXT,teacher TEXT,school TEXT,color TEXT,google_id TEXT,UNIQUE(user_id,google_id));
        CREATE TABLE IF NOT EXISTS items(id TEXT PRIMARY KEY,course_id TEXT REFERENCES courses(id) ON DELETE CASCADE,title TEXT,kind TEXT,date TEXT,due TEXT,content TEXT,score REAL,total REAL,weight REAL DEFAULT 1,done INTEGER DEFAULT 0,source TEXT,UNIQUE(course_id,source));
        CREATE TABLE IF NOT EXISTS decks(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id) ON DELETE CASCADE,course_id TEXT REFERENCES courses(id) ON DELETE CASCADE,title TEXT,cards TEXT,created TEXT);
        CREATE TABLE IF NOT EXISTS reviews(user_id TEXT REFERENCES users(id) ON DELETE CASCADE,deck_id TEXT REFERENCES decks(id) ON DELETE CASCADE,card INTEGER,due TEXT,interval INTEGER DEFAULT 0,PRIMARY KEY(user_id,deck_id,card));
        CREATE TABLE IF NOT EXISTS attempts(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id) ON DELETE CASCADE,deck_id TEXT REFERENCES decks(id) ON DELETE CASCADE,correct INTEGER,total INTEGER,created TEXT);
        CREATE TABLE IF NOT EXISTS google(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,tokens TEXT);
        CREATE TABLE IF NOT EXISTS oauth(state TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id) ON DELETE CASCADE,verifier TEXT,expires REAL);
        CREATE TABLE IF NOT EXISTS limits(key TEXT PRIMARY KEY,count INTEGER,expires REAL);
        ''')
    os.chmod(DB, 0o600)

def uid(): return secrets.token_hex(16)
def today(): return datetime.date.today().isoformat()
def password(p, salt): return hashlib.pbkdf2_hmac('sha256', p.encode(), bytes.fromhex(salt), 310000).hex()
def rows(db, sql, args=()): return [dict(r) for r in db.execute(sql, args)]
def require(ok, message='Invalid request', status=400):
    if not ok: raise Problem(message, status)
class Problem(Exception):
    def __init__(self, message, status=400): self.message, self.status = message, status

def text(data, key, limit=500, required=False):
    value = str(data.get(key, '')).strip()
    require(len(value) <= limit, key + ' is too long')
    require(value or not required, key + ' is required')
    return value

def valid_date(value):
    if value: datetime.date.fromisoformat(value)
    return value

def course(db, user, cid):
    c = db.execute('SELECT * FROM courses WHERE id=? AND user_id=?', (cid,user)).fetchone()
    require(c, 'Course not found', 404)
    return dict(c)

def item_values(d):
    kind = text(d,'kind'); require(kind in KINDS,'Choose a valid item type')
    score = None if d.get('score') in ('',None) else float(d['score'])
    total = None if d.get('total') in ('',None) else float(d['total'])
    weight = float(d.get('weight') or 1)
    require(all(__import__('math').isfinite(n) for n in (weight,score or 0,total or 0)) and 0 < weight <= 100 and (score is None or score >= 0) and (total is None or total > 0), 'Check grade and weight values')
    require(score is None or total is not None, 'Possible points are required with a score')
    return (text(d,'title',200,True),kind,valid_date(text(d,'date',10) or today()),valid_date(text(d,'due',10)),text(d,'content',200000),score,total,weight,int(bool(d.get('done'))))

def add_item(db, cid, d, source=None):
    values = item_values(d)
    old = db.execute('SELECT id FROM items WHERE course_id=? AND source=?',(cid,source)).fetchone() if source else None
    if old:
        db.execute('UPDATE items SET title=?,kind=?,date=?,due=?,content=?,score=?,total=?,weight=?,done=? WHERE id=?',values+(old['id'],))
        return old['id']
    ident=uid()
    db.execute('INSERT INTO items(id,course_id,title,kind,date,due,content,score,total,weight,done,source) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',(ident,cid)+values+(source,))
    return ident

STOP=set('the and that this with from have your into about their there which when then also were they what where will would should could does been are for not you our can has was its all but how why'.split())
def keywords(content):
    return [w for w in re.findall(r'[a-zA-Z]{4,}',content.lower()) if w not in STOP]

def analysis(c, items):
    graded=[i for i in items if i['score'] is not None and i['total']]
    grade=round(sum(i['score']/i['total']*i['weight'] for i in graded)/sum(i['weight'] for i in graded)*100,1) if graded else None
    exams=sorted([i for i in items if i['kind'] in ('test','quiz') and i['date']<=today()],key=lambda i:i['date'])
    gaps=[(datetime.date.fromisoformat(b['date'])-datetime.date.fromisoformat(a['date'])).days for a,b in zip(exams,exams[1:])]
    gaps=[g for g in gaps if g>0]
    prediction=None
    if len(gaps)>=2:
        gap=statistics.median(gaps)
        nxt=datetime.date.fromisoformat(exams[-1]['date'])+datetime.timedelta(days=round(gap))
        spread=max(2,round(statistics.pstdev(gaps)))
        prediction={'date':nxt.isoformat(),'start':(nxt-datetime.timedelta(days=spread)).isoformat(),'end':(nxt+datetime.timedelta(days=spread)).isoformat(),'confidence':'Moderate' if len(gaps)>=4 and statistics.pstdev(gaps)<=2 else 'Low','reason':f'{len(exams)} assessments; median interval {gap:g} days. Dates are estimates, not teacher announcements.','stale':nxt<datetime.date.today()}
    dates=sorted(set(i['date'] for i in items))
    span=(datetime.date.fromisoformat(dates[-1])-datetime.date.fromisoformat(dates[0])).days+1 if dates else 0
    topics=collections.Counter()
    for i in items:
        if i['kind'] in ('note','syllabus','homework','test','quiz'):
            topics.update(set(keywords(i['title']+' '+i['content'])))
    weekdays=collections.Counter(datetime.date.fromisoformat(i['due']).strftime('%A') for i in items if i['kind']=='homework' and i['due'])
    ordered=sorted(graded,key=lambda i:i['date'])
    trend=None
    if len(ordered)>=4:
        n=len(ordered)//2
        avg=lambda a:sum(i['score']/i['total']*100 for i in a)/len(a)
        trend=round(avg(ordered[n:])-avg(ordered[:n]),1)
    weak=sorted(graded,key=lambda i:i['score']/i['total'])[:3]
    return {'course':c,'grade':grade,'trend':trend,'graded_count':len(graded),'weeks':round(span/7,1),'prediction':prediction,'assessment_count':len(exams),'topics':topics.most_common(8),'homework_days':weekdays.most_common(),'weak':[{'title':i['title'],'percent':round(i['score']/i['total']*100),'id':i['id']} for i in weak],'evidence':[{'id':i['id'],'title':i['title'],'date':i['date']} for i in exams]}

def make_cards(items):
    cards=[]; seen=set()
    for i in items:
        for line in re.split(r'\n|(?<=[.!?])\s+',i['content']):
            line=line.strip(' #*-\t')
            if len(line)<15 or len(line)>600 or line.lower() in seen: continue
            if re.match(r'^(review|write|read|complete|submit|answer|solve|study|practice)\b',line,re.I): continue
            seen.add(line.lower())
            pair=re.match(r'^(.{2,85}?)\s*(?::|\s[-–—]\s|\s+is\s+|\s+are\s+)\s*(.{8,})$',line)
            if pair: q,a=pair.group(1).strip(),pair.group(2).strip()
            else:
                words=keywords(line)
                if not words: continue
                word=max(words,key=len)
                q=re.sub(re.escape(word),'____',line,count=1,flags=re.I); a=word
            cards.append({'question':q,'answer':a,'source_id':i['id'],'source':i['title']})
            if len(cards)>=60: return cards
    return cards

def extract_document(name, encoded):
    import base64, io, zipfile, xml.etree.ElementTree as ET
    try: body=base64.b64decode(encoded,validate=True)
    except Exception: raise Problem('Invalid file encoding')
    require(len(body)<=1500000,'Use a file smaller than 1.5 MB')
    suffix=Path(name).suffix.lower()
    if suffix=='.docx':
        try:
            with zipfile.ZipFile(io.BytesIO(body)) as z:
                info=z.getinfo('word/document.xml')
                require(info.file_size<=2000000,'Document is too large')
                root=ET.fromstring(z.read(info))
                result='\n'.join(''.join(p.itertext()) for p in root.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p'))
        except (zipfile.BadZipFile,KeyError,ET.ParseError): raise Problem('Could not read this Word document')
    elif suffix=='.pdf':
        try: from pypdf import PdfReader
        except ImportError: raise Problem('PDF support requires the server owner to install requirements.txt. You can paste the document text instead.',503)
        try:
            reader=PdfReader(io.BytesIO(body)); require(len(reader.pages)<=100,'Use a PDF with at most 100 pages')
            require(not reader.is_encrypted,'Unlock the PDF before importing')
            result='\n'.join(p.extract_text() or '' for p in reader.pages)
        except Problem: raise
        except Exception: raise Problem('Could not extract this PDF. Try pasting its text.')
    else: raise Problem('Choose a PDF or DOCX file')
    require(result.strip(),'No readable text found. Scanned documents need OCR first.')
    require(len(result)<=200000,'Extracted text exceeds 200,000 characters')
    return result

def google_request(url, token=None, form=None, raw=False):
    data=urllib.parse.urlencode(form).encode() if form else None
    headers={'Authorization':'Bearer '+token} if token else {}
    req=urllib.request.Request(url,data=data,headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=25) as r:
            body=r.read(2000001)
            require(len(body)<=2000000,'Google document is too large')
            return body.decode('utf-8') if raw else json.loads(body)
    except urllib.error.HTTPError as e:
        raise Problem('Google request failed ('+str(e.code)+'). Check permissions or reconnect.',502)

def google_token(db,user):
    row=db.execute('SELECT tokens FROM google WHERE user_id=?',(user,)).fetchone()
    require(row,'Connect Google first')
    tokens=json.loads(row['tokens'])
    if tokens.get('expires_at',0)<time.time()+60:
        require(tokens.get('refresh_token'),'Reconnect Google to refresh access')
        fresh=google_request('https://oauth2.googleapis.com/token',form={'client_id':os.environ['GOOGLE_CLIENT_ID'],'client_secret':os.environ['GOOGLE_CLIENT_SECRET'],'refresh_token':tokens['refresh_token'],'grant_type':'refresh_token'})
        tokens.update(fresh); tokens['expires_at']=time.time()+fresh['expires_in']
        db.execute('UPDATE google SET tokens=? WHERE user_id=?',(json.dumps(tokens),user))
    return tokens['access_token']

def pages(url,key,token):
    result=[]
    for _ in range(20):
        page=google_request(url,token); result+=page.get(key,[])
        if not page.get('nextPageToken'): return result
        base=re.sub(r'([?&])pageToken=[^&]*','',url)
        url=base+('&' if '?' in base else '?')+urllib.parse.urlencode({'pageToken':page['nextPageToken']})
    raise Problem('Google returned more than 20 pages. Narrow the import before retrying.',422)

class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args): pass
    def send(self,data,status=200,cookie=None,location=None):
        if getattr(self,'in_transaction',False):
            self.pending_response=(data,status,cookie,location)
            return
        body=json.dumps(data).encode() if not isinstance(data,bytes) else data
        self.send_response(status)
        self.send_header('Content-Type','application/json; charset=utf-8')
        self.send_header('Cache-Control','no-store')
        self.headers_security()
        if cookie: self.send_header('Set-Cookie',cookie)
        if location: self.send_header('Location',location)
        self.send_header('Content-Length',str(len(body))); self.end_headers(); self.wfile.write(body)
    def headers_security(self):
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Referrer-Policy','same-origin')
        self.send_header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
    def do_GET(self): self.dispatch()
    def do_POST(self): self.dispatch()
    def do_DELETE(self): self.dispatch()
    def dispatch(self):
        try:
            if self.command!='GET':
                require(self.headers.get('Origin')==ORIGIN,'Origin check failed',403)
                require(self.headers.get('Content-Type','').startswith('application/json'),'JSON required',415)
            path=urllib.parse.urlsplit(self.path).path
            if not path.startswith('/api/'):
                require(self.command=='GET','Not found',404)
                files={'/':('index.html','text/html'),'/app.js':('app.js','text/javascript'),'/style.css':('style.css','text/css')}
                require(path in files,'Not found',404)
                f,mime=files[path]; body=(ROOT/'public'/f).read_bytes()
                self.send_response(200); self.send_header('Content-Type',mime+'; charset=utf-8'); self.headers_security(); self.send_header('Content-Length',str(len(body))); self.end_headers(); self.wfile.write(body); return
            length=int(self.headers.get('Content-Length',0)); require(0<=length<=3000000,'Request too large',413)
            d=json.loads(self.rfile.read(length)) if length else {}
            require(isinstance(d,dict),'JSON object required')
            db=connect()
            try:
                self.in_transaction=True
                with db: self.api(db,path,d)
            finally:
                self.in_transaction=False
                db.close()
            self.send(*self.pending_response)
        except Problem as e: self.send({'error':e.message},e.status)
        except (ValueError,TypeError,KeyError): self.send({'error':'Invalid values. Check the form and try again.'},400)
        except sqlite3.IntegrityError: self.send({'error':'That record already exists or is no longer available.'},409)
        except Exception:
            import traceback; traceback.print_exc()
            self.send({'error':'The request could not be completed.'},500)
    def api(self,db,path,d):
        method=self.command
        if path in ('/api/register','/api/login') and method=='POST':
            key=self.client_address[0]+':auth'; now=time.time()
            db.execute('DELETE FROM limits WHERE expires<?',(now,))
            db.execute('INSERT INTO limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1',(key,now+600))
            db.commit()
            require(db.execute('SELECT count FROM limits WHERE key=?',(key,)).fetchone()[0]<=30,'Too many attempts. Try again in 10 minutes.',429)
            email=text(d,'email',254,True).lower(); p=text(d,'password',200,True)
            require(re.match(r'^[^\s@]+@[^\s@]+\.[^\s@]+$',email),'Enter a valid email')
            if path.endswith('register'):
                require(len(p)>=12,'Use at least 12 characters for your password')
                user=uid(); salt=secrets.token_hex(16)
                db.execute('INSERT INTO users VALUES(?,?,?,?,?)',(user,email,text(d,'name',80,True),password(p,salt),salt))
            else:
                u=db.execute('SELECT * FROM users WHERE email=?',(email,)).fetchone()
                salt=u['salt'] if u else '00'*16
                match=hmac.compare_digest(password(p,salt),u['password'] if u else '0'*64)
                require(u and match,'Email or password is incorrect',401); user=u['id']
            sid=uid(); db.execute('INSERT INTO sessions VALUES(?,?,?)',(sid,user,now+604800))
            self.send({'ok':True},cookie='study_session='+sid+'; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800'+('; Secure' if ORIGIN.startswith('https:') else '')); return
        cookies=SimpleCookie(self.headers.get('Cookie','')); sid=cookies.get('study_session'); sid=sid.value if sid else ''
        u=db.execute('SELECT users.id,users.email,users.name FROM users JOIN sessions ON users.id=sessions.user_id WHERE sessions.id=? AND sessions.expires>?',(sid,time.time())).fetchone()
        require(u,'Please sign in',401); user=u['id']
        if path=='/api/logout' and method=='POST':
            db.execute('DELETE FROM sessions WHERE id=?',(sid,)); self.send({'ok':True},cookie='study_session=; Path=/; Max-Age=0'); return
        if path=='/api/state' and method=='GET':
            cs=rows(db,'SELECT * FROM courses WHERE user_id=?',(user,))
            its=rows(db,'SELECT items.* FROM items JOIN courses ON courses.id=items.course_id WHERE user_id=? ORDER BY date DESC',(user,))
            decks=rows(db,'SELECT * FROM decks WHERE user_id=? ORDER BY created DESC',(user,))
            for deck in decks:
                deck['cards']=json.loads(deck['cards'])
                deck['reviews']=rows(db,'SELECT card,due,interval FROM reviews WHERE user_id=? AND deck_id=?',(user,deck['id']))
            self.send({'user':dict(u),'courses':cs,'items':its,'decks':decks,'analyses':[analysis(c,[i for i in its if i['course_id']==c['id']]) for c in cs],'attempts':rows(db,'SELECT * FROM attempts WHERE user_id=? ORDER BY created DESC LIMIT 50',(user,)),'google':{'configured':bool(os.environ.get('GOOGLE_CLIENT_ID') and os.environ.get('GOOGLE_CLIENT_SECRET')),'connected':bool(db.execute('SELECT 1 FROM google WHERE user_id=?',(user,)).fetchone())}}); return
        if path=='/api/courses' and method=='POST':
            ident=text(d,'id') or uid()
            if d.get('id'):
                course(db,user,ident)
                db.execute('UPDATE courses SET name=?,teacher=?,school=?,color=? WHERE id=?',(text(d,'name',100,True),text(d,'teacher',100),text(d,'school',100),text(d,'color',30),ident))
            else: db.execute('INSERT INTO courses VALUES(?,?,?,?,?,?,NULL)',(ident,user,text(d,'name',100,True),text(d,'teacher',100),text(d,'school',100),text(d,'color',30)))
            self.send({'id':ident}); return
        if path=='/api/items' and method=='POST':
            cid=text(d,'course_id'); course(db,user,cid)
            if d.get('id'):
                old=db.execute('SELECT * FROM items WHERE id=? AND course_id=?',(d['id'],cid)).fetchone(); require(old,'Item not found',404)
                db.execute('UPDATE items SET title=?,kind=?,date=?,due=?,content=?,score=?,total=?,weight=?,done=? WHERE id=?',item_values(d)+(d['id'],)); ident=d['id']
            else: ident=add_item(db,cid,d)
            self.send({'id':ident}); return
        if path=='/api/upload' and method=='POST':
            cid=text(d,'course_id'); course(db,user,cid)
            name=text(d,'name',200,True)
            content=extract_document(name,text(d,'data',2100000,True))
            ident=add_item(db,cid,{'title':name,'kind':text(d,'kind') or 'note','date':today(),'content':content})
            self.send({'id':ident}); return
        if path=='/api/import' and method=='POST':
            cid=text(d,'course_id'); course(db,user,cid)
            batch=d.get('items'); require(isinstance(batch,list) and 0<len(batch)<=500,'Import 1–500 rows at once')
            for item in batch: add_item(db,cid,item)
            self.send({'count':len(batch)}); return
        if path=='/api/generate' and method=='POST':
            cid=text(d,'course_id'); c=course(db,user,cid)
            items=rows(db,'SELECT * FROM items WHERE course_id=? ORDER BY date DESC',(cid,))
            cards=make_cards(items); require(cards,'Add notes with definitions or complete sentences first.')
            ident=uid(); title=text(d,'title',100) or c['name']+' · Study set'
            db.execute('INSERT INTO decks VALUES(?,?,?,?,?,?)',(ident,user,cid,title,json.dumps(cards),today())); self.send({'id':ident}); return
        if path=='/api/decks' and method=='POST':
            cid=text(d,'course_id'); course(db,user,cid); cards=d.get('cards')
            require(isinstance(cards,list) and 1<=len(cards)<=200,'Use 1–200 cards')
            for card in cards:
                require(isinstance(card,dict),'Invalid card'); card['question']=text(card,'question',1000,True); card['answer']=text(card,'answer',2000,True)
            ident=text(d,'id') or uid()
            if d.get('id'):
                require(db.execute('SELECT id FROM decks WHERE id=? AND user_id=?',(ident,user)).fetchone(),'Set not found',404)
                db.execute('UPDATE decks SET title=?,cards=? WHERE id=?',(text(d,'title',100,True),json.dumps(cards),ident)); db.execute('DELETE FROM reviews WHERE deck_id=?',(ident,))
            else: db.execute('INSERT INTO decks VALUES(?,?,?,?,?,?)',(ident,user,cid,text(d,'title',100,True),json.dumps(cards),today()))
            self.send({'id':ident}); return
        if path in ('/api/review','/api/attempt') and method=='POST':
            deck=db.execute('SELECT * FROM decks WHERE id=? AND user_id=?',(d.get('deck_id'),user)).fetchone(); require(deck,'Set not found',404)
            if path.endswith('review'):
                index=int(d['card']); require(0<=index<len(json.loads(deck['cards'])),'Invalid card')
                old=db.execute('SELECT interval FROM reviews WHERE deck_id=? AND card=? AND user_id=?',(deck['id'],index,user)).fetchone()
                interval=min(90,max(1,(old['interval'] if old else 0)*2)) if d.get('known') else 0
                due=(datetime.date.today()+datetime.timedelta(days=interval)).isoformat()
                db.execute('INSERT OR REPLACE INTO reviews VALUES(?,?,?,?,?)',(user,deck['id'],index,due,interval))
            else:
                total=int(d['total']); correct=int(d['correct']); require(0<=correct<=total<=len(json.loads(deck['cards'])) and total>0,'Invalid score')
                db.execute('INSERT INTO attempts VALUES(?,?,?,?,?,?)',(uid(),user,deck['id'],correct,total,today()))
            self.send({'ok':True}); return
        if path=='/api/delete' and method=='POST':
            typ=d.get('type'); ident=d.get('id')
            if typ=='course': course(db,user,ident); db.execute('DELETE FROM courses WHERE id=?',(ident,))
            elif typ=='item': db.execute('DELETE FROM items WHERE id=? AND course_id IN (SELECT id FROM courses WHERE user_id=?)',(ident,user))
            elif typ=='deck': db.execute('DELETE FROM decks WHERE id=? AND user_id=?',(ident,user))
            elif typ=='account':
                me=db.execute('SELECT password,salt FROM users WHERE id=?',(user,)).fetchone()
                require(hmac.compare_digest(password(text(d,'password'),me['salt']),me['password']),'Password is incorrect',403)
                db.execute('DELETE FROM users WHERE id=?',(user,))
            else: raise Problem('Invalid deletion')
            self.send({'ok':True}); return
        if path=='/api/google/start' and method=='POST':
            require(os.environ.get('GOOGLE_CLIENT_ID') and os.environ.get('GOOGLE_CLIENT_SECRET'),'Google is not configured on this server',503)
            import base64
            state=uid(); verifier=secrets.token_urlsafe(48)
            db.execute('INSERT INTO oauth VALUES(?,?,?,?)',(state,user,verifier,time.time()+600))
            challenge=base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b'=').decode()
            self.send({'url':'https://accounts.google.com/o/oauth2/v2/auth?'+urllib.parse.urlencode({'client_id':os.environ['GOOGLE_CLIENT_ID'],'redirect_uri':ORIGIN+'/api/google/callback','response_type':'code','scope':SCOPES,'state':state,'access_type':'offline','prompt':'consent','code_challenge':challenge,'code_challenge_method':'S256'})}); return
        if path=='/api/google/callback' and method=='GET':
            q=urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)
            state=q.get('state',[''])[0]; record=db.execute('SELECT * FROM oauth WHERE state=? AND user_id=? AND expires>?',(state,user,time.time())).fetchone()
            require(record,'Expired Google connection request. Try connecting again.')
            db.execute('DELETE FROM oauth WHERE state=?',(state,)); db.commit()
            require(q.get('code'),'Google connection was cancelled')
            tokens=google_request('https://oauth2.googleapis.com/token',form={'client_id':os.environ['GOOGLE_CLIENT_ID'],'client_secret':os.environ['GOOGLE_CLIENT_SECRET'],'redirect_uri':ORIGIN+'/api/google/callback','code':q['code'][0],'code_verifier':record['verifier'],'grant_type':'authorization_code'})
            tokens['expires_at']=time.time()+tokens['expires_in']; db.execute('INSERT OR REPLACE INTO google VALUES(?,?)',(user,json.dumps(tokens)))
            self.send({'ok':True},302,location='/?google=connected'); return
        if path=='/api/google/disconnect' and method=='POST':
            row=db.execute('SELECT tokens FROM google WHERE user_id=?',(user,)).fetchone()
            if row:
                tokens=json.loads(row['tokens'])
                try: google_request('https://oauth2.googleapis.com/revoke',form={'token':tokens.get('refresh_token') or tokens['access_token']},raw=True)
                except Problem: pass
            db.execute('DELETE FROM google WHERE user_id=?',(user,)); self.send({'ok':True}); return
        if path=='/api/google/sync' and method=='POST':
            token=google_token(db,user); courses=pages('https://classroom.googleapis.com/v1/courses?studentId=me&courseStates=ACTIVE','courses',token); count=0
            cutoff=(datetime.date.today()-datetime.timedelta(days=42)).isoformat()
            for c in courses:
                existing=db.execute('SELECT id FROM courses WHERE user_id=? AND google_id=?',(user,c['id'])).fetchone(); cid=existing['id'] if existing else uid()
                if not existing: db.execute('INSERT INTO courses VALUES(?,?,?,?,?,?,?)',(cid,user,c['name'],'',c.get('room',''),'violet',c['id']))
                base='https://classroom.googleapis.com/v1/courses/'+urllib.parse.quote(c['id'],safe='')+'/courseWork'
                works=pages(base,'courseWork',token)
                submissions=pages(base+'/-/studentSubmissions?userId=me','studentSubmissions',token)
                smap={s['courseWorkId']:s for s in submissions}
                for w in works:
                    date=w.get('creationTime',today())[:10]
                    if date<cutoff: continue
                    due=w.get('dueDate'); due=('%04d-%02d-%02d'%(due['year'],due['month'],due['day'])) if due else ''
                    s=smap.get(w['id'],{})
                    add_item(db,cid,{'title':w['title'],'kind':'homework','date':date,'due':due,'content':w.get('description',''),'score':s.get('assignedGrade') if w.get('maxPoints') else None,'total':w.get('maxPoints') or None,'done':s.get('state') in ('TURNED_IN','RETURNED')},'classroom:'+w['id']); count+=1
            self.send({'count':count}); return
        if path=='/api/google/files' and method=='GET':
            token=google_token(db,user)
            url='https://www.googleapis.com/drive/v3/files?'+urllib.parse.urlencode({'q':"trashed = false and (mimeType = 'application/vnd.google-apps.document' or mimeType = 'text/plain')",'fields':'nextPageToken,files(id,name,mimeType)','pageSize':100})
            self.send({'files':pages(url,'files',token)}); return
        if path=='/api/google/import' and method=='POST':
            cid=text(d,'course_id'); course(db,user,cid); token=google_token(db,user)
            fid=urllib.parse.quote(text(d,'file_id',200,True),safe=''); base='https://www.googleapis.com/drive/v3/files/'+fid
            meta=google_request(base+'?fields=id,name,mimeType',token)
            require(meta['mimeType'] in ('application/vnd.google-apps.document','text/plain'),'Select a Google Doc or text file')
            content=google_request(base+('/export?mimeType=text%2Fplain' if meta['mimeType'].endswith('document') else '?alt=media'),token,raw=True)
            ident=add_item(db,cid,{'title':meta['name'],'kind':'note','date':today(),'content':content},'drive:'+meta['id'])
            self.send({'id':ident}); return
        raise Problem('Not found',404)

if __name__=='__main__':
    init_db()
    print('Study.ai running at '+ORIGIN, flush=True)
    ThreadingHTTPServer((os.environ.get('HOST','127.0.0.1'),int(os.environ.get('PORT',8000))),Handler).serve_forever()
