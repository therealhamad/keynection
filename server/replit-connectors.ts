/**
 * Replit Connectors Integration
 * 
 * This module provides integration with Replit's first-party connectors.
 * When you activate connectors on Replit (like Google Workspace, Linear, etc.),
 * Replit may expose access tokens via environment variables that we can use.
 * 
 * For some connectors, Replit's Agent handles the API calls directly.
 * For custom server code, we need to use the tokens exposed by Replit.
 */

import type { Express, Request, Response } from "express";
import { google } from "googleapis";
import { z } from "zod";
import { storage } from "./storage";

// ============================================================
// REPLIT CONNECTOR TOKEN DETECTION
// ============================================================

interface ConnectorStatus {
  name: string;
  connected: boolean;
  source?: string;
}

// Check which Replit connectors have exposed tokens
function detectConnectors(): Record<string, ConnectorStatus> {
  const connectors: Record<string, ConnectorStatus> = {};
  
  // Google connectors - check various possible env var names
  const googleTokenVars = [
    'GOOGLE_ACCESS_TOKEN',
    'GOOGLE_REFRESH_TOKEN',
    'REPLIT_GOOGLE_ACCESS_TOKEN',
    'GOOGLE_SERVICE_ACCOUNT_JSON',
    'SERVICE_ACCOUNT_JSON',
    'GOOGLE_APPLICATION_CREDENTIALS'
  ];
  
  const hasGoogleToken = googleTokenVars.some(v => !!process.env[v]);
  
  if (hasGoogleToken) {
    connectors['google-mail'] = { name: 'Gmail', connected: true, source: 'env' };
    connectors['google-calendar'] = { name: 'Google Calendar', connected: true, source: 'env' };
    connectors['google-docs'] = { name: 'Google Docs', connected: true, source: 'env' };
    connectors['google-sheets'] = { name: 'Google Sheets', connected: true, source: 'env' };
    connectors['google-drive'] = { name: 'Google Drive', connected: true, source: 'env' };
  }
  
  // Linear
  const linearTokenVars = ['LINEAR_API_KEY', 'REPLIT_LINEAR_API_KEY', 'LINEAR_ACCESS_TOKEN'];
  if (linearTokenVars.some(v => !!process.env[v])) {
    connectors['linear'] = { name: 'Linear', connected: true, source: 'env' };
  }
  
  // Notion
  const notionTokenVars = ['NOTION_API_KEY', 'NOTION_TOKEN', 'REPLIT_NOTION_TOKEN'];
  if (notionTokenVars.some(v => !!process.env[v])) {
    connectors['notion'] = { name: 'Notion', connected: true, source: 'env' };
  }
  
  // GitHub
  const githubTokenVars = ['GITHUB_TOKEN', 'GITHUB_ACCESS_TOKEN', 'REPLIT_GITHUB_TOKEN'];
  if (githubTokenVars.some(v => !!process.env[v])) {
    connectors['github'] = { name: 'GitHub', connected: true, source: 'env' };
  }
  
  // Discord (webhook or bot token)
  const discordVars = ['DISCORD_WEBHOOK_URL', 'DISCORD_BOT_TOKEN', 'DISCORD_TOKEN'];
  if (discordVars.some(v => !!process.env[v])) {
    connectors['discord'] = { name: 'Discord', connected: true, source: 'env' };
  }
  
  // Slack
  const slackVars = ['SLACK_WEBHOOK_URL', 'SLACK_BOT_TOKEN', 'SLACK_TOKEN'];
  if (slackVars.some(v => !!process.env[v])) {
    connectors['slack'] = { name: 'Slack', connected: true, source: 'env' };
  }
  
  return connectors;
}

// Get Google OAuth2 client from available credentials
function getGoogleAuth(): ReturnType<typeof google.auth.OAuth2.prototype.setCredentials> | null {
  // Try service account first
  const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.SERVICE_ACCOUNT_JSON;
  if (serviceAccountJson) {
    try {
      const credentials = JSON.parse(serviceAccountJson);
      const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: [
          'https://www.googleapis.com/auth/gmail.send',
          'https://www.googleapis.com/auth/calendar',
          'https://www.googleapis.com/auth/documents',
          'https://www.googleapis.com/auth/spreadsheets',
          'https://www.googleapis.com/auth/drive'
        ]
      });
      return auth as any;
    } catch (e) {
      console.error('Failed to parse service account JSON:', e);
    }
  }
  
  // Try OAuth tokens
  const accessToken = process.env.GOOGLE_ACCESS_TOKEN || process.env.REPLIT_GOOGLE_ACCESS_TOKEN;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  
  if (accessToken) {
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken
    });
    return oauth2Client as any;
  }
  
  return null;
}

// Get Linear API key
function getLinearToken(): string | null {
  return process.env.LINEAR_API_KEY || process.env.REPLIT_LINEAR_API_KEY || process.env.LINEAR_ACCESS_TOKEN || null;
}

// Get Notion token
function getNotionToken(): string | null {
  return process.env.NOTION_API_KEY || process.env.NOTION_TOKEN || process.env.REPLIT_NOTION_TOKEN || null;
}

// Get GitHub token
function getGitHubToken(): string | null {
  return process.env.GITHUB_TOKEN || process.env.GITHUB_ACCESS_TOKEN || process.env.REPLIT_GITHUB_TOKEN || null;
}

// Get Discord webhook
function getDiscordWebhook(): string | null {
  return process.env.DISCORD_WEBHOOK_URL || null;
}

// ============================================================
// SCHEMA VALIDATIONS
// ============================================================

const sendEmailSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1),
  body: z.string().min(1),
});

const createCalendarEventSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  startTime: z.string(),
  endTime: z.string(),
  attendees: z.array(z.string().email()).optional(),
  location: z.string().optional(),
});

const createDocSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
});

const appendSheetRowSchema = z.object({
  spreadsheetId: z.string().min(1),
  sheetName: z.string().optional().default("Sheet1"),
  values: z.array(z.any()),
});

const createLinearIssueSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  teamId: z.string().optional(),
  priority: z.number().min(0).max(4).optional(),
  labels: z.array(z.string()).optional(),
});

const sendDiscordMessageSchema = z.object({
  content: z.string().min(1),
});

// ============================================================
// ROUTES
// ============================================================

export function registerReplitConnectorRoutes(app: Express): void {
  
  // Status endpoint - shows which connectors are available
  app.get("/api/connectors/status", (_req: Request, res: Response) => {
    const connectors = detectConnectors();
    const connected = Object.values(connectors).filter(c => c.connected).length;
    
    res.json({
      connected: connected > 0,
      message: connected > 0 
        ? `${connected} Replit connectors detected` 
        : "No connector tokens found. Add API keys to Replit Secrets.",
      connectors,
      hint: "Set environment variables like GOOGLE_SERVICE_ACCOUNT_JSON, LINEAR_API_KEY, NOTION_API_KEY, etc."
    });
  });

  // ==================== GMAIL ====================
  
  app.post("/api/connectors/gmail/send", async (req: Request, res: Response) => {
    try {
      const parsed = sendEmailSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
      }

      const auth = getGoogleAuth();
      if (!auth) {
        return res.status(401).json({ 
          error: "Google not configured",
          hint: "Add GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_ACCESS_TOKEN to Replit Secrets"
        });
      }

      const gmail = google.gmail({ version: 'v1', auth: auth as any });
      const { to, subject, body } = parsed.data;

      // Build RFC 2822 email
      const email = [
        `To: ${to}`,
        `Subject: ${subject}`,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=utf-8',
        '',
        body
      ].join('\r\n');

      const encodedEmail = Buffer.from(email).toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      const result = await gmail.users.messages.send({
        userId: 'me',
        requestBody: { raw: encodedEmail }
      });

      await storage.createActionLog({
        actionType: "gmail-send",
        title: `Email sent: ${subject}`,
        description: `To: ${to}`,
        status: "completed",
        integration: "Gmail (Replit)",
        inputData: { to, subject },
        outputData: { messageId: result.data.id },
      });

      res.json({ success: true, messageId: result.data.id });
    } catch (error: any) {
      console.error("Gmail send error:", error);
      res.status(500).json({ error: error.message || "Failed to send email" });
    }
  });

  // ==================== GOOGLE CALENDAR ====================

  app.post("/api/connectors/calendar/events", async (req: Request, res: Response) => {
    try {
      const parsed = createCalendarEventSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
      }

      const auth = getGoogleAuth();
      if (!auth) {
        return res.status(401).json({ error: "Google not configured" });
      }

      const calendar = google.calendar({ version: 'v3', auth: auth as any });
      const { title, description, startTime, endTime, attendees, location } = parsed.data;

      const result = await calendar.events.insert({
        calendarId: 'primary',
        requestBody: {
          summary: title,
          description,
          location,
          start: { dateTime: startTime, timeZone: 'UTC' },
          end: { dateTime: endTime, timeZone: 'UTC' },
          attendees: attendees?.map(email => ({ email })),
        }
      });

      await storage.createActionLog({
        actionType: "calendar-create",
        title: `Meeting created: ${title}`,
        description: `${startTime} - ${endTime}`,
        status: "completed",
        integration: "Google Calendar (Replit)",
        inputData: parsed.data,
        outputData: { eventId: result.data.id, link: result.data.htmlLink },
      });

      res.json({ success: true, eventId: result.data.id, link: result.data.htmlLink });
    } catch (error: any) {
      console.error("Calendar create error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== GOOGLE DOCS ====================

  app.post("/api/connectors/docs/create", async (req: Request, res: Response) => {
    try {
      const parsed = createDocSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
      }

      const auth = getGoogleAuth();
      if (!auth) {
        return res.status(401).json({ error: "Google not configured" });
      }

      const docs = google.docs({ version: 'v1', auth: auth as any });
      const { title, content } = parsed.data;

      // Create document
      const createResult = await docs.documents.create({
        requestBody: { title }
      });

      const documentId = createResult.data.documentId!;

      // Insert content
      await docs.documents.batchUpdate({
        documentId,
        requestBody: {
          requests: [{
            insertText: {
              location: { index: 1 },
              text: content
            }
          }]
        }
      });

      const docUrl = `https://docs.google.com/document/d/${documentId}/edit`;

      await storage.createActionLog({
        actionType: "docs-create",
        title: `Doc created: ${title}`,
        description: content.substring(0, 100) + "...",
        status: "completed",
        integration: "Google Docs (Replit)",
        inputData: { title },
        outputData: { documentId, url: docUrl },
      });

      res.json({ success: true, documentId, url: docUrl });
    } catch (error: any) {
      console.error("Docs create error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== GOOGLE SHEETS ====================

  app.post("/api/connectors/sheets/append", async (req: Request, res: Response) => {
    try {
      const parsed = appendSheetRowSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
      }

      const auth = getGoogleAuth();
      if (!auth) {
        return res.status(401).json({ error: "Google not configured" });
      }

      const sheets = google.sheets({ version: 'v4', auth: auth as any });
      const { spreadsheetId, sheetName, values } = parsed.data;

      const result = await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${sheetName}!A:Z`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [values] }
      });

      await storage.createActionLog({
        actionType: "sheets-append",
        title: `Row added to sheet`,
        description: `${values.length} values added`,
        status: "completed",
        integration: "Google Sheets (Replit)",
        inputData: { spreadsheetId, values },
        outputData: result.data,
      });

      res.json({ success: true, updatedRange: result.data.updates?.updatedRange });
    } catch (error: any) {
      console.error("Sheets append error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/connectors/sheets/list", async (_req: Request, res: Response) => {
    try {
      const auth = getGoogleAuth();
      if (!auth) {
        return res.json({ spreadsheets: [] });
      }

      const drive = google.drive({ version: 'v3', auth: auth as any });
      
      const result = await drive.files.list({
        q: "mimeType='application/vnd.google-apps.spreadsheet'",
        pageSize: 20,
        fields: 'files(id, name)'
      });

      const spreadsheets = (result.data.files || []).map(f => ({
        id: f.id,
        name: f.name
      }));

      res.json({ spreadsheets });
    } catch (error: any) {
      console.error("Sheets list error:", error);
      res.json({ spreadsheets: [] });
    }
  });

  // ==================== LINEAR ====================

  app.post("/api/connectors/linear/issues", async (req: Request, res: Response) => {
    try {
      const parsed = createLinearIssueSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
      }

      const apiKey = getLinearToken();
      if (!apiKey) {
        return res.status(401).json({ 
          error: "Linear not configured",
          hint: "Add LINEAR_API_KEY to Replit Secrets"
        });
      }

      const { title, description, teamId, priority } = parsed.data;

      // If no teamId, fetch first available team
      let targetTeamId = teamId;
      if (!targetTeamId) {
        const teamsResponse = await fetch('https://api.linear.app/graphql', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': apiKey
          },
          body: JSON.stringify({
            query: `{ teams { nodes { id name } } }`
          })
        });
        const teamsData = await teamsResponse.json() as any;
        targetTeamId = teamsData?.data?.teams?.nodes?.[0]?.id;
      }

      if (!targetTeamId) {
        return res.status(400).json({ error: "No Linear team available" });
      }

      const response = await fetch('https://api.linear.app/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': apiKey
        },
        body: JSON.stringify({
          query: `
            mutation CreateIssue($input: IssueCreateInput!) {
              issueCreate(input: $input) {
                success
                issue {
                  id
                  identifier
                  url
                }
              }
            }
          `,
          variables: {
            input: {
              teamId: targetTeamId,
              title,
              description,
              priority
            }
          }
        })
      });

      const data = await response.json() as any;
      
      if (!data?.data?.issueCreate?.success) {
        throw new Error(data?.errors?.[0]?.message || "Failed to create issue");
      }

      const issue = data.data.issueCreate.issue;

      await storage.createActionLog({
        actionType: "linear-create",
        title: `Linear issue: ${title}`,
        description: description?.substring(0, 100),
        status: "completed",
        integration: "Linear (Replit)",
        inputData: { title, priority },
        outputData: issue,
      });

      res.json({ success: true, ...issue });
    } catch (error: any) {
      console.error("Linear create error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/connectors/linear/teams", async (_req: Request, res: Response) => {
    try {
      const apiKey = getLinearToken();
      if (!apiKey) {
        return res.json({ teams: [] });
      }

      const response = await fetch('https://api.linear.app/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': apiKey
        },
        body: JSON.stringify({
          query: `{ teams { nodes { id name key } } }`
        })
      });

      const data = await response.json() as any;
      const teams = data?.data?.teams?.nodes || [];

      res.json({ teams });
    } catch (error: any) {
      console.error("Linear teams error:", error);
      res.json({ teams: [] });
    }
  });

  // ==================== DISCORD ====================

  app.post("/api/connectors/discord/send", async (req: Request, res: Response) => {
    try {
      const parsed = sendDiscordMessageSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
      }

      const webhookUrl = getDiscordWebhook();
      if (!webhookUrl) {
        return res.status(401).json({ 
          error: "Discord not configured",
          hint: "Add DISCORD_WEBHOOK_URL to Replit Secrets"
        });
      }

      const { content } = parsed.data;

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          username: 'Keynection'
        })
      });

      if (!response.ok) {
        throw new Error(`Discord webhook failed: ${response.status}`);
      }

      await storage.createActionLog({
        actionType: "discord-send",
        title: "Discord message sent",
        description: content.substring(0, 100),
        status: "completed",
        integration: "Discord (Replit)",
        inputData: { content: content.substring(0, 100) },
        outputData: { success: true },
      });

      res.json({ success: true });
    } catch (error: any) {
      console.error("Discord send error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== NOTION ====================

  app.post("/api/connectors/notion/pages", async (req: Request, res: Response) => {
    try {
      const token = getNotionToken();
      if (!token) {
        return res.status(401).json({ 
          error: "Notion not configured",
          hint: "Add NOTION_API_KEY to Replit Secrets"
        });
      }

      const { parentId, title, content } = req.body;

      if (!parentId || !title) {
        return res.status(400).json({ error: "parentId and title are required" });
      }

      const response = await fetch('https://api.notion.com/v1/pages', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Notion-Version': '2022-06-28'
        },
        body: JSON.stringify({
          parent: { page_id: parentId },
          properties: {
            title: { title: [{ text: { content: title } }] }
          },
          children: (content || '').split('\n\n').slice(0, 50).map((paragraph: string) => ({
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: [{ type: 'text', text: { content: paragraph.substring(0, 2000) } }]
            }
          }))
        })
      });

      if (!response.ok) {
        const error = await response.json() as any;
        throw new Error(error.message || `Notion API error: ${response.status}`);
      }

      const result = await response.json() as any;

      await storage.createActionLog({
        actionType: "notion-create",
        title: `Notion page: ${title}`,
        description: content?.substring(0, 100),
        status: "completed",
        integration: "Notion (Replit)",
        inputData: { title, parentId },
        outputData: { id: result.id, url: result.url },
      });

      res.json({ success: true, id: result.id, url: result.url });
    } catch (error: any) {
      console.error("Notion create error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/connectors/notion/search", async (req: Request, res: Response) => {
    try {
      const token = getNotionToken();
      if (!token) {
        return res.json({ results: [] });
      }

      const query = (req.query.query as string) || '';

      const response = await fetch('https://api.notion.com/v1/search', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Notion-Version': '2022-06-28'
        },
        body: JSON.stringify({
          query,
          filter: { property: 'object', value: 'page' },
          page_size: 20
        })
      });

      if (!response.ok) {
        return res.json({ results: [] });
      }

      const data = await response.json() as any;
      res.json({ results: data.results || [] });
    } catch (error: any) {
      console.error("Notion search error:", error);
      res.json({ results: [] });
    }
  });

  // ==================== GITHUB ====================

  app.get("/api/connectors/github/activity", async (_req: Request, res: Response) => {
    try {
      const token = getGitHubToken();
      if (!token) {
        return res.json({ commits: [] });
      }

      // Get authenticated user
      const userResponse = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      if (!userResponse.ok) {
        return res.json({ commits: [] });
      }

      const user = await userResponse.json() as any;
      const username = user.login;

      // Get user events from last 24 hours
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const eventsResponse = await fetch(
        `https://api.github.com/users/${username}/events?per_page=100`,
        {
          headers: {
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github.v3+json'
          }
        }
      );

      if (!eventsResponse.ok) {
        return res.json({ commits: [] });
      }

      const events = await eventsResponse.json() as any[];
      const commits: any[] = [];

      for (const event of events) {
        if (event.type === 'PushEvent' && new Date(event.created_at) > cutoff) {
          for (const commit of event.payload?.commits || []) {
            commits.push({
              message: commit.message.split('\n')[0],
              repo: event.repo?.name,
              sha: commit.sha?.substring(0, 7),
              time: event.created_at
            });
          }
        }
      }

      res.json({ commits: commits.slice(0, 20) });
    } catch (error: any) {
      console.error("GitHub activity error:", error);
      res.json({ commits: [] });
    }
  });
}
