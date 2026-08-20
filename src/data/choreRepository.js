export const CHORE_STORAGE_KEY = "home-butler:chores:v1";

export function loadChores(storage = window.localStorage) {
  try {
    const value = JSON.parse(storage.getItem(CHORE_STORAGE_KEY) ?? "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function saveChores(chores, storage = window.localStorage) {
  storage.setItem(CHORE_STORAGE_KEY, JSON.stringify(chores));
  return chores;
}

export function updateChore(updatedChore, storage = window.localStorage) {
  const chores = loadChores(storage);
  const updatedChores = chores.map((chore) => (
    chore.id === updatedChore.id ? updatedChore : chore
  ));
  saveChores(updatedChores, storage);
  return updatedChore;
}
