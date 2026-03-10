# Agent Task Governor

A scheduler + garbage collector for the agentic runtime. Built as a [Join39](https://join39.org) App.

Agents call this tool to reprioritize their task queue, detect stale or obsolete work, and get recommendations on what to execute, defer, or prune.

## Quick Start

```bash
npm install
npm start        # runs on port 3000
npm test         # runs test suite
```

## API

### `GET /health`
Returns `{ "status": "ok", "version": "1.0.0" }`

### `POST /api/govern`
Send a JSON body with `tasks` array, optional `policy` ("conservative" | "balanced" | "aggressive"), and optional `currentTime` (ISO 8601).

Returns prioritized task list with actions: `execute`, `defer`, `confirm_with_user`, or `disable`.

## Deployment

Configured for Railway. Push to GitHub and connect to Railway for automatic HTTPS deployment.
