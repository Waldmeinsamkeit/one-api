# one-api back

## Run

```bash
node src/server.js
```

## Verify

```bash
node scripts/verify.js
```

## API

- `GET /v1/adapters`
- `POST /v1/adapters/generate`
- `POST /v1/adapters/validate`
- `POST /v1/adapters/publish`
- `POST /v1/adapters/dry-run`
- `GET /v1/secrets`
- `POST /v1/secrets`
- `GET /v1/executions`
- `GET /v1/executions/:id`
- `GET /v1/models`
- `POST /v1/models/activate`
