import { Mail, FileText, ListChecks, BarChart3, MessageSquareReply, Bug, FileOutput, CalendarPlus, MessageCircle, Table2, GitBranch, HardDrive } from "lucide-react";

export interface SmartAction {
  id: string;
  name: string;
  description: string;
  icon: typeof Mail;
  integration: string;
  integrationColor: string;
  phase: 1 | 2 | 3;
  category: "content" | "productivity" | "communication" | "development";
}

export const smartActions: SmartAction[] = [
  {
    id: "email-page",
    name: "Email This Page",
    description: "AI-generate a professional email from page content",
    icon: Mail,
    integration: "Gmail",
    integrationColor: "#EA4335",
    phase: 1,
    category: "communication",
  },
  {
    id: "save-notion",
    name: "Save to Notion",
    description: "Structure and save content as a Notion page",
    icon: FileText,
    integration: "Notion",
    integrationColor: "#000000",
    phase: 1,
    category: "productivity",
  },
  {
    id: "extract-tasks",
    name: "Extract Tasks",
    description: "Find action items and create tasks in Linear or Notion",
    icon: ListChecks,
    integration: "Linear",
    integrationColor: "#5E6AD2",
    phase: 1,
    category: "productivity",
  },
  {
    id: "generate-standup",
    name: "Generate Standup",
    description: "Auto-generate standup from GitHub, Notion & Calendar",
    icon: BarChart3,
    integration: "Multi",
    integrationColor: "#10B981",
    phase: 1,
    category: "productivity",
  },
  {
    id: "smart-reply",
    name: "Smart Email Reply",
    description: "Generate 3 reply options: professional, friendly, brief",
    icon: MessageSquareReply,
    integration: "Gmail",
    integrationColor: "#EA4335",
    phase: 2,
    category: "communication",
  },
  {
    id: "report-bug",
    name: "Report Bug to Linear",
    description: "Create a structured bug report from error context",
    icon: Bug,
    integration: "Linear",
    integrationColor: "#5E6AD2",
    phase: 2,
    category: "development",
  },
  {
    id: "save-docs",
    name: "Save to Google Docs",
    description: "Format and save content as a Google Doc",
    icon: FileOutput,
    integration: "Google Docs",
    integrationColor: "#4285F4",
    phase: 2,
    category: "content",
  },
  {
    id: "schedule-meeting",
    name: "Schedule Meeting",
    description: "Extract meeting details and create calendar invite",
    icon: CalendarPlus,
    integration: "Google Calendar",
    integrationColor: "#0F9D58",
    phase: 2,
    category: "communication",
  },
  {
    id: "share-discord",
    name: "Share to Discord",
    description: "Adapt and share content to Discord channel",
    icon: MessageCircle,
    integration: "Discord",
    integrationColor: "#5865F2",
    phase: 2,
    category: "communication",
  },
  {
    id: "log-sheets",
    name: "Log to Google Sheets",
    description: "Extract structured data and append to spreadsheet",
    icon: Table2,
    integration: "Google Sheets",
    integrationColor: "#0F9D58",
    phase: 2,
    category: "content",
  },
  {
    id: "github-comment",
    name: "Smart GitHub Comment",
    description: "Generate helpful comments for issues and PRs",
    icon: GitBranch,
    integration: "GitHub",
    integrationColor: "#333333",
    phase: 3,
    category: "development",
  },
  {
    id: "save-drive",
    name: "Save to Google Drive",
    description: "Upload and organize files in Google Drive",
    icon: HardDrive,
    integration: "Google Drive",
    integrationColor: "#FBBC05",
    phase: 3,
    category: "content",
  },
];
