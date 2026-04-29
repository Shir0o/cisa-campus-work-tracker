import { GoogleGenAI, Type } from "@google/genai";
import { Interaction, Comment, Contact } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });

export interface ContactAnalysis {
  lastSeen: {
    timestamp: string;
    source: 'interaction' | 'comment' | 'attendance' | 'unknown';
    confidence: number;
    reasoning: string;
  };
  needsContact: {
    suggested: boolean;
    reasoning: string;
    priority: 'low' | 'medium' | 'high';
  };
}

export const aiService = {
  async analyzeContact(
    contact: Contact,
    interactions: Interaction[],
    comments: Comment[]
  ): Promise<ContactAnalysis> {
    const context = {
      contactName: contact.name,
      currentStage: contact.stage,
      lastSeen: contact.lastSeen,
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
      Analyze the following data for contact "${contact.name}".
      
      Task 1: Determine the most recent "seen" or interactive activity.
      - "Seen" means physical presence, direct response, or a comment explicitly mentioning seeing them.
      - Passive events (Sent Email) without replies should be ignored.
      
      Task 2: Determine if this contact "Needs Contact".
      - "Needs Contact" should be true if:
        1. It has been more than 14 days since the last active encounter.
        2. The last interaction/comment implies an unanswered question or pending follow-up.
        3. The contact is in a stage like "Email Sent" but hasn't responded in 7 days.
      
      Current Date: ${new Date().toISOString()}
      
      Contact Data:
      ${JSON.stringify(context, null, 2)}
      
      Return a JSON object with:
      {
        "lastSeen": { "timestamp": "...", "source": "...", "confidence": 0.9, "reasoning": "..." },
        "needsContact": { "suggested": true/false, "reasoning": "...", "priority": "low/medium/high" }
      }
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
              lastSeen: {
                type: Type.OBJECT,
                properties: {
                  timestamp: { type: Type.STRING },
                  source: { type: Type.STRING, enum: ['interaction', 'comment', 'attendance', 'unknown'] },
                  confidence: { type: Type.NUMBER },
                  reasoning: { type: Type.STRING }
                },
                required: ['timestamp', 'source', 'confidence', 'reasoning']
              },
              needsContact: {
                type: Type.OBJECT,
                properties: {
                  suggested: { type: Type.BOOLEAN },
                  reasoning: { type: Type.STRING },
                  priority: { type: Type.STRING, enum: ['low', 'medium', 'high'] }
                },
                required: ['suggested', 'reasoning', 'priority']
              }
            },
            required: ['lastSeen', 'needsContact']
          }
        }
      });

      const result = JSON.parse(response.text || '{}');
      return result as ContactAnalysis;
    } catch (error) {
      console.error("AI Analysis Failed:", error);
      return {
        lastSeen: {
          timestamp: contact.lastSeen || new Date().toISOString(),
          source: 'unknown',
          confidence: 0,
          reasoning: "Failed to calculate via AI."
        },
        needsContact: {
          suggested: false,
          reasoning: "Analysis failed.",
          priority: 'low'
        }
      };
    }
  }
};
