# AV CLI (V1)

## Install (local)

```bash
cd cli
npm install
npm run build
```

Run with:

```bash
node dist/index.js --help
```

## Commands

### 1) Init

```bash
node dist/index.js init \
  --profile default \
  --backend-url http://127.0.0.1:3000 \
  --token your_platform_token \
  --workspace-id default \
  --adapter-dir ./adapters
```

### 2) Generate adapter

```bash
node dist/index.js gen \
  -f ./sample.curl \
  -t curl \
  --api-slug reqres \
  --action users
```

### 3) Run adapter

```bash
node dist/index.js run reqres \
  --action users \
  --payload "{\"page\":2}" \
  --include-hint
```

### 4) Stream logs

```bash
node dist/index.js logs --tail 10
```

### 5) Set secret

```bash
node dist/index.js secrets set openai_api_key=sk-xxxx
```

## Config precedence

Read order:

1. Environment variables
2. Project config (`.av-cli.json`)
3. Global config (`~/.config/av-cli/config.json` or OS equivalent)

Supported env keys:

- `AV_CLI_PROFILE`
- `AV_CLI_BACKEND_URL`
- `AV_CLI_TOKEN`
- `AV_CLI_WORKSPACE_ID`
- `AV_CLI_ADAPTER_DIR`
- `AV_CLI_PREFERRED_MODEL`

## Local context snapshots

Generated under:

- `.av-cli/context/index.json`
- `.av-cli/context/<slug>.<action>.json`

`gen` writes pending snapshots. `secrets set` refreshes local readiness metadata.

## Smoke checklist

```bash
cd cli
npm run test
node dist/index.js --help
```
