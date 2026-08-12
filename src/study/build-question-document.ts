import type { ExamQuestionNode } from '@/domain/types';
import { ensureLocalHtml } from '@/study/ensure-local-html';

export type QuestionDocMode = 'detail' | 'peek' | 'paper';

export type BuildQuestionDocOpts = {
  mode?: QuestionDocMode;
  /** When false, omit Show answer / correct markers interaction. */
  canReveal?: boolean;
  notifyOptionSelect?: boolean;
};

export type PaperPeekItem = {
  id: string;
  numberLabel?: string;
  marks?: number;
  sectionName?: string;
  promptMd?: string;
  promptRenderedHtml?: string;
  stem?: string;
};

export type ParsedOption = {
  id: string;
  label: string;
  text?: string;
  html?: string;
  isCorrect: boolean;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function wrapRenderRoot(fragment: string): string {
  const trimmed = fragment.trim();
  if (!trimmed) return `<p class="el-muted">No rendered content yet.</p>`;
  return trimmed.includes('el-render-root')
    ? trimmed
    : `<div class="el-render-root">${trimmed}</div>`;
}

function mdFallback(md: string | undefined): string {
  const t = (md || '').trim();
  if (!t) return `<p class="el-muted">No content.</p>`;
  return wrapRenderRoot(`<p>${escapeHtml(t)}</p>`);
}

export function parseQuestionOptions(
  raw: unknown[] | undefined,
  correctAnswer?: string | null,
): ParsedOption[] {
  if (!Array.isArray(raw)) return [];
  const rows = raw.map((opt, i) => {
    const label = String.fromCharCode(65 + i);
    if (typeof opt === 'string') {
      return {
        id: `o${i}`,
        label,
        text: opt,
        isCorrect: false,
      };
    }
    if (opt && typeof opt === 'object') {
      const o = opt as {
        id?: string;
        text?: string;
        label?: string;
        renderedHtml?: string;
        isCorrect?: boolean;
      };
      return {
        id: String(o.id || `o${i}`),
        label: o.label || label,
        text: o.text,
        html: o.renderedHtml,
        isCorrect: Boolean(o.isCorrect),
      };
    }
    return { id: `o${i}`, label, text: String(opt), isCorrect: false };
  });

  if (!rows.some((r) => r.isCorrect) && correctAnswer?.trim()) {
    const ans = correctAnswer.trim().toUpperCase();
    for (const r of rows) {
      if (r.label.toUpperCase() === ans || r.id.toUpperCase() === ans) {
        r.isCorrect = true;
      }
    }
  }
  return rows;
}

function optionSectionHtml(
  options: ParsedOption[],
  interactive: boolean,
  exposeCorrect: boolean,
): string {
  if (options.length === 0) return '';
  const items = options
    .map((opt) => {
      const body = opt.html?.trim()
        ? wrapRenderRoot(opt.html)
        : mdFallback(opt.text);
      const interactiveCls = interactive ? ' el-option--interactive' : '';
      const correct = exposeCorrect && opt.isCorrect ? '1' : '0';
      return `<div class="el-option${interactiveCls}" data-option-id="${escapeHtml(opt.id)}" data-correct="${correct}" role="button">
  <span class="el-option-label">${escapeHtml(opt.label)}</span>
  <div class="el-option-body">${body}</div>
</div>`;
    })
    .join('\n');
  return `<section class="el-q-section el-q-options" aria-label="Options">${items}</section>`;
}

function answerSolutionHtml(
  node: ExamQuestionNode,
  kind: 'answer' | 'solution',
): string {
  const html =
    kind === 'answer' ? node.answerRenderedHtml : node.solutionRenderedHtml;
  const md = kind === 'answer' ? node.answerMd : node.solutionMd;
  if (!html?.trim() && !md?.trim()) return '';
  const body = html?.trim() ? wrapRenderRoot(html) : mdFallback(md);
  const title = kind === 'answer' ? 'Answer' : 'Solution';
  return `<div class="el-reveal-block" data-reveal-kind="${kind}">
  <p class="el-reveal-heading">${title}${node.numberLabel ? ` · ${escapeHtml(node.numberLabel)}` : ''}</p>
  ${body}
</div>`;
}

function revealPanelInner(node: ExamQuestionNode): string {
  const parts: string[] = [];
  const a = answerSolutionHtml(node, 'answer');
  const s = answerSolutionHtml(node, 'solution');
  if (a) parts.push(a);
  if (s) parts.push(s);
  return parts.join('\n');
}

/** Full-width accordion: tap header to expand/collapse answer + solution. */
function answerAccordionHtml(opts: {
  locked: boolean;
  panelInner: string;
  hasMcq: boolean;
}): string {
  if (opts.locked) {
    return `<section class="el-answer-accordion el-answer-accordion--locked" data-answer-accordion>
  <button type="button" class="el-answer-accordion__trigger" data-locked-reveal="1" aria-expanded="false">
    <span class="el-answer-accordion__lead">
      <span class="el-answer-accordion__title">Answer &amp; solution</span>
      <span class="el-answer-accordion__hint">Subscribe to reveal</span>
    </span>
    <span class="el-answer-accordion__icon" aria-hidden="true">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M7 11V8a5 5 0 0 1 10 0v3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" stroke-width="2"/></svg>
    </span>
  </button>
</section>`;
  }

  const emptyHint =
    !opts.panelInner.trim() && opts.hasMcq
      ? `<p class="el-answer-accordion__empty">Correct options are highlighted above when expanded.</p>`
      : '';
  const body = opts.panelInner.trim() || emptyHint;

  return `<section class="el-answer-accordion" data-answer-accordion>
  <button type="button" class="el-answer-accordion__trigger el-toggle-answer" aria-expanded="false">
    <span class="el-answer-accordion__lead">
      <span class="el-answer-accordion__title">Answer &amp; solution</span>
      <span class="el-answer-accordion__hint" data-answer-hint>Tap to expand</span>
    </span>
    <span class="el-answer-accordion__chevron" aria-hidden="true">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </span>
  </button>
  <div class="el-answer-accordion__panel is-hidden" data-solutions-panel aria-label="Answer and solution" hidden>
    ${body}
  </div>
</section>`;
}

async function localizeFragment(html: string | undefined): Promise<string | undefined> {
  if (!html?.trim()) return html;
  return ensureLocalHtml(html);
}

async function localizeNode(node: ExamQuestionNode): Promise<ExamQuestionNode> {
  const [promptRenderedHtml, answerRenderedHtml, solutionRenderedHtml] =
    await Promise.all([
      localizeFragment(node.promptRenderedHtml),
      localizeFragment(node.answerRenderedHtml),
      localizeFragment(node.solutionRenderedHtml),
    ]);

  let options = node.options;
  if (Array.isArray(options)) {
    options = await Promise.all(
      options.map(async (o) => {
        if (!o || typeof o !== 'object') return o;
        const obj = o as { renderedHtml?: string };
        if (!obj.renderedHtml) return o;
        return { ...obj, renderedHtml: await localizeFragment(obj.renderedHtml) };
      }),
    );
  }

  const children = node.children?.length
    ? await Promise.all(node.children.map(localizeNode))
    : node.children;

  return {
    ...node,
    promptRenderedHtml,
    answerRenderedHtml,
    solutionRenderedHtml,
    options,
    children,
  };
}

function buildBlockHtml(
  node: ExamQuestionNode,
  opts: {
    depth: number;
    mode: QuestionDocMode;
    canReveal: boolean;
    indexLabel?: string;
  },
): string {
  const prompt = node.promptRenderedHtml?.trim()
    ? wrapRenderRoot(node.promptRenderedHtml)
    : mdFallback(node.promptMd);

  const options = parseQuestionOptions(node.options as unknown[] | undefined);
  const isMcq = options.length > 0;
  const panelInner = opts.mode === 'detail' ? revealPanelInner(node) : '';
  const hasRevealContent = Boolean(panelInner.trim()) || isMcq;
  const showToggle = opts.mode === 'detail' && hasRevealContent;

  const inner: string[] = [
    `<section class="el-q-section el-q-prompt">${prompt}</section>`,
  ];

  if (isMcq && opts.mode === 'detail') {
    inner.push(optionSectionHtml(options, true, opts.canReveal));
  }

  if (showToggle) {
    inner.push(
      answerAccordionHtml({
        locked: !opts.canReveal,
        panelInner: opts.canReveal ? panelInner : '',
        hasMcq: isMcq,
      }),
    );
  }

  // Nested parts (structural) as child articles inside detail mode
  const childBlocks =
    opts.mode === 'detail'
      ? (node.children || [])
          .map((c) =>
            buildBlockHtml(c, {
              depth: opts.depth + 1,
              mode: opts.mode,
              canReveal: opts.canReveal,
            }),
          )
          .join('\n')
      : '';

  // Root detail: number / type / marks live in the RN header — omit duplicate card chrome.
  // Nested parts still get a compact label.
  const headerHtml =
    opts.depth > 0
      ? `<header class="el-question-header">
  <span class="el-question-index">${escapeHtml(node.numberLabel || opts.indexLabel || 'Part')}</span>
  ${
    node.marks > 0
      ? `<span class="el-question-meta">${node.marks} mark${node.marks === 1 ? '' : 's'}</span>`
      : ''
  }
</header>`
      : '';

  return `<article class="el-question-block${opts.depth > 0 ? ' el-question-block--part' : ''}" data-question-id="${escapeHtml(node.id)}">
${headerHtml}
<div class="el-question-inner">
${inner.join('\n')}
</div>
${childBlocks}
</article>`;
}

const HEIGHT_HELPERS = `
  document.documentElement.style.height = "auto";
  document.body.style.height = "auto";
  function contentHeight() {
    var root =
      document.querySelector("[data-el-question-doc]") ||
      document.querySelector(".el-question-doc") ||
      document.body;
    var rect = root.getBoundingClientRect();
    return Math.ceil(
      Math.max(
        root.scrollHeight || 0,
        root.offsetHeight || 0,
        rect && rect.height ? rect.height : 0
      )
    );
  }
  function postHeight() {
    var h = contentHeight();
    if (window.ReactNativeWebView && h > 0) {
      window.ReactNativeWebView.postMessage(String(h));
    }
  }
  function postHeightSoon() {
    requestAnimationFrame(function () {
      requestAnimationFrame(postHeight);
    });
  }
`;

const INTERACTIVE_SCRIPT = `
(function () {
  var docRoot = document.querySelector("[data-el-question-doc]");
  if (!docRoot) return;
  var notifyOption = docRoot.getAttribute("data-notify-options") === "1";
${HEIGHT_HELPERS}

  document.querySelectorAll(".el-question-block").forEach(function (block) {
    var revealed = false;
    var selectedId = null;

    function clearReveal() {
      block.querySelectorAll(".el-option").forEach(function (el) {
        el.classList.remove("el-option--correct", "el-option--wrong");
      });
    }

    function applyReveal() {
      block.querySelectorAll(".el-option").forEach(function (el) {
        el.classList.remove("el-option--interactive");
        var correct = el.getAttribute("data-correct") === "1";
        var id = el.getAttribute("data-option-id");
        if (correct) el.classList.add("el-option--correct");
        else if (id && id === selectedId) el.classList.add("el-option--wrong");
      });
      var accordion = block.querySelector("[data-answer-accordion]");
      if (accordion) accordion.classList.add("is-open");
      var panel = block.querySelector("[data-solutions-panel]");
      if (panel) {
        panel.classList.remove("is-hidden");
        panel.removeAttribute("hidden");
      }
      var btn = block.querySelector(".el-toggle-answer");
      if (btn) btn.setAttribute("aria-expanded", "true");
      var hint = block.querySelector("[data-answer-hint]");
      if (hint) hint.textContent = "Tap to collapse";
      postHeightSoon();
    }

    function applyHide() {
      revealed = false;
      clearReveal();
      block.querySelectorAll(".el-option").forEach(function (el) {
        el.classList.add("el-option--interactive");
        el.classList.remove("el-option--selected");
      });
      selectedId = null;
      var accordion = block.querySelector("[data-answer-accordion]");
      if (accordion) accordion.classList.remove("is-open");
      var panel = block.querySelector("[data-solutions-panel]");
      if (panel) {
        panel.classList.add("is-hidden");
        panel.setAttribute("hidden", "");
      }
      var btn = block.querySelector(".el-toggle-answer");
      if (btn) btn.setAttribute("aria-expanded", "false");
      var hint = block.querySelector("[data-answer-hint]");
      if (hint) hint.textContent = "Tap to expand";
      postHeightSoon();
    }

    var toggleBtn = block.querySelector(".el-toggle-answer");
    if (toggleBtn) {
      toggleBtn.addEventListener("click", function () {
        revealed = !revealed;
        if (revealed) applyReveal();
        else applyHide();
      });
    }

    var lockedBtn = block.querySelector("[data-locked-reveal]");
    if (lockedBtn) {
      lockedBtn.addEventListener("click", function () {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ t: "locked" }));
        }
      });
    }

    block.querySelectorAll("[data-option-id]").forEach(function (el) {
      el.addEventListener("click", function () {
        if (revealed) return;
        if (!el.classList.contains("el-option--interactive") && !el.getAttribute("data-correct")) return;
        selectedId = el.getAttribute("data-option-id");
        block.querySelectorAll(".el-option").forEach(function (opt) {
          opt.classList.toggle(
            "el-option--selected",
            opt.getAttribute("data-option-id") === selectedId
          );
        });
        if (notifyOption && window.ReactNativeWebView && selectedId) {
          window.ReactNativeWebView.postMessage(
            JSON.stringify({ t: "opt", q: block.getAttribute("data-question-id"), id: selectedId })
          );
        }
        postHeightSoon();
      });
    });
  });

  postHeight();
  new MutationObserver(postHeightSoon).observe(document.body, {
    childList: true, subtree: true, attributes: true, attributeFilter: ["class"],
  });
  if (window.ResizeObserver) new ResizeObserver(postHeightSoon).observe(docRoot);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(postHeightSoon);

  // Horizontal swipe → RN navigates questions (left=next, right=prev)
  var swipeStartX = 0;
  var swipeStartY = 0;
  var swipeTracking = false;
  docRoot.addEventListener("touchstart", function (e) {
    if (!e.touches || e.touches.length !== 1) {
      swipeTracking = false;
      return;
    }
    swipeTracking = true;
    swipeStartX = e.touches[0].clientX;
    swipeStartY = e.touches[0].clientY;
  }, { passive: true });
  docRoot.addEventListener("touchend", function (e) {
    if (!swipeTracking || !window.ReactNativeWebView) return;
    swipeTracking = false;
    var t = e.changedTouches && e.changedTouches[0];
    if (!t) return;
    var dx = t.clientX - swipeStartX;
    var dy = t.clientY - swipeStartY;
    if (Math.abs(dx) < 56) return;
    if (Math.abs(dx) < Math.abs(dy) * 1.35) return;
    window.ReactNativeWebView.postMessage(
      JSON.stringify({ t: "swipe", dir: dx < 0 ? "left" : "right" })
    );
  }, { passive: true });
  docRoot.addEventListener("touchcancel", function () {
    swipeTracking = false;
  }, { passive: true });
})();
`;

const PAPER_PEEK_SCRIPT = `
(function () {
${HEIGHT_HELPERS}
  var docRoot =
    document.querySelector("[data-el-question-doc]") ||
    document.querySelector(".el-question-doc") ||
    document.body;
  document.querySelectorAll("[data-paper-open]").forEach(function (el) {
    el.addEventListener("click", function () {
      var id = el.getAttribute("data-paper-open");
      if (id && window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ t: "open", id: id }));
      }
    });
  });
  postHeight();
  new MutationObserver(postHeightSoon).observe(document.body, {
    childList: true, subtree: true, attributes: true, attributeFilter: ["class"],
  });
  if (window.ResizeObserver) new ResizeObserver(postHeightSoon).observe(docRoot);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(postHeightSoon);
})();
`;

function wrapDocument(innerHtml: string, opts: BuildQuestionDocOpts): string {
  const mode = opts.mode || 'detail';
  const script =
    mode === 'detail'
      ? INTERACTIVE_SCRIPT
      : mode === 'paper'
        ? PAPER_PEEK_SCRIPT
        : '';
  return `<div class="el-paper-doc el-question-doc el-question-doc--${mode}" data-el-question-doc="1" data-notify-options="${opts.notifyOptionSelect ? '1' : '0'}">
${innerHtml}
${script ? `<script>${script}</script>` : ''}
</div>`;
}

function paperPeekCardHtml(
  item: PaperPeekItem,
  index: number,
  opts?: { showSection?: boolean },
): string {
  // Prefer pack CHTML raw; fall back to stem / markdown. No network localize here.
  let prompt: string;
  const strippedHtml = item.promptRenderedHtml?.trim()
    ? item.promptRenderedHtml
        .replace(/<img\b[^>]*>/gi, '')
        .replace(/<svg\b[\s\S]*?<\/svg>/gi, '')
        .trim()
    : '';

  if (strippedHtml) {
    prompt = wrapRenderRoot(strippedHtml);
  } else if (item.stem?.trim()) {
    prompt = wrapRenderRoot(`<p>${escapeHtml(item.stem)}</p>`);
  } else if (item.promptMd?.trim()) {
    prompt = mdFallback(item.promptMd.slice(0, 280));
  } else {
    prompt = wrapRenderRoot(`<p>Open question</p>`);
  }
  const marks =
    item.marks && item.marks > 0
      ? `<span class="el-paper-peek-marks">${item.marks} mk</span>`
      : '';
  const section =
    opts?.showSection && item.sectionName?.trim()
      ? `<span class="el-paper-peek-section">${escapeHtml(item.sectionName)}</span>`
      : '';

  return `<article class="el-paper-peek-card" data-paper-open="${escapeHtml(item.id)}" role="button">
  <div class="el-paper-peek-top">
    <span class="el-paper-peek-index">${escapeHtml(item.numberLabel || String(index + 1))}</span>
    <div class="el-paper-peek-meta">
      ${section}
      ${marks}
    </div>
    <span class="el-paper-peek-chevron" aria-hidden="true">›</span>
  </div>
  <div class="el-paper-peek-body">
    ${prompt}
    <div class="el-paper-peek-fade" aria-hidden="true"></div>
  </div>
</article>`;
}

/** One HTML document: all paper questions as faded sneak-peek cards. */
export function buildPaperPeekDocumentBody(
  items: PaperPeekItem[],
  meta?: { paperTitle?: string; year?: string | number },
): string {
  if (items.length === 0) {
    return wrapDocument(
      `<p class="el-muted" style="padding:1rem;text-align:center">No questions on this paper.</p>`,
      { mode: 'paper' },
    );
  }

  const groups: { name: string; items: { item: PaperPeekItem; index: number }[] }[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const name = item.sectionName?.trim() || '';
    const last = groups[groups.length - 1];
    if (last && last.name === name) last.items.push({ item, index: i });
    else groups.push({ name, items: [{ item, index: i }] });
  }

  const header = meta?.paperTitle
    ? `<header class="el-paper-header">
  <h1 class="el-paper-title">${escapeHtml(meta.paperTitle)}</h1>
  ${meta.year ? `<p class="el-paper-subtitle">${escapeHtml(String(meta.year))}</p>` : ''}
  <p class="el-paper-hint">Tap a question to open it.</p>
</header>`
    : '';

  const body = groups
    .map((g) => {
      const cards = g.items
        .map(({ item, index }) =>
          paperPeekCardHtml(item, index, { showSection: !g.name }),
        )
        .join('\n');
      if (!g.name) return `<div class="el-paper-peek-list">${cards}</div>`;
      return `<section class="el-paper-section">
  <h2 class="el-section-title">${escapeHtml(g.name)}</h2>
  <div class="el-paper-peek-list">${cards}</div>
</section>`;
    })
    .join('\n');

  return wrapDocument(`${header}\n${body}`, { mode: 'paper' });
}

/** Sync paper peek doc — no asset localization (avoids hanging the list spinner). */
export function buildPaperPeekDocumentAsync(
  items: PaperPeekItem[],
  meta?: { paperTitle?: string; year?: string | number },
): Promise<string> {
  return Promise.resolve(buildPaperPeekDocumentBody(items, meta));
}

/** Sync compose when fragments are already localized. */
export function buildQuestionDocumentBody(
  node: ExamQuestionNode,
  opts: BuildQuestionDocOpts = {},
): string {
  const mode = opts.mode || 'detail';
  const canReveal = opts.canReveal !== false;
  const block = buildBlockHtml(node, {
    depth: 0,
    mode,
    canReveal: mode === 'detail' ? canReveal : false,
    indexLabel: '1',
  });
  return wrapDocument(block, opts);
}

/** Localize assets then compose. */
export async function buildQuestionDocumentAsync(
  node: ExamQuestionNode,
  opts: BuildQuestionDocOpts = {},
): Promise<string> {
  const localized = await localizeNode(node);
  return buildQuestionDocumentBody(localized, opts);
}

/** Peek body for list rows (prompt only). */
export async function buildQuestionPeekAsync(
  item: {
    id: string;
    numberLabel?: string;
    marks?: number;
    promptMd?: string;
    promptRenderedHtml?: string;
  },
): Promise<string> {
  const node: ExamQuestionNode = {
    id: item.id,
    numberLabel: item.numberLabel || '',
    topic: '',
    marks: item.marks || 0,
    promptMd: item.promptMd || '',
    answerMd: '',
    solutionMd: '',
    promptRenderedHtml: item.promptRenderedHtml,
    hints: [],
    tags: [],
  };
  return buildQuestionDocumentAsync(node, { mode: 'peek', canReveal: false });
}
