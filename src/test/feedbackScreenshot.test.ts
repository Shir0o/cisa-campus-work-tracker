// Screenshots are admin-only context (ADR 0018 decision 7): captured in-app,
// stored in Firestore, shown in the admin feedback list, never sent to GitHub.
// These cover the capture helper's size discipline and its soft-failure
// contract — a note must never be lost because its screenshot misbehaved.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MAX_SCREENSHOT_CHARS, SCREENSHOT_QUALITY_LADDER } from '../lib/feedbackKinds';

const JPEG = 'data:image/jpeg;base64,';

const html2canvasMock = vi.fn();
vi.mock('html2canvas-pro', () => ({ default: (...args: unknown[]) => html2canvasMock(...args) }));

/** A canvas stub whose encoded length shrinks as quality drops. */
const fakeCanvas = (sizeFor: (quality: number) => number, width = 800, height = 600) => ({
  width,
  height,
  toDataURL: vi.fn((_type: string, quality: number) => JPEG + 'x'.repeat(Math.max(0, sizeFor(quality) - JPEG.length))),
});

describe('capturePageScreenshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => vi.restoreAllMocks());

  const load = async () => (await import('../lib/feedbackScreenshot')).capturePageScreenshot;

  it('returns the first encoding that fits the ceiling', async () => {
    const canvas = fakeCanvas(() => 1000);
    html2canvasMock.mockResolvedValue(canvas);

    const result = await (await load())();

    expect(result.startsWith(JPEG)).toBe(true);
    expect(result.length).toBeLessThanOrEqual(MAX_SCREENSHOT_CHARS);
    // Stopped at the first rung — no need to re-encode at lower quality.
    expect(canvas.toDataURL).toHaveBeenCalledTimes(1);
    expect(canvas.toDataURL).toHaveBeenCalledWith('image/jpeg', SCREENSHOT_QUALITY_LADDER[0]);
  });

  it('walks down the quality ladder until one fits', async () => {
    // Only the last rung comes in under the ceiling.
    const canvas = fakeCanvas((q) =>
      q === SCREENSHOT_QUALITY_LADDER[SCREENSHOT_QUALITY_LADDER.length - 1]
        ? MAX_SCREENSHOT_CHARS - 1
        : MAX_SCREENSHOT_CHARS + 1
    );
    html2canvasMock.mockResolvedValue(canvas);

    const result = await (await load())();

    expect(result.length).toBeLessThanOrEqual(MAX_SCREENSHOT_CHARS);
    expect(canvas.toDataURL).toHaveBeenCalledTimes(SCREENSHOT_QUALITY_LADDER.length);
  });

  it('gives up rather than returning an oversized capture', async () => {
    const canvas = fakeCanvas(() => MAX_SCREENSHOT_CHARS + 1);
    html2canvasMock.mockResolvedValue(canvas);

    expect(await (await load())()).toBe('');
    expect(canvas.toDataURL).toHaveBeenCalledTimes(SCREENSHOT_QUALITY_LADDER.length);
  });

  it('returns empty string when html2canvas throws', async () => {
    html2canvasMock.mockRejectedValue(new Error('tainted canvas'));

    expect(await (await load())()).toBe('');
  });

  it('excludes the feedback FAB and any open dialog from the capture', async () => {
    html2canvasMock.mockResolvedValue(fakeCanvas(() => 1000));
    await (await load())();

    const { ignoreElements } = html2canvasMock.mock.calls[0][1];

    const fab = document.createElement('button');
    fab.id = 'feedback-fab-btn';
    expect(ignoreElements(fab)).toBe(true);

    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    expect(ignoreElements(dialog)).toBe(true);

    const insideDialog = document.createElement('textarea');
    dialog.appendChild(insideDialog);
    expect(ignoreElements(insideDialog)).toBe(true);

    const pageContent = document.createElement('main');
    document.body.appendChild(pageContent);
    expect(ignoreElements(pageContent)).toBe(false);
    pageContent.remove();
  });
});
