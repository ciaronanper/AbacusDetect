import { db } from "./db";
import {
  results,
  type InsertResult,
  type Result
} from "@shared/schema";

export interface IStorage {
  createResult(result: InsertResult): Promise<Result>;
  getResults(): Promise<Result[]>;
}

export class DatabaseStorage implements IStorage {
  async createResult(insertResult: InsertResult): Promise<Result> {
    const [result] = await db.insert(results).values(insertResult).returning();
    return result;
  }

  async getResults(): Promise<Result[]> {
    return await db.select().from(results);
  }
}

export const storage = new DatabaseStorage();
