import type { TutorTurn } from './chat-model';

const ROLE_MARKERS = ['<|im_start|>assistant', '<|assistant|>', 'assistant:', 'assistant\n'];

export function cleanGeneratedText(raw: string, turns: TutorTurn[] = []) {
  let text = (raw || '').replace(/\u0000/g, '').replace(/\r\n/g, '\n');
  const lastAssistantMarker = findLastMarker(text);
  if (lastAssistantMarker >= 0) text = text.slice(lastAssistantMarker);
  for (const turn of turns) {
    if (turn.role === 'system' && turn.content && text.includes(turn.content))
      text = text.replace(turn.content, '');
  }
  text = text
    .replace(/<\|im_start\|>(system|user|assistant)\n?/gi, '')
    .replace(/<\|im_end\|>|<\|endoftext\|>|<s>|<\/s>/gi, '')
    .replace(/^\s*(system|user|assistant)\s*:\s*/gim, '')
    .trim();
  if (isPromptLeak(text)) return '';
  return text;
}

export function cleanTokenDelta(raw: string, lastClean: string, turns: TutorTurn[] = []) {
  const clean = cleanGeneratedText(raw, turns);
  if (!clean || clean === lastClean) return { clean, delta: '' };
  if (clean.startsWith(lastClean)) return { clean, delta: clean.slice(lastClean.length) };
  return { clean, delta: '' };
}

function findLastMarker(text: string) {
  let best = -1,
    bestLength = 0;
  for (const marker of ROLE_MARKERS) {
    const index = text.toLowerCase().lastIndexOf(marker.toLowerCase());
    if (index >= best) {
      best = index;
      bestLength = marker.length;
    }
  }
  return best < 0 ? -1 : best + bestLength;
}

function isPromptLeak(text: string) {
  return (
    /^you are (questionbank tutor|a question bank tutor|the private tool-routing model|question bank tutor)/i.test(
      text,
    ) ||
    /^available tools:/i.test(text) ||
    /^conversation state:/i.test(text) ||
    /^student message:/i.test(text)
  );
}
