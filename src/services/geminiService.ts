import { GoogleGenAI, Type } from "@google/genai";
import { ScriptLine } from "../types";

const genAI = new GoogleGenAI({ 
  apiKey: import.meta.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || "" 
});

export async function parseScript(text: string): Promise<ScriptLine[]> {
  const model = "gemini-3-flash-preview";
  
  const prompt = `
    Analyze the following theater script text and convert it into a structured JSON array.
    Identify characters, their lines, and stage directions.
    
    CRITICAL RULES:
    1. DO NOT OMIT ANY TEXT. Every single word of the script must be present in the output.
    2. Return an array of objects with keys: "character", "text", "isStageDirection".
    3. "character" should be the name of the character speaking, or "STAGE" for stage directions.
    4. "text" is the actual line or description.
    5. "isStageDirection" is true if it's a stage direction (even if it's in the middle of a scene), false if it's a dialogue.
    6. Preserve the exact order of the script.
    7. If a line has a character name followed by text, separate them correctly.
    ${text.slice(0, 200000)}
  `;

  try {
    console.log("Sending request to Gemini...");
    const response = await genAI.models.generateContent({
      model,
      contents: prompt,
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

    const resultText = response.text;
    if (!resultText) {
      throw new Error("Empty response from Gemini");
    }
    
    console.log("Received response from Gemini");
    return JSON.parse(resultText);
  } catch (error) {
    console.error("Error parsing script:", error);
    throw error;
  }
}
