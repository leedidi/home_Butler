export function sendJson(response, status, body) {
  response.status(status).json(body);
}

export function allowMethod(request, response, method) {
  if (request.method === method) return true;
  response.setHeader("Allow", method);
  sendJson(response, 405, { message: "지원하지 않는 요청 방식입니다." });
  return false;
}

export function readBody(request) {
  if (typeof request.body === "string") return JSON.parse(request.body || "{}");
  return request.body ?? {};
}

export function handleApiError(response, error) {
  console.error(error);
  const isConfigurationError = error?.code === "PUSH_CONFIGURATION_ERROR";
  sendJson(response, isConfigurationError ? 503 : 500, {
    message: isConfigurationError
      ? "알림 서버 설정이 아직 완료되지 않았습니다."
      : "알림 서버에서 요청을 처리하지 못했습니다.",
  });
}
