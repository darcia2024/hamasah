const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID: uuid } = require('node:crypto');
const { createTestDatabase } = require('./test-support/database.js');
const { createStudentLifeService } = require('./student-life-service.js');
const { createDormitoryRollService } = require('./dormitory-roll-service.js');

test('student life integrity: atomic approval, compatible sessions, scoped pagination and latest health', async () => {
  const db = await createTestDatabase(); // pglite:memory; no env file or existing application data
  const actor = { role: 'admin' }, dorm = uuid(), otherDorm = uuid(), student = uuid(), outsider = uuid();
  const now = () => new Date('2026-10-23T05:00:00Z');
  const deps = { database: db, accessFor: async () => ({ exists: true, write: true }), getStudent: async () => ({}), staffDormitories: async () => [dorm], recordAttendance: async () => { throw Error('must use transaction'); }, now };
  try {
    for (const id of [dorm, otherDorm]) await db.query("INSERT INTO dormitories(id,name,area,gender,capacity) VALUES($1,$2,'Dummy','putra',10)",[id,'Dummy '+id]);
    for (const [id,d] of [[student,dorm],[outsider,otherDorm]]) await db.query("INSERT INTO students(id,name,program,city,join_date,dormitory_id) VALUES($1,'Dummy student','Dummy','Dummy','2026-01-01',$2)",[id,d]);
    const life = createStudentLifeService(deps);
    async function leave() {
      const id=uuid();
      await db.query("INSERT INTO student_leave_requests(id,student_id,kind,starts_at,ends_at,reason,status) VALUES($1,$2,'sakit','2026-10-23T01:00Z','2026-10-23T03:00Z','Dummy reason','menunggu')",[id,student]);
      return id;
    }
    const id=await leave();
    const failing = createStudentLifeService({...deps,database:{query:db.query,withTransaction:work=>db.withTransaction(tx=>work({query:(sql,args)=>{
      if(sql.startsWith('UPDATE student_leave_requests SET status=')) throw Error('injected write failure');
      return tx.query(sql,args);
    }}))}});
    await assert.rejects(failing.decideLeave(id,{decision:'disetujui'},actor),/injected/);
    assert.equal((await db.query('SELECT status FROM student_leave_requests WHERE id=$1',[id])).rows[0].status,'menunggu');
    assert.equal((await db.query('SELECT count(*)::int AS n FROM student_attendance')).rows[0].n,0);
    assert.equal((await life.decideLeave(id,{decision:'disetujui'},actor)).ok,true);
    const compatible=await leave();
    assert.equal((await life.decideLeave(compatible,{decision:'disetujui'},actor)).ok,true);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM student_attendance')).rows[0].n,1);
    const conflict=await leave();
    await db.query("UPDATE student_attendance SET status='present'");
    assert.equal((await life.decideLeave(conflict,{decision:'disetujui'},actor)).status,409);
    assert.equal((await db.query('SELECT status FROM student_leave_requests WHERE id=$1',[conflict])).rows[0].status,'menunggu');
    await db.query("UPDATE student_attendance SET status='excused',note='Different reason'");
    assert.equal((await life.decideLeave(conflict,{decision:'disetujui'},actor)).status,409);
    assert.equal((await life.decideLeave(id,{decision:'disetujui'},actor)).status,409);

    for(let i=0;i<208;i++) await db.query(`INSERT INTO student_follow_ups(id,student_id,title,target,due_on,status)
      VALUES($1,$2,'Dummy follow up','Dummy target','2026-10-23',$3)`,[uuid(),i===207?outsider:student,i<205?'selesai':'perlu']);
    const supervisor={role:'supervisor',id:uuid()};
    const first=(await life.followUps(supervisor,{status:'aktif',limit:1})).value;
    const second=(await life.followUps(supervisor,{status:'aktif',limit:1,page:2})).value;
    assert.equal(first.total,2);assert.equal(first.pages,2);assert.equal(first.items.length,1);
    assert.notEqual(first.items[0].id,second.items[0].id);
    assert.equal((await life.followUps(supervisor,{status:'selesai',limit:200})).value.total,205);
    assert.equal((await life.followUps(actor,{status:'aktif'})).value.total,3);
    assert.equal((await life.followUps(supervisor,{status:'invalid'})).ok,false);
    assert.equal((await life.followUps(supervisor,{status:'aktif',limit:1,page:999})).value.page,2);

    const roll=createDormitoryRollService({...deps,recordPrayers:async()=>({ok:true}),healthEnabled:async()=>true});
    async function health(sid,condition,date,created,id=uuid()) {await db.query('INSERT INTO student_health_logs(id,student_id,condition,occurred_on,created_at) VALUES($1,$2,$3,$4,$5)',[id,sid,condition,date,created]);}
    await health(student,'dirujuk','2026-10-21','2026-10-21T01:00Z');
    await health(student,'sehat','2026-10-22','2026-10-22T01:00Z');
    assert.deepEqual((await roll.todaySummary(supervisor)).value.kesehatan,[]);
    await health(student,'sakit-ringan','2026-10-23','2026-10-23T01:00Z','00000000-0000-4000-8000-000000000001');
    await health(student,'sehat','2026-10-23','2026-10-23T01:00Z','00000000-0000-4000-8000-000000000002');
    assert.deepEqual((await roll.todaySummary(supervisor)).value.kesehatan,[]);
    await health(student,'perlu-perhatian','2026-10-23','2026-10-23T02:00Z');
    await health(student,'sehat','2026-10-24','2026-10-24T01:00Z');
    await health(outsider,'dirujuk','2026-10-23','2026-10-23T02:00Z');
    const summary=(await roll.todaySummary(supervisor)).value.kesehatan;
    assert.equal(summary.length,1);assert.equal(summary[0].studentId,student);assert.equal(summary[0].condition,'perlu-perhatian');
  } finally { await db.close(); }
});

test('follow-up client sends filters, pages, resets on filter change and ignores stale replies', async () => {
  const fs=require('node:fs'),vm=require('node:vm');
  const source=fs.readFileSync(require.resolve('../website/monitoring.js'),'utf8');
  const nodes={};
  function element(){return {children:[],append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;},addEventListener(type,fn){this[type]=fn;}};}
  for(const id of ['#followup-status','#followup-list','#followup-filter']) nodes[id]=element();
  nodes['#followup-filter'].value='selesai';
  const requests=[];
  const context=vm.createContext({document:{querySelector:id=>nodes[id],createElement:element,createTextNode:text=>text},
    statusPanel(){},tombolKecil:(label,click)=>({label,click}),
    kirimJson:url=>new Promise(resolve=>requests.push({url,resolve})),Intl,Date});
  const start=source.indexOf('let followUpPage = 1;'),end=source.indexOf('async function muatKepulangan',start);
  vm.runInContext(source.slice(start,end)+"\ndocument.querySelector('#followup-filter').addEventListener('change',()=>{followUpPage=1;muatTindakLanjut();});",context);
  const first=vm.runInContext('muatTindakLanjut()',context);
  assert.match(requests[0].url,/status=selesai&page=1&limit=50/);
  requests[0].resolve({tersedia:true,items:[],page:1,pages:2,total:51});await first;
  let nav=nodes['#followup-list'].children[0];
  assert.equal(nav.children[0].disabled,true);assert.equal(nav.children[2].disabled,false);
  nav.children[2].click();
  assert.match(requests[1].url,/page=2/);
  nodes['#followup-filter'].value='aktif';nodes['#followup-filter'].change();
  assert.match(requests[2].url,/status=aktif&page=1/);
  requests[2].resolve({tersedia:true,items:[],page:1,pages:1,total:0});
  await new Promise(resolve=>setImmediate(resolve));
  requests[1].resolve({tersedia:true,items:[],page:2,pages:2,total:51});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(nodes['#followup-list'].children.length,0,'stale page response must not replace current filter');
});
