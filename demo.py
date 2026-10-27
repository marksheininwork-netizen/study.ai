"""Create explicitly synthetic sample data for a local preview (never real student data)."""
import secrets, datetime
import server

def create_demo():
    server.init_db(); email='demo-'+secrets.token_hex(3)+'@example.test'; pwd=secrets.token_urlsafe(18)
    with server.connect() as db:
        user=server.uid(); salt=secrets.token_hex(16)
        db.execute('INSERT INTO users VALUES(?,?,?,?,?)',(user,email,'Alex (sample student)',server.password(pwd,salt),salt))
        for name,teacher,school,definitions in [
            ('AP Biology','Ms. Chen','Sample High School',['Mitosis: Cell division that produces two genetically identical daughter cells.','Osmosis: Movement of water across a selectively permeable membrane.','Photosynthesis: Plants convert light energy into chemical energy.','Chloroplasts: Organelles where photosynthesis occurs.']),
            ('World History','Mr. Rivera','Sample High School',['Industrialization: The shift from hand production to machine manufacturing.','Urbanization: Growth of cities as populations move from rural areas.','Imperialism: A policy of extending power over other countries.']),
            ('Algebra II','Dr. Patel','Sample High School',['Quadratic: A polynomial expression with a highest degree of two.','Discriminant: The expression b squared minus four a c.','Vertex: The turning point of a parabola.'])]:
            cid=server.uid();db.execute('INSERT INTO courses VALUES(?,?,?,?,?,?,NULL)',(cid,user,name,teacher,school,'violet'))
            for week in range(6):
                day=(datetime.date.today()-datetime.timedelta(days=39-week*7)).isoformat()
                server.add_item(db,cid,{'title':f'Week {week+1} class notes','kind':'note','date':day,'content':'\n'.join(definitions)})
                server.add_item(db,cid,{'title':f'Week {week+1} knowledge check','kind':'quiz','date':day,'score':7+week%4,'total':10,'content':definitions[week%len(definitions)],'done':True})
            server.add_item(db,cid,{'title':'Practice and reflection','kind':'homework','date':server.today(),'due':(datetime.date.today()+datetime.timedelta(days=2)).isoformat(),'content':'Review this week’s concepts and write a short explanation of each.'})
            cards=server.make_cards(server.rows(db,'SELECT * FROM items WHERE course_id=?',(cid,)))
            db.execute('INSERT INTO decks VALUES(?,?,?,?,?,?)',(server.uid(),user,cid,name+' · Key concepts',server.json.dumps(cards),server.today()))
    return email,pwd
if __name__=='__main__':
    email,pwd=create_demo();print('Synthetic preview account\nEmail: '+email+'\nPassword: '+pwd)
