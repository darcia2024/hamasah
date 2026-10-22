// Local preview only. Creates a clearly labelled demo; never overwrites the lesson recordings.
const fs = require('node:fs');
const path = require('node:path');
const base = 'http://localhost:4273';
let token;
async function api(method, route, body) {
  const response = await fetch(base + route, { method, redirect: 'error', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const result = response.status === 204 ? {} : await response.json();
  if (!response.ok) throw new Error(`${route}: ${result.error || response.status}`); return result;
}
(async () => {
  const bytes = fs.readFileSync(path.resolve(__dirname, '../data/dev-video-demo.webm'));
  token = (await api('POST', '/api/auth/login', { email: 'admin@hamasah.test', password: 'kata-sandi-dev-hamasah' })).accessToken;
  const title = 'Contoh Pemutar Video Privat';
  let course = (await api('GET', '/api/courses')).items.find(item => item.title === title);
  if (!course) course = (await api('POST', '/api/courses', { title, description: 'Coba pemutar video privat dengan contoh visual orisinal 30 detik tentang kalam, tanpa audio. Gunakan kontrol kecepatan, maju/mundur, dan layar penuh. Ini contoh pengujian pemutar, bukan rekaman pertemuan kelas. Video pelajaran asli dapat diunggah pengajar melalui Kelola maddah.' })).course;
  const materialTitle = 'Mengenali kalam: contoh visual 30 detik';
  let material = course.materials.find(item => item.title === materialTitle);
  if (!material) {
    const upload = (await api('POST', '/api/uploads', { purpose: 'course-video', entityId: course.id, fileName: 'contoh-kalam-privat.webm', contentType: 'video/webm', size: bytes.length })).upload;
    const sent = await fetch(base + `/api/uploads/${upload.id}/content`, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'video/webm' }, body: bytes });
    if (!sent.ok) throw new Error('Unggahan video contoh gagal.');
    material = (await api('POST', `/api/courses/${course.id}/materials`, { type: 'video', title: materialTitle, summary: 'Contoh visual tanpa audio: bedakan kalam yang lengkap dan frasa yang masih menggantung.', content: JSON.stringify({ videoFileId: upload.id, videoFileName: 'contoh-kalam-privat.webm', teks: "# Kapan sebuah ungkapan disebut kalam?\n\nPernah mendengar seseorang berkata, “di dalam kelas”, lalu menunggu kelanjutan ceritanya? Kita tahu tempatnya, tetapi belum tahu siapa yang ada di sana. Dalam nahwu, perbedaan kecil ini membantu kita mengenali **kalam**: ucapan yang menyampaikan makna lengkap.\n\n## Dari frasa menjadi kalimat\n\nBandingkan dua ungkapan berikut. Bacalah perlahan, lalu perhatikan informasi yang kamu dapatkan.\n\nفِي الْفَصْلِ\n\n**Di dalam kelas.** Ungkapan ini menunjukkan tempat. Namun, siapa atau apa yang berada di sana belum disebutkan. Maknanya masih menunggu pelengkap.\n\nالطَّالِبُ فِي الْفَصْلِ\n\n**Santri itu berada di dalam kelas.** Sekarang ada sesuatu yang dibicarakan dan informasi tentangnya. Pendengar dapat menangkap satu pernyataan yang utuh.\n\n> Kuncinya: apakah pendengar sudah mendapatkan informasi yang lengkap, atau masih menunggu kelanjutan ucapan?\n\n## Perhatikan saat menonton\n\nVideo singkat di atas menampilkan contoh kalam, frasa yang belum lengkap, lalu ungkapan yang sudah dilengkapi. Jeda pada setiap contoh dan coba jelaskan perbedaannya dengan bahasamu sendiri.\n\n### Coba sendiri\n\n- Ucapkan satu frasa yang menunjukkan tempat.\n- Tambahkan siapa atau apa yang berada di tempat itu.\n- Bandingkan makna sebelum dan sesudah kamu melengkapinya.\n\n### Tentang video ini\n\nVideo ini merupakan contoh visual orisinal tanpa audio untuk mencoba pemutar privat. Rekaman pertemuan lengkap akan disediakan oleh pengajar." }), keyPoints: ['Kalam memberi makna lengkap.', 'Akses video memerlukan akun dan keikutsertaan kelas.'], studyGuide: [] })).material;
  }
  // Refresh the companion article without changing the uploaded recording.
  const savedContent = JSON.parse(material.content);
  savedContent.teks = "# Kapan sebuah ungkapan disebut kalam?\n\nPernah mendengar seseorang berkata, “di dalam kelas”, lalu menunggu kelanjutan ceritanya? Kita tahu tempatnya, tetapi belum tahu siapa yang ada di sana. Dalam nahwu, perbedaan kecil ini membantu kita mengenali **kalam**: ucapan yang menyampaikan makna lengkap.\n\n## Dari frasa menjadi kalimat\n\nBandingkan dua ungkapan berikut. Bacalah perlahan, lalu perhatikan informasi yang kamu dapatkan.\n\nفِي الْفَصْلِ\n\n**Di dalam kelas.** Ungkapan ini menunjukkan tempat. Namun, siapa atau apa yang berada di sana belum disebutkan. Maknanya masih menunggu pelengkap.\n\nالطَّالِبُ فِي الْفَصْلِ\n\n**Santri itu berada di dalam kelas.** Sekarang ada sesuatu yang dibicarakan dan informasi tentangnya. Pendengar dapat menangkap satu pernyataan yang utuh.\n\n> Kuncinya: apakah pendengar sudah mendapatkan informasi yang lengkap, atau masih menunggu kelanjutan ucapan?\n\n## Perhatikan saat menonton\n\nVideo singkat di atas menampilkan contoh kalam, frasa yang belum lengkap, lalu ungkapan yang sudah dilengkapi. Jeda pada setiap contoh dan coba jelaskan perbedaannya dengan bahasamu sendiri.\n\n### Coba sendiri\n\n- Ucapkan satu frasa yang menunjukkan tempat.\n- Tambahkan siapa atau apa yang berada di tempat itu.\n- Bandingkan makna sebelum dan sesudah kamu melengkapinya.\n\n### Tentang video ini\n\nVideo ini merupakan contoh visual orisinal tanpa audio untuk mencoba pemutar privat. Rekaman pertemuan lengkap akan disediakan oleh pengajar.";
  await api('PATCH', `/api/courses/${course.id}/materials/${material.id}`, { type: material.type, title: material.title, summary: material.summary, content: JSON.stringify(savedContent), keyPoints: material.keyPoints, studyGuide: material.studyGuide });
  const admin = token;
  token = (await api('POST', '/api/auth/login', { email: 'santri@hamasah.test', password: 'kata-sandi-dev-hamasah' })).accessToken;
  const students = (await api('GET', '/api/my-students')).items; token = admin;
  for (const student of students) await api('POST', `/api/students/${student.id}/courses/${course.id}`);
  console.log(JSON.stringify({ courseId: course.id, materialId: material.id, url: `${base}/lms#maddah=${course.id}&materi=${material.id}` }));
})().catch(error => { console.error(error.message); process.exitCode = 1; });

