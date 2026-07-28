import * as chrono from 'chrono-node';
import { format } from 'date-fns';

export interface SmartDateResult {
  date: Date | null;
  isoDate: string | null;
  matchedText: string | null;
  cleanTitle: string;
}

/**
 * Natural language date parsing utility.
 * Parses strings like "Submit report by next Friday", "Call client tomorrow", "Aug 15"
 * and returns the parsed Date, local ISO string ('yyyy-MM-dd'), matched text, and clean title.
 */
export function parseSmartDate(text: string, refDate?: Date): SmartDateResult {
  if (!text || !text.trim()) {
    return { date: null, isoDate: null, matchedText: null, cleanTitle: text || '' };
  }

  const results = chrono.parse(text, refDate);
  if (!results || results.length === 0) {
    return { date: null, isoDate: null, matchedText: null, cleanTitle: text.trim() };
  }

  const firstResult = results[0];
  const parsedDate = firstResult.date();

  if (!parsedDate || Number.isNaN(parsedDate.getTime())) {
    return { date: null, isoDate: null, matchedText: null, cleanTitle: text.trim() };
  }

  const isoDate = format(parsedDate, 'yyyy-MM-dd');
  const matchText = firstResult.text;
  const matchIndex = firstResult.index;

  // Detect prepositions right before the date match (e.g. "by", "due on", "on", "for", "at", "before")
  const prefixSubstring = text.slice(0, matchIndex);
  const prepRegex = /(?:due\s+on|due\s+by|due|by|on|for|at|before)\s*$/i;
  const prepMatch = prepRegex.exec(prefixSubstring);

  let startIndex = matchIndex;
  if (prepMatch) {
    startIndex = matchIndex - prepMatch[0].length;
  }

  const endIndex = matchIndex + matchText.length;
  const matchedSpan = text.slice(startIndex, endIndex);

  // Clean title by removing the date expression
  let clean = (text.slice(0, startIndex) + text.slice(endIndex))
    .replace(/\s+/g, ' ')
    .trim();

  clean = clean
    .replace(/^(?:by|on|due|at|before|for)\s+/i, '')
    .replace(/\s+(?:by|on|due|at|before|for)$/i, '')
    .trim();

  if (!clean) {
    clean = text.trim();
  }

  return {
    date: parsedDate,
    isoDate,
    matchedText: matchedSpan,
    cleanTitle: clean,
  };
}
