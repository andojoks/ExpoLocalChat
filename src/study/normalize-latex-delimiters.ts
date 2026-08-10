/**
 * Normalize common TeX delimiter styles to $$ / $ so study + chat fallbacks
 * treat \[...\], \(...\), $$...$$, and $...$ consistently.
 */
export function normalizeLatexDelimiters(raw: string): string {
  let out = String(raw || '');
  // Display math
  out = out.replace(/\\\[([\s\S]+?)\\\]/g, (_m, body: string) => `$$${body.trim()}$$`);
  // Inline math (paren form)
  out = out.replace(/\\\(([\s\S]+?)\\\)/g, (_m, body: string) => `$${body.trim()}$`);
  return out;
}

export function hasLatexDelimiters(raw: string): boolean {
  const s = String(raw || '');
  return (
    /\$\$[\s\S]+?\$\$/.test(s) ||
    /\$[^$\n]+?\$/.test(s) ||
    /\\\[[\s\S]+?\\\]/.test(s) ||
    /\\\([\s\S]+?\\\)/.test(s)
  );
}
