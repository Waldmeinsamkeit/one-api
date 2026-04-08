import { performance } from "node:perf_hooks";
import { InMemoryRepositories } from "../../src/domain/repositories.js";
import { ModelRegistry } from "../../src/domain/modelRegistry.js";
import { PlatformService } from "../../src/domain/platformService.js";

const repos = new InMemoryRepositories();
const service = new PlatformService({ repositories: repos, modelRegistry: new ModelRegistry() });

function makeAdapter({ apiSlug, action, url, method = "GET", headers = {}, query = {}, body = null, responseMapping = { data: "$" }, policy = {} }) {
  return {
    api_slug: apiSlug,
    action,
    adapter_schema_version: "1.0",
    logic_version: 1,
    target: {
      url,
      method,
      headers,
      query_params: query,
      body
    },
    response_mapping: responseMapping,
    auth_ref: {
      secret_name: "api_key"
    },
    policy: {
      timeout_ms: policy.timeout_ms ?? 8000,
      retry: {
        max_attempts: policy.max_attempts ?? 1
      }
    }
  };
}

async function runCase(name, adapter, payload = {}, tempSecrets = { api_key: "demo-key" }) {
  const started = performance.now();
  try {
    const result = await service.dryRun({
      workspaceId: "default",
      adapter,
      payload,
      tempSecrets
    });
    const elapsed = Math.round(performance.now() - started);
    return {
      name,
      ok: true,
      elapsed_ms: elapsed,
      success: result.success,
      upstream_status: result.meta?.upstream_status,
      sample: result.data
    };
  } catch (error) {
    const elapsed = Math.round(performance.now() - started);
    return {
      name,
      ok: false,
      elapsed_ms: elapsed,
      error: String(error?.message ?? error)
    };
  }
}

async function run() {
  const openWeatherKey = process.env.OPENWEATHER_API_KEY;
  const tmdbToken = process.env.TMDB_BEARER_TOKEN;

  const cases = [
    () => runCase(
      "JSONPlaceholder GET /posts/1",
      makeAdapter({
        apiSlug: "jsonplaceholder",
        action: "get_post",
        url: "https://jsonplaceholder.typicode.com/posts/1",
        responseMapping: {
          id: "$.id",
          title: "$.title",
          body: "$.body"
        }
      }),
      {},
      {}
    ),
    () => runCase(
      "JSONPlaceholder POST /posts",
      makeAdapter({
        apiSlug: "jsonplaceholder",
        action: "create_post",
        url: "https://jsonplaceholder.typicode.com/posts",
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: {
          title: "{{payload.title}}",
          body: "{{payload.body}}",
          userId: "{{payload.userId}}"
        },
        responseMapping: {
          id: "$.id",
          title: "$.title"
        }
      }),
      { title: "foo", body: "bar", userId: 1 },
      {}
    ),
    () => runCase(
      "ReqRes GET /api/users?page=2",
      makeAdapter({
        apiSlug: "reqres",
        action: "list_users",
        url: "https://reqres.in/api/users",
        headers: {
          "x-api-key": "reqres-free-v1"
        },
        query: {
          page: "{{payload.page}}"
        },
        responseMapping: {
          page: "$.page",
          first_user_email: "$.data[0].email"
        }
      }),
      { page: 2 },
      {}
    ),
    () => runCase(
      "REST Countries /v3.1/name/china",
      makeAdapter({
        apiSlug: "restcountries",
        action: "by_name",
        url: "https://restcountries.com/v3.1/name/china",
        query: {
          fullText: "true"
        },
        responseMapping: {
          name: "$.0.name.common",
          capital: "$.0.capital[0]",
          flag_png: "$.0.flags.png"
        }
      }),
      {},
      {}
    ),
    () => runCase(
      "Dog API random image",
      makeAdapter({
        apiSlug: "dogapi",
        action: "random",
        url: "https://dog.ceo/api/breeds/image/random",
        responseMapping: {
          status: "$.status",
          image_url: "$.message"
        }
      }),
      {},
      {}
    ),
    () => runCase(
      "httpbin delay 5s (timeout policy 8s)",
      makeAdapter({
        apiSlug: "httpbin",
        action: "delay_test",
        url: "https://httpbin.org/delay/5",
        responseMapping: {
          url: "$.url"
        },
        policy: {
          timeout_ms: 8000,
          max_attempts: 0
        }
      }),
      {},
      {}
    ),
    () => runCase(
      "httpbin status 500 (retry once)",
      makeAdapter({
        apiSlug: "httpbin",
        action: "retry_test",
        url: "https://httpbin.org/status/500",
        responseMapping: {
          raw: "$"
        },
        policy: {
          timeout_ms: 8000,
          max_attempts: 1
        }
      }),
      {},
      {}
    ),
    () => runCase(
      "httpbin headers (header secret injection)",
      makeAdapter({
        apiSlug: "httpbin",
        action: "headers",
        url: "https://httpbin.org/headers",
        headers: {
          Authorization: "Bearer {{secrets.api_key}}",
          "X-Test": "one-api"
        },
        responseMapping: {
          authorization: "$.headers.Authorization",
          x_test: "$.headers['X-Test']"
        }
      }),
      {},
      { api_key: "header-secret-demo" }
    ),
    () => runCase(
      "httpbin get (query secret injection like OpenWeather appid)",
      makeAdapter({
        apiSlug: "httpbin",
        action: "query_secret",
        url: "https://httpbin.org/get",
        query: {
          appid: "{{secrets.api_key}}",
          q: "{{payload.city}}"
        },
        responseMapping: {
          appid: "$.args.appid",
          city: "$.args.q"
        }
      }),
      { city: "Shanghai" },
      { api_key: "query-secret-demo" }
    )
  ];

  if (openWeatherKey) {
    cases.push(() =>
      runCase(
        "OpenWeather real auth (query appid)",
        makeAdapter({
          apiSlug: "openweather",
          action: "weather_by_city",
          url: "https://api.openweathermap.org/data/2.5/weather",
          query: {
            q: "{{payload.city}}",
            units: "{{payload.units}}",
            appid: "{{secrets.api_key}}"
          },
          responseMapping: {
            city: "$.name",
            temp: "$.main.temp",
            weather: "$.weather[0].main"
          }
        }),
        { city: "Shanghai", units: "metric" },
        { api_key: openWeatherKey }
      )
    );
  }

  if (tmdbToken) {
    cases.push(() =>
      runCase(
        "TMDB real auth (Bearer header)",
        makeAdapter({
          apiSlug: "tmdb",
          action: "trending",
          url: "https://api.themoviedb.org/3/trending/movie/day",
          headers: {
            Authorization: "Bearer {{secrets.api_key}}"
          },
          responseMapping: {
            count: "$.results[0].id",
            first_title: "$.results[0].title"
          }
        }),
        {},
        { api_key: tmdbToken }
      )
    );
  }

  const results = [];
  for (const item of cases) {
    // eslint-disable-next-line no-await-in-loop
    const result = await item();
    results.push(result);
  }
  const summary = {
    total: results.length,
    passed: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    skipped_auth_cases: {
      openweather: !openWeatherKey,
      tmdb: !tmdbToken
    }
  };
  console.log(JSON.stringify({ summary, results }, null, 2));
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
