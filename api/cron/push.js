import { handleApiError, sendJson } from "../_lib/http.js";
import { processScheduledPushes } from "../_lib/pushService.js";

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return sendJson(response, 405, { message: "지원하지 않는 요청 방식입니다." });
  }
  if (!process.env.CRON_SECRET || request.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return sendJson(response, 401, { message: "예약 발송 권한이 없습니다." });
  }
  try {
    const result = await processScheduledPushes();
    sendJson(response, 200, { ok: true, ...result });
  } catch (error) {
    handleApiError(response, error);
  }
}
