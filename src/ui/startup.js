export function getStartupPath(pathname) {
  return /^\/chores\/[^/]+$/.test(pathname) ? pathname : "/";
}
