import { pgTable, text, serial, integer, doublePrecision, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// === TABLE DEFINITIONS ===
// A result now mirrors what the physical reader emits over serial:
//   RESULT:<value>:<units>   e.g. RESULT:12.34:mg/dL
// `level` / `interpretation` are derived from the numeric value (SAA2 banding).
export const results = pgTable("results", {
  id: serial("id").primaryKey(),
  nurseId: text("nurse_id").notNull(),
  patientId: text("patient_id").notNull(),
  value: doublePrecision("value").notNull(),
  units: text("units").notNull().default("mg/L"),
  level: text("level").notNull(),
  interpretation: text("interpretation").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  // Set when the nurse taps "Push to Health Record". This is the hook point
  // for a real EHR/FHIR integration later — for now it marks the record (and
  // its voice notes) as committed to the health record.
  pushedToRecordAt: timestamp("pushed_to_record_at"),
});

// Short nurse-recorded audio observations attached to a result. Audio is
// stored inline as base64 (clips are capped at ~2 min of Opus, well under
// 1 MB) so everything lives in the one Postgres database.
export const voiceNotes = pgTable("voice_notes", {
  id: serial("id").primaryKey(),
  resultId: integer("result_id")
    .notNull()
    .references(() => results.id, { onDelete: "cascade" }),
  mimeType: text("mime_type").notNull(),
  durationSec: integer("duration_sec").notNull().default(0),
  audioBase64: text("audio_base64").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// === BASE SCHEMAS ===
export const insertResultSchema = createInsertSchema(results).omit({
  id: true,
  createdAt: true,
  pushedToRecordAt: true,
});
export const insertVoiceNoteSchema = createInsertSchema(voiceNotes).omit({ id: true, createdAt: true });

// === EXPLICIT API CONTRACT TYPES ===
export type Result = typeof results.$inferSelect;
export type InsertResult = z.infer<typeof insertResultSchema>;
export type VoiceNote = typeof voiceNotes.$inferSelect;
export type InsertVoiceNote = z.infer<typeof insertVoiceNoteSchema>;
// Listing/creation responses never echo the (large) base64 payload back.
export type VoiceNoteMeta = Omit<VoiceNote, "audioBase64">;

export type CreateResultRequest = InsertResult;
export type ResultResponse = Result;
