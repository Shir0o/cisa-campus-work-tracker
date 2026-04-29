import { GoogleGenAI, Type } from "@google/genai";
import { Interaction, Comment, Contact } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });

export interface LastSeenAnalysis {
  timestamp: string;
  source: 'interaction' | 'comment' | 'attendance' | 'unknown';
  confidence: number;
  reasoning: string;
}

export const aiService = {
  async calculateLastSeen(
    contact: Contact,
    interactions: Interaction[],
    comments: Comment[]
  ): Promise<LastSeenAnalysis> {
    const context = {
      contactName: contact.name,
      attendance: contact.attendance || {},
      interactions: interactions.map(i => ({
        content: i.content,
        dateTime: i.dateTime,
        type: 'interaction'
      })),
      comments: comments.map(c => ({
        text: c.text,
        createdAt: c.createdAt,
        type: 'comment'
      }))
    };

    const prompt = `
      Analyze the following data for contact "${contact.name}" to determine the most recent time they were "seen" or active.
      "Seen" means a physical presence at an event, a direct response in an interaction, or a comment from a team member explicitly mentioning seeing them.
      
      Passive events like "Sent Email" should be ignored unless there was a reply.
      
      Current Date: ${new Date().toISOString()}
      
      Contact Data:
      ${JSON.stringify(context, null, 2)}
      
      Return a JSON object with:
      1. timestamp (ISO string of the most recent active encounter)
      2. source (one of: 'interaction', 'comment', 'attendance', 'unknown')
      3. confidence (0-1 score)
      4. reasoning (brief explanation of why this was chosen)
    `;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              timestamp: { type: Type.STRING },
              source: { 
                type: Type.STRING, 
                enum: ['interaction', 'comment', 'attendance', 'unknown'] 
              },
              confidence: { type: Type.NUMBER },
              reasoning: { type: Type.STRING }
            },
            required: ['timestamp', 'source', 'confidence', 'reasoning']
          }
        }
      });

      const result = JSON.parse(response.text || '{}');
      return result as LastSeenAnalysis;
    } catch (error) {
      console.error("AI Last Seen Calculation Failed:", error);
      return {
        timestamp: contact.lastSeen || new Date().toISOString(),
        source: 'unknown',
        confidence: 0,
        reasoning: "Failed to calculate via AI."
      };
    }
  }
};
