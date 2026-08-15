import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * A Coach tool passes through three separate places: the JSON schema shown to the model,
 * a zod schema that validates what comes back, and a handler that runs it. Declaring a
 * tool without the middle one is silent at build time and only shows up as the model
 * saying it cannot do the thing, because validateToolArguments throws before the handler
 * is reached. That is exactly how log_food and get_gym_comparison shipped broken.
 */
const source = readFileSync('supabase/functions/ai-coach/tools.ts', 'utf8');

const declared = [...source.matchAll(/name: '(\w+)', strict/g)].map((match) => match[1]);
const validated = [...(source.split('toolInputSchemas')[1] ?? '').matchAll(/^ {2}(\w+):/gm)]
  .map((match) => match[1]);
const handled = [...source.matchAll(/case '(\w+)'/g)].map((match) => match[1]);

describe('coach tool wiring', () => {
  it('declares at least the tools the app relies on', () => {
    expect(declared.length).toBeGreaterThanOrEqual(21);
  });

  it('validates every tool it declares', () => {
    const missing = declared.filter((name) => !validated.includes(name));
    expect(missing, `declared without a zod schema: ${missing.join(', ')}`).toEqual([]);
  });

  it('handles every tool it declares', () => {
    const missing = declared.filter((name) => !handled.includes(name));
    expect(missing, `declared without a handler: ${missing.join(', ')}`).toEqual([]);
  });

  it('declares every tool it validates, so no schema is orphaned', () => {
    const orphaned = validated.filter((name) => !declared.includes(name));
    expect(orphaned, `validated but never offered: ${orphaned.join(', ')}`).toEqual([]);
  });

  it('can log food, not only read it', () => {
    for (const tool of ['log_food', 'log_saved_food', 'log_recipe']) {
      expect(declared, `${tool} must be offered`).toContain(tool);
      expect(validated, `${tool} must validate`).toContain(tool);
      expect(handled, `${tool} must have a handler`).toContain(tool);
    }
  });
});
