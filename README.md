<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Signal Desk

Local-first news and market briefing app with streaming LLM output, file-based report storage, and support for both local llama.cpp and cloud OpenAI-compatible models.

## Run Locally

**Prerequisites:**  Node.js

1. Install dependencies:
   `npm install`
2. Configure [.env.local](.env.local):
   - `LOCAL_LLM_BASE_URL`
   - `LOCAL_LLM_MODEL`
   - optional `CLOUD_LLM_BASE_URL`, `CLOUD_LLM_MODEL`, `CLOUD_LLM_API_KEY`
   - optional `FINNHUB_API_KEY`
3. Run the app:
   `npm run dev`
