import unittest, tempfile, os, json, threading, urllib.request, urllib.error, http.cookiejar, datetime
import server

class AppTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp=tempfile.TemporaryDirectory(); server.DB=os.path.join(cls.tmp.name,'test.db'); server.init_db()
        cls.http=server.ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
        cls.base='http://127.0.0.1:'+str(cls.http.server_port); server.ORIGIN=cls.base
        threading.Thread(target=cls.http.serve_forever,daemon=True).start()
    @classmethod
    def tearDownClass(cls): cls.http.shutdown(); cls.http.server_close(); cls.tmp.cleanup()
    def client(self): return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    def request(self,client,path,data=None,origin=True):
        headers={'Content-Type':'application/json'}
        if origin: headers['Origin']=self.base
        req=urllib.request.Request(self.base+'/api/'+path,headers=headers,data=json.dumps(data).encode() if data is not None else None)
        try:
            with client.open(req) as r: return r.status,json.load(r)
        except urllib.error.HTTPError as e: return e.code,json.load(e)
    def user(self):
        c=self.client(); status,_=self.request(c,'register',{'name':'Student','email':server.uid()+'@test.edu','password':'long test password'})
        self.assertEqual(status,200);return c
    def test_end_to_end(self):
        c=self.user(); _,r=self.request(c,'courses',{'name':'Biology','teacher':'Ms Chen','school':'Test School'}); cid=r['id']
        for day,kind,score in [('2026-09-01','test',70),('2026-09-08','quiz',80),('2026-09-15','test',90),('2026-09-22','quiz',100)]:
            self.assertEqual(self.request(c,'items',{'course_id':cid,'title':kind+day,'kind':kind,'date':day,'content':'Mitosis: Division that produces two identical daughter cells.\nOsmosis: Water moves across a semipermeable membrane.','score':score,'total':100})[0],200)
        _,s=self.request(c,'state'); a=s['analyses'][0]; self.assertEqual(a['grade'],85);self.assertEqual(a['prediction']['date'],'2026-09-29'); self.assertEqual(a['trend'],20)
        _,r=self.request(c,'generate',{'course_id':cid}); did=r['id']; _,s=self.request(c,'state');self.assertEqual(len(s['decks'][0]['cards']),2)
        self.assertEqual(self.request(c,'review',{'deck_id':did,'card':0,'known':True})[0],200)
        self.assertEqual(self.request(c,'attempt',{'deck_id':did,'correct':1,'total':2})[0],200)
        _,s=self.request(c,'state'); self.assertEqual(s['attempts'][0]['correct'],1); self.assertEqual(s['decks'][0]['reviews'][0]['interval'],1)
        self.assertEqual(self.request(c,'delete',{'type':'course','id':cid})[0],200)
        _,s=self.request(c,'state');self.assertEqual(s['items'],[]);self.assertEqual(s['decks'],[]);self.assertEqual(s['attempts'],[])
    def test_security_isolation_and_validation(self):
        c=self.user(); other=self.user(); _,r=self.request(c,'courses',{'name':'Private'}); cid=r['id']
        self.assertEqual(self.request(other,'items',{'course_id':cid,'title':'attack','kind':'note'})[0],404)
        self.assertEqual(self.request(other,'delete',{'type':'course','id':cid})[0],404)
        self.assertEqual(self.request(c,'courses',{'name':'CSRF'},False)[0],403)
        self.assertEqual(self.request(self.client(),'state')[0],401)
        self.assertEqual(self.request(c,'items',{'course_id':cid,'title':'bad','kind':'test','score':3})[0],400)
        self.assertEqual(self.request(c,'items',{'course_id':cid,'title':'bad','kind':'note','date':'bad'})[0],400)
        self.assertEqual(self.request(c,'items',{'course_id':cid,'title':'bad','kind':'invalid'})[0],400)
    def test_atomic_import_and_delete_account(self):
        c=self.user();_,r=self.request(c,'courses',{'name':'History'});cid=r['id']
        status,_=self.request(c,'import',{'course_id':cid,'items':[{'title':'Good','kind':'note'},{'title':'Bad','kind':'unknown'}]});self.assertEqual(status,400)
        _,s=self.request(c,'state');self.assertEqual(s['items'],[])
        self.assertEqual(self.request(c,'delete',{'type':'account','password':'wrong'})[0],403)
        self.assertEqual(self.request(c,'delete',{'type':'account','password':'long test password'})[0],200)
        self.assertEqual(self.request(c,'state')[0],401)
    def test_login_logout(self):
        c=self.client(); email=server.uid()+'@test.edu'
        self.request(c,'register',{'name':'Person','email':email,'password':'long test password'})
        self.request(c,'logout',{});self.assertEqual(self.request(c,'state')[0],401)
        self.assertEqual(self.request(c,'login',{'email':email,'password':'wrong'})[0],401)
        self.assertEqual(self.request(c,'login',{'email':email,'password':'long test password'})[0],200)
    def test_forecasts_require_evidence(self):
        a=server.analysis({'name':'Empty'},[]);self.assertIsNone(a['grade']);self.assertIsNone(a['prediction'])
    def test_duplicate_google_import_updates(self):
        c=self.user();_,r=self.request(c,'courses',{'name':'Class'});cid=r['id']
        with server.connect() as db:
            first=server.add_item(db,cid,{'title':'One','kind':'homework'},'classroom:1')
            second=server.add_item(db,cid,{'title':'Updated','kind':'homework'},'classroom:1')
        self.assertEqual(first,second)
        _,s=self.request(c,'state');self.assertEqual(len(s['items']),1);self.assertEqual(s['items'][0]['title'],'Updated')

    def test_document_upload_and_ownership(self):
        import base64,io,zipfile
        buf=io.BytesIO()
        with zipfile.ZipFile(buf,'w') as z:
            z.writestr('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Gravity: A force of attraction between masses.</w:t></w:r></w:p></w:body></w:document>')
        c=self.user(); _,r=self.request(c,'courses',{'name':'Physics'}); cid=r['id']
        data={'course_id':cid,'name':'notes.docx','data':base64.b64encode(buf.getvalue()).decode()}
        self.assertEqual(self.request(c,'upload',data)[0],200)
        self.assertEqual(self.request(self.user(),'upload',data)[0],404)
        _,s=self.request(c,'state');self.assertIn('Gravity:',s['items'][0]['content'])
        self.assertEqual(self.request(c,'upload',{**data,'data':'broken'})[0],400)
    def test_pdf_text_and_scan_handling(self):
        import base64,io
        from pypdf import PdfWriter
        from pypdf.generic import DictionaryObject,NameObject,DecodedStreamObject
        writer=PdfWriter();page=writer.add_blank_page(600,800)
        font=DictionaryObject({NameObject('/Type'):NameObject('/Font'),NameObject('/Subtype'):NameObject('/Type1'),NameObject('/BaseFont'):NameObject('/Helvetica')})
        page[NameObject('/Resources')]=DictionaryObject({NameObject('/Font'):DictionaryObject({NameObject('/F1'):font})})
        stream=DecodedStreamObject();stream.set_data(b'BT /F1 12 Tf 30 750 Td (Mitosis: Division into identical cells.) Tj ET');page[NameObject('/Contents')]=writer._add_object(stream)
        buf=io.BytesIO();writer.write(buf)
        result=server.extract_document('test.pdf',base64.b64encode(buf.getvalue()).decode());self.assertIn('Mitosis:',result)
        blank=PdfWriter();blank.add_blank_page(100,100);buf=io.BytesIO();blank.write(buf)
        with self.assertRaises(server.Problem):server.extract_document('scan.pdf',base64.b64encode(buf.getvalue()).decode())
    def test_invalid_card_index_and_nonfinite_grades(self):
        c=self.user();_,r=self.request(c,'courses',{'name':'Class'});cid=r['id']
        self.assertEqual(self.request(c,'items',{'course_id':cid,'title':'Invalid','kind':'test','score':'nan','total':10})[0],400)
        _,r=self.request(c,'decks',{'course_id':cid,'title':'Set','cards':[{'question':'One','answer':'Two'}]});did=r['id']
        self.assertEqual(self.request(c,'review',{'deck_id':did,'card':-1,'known':True})[0],400)
        self.assertEqual(self.request(c,'attempt',{'deck_id':did,'correct':2,'total':1})[0],400)
    def test_google_sync_pagination_and_refresh(self):
        from unittest.mock import patch
        c=self.user();_,s=self.request(c,'state');user=s['user']['id']
        with server.connect() as db: db.execute('INSERT INTO google VALUES(?,?)',(user,json.dumps({'access_token':'fixture','expires_at':9999999999})))
        def fake(url,token=None,form=None,raw=False):
            if '/v1/courses?' in url:return {'courses':[{'id':'course1','name':'Imported course'}]}
            if 'studentSubmissions' in url:return {'studentSubmissions':[{'courseWorkId':'work1','assignedGrade':9,'state':'RETURNED'}]}
            return {'courseWork':[{'id':'work1','title':'Imported homework','creationTime':server.today()+'T00:00:00Z','description':'Matter: Anything that occupies space and has mass.','maxPoints':10}]}
        with patch.object(server,'google_request',fake):
            self.assertEqual(self.request(c,'google/sync',{})[0],200)
            self.assertEqual(self.request(c,'google/sync',{})[0],200)
        _,s=self.request(c,'state');self.assertEqual(len(s['items']),1);self.assertEqual(s['items'][0]['score'],9)
        calls=[]
        def paginated(url,token=None):
            calls.append(url)
            return {'files':[{'id':str(len(calls))}],**({'nextPageToken':'next'} if len(calls)==1 else {})}
        with patch.object(server,'google_request',paginated):self.assertEqual(len(server.pages('https://www.googleapis.com/drive/v3/files?x=1','files','token')),2)

if __name__=='__main__':unittest.main()
