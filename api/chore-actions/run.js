import { allowMethod, handleApiError, readBody, sendJson } from "../_lib/http.js";
import { runChoreAction } from "../_lib/pushService.js";

export default async function handler(request, response) {
  if (!allowMethod(request, response, "POST")) return;
  try {
    const { clientId, choreId, action } = readBody(request);
    const chore = await runChoreAction(clientId, choreId, action);
    if (!chore) return sendJson(response, 404, { message: "집안일을 찾을 수 없습니다." });
    sendJson(response, 200, { chore });
  } catch (error) {
    if (error.statusCode) return sendJson(response, error.statusCode, { message: error.message });
    handleApiError(response, error);
  }
}
