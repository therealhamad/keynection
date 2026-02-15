// Keynection Background Service Worker
// Handles OAuth flows, API calls, and message passing

// ============================================================
// COMMAND LISTENER
// ============================================================
chrome.commands.onCommand.addListener(async (command) => {
  if (command === "toggle-overlay") {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, { action: "toggleOverlay" });
    }
  }
});

// ============================================================
// MESSAGE LISTENER
// ============================================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handlers = {
    // Gmail
    "sendGmail": () => handleSendGmail(message.to, message.subject, message.body),
    "gmailAuth": () => initiateGmailOAuth(),
    "checkGmailAuth": () => checkGmailAuth(),
    
    // Slack
    "sendSlack": () => handleSendSlack(message.channel, message.message),
    
    // Notion
    "createNotionPage": () => handleCreateNotionPage(message.title, message.content, message.parentId, message.parentType),
    "fetchNotionParents": () => fetchNotionParents(),
    
    // GitHub
    "fetchGitHubActivity": () => fetchGitHubActivity(),
    
    // Notion Activity
    "fetchNotionActivity": () => fetchNotionActivity(),
    
    // Calendar
    "fetchCalendarActivity": () => fetchCalendarActivity(),
    "calendarConnect": () => initiateCalendarOAuth(),
    
    // Server (legacy)
    "executeAction": () => handleExecuteAction(message.data),
    "getServerUrl": () => getServerUrl().then(url => ({ serverUrl: url })),
    "setServerUrl": () => {
      return new Promise(resolve => {
        chrome.storage.local.set({ serverUrl: message.url }, () => resolve({ success: true }));
      });
    },
  };

  const handler = handlers[message.action];
  if (handler) {
    handler()
      .then(sendResponse)
      .catch(err => sendResponse({ error: err.message, success: false }));
    return true; // Keep channel open for async response
  }
});

// ============================================================
// GMAIL OAUTH & API
// ============================================================
const GMAIL_SCOPES = 'https://www.googleapis.com/auth/gmail.send';

async function initiateGmailOAuth() {
  const clientId = await getOAuthClientId();
  if (!clientId) {
    throw new Error('Gmail OAuth not configured. Add your OAuth Client ID in settings.');
  }

  const redirectUri = chrome.identity.getRedirectURL();
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'token');
  authUrl.searchParams.set('scope', GMAIL_SCOPES);
  authUrl.searchParams.set('prompt', 'consent');

  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(
      { url: authUrl.toString(), interactive: true },
      (responseUrl) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!responseUrl) {
          reject(new Error('No response from OAuth'));
          return;
        }

        // Extract access token from URL hash
        const hashParams = new URLSearchParams(new URL(responseUrl).hash.substring(1));
        const accessToken = hashParams.get('access_token');
        
        if (!accessToken) {
          reject(new Error('Failed to get access token'));
          return;
        }

        // Store the token
        chrome.storage.local.set({ gmail_access_token: accessToken }, () => {
          resolve({ success: true, token: accessToken });
        });
      }
    );
  });
}

async function checkGmailAuth() {
  const token = await getStoredToken('gmail_access_token');
  if (!token) {
    return { authenticated: false };
  }

  // Verify token is still valid
  try {
    const response = await fetch(`https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${token}`);
    if (response.ok) {
      return { authenticated: true };
    }
    // Token expired, clear it
    await chrome.storage.local.remove('gmail_access_token');
    return { authenticated: false };
  } catch (e) {
    return { authenticated: false };
  }
}

async function handleSendGmail(to, subject, body) {
  let token = await getStoredToken('gmail_access_token');
  
  if (!token) {
    // Need to authenticate first
    const authResult = await initiateGmailOAuth();
    token = authResult.token;
  }

  // Build RFC 2822 email
  const email = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    '',
    body
  ].join('\r\n');

  // Base64 URL encode
  const encodedEmail = btoa(unescape(encodeURIComponent(email)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const response = await fetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ raw: encodedEmail })
  });

  if (!response.ok) {
    if (response.status === 401) {
      // Token expired, clear and retry
      await chrome.storage.local.remove('gmail_access_token');
      throw new Error('Gmail authentication expired. Please try again.');
    }
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `Gmail API error: ${response.status}`);
  }

  return { success: true, message: 'Email sent successfully!' };
}

// ============================================================
// SLACK WEBHOOK
// ============================================================
async function handleSendSlack(channel, message) {
  const webhookUrl = await getStoredToken('slack_webhook_url');
  
  if (!webhookUrl) {
    throw new Error('Slack webhook URL not configured. Add it in Settings.');
  }

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: message })
  });

  if (!response.ok) {
    throw new Error(`Slack error: ${response.status}`);
  }

  return { success: true, message: 'Message posted to Slack!' };
}

// ============================================================
// NOTION API
// ============================================================

// Fetch available Notion pages/databases to use as parents
async function fetchNotionParents() {
  const token = await getStoredToken('notion_token');
  if (!token) {
    return { parents: [], error: 'Notion token not configured' };
  }

  try {
    const response = await fetch('https://api.notion.com/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28'
      },
      body: JSON.stringify({
        filter: { property: 'object', value: 'page' },
        sort: { direction: 'descending', timestamp: 'last_edited_time' },
        page_size: 20
      })
    });

    if (!response.ok) {
      throw new Error(`Notion API error: ${response.status}`);
    }

    const data = await response.json();
    const parents = [];

    for (const page of data.results) {
      // Extract title
      const titleProp = page.properties?.Name || page.properties?.Title || page.properties?.title;
      let title = 'Untitled';
      if (titleProp?.title?.[0]?.plain_text) {
        title = titleProp.title[0].plain_text;
      }
      
      parents.push({
        id: page.id,
        title: title,
        type: 'page',
        url: page.url
      });
    }

    // Also fetch databases
    const dbResponse = await fetch('https://api.notion.com/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28'
      },
      body: JSON.stringify({
        filter: { property: 'object', value: 'database' },
        page_size: 10
      })
    });

    if (dbResponse.ok) {
      const dbData = await dbResponse.json();
      for (const db of dbData.results) {
        const title = db.title?.[0]?.plain_text || 'Untitled Database';
        parents.push({
          id: db.id,
          title: `📊 ${title}`,
          type: 'database',
          url: db.url
        });
      }
    }

    return { parents };
  } catch (error) {
    return { parents: [], error: error.message };
  }
}

// Create a page in Notion
async function handleCreateNotionPage(title, content, parentId, parentType) {
  const token = await getStoredToken('notion_token');
  
  if (!token) {
    throw new Error('Notion token not configured. Add it in Settings.');
  }

  if (!parentId) {
    throw new Error('No parent page selected. Choose where to save.');
  }

  // Split content into paragraphs for better formatting
  const paragraphs = content.split('\n\n').filter(p => p.trim());
  
  // Build children blocks
  const children = paragraphs.slice(0, 50).map(paragraph => {
    // Check if it's a heading (starts with #)
    if (paragraph.startsWith('# ')) {
      return {
        object: 'block',
        type: 'heading_1',
        heading_1: {
          rich_text: [{ type: 'text', text: { content: paragraph.substring(2).trim() } }]
        }
      };
    } else if (paragraph.startsWith('## ')) {
      return {
        object: 'block',
        type: 'heading_2',
        heading_2: {
          rich_text: [{ type: 'text', text: { content: paragraph.substring(3).trim() } }]
        }
      };
    } else if (paragraph.startsWith('- ') || paragraph.startsWith('• ')) {
      // Bulleted list
      return {
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: {
          rich_text: [{ type: 'text', text: { content: paragraph.substring(2).trim() } }]
        }
      };
    } else {
      return {
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [{ type: 'text', text: { content: paragraph.substring(0, 2000) } }]
        }
      };
    }
  });

  // If no children, add at least one paragraph
  if (children.length === 0) {
    children.push({
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [{ type: 'text', text: { content: content.substring(0, 2000) || 'Empty page' } }]
      }
    });
  }

  let pageData;
  
  if (parentType === 'database') {
    // Create page in database - use 'Name' or 'Title' property
    pageData = {
      parent: { database_id: parentId },
      properties: {
        Name: { title: [{ text: { content: title } }] }
      },
      children: children
    };
  } else {
    // Create page under another page
    pageData = {
      parent: { page_id: parentId },
      properties: {
        title: { title: [{ text: { content: title } }] }
      },
      children: children
    };
  }

  const response = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28'
    },
    body: JSON.stringify(pageData)
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `Notion API error: ${response.status}`);
  }

  const result = await response.json();
  return { 
    success: true, 
    message: 'Page created in Notion!',
    url: result.url,
    pageId: result.id
  };
}

async function fetchNotionActivity() {
  const token = await getStoredToken('notion_token');
  if (!token) {
    return { tasks: [], error: 'Notion token not configured' };
  }

  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    const response = await fetch('https://api.notion.com/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28'
      },
      body: JSON.stringify({
        filter: { property: 'object', value: 'page' },
        sort: { direction: 'descending', timestamp: 'last_edited_time' },
        page_size: 50
      })
    });

    if (!response.ok) {
      throw new Error(`Notion API error: ${response.status}`);
    }

    const data = await response.json();
    const tasks = [];

    for (const page of data.results) {
      if (new Date(page.last_edited_time) < new Date(cutoff)) continue;

      // Extract title
      const titleProp = page.properties?.Name || page.properties?.Title || page.properties?.title;
      let title = 'Untitled';
      if (titleProp?.title?.[0]?.plain_text) {
        title = titleProp.title[0].plain_text;
      }

      // Extract status
      const statusProp = page.properties?.Status;
      let status = '';
      if (statusProp?.select?.name) {
        status = statusProp.select.name;
      } else if (statusProp?.status?.name) {
        status = statusProp.status.name;
      }

      tasks.push({
        title,
        status,
        lastEdited: page.last_edited_time,
        url: page.url
      });
    }

    return { tasks: tasks.slice(0, 15) };
  } catch (error) {
    return { tasks: [], error: error.message };
  }
}

// ============================================================
// GITHUB API
// ============================================================
async function fetchGitHubActivity() {
  const token = await getStoredToken('github_token');
  const username = await getStoredToken('github_username');

  if (!token || !username) {
    return { commits: [], error: 'GitHub credentials not configured' };
  }

  const headers = {
    'Authorization': `token ${token}`,
    'Accept': 'application/vnd.github.v3+json'
  };

  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const since = cutoff.toISOString();
    
    // Strategy 1: Try events API first (works for public activity)
    let recentRepos = new Set();
    
    try {
      const eventsRes = await fetch(
        `https://api.github.com/users/${encodeURIComponent(username)}/events?per_page=100`,
        { headers }
      );

      if (eventsRes.ok) {
        const events = await eventsRes.json();
        events.forEach(e => {
          if (e.type === 'PushEvent') {
            const eventDate = new Date(e.created_at);
            if (eventDate > cutoff && e.repo?.name) {
              recentRepos.add(e.repo.name);
            }
          }
        });
      }
    } catch (e) {
      // Events API failed, continue with fallback
    }

    // Strategy 2: If no repos found via events, fetch user's repos directly
    if (recentRepos.size === 0) {
      try {
        const reposRes = await fetch(
          `https://api.github.com/user/repos?sort=pushed&per_page=10&affiliation=owner,collaborator`,
          { headers }
        );
        
        if (reposRes.ok) {
          const repos = await reposRes.json();
          // Filter to repos pushed in last 24h
          repos.forEach(r => {
            if (new Date(r.pushed_at) > cutoff) {
              recentRepos.add(r.full_name);
            }
          });
        }
      } catch (e) {
        // Fallback failed too
      }
    }

    if (recentRepos.size === 0) {
      return { commits: [], error: null }; // No recent activity, not an error
    }

    // Fetch commits from each repo
    const allCommits = [];
    
    for (const repoFullName of recentRepos) {
      try {
        const commitsRes = await fetch(
          `https://api.github.com/repos/${repoFullName}/commits?author=${encodeURIComponent(username)}&since=${since}&per_page=20`,
          { headers }
        );
        
        if (commitsRes.ok) {
          const repoCommits = await commitsRes.json();
          repoCommits.forEach(c => {
            if (c.commit?.message) {
              allCommits.push({
                message: c.commit.message.split('\n')[0],
                repo: repoFullName.split('/')[1] || repoFullName,
                time: c.commit.author?.date || c.commit.committer?.date,
                url: c.html_url
              });
            }
          });
        }
      } catch (e) {
        // Ignore per-repo errors
      }
    }

    // Deduplicate by message
    const seen = new Set();
    const uniqueCommits = allCommits.filter(c => {
      if (seen.has(c.message)) return false;
      seen.add(c.message);
      return true;
    });

    // Sort by time descending
    uniqueCommits.sort((a, b) => new Date(b.time) - new Date(a.time));

    return { commits: uniqueCommits.slice(0, 15) };
  } catch (error) {
    return { commits: [], error: error.message };
  }
}

// ============================================================
// GOOGLE CALENDAR API
// ============================================================
const CALENDAR_SCOPES = 'https://www.googleapis.com/auth/calendar.readonly';

async function initiateCalendarOAuth() {
  const clientId = await getOAuthClientId();
  if (!clientId) {
    throw new Error('OAuth Client ID not configured. Add it in Settings.');
  }

  const redirectUri = chrome.identity.getRedirectURL();
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'token');
  authUrl.searchParams.set('scope', CALENDAR_SCOPES);
  authUrl.searchParams.set('prompt', 'consent');

  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(
      { url: authUrl.toString(), interactive: true },
      (responseUrl) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!responseUrl) {
          reject(new Error('No response from OAuth'));
          return;
        }

        const hashParams = new URLSearchParams(new URL(responseUrl).hash.substring(1));
        const accessToken = hashParams.get('access_token');
        
        if (!accessToken) {
          reject(new Error('Failed to get access token'));
          return;
        }

        chrome.storage.local.set({ 
          calendar_token: accessToken,
          calendar_connected: true 
        }, () => {
          resolve({ success: true });
        });
      }
    );
  });
}

async function fetchCalendarActivity() {
  const token = await getStoredToken('calendar_token');
  const connected = await getStoredToken('calendar_connected');

  if (!token || !connected) {
    return { meetings: [], error: 'Calendar not connected' };
  }

  try {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    const timeMin = yesterday.toISOString();
    const timeMax = now.toISOString();

    const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
    url.searchParams.set('timeMin', timeMin);
    url.searchParams.set('timeMax', timeMax);
    url.searchParams.set('singleEvents', 'true');
    url.searchParams.set('orderBy', 'startTime');

    const response = await fetch(url.toString(), {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) {
      if (response.status === 401) {
        // Token expired, clear it
        await chrome.storage.local.remove(['calendar_token', 'calendar_connected']);
        return { meetings: [], error: 'Calendar token expired. Please reconnect.' };
      }
      throw new Error(`Calendar API error: ${response.status}`);
    }

    const data = await response.json();
    const meetings = [];

    for (const event of (data.items || [])) {
      // Skip cancelled events
      if (event.status === 'cancelled') continue;
      
      // Skip events without start/end
      if (!event.start || !event.end) continue;

      // Skip declined events
      const selfAttendee = event.attendees?.find(a => a.self);
      if (selfAttendee?.responseStatus === 'declined') continue;

      // Calculate duration
      const startTime = new Date(event.start.dateTime || event.start.date);
      const endTime = new Date(event.end.dateTime || event.end.date);
      const durationMinutes = Math.round((endTime - startTime) / (1000 * 60));

      meetings.push({
        summary: event.summary || 'Untitled Event',
        start: event.start.dateTime || event.start.date,
        duration: durationMinutes,
        attendees: event.attendees?.length || 1,
        url: event.htmlLink
      });
    }

    return { meetings: meetings.slice(0, 15) };
  } catch (error) {
    return { meetings: [], error: error.message };
  }
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================
async function getStoredToken(key) {
  return new Promise((resolve) => {
    chrome.storage.local.get([key], (result) => {
      resolve(result[key] || null);
    });
  });
}

async function getOAuthClientId() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['oauth_client_id'], (result) => {
      resolve(result.oauth_client_id || null);
    });
  });
}

async function getServerUrl() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["serverUrl"], (result) => {
      resolve(result.serverUrl || "");
    });
  });
}

async function handleExecuteAction(data) {
  const serverUrl = await getServerUrl();
  if (!serverUrl) {
    throw new Error("Server URL not configured. Open Keynection settings to set it up.");
  }
  const response = await fetch(`${serverUrl}/api/actions/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || `Server error: ${response.status}`);
  }
  return response.json();
}
