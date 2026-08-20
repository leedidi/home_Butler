export const DAILY_SPLASH_KEY = "home-butler:daily-splash:v1";

export function shouldShowDailySplash(dateOnly, storage = window.localStorage) {
  try {
    if (storage.getItem(DAILY_SPLASH_KEY) === dateOnly) return false;
    storage.setItem(DAILY_SPLASH_KEY, dateOnly);
    return true;
  } catch {
    return true;
  }
}
