import type { Express, Request, Response } from "express";
import { google } from "googleapis";
import { LinearClient } from "@linear/sdk";
import { z } from "zod";
import { storage } from "./storage";

// Schema validations
const sendEmailSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1),
  body: z.string().min(1),
  cc: z.string().optional(),
  bcc: z.string().optional(),
});

const createCalendarEventSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  startTime: z.string(), // ISO date string
  endTime: z.string(),   // ISO date string
  attendees: z.array(z.string().email()).optional(),
  location: z.string().optional(),
});

const createDocSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  folderId: z.string().optional(),
});

const appendSheetRowSchema = z.object({
  spreadsheetId: z.string().min(1),
  sheetName: z.string().optional().default("Sheet1"),
  values: z.array(z.any()),
});

const uploadDriveFileSchema = z.object({
  name: z.string().min(1),
  content: z.string().min(1),
  mimeType: z.string().optional().default("text/plain"),
  folderId: z.string().optional(),
});

const createLinearIssueSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  teamId: z.string().optional(),
  priority: z.number().min(0).max(4).optional(),
  labels: z.array(z.string()).optional(),
});

const sendDiscordMessageSchema = z.object({
  webhookUrl: z.string().url(),
  content: z.string().min(1),
  username: z.string().optional(),
});

const createNotionPageSchema = z.object({
  parentId: z.string().min(1),
  parentType: z.enum(["page", "database"]),
  title: z.string().min(1),
  content: z.string().min(1),
});

// Helper to get OAuth2 client with Replit connector tokens
// When using Replit Connectors, you connect services through their UI and Agent generates the code.
// For manual code, we check for environment variables that may be set.
function getGoogleAuthClient(): any {
  // Check various possible env var names for Google access tokens
  const accessToken = 
    process.env.GOOGLE_ACCESS_TOKEN || 
    process.env.REPLIT_GOOGLE_ACCESS_TOKEN ||
    process.env.GAPI_ACCESS_TOKEN ||
    process.env.GMAIL_ACCESS_TOKEN;
    
  const refreshToken = 
    process.env.GOOGLE_REFRESH_TOKEN || 
    process.env.REPLIT_GOOGLE_REFRESH_TOKEN ||
    process.env.GAPI_REFRESH_TOKEN;
  
  // Check for service account credentials (alternative auth method)
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
          'https://www.googleapis.com/auth/drive',
        ],
      });
      return auth as any;
    } catch (e) {
      console.error("Failed to parse service account JSON:", e);
    }
  }
  
  if (!accessToken && !refreshToken) {
    return null;
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  return oauth2Client;
}

// Helper to get Linear client
function getLinearClient(): LinearClient | null {
  const apiKey = process.env.LINEAR_API_KEY || process.env.REPLIT_LINEAR_API_KEY;
  if (!apiKey) return null;
  return new LinearClient({ apiKey });
}

export function registerIntegrationRoutes(app: Express): void {
  
  // ==================== GMAIL ====================
  
  // Send email via Gmail
  app.post("/api/integrations/gmail/send", async (req: Request, res: Response) => {
    try {
      const parsed = sendEmailSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
      }

      const auth = getGoogleAuthClient();
      if (!auth) {
        return res.status(401).json({ error: "Gmail not connected. Please connect via Replit Connectors." });
      }

      const gmail = google.gmail({ version: "v1", auth });
      const { to, subject, body, cc, bcc } = parsed.data;

      // Construct email
      const emailLines = [
        `To: ${to}`,
        ...(cc ? [`Cc: ${cc}`] : []),
        ...(bcc ? [`Bcc: ${bcc}`] : []),
        "Content-Type: text/html; charset=utf-8",
        "MIME-Version: 1.0",
        `Subject: ${subject}`,
        "",
        body.replace(/\n/g, "<br>"),
      ];

      const email = emailLines.join("\r\n");
      const encodedEmail = Buffer.from(email).toString("base64url");

      const result = await gmail.users.messages.send({
        userId: "me",
        requestBody: { raw: encodedEmail },
      });

      // Log the action
      await storage.createActionLog({
        actionType: "gmail-send",
        title: `Email sent: ${subject}`,
        description: `To: ${to}`,
        status: "completed",
        integration: "Gmail",
        inputData: { to, subject },
        outputData: { messageId: result.data.id },
      });

      res.json({ success: true, messageId: result.data.id });
    } catch (error: any) {
      console.error("Gmail send error:", error);
      res.status(500).json({ error: error.message || "Failed to send email" });
    }
  });

  // Get Gmail messages (for smart reply context)
  app.get("/api/integrations/gmail/messages", async (req: Request, res: Response) => {
    try {
      const auth = getGoogleAuthClient();
      if (!auth) {
        return res.status(401).json({ error: "Gmail not connected" });
      }

      const gmail = google.gmail({ version: "v1", auth });
      const maxResults = parseInt(req.query.maxResults as string) || 10;

      const result = await gmail.users.messages.list({
        userId: "me",
        maxResults,
        labelIds: ["INBOX"],
      });

      const messages = await Promise.all(
        (result.data.messages || []).map(async (msg) => {
          const full = await gmail.users.messages.get({
            userId: "me",
            id: msg.id!,
            format: "full",
          });
          const headers = full.data.payload?.headers || [];
          return {
            id: msg.id,
            subject: headers.find((h) => h.name === "Subject")?.value,
            from: headers.find((h) => h.name === "From")?.value,
            date: headers.find((h) => h.name === "Date")?.value,
            snippet: full.data.snippet,
          };
        })
      );

      res.json({ messages });
    } catch (error: any) {
      console.error("Gmail list error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== GOOGLE CALENDAR ====================

  // Create calendar event
  app.post("/api/integrations/calendar/events", async (req: Request, res: Response) => {
    try {
      const parsed = createCalendarEventSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
      }

      const auth = getGoogleAuthClient();
      if (!auth) {
        return res.status(401).json({ error: "Calendar not connected" });
      }

      const calendar = google.calendar({ version: "v3", auth });
      const { title, description, startTime, endTime, attendees, location } = parsed.data;

      const event = await calendar.events.insert({
        calendarId: "primary",
        requestBody: {
          summary: title,
          description,
          location,
          start: { dateTime: startTime, timeZone: "UTC" },
          end: { dateTime: endTime, timeZone: "UTC" },
          attendees: attendees?.map((email) => ({ email })),
        },
        sendUpdates: "all",
      });

      await storage.createActionLog({
        actionType: "calendar-create",
        title: `Meeting created: ${title}`,
        description: `${startTime} - ${endTime}`,
        status: "completed",
        integration: "Google Calendar",
        inputData: parsed.data,
        outputData: { eventId: event.data.id, htmlLink: event.data.htmlLink },
      });

      res.json({ success: true, eventId: event.data.id, htmlLink: event.data.htmlLink });
    } catch (error: any) {
      console.error("Calendar create error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // List calendar events
  app.get("/api/integrations/calendar/events", async (req: Request, res: Response) => {
    try {
      const auth = getGoogleAuthClient();
      if (!auth) {
        return res.status(401).json({ error: "Calendar not connected" });
      }

      const calendar = google.calendar({ version: "v3", auth });
      const timeMin = (req.query.timeMin as string) || new Date().toISOString();
      const timeMax = (req.query.timeMax as string) || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const events = await calendar.events.list({
        calendarId: "primary",
        timeMin,
        timeMax,
        singleEvents: true,
        orderBy: "startTime",
        maxResults: 50,
      });

      res.json({
        events: (events.data.items || []).map((e) => ({
          id: e.id,
          title: e.summary,
          description: e.description,
          start: e.start?.dateTime || e.start?.date,
          end: e.end?.dateTime || e.end?.date,
          location: e.location,
          attendees: e.attendees?.map((a) => a.email),
          htmlLink: e.htmlLink,
        })),
      });
    } catch (error: any) {
      console.error("Calendar list error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== GOOGLE DOCS ====================

  // Create Google Doc
  app.post("/api/integrations/docs/create", async (req: Request, res: Response) => {
    try {
      const parsed = createDocSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
      }

      const auth = getGoogleAuthClient();
      if (!auth) {
        return res.status(401).json({ error: "Google Docs not connected" });
      }

      const docs = google.docs({ version: "v1", auth });
      const drive = google.drive({ version: "v3", auth });
      const { title, content, folderId } = parsed.data;

      // Create the document
      const doc = await docs.documents.create({
        requestBody: { title },
      });

      const documentId = doc.data.documentId!;

      // Insert content
      if (content) {
        await docs.documents.batchUpdate({
          documentId,
          requestBody: {
            requests: [
              {
                insertText: {
                  location: { index: 1 },
                  text: content,
                },
              },
            ],
          },
        });
      }

      // Move to folder if specified
      if (folderId) {
        await drive.files.update({
          fileId: documentId,
          addParents: folderId,
          fields: "id, parents",
        });
      }

      const docUrl = `https://docs.google.com/document/d/${documentId}/edit`;

      await storage.createActionLog({
        actionType: "docs-create",
        title: `Doc created: ${title}`,
        description: content.substring(0, 100) + "...",
        status: "completed",
        integration: "Google Docs",
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

  // Append row to sheet
  app.post("/api/integrations/sheets/append", async (req: Request, res: Response) => {
    try {
      const parsed = appendSheetRowSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
      }

      const auth = getGoogleAuthClient();
      if (!auth) {
        return res.status(401).json({ error: "Google Sheets not connected" });
      }

      const sheets = google.sheets({ version: "v4", auth });
      const { spreadsheetId, sheetName, values } = parsed.data;

      const result = await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${sheetName}!A:Z`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [values],
        },
      });

      await storage.createActionLog({
        actionType: "sheets-append",
        title: `Row added to sheet`,
        description: `${values.length} values added`,
        status: "completed",
        integration: "Google Sheets",
        inputData: { spreadsheetId, values },
        outputData: { updatedRange: result.data.updates?.updatedRange },
      });

      res.json({ success: true, updatedRange: result.data.updates?.updatedRange });
    } catch (error: any) {
      console.error("Sheets append error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // List user's spreadsheets
  app.get("/api/integrations/sheets/list", async (req: Request, res: Response) => {
    try {
      const auth = getGoogleAuthClient();
      if (!auth) {
        return res.status(401).json({ error: "Google Sheets not connected" });
      }

      const drive = google.drive({ version: "v3", auth });
      const files = await drive.files.list({
        q: "mimeType='application/vnd.google-apps.spreadsheet'",
        fields: "files(id, name, webViewLink)",
        orderBy: "modifiedTime desc",
        pageSize: 20,
      });

      res.json({ spreadsheets: files.data.files || [] });
    } catch (error: any) {
      console.error("Sheets list error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== GOOGLE DRIVE ====================

  // Upload file to Drive
  app.post("/api/integrations/drive/upload", async (req: Request, res: Response) => {
    try {
      const parsed = uploadDriveFileSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
      }

      const auth = getGoogleAuthClient();
      if (!auth) {
        return res.status(401).json({ error: "Google Drive not connected" });
      }

      const drive = google.drive({ version: "v3", auth });
      const { name, content, mimeType, folderId } = parsed.data;

      const file = await drive.files.create({
        requestBody: {
          name,
          mimeType,
          parents: folderId ? [folderId] : undefined,
        },
        media: {
          mimeType,
          body: content,
        },
        fields: "id, webViewLink, webContentLink",
      });

      await storage.createActionLog({
        actionType: "drive-upload",
        title: `File uploaded: ${name}`,
        description: `Type: ${mimeType}`,
        status: "completed",
        integration: "Google Drive",
        inputData: { name, mimeType },
        outputData: { fileId: file.data.id, webViewLink: file.data.webViewLink },
      });

      res.json({
        success: true,
        fileId: file.data.id,
        webViewLink: file.data.webViewLink,
        webContentLink: file.data.webContentLink,
      });
    } catch (error: any) {
      console.error("Drive upload error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // List Drive folders
  app.get("/api/integrations/drive/folders", async (req: Request, res: Response) => {
    try {
      const auth = getGoogleAuthClient();
      if (!auth) {
        return res.status(401).json({ error: "Google Drive not connected" });
      }

      const drive = google.drive({ version: "v3", auth });
      const files = await drive.files.list({
        q: "mimeType='application/vnd.google-apps.folder'",
        fields: "files(id, name)",
        orderBy: "name",
        pageSize: 50,
      });

      res.json({ folders: files.data.files || [] });
    } catch (error: any) {
      console.error("Drive folders error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== LINEAR ====================

  // Create Linear issue
  app.post("/api/integrations/linear/issues", async (req: Request, res: Response) => {
    try {
      const parsed = createLinearIssueSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
      }

      const linear = getLinearClient();
      if (!linear) {
        return res.status(401).json({ error: "Linear not connected. Set LINEAR_API_KEY." });
      }

      const { title, description, teamId, priority, labels } = parsed.data;

      // Get default team if not specified
      let resolvedTeamId = teamId;
      if (!resolvedTeamId) {
        const teams = await linear.teams();
        if (teams.nodes.length === 0) {
          return res.status(400).json({ error: "No teams found in Linear workspace" });
        }
        resolvedTeamId = teams.nodes[0].id;
      }

      // Get label IDs if labels provided
      let labelIds: string[] | undefined;
      if (labels && labels.length > 0) {
        const allLabels = await linear.issueLabels();
        labelIds = allLabels.nodes
          .filter((l) => labels.includes(l.name))
          .map((l) => l.id);
      }

      const issue = await linear.createIssue({
        title,
        description,
        teamId: resolvedTeamId,
        priority,
        labelIds,
      });

      const createdIssue = await issue.issue;

      await storage.createActionLog({
        actionType: "linear-create",
        title: `Linear issue: ${title}`,
        description: description?.substring(0, 100),
        status: "completed",
        integration: "Linear",
        inputData: { title, priority, labels },
        outputData: { issueId: createdIssue?.id, identifier: createdIssue?.identifier, url: createdIssue?.url },
      });

      res.json({
        success: true,
        issueId: createdIssue?.id,
        identifier: createdIssue?.identifier,
        url: createdIssue?.url,
      });
    } catch (error: any) {
      console.error("Linear create error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get Linear teams
  app.get("/api/integrations/linear/teams", async (req: Request, res: Response) => {
    try {
      const linear = getLinearClient();
      if (!linear) {
        return res.status(401).json({ error: "Linear not connected" });
      }

      const teams = await linear.teams();
      res.json({
        teams: teams.nodes.map((t) => ({
          id: t.id,
          name: t.name,
          key: t.key,
        })),
      });
    } catch (error: any) {
      console.error("Linear teams error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get Linear labels
  app.get("/api/integrations/linear/labels", async (req: Request, res: Response) => {
    try {
      const linear = getLinearClient();
      if (!linear) {
        return res.status(401).json({ error: "Linear not connected" });
      }

      const labels = await linear.issueLabels();
      res.json({
        labels: labels.nodes.map((l) => ({
          id: l.id,
          name: l.name,
          color: l.color,
        })),
      });
    } catch (error: any) {
      console.error("Linear labels error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== DISCORD ====================

  // Send Discord message via webhook
  app.post("/api/integrations/discord/send", async (req: Request, res: Response) => {
    try {
      const parsed = sendDiscordMessageSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
      }

      const { webhookUrl, content, username } = parsed.data;

      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          username: username || "Keynection",
        }),
      });

      if (!response.ok) {
        throw new Error(`Discord webhook failed: ${response.status}`);
      }

      await storage.createActionLog({
        actionType: "discord-send",
        title: "Discord message sent",
        description: content.substring(0, 100),
        status: "completed",
        integration: "Discord",
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

  // Create Notion page
  app.post("/api/integrations/notion/pages", async (req: Request, res: Response) => {
    try {
      const parsed = createNotionPageSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
      }

      const notionToken = process.env.NOTION_API_KEY || process.env.REPLIT_NOTION_API_KEY;
      if (!notionToken) {
        return res.status(401).json({ error: "Notion not connected" });
      }

      const { parentId, parentType, title, content } = parsed.data;

      // Convert content to Notion blocks
      const contentBlocks = content.split("\n\n").map((paragraph) => ({
        object: "block" as const,
        type: "paragraph" as const,
        paragraph: {
          rich_text: [{ type: "text" as const, text: { content: paragraph } }],
        },
      }));

      const requestBody: any = {
        children: contentBlocks,
      };

      if (parentType === "page") {
        requestBody.parent = { page_id: parentId };
        requestBody.properties = {
          title: { title: [{ text: { content: title } }] },
        };
      } else {
        requestBody.parent = { database_id: parentId };
        requestBody.properties = {
          Name: { title: [{ text: { content: title } }] },
        };
      }

      const response = await fetch("https://api.notion.com/v1/pages", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${notionToken}`,
          "Content-Type": "application/json",
          "Notion-Version": "2022-06-28",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Notion API error: ${response.status} - ${errorText}`);
      }

      const page = await response.json();

      await storage.createActionLog({
        actionType: "notion-create",
        title: `Notion page: ${title}`,
        description: content.substring(0, 100),
        status: "completed",
        integration: "Notion",
        inputData: { title, parentId },
        outputData: { pageId: page.id, url: page.url },
      });

      res.json({ success: true, pageId: page.id, url: page.url });
    } catch (error: any) {
      console.error("Notion create error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Search Notion pages/databases
  app.get("/api/integrations/notion/search", async (req: Request, res: Response) => {
    try {
      const notionToken = process.env.NOTION_API_KEY || process.env.REPLIT_NOTION_API_KEY;
      if (!notionToken) {
        return res.status(401).json({ error: "Notion not connected" });
      }

      const query = (req.query.query as string) || "";

      const response = await fetch("https://api.notion.com/v1/search", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${notionToken}`,
          "Content-Type": "application/json",
          "Notion-Version": "2022-06-28",
        },
        body: JSON.stringify({
          query,
          page_size: 20,
        }),
      });

      if (!response.ok) {
        throw new Error(`Notion search failed: ${response.status}`);
      }

      const data = await response.json();
      const results = data.results.map((item: any) => ({
        id: item.id,
        type: item.object,
        title:
          item.properties?.title?.title?.[0]?.plain_text ||
          item.properties?.Name?.title?.[0]?.plain_text ||
          item.title?.[0]?.plain_text ||
          "Untitled",
        url: item.url,
      }));

      res.json({ results });
    } catch (error: any) {
      console.error("Notion search error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== INTEGRATION STATUS ====================

  // Check which integrations are connected
  app.get("/api/integrations/status", async (_req: Request, res: Response) => {
    const googleConnected = !!(
      process.env.GOOGLE_ACCESS_TOKEN ||
      process.env.REPLIT_GOOGLE_ACCESS_TOKEN ||
      process.env.GOOGLE_REFRESH_TOKEN
    );
    const linearConnected = !!(process.env.LINEAR_API_KEY || process.env.REPLIT_LINEAR_API_KEY);
    const notionConnected = !!(process.env.NOTION_API_KEY || process.env.REPLIT_NOTION_API_KEY);
    const discordConnected = true; // Webhook-based, always "available"

    res.json({
      integrations: {
        gmail: { connected: googleConnected, name: "Gmail" },
        calendar: { connected: googleConnected, name: "Google Calendar" },
        docs: { connected: googleConnected, name: "Google Docs" },
        sheets: { connected: googleConnected, name: "Google Sheets" },
        drive: { connected: googleConnected, name: "Google Drive" },
        linear: { connected: linearConnected, name: "Linear" },
        notion: { connected: notionConnected, name: "Notion" },
        discord: { connected: discordConnected, name: "Discord" },
      },
    });
  });
}
