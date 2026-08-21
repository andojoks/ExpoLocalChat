import { memo, useMemo } from 'react';
import { Platform, View } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { normalizeLatexDelimiters } from '@/study/normalize-latex-delimiters';
import { useTheme } from '@/theme/ThemeProvider';
import { BRAND_BLUE } from '@/theme/brand';

const INK_ON_FOREST = '#FFFFFF';

const webTextSharp =
  Platform.OS === 'web'
    ? ({ WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale' } as const)
    : null;

export const RichMarkdown = memo(
  function RichMarkdown({
    children,
    inverted = false,
  }: {
    children: string;
    inverted?: boolean;
  }) {
    const { colors } = useTheme();
    const color = inverted ? INK_ON_FOREST : colors.ink;
    const accent = inverted ? '#D8FFE8' : BRAND_BLUE;
    const style = useMemo(
      () => ({
        body: {
          color,
          fontSize: 15,
          lineHeight: 23,
          flexShrink: 1 as const,
          ...webTextSharp,
        },
        heading1: {
          color,
          fontSize: 20,
          fontWeight: '700' as const,
          marginTop: 4,
          marginBottom: 8,
          lineHeight: 26,
        },
        heading2: {
          color,
          fontSize: 18,
          fontWeight: '700' as const,
          marginTop: 6,
          marginBottom: 6,
          lineHeight: 24,
        },
        heading3: {
          color: inverted ? INK_ON_FOREST : BRAND_BLUE,
          fontSize: 16,
          fontWeight: '700' as const,
          marginTop: 8,
          marginBottom: 4,
          lineHeight: 22,
        },
        heading4: {
          color,
          fontSize: 15,
          fontWeight: '700' as const,
          marginTop: 6,
          marginBottom: 2,
        },
        strong: { fontWeight: '700' as const, color },
        em: { fontStyle: 'italic' as const, color },
        link: { color: accent, textDecorationLine: 'underline' as const },
        bullet_list: { marginTop: 4, marginBottom: 8 },
        ordered_list: { marginTop: 4, marginBottom: 8 },
        list_item: {
          color,
          flexDirection: 'row' as const,
          alignItems: 'flex-start' as const,
          marginVertical: 3,
        },
        bullet_list_icon: {
          color,
          marginLeft: 0,
          marginRight: 8,
          fontSize: 15,
          lineHeight: 23,
        },
        ordered_list_icon: {
          color,
          marginLeft: 0,
          marginRight: 8,
          fontSize: 15,
          lineHeight: 23,
        },
        bullet_list_content: { flex: 1, flexShrink: 1 },
        ordered_list_content: { flex: 1, flexShrink: 1 },
        paragraph: {
          marginTop: 0,
          marginBottom: 8,
          color,
          flexShrink: 1,
        },
        text: { color },
        textgroup: { color },
        hardbreak: { height: 8 },
        softbreak: { width: 0, height: 0 },
        code_inline: {
          fontFamily: Platform.select({
            ios: 'Menlo',
            android: 'monospace',
            default: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          }),
          color: inverted ? '#FFF4D8' : BRAND_BLUE,
          backgroundColor: inverted ? 'rgba(255,255,255,0.14)' : colors.iconBg,
          borderRadius: 5,
          paddingHorizontal: 4,
          fontSize: 13,
        },
        fence: {
          backgroundColor: inverted ? 'rgba(255,255,255,0.12)' : colors.surfaceMuted,
          color,
          padding: 10,
          borderRadius: 10,
          marginVertical: 6,
          fontSize: 13,
        },
        code_block: {
          backgroundColor: inverted ? 'rgba(255,255,255,0.12)' : colors.surfaceMuted,
          color,
          padding: 10,
          borderRadius: 10,
          fontSize: 13,
        },
        blockquote: {
          backgroundColor: inverted ? 'rgba(255,255,255,0.08)' : colors.sheetBg,
          borderLeftColor: BRAND_BLUE,
          borderLeftWidth: 3,
          paddingHorizontal: 10,
          paddingVertical: 6,
          marginVertical: 6,
        },
        hr: {
          backgroundColor: inverted ? 'rgba(255,255,255,0.25)' : colors.line,
          height: 1,
          marginVertical: 10,
        },
      }),
      [color, inverted, accent, colors],
    );
    const text = useMemo(() => normalizeChatMarkdown(String(children || '')), [children]);
    return (
      <View style={{ flexShrink: 1, maxWidth: '100%' }}>
        <Markdown style={style}>{text}</Markdown>
      </View>
    );
  },
);

/** Keep tutor replies parseable: latex → plain, ensure blank lines before headings. */
function normalizeChatMarkdown(raw: string): string {
  return normalizeLatexDelimiters(raw)
    .replace(/\$\$([\s\S]+?)\$\$/g, '`$1`')
    .replace(/\$([^$\n]+)\$/g, '`$1`')
    .replace(/\\text\{([^}]+)\}/g, '$1')
    .replace(/\\mathrm\{([^}]+)\}/g, '$1')
    .replace(/([^\n])\n(#{1,3}\s)/g, '$1\n\n$2')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
