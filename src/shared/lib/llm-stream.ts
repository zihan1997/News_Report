import { LlmRuntime, NewsReport } from "../../types";

export type StreamCallbacks = {
  onLog?: (message: string) => void;
  onToken?: (delta: string, content: string) => void;
  onReasoning?: (delta: string, content: string) => void;
};

export async function streamLlmReport(
  prompt: string,
  report: NewsReport,
  runtime: LlmRuntime,
  callbacks: StreamCallbacks = {},
  maxTokens = 2048
) {
  const response = await fetch("/api/generate-news-stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, maxTokens, report, runtime }),
  });

  if (!response.ok || !response.body) {
    const errorText = await response.text();
    throw new Error(errorText || `LLM stream request failed: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let reasoning = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() || "";

    for (const eventText of events) {
      const dataLine = eventText.split("\n").find((line) => line.startsWith("data: "));
      if (!dataLine) continue;

      const event = JSON.parse(dataLine.slice(6));
      if (event.type === "log") {
        callbacks.onLog?.(event.message);
      } else if (event.type === "token") {
        content += event.delta;
        callbacks.onToken?.(event.delta, content);
      } else if (event.type === "reasoning") {
        reasoning += event.delta;
        callbacks.onReasoning?.(event.delta, reasoning);
      } else if (event.type === "done") {
        callbacks.onLog?.(`Done. Streamed ${event.tokenCount} content chunks, ${event.reasoningCount || 0} reasoning chunks.`);
        return event.content || content;
      } else if (event.type === "error") {
        throw new Error(event.error || "LLM stream failed.");
      }
    }
  }

  return content.trim();
}
