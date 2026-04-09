import { assertSafeUrl } from "./ssrf.js";

function shouldRetry(method, status) {
  if (!["GET", "HEAD"].includes(method)) {
    return false;
  }
  return status >= 500 || status === 429;
}

function formatNetworkError(error, { method, url, timeoutMs }) {
  const base = `${method} ${url}`;
  const cause = error?.cause;
  const causeCode = cause?.code ?? error?.code ?? "";
  const causeMessage = cause?.message ?? error?.message ?? "unknown network error";

  if (error?.name === "AbortError" || causeCode === "ABORT_ERR" || causeMessage === "timeout") {
    return new Error(`Upstream request timed out after ${timeoutMs}ms: ${base}`);
  }
  if (causeCode === "ENOTFOUND" || causeCode === "EAI_AGAIN") {
    return new Error(`Upstream DNS lookup failed (${causeCode}): ${base}`);
  }
  if (causeCode === "ECONNREFUSED") {
    return new Error(`Upstream connection refused (${causeCode}): ${base}`);
  }
  if (causeCode === "ECONNRESET") {
    return new Error(`Upstream connection reset (${causeCode}): ${base}`);
  }
  if (causeCode === "EACCES" || causeCode === "EPERM") {
    return new Error(`Upstream network access denied (${causeCode}): ${base}`);
  }
  if (causeCode === "ETIMEDOUT" || causeCode === "UND_ERR_CONNECT_TIMEOUT") {
    return new Error(`Upstream connection timed out (${causeCode}): ${base}`);
  }
  if (causeCode === "CERT_HAS_EXPIRED" || causeCode === "DEPTH_ZERO_SELF_SIGNED_CERT") {
    return new Error(`Upstream TLS certificate error (${causeCode}): ${base}`);
  }
  if (causeCode === "ERR_INVALID_URL") {
    return new Error(`Upstream URL is invalid (${causeCode}): ${base}`);
  }
  if (causeMessage.startsWith("SSRF blocked:")) {
    return new Error(`${causeMessage}: ${base}`);
  }
  return new Error(`Upstream fetch failed (${causeCode || "UNKNOWN"}): ${base}; ${causeMessage}`);
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
      try {
        await assertSafeUrl(requestUrl, { allowPrivateIp });
      } catch (error) {
        throw formatNetworkError(error, { method, url: requestUrl, timeoutMs });
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort("timeout"), timeoutMs);
      try {
        response = await fetch(requestUrl, {
          method,
          headers,
          body: body === null || body === undefined ? undefined : JSON.stringify(body),
          redirect: "manual",
          signal: controller.signal
        });
      } catch (error) {
        throw formatNetworkError(error, { method, url: requestUrl, timeoutMs });
      } finally {
        clearTimeout(timer);
      }

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
