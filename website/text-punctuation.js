// Keep visible copy consistent, including text loaded from the CMS or account data.
// Stored records, form values, URLs, code examples, and executable content stay intact.
(function () {
  const dash = /\u2014|&mdash;|&#8212;|&#x2014;/gi;
  const skip = 'script,style,noscript,textarea,input,pre,code,[contenteditable]';
  function clean(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (!node.parentElement || node.parentElement.closest(skip)) return;
      const text = node.nodeValue;
      if (!/\u2014|&mdash;|&#8212;|&#x2014;/i.test(text)) return;
      const next = text.trim() === '\u2014' ? text.replace(/\u2014/g, '-') : text.replace(dash, ',').replace(/\s+,/g, ',');
      if (next !== text) node.nodeValue = next;
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE || node.matches(skip)) return;
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) clean(walker.currentNode);
  }
  clean(document.body);
  new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'characterData') clean(record.target);
      else record.addedNodes.forEach(clean);
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
})();
