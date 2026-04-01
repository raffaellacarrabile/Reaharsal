import { GoogleGenAI, Type } from "@google/genai";
import { ScriptLine } from "./types";

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function parseScript(text: string): Promise<ScriptLine[]> {
  const model = "gemini-3-flash-preview";
  
  const prompt = `
    Analyze the following theater script text and convert it into a structured JSON array.
    Identify characters, their lines, and stage directions.
    
    Rules:
    1. Return an array of objects with keys: "character", "text", "isStageDirection".
    2. "character" should be the name of the character speaking, or "STAGE" for stage directions.
    3. "text" is the actual line or description.
    4. "isStageDirection" is true if it's a stage direction, false if it's a dialogue.
    
    Script text:
    ${text}
  `;

  try {
    const response = await genAI.models.generateContent({
      model,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              character: { type: Type.STRING },
              text: { type: Type.STRING },
              isStageDirection: { type: Type.BOOLEAN },
            },
            required: ["character", "text", "isStageDirection"],
          },
        },
      },
    });

    return JSON.parse(response.text || "[]");
  } catch (error) {
    console.error("Error parsing script:", error);
    throw error;
  }
}
