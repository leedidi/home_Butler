import { allowMethod, handleApiError, readBody, sendJson } from "../_lib/http.js";
import { subscribe } from "../_lib/pushService.js";

export default async function handler(request, response) {
  if (!allowMethod(request, response, "POST")) return;
  try {
    const { clientId, subscription } = readBody(request);
    await subscribe(clientId, subscription);
    sendJson(response, 201, { message: "기기가 등록되었습니다." });
  } catch (error) {
    if (error.statusCode) return sendJson(response, error.statusCode, { message: error.message });
    handleApiError(response, error);
  }
}
