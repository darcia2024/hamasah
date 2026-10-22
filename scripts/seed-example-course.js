// Explicit localhost-only importer; never connects directly to a database or production.
const fs = require('node:fs');
const path = require('node:path');
const spec = require('../content/examples/nahwu-dasar.json');
const base = new URL(process.env.LMS_EXAMPLE_URL || 'http://localhost:4273');
if (!['localhost','127.0.0.1','[::1]'].includes(base.hostname) || !['http:','https:'].includes(base.protocol)) throw new Error('Importer hanya boleh digunakan di localhost.');
let token;
async function api(method, route, body) {
  const response = await fetch(new URL(route,base),{method,redirect:'error',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
  if(response.status===204)return {};
  const raw=await response.text();let data;try{data=JSON.parse(raw);}catch{throw new Error(`${method} ${route}: ${response.status}, respons bukan JSON (${raw.length} karakter)`);}if(!response.ok)throw new Error(`${method} ${route}: ${response.status} ${JSON.stringify(data)}`);return data;
}
(async()=>{
  // Check generated artifacts before any writes.
  const files=spec.lessons.map((_,i)=>fs.readFileSync(path.resolve(__dirname,`../output/pdf/nahwu-dasar-${i+1}.pdf`)));
  token=(await api('POST','/api/auth/login',{email:process.env.LMS_EXAMPLE_EMAIL||'admin@hamasah.test',password:process.env.LMS_EXAMPLE_PASSWORD||'kata-sandi-dev-hamasah'})).accessToken;
  if(!token)throw new Error('Login tidak menghasilkan token.');
  const existing=(await api('GET','/api/courses')).items||[];
  let course=existing.find(c=>c.title===spec.title);
  if(!course)course=(await api('POST','/api/courses',{title:spec.title,description:spec.description})).course;
  else await api('PATCH',`/api/courses/${course.id}`,{title:spec.title,description:spec.description});
  const saved=[];
  const cachePath=path.resolve(__dirname,'../data/example-course-uploads.json');
  let cache={};try{cache=JSON.parse(fs.readFileSync(cachePath,'utf8'));}catch{}
  async function upsert(material) {
    const old=(course.materials||[]).find(m=>m.title===material.title&&!m.archivedAt);
    const result=await api(old?'PATCH':'POST',`/api/courses/${course.id}/materials${old?'/'+old.id:''}`,material);
    saved.push(result.material||result);return result;
  }
  for(const [i,lesson] of spec.lessons.entries()){
    const old=(course.materials||[]).find(m=>m.title===lesson.title&&!m.archivedAt);
    let media={};try{media=JSON.parse(old?.content||'{}');}catch{}
    if(!media.fileId&&cache[course.id]?.[i])media=cache[course.id][i];
    if(!media.fileId){
      const bytes=files[i],fileName=`Nahwu-Dasar-Pertemuan-${i+1}.pdf`;
      const {upload}=await api('POST','/api/uploads',{purpose:'course-file',entityId:course.id,fileName,contentType:'application/pdf',size:bytes.length});
      const result=await fetch(new URL(`/api/uploads/${upload.id}/content`,base),{method:'PUT',redirect:'error',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/pdf'},body:bytes});
      if(!result.ok)throw new Error(`Unggah modul ${i+1}: ${result.status}`);
      media={fileId:upload.id,fileName};
      cache[course.id]||={};cache[course.id][i]=media;fs.writeFileSync(cachePath,JSON.stringify(cache,null,2));
    }
    const teks=['# Tujuan belajar',lesson.objectives.map(s=>`- ${s}`).join('\n'), '# Pembahasan', ...lesson.sections.flatMap(s=>[`## ${s.heading}`,s.arabic||'',s.text]),'# Latihan mandiri',lesson.practice.map((s,i)=>`${i+1}. ${s}`).join('\n'),'Buka modul PDF untuk pembahasan latihan.','### Sumber video',lesson.credit,lesson.url].filter(Boolean).join('\n\n');
    if(teks.length>4000)throw new Error('Bacaan melebihi kapasitas materi.');
    const videoSource=media.videoFileId?{videoFileId:media.videoFileId,videoFileName:media.videoFileName}:{url:lesson.url};
    await upsert({type:'video',title:lesson.title,summary:lesson.summary,content:JSON.stringify({...videoSource,teks,fileId:media.fileId,fileName:media.fileName}),keyPoints:lesson.keyPoints,studyGuide:lesson.studyGuide});
  }
  await upsert({type:'quiz',title:spec.quiz.title,summary:spec.quiz.summary,content:JSON.stringify({questions:spec.quiz.questions}),keyPoints:['Kerjakan setelah tiga pertemuan selesai.'],studyGuide:[]});
  await upsert({type:'assignment',title:spec.assignment.title,summary:spec.assignment.summary,content:spec.assignment.content,keyPoints:['Jenis kata 40 poin; bukti 30; arti dan kelengkapan 20; contoh mandiri 10.'],studyGuide:[]});
  const studentLogin=await api('POST','/api/auth/login',{email:'santri@hamasah.test',password:process.env.LMS_EXAMPLE_STUDENT_PASSWORD||'kata-sandi-dev-hamasah'});
  const adminToken=token;token=studentLogin.accessToken;
  const students=(await api('GET','/api/my-students')).items||[];token=adminToken;
  if(!students.length)throw new Error('Akun santri lokal belum memiliki profil.');
  for(const student of students)await api('POST',`/api/students/${student.id}/courses/${course.id}`);
  // Also include the existing demo student account when present, without changing its password.
  const accounts=(await api('GET','/api/accounts')).items||[];
  const demo=accounts.find(a=>a.email==='santri@demo.hamasah.test'&&a.role==='student');
  let demoEnrolled=0;
  if(demo){
    const visible=(await api('GET','/api/my-students?limit=100')).items||[];
    for(const student of visible){
      const detail=(await api('GET',`/api/students/${student.id}/dashboard`)).dashboard;
      if(detail?.student?.studentAccountId===demo.id){await api('POST',`/api/students/${student.id}/courses/${course.id}`);demoEnrolled++;}
    }
  }
  const persisted=(await api('GET','/api/courses')).items.find(c=>c.id===course.id);
  const attachmentsReady=persisted.materials.filter(m=>m.type==='video').every(m=>{try{return !!JSON.parse(m.content).fileId;}catch{return false;}});
  if(!attachmentsReady)throw new Error('Kelas tersimpan, tetapi server lama membuang lampiran video. Restart npm run dev lalu jalankan importer ini kembali.');
  console.log(JSON.stringify({courseId:course.id,title:spec.title,materials:saved.length,modules:3,enrolledStudents:students.length,demoEnrolled,url:new URL('/lms',base).href}));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
