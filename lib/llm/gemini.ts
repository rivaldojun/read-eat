import { GoogleGenerativeAI } from "@google/generative-ai";

import { requireEnv } from "@/lib/env";

let genAI: GoogleGenerativeAI | null = null;

function client(): GoogleGenerativeAI {
  if (!genAI) genAI = new GoogleGenerativeAI(requireEnv("GEMINI_API_KEY"));
  return genAI;
}

export interface GenerateJsonOptions {
  model: string;
  prompt: string;
  systemInstruction?: string;
  temperature?: number;
}

/**
 * Call Gemini and return the raw text, forcing JSON output via
 * responseMimeType. We deliberately do NOT pass a responseSchema — parsing +
 * Zod validation + a single retry (see callers) is the safety net, and avoids
 * coupling to schema-format quirks. Returns the raw string for the caller to
 * extract/validate.
 */
export async function generateJson(opts: GenerateJsonOptions): Promise<string> {
  const model = client().getGenerativeModel({
    model: opts.model,
    systemInstruction: opts.systemInstruction,
    generationConfig: {
      responseMimeType: "application/json",
      temperature: opts.temperature ?? 0.2,
    },
  });

  const result = await model.generateContent(opts.prompt);
  return result.response.text();
}

/** Plain-text generation (used by drafting). */
export async function generateText(opts: GenerateJsonOptions): Promise<string> {
  const model = client().getGenerativeModel({
    model: opts.model,
    systemInstruction: opts.systemInstruction,
    generationConfig: { temperature: opts.temperature ?? 0.7 },
  });
  const result = await model.generateContent(opts.prompt);
  return result.response.text();
}
