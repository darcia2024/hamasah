'use strict';

async function evaluateAiService(aiService, dataset) {
  const results = [];
  for (const item of dataset || []) {
    const response = await aiService.answer(item.input);
    const answer = response.ok && response.value ? response.value.answer : '';
    const passed = item.expect.ok === response.ok && (!item.expect.source || item.expect.source === response.value.source) && (!item.expect.includes || item.expect.includes.every((word) => answer.toLocaleLowerCase('id-ID').includes(word.toLocaleLowerCase('id-ID'))));
    results.push({ id: item.id, passed, source: response.ok ? response.value.source : null, error: response.ok ? null : response.error });
  }
  return { total: results.length, passed: results.filter((item) => item.passed).length, results };
}

module.exports = { evaluateAiService };
