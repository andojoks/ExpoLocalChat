import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { loadChtmlCss } from '@/lib/assets/loadBundledStyleText';

const INJECTED_HEIGHT_JS = `
(function () {
  var lastH = 0;
  function postHeight() {
    var h = Math.max(
      document.body.scrollHeight || 0,
      document.documentElement.scrollHeight || 0,
      document.body.offsetHeight || 0
    );
    if (window.ReactNativeWebView && h > 0 && h !== lastH) {
      lastH = h;
      window.ReactNativeWebView.postMessage(String(h));
    }
  }
  postHeight();
  new MutationObserver(postHeight).observe(document.body, {
    childList: true, subtree: true, attributes: true,
  });
  if (window.ResizeObserver) new ResizeObserver(postHeight).observe(document.body);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(postHeight);
})();
true;
`;

const BASE_CSS = `
* { box-sizing: border-box; }
html, body {
  margin: 0 !important;
  padding: 0 !important;
  width: 100%;
  background-color: transparent !important;
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 16px;
  line-height: 1.5;
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
`;

function buildDocument(bodyHtml: string, chtmlCss: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<style>
${chtmlCss}
</style>
<style>${BASE_CSS}</style>
</head>
<body>
<div class="el-render-root">${bodyHtml || ''}</div>
</body>
</html>`;
}

export function QuestionHtmlView({
  html,
  minHeight = 80,
}: {
  html: string;
  /** @deprecated CHTML is loaded from the bundled MathJax asset */
  cssUrl?: string;
  minHeight?: number;
}) {
  const [chtmlCss, setChtmlCss] = useState<string | null>(null);
  const [height, setHeight] = useState(minHeight);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
  }, []);

  const source = useMemo(() => {
    if (chtmlCss === null) return null;
    return { html: buildDocument(html, chtmlCss) };
  }, [html, chtmlCss]);

  const onMessage = useCallback(
    (event: { nativeEvent: { data: string } }) => {
      const h = Number(event.nativeEvent.data);
      if (Number.isFinite(h) && h > 0) setHeight(Math.max(minHeight, Math.ceil(h) + 8));
    },
    [minHeight],
  );

  useEffect(() => {
    setLoading(true);
    setHeight(minHeight);
  }, [html, minHeight]);

  if (!html?.trim()) {
    return (
      <View className="rounded-md border border-slate-200 bg-slate-50 p-3">
        <Text className="text-sm text-slate-500">No rendered HTML for this question.</Text>
      </View>
    );
  }

  if (!source) {
    return (
      <View className="items-center justify-center py-6" style={{ minHeight }}>
        <ActivityIndicator color="#2563EB" />
      </View>
    );
  }

  return (
    <View style={{ minHeight: height, position: 'relative' }}>
      {loading ? (
        <View className="absolute inset-0 z-10 items-center justify-center">
          <ActivityIndicator color="#2563EB" />
        </View>
      ) : null}
      <WebView
        originWhitelist={['*']}
        source={source}
        style={{ height, backgroundColor: 'transparent', opacity: loading ? 0 : 1 }}
        scrollEnabled={false}
        nestedScrollEnabled={false}
        showsVerticalScrollIndicator={false}
        javaScriptEnabled
        domStorageEnabled
        allowFileAccess
        allowFileAccessFromFileURLs
        allowingReadAccessToURL={Platform.OS === 'ios' ? undefined : undefined}
        mixedContentMode="always"
        onLoadEnd={() => setLoading(false)}
        onMessage={onMessage}
        injectedJavaScript={INJECTED_HEIGHT_JS}
      />
    </View>
  );
}
