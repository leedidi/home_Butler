export const STARTUP_SPLASH_KEY = "home-butler:startup-splash:v1";

export function shouldShowStartupSplash(storage = window.sessionStorage) {
  try {
    if (storage.getItem(STARTUP_SPLASH_KEY) === "shown") return false;
    storage.setItem(STARTUP_SPLASH_KEY, "shown");
    return true;
  } catch {
    return true;
  }
}

export function getStartupPath(pathname) {
  return /^\/chores\/[^/]+$/.test(pathname) ? pathname : "/";
}
