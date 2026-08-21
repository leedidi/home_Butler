import { allowMethod, handleApiError, sendJson } from "../_lib/http.js";
import { loadChores } from "../_lib/pushService.js";

export default async function handler(request, response) {
  if (!allowMethod(request, response, "GET")) return;
  try {
    const record = await loadChores(request.query.clientId);
    if (!record) return sendJson(response, 404, { message: "동기화된 집안일이 없습니다." });
    sendJson(response, 200, { chores: record.chores, updatedAt: record.updatedAt });
  } catch (error) {
    handleApiError(response, error);
  }
}
