// Cara membalas permintaan HTTP. Semua balasan API lewat sini supaya header
// keamanan dan header cache selalu sama.

function json(response, status, value) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  response.end(JSON.stringify(value));
}

function noContent(response) {
  response.writeHead(204).end();
}

function csvCell(value) {
  return `"${String(value === undefined || value === null ? '' : value).replaceAll('"', '""')}"`;
}

// BOM di depan supaya Excel di Windows membaca huruf beraksen dengan benar.
function csv(response, { filename, rows }) {
  const content = `﻿${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`;
  response.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  response.end(content);
}

// Retry-After memberi tahu pemanggil kapan boleh mencoba lagi, dalam detik.
function tooManyRequests(response, retryAfterSeconds, message) {
  response.writeHead(429, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Retry-After': String(retryAfterSeconds)
  });
  response.end(JSON.stringify({ error: message }));
}

// Hanya pesan yang memang boleh dilihat pemanggil. Detail teknis tidak pernah ikut.
function publicError(result) {
  return {
    error: result.error || 'Permintaan tidak dapat diproses.',
    errors: result.errors || undefined
  };
}

module.exports = { csv, csvCell, json, noContent, publicError, tooManyRequests };
