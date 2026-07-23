import { db } from "./db";
import { eq } from "drizzle-orm";
import {
  results,
  voiceNotes,
  type InsertResult,
  type Result,
  type InsertVoiceNote,
  type VoiceNote,
  type VoiceNoteMeta
} from "@shared/schema";

export interface IStorage {
  createResult(result: InsertResult): Promise<Result>;
  getResults(): Promise<Result[]>;
  getResult(id: number): Promise<Result | undefined>;
  markResultPushed(id: number): Promise<Result | undefined>;
  createVoiceNote(note: InsertVoiceNote): Promise<VoiceNote>;
  getVoiceNotesForResult(resultId: number): Promise<VoiceNoteMeta[]>;
  getVoiceNote(id: number): Promise<VoiceNote | undefined>;
}

export class DatabaseStorage implements IStorage {
  async createResult(insertResult: InsertResult): Promise<Result> {
    const [result] = await db.insert(results).values(insertResult).returning();
    return result;
  }

  async getResults(): Promise<Result[]> {
    return await db.select().from(results);
  }

  async getResult(id: number): Promise<Result | undefined> {
    const [result] = await db.select().from(results).where(eq(results.id, id));
    return result;
  }

  async markResultPushed(id: number): Promise<Result | undefined> {
    const [result] = await db
      .update(results)
      .set({ pushedToRecordAt: new Date() })
      .where(eq(results.id, id))
      .returning();
    return result;
  }

  async createVoiceNote(note: InsertVoiceNote): Promise<VoiceNote> {
    const [created] = await db.insert(voiceNotes).values(note).returning();
    return created;
  }

  // Meta only — deliberately excludes the base64 payload so list responses
  // stay small. Fetch audio for a single note via getVoiceNote().
  async getVoiceNotesForResult(resultId: number): Promise<VoiceNoteMeta[]> {
    return await db
      .select({
        id: voiceNotes.id,
        resultId: voiceNotes.resultId,
        mimeType: voiceNotes.mimeType,
        durationSec: voiceNotes.durationSec,
        createdAt: voiceNotes.createdAt,
      })
      .from(voiceNotes)
      .where(eq(voiceNotes.resultId, resultId))
      .orderBy(voiceNotes.createdAt);
  }

  async getVoiceNote(id: number): Promise<VoiceNote | undefined> {
    const [note] = await db.select().from(voiceNotes).where(eq(voiceNotes.id, id));
    return note;
  }
}

export const storage = new DatabaseStorage();
