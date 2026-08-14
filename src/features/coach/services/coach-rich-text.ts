export type CoachTextBlock =
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; ordered: boolean; items: string[] };

export type CoachInlineSegment = { bold: boolean; italic: boolean; text: string };

const headingPattern = /^(#{1,3})\s+(.+)$/;
const bulletPattern = /^[-*+]\s+(.+)$/;
const orderedPattern = /^\d+[.)]\s+(.+)$/;

export function parseCoachText(value: string): CoachTextBlock[] {
  const lines = value.replace(/\r\n?/g, '\n').split('\n');
  const blocks: CoachTextBlock[] = [];
  let paragraph: string[] = [];
  let list: Extract<CoachTextBlock, { type: 'list' }> | null = null;

  function flushParagraph() {
    if (!paragraph.length) return;
    blocks.push({ type: 'paragraph', text: paragraph.join(' ').trim() });
    paragraph = [];
  }

  function flushList() {
    if (!list) return;
    blocks.push(list);
    list = null;
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = line.match(headingPattern);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ type: 'heading', level: heading[1].length as 1 | 2 | 3, text: heading[2].trim() });
      continue;
    }

    const orderedItem = line.match(orderedPattern);
    const bulletItem = line.match(bulletPattern);
    if (orderedItem || bulletItem) {
      flushParagraph();
      const ordered = Boolean(orderedItem);
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { type: 'list', ordered, items: [] };
      }
      list.items.push((orderedItem?.[1] ?? bulletItem?.[1] ?? '').trim());
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  flushParagraph();
  flushList();
  return blocks;
}

export function parseCoachInline(value: string): CoachInlineSegment[] {
  const segments: CoachInlineSegment[] = [];
  const pattern = /(\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|_[^_\n]+_)/g;
  let cursor = 0;

  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) segments.push({ text: value.slice(cursor, index), bold: false, italic: false });
    const token = match[0];
    const bold = token.startsWith('**') || token.startsWith('__');
    const markerLength = bold ? 2 : 1;
    segments.push({ text: token.slice(markerLength, -markerLength), bold, italic: !bold });
    cursor = index + token.length;
  }

  if (cursor < value.length) segments.push({ text: value.slice(cursor), bold: false, italic: false });
  return segments.length ? segments : [{ text: value, bold: false, italic: false }];
}
