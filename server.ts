import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Ollama / LLM Client
  const openai = new OpenAI({
    apiKey: process.env.OLLAMA_API_KEY || "dummy",
    baseURL: process.env.OLLAMA_BASE_URL || "https://ollama.com/v1",
  });

  const MODEL_NAME = process.env.OLLAMA_MODEL || "minimax-m2.7";

  // API Route for news generation
  app.post("/api/generate-news", async (req, res) => {
    const { type, prompt } = req.body;

    try {
      const response = await openai.chat.completions.create({
        model: MODEL_NAME,
        messages: [
          { 
            role: "system", 
            content: "You are a high-signal news intelligence assistant. Your goal is to provide a final, polished markdown report in Chinese. IMPORTANT: Do not include any intermediate search steps, tool call tags (like [TOOL_CALL]), or descriptions of what you are going to search. Only output the final summarized content." 
          },
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
        // @ts-ignore - Enable web search for Ollama as per docs
        tools: [{ type: "web_search" }]
      });

      let content = response.choices[0].message.content || "";
      
      // Clean up the content:
      // 1. Remove [TOOL_CALL]...[/TOOL_CALL] blocks
      content = content.replace(/\[TOOL_CALL\][\s\S]*?\[\/TOOL_CALL\]/g, "");
      
      // 2. Remove common "thinking" or "searching" prefixes
      // Matches patterns like "我将搜索..." or "I will search..." at the beginning
      content = content.replace(/^(我将|I will|Searching|正在搜索)[\s\S]*?(：|:|\n)/i, "");
      
      // 3. Final trim
      content = content.trim();

      if (!content) {
        throw new Error("The model returned an empty response or only intermediate steps.");
      }

      res.json({ content });
    } catch (error: any) {
      console.error("LLM API Error:", error);
      res.status(500).json({ error: error.message || "Failed to generate news" });
    }
  });

  // Health check endpoint to verify LLM connection
  app.get("/api/health", async (req, res) => {
    try {
      // Simple test call to verify the API key and base URL
      const response = await openai.chat.completions.create({
        model: MODEL_NAME,
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 5,
      });
      
      res.json({ 
        status: "ok", 
        message: "LLM connection successful",
        model: MODEL_NAME,
        baseUrl: process.env.OLLAMA_BASE_URL || "https://ollama.com/v1"
      });
    } catch (error: any) {
      console.error("Health Check Failed:", error);
      res.status(500).json({ 
        status: "error", 
        message: error.message || "Failed to connect to LLM",
        baseUrl: process.env.OLLAMA_BASE_URL || "https://ollama.com/v1"
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
