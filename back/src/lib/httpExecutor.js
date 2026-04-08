import { assertSafeUrl } from "./ssrf.js";

function shouldRetry(method, status) {
  if (!["GET", "HEAD"].includes(method)) {
    return false;
  }
  return status >= 500 || status === 429;
}

export async function executeHttpRequest({
  method,
  url,
  headers,
  body,
  timeoutMs,
  maxRedirects,
  retryAttempts,
  allowPrivateIp = false
}) {
  let currentUrl = url;
  let attempts = 0;
  while (attempts <= retryAttempts) {
    attempts += 1;
    let redirects = 0;
    let response;
    let requestUrl = currentUrl;
    while (true) {
      await assertSafeUrl(requestUrl, { allowPrivateIp });
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort("timeout"), timeoutMs);
      response = await fetch(requestUrl, {
        method,
        headers,
        body: body === null || body === undefined ? undefined : JSON.stringify(body),
        redirect: "manual",
        signal: controller.signal
      }).finally(() => clearTimeout(timer));

      if (response.status >= 300 && response.status < 400 && response.headers.get("location")) {
        if (redirects >= maxRedirects) {
          throw new Error("Too many redirects");
        }
        redirects += 1;
        requestUrl = new URL(response.headers.get("location"), requestUrl).toString();
        continue;
      }
      break;
    }

    const contentType = response.headers.get("content-type") ?? "";
    const responseBody = contentType.includes("application/json")
      ? await response.json()
      : await response.text();

    if (shouldRetry(method, response.status) && attempts <= retryAttempts) {
      await new Promise((resolve) => setTimeout(resolve, attempts * 100));
      continue;
    }

    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body: responseBody
    };
  }
  throw new Error("Request failed after retry attempts");
}
