const assert = require('node:assert/strict');
const { test } = require('node:test');
const { blocks } = require('../website/lms-rich-text.js');
test('reading preserves heading levels, grouped lists, Arabic, and literal unsafe HTML', () => {
  const parsed = blocks('# Tujuan\n\n- Satu\n- Dua\n\n## Pembahasan\n\n### Contoh\n\nالطَّالِبُ حَاضِرٌ\n\n1. Jawab\n2. Jelaskan\n\n<script>alert(1)</script>');
  assert.deepEqual(parsed.filter(b=>b.type==='heading').map(b=>b.level), [1,2,3]);
  assert.deepEqual(parsed.find(b=>b.type==='ul').items, ['Satu','Dua']);
  assert.equal(parsed.find(b=>b.arabic).text, 'الطَّالِبُ حَاضِرٌ');
  assert.equal(parsed.at(-1).type, 'p');
  assert.equal(parsed.at(-1).text, '<script>alert(1)</script>');
  assert.equal(parsed.find(b=>b.type==='ol').items.length,2);
});
test('legacy text and unsupported headings remain readable', () => {
  assert.deepEqual(blocks('Catatan lama\nbaris kedua\n\nParagraf baru').map(b=>b.text), ['Catatan lama\nbaris kedua','Paragraf baru']);
  assert.equal(blocks('#### Judul lama')[0].text, '#### Judul lama');
});
