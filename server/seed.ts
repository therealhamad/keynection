import { db } from "./db";
import { integrations, actionLogs } from "@shared/schema";

const integrationData = [
  { name: "Discord", slug: "discord", icon: "discord", category: "communication", description: "Send messages, share content, and post updates to Discord channels.", connected: true, color: "#5865F2" },
  { name: "GitHub", slug: "github", icon: "github", category: "development", description: "Create issues, comment on PRs, and track commits across repositories.", connected: true, color: "#6e40c9" },
  { name: "Gmail", slug: "gmail", icon: "gmail", category: "communication", description: "Send emails, generate replies, and manage your inbox with AI assistance.", connected: true, color: "#EA4335" },
  { name: "Google Calendar", slug: "google-calendar", icon: "google-calendar", category: "productivity", description: "Schedule meetings, extract event details, and manage your calendar.", connected: true, color: "#0F9D58" },
  { name: "Google Docs", slug: "google-docs", icon: "google-docs", category: "content", description: "Create and format documents from web content with structured layouts.", connected: true, color: "#4285F4" },
  { name: "Google Drive", slug: "google-drive", icon: "google-drive", category: "content", description: "Upload files, organize folders, and generate shareable links.", connected: false, color: "#FBBC05" },
  { name: "Google Sheets", slug: "google-sheets", icon: "google-sheets", category: "content", description: "Log structured data, track expenses, and manage spreadsheets.", connected: true, color: "#0F9D58" },
  { name: "Linear", slug: "linear", icon: "linear", category: "development", description: "Create issues, track bugs, and manage project tasks with AI-structured reports.", connected: true, color: "#5E6AD2" },
  { name: "Notion", slug: "notion", icon: "notion", category: "productivity", description: "Save structured content, create pages, and organize knowledge bases.", connected: true, color: "#787774" },
  { name: "OneDrive", slug: "onedrive", icon: "onedrive", category: "content", description: "Backup and share files through Microsoft OneDrive.", connected: false, color: "#0078D4" },
  { name: "Outlook", slug: "outlook", icon: "outlook", category: "communication", description: "Send and reply to emails through Microsoft Outlook.", connected: true, color: "#0078D4" },
];

const sampleLogs = [
  { actionType: "email-page", title: "Email This Page: TechCrunch article on AI trends", description: "Generated professional email with article summary and key takeaways.", status: "completed", integration: "Gmail" },
  { actionType: "save-notion", title: "Save to Notion: React 19 release notes", description: "Structured article with summary bullets, key points, and tagged 'react, frontend, release'.", status: "completed", integration: "Notion" },
  { actionType: "extract-tasks", title: "Extract Tasks: Sprint planning notes", description: "Identified 5 action items with assignees and priorities from meeting transcript.", status: "completed", integration: "Linear" },
  { actionType: "generate-standup", title: "Generate Standup: Daily update", description: "Combined 3 GitHub commits, 2 Notion tasks, and 1 meeting into formatted standup.", status: "completed", integration: "Multi" },
  { actionType: "smart-reply", title: "Smart Email Reply: Partnership inquiry", description: "Created 3 reply options: professional, friendly, and brief for vendor email.", status: "completed", integration: "Gmail" },
  { actionType: "report-bug", title: "Report Bug: Auth redirect issue", description: "Created structured bug report with steps to reproduce, expected/actual behavior.", status: "completed", integration: "Linear" },
  { actionType: "save-docs", title: "Save to Google Docs: API documentation", description: "Formatted REST API guide with structured sections and code examples.", status: "completed", integration: "Google Docs" },
];

export async function seedDatabase() {
  const existing = await db.select().from(integrations);
  if (existing.length > 0) return;

  console.log("Seeding database...");

  await db.insert(integrations).values(integrationData);
  await db.insert(actionLogs).values(sampleLogs);

  console.log("Database seeded successfully.");
}
