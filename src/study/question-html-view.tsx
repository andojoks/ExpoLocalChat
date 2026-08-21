import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { loadChtmlCss } from '@/lib/assets/loadBundledStyleText';
import { packAssetsRoot } from '@/packs/asset-cache';
import { useTheme } from '@/theme/ThemeProvider';
import { BRAND_BLUE } from '@/theme/brand';
import type { ThemeColors } from '@/theme/tokens';

/** Measure content root — not body.scrollHeight (RN WebView frame keeps body tall after collapse). */
const INJECTED_HEIGHT_JS = `
(function () {
  var lastH = 0;
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
    if (window.ReactNativeWebView && h > 0 && h !== lastH) {
      lastH = h;
      window.ReactNativeWebView.postMessage(String(h));
    }
  }
  function postHeightSoon() {
    requestAnimationFrame(function () {
      requestAnimationFrame(postHeight);
    });
  }
  postHeight();
  new MutationObserver(postHeightSoon).observe(document.body, {
    childList: true, subtree: true, attributes: true, attributeFilter: ["class"],
  });
  if (window.ResizeObserver) {
    var root =
      document.querySelector("[data-el-question-doc]") ||
      document.querySelector(".el-question-doc") ||
      document.body;
    new ResizeObserver(postHeightSoon).observe(root);
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(postHeightSoon);
})();
true;
`;

/** Paper peek cards: tap → open. Inline <script> in source.html is unreliable on Android. */
const PAPER_OPEN_INJECT = `
(function () {
  if (window.__elPaperOpenBound) return;
  window.__elPaperOpenBound = true;
  document.querySelectorAll("[data-paper-open]").forEach(function (el) {
    el.addEventListener("click", function () {
      var id = el.getAttribute("data-paper-open");
      if (id && window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ t: "open", id: id }));
      }
    });
  });
})();
`;

const BASE_CSS = `
* { box-sizing: border-box; }
html, body {
  margin: 0 !important;
  padding: 0 !important;
  width: 100%;
  height: auto !important;
  min-height: 0 !important;
  background-color: transparent !important;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  font-size: 16px;
  line-height: 1.55;
  color: #0B1424;
  word-wrap: break-word;
  overflow-wrap: anywhere;
  overflow-x: hidden;
  max-width: 100%;
}
img { max-width: 100%; height: auto; display: block; }
mjx-container {
  max-width: 100% !important;
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
}
.el-muted { color: #64748B; font-size: 0.9rem; }
.is-hidden { display: none !important; }
.el-render-root, .el-question-doc {
  max-width: 100%;
  overflow-wrap: anywhere;
  word-break: break-word;
}
.el-render-root table {
  margin: 0.5rem 0;
  max-width: 100%;
  display: block;
  overflow-x: auto;
}
.el-render-root pre,
.el-render-root img,
.el-render-root svg {
  max-width: 100%;
}

.el-question-doc { max-width: 100%; }
.el-question-doc--detail {
  /* Match Tailwind p-3 (12px) on all sides — measured with content height */
  padding: 12px;
}
.el-q-section { margin-bottom: 0.875rem; max-width: 100%; }
.el-q-section:last-child { margin-bottom: 0; }

.el-q-options {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.el-option {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  gap: 0.65rem;
  padding: 0.75rem 0.85rem;
  border: 1px solid #E2E8F0;
  border-radius: 0.75rem;
  background: #F8FAFC;
  max-width: 100%;
}
.el-option--interactive { cursor: pointer; -webkit-tap-highlight-color: transparent; }
.el-option--selected {
  border-color: #93C5FD;
  background: rgba(37, 99, 235, 0.08);
}
.el-option--correct {
  border-color: #6EE7B7;
  background: rgba(16, 185, 129, 0.12);
}
.el-option--wrong {
  border-color: #FCA5A5;
  background: rgba(239, 68, 68, 0.08);
}
.el-option-label {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.5rem;
  height: 1.5rem;
  margin-top: 0.1rem;
  font-size: 0.75rem;
  font-weight: 800;
  border-radius: 9999px;
  background: #E2E8F0;
  color: #334155;
}
.el-option--selected .el-option-label { background: #0548E8; color: #fff; }
.el-option--correct .el-option-label { background: #059669; color: #fff; }
.el-option--wrong .el-option-label { background: #DC2626; color: #fff; }
.el-option-body { flex: 1; min-width: 0; }

.el-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.65rem 1.1rem;
  font-size: 0.875rem;
  font-weight: 700;
  color: #fff;
  background: #0548E8;
  border: none;
  border-radius: 0.65rem;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.el-btn--locked {
  background: #94A3B8;
}

.el-answer-accordion {
  /* Bleed to study page edges (doc has 12px padding). No top rule — answer belongs to the section above. */
  width: calc(100% + 24px);
  max-width: none;
  margin: 0.35rem -12px 0;
  padding: 0 12px;
  border: none;
  background: #F8FAFC;
  box-sizing: border-box;
}
.el-answer-accordion.is-open {
  background: #F1F5FB;
}
.el-answer-accordion__trigger {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin: 0;
  padding: 0.95rem 0.15rem 0.95rem 0;
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  color: #0B1424;
}
.el-answer-accordion__lead {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
  flex: 1;
}
.el-answer-accordion__title {
  font-size: 0.9375rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: #0B1424;
}
.el-answer-accordion__hint {
  font-size: 0.75rem;
  font-weight: 500;
  color: #64748B;
}
.el-answer-accordion.is-open .el-answer-accordion__hint {
  color: #0548E8;
}
.el-answer-accordion__chevron,
.el-answer-accordion__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 2rem;
  height: 2rem;
  border-radius: 9999px;
  color: #0548E8;
  background: rgba(5, 72, 232, 0.08);
  transition: transform 0.2s ease;
}
.el-answer-accordion.is-open .el-answer-accordion__chevron {
  transform: rotate(180deg);
  background: rgba(5, 72, 232, 0.14);
}
.el-answer-accordion--locked {
  background: #FFFBEB;
}
.el-answer-accordion--locked .el-answer-accordion__title {
  color: #92400E;
}
.el-answer-accordion--locked .el-answer-accordion__hint {
  color: #B45309;
}
.el-answer-accordion--locked .el-answer-accordion__icon {
  color: #B45309;
  background: rgba(180, 83, 9, 0.1);
}
.el-answer-accordion__panel {
  padding: 0 0 1rem;
}
.el-answer-accordion__panel.is-hidden,
.el-answer-accordion__panel[hidden] {
  display: none !important;
}
.el-answer-accordion__empty {
  margin: 0;
  padding: 0.65rem 0.75rem;
  font-size: 0.8125rem;
  line-height: 1.45;
  color: #475569;
  background: #FFFFFF;
  border: 1px solid #E2E8F0;
  border-radius: 0.65rem;
}
.el-reveal-heading {
  margin: 0 0 0.4rem 0;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #64748B;
}
.el-reveal-block {
  margin-bottom: 0.65rem;
  padding: 0.75rem 0.85rem;
  border-radius: 0.65rem;
  background: #FFFFFF;
  border: 1px solid #E2E8F0;
}
.el-reveal-block:last-child { margin-bottom: 0; }
.el-q-solutions {
  margin-top: 0.25rem;
  padding-top: 0;
  border-top: none;
}

.el-question-block {
  margin-bottom: 0.75rem;
  padding: 0;
  width: 100%;
  max-width: 100%;
  background: transparent;
}
.el-question-block:last-child { margin-bottom: 0; }
.el-question-block--part {
  margin-top: 1rem;
  padding-top: 0.85rem;
  border-top: 1px dashed #CBD5E1;
}
.el-question-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.65rem;
  flex-wrap: wrap;
}
.el-question-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.75rem;
  height: 1.75rem;
  padding: 0 0.4rem;
  font-size: 0.7rem;
  font-weight: 800;
  border-radius: 0.5rem;
  background: #DBEAFE;
  color: #0439C4;
}
.el-question-meta { font-size: 0.75rem; font-weight: 600; color: #64748B; }
.el-question-inner { max-width: 100%; }

.el-paper-header { margin-bottom: 1rem; padding: 0 0.15rem; }
.el-paper-title {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 800;
  color: #0B1424;
  line-height: 1.3;
}
.el-paper-subtitle {
  margin: 0.25rem 0 0;
  font-size: 0.8rem;
  font-weight: 600;
  color: #64748B;
}
.el-paper-hint {
  margin: 0.45rem 0 0;
  font-size: 0.8rem;
  color: #64748B;
}
.el-paper-section { margin-bottom: 1rem; }
.el-section-title {
  margin: 0 0 0.55rem;
  padding: 0 0.15rem;
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #0439C4;
}
.el-paper-peek-list {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  padding: 0.15rem;
}
.el-question-doc--paper {
  padding: 0.85rem 1rem 2rem;
}
.el-paper-peek-card {
  display: block;
  padding: 0.85rem 0.9rem;
  border: 1px solid #E2E8F0;
  border-radius: 1rem;
  background: #FFFFFF;
  -webkit-tap-highlight-color: transparent;
  cursor: pointer;
}
.el-paper-peek-card:active { background: #F8FAFC; }
.el-paper-peek-top {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.55rem;
}
.el-paper-peek-index {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 2rem;
  height: 2rem;
  padding: 0 0.4rem;
  font-size: 0.7rem;
  font-weight: 800;
  border-radius: 0.65rem;
  background: #DBEAFE;
  color: #0439C4;
}
.el-paper-peek-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}
.el-paper-peek-section {
  font-size: 0.7rem;
  font-weight: 600;
  color: #0439C4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.el-paper-peek-marks {
  flex-shrink: 0;
  font-size: 0.7rem;
  font-weight: 600;
  color: #94A3B8;
}
.el-paper-peek-chevron {
  flex-shrink: 0;
  font-size: 1.25rem;
  line-height: 1;
  color: #94A3B8;
  font-weight: 300;
}
.el-paper-peek-body {
  position: relative;
  max-height: 5.5rem;
  overflow: hidden;
}
/* Color only — do not override font metrics on descendants (breaks MathJax CHTML). */
.el-paper-peek-body .el-render-root {
  color: #64748B;
  font-size: 0.8125rem;
  line-height: 1.4;
  font-weight: 400;
}
.el-paper-peek-body mjx-container,
.el-paper-peek-body mjx-container * { color: #64748B !important; }
.el-paper-peek-body img,
.el-paper-peek-body svg {
  opacity: 0.65;
  max-height: 2.25rem;
  width: auto;
}
.el-paper-peek-fade {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 2.35rem;
  pointer-events: none;
  background: linear-gradient(
    to bottom,
    rgba(255, 255, 255, 0) 0%,
    rgba(255, 255, 255, 0.72) 45%,
    #FFFFFF 100%
  );
}
`;

const PEEK_CSS = `
html, body {
  font-size: 13px !important;
  line-height: 1.4 !important;
  color: #475569 !important;
}
.el-question-header { display: none !important; }
.el-q-section { margin-bottom: 0 !important; }
.el-question-block { margin: 0 !important; padding: 0 !important; }
.el-render-root {
  color: #64748B;
  font-size: 13px;
  font-weight: 400;
}
mjx-container, mjx-container * { color: #64748B !important; }
.el-render-root img, .el-render-root svg {
  opacity: 0.6;
  max-height: 36px;
  width: auto;
}
`;

function hexToRgba(hex: string, alpha: number) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function questionThemeCss(colors: ThemeColors, isDark: boolean): string {
  const fade0 = hexToRgba(colors.surface, 0);
  const fade1 = hexToRgba(colors.surface, 0.72);
  return `
html, body { color: ${colors.ink}; }
.el-muted { color: ${colors.muted}; }
.el-option {
  border-color: ${colors.line};
  background: ${colors.sheetBg};
}
.el-option--selected {
  border-color: ${colors.selectedBorder};
  background: ${colors.selectedBg};
}
.el-option-label {
  background: ${colors.controlOff};
  color: ${colors.muted};
}
.el-btn--locked { background: ${colors.subtle}; }
.el-answer-accordion { background: ${colors.sheetBg}; }
.el-answer-accordion.is-open { background: ${colors.surfaceMuted}; }
.el-answer-accordion__trigger,
.el-answer-accordion__title { color: ${colors.ink}; }
.el-answer-accordion__hint { color: ${colors.muted}; }
.el-answer-accordion--locked { background: ${colors.warningBg}; }
.el-answer-accordion--locked .el-answer-accordion__title,
.el-answer-accordion--locked .el-answer-accordion__hint,
.el-answer-accordion--locked .el-answer-accordion__icon { color: ${colors.warning}; }
.el-answer-accordion__empty {
  color: ${colors.muted};
  background: ${colors.surface};
  border-color: ${colors.line};
}
.el-reveal-heading { color: ${colors.muted}; }
.el-reveal-block {
  background: ${colors.surface};
  border-color: ${colors.line};
}
.el-question-block--part { border-top-color: ${colors.line}; }
.el-question-index,
.el-paper-peek-index {
  background: ${colors.iconBg};
  color: ${isDark ? colors.ink : '#0439C4'};
}
.el-question-meta,
.el-paper-subtitle,
.el-paper-hint { color: ${colors.muted}; }
.el-paper-title { color: ${colors.ink}; }
.el-section-title,
.el-paper-peek-section { color: ${isDark ? colors.ink : '#0439C4'}; }
.el-paper-peek-card {
  border-color: ${colors.line};
  background: ${colors.surface};
}
.el-paper-peek-card:active { background: ${colors.sheetBg}; }
.el-paper-peek-marks,
.el-paper-peek-chevron { color: ${colors.subtle}; }
.el-paper-peek-body .el-render-root { color: ${colors.muted}; }
.el-paper-peek-body mjx-container,
.el-paper-peek-body mjx-container * { color: ${colors.muted} !important; }
.el-paper-peek-fade {
  background: linear-gradient(to bottom, ${fade0} 0%, ${fade1} 45%, ${colors.surface} 100%);
}
`;
}

function peekThemeCss(colors: ThemeColors): string {
  return `
html, body { color: ${colors.muted} !important; }
.el-render-root { color: ${colors.muted}; }
mjx-container, mjx-container * { color: ${colors.muted} !important; }
`;
}

function buildDocument(
  bodyHtml: string,
  chtmlCss: string,
  variant: 'full' | 'peek',
  lite = false,
  themeCss = '',
  peekOverride = '',
): string {
  const isComposed =
    bodyHtml.includes('data-el-question-doc') || bodyHtml.includes('el-question-doc');
  const body = isComposed
    ? bodyHtml
    : `<div class="el-render-root">${bodyHtml || ''}</div>`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
${lite ? '' : `<style>
${chtmlCss}
</style>`}
<style>${BASE_CSS}</style>
${variant === 'peek' ? `<style>${PEEK_CSS}</style>` : ''}
<style>${themeCss}</style>
${variant === 'peek' && peekOverride ? `<style>${peekOverride}</style>` : ''}
</head>
<body>
${body}
</body>
</html>`;
}

export function QuestionHtmlView({
  html,
  minHeight = 80,
  maxHeight,
  interactive = true,
  preview = false,
  variant,
  /** Fill parent and scroll inside the WebView (paper lists). Avoid nesting in ScrollView. */
  fill = false,
  /** Skip MathJax CSS — use for paper peek lists (faster, smaller). */
  lite = false,
  onMessageJson,
}: {
  html: string;
  cssUrl?: string;
  minHeight?: number;
  maxHeight?: number;
  interactive?: boolean;
  /** @deprecated use variant="peek" */
  preview?: boolean;
  variant?: 'full' | 'peek';
  fill?: boolean;
  lite?: boolean;
  onMessageJson?: (msg: {
    t?: string;
    id?: string;
    q?: string;
    dir?: 'left' | 'right' | string;
  }) => void;
}) {
  const { colors, isDark } = useTheme();
  const resolvedVariant = variant || (preview ? 'peek' : 'full');
  const [chtmlCss, setChtmlCss] = useState<string | null>(lite ? '' : null);
  const initialHeight =
    maxHeight != null ? Math.min(minHeight, maxHeight) : minHeight;
  const [height, setHeight] = useState(initialHeight);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (lite) {
      setChtmlCss('');
      return;
    }
    let cancelled = false;
    void loadChtmlCss()
      .then((css) => {
        if (!cancelled) setChtmlCss(css);
      })
      .catch(() => {
        if (!cancelled) setChtmlCss('');
      });
    return () => {
      cancelled = true;
    };
  }, [lite]);

  const assetsBase = useMemo(() => packAssetsRoot(), []);
  const isPaperDoc = Boolean(html?.includes('el-question-doc--paper'));
  const hasEmbeddedDoc = Boolean(
    html?.includes('data-el-question-doc') || html?.includes('el-question-doc'),
  );

  const source = useMemo(() => {
    if (chtmlCss === null) return null;
    return {
      html: buildDocument(
        html,
        chtmlCss,
        resolvedVariant,
        lite,
        questionThemeCss(colors, isDark),
        peekThemeCss(colors),
      ),
      baseUrl: assetsBase || undefined,
    };
  }, [html, chtmlCss, resolvedVariant, assetsBase, lite, colors, isDark]);

  const onMessage = useCallback(
    (event: { nativeEvent: { data: string } }) => {
      const data = event.nativeEvent.data;
      if (data.startsWith('{')) {
        try {
          const msg = JSON.parse(data) as {
            t?: string;
            id?: string;
            q?: string;
            dir?: string;
          };
          onMessageJson?.(msg);
        } catch {
          /* ignore */
        }
        return;
      }
      if (fill) return;
      const h = Number(data);
      if (!Number.isFinite(h) || h <= 0) return;
      const next = Math.max(minHeight, Math.ceil(h) + 2);
      setHeight(maxHeight != null ? Math.min(next, maxHeight) : next);
    },
    [minHeight, maxHeight, onMessageJson, fill],
  );

  useEffect(() => {
    setLoading(true);
    if (!fill) {
      setHeight(maxHeight != null ? Math.min(minHeight, maxHeight) : minHeight);
    }
    // Never leave the overlay up forever if onLoadEnd is skipped (large docs / Android).
    const t = setTimeout(() => setLoading(false), fill || lite ? 400 : 2500);
    return () => clearTimeout(t);
  }, [html, minHeight, maxHeight, fill, lite]);

  const injectedJavaScript = useMemo(() => {
    if (isPaperDoc) {
      return `${PAPER_OPEN_INJECT}true;`;
    }
    return INJECTED_HEIGHT_JS;
  }, [isPaperDoc]);

  if (!html?.trim()) {
    return (
      <View className="rounded-md border border-line bg-surface-muted p-3">
        <Text className="text-sm text-muted">No rendered HTML for this question.</Text>
      </View>
    );
  }

  if (!source) {
    return (
      <View
        className="items-center justify-center py-6"
        style={{ minHeight: fill ? undefined : minHeight, flex: fill ? 1 : undefined }}
      >
        <ActivityIndicator color={BRAND_BLUE} />
      </View>
    );
  }

  return (
    <View
        style={
          fill
            ? { flex: 1, position: 'relative' }
            : {
              // Use fixed height (not only minHeight) so collapse can shrink the outer card.
              height: maxHeight != null ? Math.min(height, maxHeight) : height,
              maxHeight,
              overflow: 'hidden',
              position: 'relative',
            }
        }
      pointerEvents={interactive ? 'auto' : 'none'}
    >
      {loading && !fill ? (
        <View className="absolute inset-0 z-10 items-center justify-center">
          <ActivityIndicator color={BRAND_BLUE} />
        </View>
      ) : null}
      <WebView
        originWhitelist={['*']}
        source={source}
        style={
          fill
            ? { flex: 1, backgroundColor: 'transparent' }
            : {
                height,
                backgroundColor: 'transparent',
                opacity: loading ? 0 : 1,
              }
        }
        scrollEnabled={fill}
        nestedScrollEnabled={fill}
        showsVerticalScrollIndicator={fill}
        javaScriptEnabled
        domStorageEnabled
        allowFileAccess
        allowFileAccessFromFileURLs
        allowingReadAccessToURL={
          Platform.OS === 'ios' && assetsBase ? assetsBase : undefined
        }
        mixedContentMode="always"
        pointerEvents={interactive ? 'auto' : 'none'}
        onLoadEnd={() => setLoading(false)}
        onError={() => setLoading(false)}
        onMessage={onMessage}
        injectedJavaScript={injectedJavaScript}
        setSupportMultipleWindows={false}
      />
    </View>
  );
}
