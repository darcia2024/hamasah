// Small, text-only Markdown renderer: no HTML, scripts, images, or embedded content.
(function (root) {
  function blocks(value) {
    const lines = String(value || '').replace(/\r\n?/g, '\n').split('\n');
    const result = [];
    for (let i = 0; i < lines.length;) {
      const line = lines[i].trim();
      if (!line) { i++; continue; }
      const heading = /^(#{1,3})\s+(.+)$/.exec(line);
      if (heading) { result.push({ type: 'heading', level: heading[1].length, text: heading[2] }); i++; continue; }
      const item = /^(?:[-*]\s+|\d+[.)]\s+)(.+)$/.exec(line);
      if (item) {
        const ordered = /^\d/.test(line), items = [];
        while (i < lines.length) {
          const match = (ordered ? /^\s*\d+[.)]\s+(.+)$/ : /^\s*[-*]\s+(.+)$/).exec(lines[i]);
          if (!match) break;
          items.push(match[1]); i++;
        }
        result.push({ type: ordered ? 'ol' : 'ul', items }); continue;
      }
      if (/^>\s?/.test(line)) { result.push({ type: 'quote', text: line.replace(/^>\s?/, '') }); i++; continue; }
      const text = [];
      while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|[-*]\s|\d+[.)]\s|>)/.test(lines[i].trim())) text.push(lines[i++].trim());
      // An unsupported marker is plain text, never executable markup.
      if (!text.length) text.push(lines[i++].trim());
      const joined = text.join('\n');
      result.push({ type: 'p', text: joined, arabic: /[\p{Script=Arabic}]/u.test(joined) && !/[a-zA-Z]/.test(joined) });
    }
    return result;
  }
  function inline(node, text, doc) {
    String(text).split(/(\*\*[^*\n]+\*\*)/).forEach(part => {
      if (part.startsWith('**') && part.endsWith('**')) {
        const bold = doc.createElement('strong'); bold.textContent = part.slice(2, -2); node.append(bold);
      } else node.append(doc.createTextNode(part));
    });
  }
  function render(value, doc = document) {
    const container = doc.createElement('div'); container.className = 'lms-prose';
    const parsed = blocks(value);
    for (let index = 0; index < parsed.length; index++) {
      const block = parsed[index];
      const node = doc.createElement(block.type === 'heading' ? `h${block.level}` : block.type === 'quote' ? 'blockquote' : block.type);
      if (block.items) block.items.forEach(text => { const item = doc.createElement('li'); inline(item, text, doc); node.append(item); });
      else inline(node, block.text, doc);
      if (block.arabic) { node.className = 'lms-prose__arabic'; node.dir = 'rtl'; node.lang = 'ar'; }
      if (block.arabic) {
        const figure = doc.createElement('figure'); figure.className = 'lms-prose__example';
        figure.append(node);
        const next = parsed[index + 1];
        if (next && next.type === 'p' && !next.arabic) {
          const caption = doc.createElement('figcaption'); caption.className = 'lms-prose__explanation';
          inline(caption, next.text, doc); figure.append(caption); index++;
        }
        container.append(figure);
      } else container.append(node);
    }
    return container;
  }
  const api = Object.freeze({ blocks, render });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HamasahLmsRichText = api;
})(typeof window === 'undefined' ? globalThis : window);
