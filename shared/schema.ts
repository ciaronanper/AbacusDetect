import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// === TABLE DEFINITIONS ===
export const results = pgTable("results", {
  id: serial("id").primaryKey(),
  nurseId: text("nurse_id").notNull(),
  patientId: text("patient_id").notNull(),
  saa2Value: integer("saa2_value").notNull(),
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
