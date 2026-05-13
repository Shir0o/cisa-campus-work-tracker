import { GoogleGenAI, Type } from "@google/genai";
import { Interaction, Comment, Contact, Activity } from "../types";

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

export interface CampaignStrategy {
  pillars: {
    title: string;
    description: string;
    priority: 'low' | 'medium' | 'high';
    targetStage: string;
    actionableTips: string[];
  }[];
  overallAssessment: string;
  suggestedFocus: string;
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
  },

  async generateCampaignStrategy(
    contacts: Contact[],
    recentActivities: any[]
  ): Promise<CampaignStrategy> {
    const stageDistribution = contacts.reduce((acc: any, c) => {
      acc[c.stage] = (acc[c.stage] || 0) + 1;
      return acc;
    }, {});

    const context = {
      totalContacts: contacts.length,
      stageDistribution,
      recentActivitySummary: recentActivities.slice(0, 5).map(a => `${a.user} ${a.action} ${a.target}`),
      currentDate: new Date().toISOString()
    };

    const prompt = `
      Based on the community health data below, generate a 3-pillar "AI Campaign Strategy" to help the community manager (user) grow and engage their members.
      
      Community Data:
      ${JSON.stringify(context, null, 2)}
      
      Your goal is to identify bottlenecks (e.g. many people in 'Lead' but few in 'Active') and suggest high-impact actions.
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
              pillars: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    description: { type: Type.STRING },
                    priority: { type: Type.STRING, enum: ['low', 'medium', 'high'] },
                    targetStage: { type: Type.STRING },
                    actionableTips: { type: Type.ARRAY, items: { type: Type.STRING } }
                  },
                  required: ['title', 'description', 'priority', 'targetStage', 'actionableTips']
                }
              },
              overallAssessment: { type: Type.STRING },
              suggestedFocus: { type: Type.STRING }
            },
            required: ['pillars', 'overallAssessment', 'suggestedFocus']
          }
        }
      });

      const result = JSON.parse(response.text || '{}');
      return result as CampaignStrategy;
    } catch (error) {
      console.error("AI Strategy Generation Failed:", error);
      throw error;
    }
  },

  async mapSheetColumnsToEvents(
    headers: string[],
    existingEventNames: string[]
  ): Promise<Record<number, string | null>> {
    const prompt = `
      You are a data integration assistant. I have a Google Sheet with these headers: ${JSON.stringify(headers)}.
      Column index 0 is always the User Identifier (Name or Email).
      
      I have these existing attendance events in my database: ${JSON.stringify(existingEventNames)}.
      
      Task: Map the headers (from index 1 onwards) to the existing event names.
      - If a header closely matches an event name (considering typos, dates, or casing), map it to that event name.
      - If a header does not match any existing event, return null for that index.
      
      Return a JSON object where the keys are the column indices (starting from 1) and the values are the matching event name (of null if no match).
      Example: { "1": "Orientation", "2": "Weekly Meetup" }
    `;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            additionalProperties: { type: Type.STRING }
          }
        }
      });

      const result = JSON.parse(response.text || '{}');
      const mapping: Record<number, string | null> = {};
      Object.entries(result).forEach(([k, v]) => {
        mapping[parseInt(k)] = v as string | null;
      });
      return mapping;
    } catch (error) {
      console.error("AI Mapping Failed:", error);
      return {};
    }
  },

  async summarizeRecentActivity(activities: Activity[]): Promise<string> {
    if (activities.length === 0) return "No recent activity to summarize.";

    const context = activities.map(a => ({
      user: a.user,
      action: a.action,
      target: a.target,
      type: a.type,
      time: a.time,
      description: a.description
    }));

    const prompt = `
      You are an executive assistant for a community manager. 
      Summarize the following recent activities into a concise, professional, and friendly executive summary (2-3 sentences).
      Focus on key trends, high-priority interactions, and overall momentum.
      
      Activities:
      ${JSON.stringify(context, null, 2)}
      
      Rules:
      - Use natural, non-technical language.
      - Avoid lists or bullet points.
      - Make it sound human and encouraging.
      - Target a "narrative" style.
    `;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt
      });

      return response.text || "Could not generate summary.";
    } catch (error) {
      console.error("AI Summarization Failed:", error);
      return "Unable to generate activity summary at this time.";
    }
  },

  async humanizeActivity(activity: Activity): Promise<string> {
    const prompt = `
      Convert the following community activity into a short, natural, and friendly sentence for a community dashboard.
      A community manager will read this to stay updated on their members.

      Activity Data:
      - User who performed action: ${activity.user}
      - Type of Action: ${activity.action}
      - Person targeted/affected: ${activity.target}
      - Event Type: ${activity.type}
      - Technical Details (often shows changes or raw input): ${activity.description || 'N/A'}

      Special Instructions for Technical Details:
      - If you see patterns like "field: 'old' -> 'new'", translate it into a human update (e.g., "John updated Sarah's phone number").
      - If it's a 'call', 'email', or 'event', emphasize the interaction based on the notes (e.g., "John shared a warm phone conversation with Sarah").
      - If it's a comment, mention that a thought or note was shared.
      
      General Rules:
      - Max 15 words.
      - Use active voice.
      - Sound professional yet warm.
      - Output ONLY the humanized sentence. No quotes, no intro.
    `;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt
      });

      return response.text.trim().replace(/^"|"$/g, '') || `${activity.user} ${activity.action} ${activity.target}`;
    } catch (error) {
      console.error("AI Humanization Failed:", error);
      return `${activity.user} ${activity.action} ${activity.target}`;
    }
  }
};
