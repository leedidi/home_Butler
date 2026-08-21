import { allowMethod, handleApiError, sendJson } from "../_lib/http.js";
import { publicKey } from "../_lib/pushService.js";

export default function handler(request, response) {
  if (!allowMethod(request, response, "GET")) return;
  try {
    sendJson(response, 200, { publicKey: publicKey() });
  } catch (error) {
    handleApiError(response, error);
  }
}
