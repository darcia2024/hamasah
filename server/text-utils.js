// Pembantu teks yang dipakai beberapa modul.

function normalizeSlug(value) {
  return String(value || '')
    .toLocaleLowerCase('id-ID')
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

module.exports = { normalizeSlug };
