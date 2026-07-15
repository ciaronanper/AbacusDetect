import { pgTable, text, serial, doublePrecision, timestamp } from "drizzle-orm/pg-core";
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
});

// === BASE SCHEMAS ===
export const insertResultSchema = createInsertSchema(results).omit({ id: true, createdAt: true });

// === EXPLICIT API CONTRACT TYPES ===
export type Result = typeof results.$inferSelect;
export type InsertResult = z.infer<typeof insertResultSchema>;

export type CreateResultRequest = InsertResult;
export type ResultResponse = Result;
