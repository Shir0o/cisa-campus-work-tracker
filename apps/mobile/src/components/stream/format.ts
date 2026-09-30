// The words a phone stream prints around the stream model's output (ADR 0033):
// day dividers, times, an ask's state line, a Thread chip's count. The model
// says *what* (a calendar day, days open, who closed it); this says it in the
// reader's language.
import type { AskState, StreamDay } from '@cisa/core';
import type { TranslateFunction } from '../../lib/LanguageProvider';

const localeOf = (lang: string) => (lang === 'es' ? 'es' : 'en-US');

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** "4:40 PM" — a row's time. */
export function timeOf(iso: string, lang: string): string {
  return new Date(iso).toLocaleTimeString(localeOf(lang), { hour: 'numeric', minute: '2-digit' });
}

/** A day divider: Today, Yesterday, then weekday and date (G5). */
export function dayLabel(day: StreamDay, t: TranslateFunction, lang: string): string {
  if (day.relative === 'today') return t('mobile.stream.today');
  if (day.relative === 'yesterday') return t('mobile.stream.yesterday');
  const [y, m, d] = day.day.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(localeOf(lang), { weekday: 'long', month: 'long', day: 'numeric' });
}

/** A moment outside its own day's divider: the time today, "Yesterday", then
 *  the short date. */
export function whenOf(iso: string, now: number, t: TranslateFunction, lang: string): string {
  const at = new Date(iso);
  const today = new Date(now);
  if (sameDay(at, today)) return timeOf(iso, lang);
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (sameDay(at, yesterday)) return t('mobile.stream.yesterday');
  return at.toLocaleDateString(localeOf(lang), { month: 'short', day: 'numeric' });
}

/** The line under an ask's body (K2, K3). */
export function askLine(ask: AskState, now: number, t: TranslateFunction, lang: string): string {
  if (ask.status === 'open') {
    if (ask.daysOpen === 0) return t('mobile.stream.ask_open_today');
    if (ask.daysOpen === 1) return t('mobile.stream.ask_open_one');
    return t('mobile.stream.ask_open_many').replace('{n}', String(ask.daysOpen));
  }
  const key = ask.status === 'followedUp' ? 'mobile.stream.ask_done' : 'mobile.stream.ask_withdrawn';
  return t(key).replace('{name}', ask.by.name).replace('{when}', whenOf(ask.at, now, t, lang));
}

/** "1 reply" / "N replies". */
export function repliesLabel(n: number, t: TranslateFunction): string {
  return n === 1 ? t('mobile.stream.replies_one') : t('mobile.stream.replies_many').replace('{n}', String(n));
}
