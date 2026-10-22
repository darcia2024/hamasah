// Chromium handles Arabic shaping and embeds the fonts used by these original modules.
const fs = require('node:fs');
const path = require('node:path');
const H = require('./browser-harness.js');
const course = require('../content/examples/nahwu-dasar.json');
const escape = (s) => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'output/pdf');
const list = (items) => `<ol>${items.map(s => `<li>${escape(s)}</li>`).join('')}</ol>`;
function html(lesson, i) {
  const header = `<header>HAMASAH INTERNATIONAL <span>NAHWU DASAR / ${String(i+1).padStart(2,'0')}</span></header>`;
  const footer = (n) => `<footer>Modul pendamping orisinal · Oktober 2026 <span>${n} / 2</span></footer>`;
  return `<!doctype html><html lang="id"><meta charset="utf-8"><title>${escape(lesson.title)}</title><style>
  @page {size:A4;margin:0} *{box-sizing:border-box} body{margin:0;color:#263a34;font:10.5pt/1.5 Arial,sans-serif} .page{width:210mm;height:297mm;padding:16mm 18mm 20mm;position:relative;break-after:page}.page:last-child{break-after:auto} header{border-bottom:2px solid #bf941a;padding-bottom:9px;margin-bottom:18px;font-size:8pt;font-weight:bold;letter-spacing:.8px} header span,footer span{float:right} .eyebrow{font-size:9pt;color:#80600d;font-weight:bold;margin:0 0 6px} h1{font-size:23pt;line-height:1.13;margin:0 0 10px;max-width:164mm} .lead{font-size:11pt;color:#52665e;margin:0 0 12px} h2{font-size:12pt;margin:14px 0 5px} p{margin:0 0 7px} ol{padding-left:19px;margin:5px 0} li{padding-left:3px;margin:0 0 7px} .targets{padding:10px 13px;background:#f3f4ec;border-left:3px solid #bf941a;margin:12px 0} .targets ol{margin:0} .targets li{margin:0 0 3px} .ar{direction:rtl;text-align:right;font-family:Arial,sans-serif;font-size:19pt;line-height:1.6;background:#f4f5f0;border-radius:6px;padding:4px 12px;margin:6px 0} .answer{background:#f4f5f0;padding:10px 13px;border-radius:6px} .source{font-size:8pt;line-height:1.45;color:#52665e;overflow-wrap:anywhere;margin-top:12px} footer{position:absolute;left:18mm;right:18mm;bottom:11mm;padding-top:7px;border-top:1px solid #d6ddd7;font-size:8pt;color:#66766f} a{color:#52665e} .rule{border-top:1px solid #d6ddd7;margin:13px 0}
  </style><section class="page">${header}<p class="eyebrow">PERTEMUAN ${i+1} / MATERI INTI</p><h1>${escape(lesson.title)}</h1><p class="lead">${escape(lesson.summary)}</p><div class="targets"><b>Setelah belajar, kamu dapat:</b>${list(lesson.objectives)}</div>${lesson.sections.map(s=>`<h2>${escape(s.heading)}</h2>${s.arabic?`<div class="ar" lang="ar">${escape(s.arabic)}</div>`:''}<p>${escape(s.text)}</p>`).join('')}${footer(1)}</section><section class="page">${header}<p class="eyebrow">PERTEMUAN ${i+1} / LATIHAN DAN REFLEKSI</p><h1>Uji pemahamanmu</h1><p class="lead">Kerjakan dahulu tanpa melihat pembahasan. Gunakan catatanmu untuk menjelaskan alasan, bukan hanya menyebutkan jawaban.</p><h2>Latihan mandiri</h2>${list(lesson.practice)}<div class="rule"></div><h2>Pembahasan singkat</h2><div class="answer">${list(lesson.answers)}</div><h2>Ringkasan yang perlu diingat</h2>${list(lesson.keyPoints)}<h2>Sebelum melanjutkan</h2><p>Tulis satu hal yang sudah kamu pahami dan satu pertanyaan yang masih membingungkan. Gunakan asisten belajar pada pertemuan ini untuk memperjelas konsep, lalu periksa kembali dengan materi. Tandai selesai setelah latihan dikerjakan.</p><div class="source"><b>Sumber dan atribusi</b><p>${escape(lesson.credit)}</p><p><a href="${lesson.url}">${lesson.url}</a></p><p>Rujukan konsep: bab pembuka Al-Ajurrumiyyah karya Ibn Ajurrum. Materi ini merupakan pengantar dengan contoh dan latihan baru, bukan transkrip video. ${escape(course.sourceNote)}</p></div>${footer(2)}</section></html>`;
}
(async()=>{
  fs.mkdirSync(out,{recursive:true});
  const browser=await H.launchBrowser(H.findBrowser()); const cdp=await H.connectCdp(browser.wsUrl);
  try {for(const [i,lesson] of course.lessons.entries()){
    const source=html(lesson,i); const tab=await H.openTab(cdp,{width:900,height:1100});
    await tab.send('Page.navigate',{url:'data:text/html;charset=utf-8;base64,'+Buffer.from(source).toString('base64')});await tab.waitIdle();
    await tab.evaluate('document.fonts.ready');
    const result=await tab.send('Page.printToPDF',{printBackground:true,preferCSSPageSize:true});
    const file=path.join(out,`nahwu-dasar-${i+1}.pdf`); fs.writeFileSync(file,Buffer.from(result.data,'base64'));
    console.log(path.relative(root,file));await tab.close();
  }} finally {cdp.close();await browser.stop();}
})().catch(e=>{console.error(e);process.exitCode=1;});
