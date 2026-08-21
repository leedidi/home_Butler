import { allowMethod, handleApiError, readBody, sendJson } from "../_lib/http.js";
import { sendTestPush } from "../_lib/pushService.js";

export default async function handler(request, response) {
  if (!allowMethod(request, response, "POST")) return;
  try {
    const { clientId, choreId, delaySeconds: requestedDelay = 0 } = readBody(request);
    const parsedDelay = Number(requestedDelay);
    const delaySeconds = Number.isFinite(parsedDelay) ? Math.min(Math.max(parsedDelay, 0), 30) : 0;
    if (delaySeconds > 0) {
      await new Promise((resolve) => setTimeout(resolve, delaySeconds * 1000));
    }
    const result = await sendTestPush(clientId, choreId);
    sendJson(response, result.sent > 0 ? 200 : 400, result);
  } catch (error) {
    if (error.statusCode) return sendJson(response, error.statusCode, { message: error.message });
    handleApiError(response, error);
  }
}
