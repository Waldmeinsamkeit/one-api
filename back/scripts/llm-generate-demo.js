import { InMemoryRepositories } from "../src/domain/repositories.js";
import { ModelRegistry } from "../src/domain/modelRegistry.js";
import { PlatformService } from "../src/domain/platformService.js";

async function run() {
  const service = new PlatformService({
    repositories: new InMemoryRepositories(),
    modelRegistry: new ModelRegistry()
  });

  const result = await service.generateAdapter({
    workspaceId: "default",
    apiSlug: "restcountries",
    action: "country_by_name",
    sourceType: "raw",
    sourceUrl: "https://restcountries.com/v3.1/name/china",
    targetFormat: JSON.stringify(
      {
        unified_request: {
          api_slug: "string",
          action: "string",
          payload: {
            country_name: "string"
          }
        },
        unified_response: {
          success: "boolean",
          data: {
            name: "string",
            capital: "string",
            flag_png: "string"
          },
          error: {
            code: "string",
            message: "string"
          },
          meta: {
            upstream_status: "number",
            adapter_version: "number"
          }
        }
      },
      null,
      2
    )
  });

  console.log(
    JSON.stringify(
      {
        generation_mode: result.generation_mode,
        generation_warning: result.generation_warning,
        model_profile_id: result.model_profile_id,
        adapter_preview: result.spec
      },
      null,
      2
    )
  );
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
