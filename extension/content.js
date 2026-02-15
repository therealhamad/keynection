(function() {
  "use strict";

  if (window.__keynectionInjected) return;
  window.__keynectionInjected = true;

  let overlayRoot = null;
  let shadowRoot = null;
  let isVisible = false;
  let currentView = "palette";
  let selectedIndex = 0;
  let searchQuery = "";
  let currentAction = null;
  let formData = {};
  let currentContext = null;
  let generatedContent = null;
  let isGenerating = false;
  let standupData = {
    commits: [],
    tasks: [],
    meetings: [],
    selectedCommits: [],
    selectedTasks: [],
    selectedMeetings: [],
    blockers: ''
  };

  // ============================================================
  // AI CLIENT (Claude only; Gemini can be re-added later)
  // ============================================================
  const AIClient = {
    CLAUDE_ENDPOINT: 'https://api.anthropic.com/v1/messages',

    async getClaudeKey() {
      return new Promise((resolve) => {
        chrome.storage.local.get(['claude_api_key'], (result) => {
          resolve(result.claude_api_key || null);
        });
      });
    },

    async generateContent(prompt) {
      const apiKey = await this.getClaudeKey();
      return this.generateWithClaude(prompt, apiKey);
    },

    async generateWithClaude(prompt, apiKey) {
      if (!apiKey) {
        throw new Error('Claude API key not configured. Go to Settings to add your API key.');
      }

      try {
        const response = await fetch(this.CLAUDE_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true'
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 4096,
            messages: [{
              role: 'user',
              content: prompt
            }]
          })
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error?.message || `Claude API error: ${response.status}`);
        }

        const data = await response.json();
        return data.content[0].text;
      } catch (error) {
        console.error('Keynection: Claude API call failed:', error);
        throw error;
      }
    },

    parseJsonResponse(response) {
      const cleanResponse = response.replace(/```json\n?|\n?```/g, '').trim();
      try {
        return JSON.parse(cleanResponse);
      } catch (e) {
        const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/) || cleanResponse.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
        throw new Error('Failed to parse AI response');
      }
    },

    async testConnection(apiKey) {
      try {
        const response = await fetch(this.CLAUDE_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true'
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 50,
            messages: [{ role: 'user', content: 'Say "Connected!" in one word.' }]
          })
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error?.message || 'Connection failed');
        }
        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },

    async generateEmail(context) {
      const contentSource = context.hasSelection 
        ? `Selected Text: "${context.selectedText}"`
        : `Page Content Summary: ${context.pageContent?.substring(0, 1500)}`;

      const prompt = `
Generate a professional email based on this context:

Page Title: ${context.pageTitle}
Page URL: ${context.pageUrl}
${contentSource}

Task: Create an email that shares this content appropriately.

Requirements:
- If text is selected, use it as a quote or key point
- If no selection, summarize the page content
- Professional but friendly tone
- Include the source URL
- Keep it concise (under 150 words)

Return ONLY a JSON object with this exact structure (no markdown, no code fences):
{"subject": "Clear, descriptive subject line (max 60 chars)", "body": "Email body with proper formatting"}
`;

      const response = await this.generateContent(prompt);
      return this.parseJsonResponse(response);
    },

    async generateSlackMessage(context) {
      const contentSource = context.hasSelection 
        ? context.selectedText
        : context.pageContent?.substring(0, 2000);

      const prompt = `
Create a Slack-friendly summary of this content:

Page Title: ${context.pageTitle}
Page URL: ${context.pageUrl}
Content: ${contentSource}

Requirements:
- Casual, conversational tone
- Use Slack markdown (*bold*, _italic_)
- Add relevant emojis (2-3 max)
- Bullet points for key takeaways
- Include source link at bottom
- Maximum 200 words

Return ONLY a JSON object (no markdown, no code fences):
{"message": "Formatted Slack message with markdown and emojis", "suggestedChannel": "suggested channel name based on content type"}
`;

      const response = await this.generateContent(prompt);
      return this.parseJsonResponse(response);
    },

    async extractTasks(text) {
      const prompt = `
Analyze this text and extract action items/tasks:

Text:
${text}

Requirements:
- Identify clear action items or to-dos
- Infer assignee if mentioned (otherwise "Unassigned")
- Infer due date if mentioned (otherwise null)
- Assign priority: high, medium, or low based on urgency keywords
- Return empty array if no tasks found

Return ONLY a JSON array (no markdown, no code fences):
[{"task": "Clear description of the task", "assignee": "Person's name or Unassigned", "dueDate": "YYYY-MM-DD or null", "priority": "high|medium|low"}]
`;

      const response = await this.generateContent(prompt);
      return this.parseJsonResponse(response);
    },

    async generateStandup(commits, tasks, meetings, blockers) {
      const prompt = `
You are generating a daily standup update for Slack. Use a professional but friendly tone.

Data from last 24 hours:

${commits.length > 0 ? `GitHub Commits:\n${commits.map(c => `- ${c.message} (${c.repo})`).join('\n')}\n` : ''}

${tasks.length > 0 ? `Notion Tasks:\n${tasks.map(t => `- ${t.title}${t.status ? ' (' + t.status + ')' : ''}`).join('\n')}\n` : ''}

${meetings.length > 0 ? `Meetings Attended:\n${meetings.map(m => `- ${m.summary} (${m.duration}min, ${m.attendees} attendees)`).join('\n')}\n` : ''}

${blockers ? `Blockers/Challenges:\n${blockers}\n` : ''}

Generate a standup update with these sections:
1. *Yesterday* - What was accomplished (combine commits + tasks, be specific but concise)
2. *Today* - What will be worked on (infer from yesterday's work + any unfinished items)
${meetings.length > 0 ? '3. *Meetings* - Key meetings attended' : ''}
${blockers ? `${meetings.length > 0 ? '4' : '3'}. *Blockers* - Challenges mentioned` : ''}

Requirements:
- Use Slack markdown formatting (*bold* for headers)
- Use bullet points (•) for items
- Add relevant emojis to section headers
- Keep each bullet concise (one line)
- Professional but conversational tone
- Total length: under 250 words
- Return ONLY the standup message, no preamble

Return ONLY the formatted standup message.
`;

      return await this.generateContent(prompt);
    },

    async generateGoogleDoc(context) {
      const contentSource = context.hasSelection 
        ? context.selectedText
        : context.pageContent?.substring(0, 3000);

      const prompt = `
Structure this content for a Google Doc:

Page Title: ${context.pageTitle}
URL: ${context.pageUrl}
Content: ${contentSource}

Create:
- Title (clear, engaging)
- Summary (2-3 sentences)
- Main content with headers (### for sections)
- Key points as bullet list
- Source link at bottom

Return ONLY a JSON object (no markdown, no code fences):
{"title": "Document title", "summary": "Brief summary", "content": "Full formatted content with markdown headers and bullets"}
`;

      const response = await this.generateContent(prompt);
      return this.parseJsonResponse(response);
    },

    async generateDiscordMessage(context) {
      const contentSource = context.hasSelection 
        ? context.selectedText
        : context.pageContent?.substring(0, 2000);

      const prompt = `
Create a Discord-friendly message from this content:

Title: ${context.pageTitle}
URL: ${context.pageUrl}
Content: ${contentSource}

Requirements:
- Casual, engaging tone
- Use Discord markdown (**bold**, *italic*, \`code\`)
- 2-3 relevant emojis
- Key points as bullets
- Include source link
- Under 300 words

Return ONLY a JSON object (no markdown, no code fences):
{"message": "Formatted Discord message", "suggestedChannel": "general or relevant channel name"}
`;

      const response = await this.generateContent(prompt);
      return this.parseJsonResponse(response);
    },

    async generateLinearIssue(context) {
      const contentSource = context.hasSelection 
        ? context.selectedText
        : context.pageContent?.substring(0, 2000);

      const prompt = `
Create a Linear issue from this context:

URL: ${context.pageUrl}
Content: ${contentSource}

Generate:
- Title: Clear, concise (max 80 chars)
- Description: Steps to reproduce (if bug), requirements (if task), context
- Priority: 0 (no priority), 1 (urgent), 2 (high), 3 (medium), 4 (low)
- Labels: Suggest relevant labels (bug, feature, improvement, etc.)

Return ONLY a JSON object (no markdown, no code fences):
{"title": "Issue title", "description": "Detailed description", "priority": 2, "labels": ["bug"]}
`;

      const response = await this.generateContent(prompt);
      return this.parseJsonResponse(response);
    },

    async generateCalendarEvent(context) {
      const now = new Date();
      const prompt = `
Extract meeting details from this text:

Text: ${context.selectedText || context.pageContent?.substring(0, 1000)}

Current date/time: ${now.toISOString()}

Extract:
- Title: Meeting topic/purpose
- Start time: Parse relative dates (tomorrow, next Tuesday, etc.) to ISO format
- Duration: In minutes (default 30)
- Description: Brief agenda
- Attendees: Email addresses if mentioned (empty array if none)

Return ONLY a JSON object (no markdown, no code fences):
{"title": "Meeting title", "startTime": "2024-03-20T14:00:00", "duration": 30, "description": "Meeting agenda", "attendees": []}
`;

      const response = await this.generateContent(prompt);
      return this.parseJsonResponse(response);
    },

    async generateSheetData(context) {
      const contentSource = context.hasSelection 
        ? context.selectedText
        : `Title: ${context.pageTitle}\nURL: ${context.pageUrl}`;

      const prompt = `
Extract structured data from this for logging to a spreadsheet:

Content: ${contentSource}

Create fields (column names) and values based on the content type.
Common fields: Date, Title, URL, Category, Notes, Status

Return ONLY a JSON object (no markdown, no code fences):
{"fields": ["Date", "Title", "URL", "Notes"], "values": ["2024-03-15", "Example", "https://...", "Brief note"]}
`;

      const response = await this.generateContent(prompt);
      return this.parseJsonResponse(response);
    }
  };

  // ============================================================
  // ACTIVITY FETCHER - For standup generation
  // ============================================================
  // ActivityFetcher - Routes all API calls through background script to avoid CORS
  const ActivityFetcher = {
    // Send message to background script
    async sendToBackground(action, data = {}) {
      return new Promise((resolve) => {
        chrome.runtime.sendMessage({ action, ...data }, (response) => {
          if (chrome.runtime.lastError) {
            resolve({ error: chrome.runtime.lastError.message });
          } else {
            resolve(response || {});
          }
        });
      });
    },

    async fetchGitHubActivity() {
      const result = await this.sendToBackground('fetchGitHubActivity');
      return result.commits || [];
    },

    async fetchNotionActivity() {
      const result = await this.sendToBackground('fetchNotionActivity');
      return result.tasks || [];
    },

    async fetchCalendarActivity() {
      const result = await this.sendToBackground('fetchCalendarActivity');
      return result.meetings || [];
    },

    async fetchAllActivity() {
      // Fetch all in parallel
      const [githubResult, notionResult, calendarResult] = await Promise.all([
        this.sendToBackground('fetchGitHubActivity'),
        this.sendToBackground('fetchNotionActivity'),
        this.sendToBackground('fetchCalendarActivity')
      ]);

      const errors = [];
      if (githubResult.error) errors.push({ source: 'GitHub', error: githubResult.error });
      if (notionResult.error) errors.push({ source: 'Notion', error: notionResult.error });
      if (calendarResult.error) errors.push({ source: 'Calendar', error: calendarResult.error });

      return {
        commits: githubResult.commits || [],
        tasks: notionResult.tasks || [],
        meetings: calendarResult.meetings || [],
        errors
      };
    }
  };

  // ============================================================
  // CONTEXT DETECTOR - Enhanced page detection
  // ============================================================
  const ContextDetector = {
    detect() {
      const selectedText = window.getSelection().toString().trim();
      const pageTitle = document.title;
      const pageUrl = window.location.href;
      
      return {
        hasSelection: selectedText.length > 0,
        selectedText: selectedText,
        pageTitle: pageTitle,
        pageUrl: pageUrl,
        pageType: this.detectPageType(),
        isArticle: this.isArticlePage(),
        pageContent: this.extractMainContent(),
        wordCount: this.countWords(),
        hasTaskLikeContent: this.hasTaskLikeContent()
      };
    },

    detectPageType() {
      const hostname = window.location.hostname;
      const pathname = window.location.pathname;
      
      if (hostname.includes('github.com')) {
        if (pathname.includes('/issues/')) return 'github-issue';
        if (pathname.includes('/pull/')) return 'github-pr';
        return 'github';
      }
      if (hostname.includes('mail.google.com')) return 'gmail';
      if (hostname.includes('notion.so') || hostname.includes('notion.site')) return 'notion';
      if (hostname.includes('slack.com')) return 'slack';
      if (hostname.includes('linear.app')) return 'linear';
      if (hostname.includes('linkedin.com')) return 'linkedin';
      if (hostname.includes('twitter.com') || hostname.includes('x.com')) return 'twitter';
      if (hostname.includes('medium.com')) return 'medium';
      if (hostname.includes('dev.to')) return 'devto';
      if (hostname.includes('stackoverflow.com')) return 'stackoverflow';
      if (hostname.includes('docs.google.com')) return 'google-docs';
      if (hostname.includes('youtube.com')) return 'youtube';
      
      if (this.isArticlePage()) return 'article';
      
      return 'general';
    },

    isArticlePage() {
      const wordCount = this.countWords();
      
      // Articles typically have more than 300 words
      if (wordCount > 300) {
        const hasArticleTag = document.querySelector('article') !== null;
        const hasMetaArticle = document.querySelector('meta[property="og:type"][content="article"]') !== null;
        
        if (hasArticleTag || hasMetaArticle) {
          return true;
        }
        
        // Check for common article class names
        const articleIndicators = ['article', 'post', 'entry', 'content', 'story', 'blog'];
        const bodyClasses = document.body.className.toLowerCase();
        
        return articleIndicators.some(indicator => bodyClasses.includes(indicator));
      }
      
      return false;
    },

    extractMainContent() {
      const selectedText = window.getSelection().toString().trim();
      if (selectedText.length > 50) {
        return selectedText.substring(0, 3000);
      }
      
      const article = document.querySelector('article');
      if (article) {
        return this.cleanText(article.innerText).substring(0, 3000);
      }
      
      const main = document.querySelector('main');
      if (main) {
        return this.cleanText(main.innerText).substring(0, 3000);
      }
      
      const bodyText = document.body.innerText || document.body.textContent;
      return this.cleanText(bodyText).substring(0, 2000);
    },

    cleanText(text) {
      return text
        .replace(/\s+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    },

    countWords() {
      const article = document.querySelector('article');
      const main = document.querySelector('main');
      let text = '';
      if (article) {
        text = article.innerText;
      } else if (main) {
        text = main.innerText;
      } else {
        text = document.body.innerText;
      }
      return text.split(/\s+/).filter(word => word.length > 0).length;
    },

    hasTaskLikeContent() {
      const text = window.getSelection().toString().trim();
      if (!text) return false;
      
      const taskPatterns = [
        /\b(task|todo|action item|need to|must|should|will|deadline|due|assign|priority|urgent)\b/i,
        /\b(complete|finish|deliver|submit|review|approve|schedule|plan)\b/i,
        /^\s*[-•*]\s+/m,
        /^\s*\d+\.\s+/m,
        /\[\s*\]/m,
        /\b(by|before|until)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|next week|\d{1,2}\/\d{1,2})/i
      ];
      
      return taskPatterns.some(pattern => pattern.test(text));
    }
  };

  // ============================================================
  // DYNAMIC ACTIONS - Context-aware smart actions
  // ============================================================
  const STATIC_ACTIONS = [
    { id: "generate-standup", name: "Generate Standup Update", description: "Auto-create from GitHub, Notion & Calendar", integration: "Multi", icon: "bar-chart", category: "smart", color: "#10B981", badge: "Smart", alwaysShow: true },
    { id: "send-email", name: "Send Email", description: "Compose a new email", integration: "Gmail", icon: "mail", category: "action", color: "#EA4335", badge: "Action" },
    { id: "send-slack", name: "Send Message", description: "Post to Slack", integration: "Slack", icon: "message-circle", category: "action", color: "#4A154B", badge: "Action" },
    { id: "send-discord", name: "Send to Discord", description: "Post message to Discord", integration: "Discord", icon: "message-circle", category: "action", color: "#5865F2", badge: "Action" },
    { id: "create-notion", name: "Create Page", description: "Create a new page", integration: "Notion", icon: "file-text", category: "action", color: "#787774", badge: "Action" },
    { id: "create-doc", name: "Create Document", description: "Create a Google Doc", integration: "Google Docs", icon: "file-text", category: "action", color: "#4285F4", badge: "Action" },
    { id: "log-sheets", name: "Log to Sheets", description: "Append data to a spreadsheet", integration: "Google Sheets", icon: "file", category: "action", color: "#0F9D58", badge: "Action" },
    { id: "create-event", name: "Schedule Meeting", description: "Create calendar event", integration: "Calendar", icon: "bar-chart", category: "action", color: "#4285F4", badge: "Action" },
    { id: "create-linear-issue", name: "Create Linear Issue", description: "Create a new issue in Linear", integration: "Linear", icon: "list-checks", category: "action", color: "#5E6AD2", badge: "Action" },
  ];

  function getSmartActions(context) {
    const smartActions = [];
    
    // Selection-based actions - work ANYWHERE with text selected
    if (context.hasSelection && context.selectedText.length > 10) {
      smartActions.push({
        id: "email-quote", 
        name: "Email Selection", 
        description: `Share "${context.selectedText.substring(0, 30)}..."`,
        integration: "Gmail", 
        icon: "mail", 
        category: "smart", 
        color: "#EA4335", 
        badge: "Smart",
        contextReason: `${context.selectedText.length} chars selected`
      });
      smartActions.push({
        id: "slack-quote", 
        name: "Share to Slack", 
        description: "Post selected text to Slack",
        integration: "Slack", 
        icon: "message-circle", 
        category: "smart", 
        color: "#4A154B", 
        badge: "Smart",
        contextReason: `${context.selectedText.length} chars selected`
      });
      smartActions.push({
        id: "save-selection-notion", 
        name: "Save to Notion", 
        description: "Save selection as Notion page",
        integration: "Notion", 
        icon: "file-text", 
        category: "smart", 
        color: "#787774", 
        badge: "Smart",
        contextReason: "Text selected"
      });
    }
    
    // Article-based actions (no selection needed)
    if (context.isArticle && !context.hasSelection) {
      smartActions.push({
        id: "email-page", 
        name: "Email This Page", 
        description: "Share this article via email",
        integration: "Gmail", 
        icon: "mail", 
        category: "smart", 
        color: "#EA4335", 
        badge: "Smart",
        contextReason: "Article detected"
      });
      smartActions.push({
        id: "summarize-slack", 
        name: "Summarize for Slack", 
        description: "Create article summary for Slack",
        integration: "Slack", 
        icon: "message-circle", 
        category: "smart", 
        color: "#4A154B", 
        badge: "Smart",
        contextReason: "Article detected"
      });
      smartActions.push({
        id: "save-notion", 
        name: "Save Article to Notion", 
        description: "Structure and save as Notion page",
        integration: "Notion", 
        icon: "file-text", 
        category: "smart", 
        color: "#787774", 
        badge: "Smart",
        contextReason: "Article detected"
      });
    }

    // Extract tasks - show for any substantial text selection
    if (context.hasSelection && context.selectedText.length > 50) {
      smartActions.push({
        id: "extract-tasks", 
        name: "Extract Tasks", 
        description: "Find action items in selection",
        integration: "AI", 
        icon: "list-checks", 
        category: "smart", 
        color: "#5E6AD2", 
        badge: "Smart",
        contextReason: context.hasTaskLikeContent ? "Tasks detected" : "Text selected"
      });
    }

    // GitHub comment - only on GitHub pages
    if (context.pageType.startsWith('github')) {
      smartActions.push({
        id: "github-comment", 
        name: "Smart GitHub Comment", 
        description: "Generate helpful comment",
        integration: "GitHub", 
        icon: "git-branch", 
        category: "smart", 
        color: "#6e40c9", 
        badge: "Smart",
        contextReason: "GitHub page"
      });
    }

    // Save article to Google Docs
    if (context.isArticle && !context.hasSelection) {
      smartActions.push({
        id: "save-docs", 
        name: "Save to Google Docs", 
        description: "Create a structured Google Doc",
        integration: "Google Docs", 
        icon: "file-text", 
        category: "smart", 
        color: "#4285F4", 
        badge: "Smart",
        contextReason: "Article detected"
      });
      smartActions.push({
        id: "share-discord", 
        name: "Share to Discord", 
        description: "Post article summary to Discord",
        integration: "Discord", 
        icon: "message-circle", 
        category: "smart", 
        color: "#5865F2", 
        badge: "Smart",
        contextReason: "Article detected"
      });
    }

    // Selection-based Google Docs
    if (context.hasSelection && context.selectedText.length > 100) {
      smartActions.push({
        id: "save-selection-docs", 
        name: "Save Selection to Docs", 
        description: "Create doc from selection",
        integration: "Google Docs", 
        icon: "file-text", 
        category: "smart", 
        color: "#4285F4", 
        badge: "Smart",
        contextReason: `${context.selectedText.length} chars selected`
      });
    }

    // Create Linear issue from selected text (bugs, tasks)
    if (context.hasSelection && context.selectedText.length > 30) {
      smartActions.push({
        id: "report-bug", 
        name: "Report Bug to Linear", 
        description: "Create Linear issue from selection",
        integration: "Linear", 
        icon: "list-checks", 
        category: "smart", 
        color: "#5E6AD2", 
        badge: "Smart",
        contextReason: context.hasTaskLikeContent ? "Bug/task detected" : "Text selected"
      });
    }

    // Schedule meeting from text (email context or selected text with date/time)
    const hasDateTimeMention = context.hasSelection && /\b(tomorrow|next|monday|tuesday|wednesday|thursday|friday|saturday|sunday|meeting|call|sync|\d{1,2}:\d{2}|am|pm)\b/i.test(context.selectedText);
    if (hasDateTimeMention) {
      smartActions.push({
        id: "schedule-meeting", 
        name: "Schedule Meeting", 
        description: "Create calendar event from text",
        integration: "Calendar", 
        icon: "bar-chart", 
        category: "smart", 
        color: "#4285F4", 
        badge: "Smart",
        contextReason: "Date/time detected"
      });
    }

    // Log to Sheets - for structured data pages
    if (context.pageType === 'general' && context.wordCount < 500) {
      smartActions.push({
        id: "log-page-sheets", 
        name: "Log to Sheets", 
        description: "Record this page to spreadsheet",
        integration: "Google Sheets", 
        icon: "file", 
        category: "smart", 
        color: "#0F9D58", 
        badge: "Smart",
        contextReason: "Quick log"
      });
    }

    return smartActions;
  }

  function getFilteredActions() {
    const q = searchQuery.toLowerCase();
    const context = currentContext || ContextDetector.detect();
    
    const smartActions = getSmartActions(context);
    const allActions = [...smartActions, ...STATIC_ACTIONS];
    
    return allActions.filter(a =>
      a.name.toLowerCase().includes(q) ||
      a.description.toLowerCase().includes(q) ||
      a.integration.toLowerCase().includes(q)
    );
  }

  const SVG_ICONS = {
    "mail": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>`,
    "file-text": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>`,
    "list-checks": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/></svg>`,
    "bar-chart": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" x2="12" y1="20" y2="10"/><line x1="18" x2="18" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="16"/></svg>`,
    "reply": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>`,
    "message-circle": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>`,
    "git-branch": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" x2="6" y1="3" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>`,
    "settings": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`,
    "arrow-left": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>`,
    "check": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
    "sparkles": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>`,
    "loader": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4"/><path d="m16.2 7.8 2.9-2.9"/><path d="M18 12h4"/><path d="m16.2 16.2 2.9 2.9"/><path d="M12 18v4"/><path d="m4.9 19.1 2.9-2.9"/><path d="M2 12h4"/><path d="m4.9 4.9 2.9 2.9"/></svg>`,
    "x": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
    "file": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>`,
    "refresh": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>`,
    "copy": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`,
    "send": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>`,
  };

  function icon(name, size = 18) {
    return `<span class="kn-icon" style="width:${size}px;height:${size}px;display:inline-flex;align-items:center;justify-content:center;">${SVG_ICONS[name] || ""}</span>`;
  }

  function createOverlay() {
    overlayRoot = document.createElement("div");
    overlayRoot.id = "keynection-root";
    shadowRoot = overlayRoot.attachShadow({ mode: "closed" });

    const style = document.createElement("style");
    style.textContent = getStyles();
    shadowRoot.appendChild(style);

    const container = document.createElement("div");
    container.id = "kn-overlay";
    container.className = "kn-hidden";
    container.innerHTML = `
      <div class="kn-backdrop" id="kn-backdrop"></div>
      <div class="kn-modal" id="kn-modal">
        <div class="kn-content" id="kn-content"></div>
        <div class="kn-footer" id="kn-footer">
          <div class="kn-footer-left">
            <span class="kn-shortcut-group">Open <kbd class="kn-kbd">\u23CE</kbd></span>
            <span class="kn-shortcut-group"><kbd class="kn-kbd">\u2191</kbd> <kbd class="kn-kbd">\u2193</kbd></span>
          </div>
          <div class="kn-footer-right">
            <span class="kn-shortcut-group">Close <kbd class="kn-kbd">esc</kbd></span>
          </div>
        </div>
      </div>
    `;
    shadowRoot.appendChild(container);
    document.body.appendChild(overlayRoot);

    shadowRoot.getElementById("kn-backdrop").addEventListener("click", hideOverlay);
    
    // IMPORTANT: Handle ALL keyboard events in the overlay
    container.addEventListener("keydown", handleKeyDown, true);
  }

  function showPalette() {
    currentView = "palette";
    selectedIndex = 0;
    searchQuery = "";
    generatedContent = null;
    const content = shadowRoot.getElementById("kn-content");
    const footer = shadowRoot.getElementById("kn-footer");
    footer.style.display = "";

    currentContext = ContextDetector.detect();

    let contextBanner = "";
    if (currentContext.hasSelection) {
      const preview = currentContext.selectedText.substring(0, 50);
      contextBanner = `<div class="kn-context-banner">${icon("file", 14)} Text selected (${currentContext.selectedText.length} chars)${currentContext.hasTaskLikeContent ? ' <span class="kn-context-tag">Tasks detected</span>' : ''}</div>`;
    } else if (currentContext.isArticle) {
      contextBanner = `<div class="kn-context-banner">${icon("file", 14)} Article detected <span class="kn-context-tag">${currentContext.wordCount} words</span></div>`;
    } else if (currentContext.pageType !== 'general') {
      const pageTypeLabel = currentContext.pageType.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      contextBanner = `<div class="kn-context-banner">${icon("file", 14)} ${pageTypeLabel}</div>`;
    }

    content.innerHTML = `
      <div class="kn-header">
        <input type="text" class="kn-search" id="kn-search" placeholder="Search actions..." autocomplete="off" spellcheck="false" />
      </div>
      ${contextBanner}
      <div class="kn-list" id="kn-list"></div>
    `;

    const searchInput = shadowRoot.getElementById("kn-search");
    searchInput.addEventListener("input", (e) => {
      searchQuery = e.target.value;
      renderActionList();
    });

    renderActionList();
    setTimeout(() => searchInput.focus(), 50);
  }

  function renderActionList() {
    const list = shadowRoot.getElementById("kn-list");
    const filtered = getFilteredActions();
    const smart = filtered.filter(a => a.category === "smart");
    const actions = filtered.filter(a => a.category === "action");

    let html = "";
    if (smart.length > 0) {
      html += `<div class="kn-group-label">SMART ACTIONS <span class="kn-group-hint">Context-aware</span></div>`;
      smart.forEach((action, i) => {
        html += renderActionItem(action, i);
      });
    }
    if (actions.length > 0) {
      html += `<div class="kn-group-label">ACTIONS</div>`;
      actions.forEach((action, i) => {
        html += renderActionItem(action, smart.length + i);
      });
    }
    html += `<div class="kn-group-label">SYSTEM</div>`;
    html += `<div class="kn-action-item ${selectedIndex === filtered.length ? "kn-selected" : ""}" data-idx="${filtered.length}" data-action="settings">
      <div class="kn-action-icon kn-action-icon-system">${icon("settings", 18)}</div>
      <div class="kn-action-info">
        <div class="kn-action-name">Settings</div>
        <div class="kn-action-desc">Configure API keys & integrations</div>
      </div>
      <div class="kn-action-badge">Command</div>
    </div>`;

    list.innerHTML = html;

    list.querySelectorAll(".kn-action-item").forEach(el => {
      el.addEventListener("click", () => {
        const actionId = el.dataset.action;
        if (actionId === "settings") {
          showSettings();
        } else {
          const allActions = [...getSmartActions(currentContext), ...STATIC_ACTIONS];
          const action = allActions.find(a => a.id === actionId);
          if (action) handleActionSelect(action);
        }
      });
      el.addEventListener("mouseenter", () => {
        const idx = parseInt(el.dataset.idx);
        if (!isNaN(idx)) {
          selectedIndex = idx;
          updateSelection();
        }
      });
    });
  }

  function renderActionItem(action, idx) {
    const sparkle = action.category === "smart" ? ` ${icon("sparkles", 12)}` : "";
    const contextReason = action.contextReason ? `<span class="kn-context-reason">${action.contextReason}</span>` : "";
    return `<div class="kn-action-item ${selectedIndex === idx ? "kn-selected" : ""}" data-idx="${idx}" data-action="${action.id}">
      <div class="kn-action-icon" style="background:${action.color};">${icon(action.icon, 18)}</div>
      <div class="kn-action-info">
        <div class="kn-action-name">${action.name}${sparkle}</div>
        <div class="kn-action-desc">${action.description} ${contextReason}</div>
      </div>
      <div class="kn-action-badge">${action.badge}</div>
    </div>`;
  }

  function updateSelection() {
    const items = shadowRoot.querySelectorAll(".kn-action-item");
    items.forEach((el) => {
      el.classList.toggle("kn-selected", parseInt(el.dataset.idx) === selectedIndex);
    });
  }

  // ============================================================
  // ACTION HANDLERS - Different flows for different actions
  // ============================================================
  
  async function handleActionSelect(action) {
    currentAction = action;
    
    // Smart actions that auto-generate content
    const autoGenerateActions = [
      "email-page", "email-quote", 
      "summarize-slack", "slack-quote", 
      "save-notion", "save-selection-notion", 
      "github-comment",
      "save-docs", "save-selection-docs", "share-discord",
      "report-bug", "schedule-meeting", "log-page-sheets"
    ];
    
    if (action.id === "generate-standup") {
      // Special standup flow
      await showStandupDataFetch();
    } else if (action.id === "extract-tasks") {
      // Extract tasks flow
      await showExtractTasks();
    } else if (autoGenerateActions.includes(action.id)) {
      // Auto-generate content on open
      await showSmartFormWithGeneration(action);
    } else {
      // Regular form (no auto-generation)
      showRegularForm(action);
    }
  }

  // Smart form that auto-generates content when opened (like Keyshots)
  async function showSmartFormWithGeneration(action) {
    currentView = "form";
    const content = shadowRoot.getElementById("kn-content");
    const footer = shadowRoot.getElementById("kn-footer");
    footer.style.display = "none";

    const ctx = currentContext || ContextDetector.detect();
    const actionTitle = action.name;

    // Show loading state
    const loadingSteps = getLoadingSteps(action.id);
    content.innerHTML = `
      <div class="kn-loading-view">
        <div class="kn-loading-title">${icon("sparkles", 16)} ${actionTitle}</div>
        <div class="kn-loading-steps" id="kn-loading-steps">
          ${loadingSteps.map((s, i) => `<div class="kn-step" data-step="${i}">
            <span class="kn-step-icon kn-step-pending">${icon("loader", 14)}</span>
            <span class="kn-step-text">${s}</span>
          </div>`).join("")}
        </div>
        <div class="kn-loading-spinner">
          <div class="kn-spinner"></div>
        </div>
      </div>
    `;

    // Start step animation
    animateSteps(loadingSteps.length);

    try {
      let result;
      
      if (action.id === "email-page" || action.id === "email-quote") {
        result = await AIClient.generateEmail(ctx);
        generatedContent = result;
        showEmailForm(action, result);
      } else if (action.id === "summarize-slack" || action.id === "slack-quote") {
        result = await AIClient.generateSlackMessage(ctx);
        generatedContent = result;
        showSlackForm(action, result);
      } else if (action.id === "save-notion" || action.id === "save-selection-notion") {
        // Generate a structured summary for Notion
        const content = ctx.hasSelection ? ctx.selectedText : ctx.pageContent?.substring(0, 3000);
        const prompt = `Summarize and structure this content for a Notion page. Include key points as bullet points:\n\n${content}`;
        const summary = await AIClient.generateContent(prompt);
        generatedContent = { title: ctx.pageTitle, content: summary };
        showNotionForm(action, generatedContent);
      } else if (action.id === "github-comment") {
        const prompt = `Generate a helpful GitHub comment for: ${ctx.pageTitle}\n\n${ctx.hasSelection ? ctx.selectedText : ctx.pageContent?.substring(0, 1000)}`;
        const comment = await AIClient.generateContent(prompt);
        generatedContent = { comment };
        showGitHubCommentForm(action, comment);
      } else if (action.id === "save-docs" || action.id === "save-selection-docs") {
        result = await AIClient.generateGoogleDoc(ctx);
        generatedContent = result;
        showGoogleDocsForm(action, result);
      } else if (action.id === "share-discord") {
        result = await AIClient.generateDiscordMessage(ctx);
        generatedContent = result;
        showDiscordForm(action, result);
      } else if (action.id === "report-bug") {
        result = await AIClient.generateLinearIssue(ctx);
        generatedContent = result;
        showLinearIssueForm(action, result);
      } else if (action.id === "schedule-meeting") {
        result = await AIClient.generateCalendarEvent(ctx);
        generatedContent = result;
        showCalendarEventForm(action, result);
      } else if (action.id === "log-page-sheets") {
        result = await AIClient.generateSheetData(ctx);
        generatedContent = result;
        showSheetsForm(action, result);
      }
    } catch (error) {
      showError(error.message);
    }
  }

  function showEmailForm(action, emailData) {
    currentView = "form";
    const content = shadowRoot.getElementById("kn-content");
    const footer = shadowRoot.getElementById("kn-footer");
    footer.style.display = "";

    content.innerHTML = `
      <div class="kn-form-header">
        <button class="kn-back-btn" id="kn-back">${icon("arrow-left", 16)}</button>
        <div class="kn-action-icon-sm" style="background:${action.color};">${icon(action.icon, 16)}</div>
        <span class="kn-form-title">${action.name}</span>
        <span class="kn-ai-badge">${icon("sparkles", 12)} AI Generated</span>
      </div>
      <div class="kn-form-body">
        <div class="kn-form-group">
          <label class="kn-label">Recipient</label>
          <input type="email" class="kn-input" id="kn-field-recipient" placeholder="name@example.com" data-field="recipient" />
        </div>
        <div class="kn-form-group">
          <label class="kn-label">Subject <span class="kn-ai-label">${icon("sparkles", 10)} AI</span></label>
          <input type="text" class="kn-input" id="kn-field-subject" value="${escapeHtml(emailData.subject || '')}" data-field="subject" />
        </div>
        <div class="kn-form-group">
          <label class="kn-label">Message <span class="kn-ai-label">${icon("sparkles", 10)} AI</span></label>
          <textarea class="kn-textarea" id="kn-field-body" rows="8" data-field="body">${escapeHtml(emailData.body || '')}</textarea>
        </div>
      </div>
      <div class="kn-form-actions">
        <button class="kn-btn kn-btn-ghost" id="kn-regenerate">${icon("refresh", 14)} Regenerate</button>
        <div style="display:flex;gap:10px;">
          <button class="kn-btn kn-btn-ghost" id="kn-cancel">Cancel</button>
          <button class="kn-btn kn-btn-primary" id="kn-submit">Send Email <kbd class="kn-kbd kn-kbd-sm">\u2318\u23CE</kbd></button>
        </div>
      </div>
    `;

    setupFormListeners(action);
    setTimeout(() => shadowRoot.getElementById("kn-field-recipient")?.focus(), 50);
  }

  function showSlackForm(action, slackData) {
    currentView = "form";
    const content = shadowRoot.getElementById("kn-content");
    const footer = shadowRoot.getElementById("kn-footer");
    footer.style.display = "";

    content.innerHTML = `
      <div class="kn-form-header">
        <button class="kn-back-btn" id="kn-back">${icon("arrow-left", 16)}</button>
        <div class="kn-action-icon-sm" style="background:${action.color};">${icon(action.icon, 16)}</div>
        <span class="kn-form-title">${action.name}</span>
        <span class="kn-ai-badge">${icon("sparkles", 12)} AI Generated</span>
      </div>
      <div class="kn-form-body">
        <div class="kn-form-group">
          <label class="kn-label">Channel</label>
          <input type="text" class="kn-input" id="kn-field-channel" value="${escapeHtml('#' + (slackData.suggestedChannel || 'general'))}" data-field="channel" />
        </div>
        <div class="kn-form-group">
          <label class="kn-label">Message <span class="kn-ai-label">${icon("sparkles", 10)} AI</span></label>
          <textarea class="kn-textarea" id="kn-field-message" rows="10" data-field="message">${escapeHtml(slackData.message || '')}</textarea>
        </div>
      </div>
      <div class="kn-form-actions">
        <button class="kn-btn kn-btn-ghost" id="kn-regenerate">${icon("refresh", 14)} Regenerate</button>
        <div style="display:flex;gap:10px;">
          <button class="kn-btn kn-btn-ghost" id="kn-cancel">Cancel</button>
          <button class="kn-btn kn-btn-primary" id="kn-submit">Post to Slack <kbd class="kn-kbd kn-kbd-sm">\u2318\u23CE</kbd></button>
        </div>
      </div>
    `;

    setupFormListeners(action);
    setTimeout(() => shadowRoot.getElementById("kn-field-message")?.focus(), 50);
  }

  // Store Notion parents for selection
  let notionParents = [];
  let selectedNotionParent = null;

  async function showNotionForm(action, data) {
    currentView = "form";
    const content = shadowRoot.getElementById("kn-content");
    const footer = shadowRoot.getElementById("kn-footer");
    footer.style.display = "";

    const title = data?.title || currentContext?.pageTitle || 'Untitled';
    const bodyContent = data?.content || currentContext?.pageContent?.substring(0, 2000) || '';

    // Fetch Notion parents in background
    sendMessageToBackground({ action: "fetchNotionParents" }).then(result => {
      notionParents = result.parents || [];
      if (notionParents.length > 0) {
        selectedNotionParent = notionParents[0];
        updateNotionParentSelector();
      }
    });

    content.innerHTML = `
      <div class="kn-form-header">
        <button class="kn-back-btn" id="kn-back">${icon("arrow-left", 16)}</button>
        <div class="kn-action-icon-sm" style="background:${action.color};">${icon(action.icon, 16)}</div>
        <span class="kn-form-title">${action.name}</span>
        <span class="kn-ai-badge">${icon("sparkles", 12)} AI Structured</span>
      </div>
      <div class="kn-form-body">
        <div class="kn-form-group">
          <label class="kn-label">Save to</label>
          <select class="kn-input" id="kn-notion-parent" data-field="parent">
            <option value="">Loading pages...</option>
          </select>
        </div>
        <div class="kn-form-group">
          <label class="kn-label">Page Title</label>
          <input type="text" class="kn-input" id="kn-field-title" value="${escapeHtml(title)}" data-field="title" />
        </div>
        <div class="kn-form-group">
          <label class="kn-label">Content <span class="kn-ai-label">${icon("sparkles", 10)} AI</span></label>
          <textarea class="kn-textarea" id="kn-field-content" rows="8" data-field="content">${escapeHtml(bodyContent)}</textarea>
        </div>
      </div>
      <div class="kn-form-actions">
        <button class="kn-btn kn-btn-ghost" id="kn-regenerate">${icon("refresh", 14)} Regenerate</button>
        <div style="display:flex;gap:10px;">
          <button class="kn-btn kn-btn-ghost" id="kn-cancel">Cancel</button>
          <button class="kn-btn kn-btn-primary" id="kn-submit">Create in Notion <kbd class="kn-kbd kn-kbd-sm">\u2318\u23CE</kbd></button>
        </div>
      </div>
    `;

    // Listen for parent selection changes
    shadowRoot.getElementById("kn-notion-parent")?.addEventListener("change", (e) => {
      const selected = notionParents.find(p => p.id === e.target.value);
      if (selected) {
        selectedNotionParent = selected;
      }
    });

    setupFormListeners(action);
  }

  function updateNotionParentSelector() {
    const select = shadowRoot.getElementById("kn-notion-parent");
    if (!select) return;

    if (notionParents.length === 0) {
      select.innerHTML = `<option value="">No pages found - check Notion token</option>`;
      return;
    }

    select.innerHTML = notionParents.map(p => 
      `<option value="${p.id}" ${selectedNotionParent?.id === p.id ? 'selected' : ''}>${escapeHtml(p.title)}</option>`
    ).join('');
  }

  function showGitHubCommentForm(action, comment) {
    currentView = "form";
    const content = shadowRoot.getElementById("kn-content");
    const footer = shadowRoot.getElementById("kn-footer");
    footer.style.display = "";

    content.innerHTML = `
      <div class="kn-form-header">
        <button class="kn-back-btn" id="kn-back">${icon("arrow-left", 16)}</button>
        <div class="kn-action-icon-sm" style="background:${action.color};">${icon(action.icon, 16)}</div>
        <span class="kn-form-title">${action.name}</span>
        <span class="kn-ai-badge">${icon("sparkles", 12)} AI Generated</span>
      </div>
      <div class="kn-form-body">
        <div class="kn-form-group">
          <label class="kn-label">Comment <span class="kn-ai-label">${icon("sparkles", 10)} AI</span></label>
          <textarea class="kn-textarea" id="kn-field-comment" rows="10" data-field="comment">${escapeHtml(comment)}</textarea>
        </div>
      </div>
      <div class="kn-form-actions">
        <button class="kn-btn kn-btn-ghost" id="kn-regenerate">${icon("refresh", 14)} Regenerate</button>
        <div style="display:flex;gap:10px;">
          <button class="kn-btn kn-btn-ghost" id="kn-cancel">Cancel</button>
          <button class="kn-btn kn-btn-primary" id="kn-submit">Copy Comment <kbd class="kn-kbd kn-kbd-sm">\u2318\u23CE</kbd></button>
        </div>
      </div>
    `;

    setupFormListeners(action);
  }

  // ============================================================
  // NEW INTEGRATION FORMS - Google Docs, Discord, Linear, Calendar, Sheets
  // ============================================================

  function showGoogleDocsForm(action, docData) {
    currentView = "form";
    const content = shadowRoot.getElementById("kn-content");
    const footer = shadowRoot.getElementById("kn-footer");
    footer.style.display = "";

    content.innerHTML = `
      <div class="kn-form-header">
        <button class="kn-back-btn" id="kn-back">${icon("arrow-left", 16)}</button>
        <div class="kn-action-icon-sm" style="background:${action.color};">${icon(action.icon, 16)}</div>
        <span class="kn-form-title">${action.name}</span>
        <span class="kn-ai-badge">${icon("sparkles", 12)} AI Structured</span>
      </div>
      <div class="kn-form-body">
        <div class="kn-form-group">
          <label class="kn-label">Document Title <span class="kn-ai-label">${icon("sparkles", 10)} AI</span></label>
          <input type="text" class="kn-input" id="kn-field-doc-title" value="${escapeHtml(docData.title || '')}" data-field="docTitle" />
        </div>
        <div class="kn-form-group">
          <label class="kn-label">Summary <span class="kn-ai-label">${icon("sparkles", 10)} AI</span></label>
          <textarea class="kn-textarea" id="kn-field-doc-summary" rows="2" data-field="docSummary">${escapeHtml(docData.summary || '')}</textarea>
        </div>
        <div class="kn-form-group">
          <label class="kn-label">Content <span class="kn-ai-label">${icon("sparkles", 10)} AI</span></label>
          <textarea class="kn-textarea" id="kn-field-doc-content" rows="8" data-field="docContent">${escapeHtml(docData.content || '')}</textarea>
        </div>
      </div>
      <div class="kn-form-actions">
        <button class="kn-btn kn-btn-ghost" id="kn-regenerate">${icon("refresh", 14)} Regenerate</button>
        <div style="display:flex;gap:10px;">
          <button class="kn-btn kn-btn-ghost" id="kn-cancel">Cancel</button>
          <button class="kn-btn kn-btn-primary" id="kn-submit">Create Document <kbd class="kn-kbd kn-kbd-sm">\u2318\u23CE</kbd></button>
        </div>
      </div>
    `;

    setupFormListeners(action);
    setTimeout(() => shadowRoot.getElementById("kn-field-doc-title")?.focus(), 50);
  }

  function showDiscordForm(action, discordData) {
    currentView = "form";
    const content = shadowRoot.getElementById("kn-content");
    const footer = shadowRoot.getElementById("kn-footer");
    footer.style.display = "";

    content.innerHTML = `
      <div class="kn-form-header">
        <button class="kn-back-btn" id="kn-back">${icon("arrow-left", 16)}</button>
        <div class="kn-action-icon-sm" style="background:${action.color};">${icon(action.icon, 16)}</div>
        <span class="kn-form-title">${action.name}</span>
        <span class="kn-ai-badge">${icon("sparkles", 12)} AI Generated</span>
      </div>
      <div class="kn-form-body">
        <div class="kn-form-group">
          <label class="kn-label">Suggested Channel</label>
          <input type="text" class="kn-input" id="kn-field-discord-channel" value="${escapeHtml('#' + (discordData.suggestedChannel || 'general'))}" data-field="discordChannel" />
        </div>
        <div class="kn-form-group">
          <label class="kn-label">Message <span class="kn-ai-label">${icon("sparkles", 10)} AI</span></label>
          <textarea class="kn-textarea" id="kn-field-discord-message" rows="10" data-field="discordMessage">${escapeHtml(discordData.message || '')}</textarea>
        </div>
      </div>
      <div class="kn-form-actions">
        <button class="kn-btn kn-btn-ghost" id="kn-regenerate">${icon("refresh", 14)} Regenerate</button>
        <div style="display:flex;gap:10px;">
          <button class="kn-btn kn-btn-ghost" id="kn-cancel">Cancel</button>
          <button class="kn-btn kn-btn-primary" id="kn-submit">Send to Discord <kbd class="kn-kbd kn-kbd-sm">\u2318\u23CE</kbd></button>
        </div>
      </div>
    `;

    setupFormListeners(action);
    setTimeout(() => shadowRoot.getElementById("kn-field-discord-message")?.focus(), 50);
  }

  // Store Linear data
  let linearTeams = [];
  let linearLabels = [];
  let selectedLinearTeam = null;

  function showLinearIssueForm(action, issueData) {
    currentView = "form";
    const content = shadowRoot.getElementById("kn-content");
    const footer = shadowRoot.getElementById("kn-footer");
    footer.style.display = "";

    // Fetch Linear teams in background
    sendMessageToBackground({ action: "fetchLinearTeams" }).then(result => {
      linearTeams = result.teams || [];
      if (linearTeams.length > 0) {
        selectedLinearTeam = linearTeams[0];
        updateLinearTeamSelector();
      }
    });

    const priorityOptions = [
      { value: 0, label: "No priority" },
      { value: 1, label: "Urgent" },
      { value: 2, label: "High" },
      { value: 3, label: "Medium" },
      { value: 4, label: "Low" }
    ];

    content.innerHTML = `
      <div class="kn-form-header">
        <button class="kn-back-btn" id="kn-back">${icon("arrow-left", 16)}</button>
        <div class="kn-action-icon-sm" style="background:${action.color};">${icon(action.icon, 16)}</div>
        <span class="kn-form-title">${action.name}</span>
        <span class="kn-ai-badge">${icon("sparkles", 12)} AI Generated</span>
      </div>
      <div class="kn-form-body">
        <div class="kn-form-group">
          <label class="kn-label">Team</label>
          <select class="kn-input" id="kn-linear-team" data-field="linearTeam">
            <option value="">Loading teams...</option>
          </select>
        </div>
        <div class="kn-form-group">
          <label class="kn-label">Title <span class="kn-ai-label">${icon("sparkles", 10)} AI</span></label>
          <input type="text" class="kn-input" id="kn-field-linear-title" value="${escapeHtml(issueData.title || '')}" data-field="linearTitle" />
        </div>
        <div class="kn-form-group">
          <label class="kn-label">Description <span class="kn-ai-label">${icon("sparkles", 10)} AI</span></label>
          <textarea class="kn-textarea" id="kn-field-linear-desc" rows="6" data-field="linearDescription">${escapeHtml(issueData.description || '')}</textarea>
        </div>
        <div class="kn-form-row">
          <div class="kn-form-group" style="flex:1;">
            <label class="kn-label">Priority</label>
            <select class="kn-input" id="kn-field-linear-priority" data-field="linearPriority">
              ${priorityOptions.map(p => `<option value="${p.value}" ${issueData.priority === p.value ? 'selected' : ''}>${p.label}</option>`).join('')}
            </select>
          </div>
          <div class="kn-form-group" style="flex:1;">
            <label class="kn-label">Labels</label>
            <input type="text" class="kn-input" id="kn-field-linear-labels" value="${escapeHtml((issueData.labels || []).join(', '))}" placeholder="bug, feature" data-field="linearLabels" />
          </div>
        </div>
      </div>
      <div class="kn-form-actions">
        <button class="kn-btn kn-btn-ghost" id="kn-regenerate">${icon("refresh", 14)} Regenerate</button>
        <div style="display:flex;gap:10px;">
          <button class="kn-btn kn-btn-ghost" id="kn-cancel">Cancel</button>
          <button class="kn-btn kn-btn-primary" id="kn-submit">Create Issue <kbd class="kn-kbd kn-kbd-sm">\u2318\u23CE</kbd></button>
        </div>
      </div>
    `;

    // Listen for team selection
    shadowRoot.getElementById("kn-linear-team")?.addEventListener("change", (e) => {
      const selected = linearTeams.find(t => t.id === e.target.value);
      if (selected) selectedLinearTeam = selected;
    });

    setupFormListeners(action);
    setTimeout(() => shadowRoot.getElementById("kn-field-linear-title")?.focus(), 50);
  }

  function updateLinearTeamSelector() {
    const select = shadowRoot.getElementById("kn-linear-team");
    if (!select) return;

    if (linearTeams.length === 0) {
      select.innerHTML = `<option value="">No teams found</option>`;
      return;
    }

    select.innerHTML = linearTeams.map(t => 
      `<option value="${t.id}" ${selectedLinearTeam?.id === t.id ? 'selected' : ''}>${escapeHtml(t.name)} (${t.key})</option>`
    ).join('');
  }

  function showCalendarEventForm(action, eventData) {
    currentView = "form";
    const content = shadowRoot.getElementById("kn-content");
    const footer = shadowRoot.getElementById("kn-footer");
    footer.style.display = "";

    // Format date for input
    const startDate = eventData.startTime ? new Date(eventData.startTime) : new Date();
    const formattedDate = startDate.toISOString().slice(0, 16);

    content.innerHTML = `
      <div class="kn-form-header">
        <button class="kn-back-btn" id="kn-back">${icon("arrow-left", 16)}</button>
        <div class="kn-action-icon-sm" style="background:${action.color};">${icon(action.icon, 16)}</div>
        <span class="kn-form-title">${action.name}</span>
        <span class="kn-ai-badge">${icon("sparkles", 12)} AI Extracted</span>
      </div>
      <div class="kn-form-body">
        <div class="kn-form-group">
          <label class="kn-label">Event Title <span class="kn-ai-label">${icon("sparkles", 10)} AI</span></label>
          <input type="text" class="kn-input" id="kn-field-event-title" value="${escapeHtml(eventData.title || '')}" data-field="eventTitle" />
        </div>
        <div class="kn-form-row">
          <div class="kn-form-group" style="flex:1;">
            <label class="kn-label">Start Time</label>
            <input type="datetime-local" class="kn-input" id="kn-field-event-start" value="${formattedDate}" data-field="eventStart" />
          </div>
          <div class="kn-form-group" style="flex:0.5;">
            <label class="kn-label">Duration (min)</label>
            <input type="number" class="kn-input" id="kn-field-event-duration" value="${eventData.duration || 30}" min="15" step="15" data-field="eventDuration" />
          </div>
        </div>
        <div class="kn-form-group">
          <label class="kn-label">Description <span class="kn-ai-label">${icon("sparkles", 10)} AI</span></label>
          <textarea class="kn-textarea" id="kn-field-event-desc" rows="3" data-field="eventDescription">${escapeHtml(eventData.description || '')}</textarea>
        </div>
        <div class="kn-form-group">
          <label class="kn-label">Attendees (comma-separated emails)</label>
          <input type="text" class="kn-input" id="kn-field-event-attendees" value="${escapeHtml((eventData.attendees || []).join(', '))}" placeholder="email@example.com" data-field="eventAttendees" />
        </div>
      </div>
      <div class="kn-form-actions">
        <button class="kn-btn kn-btn-ghost" id="kn-regenerate">${icon("refresh", 14)} Regenerate</button>
        <div style="display:flex;gap:10px;">
          <button class="kn-btn kn-btn-ghost" id="kn-cancel">Cancel</button>
          <button class="kn-btn kn-btn-primary" id="kn-submit">Create Event <kbd class="kn-kbd kn-kbd-sm">\u2318\u23CE</kbd></button>
        </div>
      </div>
    `;

    setupFormListeners(action);
    setTimeout(() => shadowRoot.getElementById("kn-field-event-title")?.focus(), 50);
  }

  // Store sheets list
  let spreadsheets = [];
  let selectedSpreadsheet = null;

  function showSheetsForm(action, sheetData) {
    currentView = "form";
    const content = shadowRoot.getElementById("kn-content");
    const footer = shadowRoot.getElementById("kn-footer");
    footer.style.display = "";

    // Fetch spreadsheets in background
    sendMessageToBackground({ action: "fetchSpreadsheets" }).then(result => {
      spreadsheets = result.spreadsheets || [];
      if (spreadsheets.length > 0) {
        selectedSpreadsheet = spreadsheets[0];
        updateSpreadsheetsSelector();
      }
    });

    const fields = sheetData.fields || ["Date", "Title", "URL", "Notes"];
    const values = sheetData.values || [];

    content.innerHTML = `
      <div class="kn-form-header">
        <button class="kn-back-btn" id="kn-back">${icon("arrow-left", 16)}</button>
        <div class="kn-action-icon-sm" style="background:${action.color};">${icon(action.icon, 16)}</div>
        <span class="kn-form-title">${action.name}</span>
        <span class="kn-ai-badge">${icon("sparkles", 12)} AI Extracted</span>
      </div>
      <div class="kn-form-body">
        <div class="kn-form-group">
          <label class="kn-label">Spreadsheet</label>
          <select class="kn-input" id="kn-sheets-selector" data-field="spreadsheetId">
            <option value="">Loading spreadsheets...</option>
          </select>
        </div>
        <div class="kn-form-group">
          <label class="kn-label">Sheet Name</label>
          <input type="text" class="kn-input" id="kn-field-sheet-name" value="Sheet1" data-field="sheetName" />
        </div>
        <div class="kn-form-group">
          <label class="kn-label">Data to Log <span class="kn-ai-label">${icon("sparkles", 10)} AI</span></label>
          <div class="kn-sheet-preview">
            ${fields.map((field, i) => `
              <div class="kn-sheet-row">
                <label class="kn-sheet-label">${escapeHtml(field)}</label>
                <input type="text" class="kn-input" value="${escapeHtml(values[i] || '')}" data-sheet-value="${i}" />
              </div>
            `).join('')}
          </div>
        </div>
      </div>
      <div class="kn-form-actions">
        <button class="kn-btn kn-btn-ghost" id="kn-regenerate">${icon("refresh", 14)} Regenerate</button>
        <div style="display:flex;gap:10px;">
          <button class="kn-btn kn-btn-ghost" id="kn-cancel">Cancel</button>
          <button class="kn-btn kn-btn-primary" id="kn-submit">Log to Sheet <kbd class="kn-kbd kn-kbd-sm">\u2318\u23CE</kbd></button>
        </div>
      </div>
    `;

    // Listen for spreadsheet selection
    shadowRoot.getElementById("kn-sheets-selector")?.addEventListener("change", (e) => {
      const selected = spreadsheets.find(s => s.id === e.target.value);
      if (selected) selectedSpreadsheet = selected;
    });

    setupFormListeners(action);
  }

  function updateSpreadsheetsSelector() {
    const select = shadowRoot.getElementById("kn-sheets-selector");
    if (!select) return;

    if (spreadsheets.length === 0) {
      select.innerHTML = `<option value="">No spreadsheets found</option>`;
      return;
    }

    select.innerHTML = spreadsheets.map(s => 
      `<option value="${s.id}" ${selectedSpreadsheet?.id === s.id ? 'selected' : ''}>${escapeHtml(s.name)}</option>`
    ).join('');
  }

  function showRegularForm(action) {
    currentView = "form";
    const content = shadowRoot.getElementById("kn-content");
    const footer = shadowRoot.getElementById("kn-footer");
    footer.style.display = "";
    const ctx = currentContext || ContextDetector.detect();

    let fieldsHtml = "";
    if (action.id === "send-email") {
      fieldsHtml = `
        <div class="kn-form-group">
          <label class="kn-label">Recipient</label>
          <input type="email" class="kn-input" id="kn-field-recipient" placeholder="name@example.com" data-field="recipient" />
        </div>
        <div class="kn-form-group">
          <label class="kn-label">Subject</label>
          <input type="text" class="kn-input" id="kn-field-subject" placeholder="Subject" data-field="subject" />
        </div>
        <div class="kn-form-group">
          <label class="kn-label">Message</label>
          <textarea class="kn-textarea" id="kn-field-body" rows="6" placeholder="Write your message..." data-field="body"></textarea>
        </div>
      `;
    } else if (action.id === "send-slack") {
      fieldsHtml = `
        <div class="kn-form-group">
          <label class="kn-label">Channel</label>
          <input type="text" class="kn-input" id="kn-field-channel" placeholder="#general" data-field="channel" />
        </div>
        <div class="kn-form-group">
          <label class="kn-label">Message</label>
          <textarea class="kn-textarea" id="kn-field-message" rows="6" placeholder="Write your message..." data-field="message"></textarea>
        </div>
      `;
    } else if (action.id === "create-notion") {
      fieldsHtml = `
        <div class="kn-form-group">
          <label class="kn-label">Page Title</label>
          <input type="text" class="kn-input" id="kn-field-title" placeholder="Page title" data-field="title" />
        </div>
        <div class="kn-form-group">
          <label class="kn-label">Content</label>
          <textarea class="kn-textarea" id="kn-field-content" rows="6" placeholder="Page content..." data-field="content"></textarea>
        </div>
      `;
    } else if (action.id === "send-discord") {
      fieldsHtml = `
        <div class="kn-form-group">
          <label class="kn-label">Channel</label>
          <input type="text" class="kn-input" id="kn-field-discord-channel" placeholder="#general" data-field="discordChannel" />
        </div>
        <div class="kn-form-group">
          <label class="kn-label">Message</label>
          <textarea class="kn-textarea" id="kn-field-discord-message" rows="6" placeholder="Write your message..." data-field="discordMessage"></textarea>
        </div>
      `;
    } else if (action.id === "create-doc") {
      fieldsHtml = `
        <div class="kn-form-group">
          <label class="kn-label">Document Title</label>
          <input type="text" class="kn-input" id="kn-field-doc-title" placeholder="Document title" data-field="docTitle" />
        </div>
        <div class="kn-form-group">
          <label class="kn-label">Content</label>
          <textarea class="kn-textarea" id="kn-field-doc-content" rows="6" placeholder="Document content..." data-field="docContent"></textarea>
        </div>
      `;
    } else if (action.id === "create-event") {
      const now = new Date();
      const formattedDate = now.toISOString().slice(0, 16);
      fieldsHtml = `
        <div class="kn-form-group">
          <label class="kn-label">Event Title</label>
          <input type="text" class="kn-input" id="kn-field-event-title" placeholder="Meeting title" data-field="eventTitle" />
        </div>
        <div class="kn-form-row" style="display:flex;gap:10px;">
          <div class="kn-form-group" style="flex:1;">
            <label class="kn-label">Start Time</label>
            <input type="datetime-local" class="kn-input" id="kn-field-event-start" value="${formattedDate}" data-field="eventStart" />
          </div>
          <div class="kn-form-group" style="flex:0.5;">
            <label class="kn-label">Duration (min)</label>
            <input type="number" class="kn-input" id="kn-field-event-duration" value="30" min="15" step="15" data-field="eventDuration" />
          </div>
        </div>
        <div class="kn-form-group">
          <label class="kn-label">Description</label>
          <textarea class="kn-textarea" id="kn-field-event-desc" rows="3" placeholder="Meeting agenda..." data-field="eventDescription"></textarea>
        </div>
      `;
    } else if (action.id === "log-sheets") {
      fieldsHtml = `
        <div class="kn-form-group">
          <label class="kn-label">Spreadsheet ID</label>
          <input type="text" class="kn-input" id="kn-field-spreadsheet-id" placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms" data-field="spreadsheetId" />
        </div>
        <div class="kn-form-group">
          <label class="kn-label">Sheet Name</label>
          <input type="text" class="kn-input" id="kn-field-sheet-name" value="Sheet1" data-field="sheetName" />
        </div>
        <div class="kn-form-group">
          <label class="kn-label">Values (comma-separated)</label>
          <input type="text" class="kn-input" id="kn-field-sheet-values" placeholder="Value1, Value2, Value3" data-field="sheetValues" />
        </div>
      `;
    } else if (action.id === "create-linear-issue") {
      fieldsHtml = `
        <div class="kn-form-group">
          <label class="kn-label">Title</label>
          <input type="text" class="kn-input" id="kn-field-linear-title" placeholder="Issue title" data-field="linearTitle" />
        </div>
        <div class="kn-form-group">
          <label class="kn-label">Description</label>
          <textarea class="kn-textarea" id="kn-field-linear-desc" rows="4" placeholder="Issue description..." data-field="linearDescription"></textarea>
        </div>
        <div class="kn-form-group">
          <label class="kn-label">Priority (0-4, 0=none, 1=urgent)</label>
          <input type="number" class="kn-input" id="kn-field-linear-priority" value="3" min="0" max="4" data-field="linearPriority" />
        </div>
      `;
    } else {
      fieldsHtml = `
        <div class="kn-form-group">
          <label class="kn-label">Title</label>
          <input type="text" class="kn-input" id="kn-field-title" placeholder="Title" data-field="title" />
        </div>
        <div class="kn-form-group">
          <label class="kn-label">Content</label>
          <textarea class="kn-textarea" id="kn-field-content" rows="6" placeholder="Content..." data-field="content"></textarea>
        </div>
      `;
    }

    content.innerHTML = `
      <div class="kn-form-header">
        <button class="kn-back-btn" id="kn-back">${icon("arrow-left", 16)}</button>
        <div class="kn-action-icon-sm" style="background:${action.color};">${icon(action.icon, 16)}</div>
        <span class="kn-form-title">${action.name}</span>
      </div>
      <div class="kn-form-body">
        ${fieldsHtml}
      </div>
      <div class="kn-form-actions">
        <button class="kn-btn kn-btn-ghost" id="kn-cancel">Cancel</button>
        <button class="kn-btn kn-btn-primary" id="kn-submit">Submit <kbd class="kn-kbd kn-kbd-sm">\u2318\u23CE</kbd></button>
      </div>
    `;

    setupFormListeners(action);
    const firstInput = content.querySelector(".kn-input, .kn-textarea");
    if (firstInput) setTimeout(() => firstInput.focus(), 50);
  }

  function setupFormListeners(action) {
    shadowRoot.getElementById("kn-back")?.addEventListener("click", showPalette);
    shadowRoot.getElementById("kn-cancel")?.addEventListener("click", showPalette);
    shadowRoot.getElementById("kn-submit")?.addEventListener("click", handleFormSubmit);
    shadowRoot.getElementById("kn-regenerate")?.addEventListener("click", () => showSmartFormWithGeneration(action));
  }

  async function showExtractTasks() {
    currentView = "form";
    const content = shadowRoot.getElementById("kn-content");
    const footer = shadowRoot.getElementById("kn-footer");
    footer.style.display = "none";

    const ctx = currentContext;

    // Show loading
    content.innerHTML = `
      <div class="kn-loading-view">
        <div class="kn-loading-title">${icon("sparkles", 16)} Extract Tasks</div>
        <div class="kn-loading-steps">
          <div class="kn-step"><span class="kn-step-icon kn-step-pending">${icon("loader", 14)}</span><span class="kn-step-text">Analyzing text</span></div>
          <div class="kn-step"><span class="kn-step-icon">${icon("loader", 14)}</span><span class="kn-step-text">Finding action items</span></div>
          <div class="kn-step"><span class="kn-step-icon">${icon("loader", 14)}</span><span class="kn-step-text">Assigning priorities</span></div>
        </div>
        <div class="kn-loading-spinner"><div class="kn-spinner"></div></div>
      </div>
    `;

    try {
      const tasks = await AIClient.extractTasks(ctx.selectedText);
      generatedContent = tasks;
      showExtractedTasksForm(tasks);
    } catch (error) {
      showError(error.message);
    }
  }

  function showExtractedTasksForm(tasks) {
    currentView = "form";
    const content = shadowRoot.getElementById("kn-content");
    const footer = shadowRoot.getElementById("kn-footer");
    footer.style.display = "";

    let tasksHtml = "";
    if (!tasks || tasks.length === 0) {
      tasksHtml = `<div class="kn-no-tasks">No tasks found in the selected text.</div>`;
    } else {
      tasksHtml = tasks.map((t, i) => `
        <div class="kn-task-item">
          <input type="checkbox" class="kn-task-checkbox" id="kn-task-${i}" checked />
          <div class="kn-task-content">
            <div class="kn-task-title">${escapeHtml(t.task)}</div>
            <div class="kn-task-meta">
              ${t.assignee !== 'Unassigned' ? `<span>@${escapeHtml(t.assignee)}</span>` : ''}
              ${t.dueDate && t.dueDate !== 'null' ? `<span>Due: ${t.dueDate}</span>` : ''}
              <span class="kn-task-priority kn-priority-${t.priority}">${t.priority}</span>
            </div>
          </div>
        </div>
      `).join('');
    }

    content.innerHTML = `
      <div class="kn-form-header">
        <button class="kn-back-btn" id="kn-back">${icon("arrow-left", 16)}</button>
        <div class="kn-action-icon-sm" style="background:#5E6AD2;">${icon("list-checks", 16)}</div>
        <span class="kn-form-title">Extract Tasks</span>
        <span class="kn-ai-badge">${icon("sparkles", 12)} ${tasks?.length || 0} found</span>
      </div>
      <div class="kn-form-body">
        <div class="kn-tasks-list">
          ${tasksHtml}
        </div>
      </div>
      <div class="kn-form-actions">
        <button class="kn-btn kn-btn-ghost" id="kn-cancel">Cancel</button>
        <button class="kn-btn kn-btn-primary" id="kn-submit">Create Tasks <kbd class="kn-kbd kn-kbd-sm">\u2318\u23CE</kbd></button>
      </div>
    `;

    shadowRoot.getElementById("kn-back")?.addEventListener("click", showPalette);
    shadowRoot.getElementById("kn-cancel")?.addEventListener("click", showPalette);
    shadowRoot.getElementById("kn-submit")?.addEventListener("click", () => {
      // Copy tasks to clipboard
      const tasksText = tasks.map(t => `- [ ] ${t.task}${t.assignee !== 'Unassigned' ? ` (@${t.assignee})` : ''}${t.dueDate && t.dueDate !== 'null' ? ` - Due: ${t.dueDate}` : ''}`).join('\n');
      navigator.clipboard.writeText(tasksText);
      showSuccess(currentAction, { copied: true, content: `${tasks.length} tasks copied to clipboard` });
    });
  }

  // ============================================================
  // STANDUP FLOW - Fetch activity then generate
  // ============================================================
  
  async function showStandupDataFetch() {
    currentView = "standup";
    const content = shadowRoot.getElementById("kn-content");
    const footer = shadowRoot.getElementById("kn-footer");
    footer.style.display = "none";

    content.innerHTML = `
      <div class="kn-loading-view">
        <div class="kn-loading-title">${icon("bar-chart", 16)} Generate Standup</div>
        <div class="kn-loading-steps">
          <div class="kn-step kn-step-active" id="kn-step-github">
            <span class="kn-step-icon">${icon("loader", 14)}</span>
            <span class="kn-step-text">Fetching GitHub commits (last 24h)</span>
          </div>
          <div class="kn-step" id="kn-step-notion">
            <span class="kn-step-icon">○</span>
            <span class="kn-step-text">Checking Notion tasks</span>
          </div>
          <div class="kn-step" id="kn-step-calendar">
            <span class="kn-step-icon">○</span>
            <span class="kn-step-text">Loading calendar events</span>
          </div>
        </div>
        <div class="kn-loading-spinner"><div class="kn-spinner"></div></div>
        <p style="color: rgba(255, 255, 255, 0.4); font-size: 13px; margin-top: 16px;">This may take a few seconds</p>
      </div>
    `;

    try {
      const activity = await ActivityFetcher.fetchAllActivity();
      
      // Animate steps completion
      const stepGithub = shadowRoot.getElementById("kn-step-github");
      if (stepGithub) {
        stepGithub.classList.remove("kn-step-active");
        stepGithub.classList.add("kn-step-complete");
        stepGithub.querySelector(".kn-step-icon").innerHTML = icon("check", 14);
      }
      
      await sleep(300);
      
      const stepNotion = shadowRoot.getElementById("kn-step-notion");
      if (stepNotion) {
        stepNotion.classList.add("kn-step-active");
        stepNotion.querySelector(".kn-step-icon").innerHTML = icon("loader", 14);
      }
      
      await sleep(300);
      
      if (stepNotion) {
        stepNotion.classList.remove("kn-step-active");
        stepNotion.classList.add("kn-step-complete");
        stepNotion.querySelector(".kn-step-icon").innerHTML = icon("check", 14);
      }
      
      const stepCalendar = shadowRoot.getElementById("kn-step-calendar");
      if (stepCalendar) {
        stepCalendar.classList.add("kn-step-active");
        stepCalendar.querySelector(".kn-step-icon").innerHTML = icon("loader", 14);
      }
      
      await sleep(300);
      
      if (stepCalendar) {
        stepCalendar.classList.remove("kn-step-active");
        stepCalendar.classList.add("kn-step-complete");
        stepCalendar.querySelector(".kn-step-icon").innerHTML = icon("check", 14);
      }

      // Store data
      standupData.commits = activity.commits || [];
      standupData.tasks = activity.tasks || [];
      standupData.meetings = activity.meetings || [];
      standupData.selectedCommits = standupData.commits.map((_, i) => i);
      standupData.selectedTasks = standupData.tasks.map((_, i) => i);
      standupData.selectedMeetings = standupData.meetings.map((_, i) => i);

      const hasData = standupData.commits.length > 0 || standupData.tasks.length > 0 || standupData.meetings.length > 0;

      if (!hasData) {
        showStandupNoActivity(activity.errors);
      } else {
        await sleep(300);
        showStandupActivityReview();
      }
    } catch (error) {
      showError('Failed to fetch activity data: ' + error.message);
    }
  }

  function showStandupNoActivity(errors = []) {
    const content = shadowRoot.getElementById("kn-content");
    const footer = shadowRoot.getElementById("kn-footer");
    footer.style.display = "";

    let errorHtml = '';
    if (errors.length > 0) {
      errorHtml = `<div class="kn-standup-errors">${errors.map(e => `<div class="kn-error-item">⚠️ ${e.source}: ${e.error}</div>`).join('')}</div>`;
    }

    content.innerHTML = `
      <div class="kn-success-view">
        <div class="kn-error-icon" style="background:rgba(245,158,11,0.15);color:#F59E0B;">${icon("file", 32)}</div>
        <div class="kn-success-text">No activity found in the last 24 hours</div>
        ${errorHtml}
        <p style="color: rgba(255, 255, 255, 0.4); font-size: 13px; margin: 16px 0;">Make sure your GitHub and Notion tokens are configured in Settings.</p>
        <div style="display:flex;gap:12px;">
          <button class="kn-btn kn-btn-ghost" id="kn-standup-settings">Open Settings</button>
          <button class="kn-btn kn-btn-primary" id="kn-standup-back">Go Back</button>
        </div>
      </div>
    `;

    shadowRoot.getElementById("kn-standup-back")?.addEventListener("click", showPalette);
    shadowRoot.getElementById("kn-standup-settings")?.addEventListener("click", showSettings);
  }

  function showStandupActivityReview() {
    currentView = "standup-review";
    const content = shadowRoot.getElementById("kn-content");
    const footer = shadowRoot.getElementById("kn-footer");
    footer.style.display = "";
    
    const { commits, tasks, meetings } = standupData;

    let sectionsHtml = '';

    if (commits.length > 0) {
      sectionsHtml += `
        <div class="kn-activity-section">
          <div class="kn-activity-header">
            <input type="checkbox" id="kn-toggle-commits" checked />
            <label for="kn-toggle-commits"><strong>GitHub</strong> (${commits.length} commit${commits.length !== 1 ? 's' : ''})</label>
          </div>
          <div class="kn-activity-items">
            ${commits.map((c, i) => `
              <div class="kn-activity-item">
                <input type="checkbox" id="kn-commit-${i}" data-type="commits" data-index="${i}" checked />
                <label for="kn-commit-${i}">
                  <div class="kn-activity-title">${escapeHtml(c.message)}</div>
                  <div class="kn-activity-meta">${c.repo} • ${formatTimeAgo(c.time)}</div>
                </label>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    if (tasks.length > 0) {
      sectionsHtml += `
        <div class="kn-activity-section">
          <div class="kn-activity-header">
            <input type="checkbox" id="kn-toggle-tasks" checked />
            <label for="kn-toggle-tasks"><strong>Notion</strong> (${tasks.length} task${tasks.length !== 1 ? 's' : ''})</label>
          </div>
          <div class="kn-activity-items">
            ${tasks.map((t, i) => `
              <div class="kn-activity-item">
                <input type="checkbox" id="kn-task-${i}" data-type="tasks" data-index="${i}" checked />
                <label for="kn-task-${i}">
                  <div class="kn-activity-title">${escapeHtml(t.title)}</div>
                  <div class="kn-activity-meta">${t.status ? t.status + ' • ' : ''}${formatTimeAgo(t.lastEdited)}</div>
                </label>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    if (meetings.length > 0) {
      sectionsHtml += `
        <div class="kn-activity-section">
          <div class="kn-activity-header">
            <input type="checkbox" id="kn-toggle-meetings" checked />
            <label for="kn-toggle-meetings"><strong>Calendar</strong> (${meetings.length} meeting${meetings.length !== 1 ? 's' : ''})</label>
          </div>
          <div class="kn-activity-items">
            ${meetings.map((m, i) => `
              <div class="kn-activity-item">
                <input type="checkbox" id="kn-meeting-${i}" data-type="meetings" data-index="${i}" checked />
                <label for="kn-meeting-${i}">
                  <div class="kn-activity-title">${escapeHtml(m.summary)}</div>
                  <div class="kn-activity-meta">${m.duration}min • ${m.attendees} attendees</div>
                </label>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    content.innerHTML = `
      <div class="kn-form-header">
        <button class="kn-back-btn" id="kn-back">${icon("arrow-left", 16)}</button>
        <div class="kn-action-icon-sm" style="background:#10B981;">${icon("bar-chart", 16)}</div>
        <span class="kn-form-title">Generate Standup</span>
      </div>
      <div class="kn-standup-summary">Found activity from last 24 hours ${icon("sparkles", 14)}</div>
      <div class="kn-form-body" style="padding-top:0;">
        ${sectionsHtml}
        <div class="kn-blockers-section">
          <label class="kn-blockers-label">
            <input type="checkbox" id="kn-include-blockers" />
            <span>Include blockers/challenges?</span>
          </label>
          <div id="kn-blockers-container" style="display:none;margin-top:12px;">
            <textarea id="kn-blockers-input" class="kn-textarea" rows="3" placeholder="Any blockers or challenges? (optional)"></textarea>
          </div>
        </div>
      </div>
      <div class="kn-form-actions">
        <button class="kn-btn kn-btn-ghost" id="kn-cancel">Cancel</button>
        <button class="kn-btn kn-btn-primary" id="kn-generate-standup">Generate Update ${icon("sparkles", 14)}</button>
      </div>
    `;

    // Setup event listeners
    shadowRoot.getElementById("kn-back")?.addEventListener("click", showPalette);
    shadowRoot.getElementById("kn-cancel")?.addEventListener("click", showPalette);
    shadowRoot.getElementById("kn-generate-standup")?.addEventListener("click", generateStandupMessage);
    
    shadowRoot.getElementById("kn-include-blockers")?.addEventListener("change", (e) => {
      const container = shadowRoot.getElementById("kn-blockers-container");
      if (container) container.style.display = e.target.checked ? "block" : "none";
    });

    // Toggle all listeners
    ["commits", "tasks", "meetings"].forEach(type => {
      shadowRoot.getElementById(`kn-toggle-${type}`)?.addEventListener("change", (e) => {
        const items = shadowRoot.querySelectorAll(`[data-type="${type}"]`);
        items.forEach(item => item.checked = e.target.checked);
        standupData[`selected${type.charAt(0).toUpperCase() + type.slice(1)}`] = e.target.checked 
          ? standupData[type].map((_, i) => i) 
          : [];
      });
    });

    // Individual item listeners
    shadowRoot.querySelectorAll(".kn-activity-item input[type='checkbox']").forEach(cb => {
      cb.addEventListener("change", (e) => {
        const type = e.target.dataset.type;
        const index = parseInt(e.target.dataset.index);
        const key = `selected${type.charAt(0).toUpperCase() + type.slice(1)}`;
        if (e.target.checked) {
          if (!standupData[key].includes(index)) standupData[key].push(index);
        } else {
          standupData[key] = standupData[key].filter(i => i !== index);
        }
      });
    });
  }

  async function generateStandupMessage() {
    const includeBlockers = shadowRoot.getElementById("kn-include-blockers")?.checked;
    standupData.blockers = includeBlockers ? (shadowRoot.getElementById("kn-blockers-input")?.value.trim() || '') : '';

    const content = shadowRoot.getElementById("kn-content");
    const footer = shadowRoot.getElementById("kn-footer");
    footer.style.display = "none";

    content.innerHTML = `
      <div class="kn-loading-view">
        <div class="kn-loading-title">${icon("sparkles", 16)} Generate Standup</div>
        <div class="kn-loading-steps">
          <div class="kn-step kn-step-active"><span class="kn-step-icon">${icon("loader", 14)}</span><span class="kn-step-text">Analyzing activity</span></div>
          <div class="kn-step"><span class="kn-step-icon">○</span><span class="kn-step-text">Formatting for Slack</span></div>
          <div class="kn-step"><span class="kn-step-icon">○</span><span class="kn-step-text">Adding context</span></div>
        </div>
        <div class="kn-loading-spinner"><div class="kn-spinner"></div></div>
      </div>
    `;

    try {
      const selectedCommits = standupData.selectedCommits.map(i => standupData.commits[i]);
      const selectedTasks = standupData.selectedTasks.map(i => standupData.tasks[i]);
      const selectedMeetings = standupData.selectedMeetings.map(i => standupData.meetings[i]);

      const message = await AIClient.generateStandup(selectedCommits, selectedTasks, selectedMeetings, standupData.blockers);
      generatedContent = { standup: message };
      showStandupEditor(message);
    } catch (error) {
      showError('Failed to generate standup: ' + error.message);
    }
  }

  function showStandupEditor(message) {
    currentView = "standup-editor";
    const content = shadowRoot.getElementById("kn-content");
    const footer = shadowRoot.getElementById("kn-footer");
    footer.style.display = "";

    content.innerHTML = `
      <div class="kn-form-header">
        <button class="kn-back-btn" id="kn-back">${icon("arrow-left", 16)}</button>
        <div class="kn-action-icon-sm" style="background:#10B981;">${icon("bar-chart", 16)}</div>
        <span class="kn-form-title">Generate Standup</span>
        <span class="kn-ai-badge">${icon("sparkles", 12)} AI Generated</span>
      </div>
      <div class="kn-form-body">
        <div class="kn-form-group">
          <label class="kn-label">Standup Update</label>
          <textarea id="kn-standup-message" class="kn-textarea" style="min-height:240px;">${escapeHtml(message)}</textarea>
          <div class="kn-hint">You can edit this message before posting</div>
        </div>
      </div>
      <div class="kn-form-actions" style="justify-content:space-between;">
        <button class="kn-btn kn-btn-ghost" id="kn-regenerate">${icon("refresh", 14)} Regenerate</button>
        <div style="display:flex;gap:10px;">
          <button class="kn-btn kn-btn-ghost" id="kn-cancel">Cancel</button>
          <button class="kn-btn kn-btn-primary" id="kn-submit">Copy & Post <kbd class="kn-kbd kn-kbd-sm">\u2318\u23CE</kbd></button>
        </div>
      </div>
    `;

    shadowRoot.getElementById("kn-back")?.addEventListener("click", showStandupActivityReview);
    shadowRoot.getElementById("kn-cancel")?.addEventListener("click", showPalette);
    shadowRoot.getElementById("kn-regenerate")?.addEventListener("click", generateStandupMessage);
    shadowRoot.getElementById("kn-submit")?.addEventListener("click", () => {
      const msg = shadowRoot.getElementById("kn-standup-message")?.value || message;
      navigator.clipboard.writeText(msg);
      showSuccess({ name: "Standup", icon: "bar-chart", color: "#10B981" }, { copied: true, content: "Standup copied to clipboard!" });
    });

    shadowRoot.getElementById("kn-standup-message")?.focus();
  }

  // ============================================================
  // FORM SUBMIT HANDLER
  // ============================================================
  
  async function handleFormSubmit() {
    const inputs = shadowRoot.querySelectorAll("[data-field]");
    const data = {};
    inputs.forEach(el => {
      data[el.dataset.field] = el.value;
    });

    const actionId = currentAction?.id;
    
    // Handle different action types
    if (actionId === "email-page" || actionId === "email-quote" || actionId === "send-email") {
      // Send via Gmail API
      const recipient = data.recipient?.trim();
      const subject = data.subject?.trim();
      const body = data.body?.trim();
      
      if (!recipient) {
        showError("Please enter a recipient email address");
        return;
      }
      
      showLoadingState("Sending email...");
      
      try {
        const response = await sendMessageToBackground({
          action: "sendGmail",
          to: recipient,
          subject: subject || "(No subject)",
          body: body || ""
        });
        
        if (response.error) {
          showError(response.error);
        } else {
          showSuccess(currentAction, { sent: true, content: `Email sent to ${recipient}` });
        }
      } catch (error) {
        showError(error.message);
      }
      return;
    }
    
    if (actionId === "summarize-slack" || actionId === "slack-quote" || actionId === "send-slack") {
      // Send via Slack webhook
      const channel = data.channel?.trim();
      const message = data.message?.trim();
      
      if (!message) {
        showError("Please enter a message");
        return;
      }
      
      showLoadingState("Posting to Slack...");
      
      try {
        const response = await sendMessageToBackground({
          action: "sendSlack",
          channel: channel,
          message: message
        });
        
        if (response.error) {
          showError(response.error);
        } else {
          showSuccess(currentAction, { sent: true, content: "Message posted to Slack!" });
        }
      } catch (error) {
        showError(error.message);
      }
      return;
    }
    
    // Notion actions - create page via API
    if (actionId === "save-notion" || actionId === "save-selection-notion" || actionId === "create-notion") {
      const title = data.title || 'Untitled';
      const content = data.content || '';
      
      if (!selectedNotionParent) {
        showError("Please select a Notion page or database to save to.");
        return;
      }
      
      showLoadingState("Creating page in Notion...");
      
      try {
        const response = await sendMessageToBackground({
          action: "createNotionPage",
          title: title,
          content: content,
          parentId: selectedNotionParent.id,
          parentType: selectedNotionParent.type
        });
        
        if (response.error) {
          showError(response.error);
        } else {
          showSuccess(currentAction, { 
            sent: true, 
            content: `Page "${title}" created in Notion!`,
            url: response.url
          });
        }
      } catch (error) {
        showError(error.message);
      }
      return;
    }

    // Google Docs actions - create document via server API
    if (actionId === "save-docs" || actionId === "save-selection-docs" || actionId === "create-doc") {
      const title = data.docTitle || 'Untitled Document';
      const summary = data.docSummary || '';
      const content = data.docContent || '';
      const fullContent = summary ? `${summary}\n\n${content}` : content;
      
      showLoadingState("Creating Google Doc...");
      
      try {
        const response = await sendMessageToBackground({
          action: "createGoogleDoc",
          title: title,
          content: fullContent
        });
        
        if (response.error) {
          showError(response.error);
        } else {
          showSuccess(currentAction, { 
            sent: true, 
            content: `Document "${title}" created!`,
            url: response.url
          });
        }
      } catch (error) {
        showError(error.message);
      }
      return;
    }

    // Discord actions - send via webhook
    if (actionId === "share-discord" || actionId === "send-discord") {
      const message = data.discordMessage?.trim();
      
      if (!message) {
        showError("Please enter a message");
        return;
      }
      
      showLoadingState("Posting to Discord...");
      
      try {
        const response = await sendMessageToBackground({
          action: "sendDiscord",
          message: message
        });
        
        if (response.error) {
          showError(response.error);
        } else {
          showSuccess(currentAction, { sent: true, content: "Message posted to Discord!" });
        }
      } catch (error) {
        showError(error.message);
      }
      return;
    }

    // Linear actions - create issue via server API
    if (actionId === "report-bug" || actionId === "create-linear-issue") {
      const title = data.linearTitle?.trim();
      const description = data.linearDescription || '';
      const priority = parseInt(data.linearPriority) || 3;
      const labels = data.linearLabels ? data.linearLabels.split(',').map(l => l.trim()).filter(l => l) : [];
      
      if (!title) {
        showError("Please enter an issue title");
        return;
      }
      
      showLoadingState("Creating Linear issue...");
      
      try {
        const response = await sendMessageToBackground({
          action: "createLinearIssue",
          title: title,
          description: description,
          teamId: selectedLinearTeam?.id,
          priority: priority,
          labels: labels
        });
        
        if (response.error) {
          showError(response.error);
        } else {
          showSuccess(currentAction, { 
            sent: true, 
            content: `Issue "${response.identifier || title}" created in Linear!`,
            url: response.url
          });
        }
      } catch (error) {
        showError(error.message);
      }
      return;
    }

    // Calendar actions - create event via server API
    if (actionId === "schedule-meeting" || actionId === "create-event") {
      const title = data.eventTitle?.trim();
      const startTime = data.eventStart;
      const duration = parseInt(data.eventDuration) || 30;
      const description = data.eventDescription || '';
      const attendees = data.eventAttendees ? data.eventAttendees.split(',').map(e => e.trim()).filter(e => e.includes('@')) : [];
      
      if (!title) {
        showError("Please enter an event title");
        return;
      }
      
      if (!startTime) {
        showError("Please select a start time");
        return;
      }
      
      // Calculate end time
      const startDate = new Date(startTime);
      const endDate = new Date(startDate.getTime() + duration * 60 * 1000);
      
      showLoadingState("Creating calendar event...");
      
      try {
        const response = await sendMessageToBackground({
          action: "createCalendarEvent",
          title: title,
          description: description,
          startTime: startDate.toISOString(),
          endTime: endDate.toISOString(),
          attendees: attendees
        });
        
        if (response.error) {
          showError(response.error);
        } else {
          showSuccess(currentAction, { 
            sent: true, 
            content: `Event "${title}" created!`,
            url: response.htmlLink
          });
        }
      } catch (error) {
        showError(error.message);
      }
      return;
    }

    // Sheets actions - append row via server API
    if (actionId === "log-page-sheets" || actionId === "log-sheets") {
      const spreadsheetId = data.spreadsheetId || selectedSpreadsheet?.id;
      const sheetName = data.sheetName || 'Sheet1';
      
      // Collect sheet values
      const sheetValueInputs = shadowRoot.querySelectorAll("[data-sheet-value]");
      let values = [];
      if (sheetValueInputs.length > 0) {
        sheetValueInputs.forEach(el => values.push(el.value));
      } else if (data.sheetValues) {
        values = data.sheetValues.split(',').map(v => v.trim());
      }
      
      if (!spreadsheetId) {
        showError("Please select or enter a spreadsheet ID");
        return;
      }
      
      if (values.length === 0) {
        showError("Please enter values to log");
        return;
      }
      
      showLoadingState("Logging to Google Sheets...");
      
      try {
        const response = await sendMessageToBackground({
          action: "appendSheetRow",
          spreadsheetId: spreadsheetId,
          sheetName: sheetName,
          values: values
        });
        
        if (response.error) {
          showError(response.error);
        } else {
          showSuccess(currentAction, { sent: true, content: "Data logged to spreadsheet!" });
        }
      } catch (error) {
        showError(error.message);
      }
      return;
    }
    
    // For other actions (GitHub comment, etc.) - copy to clipboard
    const textToCopy = data.body || data.message || data.comment || data.content || data.docContent || data.discordMessage || '';
    if (textToCopy) {
      navigator.clipboard.writeText(textToCopy).then(() => {
        showSuccess(currentAction, { copied: true, content: textToCopy.substring(0, 100) + '...' });
      });
    } else {
      showSuccess(currentAction, { copied: true, content: 'Content ready!' });
    }
  }
  
  function showLoadingState(message) {
    const content = shadowRoot.getElementById("kn-content");
    const footer = shadowRoot.getElementById("kn-footer");
    footer.style.display = "none";
    
    content.innerHTML = `
      <div class="kn-loading-view">
        <div class="kn-loading-title">${icon("loader", 16)} ${message}</div>
        <div class="kn-loading-spinner"><div class="kn-spinner"></div></div>
      </div>
    `;
  }
  
  function sendMessageToBackground(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response || {});
        }
      });
    });
  }

  function getLoadingSteps(actionId) {
    const map = {
      "email-page": ["Reading page content", "Writing subject line", "Composing message"],
      "email-quote": ["Processing selection", "Writing subject line", "Composing message"],
      "summarize-slack": ["Reading article", "Extracting key points", "Formatting for Slack"],
      "slack-quote": ["Processing selection", "Creating summary", "Adding emojis"],
      "save-notion": ["Analyzing content", "Structuring page", "Preparing save"],
      "save-selection-notion": ["Processing selection", "Structuring content", "Preparing save"],
      "extract-tasks": ["Scanning content", "Finding action items", "Assigning priorities"],
      "github-comment": ["Reading context", "Analyzing code", "Writing comment"],
      "save-docs": ["Reading article", "Structuring content", "Formatting for Docs"],
      "save-selection-docs": ["Processing selection", "Creating document", "Formatting"],
      "share-discord": ["Reading content", "Creating summary", "Adding Discord flair"],
      "report-bug": ["Analyzing error", "Creating description", "Setting priority"],
      "schedule-meeting": ["Parsing text", "Extracting date/time", "Creating event details"],
      "log-page-sheets": ["Reading page", "Extracting data", "Structuring for spreadsheet"],
    };
    return map[actionId] || ["Processing", "Analyzing", "Generating"];
  }

  function animateSteps(total) {
    let step = 0;
    const interval = setInterval(() => {
      if (step >= total || !["form", "loading"].includes(currentView)) {
        clearInterval(interval);
        return;
      }
      const stepEl = shadowRoot.querySelector(`[data-step="${step}"]`);
      if (stepEl) {
        const iconEl = stepEl.querySelector(".kn-step-icon");
        iconEl.classList.remove("kn-step-pending");
        iconEl.classList.add("kn-step-done");
        iconEl.innerHTML = icon("check", 14);
        stepEl.querySelector(".kn-step-text").classList.add("kn-step-text-done");
      }
      step++;
    }, 600);
  }

  function showSuccess(action, result) {
    currentView = "success";
    const content = shadowRoot.getElementById("kn-content");
    const footer = shadowRoot.getElementById("kn-footer");
    footer.style.display = "";

    let resultPreview = "";
    if (result?.sent) {
      resultPreview = `<div class="kn-result-section"><div class="kn-result-label">${icon("send", 12)} ${escapeHtml(result.content || 'Sent!')}</div></div>`;
    } else if (result?.copied) {
      resultPreview = `<div class="kn-result-section"><div class="kn-result-label">${icon("copy", 12)} Copied to clipboard</div><div class="kn-result-body">${escapeHtml(result.content || '')}</div></div>`;
    }

    content.innerHTML = `
      <div class="kn-success-view">
        <div class="kn-success-icon">${icon("check", 32)}</div>
        <div class="kn-success-text">Done!</div>
        ${resultPreview}
      </div>
    `;

    setTimeout(() => {
      if (currentView === "success") hideOverlay();
    }, 2500);
  }

  function showError(message) {
    currentView = "error";
    const content = shadowRoot.getElementById("kn-content");
    const footer = shadowRoot.getElementById("kn-footer");
    footer.style.display = "";

    content.innerHTML = `
      <div class="kn-success-view">
        <div class="kn-error-icon">${icon("x", 32)}</div>
        <div class="kn-error-text">${escapeHtml(message)}</div>
        <button class="kn-btn kn-btn-ghost" id="kn-retry-back" style="margin-top:12px;">Back to actions</button>
      </div>
    `;

    shadowRoot.getElementById("kn-retry-back")?.addEventListener("click", showPalette);
  }

  function showSettings() {
    currentView = "settings";
    const content = shadowRoot.getElementById("kn-content");
    const footer = shadowRoot.getElementById("kn-footer");
    footer.style.display = "";

    content.innerHTML = `
      <div class="kn-form-header">
        <button class="kn-back-btn" id="kn-back">${icon("arrow-left", 16)}</button>
        <div class="kn-action-icon-sm kn-action-icon-system">${icon("settings", 16)}</div>
        <span class="kn-form-title">Settings</span>
      </div>
      <div class="kn-form-body">
        <div class="kn-settings-section">
          <div class="kn-settings-title">${icon("sparkles", 14)} AI (Claude)</div>
          <div class="kn-form-group">
            <label class="kn-label">Claude API Key</label>
            <input type="password" class="kn-input" id="kn-claude-key" placeholder="sk-ant-xxxxx" />
            <div class="kn-hint">Get from <a href="https://console.anthropic.com/settings/keys" target="_blank" style="color:#8B5CF6;">Anthropic Console</a></div>
          </div>
          <button class="kn-btn kn-btn-ghost" id="kn-test-ai" style="margin-top:8px;">Test Connection</button>
          <div class="kn-status" id="kn-ai-status" style="margin-top:10px;">Not configured</div>
        </div>

        <div class="kn-settings-section">
          <div class="kn-settings-title">${icon("cloud", 14)} Server URL (Optional)</div>
          <div class="kn-form-group">
            <label class="kn-label">Replit App URL</label>
            <input type="text" class="kn-input" id="kn-server-url" placeholder="https://your-app.replit.app" />
            <div class="kn-hint">Optional. For action logging and analytics.</div>
          </div>
        </div>
        
        <div class="kn-settings-section">
          <div class="kn-settings-title">${icon("mail", 14)} Google (Gmail, Calendar, Docs, Sheets, Drive)</div>
          <div class="kn-form-group">
            <label class="kn-label">OAuth Client ID</label>
            <input type="text" class="kn-input" id="kn-oauth-client-id" placeholder="xxxxxxxxxx.apps.googleusercontent.com" />
            <div class="kn-hint">Create at <a href="https://console.cloud.google.com/apis/credentials" target="_blank" style="color:#8B5CF6;">Google Cloud Console</a>. Add redirect URI shown below.</div>
          </div>
          <button class="kn-btn kn-btn-primary" id="kn-connect-google" style="margin-top:8px;">Connect Google Account</button>
          <div class="kn-status" id="kn-google-status" style="margin-top:10px;">Not connected</div>
          <div class="kn-hint" style="margin-top:8px;font-size:11px;opacity:0.7;">Redirect URI: <code style="background:rgba(0,0,0,0.3);padding:2px 6px;border-radius:4px;">${typeof chrome !== 'undefined' && chrome.identity ? chrome.identity.getRedirectURL() : 'chrome-extension://YOUR_ID/...'}</code></div>
        </div>
        
        <div class="kn-settings-section">
          <div class="kn-settings-title">${icon("hash", 14)} Slack</div>
          <div class="kn-form-group">
            <label class="kn-label">Webhook URL</label>
            <input type="text" class="kn-input" id="kn-slack-webhook" placeholder="https://hooks.slack.com/services/..." />
            <div class="kn-hint">Create at <a href="https://api.slack.com/messaging/webhooks" target="_blank" style="color:#8B5CF6;">Slack Incoming Webhooks</a></div>
          </div>
        </div>

        <div class="kn-settings-section">
          <div class="kn-settings-title">${icon("message-circle", 14)} Discord</div>
          <div class="kn-form-group">
            <label class="kn-label">Webhook URL</label>
            <input type="text" class="kn-input" id="kn-discord-webhook" placeholder="https://discord.com/api/webhooks/..." />
            <div class="kn-hint">Server Settings → Integrations → Webhooks → New Webhook</div>
          </div>
        </div>
        
        <div class="kn-settings-section">
          <div class="kn-settings-title">${icon("git-branch", 14)} GitHub</div>
          <div class="kn-form-group">
            <label class="kn-label">Personal Access Token</label>
            <input type="password" class="kn-input" id="kn-github-token" placeholder="ghp_xxxxxxxxxxxx" />
            <div class="kn-hint">Create at <a href="https://github.com/settings/tokens" target="_blank" style="color:#8B5CF6;">GitHub Settings</a> with repo read access</div>
          </div>
          <div class="kn-form-group">
            <label class="kn-label">Username</label>
            <input type="text" class="kn-input" id="kn-github-username" placeholder="your-username" />
          </div>
        </div>
        
        <div class="kn-settings-section">
          <div class="kn-settings-title">${icon("file-text", 14)} Notion</div>
          <div class="kn-form-group">
            <label class="kn-label">Integration Token</label>
            <input type="password" class="kn-input" id="kn-notion-token" placeholder="secret_xxxxxxxxxxxx" />
            <div class="kn-hint">Create at <a href="https://www.notion.so/my-integrations" target="_blank" style="color:#8B5CF6;">Notion Integrations</a> and share pages with it</div>
          </div>
        </div>

        <div class="kn-settings-section">
          <div class="kn-settings-title">${icon("zap", 14)} Linear</div>
          <div class="kn-form-group">
            <label class="kn-label">API Key</label>
            <input type="password" class="kn-input" id="kn-linear-api-key" placeholder="lin_api_xxxxxxxxxxxx" />
            <div class="kn-hint">Create at <a href="https://linear.app/settings/api" target="_blank" style="color:#8B5CF6;">Linear Settings → API</a></div>
          </div>
        </div>
      </div>
      <div class="kn-form-actions">
        <button class="kn-btn kn-btn-ghost" id="kn-cancel">Cancel</button>
        <button type="button" class="kn-btn kn-btn-primary" id="kn-save-settings">Save Settings</button>
      </div>
    `;

    shadowRoot.getElementById("kn-back")?.addEventListener("click", showPalette);
    shadowRoot.getElementById("kn-cancel")?.addEventListener("click", showPalette);
    
    // Test AI connection (Claude)
    shadowRoot.getElementById("kn-test-ai")?.addEventListener("click", async () => {
      const statusEl = shadowRoot.getElementById("kn-ai-status");
      const apiKey = shadowRoot.getElementById("kn-claude-key").value.trim();
      
      if (!apiKey) {
        statusEl.innerHTML = `<span style="color:#F59E0B;">Enter your Claude API key first</span>`;
        return;
      }
      
      statusEl.innerHTML = `<span style="color:#8B5CF6;">Testing Claude...</span>`;
      const result = await AIClient.testConnection(apiKey);
      statusEl.innerHTML = result.success 
        ? `<span style="color:#10B981;">Claude connected!</span>` 
        : `<span style="color:#EF4444;">${result.error}</span>`;
    });
    
    // Connect Google (unified OAuth for Gmail, Calendar, Docs, Sheets, Drive)
    shadowRoot.getElementById("kn-connect-google")?.addEventListener("click", async () => {
      const clientId = shadowRoot.getElementById("kn-oauth-client-id").value.trim();
      const statusEl = shadowRoot.getElementById("kn-google-status");
      
      if (!clientId) {
        statusEl.innerHTML = `<span style="color:#F59E0B;">Enter OAuth Client ID first</span>`;
        return;
      }
      
      // Save client ID first
      chrome.storage.local.set({ oauth_client_id: clientId });
      
      statusEl.innerHTML = `<span style="color:#8B5CF6;">Connecting...</span>`;
      
      try {
        const response = await sendMessageToBackground({ action: "googleAuth" });
        if (response.error) {
          statusEl.innerHTML = `<span style="color:#EF4444;">${response.error}</span>`;
        } else {
          statusEl.innerHTML = `<span style="color:#10B981;">Connected! Gmail, Calendar, Docs, Sheets, Drive ready.</span>`;
        }
      } catch (error) {
        statusEl.innerHTML = `<span style="color:#EF4444;">${error.message}</span>`;
      }
    });

    // Save all settings
    shadowRoot.getElementById("kn-save-settings")?.addEventListener("click", async () => {
      const serverUrl = shadowRoot.getElementById("kn-server-url").value.trim();
      const claudeKeyInput = shadowRoot.getElementById("kn-claude-key");
      const claudeKey = (claudeKeyInput && claudeKeyInput.value) ? claudeKeyInput.value.trim() : '';
      const oauthClientId = shadowRoot.getElementById("kn-oauth-client-id").value.trim();
      const slackWebhook = shadowRoot.getElementById("kn-slack-webhook").value.trim();
      const discordWebhook = shadowRoot.getElementById("kn-discord-webhook").value.trim();
      const githubToken = shadowRoot.getElementById("kn-github-token").value.trim();
      const githubUsername = shadowRoot.getElementById("kn-github-username").value.trim();
      const notionToken = shadowRoot.getElementById("kn-notion-token").value.trim();
      const linearApiKey = shadowRoot.getElementById("kn-linear-api-key").value.trim();
      
      // Get existing storage so we never overwrite Claude key with empty by mistake
      chrome.storage.local.get(['claude_api_key'], (existing) => {
        const prevClaude = (existing && existing.claude_api_key) ? existing.claude_api_key : '';
        const settings = {
          claude_api_key: claudeKey.length > 0 ? claudeKey : prevClaude,
          serverUrl: serverUrl || '',
          oauth_client_id: oauthClientId || '',
          slack_webhook_url: slackWebhook || '',
          discord_webhook_url: discordWebhook || '',
          github_token: githubToken || '',
          github_username: githubUsername || '',
          notion_token: notionToken || '',
          linear_api_key: linearApiKey || ''
        };
        
        chrome.storage.local.set(settings, () => {
          if (chrome.runtime.lastError) {
            const statusEl = shadowRoot.getElementById("kn-ai-status");
            if (statusEl) statusEl.innerHTML = `<span style="color:#EF4444;">Save failed: ${chrome.runtime.lastError.message}</span>`;
            return;
          }
          showPalette();
        });
      });
    });

    // Load existing settings
    chrome.storage.local.get([
      'serverUrl',
      'claude_api_key',
      'oauth_client_id',
      'google_access_token',
      'google_connected',
      'slack_webhook_url',
      'discord_webhook_url',
      'github_token', 
      'github_username', 
      'notion_token',
      'linear_api_key'
    ], (result) => {
      // Claude API key
      if (result.claude_api_key) {
        shadowRoot.getElementById("kn-claude-key").value = result.claude_api_key;
        shadowRoot.getElementById("kn-ai-status").innerHTML = `<span style="color:#10B981;">Claude configured</span>`;
      } else {
        shadowRoot.getElementById("kn-ai-status").innerHTML = `<span style="color:#F59E0B;">Not configured</span>`;
      }
      
      // Server URL
      if (result.serverUrl) {
        shadowRoot.getElementById("kn-server-url").value = result.serverUrl;
      }
      
      // Google OAuth
      if (result.oauth_client_id) shadowRoot.getElementById("kn-oauth-client-id").value = result.oauth_client_id;
      if (result.google_connected && result.google_access_token) {
        shadowRoot.getElementById("kn-google-status").innerHTML = `<span style="color:#10B981;">Connected! Gmail, Calendar, Docs, Sheets, Drive ready.</span>`;
      }
      
      // Webhooks
      if (result.slack_webhook_url) shadowRoot.getElementById("kn-slack-webhook").value = result.slack_webhook_url;
      if (result.discord_webhook_url) shadowRoot.getElementById("kn-discord-webhook").value = result.discord_webhook_url;
      
      // Other integrations
      if (result.github_token) shadowRoot.getElementById("kn-github-token").value = result.github_token;
      if (result.github_username) shadowRoot.getElementById("kn-github-username").value = result.github_username;
      if (result.notion_token) shadowRoot.getElementById("kn-notion-token").value = result.notion_token;
      if (result.linear_api_key) shadowRoot.getElementById("kn-linear-api-key").value = result.linear_api_key;
    });
  }

  // ============================================================
  // KEYBOARD HANDLER - Capture ALL keys when overlay is open
  // ============================================================
  
  function handleKeyDown(e) {
    // CRITICAL: Stop propagation to prevent keys from affecting the page
    e.stopPropagation();
    
    if (e.key === "Escape") {
      e.preventDefault();
      if (currentView === "palette") {
        hideOverlay();
      } else if (currentView === "standup-review") {
        showPalette();
      } else if (currentView === "standup-editor") {
        showStandupActivityReview();
      } else {
        showPalette();
      }
      return;
    }

    if (currentView === "palette") {
      const filtered = getFilteredActions();
      const totalItems = filtered.length + 1;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        selectedIndex = (selectedIndex + 1) % totalItems;
        updateSelection();
        scrollToSelected();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        selectedIndex = (selectedIndex - 1 + totalItems) % totalItems;
        updateSelection();
        scrollToSelected();
      } else if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        if (selectedIndex === filtered.length) {
          showSettings();
        } else {
          const action = filtered[selectedIndex];
          if (action) handleActionSelect(action);
        }
      }
    }

    // Cmd+Enter to submit forms
    if (["form", "standup-editor"].includes(currentView) && e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      shadowRoot.getElementById("kn-submit")?.click();
    }
  }

  function scrollToSelected() {
    const selected = shadowRoot.querySelector(".kn-selected");
    if (selected) selected.scrollIntoView({ block: "nearest" });
  }

  function showOverlay() {
    if (!overlayRoot) createOverlay();
    const overlay = shadowRoot.getElementById("kn-overlay");
    overlay.classList.remove("kn-hidden");
    isVisible = true;
    showPalette();
  }

  function hideOverlay() {
    if (!shadowRoot) return;
    const overlay = shadowRoot.getElementById("kn-overlay");
    overlay.classList.add("kn-hidden");
    isVisible = false;
    currentView = "palette";
  }

  function toggleOverlay() {
    if (isVisible) hideOverlay();
    else showOverlay();
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str || "";
    return div.innerHTML;
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function formatTimeAgo(isoString) {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "toggleOverlay") toggleOverlay();
  });

  // Global keyboard listener - CAPTURE phase to intercept before page
  document.addEventListener("keydown", (e) => {
    // Toggle overlay with Alt+Space or Cmd/Ctrl+K
    if ((e.altKey && e.code === "Space") || ((e.metaKey || e.ctrlKey) && e.key === "k")) {
      e.preventDefault();
      e.stopPropagation();
      toggleOverlay();
      return;
    }
    
    // When overlay is visible, route keys to our handler
    if (isVisible) {
      // Always stop propagation to prevent page from receiving keys
      e.stopPropagation();
      
      // Check if we're focused on an input/textarea inside the overlay
      const activeEl = shadowRoot?.activeElement;
      const isTyping = activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA");
      
      // Always handle Escape from any view
      if (e.key === "Escape") {
        e.preventDefault();
        handleKeyDown(e);
        return;
      }
      
      // Navigation keys that should work even when typing
      const isNavKey = e.key === "ArrowUp" || e.key === "ArrowDown" || 
                       (e.key === "Enter" && (e.metaKey || e.ctrlKey));
      
      // In palette view, handle ALL keys for navigation (arrows, enter, etc.)
      if (currentView === "palette") {
        handleKeyDown(e);
        return;
      }
      
      // In form views, only handle nav keys (Cmd+Enter for submit)
      if (isNavKey) {
        handleKeyDown(e);
      }
      // Otherwise let normal typing work in inputs
    }
  }, true); // CAPTURE phase

  function getStyles() {
    return `
      * { box-sizing: border-box; margin: 0; padding: 0; }

      @keyframes kn-fade-in { from { opacity: 0; } to { opacity: 1; } }
      @keyframes kn-slide-up { from { opacity: 0; transform: translateY(20px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
      @keyframes kn-spin { to { transform: rotate(360deg); } }
      @keyframes kn-success-pop { 0% { transform: scale(0.5); opacity: 0; } 60% { transform: scale(1.1); } 100% { transform: scale(1); opacity: 1; } }

      .kn-hidden { display: none !important; }

      #kn-overlay {
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        display: flex;
        align-items: flex-start;
        justify-content: center;
        padding-top: 12vh;
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        font-size: 14px;
        line-height: 1.5;
        color: #e4e4e7;
        -webkit-font-smoothing: antialiased;
      }

      .kn-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.65);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        animation: kn-fade-in 0.15s ease-out;
      }

      .kn-modal {
        position: relative;
        width: 580px;
        max-width: 92vw;
        max-height: 75vh;
        display: flex;
        flex-direction: column;
        border-radius: 16px;
        overflow: hidden;
        animation: kn-slide-up 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        background: linear-gradient(135deg, 
          rgba(30, 30, 35, 0.85) 0%, 
          rgba(20, 20, 25, 0.9) 50%, 
          rgba(25, 25, 32, 0.88) 100%);
        backdrop-filter: blur(40px) saturate(1.8);
        -webkit-backdrop-filter: blur(40px) saturate(1.8);
        border: 1px solid rgba(255, 255, 255, 0.1);
        box-shadow: 
          0 0 0 0.5px rgba(255, 255, 255, 0.08),
          0 0 80px rgba(139, 92, 246, 0.15),
          0 25px 60px rgba(0, 0, 0, 0.5),
          0 10px 20px rgba(0, 0, 0, 0.3),
          inset 0 1px 0 rgba(255, 255, 255, 0.05);
      }

      .kn-content { flex: 1; overflow-y: auto; overflow-x: hidden; scrollbar-width: none; }
      .kn-content::-webkit-scrollbar { display: none; }

      .kn-header { 
        position: sticky; 
        top: 0; 
        z-index: 10; 
        padding: 12px 16px; 
        border-bottom: 1px solid rgba(255,255,255,0.08); 
        background: linear-gradient(135deg, rgba(30, 30, 35, 0.98) 0%, rgba(20, 20, 25, 0.98) 100%);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
      }

      .kn-search {
        width: 100%;
        padding: 10px 14px;
        border-radius: 10px;
        border: 1px solid rgba(255,255,255,0.12);
        background: rgba(0, 0, 0, 0.3);
        color: #f4f4f5;
        font-size: 15px;
        font-family: inherit;
        outline: none;
        transition: all 0.2s ease;
      }
      .kn-search::placeholder { color: rgba(255,255,255,0.4); }
      .kn-search:focus { border-color: rgba(139,92,246,0.6); background: rgba(0, 0, 0, 0.4); box-shadow: 0 0 0 3px rgba(139,92,246,0.2); }

      .kn-context-banner {
        position: sticky;
        top: 53px;
        z-index: 9;
        display: flex; align-items: center; gap: 8px; padding: 8px 16px;
        font-size: 12px; color: rgba(255,255,255,0.6);
        background: rgba(139,92,246,0.15);
        border-bottom: 1px solid rgba(255,255,255,0.06);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
      }
      .kn-context-tag { padding: 2px 8px; border-radius: 4px; background: rgba(139,92,246,0.25); color: rgba(167,139,250,1); font-size: 11px; font-weight: 500; }

      .kn-list { padding: 6px 0; }
      .kn-group-label { padding: 10px 18px 6px; font-size: 11px; font-weight: 600; letter-spacing: 0.5px; color: rgba(255,255,255,0.45); text-transform: uppercase; display: flex; align-items: center; gap: 8px; }
      .kn-group-hint { font-weight: 400; color: rgba(167,139,250,0.8); font-size: 10px; text-transform: none; letter-spacing: 0; }

      .kn-action-item { display: flex; align-items: center; gap: 12px; padding: 10px 16px; cursor: pointer; transition: all 0.12s ease; margin: 0 4px; border-radius: 10px; }
      .kn-action-item.kn-selected { background: rgba(139,92,246,0.3); box-shadow: inset 0 0 0 1px rgba(139,92,246,0.35); }
      .kn-action-item:hover:not(.kn-selected) { background: rgba(255,255,255,0.08); }

      .kn-action-icon { width: 34px; height: 34px; border-radius: 9px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; color: #fff; box-shadow: 0 2px 8px rgba(0,0,0,0.3); }
      .kn-action-icon-system { background: rgba(255,255,255,0.12) !important; color: rgba(255,255,255,0.7); box-shadow: none; }
      .kn-action-icon svg { width: 18px; height: 18px; }

      .kn-action-info { flex: 1; min-width: 0; }
      .kn-action-name { font-size: 14px; font-weight: 500; color: #fafafa; display: flex; align-items: center; gap: 4px; }
      .kn-action-name .kn-icon { color: rgba(167,139,250,0.9); }
      .kn-action-desc { font-size: 12px; color: rgba(255,255,255,0.5); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; gap: 6px; }
      .kn-context-reason { padding: 1px 6px; border-radius: 3px; background: rgba(16,185,129,0.2); color: rgba(52,211,153,1); font-size: 10px; font-weight: 500; }
      .kn-action-badge { font-size: 11px; color: rgba(255,255,255,0.4); font-weight: 500; flex-shrink: 0; }

      .kn-footer { display: flex; align-items: center; justify-content: space-between; padding: 8px 16px; border-top: 1px solid rgba(255,255,255,0.08); font-size: 12px; color: rgba(255,255,255,0.45); gap: 8px; background: rgba(0,0,0,0.15); }
      .kn-footer-left, .kn-footer-right { display: flex; align-items: center; gap: 12px; }
      .kn-shortcut-group { display: flex; align-items: center; gap: 4px; }
      .kn-kbd { display: inline-flex; align-items: center; justify-content: center; min-width: 20px; height: 20px; padding: 0 5px; border-radius: 5px; font-size: 11px; font-family: inherit; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.12); color: rgba(255,255,255,0.6); }
      .kn-kbd-sm { min-width: 18px; height: 18px; font-size: 10px; margin-left: 6px; }

      .kn-form-header { display: flex; align-items: center; gap: 10px; padding: 14px 16px; border-bottom: 1px solid rgba(255,255,255,0.08); background: rgba(0,0,0,0.1); }
      .kn-back-btn { width: 30px; height: 30px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.7); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.15s ease; flex-shrink: 0; }
      .kn-back-btn:hover { background: rgba(255,255,255,0.15); color: #fff; }
      .kn-back-btn svg { width: 16px; height: 16px; }
      .kn-action-icon-sm { width: 28px; height: 28px; border-radius: 7px; display: flex; align-items: center; justify-content: center; color: #fff; flex-shrink: 0; box-shadow: 0 2px 8px rgba(0,0,0,0.3); }
      .kn-action-icon-sm svg { width: 16px; height: 16px; }
      .kn-form-title { font-size: 15px; font-weight: 600; color: #fafafa; flex: 1; }
      .kn-ai-badge { display: flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 6px; background: linear-gradient(135deg, rgba(139,92,246,0.25), rgba(168,85,247,0.25)); color: #C4B5FD; font-size: 11px; font-weight: 600; border: 1px solid rgba(139,92,246,0.2); }

      .kn-form-body { padding: 16px; }
      .kn-form-group { margin-bottom: 14px; }
      .kn-form-row { display: flex; gap: 12px; margin-bottom: 14px; }
      .kn-form-row .kn-form-group { margin-bottom: 0; }
      
      .kn-sheet-preview { display: flex; flex-direction: column; gap: 10px; }
      .kn-sheet-row { display: flex; align-items: center; gap: 10px; }
      .kn-sheet-label { font-size: 12px; font-weight: 500; color: rgba(255,255,255,0.5); min-width: 80px; }
      .kn-label { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.6); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.3px; }
      .kn-ai-label { display: inline-flex; align-items: center; gap: 2px; padding: 2px 6px; border-radius: 4px; background: rgba(139,92,246,0.2); color: #C4B5FD; font-size: 10px; font-weight: 500; text-transform: none; }

      .kn-radio-group { display: flex; gap: 16px; }
      .kn-radio-label { display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 14px; color: rgba(255,255,255,0.8); padding: 8px 16px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.2); transition: all 0.2s ease; }
      .kn-radio-label:hover { background: rgba(255,255,255,0.06); border-color: rgba(255,255,255,0.15); }
      .kn-radio-label:has(input:checked) { background: rgba(139,92,246,0.15); border-color: rgba(139,92,246,0.4); color: #fff; }
      .kn-radio-label input[type="radio"] { appearance: none; -webkit-appearance: none; width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.3); border-radius: 50%; margin: 0; cursor: pointer; transition: all 0.2s ease; position: relative; }
      .kn-radio-label input[type="radio"]:checked { border-color: #8B5CF6; background: #8B5CF6; }
      .kn-radio-label input[type="radio"]:checked::after { content: ""; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 6px; height: 6px; background: #fff; border-radius: 50%; }

      .kn-input, .kn-textarea { width: 100%; padding: 10px 14px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.12); background: rgba(0,0,0,0.35); color: #f4f4f5; font-size: 14px; font-family: inherit; outline: none; transition: all 0.2s ease; }
      .kn-input::placeholder, .kn-textarea::placeholder { color: rgba(255,255,255,0.4); }
      .kn-input:focus, .kn-textarea:focus { border-color: rgba(139,92,246,0.6); background: rgba(0,0,0,0.45); box-shadow: 0 0 0 3px rgba(139,92,246,0.2); }
      .kn-textarea { resize: vertical; min-height: 80px; line-height: 1.6; }
      .kn-hint { font-size: 12px; color: rgba(255,255,255,0.4); margin-top: 6px; }
      .kn-hint a { color: #A78BFA; text-decoration: none; }
      .kn-hint a:hover { text-decoration: underline; }

      .kn-form-actions { display: flex; justify-content: flex-end; gap: 10px; padding: 12px 16px; border-top: 1px solid rgba(255,255,255,0.08); background: rgba(0,0,0,0.1); }
      .kn-btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 18px; border-radius: 10px; font-size: 14px; font-weight: 500; font-family: inherit; cursor: pointer; transition: all 0.15s ease; border: none; }
      .kn-btn-ghost { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.8); border: 1px solid rgba(255,255,255,0.1); }
      .kn-btn-ghost:hover { background: rgba(255,255,255,0.14); color: #fff; border-color: rgba(255,255,255,0.15); }
      .kn-btn-primary { background: linear-gradient(135deg, #8b5cf6, #7c3aed); color: #fff; box-shadow: 0 2px 10px rgba(139,92,246,0.4), 0 0 20px rgba(139,92,246,0.2); }
      .kn-btn-primary:hover { background: linear-gradient(135deg, #a78bfa, #8b5cf6); box-shadow: 0 4px 16px rgba(139,92,246,0.5), 0 0 30px rgba(139,92,246,0.25); transform: translateY(-1px); }

      .kn-loading-view { padding: 32px 24px; text-align: center; }
      .kn-loading-title { font-size: 16px; font-weight: 600; color: #fafafa; margin-bottom: 24px; display: flex; align-items: center; justify-content: center; gap: 8px; }
      .kn-loading-title .kn-icon { color: rgba(167,139,250,0.9); }
      .kn-loading-steps { display: flex; flex-direction: column; gap: 12px; margin-bottom: 20px; }
      .kn-step { display: flex; align-items: center; gap: 10px; justify-content: center; transition: all 0.3s ease; }
      .kn-step-icon { display: flex; align-items: center; justify-content: center; width: 20px; height: 20px; }
      .kn-step-icon svg { width: 14px; height: 14px; }
      .kn-step-pending { color: rgba(255,255,255,0.3); animation: kn-spin 1s linear infinite; }
      .kn-step-done, .kn-step-complete .kn-step-icon { color: #10B981; animation: none; }
      .kn-step-active .kn-step-icon { color: rgba(139,92,246,0.8); animation: kn-spin 1s linear infinite; }
      .kn-step-text { font-size: 14px; color: rgba(139,92,246,0.7); transition: color 0.3s ease; }
      .kn-step-text-done, .kn-step-complete .kn-step-text { color: #10B981; }
      .kn-loading-spinner { display: flex; justify-content: center; margin-top: 8px; }
      .kn-spinner { width: 28px; height: 28px; border: 2.5px solid rgba(255,255,255,0.15); border-top-color: rgba(167,139,250,0.8); border-radius: 50%; animation: kn-spin 0.8s linear infinite; }

      .kn-success-view { padding: 40px 24px; text-align: center; }
      .kn-success-icon { width: 56px; height: 56px; border-radius: 50%; background: rgba(16,185,129,0.2); color: #34D399; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; animation: kn-success-pop 0.4s cubic-bezier(0.16,1,0.3,1); box-shadow: 0 0 20px rgba(16,185,129,0.2); }
      .kn-success-icon svg { width: 32px; height: 32px; }
      .kn-success-text { font-size: 16px; font-weight: 600; color: #f4f4f5; }
      .kn-error-icon { width: 56px; height: 56px; border-radius: 50%; background: rgba(239,68,68,0.2); color: #F87171; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; box-shadow: 0 0 20px rgba(239,68,68,0.15); }
      .kn-error-icon svg { width: 32px; height: 32px; }
      .kn-error-text { font-size: 14px; color: rgba(255,255,255,0.8); max-width: 380px; margin: 0 auto; }

      .kn-result-section { margin-top: 16px; padding: 14px; border-radius: 10px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06); text-align: left; }
      .kn-result-label { font-size: 11px; font-weight: 600; color: rgba(139,92,246,0.7); margin-bottom: 8px; display: flex; align-items: center; gap: 4px; text-transform: uppercase; letter-spacing: 0.3px; }
      .kn-result-body { font-size: 13px; color: rgba(255,255,255,0.6); line-height: 1.6; white-space: pre-wrap; }

      .kn-status { padding: 10px 14px; border-radius: 10px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06); font-size: 13px; }
      .kn-settings-section { margin-bottom: 24px; padding-bottom: 20px; border-bottom: 1px solid rgba(255,255,255,0.08); }
      .kn-settings-section:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
      .kn-settings-title { font-size: 13px; font-weight: 600; color: #fafafa; margin-bottom: 14px; display: flex; align-items: center; gap: 6px; }
      .kn-settings-title .kn-icon { color: rgba(167,139,250,0.9); }

      .kn-standup-summary { padding: 12px 16px; background: rgba(16,185,129,0.15); border-bottom: 1px solid rgba(255,255,255,0.06); font-size: 13px; color: #34D399; display: flex; align-items: center; gap: 6px; }
      .kn-activity-section { margin-bottom: 16px; }
      .kn-activity-header { display: flex; align-items: center; gap: 10px; padding: 8px 0; font-size: 13px; color: #fafafa; }
      .kn-activity-header input { accent-color: #A78BFA; }
      .kn-activity-items { padding-left: 24px; }
      .kn-activity-item { display: flex; align-items: flex-start; gap: 10px; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.06); }
      .kn-activity-item:last-child { border-bottom: none; }
      .kn-activity-item input { accent-color: #A78BFA; margin-top: 4px; }
      .kn-activity-item label { flex: 1; cursor: pointer; }
      .kn-activity-title { font-size: 13px; color: #fafafa; margin-bottom: 2px; }
      .kn-activity-meta { font-size: 11px; color: rgba(255,255,255,0.5); }
      .kn-blockers-section { margin-top: 16px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.06); }
      .kn-blockers-label { display: flex; align-items: center; gap: 8px; font-size: 13px; color: rgba(255,255,255,0.7); cursor: pointer; }
      .kn-blockers-label input { accent-color: #8B5CF6; }

      .kn-tasks-list { display: flex; flex-direction: column; gap: 8px; }
      .kn-task-item { display: flex; align-items: flex-start; gap: 12px; padding: 12px; border-radius: 10px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06); }
      .kn-task-checkbox { accent-color: #10B981; margin-top: 4px; }
      .kn-task-content { flex: 1; }
      .kn-task-title { font-size: 14px; color: #f4f4f5; margin-bottom: 4px; }
      .kn-task-meta { display: flex; align-items: center; gap: 10px; font-size: 11px; color: rgba(255,255,255,0.4); }
      .kn-task-priority { padding: 2px 6px; border-radius: 4px; font-weight: 500; text-transform: capitalize; }
      .kn-priority-high { background: rgba(239,68,68,0.15); color: #EF4444; }
      .kn-priority-medium { background: rgba(245,158,11,0.15); color: #F59E0B; }
      .kn-priority-low { background: rgba(16,185,129,0.15); color: #10B981; }
      .kn-no-tasks { text-align: center; padding: 32px; color: rgba(255,255,255,0.4); }

      @media (max-width: 640px) {
        #kn-overlay { padding-top: 5vh; }
        .kn-modal { max-width: 96vw; max-height: 80vh; border-radius: 14px; }
      }
    `;
  }

})();
