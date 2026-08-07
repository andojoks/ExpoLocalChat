import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { QuestionHtmlView } from '@/study/question-html-view';
import { ensureLocalHtml } from '@/study/ensure-local-html';
import { RichMarkdown } from '@/components/rich-markdown';

/** Prefer rendered HTML (with local assets); fall back to markdown. */
export function StudyContent({
  html,
  markdown,
}: {
  html?: string | null;
  markdown?: string | null;
}) {
  const [resolved, setResolved] = useState<string | null>(null);
  const [busy, setBusy] = useState(Boolean(html?.trim()));

  useEffect(() => {
    let cancelled = false;
    if (!html?.trim()) {
      setResolved(null);
      setBusy(false);
      return;
    }
    setBusy(true);
    void ensureLocalHtml(html).then((out) => {
      if (!cancelled) {
        setResolved(out);
        setBusy(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [html]);

  if (busy) {
    return (
      <View className="items-center py-4">
        <ActivityIndicator color="#2563EB" />
      </View>
    );
  }

  if (resolved?.trim()) {
    return <QuestionHtmlView html={resolved} />;
  }

  if (markdown?.trim()) {
    return <RichMarkdown>{markdown}</RichMarkdown>;
  }

  return null;
}
