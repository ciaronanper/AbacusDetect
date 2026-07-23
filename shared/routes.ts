import { z } from 'zod';
import { insertResultSchema, results, type VoiceNoteMeta } from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  results: {
    create: {
      method: 'POST' as const,
      path: '/api/results',
      input: insertResultSchema,
      responses: {
        201: z.custom<typeof results.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    list: {
      method: 'GET' as const,
      path: '/api/results',
      responses: {
        200: z.array(z.custom<typeof results.$inferSelect>()),
      },
    },
    // Marks a stored result as pushed to the health record (sets
    // pushedToRecordAt). A real EHR/FHIR hand-off would be triggered here.
    push: {
      method: 'POST' as const,
      path: '/api/results/:id/push',
      responses: {
        200: z.custom<typeof results.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
  },
  voiceNotes: {
    // resultId comes from the URL; the body carries the recording itself.
    create: {
      method: 'POST' as const,
      path: '/api/results/:id/voice-notes',
      input: z.object({
        mimeType: z.string().min(1),
        durationSec: z.number().int().min(0).max(600),
        // ~2 min of Opus is <1 MB of base64; 15 MB is a generous hard cap.
        audioBase64: z.string().min(1).max(15_000_000),
      }),
      responses: {
        201: z.custom<VoiceNoteMeta>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    list: {
      method: 'GET' as const,
      path: '/api/results/:id/voice-notes',
      responses: {
        200: z.array(z.custom<VoiceNoteMeta>()),
        404: errorSchemas.notFound,
      },
    },
    // Streams the raw audio bytes with the stored content type.
    audio: {
      method: 'GET' as const,
      path: '/api/voice-notes/:id/audio',
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}

export type CreateResultInput = z.infer<typeof api.results.create.input>;
export type ResultResponse = z.infer<typeof api.results.create.responses[201]>;
export type CreateVoiceNoteInput = z.infer<typeof api.voiceNotes.create.input>;
