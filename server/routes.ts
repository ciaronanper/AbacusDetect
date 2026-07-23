import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  app.post(api.results.create.path, async (req, res) => {
    try {
      const input = api.results.create.input.parse(req.body);
      const result = await storage.createResult(input);
      res.status(201).json(result);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.get(api.results.list.path, async (req, res) => {
    const results = await storage.getResults();
    res.json(results);
  });

  // --- Push to health record --------------------------------------------
  // Stamps pushedToRecordAt on the stored result. If a real EHR/FHIR
  // integration is added later, the outbound call belongs here, before the
  // stamp is written.
  app.post(api.results.push.path, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: "Invalid result id" });
    }
    const updated = await storage.markResultPushed(id);
    if (!updated) {
      return res.status(404).json({ message: "Result not found" });
    }
    res.json(updated);
  });

  // --- Voice notes ---------------------------------------------------------
  app.post(api.voiceNotes.create.path, async (req, res) => {
    try {
      const resultId = Number(req.params.id);
      if (!Number.isInteger(resultId) || resultId <= 0) {
        return res.status(400).json({ message: "Invalid result id" });
      }
      const result = await storage.getResult(resultId);
      if (!result) {
        return res.status(404).json({ message: "Result not found" });
      }
      const input = api.voiceNotes.create.input.parse(req.body);
      const note = await storage.createVoiceNote({ resultId, ...input });
      const { audioBase64: _omit, ...meta } = note;
      res.status(201).json(meta);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.get(api.voiceNotes.list.path, async (req, res) => {
    const resultId = Number(req.params.id);
    if (!Number.isInteger(resultId) || resultId <= 0) {
      return res.status(400).json({ message: "Invalid result id" });
    }
    const notes = await storage.getVoiceNotesForResult(resultId);
    res.json(notes);
  });

  app.get(api.voiceNotes.audio.path, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: "Invalid voice note id" });
    }
    const note = await storage.getVoiceNote(id);
    if (!note) {
      return res.status(404).json({ message: "Voice note not found" });
    }
    const audio = Buffer.from(note.audioBase64, "base64");
    res.setHeader("Content-Type", note.mimeType);
    res.setHeader("Content-Length", String(audio.length));
    res.send(audio);
  });

  return httpServer;
}
