const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createSupabaseStorage } = require('./supabase.js');
test('video range stays on the authenticated storage endpoint and checks the upstream range', async () => {
  const store = createSupabaseStorage({ url: 'https://storage.example.test', serviceRoleKey: 'test-only-key', fetchImpl: async (url, options) => {
    assert.equal(options.headers.Range, 'bytes=4-7');
    assert.equal(options.headers.Authorization, 'Bearer test-only-key');
    assert.ok(!url.includes('/sign/'));
    return new Response(Buffer.from('abcd'), { status: 206, headers: { 'Content-Range': 'bytes 4-7/20' } });
  } });
  const stream = await store.readRange('private', 'course/clip.mp4', 4, 7), chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  assert.equal(Buffer.concat(chunks).toString(), 'abcd');
});
test('upstream full downloads and mismatched ranges are rejected', async () => {
  for (const response of [new Response('whole-file', { status: 200 }), new Response('bad-range', { status: 206, headers: { 'Content-Range': 'bytes 0-8/20' } })]) {
    const store = createSupabaseStorage({ url: 'https://storage.example.test', serviceRoleKey: 'test-only-key', fetchImpl: async () => response });
    await assert.rejects(() => store.readRange('private', 'clip.mp4', 4, 7), /tidak mendukung/);
  }
});
