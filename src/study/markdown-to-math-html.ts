/**
 * Study fallback when pack HTML is missing or still contains raw TeX
 * delimiters. Prefer server-side render-sidecar CHTML in packs.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function texToPlain(tex: string): string {
  return tex
    .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '($1)/($2)')
    .replace(/\\dfrac\{([^{}]+)\}\{([^{}]+)\}/g, '($1)/($2)')
    .replace(/\\sqrt\{([^{}]+)\}/g, '√($1)')
    .replace(/\\text\{([^{}]+)\}/g, '$1')
    .replace(/\\mathrm\{([^{}]+)\}/g, '$1')
    .replace(/\\mathbf\{([^{}]+)\}/g, '$1')
    .replace(/\\times/g, '×')
    .replace(/\\div/g, '÷')
    .replace(/\\pm/g, '±')
    .replace(/\\cdot/g, '·')
    .replace(/\\pi\b/g, 'π')
    .replace(/\\circ/g, '°')
    .replace(/\\left|\\right/g, '')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Input should already be delimiter-normalized (`\[` → `$$`, `\(` → `$`).
 */
export function markdownToMathHtml(markdown: string): string {
  const tokens: Array<{ type: 'text' | 'inline' | 'block'; value: string }> = [];
  let i = 0;
  const s = markdown;

  while (i < s.length) {
    if (s.startsWith('$$', i)) {
      const end = s.indexOf('$$', i + 2);
      if (end === -1) {
        tokens.push({ type: 'text', value: s.slice(i) });
        break;
      }
      tokens.push({ type: 'block', value: s.slice(i + 2, end) });
      i = end + 2;
      continue;
    }
    if (s[i] === '$') {
      const end = s.indexOf('$', i + 1);
      if (end === -1) {
        tokens.push({ type: 'text', value: s.slice(i) });
        break;
      }
      tokens.push({ type: 'inline', value: s.slice(i + 1, end) });
      i = end + 1;
      continue;
    }
    let j = i + 1;
    while (j < s.length && s[j] !== '$') j++;
    tokens.push({ type: 'text', value: s.slice(i, j) });
    i = j;
  }

  const html = tokens
    .map((t) => {
      if (t.type === 'block') {
        return `<div class="math-block" style="margin:0.6em 0;text-align:center;font-family:serif">${escapeHtml(texToPlain(t.value))}</div>`;
      }
      if (t.type === 'inline') {
        return `<span class="math-inline" style="font-family:serif">${escapeHtml(texToPlain(t.value))}</span>`;
      }
      let text = escapeHtml(t.value);
      text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
      text = text.replace(/^#{1,3}\s+(.+)$/gm, '<strong>$1</strong>');
      text = text.replace(/^\*\s+(.+)$/gm, '• $1');
      text = text.replace(/\n\n/g, '</p><p>');
      text = text.replace(/\n/g, '<br/>');
      return text;
    })
    .join('');

  return `<p>${html}</p>`;
}
