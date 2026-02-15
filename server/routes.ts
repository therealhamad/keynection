import type { Express } from "express";
import { createServer, type Server } from "http";
import { z } from "zod";
import { storage } from "./storage";
import { seedDatabase } from "./seed";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
});

const executeActionSchema = z.object({
  actionId: z.string().min(1),
  input: z.object({
    title: z.string().min(1),
    url: z.string().optional().default(""),
    content: z.string().optional().default(""),
    recipient: z.string().optional().default(""),
  }),
});

const updateIntegrationSchema = z.object({
  connected: z.boolean().optional(),
});

function getPromptForAction(actionId: string, input: { title: string; content: string; url: string; recipient: string }): string {
  const prompts: Record<string, string> = {
    "email-page": `Generate a professional email from this content:

Title: ${input.title}
URL: ${input.url || "N/A"}
Content: ${input.content}

Requirements:
- Subject: Clear, max 60 chars
- Body: 100-150 words, professional tone
- Include source URL if provided
- If text is selected, format as quote

Return JSON only: {"subject": "...", "body": "..."}`,

    "save-notion": `Structure this article for Notion:

Title: ${input.title}
Content: ${input.content}

Create:
- Title (clear, concise)
- Summary (3-5 bullet points)
- Key Points (important takeaways)
- Tags (3-5 relevant tags)

Return JSON only: {"title": "...", "summary": ["...", "..."], "keyPoints": ["...", "..."], "tags": ["...", "..."]}`,

    "extract-tasks": `Extract action items from:

${input.content || input.title}

For each task:
- Description (clear, actionable)
- Assignee (name or "Unassigned")
- Due date (YYYY-MM-DD or null)
- Priority (high/medium/low based on urgency)

Return JSON array only: [{"task": "...", "assignee": "...", "dueDate": "...", "priority": "..."}]`,

    "generate-standup": `Generate a Slack-style standup update based on the following context:

Context: ${input.content || input.title}

Format:
**Yesterday**
- Accomplishments

**Today**
- Planned work

**Blockers**
- Any blockers or none

Use markdown, keep under 250 words.

Return JSON only: {"standup": "..."}`,

    "smart-reply": `Analyze this email and generate 3 reply options:

Subject: ${input.title}
Body: ${input.content}

Generate:
1. Professional: Formal, comprehensive response
2. Friendly: Warm, personable tone
3. Brief: Quick, to-the-point reply

All replies should be 50-150 words each.

Return JSON only: {"professional": "...", "friendly": "...", "brief": "..."}`,

    "report-bug": `Create a Linear bug report:

Error/Issue: ${input.content || input.title}
URL: ${input.url || "N/A"}

Generate structured report:
- Title: Clear, descriptive (max 80 chars)
- Description with steps to reproduce, expected behavior, and actual behavior
- Severity: high/medium/low
- Labels

Return JSON only: {"title": "...", "description": "...", "severity": "...", "labels": ["bug", "..."]}`,

    "save-docs": `Format this content for Google Docs:

Title: ${input.title}
Content: ${input.content}

Create structured document:
- Title (clear, engaging)
- Summary (2-3 sentences)
- Key sections with headers
- Source URL if available

Return JSON only: {"title": "...", "summary": "...", "sections": [{"heading": "...", "content": "..."}]}`,

    "schedule-meeting": `Extract meeting details from:

Text: ${input.content || input.title}

Extract:
- Title: Meeting topic/purpose
- Participants: Any mentioned names or emails
- Date/Time: Parse relative dates
- Duration: Infer or default 30 min
- Description: Brief agenda

Return JSON only: {"title": "...", "participants": [], "dateTime": "...", "duration": 30, "description": "..."}`,

    "share-discord": `Adapt this content for Discord:

Title: ${input.title}
Content: ${input.content}
URL: ${input.url || "N/A"}

Create Discord message:
- Casual, conversational tone
- Discord markdown (** bold **, * italic *)
- 2-4 bullet points for key points
- Include source link if available
- Under 200 words

Return JSON only: {"message": "...", "suggestedChannel": "general"}`,

    "log-sheets": `Extract structured data from:

Content: ${input.content || input.title}

Identify:
- Fields (column names)
- Values (data to log)

Return JSON only: {"fields": ["Date", "Title", "URL", "Notes"], "values": ["...", "...", "...", "..."]}`,

    "github-comment": `Generate a helpful GitHub comment for this issue/PR:

Context: ${input.content || input.title}
URL: ${input.url || "N/A"}

Create:
- Thoughtful, helpful response
- Code suggestions if applicable
- Links to relevant docs if known

Return JSON only: {"comment": "...", "type": "review|suggestion|question"}`,

    "save-drive": `Organize this content for Google Drive:

Title: ${input.title}
Content: ${input.content}

Suggest:
- Filename
- Folder structure
- File format
- Summary

Return JSON only: {"filename": "...", "folder": "...", "format": "doc", "summary": "..."}`,
  };

  return prompts[actionId] || `Process this content and return structured JSON:

Title: ${input.title}
Content: ${input.content}

Return JSON with relevant fields.`;
}

function parseClaudeResponse(response: string): any {
  const cleaned = response
    .replace(/```json\n?/g, "")
    .replace(/\n?```/g, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const jsonMatch = cleaned.match(/[\[{][\s\S]*[\]}]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return { result: cleaned };
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await seedDatabase();

  app.get("/api/integrations", async (_req, res) => {
    try {
      const data = await storage.getIntegrations();
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/integrations/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid integration ID" });
      }
      const parsed = updateIntegrationSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request body", errors: parsed.error.flatten() });
      }
      const updated = await storage.updateIntegration(id, parsed.data);
      if (!updated) return res.status(404).json({ message: "Integration not found" });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/action-logs", async (_req, res) => {
    try {
      const data = await storage.getActionLogs();
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/actions/execute", async (req, res) => {
    try {
      const parsed = executeActionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request", errors: parsed.error.flatten() });
      }

      const { actionId, input } = parsed.data;
      const prompt = getPromptForAction(actionId, input);

      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 8192,
        messages: [{ role: "user", content: prompt }],
      });

      const responseText = message.content[0].type === "text" ? message.content[0].text : "";
      const result = parseClaudeResponse(responseText);

      const actionNames: Record<string, string> = {
        "email-page": "Email This Page",
        "save-notion": "Save to Notion",
        "extract-tasks": "Extract Tasks",
        "generate-standup": "Generate Standup",
        "smart-reply": "Smart Email Reply",
        "report-bug": "Report Bug",
        "save-docs": "Save to Google Docs",
        "schedule-meeting": "Schedule Meeting",
        "share-discord": "Share to Discord",
        "log-sheets": "Log to Sheets",
        "github-comment": "GitHub Comment",
        "save-drive": "Save to Drive",
      };

      const integrationMap: Record<string, string> = {
        "email-page": "Gmail",
        "save-notion": "Notion",
        "extract-tasks": "Linear",
        "generate-standup": "Multi",
        "smart-reply": "Gmail",
        "report-bug": "Linear",
        "save-docs": "Google Docs",
        "schedule-meeting": "Google Calendar",
        "share-discord": "Discord",
        "log-sheets": "Google Sheets",
        "github-comment": "GitHub",
        "save-drive": "Google Drive",
      };

      await storage.createActionLog({
        actionType: actionId,
        title: `${actionNames[actionId] || actionId}: ${input.title}`,
        description: input.content?.substring(0, 200) || null,
        status: "completed",
        integration: integrationMap[actionId] || "Unknown",
        inputData: input,
        outputData: result,
      });

      res.json({ result });
    } catch (error: any) {
      console.error("Action execution error:", error);
      res.status(500).json({ message: error.message || "Failed to execute action" });
    }
  });

  return httpServer;
}
