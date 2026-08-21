import { allowMethod, handleApiError, readBody, sendJson } from "../_lib/http.js";
import { syncChores } from "../_lib/pushService.js";

export default async function handler(request, response) {
  if (!allowMethod(request, response, "POST")) return;
  try {
    const { clientId, chores, timeZone } = readBody(request);
    const record = await syncChores(clientId, chores, timeZone);
    sendJson(response, 200, { chores: record.chores, updatedAt: record.updatedAt });
  } catch (error) {
    if (error.statusCode || error instanceof TypeError || error instanceof RangeError) {
      return sendJson(response, error.statusCode ?? 400, { message: error.message });
    }
    handleApiError(response, error);
  }
}
