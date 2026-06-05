import { listSpaces as getSpaces } from "../space-store.js";

export async function listSpaces(options: { json?: boolean } = {}) {
  const allSpaces = getSpaces();

  if (allSpaces.length === 0) {
    if (options.json) {
    } else {
    }
    return;
  }

  if (options.json) {
  } else {
    for (const _space of allSpaces) {
    }
  }
}
