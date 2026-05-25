export const TRACKER_FAQ_OPEN_EVENT_NAME = 'tlt:tracker-faq-open';

export function requestTrackerFaqOpen(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent(TRACKER_FAQ_OPEN_EVENT_NAME));
}
