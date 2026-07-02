import { defineCollection, z } from 'astro:content';

const insights = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    date: z.date(),
    tag: z.string(),
    summary: z.string(),
  }),
});

export const collections = { insights };
