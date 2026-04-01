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
    
    Rules:
    1. Return an array of objects with keys: "character", "text", "isStageDirection".
    2. "character" should be the name of the character speaking, or "STAGE" for stage directions.
    3. "text" is the actual line or description.
    4. "isStageDirection" is true if it's a stage direction, false if it's a dialogue.
    
    Script text (truncated if necessary):
    ${text.slice(0, 40000)}
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

export async function generateSpeech(text: string, voiceName: 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr' = 'Kore'): Promise<string> {
  try {
    const response = await genAI.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: `Dì con tono naturale e recitativo: ${text}` }] }],
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
      throw new Error("Nessun dato audio ricevuto da Gemini");
    }
    return base64Audio;
  } catch (error) {
    console.error("Errore nella generazione del parlato:", error);
    throw error;
  }
}
