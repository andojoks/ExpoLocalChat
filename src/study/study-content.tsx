import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { QuestionHtmlView } from '@/study/question-html-view';
import { ensureLocalHtml } from '@/study/ensure-local-html';
import { RichMarkdown } from '@/components/rich-markdown';
import {
  hasLatexDelimiters,
  normalizeLatexDelimiters,
} from '@/study/normalize-latex-delimiters';
import { markdownToMathHtml } from '@/study/markdown-to-math-html';

/** Prefer rendered HTML (with local assets); fall back to markdown (with TeX). */
export function StudyContent({
  html,
  markdown,
  previewMaxHeight,
}: {
  html?: string | null;
  markdown?: string | null;
  /** Clamp height for list-row previews (LaTeX/HTML still renders). */
  previewMaxHeight?: number;
}) {
  const preview = previewMaxHeight != null;
  const [resolved, setResolved] = useState<string | null>(null);
  const [busy, setBusy] = useState(Boolean(html?.trim()));

  const mdNormalized = useMemo(
    () => (markdown?.trim() ? normalizeLatexDelimiters(markdown) : ''),
    [markdown],
  );

  /** Server HTML that still contains raw TeX delimiters is treated as stale. */
  const htmlLooksRaw = useMemo(() => {
    const h = html?.trim() || '';
    if (!h) return false;
    return (
      hasLatexDelimiters(h) ||
      /(?:^|>)\[\\(?:text|frac|mathrm|begin)/.test(h) ||
      /\[\\text\{/.test(h)
    );
  }, [html]);

  const effectiveHtml = htmlLooksRaw ? '' : html;

  useEffect(() => {
    let cancelled = false;
    if (!effectiveHtml?.trim()) {
      // Client-side TeX when pack HTML is missing or still raw delimiters
      if (mdNormalized && hasLatexDelimiters(mdNormalized)) {
        setResolved(markdownToMathHtml(mdNormalized));
        setBusy(false);
        return;
      }
      setResolved(null);
      setBusy(false);
      return;
    }
    setBusy(true);
    void ensureLocalHtml(effectiveHtml).then((out) => {
      if (!cancelled) {
        setResolved(out);
        setBusy(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [effectiveHtml, mdNormalized]);

  if (busy) {
    return (
      <View
        className="items-center justify-center"
        style={{ height: preview ? previewMaxHeight : undefined, paddingVertical: preview ? 0 : 16 }}
      >
        <ActivityIndicator color="#2563EB" />
      </View>
    );
  }

  if (resolved?.trim()) {
    return (
      <QuestionHtmlView
        html={resolved}
        minHeight={preview ? Math.min(36, previewMaxHeight) : 80}
        maxHeight={previewMaxHeight}
        interactive={!preview}
        preview={preview}
      />
    );
  }

  if (mdNormalized) {
    if (preview) {
      return (
        <Text
          numberOfLines={2}
          ellipsizeMode="tail"
          className="text-[11px] leading-[15px] text-slate-400"
        >
          {mdNormalized.replace(/\s+/g, ' ').trim()}
        </Text>
      );
    }
    return <RichMarkdown>{mdNormalized}</RichMarkdown>;
  }

  return null;
}
