// Original silent teaching sample for local preview, generated without third-party media.
const fs = require('node:fs');
const path = require('node:path');
const H = require('./browser-harness.js');
(async () => {
  const browser = await H.launchBrowser(H.findBrowser()), cdp = await H.connectCdp(browser.wsUrl);
  try {
    const tab = await H.openTab(cdp, { width: 960, height: 540 });
    const bytes = await tab.evaluate(`(async () => {
      const canvas = document.createElement('canvas'); canvas.width = 960; canvas.height = 540;
      document.body.append(canvas);
      const ctx = canvas.getContext('2d'), stream = canvas.captureStream(12), chunks = [];
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      const complete = new Promise(resolve => { recorder.onstop = resolve; });
      const scenes = [
        ['Apa itu kalam?', 'الطَّالِبُ حَاضِرٌ', 'Santri itu hadir.', 'Kalam memberi informasi yang dapat dipahami secara lengkap.'],
        ['Frasa yang masih menggantung', 'فِي الْفَصْلِ', 'Di dalam kelas.', 'Tanpa konteks, kita belum tahu siapa atau apa yang berada di sana.'],
        ['Lengkapi informasinya', 'الطَّالِبُ فِي الْفَصْلِ', 'Santri itu berada di dalam kelas.', 'Sekarang ada pokok pembicaraan dan informasi tentangnya.']
      ];
      const start = performance.now();
      function draw() {
        const seconds = (performance.now() - start) / 1000, index = Math.min(2, Math.floor(seconds / 10));
        const [title, arabic, meaning, note] = scenes[index];
        ctx.fillStyle = '#173e38'; ctx.fillRect(0, 0, 960, 540);
        ctx.fillStyle = '#e7b10c'; ctx.font = 'bold 19px Arial'; ctx.fillText('HAMASAH · CONTOH VIDEO PRIVAT', 48, 57);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 36px Arial'; ctx.fillText(title, 48, 135);
        ctx.font = '48px Arial'; ctx.direction = 'rtl'; ctx.textAlign = 'right'; ctx.fillText(arabic, 912, 260);
        ctx.direction = 'ltr'; ctx.textAlign = 'left'; ctx.font = '27px Arial'; ctx.fillText(meaning, 48, 334);
        ctx.font = '19px Arial'; ctx.fillText(note, 48, 397);
        ctx.fillStyle = '#b9ccc4'; ctx.font = '16px Arial'; ctx.fillText('CONTOH VISUAL TANPA AUDIO  ·  ' + (index + 1) + '/3', 48, 464);
        ctx.fillStyle = '#e7b10c'; ctx.fillRect(48, 493, 864 * Math.min(1, seconds / 30), 4);
      }
      draw(); recorder.start(); const timer = setInterval(draw, 83);
      await new Promise(resolve => setTimeout(resolve, 30000));
      clearInterval(timer); recorder.stop(); await complete; stream.getTracks().forEach(track => track.stop());
      return new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.readAsDataURL(new Blob(chunks, { type: 'video/webm' })); });
    })()`);
    const target = path.resolve(__dirname, '../data/dev-video-demo.webm');
    fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, Buffer.from(bytes, 'base64'));
    console.log('Contoh video orisinal 30 detik dibuat di data/dev-video-demo.webm.');
    await tab.close();
  } finally { cdp.close(); await browser.stop(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
