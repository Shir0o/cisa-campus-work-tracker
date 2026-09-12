// Browser-side feedback screenshot capture, shared by the two web entry
// points: the FeedbackFAB dialog (the common case — the user is on some page
// and the capture shows what is behind the dialog) and the dedicated
// SubmitFeedback page.
//
// The capture is admin-only context. It is stored on the Firestore feedback
// document and rendered in the admin feedback list; it is never forwarded to
// GitHub (ADR 0018 decision 7).
import {
  MAX_SCREENSHOT_CHARS,
  MAX_SCREENSHOT_DIMENSION,
  SCREENSHOT_QUALITY_LADDER,
} from './feedbackKinds';

/**
 * Captures the page as a base64 JPEG data URL.
 *
 * Returns '' when capture fails or will not fit the size ceiling — a note
 * without a screenshot is still worth sending, so every failure is soft.
 */
export async function capturePageScreenshot(): Promise<string> {
  try {
    const html2canvas = (await import('html2canvas-pro')).default;
    const canvas = await html2canvas(document.body, {
      logging: false,
      useCORS: true,
      scale: 1.0,
      // Keep the feedback UI itself out of the shot — the admin wants the page
      // the reporter was looking at, not the form they typed into.
      ignoreElements: (el) =>
        el.id === 'feedback-fab-btn' ||
        el.getAttribute('role') === 'dialog' ||
        Boolean(el.closest('[role="dialog"]')),
    });

    let finalCanvas = canvas;
    if (canvas.width > MAX_SCREENSHOT_DIMENSION || canvas.height > MAX_SCREENSHOT_DIMENSION) {
      const scale = Math.min(MAX_SCREENSHOT_DIMENSION / canvas.width, MAX_SCREENSHOT_DIMENSION / canvas.height);
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = Math.round(canvas.width * scale);
      tempCanvas.height = Math.round(canvas.height * scale);
      const ctx = tempCanvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(canvas, 0, 0, tempCanvas.width, tempCanvas.height);
        finalCanvas = tempCanvas;
      }
    }

    for (const quality of SCREENSHOT_QUALITY_LADDER) {
      const encoded = finalCanvas.toDataURL('image/jpeg', quality);
      if (encoded.length <= MAX_SCREENSHOT_CHARS) return encoded;
    }

    // Even the lowest rung overflows: drop it rather than store a document the
    // Firestore rules would reject.
    console.warn('Screenshot exceeded the size ceiling at every quality; sending without one.');
    return '';
  } catch (err) {
    console.error('Failed to capture screenshot:', err);
    return '';
  }
}
