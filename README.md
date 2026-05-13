# Signal Desk

Signal Desk is a local-first news and market briefing app. It collects RSS news, ranks high-signal items, streams LLM-generated briefings, saves reports to local files, and supports both local llama.cpp and cloud OpenAI-compatible models.

## Features

- Morning and evening news briefings
- Market intelligence scans with Finnhub quotes
- Streaming LLM output with reasoning preview
- Local file storage in `reports/`
- Archive calendar view by date
- Prompt templates in `src/prompts/`
- Runtime switch between `local` and `cloud`
- Coverage modes: `Fast`, `Balanced`, `Wide`

## Requirements

- Node.js
- An OpenAI-compatible chat completions endpoint
- Optional: Finnhub API key for market data

For local inference, run a llama.cpp server separately.

## Setup

Install dependencies:

```bash
npm install
```

Create `.env.local` from `.env.example`:

```env
LOCAL_LLM_API_KEY="local"
LOCAL_LLM_BASE_URL="http://127.0.0.1:8080/v1"
LOCAL_LLM_MODEL="Qwen3-8B-Q6_K.gguf"

CLOUD_LLM_API_KEY=""
CLOUD_LLM_BASE_URL=""
CLOUD_LLM_MODEL=""

FINNHUB_API_KEY=""
```

Run the app:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## Local llama.cpp Example

Example PowerShell command:

```powershell
& "F:\AI-related\llama-b9093-bin-win-cuda-12.4-x64\llama-server.exe" -m "F:\AI-related\models\Qwen3-8B-Q6_K.gguf" --host 127.0.0.1 --port 8080 -c 8192 -ngl 999
```

Example Git Bash command:

```bash
"/f/AI-related/llama-b9093-bin-win-cuda-12.4-x64/llama-server.exe" -m "/f/AI-related/models/Qwen3-8B-Q6_K.gguf" --host 127.0.0.1 --port 8080 -c 8192 -ngl 999
```

Then use:

```env
LOCAL_LLM_BASE_URL="http://127.0.0.1:8080/v1"
LOCAL_LLM_MODEL="Qwen3-8B-Q6_K.gguf"
```

## Cloud Model Example

Any provider that supports OpenAI-compatible `POST /v1/chat/completions` with streaming should work.

Example:

```env
CLOUD_LLM_API_KEY="your-api-key"
CLOUD_LLM_BASE_URL="https://api.openai.com/v1"
CLOUD_LLM_MODEL="gpt-4.1-mini"
```

Provider compatibility can vary around streaming chunks, reasoning fields, `max_tokens`, and model-specific parameters.

## Reports

Reports are saved locally under:

```text
reports/
```

Each final report is written as both `.json` and `.md`. Draft files use `.draft.json` and `.draft.md` while generation is running. The `reports/` directory is ignored by git.

## Prompts

Prompt templates live in:

```text
src/prompts/
```

Current templates:

- `morning-report.md`
- `evening-report.md`
- `market-intelligence.md`
- `system-report.md`
- `final-output-instruction.md`

## Scripts

```bash
npm run dev      # start Express + Vite dev server
npm run lint     # TypeScript check
npm run build    # production build
npm run preview  # preview production build
```

## Notes

- Report dates are stored with the America/Los_Angeles timezone offset.
- Market data uses Finnhub when `FINNHUB_API_KEY` is set.
- The app keeps a legacy localStorage migration key for older AI Studio reports.
