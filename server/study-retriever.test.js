'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { findAnswer, stem, normalize } = require('./study-retriever.js');

const mubtadaKhabar = {
  id: 'm1',
  type: 'text',
  title: 'Mubtada dan Khabar',
  summary: 'Jumlah ismiyyah tersusun dari mubtada dan khabar. Keduanya dibaca rafa.',
  keyPoints: ['Mubtada adalah pokok kalimat.', 'Khabar menyempurnakan makna mubtada.'],
  studyGuide: [{ question: 'Apa fungsi khabar?', answer: 'Khabar menyempurnakan makna mubtada.' }],
  content: [
    'Mubtada adalah isim marfu yang terletak di awal kalimat dan menjadi pokok pembicaraan.',
    'Khabar adalah bagian yang menyempurnakan makna mubtada sehingga kalimat menjadi sempurna.',
    'Contohnya: Zaidun qaimun. Kata Zaidun adalah mubtada dan qaimun adalah khabar.',
    'Mubtada dan khabar dibaca rafa karena keduanya termasuk isim yang marfu.',
    'Khabar bisa berupa mufrad, jumlah, atau syibhul jumlah.'
  ].join(' ')
};

const fiil = {
  id: 'm2',
  type: 'text',
  title: "Fi'il Madhi",
  summary: "Fi'il madhi menunjukkan pekerjaan yang sudah terjadi.",
  keyPoints: ["Fi'il madhi selalu mabni."],
  studyGuide: [],
  content: "Fi'il madhi adalah kata kerja lampau. Tanda fi'il madhi di antaranya bisa menerima ta' ta'nits sakinah. Contohnya kataba dan jalasa."
};

const quiz = {
  id: 'm3',
  type: 'quiz',
  title: 'Kuis Nahwu',
  summary: 'Uji pemahaman dasar nahwu.',
  keyPoints: ['Mubtada', 'Khabar'],
  studyGuide: [],
  content: JSON.stringify({ questions: [{ prompt: 'Pokok kalimat?', answer: 'mubtada-rahasia' }] })
};

test('tanya-jawab panduan yang cocok dipakai apa adanya', () => {
  const result = findAnswer({ question: 'Apa fungsi khabar?', material: mubtadaKhabar });
  assert.equal(result.found, true);
  assert.equal(result.answer, 'Khabar menyempurnakan makna mubtada.');
  assert.equal(result.source, 'panduan materi');
});

test('pertanyaan definisi memilih kalimat pengertian dari isi materi', () => {
  const result = findAnswer({ question: 'mubtada itu apa sih?', material: mubtadaKhabar });
  assert.equal(result.found, true);
  assert.match(result.answer, /Mubtada adalah/);
});

test('pertanyaan contoh memilih kalimat yang memuat contoh', () => {
  const result = findAnswer({ question: 'boleh minta contoh mubtada dan khabar?', material: mubtadaKhabar });
  assert.match(result.answer, /Zaidun qaimun/);
});

test('pertanyaan alasan memilih kalimat dengan "karena"', () => {
  const result = findAnswer({ question: 'kenapa mubtada dibaca rafa?', material: mubtadaKhabar });
  assert.match(result.answer, /karena/);
});

test('ejaan transliterasi berbeda tetap cocok', () => {
  assert.equal(normalize("fi'il"), normalize('fiil'));
  const result = findAnswer({ question: 'apa tanda fiil madhi', material: fiil });
  assert.equal(result.found, true);
  assert.match(result.answer, /ta' ta'nits|Tanda/);
});

test('materi lain di maddah yang sama ikut dicari', () => {
  const result = findAnswer({ question: 'apa itu fiil madhi?', material: mubtadaKhabar, otherMaterials: [fiil] });
  assert.equal(result.found, true);
  assert.match(result.answer, /kata kerja lampau|sudah terjadi/);
  assert.match(result.source, /materi lain/);
});

test('kunci jawaban kuis tidak pernah dibocorkan', () => {
  const result = findAnswer({ question: 'pokok kalimat jawabannya apa?', material: quiz });
  assert.doesNotMatch(result.answer, /rahasia/);
});

test('pertanyaan di luar materi dijawab terus terang, tidak dikarang', () => {
  const result = findAnswer({ question: 'siapa presiden mesir sekarang?', material: mubtadaKhabar, otherMaterials: [fiil] });
  assert.equal(result.found, false);
  assert.match(result.answer, /belum membahas/);
  assert.doesNotMatch(result.answer, /Mubtada adalah|kata kerja/);
  assert.match(result.answer, /ustadz/);
});

test('pemotong imbuhan tidak merusak istilah Arab pendek', () => {
  assert.equal(stem('khabar'), 'khabar');
  assert.equal(stem('mubtada'), 'mubtada');
  assert.equal(stem('berfungsi'), 'fungsi');
});
