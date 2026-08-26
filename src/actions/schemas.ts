import { z } from 'zod';

export const pageReferenceSchema = z.discriminatedUnion('by', [
  z.object({ by: z.literal('id'), value: z.string() }),
  z.object({ by: z.literal('alias'), value: z.string() }),
  z.object({ by: z.literal('active') }),
  z.object({ by: z.literal('main') }),
  z.object({ by: z.literal('latest') }),
  z.object({ by: z.literal('opener-of'), value: z.string() }),
]);

export const targetSchema = z.discriminatedUnion('by', [
  z.object({
    by: z.literal('element-id'),
    value: z.string(),
    observationId: z.string(),
  }),
  z.object({
    by: z.literal('role'),
    role: z.enum([
      'button',
      'link',
      'textbox',
      'checkbox',
      'radio',
      'combobox',
      'option',
      'menuitem',
      'tab',
    ]),
    name: z.string().optional(),
    exact: z.boolean().optional(),
  }),
  z.object({
    by: z.literal('label'),
    value: z.string(),
    exact: z.boolean().optional(),
  }),
  z.object({
    by: z.literal('text'),
    value: z.string(),
    exact: z.boolean().optional(),
  }),
  z.object({
    by: z.literal('test-id'),
    value: z.string(),
  }),
  z.object({
    by: z.literal('css'),
    value: z.string(),
  }),
  z.object({
    by: z.literal('point'),
    x: z.number(),
    y: z.number(),
  }),
]);

export const verificationConditionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('url'),
    matches: z.string(),
    timeoutMs: z.number().optional(),
  }),
  z.object({
    type: z.literal('title'),
    matches: z.string(),
    timeoutMs: z.number().optional(),
  }),
  z.object({
    type: z.literal('element-visible'),
    target: targetSchema,
    timeoutMs: z.number().optional(),
  }),
  z.object({
    type: z.literal('element-hidden'),
    target: targetSchema,
    timeoutMs: z.number().optional(),
  }),
  z.object({
    type: z.literal('text-present'),
    text: z.string(),
    timeoutMs: z.number().optional(),
  }),
]);

const expectedPageSchema = z.object({
  event: z.literal('popup'),
  alias: z.string().optional(),
  urlMatches: z.string().optional(),
  titleMatches: z.string().optional(),
  timeoutMs: z.number().optional(),
  activate: z.boolean().optional(),
});

const baseActionSchema = z.object({
  id: z.string().optional(),
  page: pageReferenceSchema.optional(),
  timeoutMs: z.number().optional(),
  verify: z.array(verificationConditionSchema).optional(),
  onFailure: z.enum(['stop', 'continue']).optional(),
});

export const clickActionSchema = baseActionSchema.extend({
  type: z.literal('click'),
  target: targetSchema,
  button: z.literal('left').optional(),
  count: z.union([z.literal(1), z.literal(2)]).optional(),
  expect: z
    .object({
      page: expectedPageSchema.optional(),
    })
    .optional(),
  waitAfter: z
    .union([
      z.enum(['load', 'domcontentloaded', 'networkidle0', 'networkidle2']),
      z.number(),
    ])
    .optional(),
});

export const fillActionSchema = baseActionSchema.extend({
  type: z.literal('fill'),
  target: targetSchema,
  value: z.string(),
  clear: z.boolean().optional(),
  sensitive: z.boolean().optional(),
});

export const pressActionSchema = baseActionSchema.extend({
  type: z.literal('press'),
  target: targetSchema.optional(),
  key: z.enum([
    'Enter',
    'Tab',
    'Escape',
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'Backspace',
    'Delete',
  ]),
});

export const selectActionSchema = baseActionSchema.extend({
  type: z.literal('select'),
  target: targetSchema,
  values: z.array(z.string()),
});

export const scrollActionSchema = baseActionSchema.extend({
  type: z.literal('scroll'),
  target: targetSchema.optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  deltaX: z.number().optional(),
  deltaY: z.number().optional(),
  behavior: z.enum(['auto', 'smooth']).optional(),
});

export const waitActionSchema = baseActionSchema.extend({
  type: z.literal('wait'),
  durationMs: z.number().optional(),
  ms: z.number().optional(),
  selector: targetSchema.optional(),
  state: z.enum(['attached', 'detached', 'visible', 'hidden']).optional(),
});

export const screenshotActionSchema = baseActionSchema.extend({
  type: z.literal('screenshot'),
  fullPage: z.boolean().optional(),
  format: z.enum(['png', 'jpeg', 'webp']).optional(),
});

export const pageActivateActionSchema = baseActionSchema.extend({
  type: z.literal('page.activate'),
  targetPage: pageReferenceSchema,
});

export const pageCloseActionSchema = baseActionSchema.extend({
  type: z.literal('page.close'),
  targetPage: pageReferenceSchema.optional(),
});

export const pageWaitActionSchema = baseActionSchema.extend({
  type: z.literal('page.wait'),
  condition: z.discriminatedUnion('type', [
    z.object({
      type: z.literal('created'),
      urlMatches: z.string().optional(),
      titleMatches: z.string().optional(),
    }),
    z.object({
      type: z.literal('closed'),
      page: pageReferenceSchema,
    }),
    z.object({
      type: z.literal('url'),
      page: pageReferenceSchema,
      matches: z.string(),
    }),
  ]),
});

export const actionSchema = z.discriminatedUnion('type', [
  clickActionSchema,
  fillActionSchema,
  pressActionSchema,
  selectActionSchema,
  scrollActionSchema,
  waitActionSchema,
  screenshotActionSchema,
  pageActivateActionSchema,
  pageCloseActionSchema,
  pageWaitActionSchema,
]);

export const actRequestSchema = z.object({
  observationId: z.string().optional(),
  defaultPage: pageReferenceSchema.optional(),
  actions: z.array(actionSchema),
});
