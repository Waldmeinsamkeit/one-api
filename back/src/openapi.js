const jsonContent = {
  "application/json": {
    schema: {
      type: "object"
    }
  }
};

const errorSchema = {
  type: "object",
  properties: {
    success: { type: "boolean", enum: [false] },
    data: { nullable: true },
    error: {
      type: "object",
      properties: {
        code: { type: "string" },
        message: { type: "string" },
        details: {}
      },
      required: ["code", "message"]
    },
    meta: {
      type: "object",
      properties: {
        request_id: { type: "string" },
        timestamp: { type: "string", format: "date-time" }
      }
    }
  },
  required: ["success", "error", "meta"]
};

export function buildOpenApiSpec() {
  return {
    openapi: "3.0.3",
    info: {
      title: "one-api",
      version: "1.0.0",
      description: "Unified adapter platform API"
    },
    servers: [{ url: "http://localhost:3000" }],
    paths: {
      "/v1/adapters/generate": {
        post: {
          summary: "Generate adapter",
          requestBody: {
            required: true,
            content: jsonContent
          },
          responses: {
            "201": {
              description: "Adapter generated",
              content: jsonContent
            },
            "422": { description: "Validation error", content: { "application/json": { schema: errorSchema } } }
          }
        }
      },
      "/v1/adapters": {
        get: {
          summary: "List adapters",
          responses: {
            "200": { description: "Adapter list", content: jsonContent }
          }
        }
      },
      "/v1/execute": {
        post: {
          summary: "Execute unified API",
          requestBody: {
            required: true,
            content: jsonContent
          },
          responses: {
            "200": { description: "Execution result", content: jsonContent },
            "422": { description: "Validation error", content: { "application/json": { schema: errorSchema } } }
          }
        }
      },
      "/v1/secrets": {
        get: {
          summary: "List secrets",
          responses: {
            "200": { description: "Secret list", content: jsonContent }
          }
        },
        post: {
          summary: "Save secret",
          requestBody: {
            required: true,
            content: jsonContent
          },
          responses: {
            "201": { description: "Saved", content: jsonContent },
            "422": { description: "Validation error", content: { "application/json": { schema: errorSchema } } }
          }
        }
      },
      "/v1/executions": {
        get: {
          summary: "List executions",
          responses: {
            "200": { description: "Execution list", content: jsonContent }
          }
        }
      },
      "/v1/openapi.json": {
        get: {
          summary: "OpenAPI schema",
          responses: {
            "200": {
              description: "OpenAPI spec",
              content: {
                "application/json": {
                  schema: {
                    type: "object"
                  }
                }
              }
            }
          }
        }
      }
    }
  };
}
