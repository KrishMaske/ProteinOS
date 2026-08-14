import { describe, expect, it } from 'vitest';

import { parseCoachInline, parseCoachText } from './coach-rich-text';

describe('Coach rich text', () => {
  it('separates headings, paragraphs, and consecutive lists', () => {
    expect(parseCoachText('# Training\nStart here.\n\n- Press\n- Row\n\n1. Warm up\n2. Work')).toEqual([
      { type: 'heading', level: 1, text: 'Training' },
      { type: 'paragraph', text: 'Start here.' },
      { type: 'list', ordered: false, items: ['Press', 'Row'] },
      { type: 'list', ordered: true, items: ['Warm up', 'Work'] },
    ]);
  });

  it('renders markdown-like emphasis as text segments rather than HTML', () => {
    expect(parseCoachInline('Use **controlled reps** and *stop with pain*.')).toEqual([
      { text: 'Use ', bold: false, italic: false },
      { text: 'controlled reps', bold: true, italic: false },
      { text: ' and ', bold: false, italic: false },
      { text: 'stop with pain', bold: false, italic: true },
      { text: '.', bold: false, italic: false },
    ]);
  });

  it('does not interpret tags or links as executable content', () => {
    expect(parseCoachText('<script>alert(1)</script> [link](https://example.com)')).toEqual([
      { type: 'paragraph', text: '<script>alert(1)</script> [link](https://example.com)' },
    ]);
  });
});
