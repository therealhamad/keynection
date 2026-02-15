// Keynection Background Service Worker
// Handles OAuth flows, API calls, and message passing
// All integrations work directly from extension - no server required for integrations

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
    // Google (unified OAuth)
    "googleAuth": () => initiateGoogleOAuth(),
    "checkGoogleAuth": () => checkGoogleAuth(),
    
    // Gmail
    "sendGmail": () => handleSendGmail(message.to, message.subject, message.body),
    
    // Google Calendar
    "fetchCalendarActivity": () => fetchCalendarActivity(),
    "createCalendarEvent": () => handleCreateCalendarEvent(message),
    
    // Google Docs
    "createGoogleDoc": () => handleCreateGoogleDoc(message.title, message.content),
    
    // Google Sheets
    "appendSheetRow": () => handleAppendSheetRow(message.spreadsheetId, message.sheetName, message.values),
    "fetchSpreadsheets": () => handleFetchSpreadsheets(),
    
    // Slack
    "sendSlack": () => handleSendSlack(message.channel, message.message),
    
    // Discord
    "sendDiscord": () => handleSendDiscord(message.message),
    
    // Notion
    "createNotionPage": () => handleCreateNotionPage(message.title, message.content, message.parentId, message.parentType),
    "fetchNotionParents": () => fetchNotionParents(),
    "fetchNotionActivity": () => fetchNotionActivity(),
    
    // GitHub
    "fetchGitHubActivity": () => fetchGitHubActivity(),
    
    // Linear
    "createLinearIssue": () => handleCreateLinearIssue(message),
    "fetchLinearTeams": () => handleFetchLinearTeams(),
    
    // Server (for AI only)
    "executeAction": () => handleExecuteAction(message.data),
    "getServerUrl": () => getServerUrl().then(url => ({ serverUrl: url })),
    "setServerUrl": () => {
      return new Promise(resolve => {
        chrome.storage.local.set({ serverUrl: message.url }, () => resolve({ success: true }));
      });
    },
    
    // Check integration status
    "checkIntegrationStatus": () => checkAllIntegrationStatus(),
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
// GOOGLE OAUTH (Unified - Gmail, Calendar, Docs, Sheets, Drive)
// ============================================================
const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.readonly',
].join(' ');

async function initiateGoogleOAuth() {
  const clientId = await getOAuthClientId();
  if (!clientId) {
    throw new Error('Google OAuth not configured. Add your OAuth Client ID in settings.');
  }

  const redirectUri = chrome.identity.getRedirectURL();
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'token');
  authUrl.searchParams.set('scope', GOOGLE_SCOPES);
  authUrl.searchParams.set('prompt', 'consent');
  authUrl.searchParams.set('access_type', 'online');

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

        // Store the token
        chrome.storage.local.set({ 
          google_access_token: accessToken,
          google_connected: true 
        }, () => {
          resolve({ success: true, token: accessToken });
        });
      }
    );
  });
}

async function checkGoogleAuth() {
  const token = await getStoredToken('google_access_token');
  if (!token) {
    return { authenticated: false };
  }

  try {
    const response = await fetch(`https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${token}`);
    if (response.ok) {
      return { authenticated: true };
    }
    await chrome.storage.local.remove(['google_access_token', 'google_connected']);
    return { authenticated: false };
  } catch (e) {
    return { authenticated: false };
  }
}

async function getGoogleToken() {
  const token = await getStoredToken('google_access_token');
  if (!token) {
    throw new Error('Google not connected. Click "Connect Google" in settings.');
  }
  
  // Verify token is still valid
  const response = await fetch(`https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${token}`);
  if (!response.ok) {
    await chrome.storage.local.remove(['google_access_token', 'google_connected']);
    throw new Error('Google session expired. Please reconnect in settings.');
  }
  
  return token;
}

// ============================================================
// GMAIL API
// ============================================================
async function handleSendGmail(to, subject, body) {
  const token = await getGoogleToken();

  // Build RFC 2822 email
  const email = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    '',
    body
  ].join('\r\n');

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
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `Gmail API error: ${response.status}`);
  }

  return { success: true, message: 'Email sent successfully!' };
}

// ============================================================
// GOOGLE CALENDAR API
// ============================================================
async function fetchCalendarActivity() {
  let token;
  try {
    token = await getGoogleToken();
  } catch (e) {
    return { meetings: [], error: 'Google not connected' };
  }

  try {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
    url.searchParams.set('timeMin', yesterday.toISOString());
    url.searchParams.set('timeMax', now.toISOString());
    url.searchParams.set('singleEvents', 'true');
    url.searchParams.set('orderBy', 'startTime');

    const response = await fetch(url.toString(), {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) {
      throw new Error(`Calendar API error: ${response.status}`);
    }

    const data = await response.json();
    const meetings = [];

    for (const event of (data.items || [])) {
      if (event.status === 'cancelled') continue;
      if (!event.start || !event.end) continue;

      const selfAttendee = event.attendees?.find(a => a.self);
      if (selfAttendee?.responseStatus === 'declined') continue;

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

async function handleCreateCalendarEvent(message) {
  const token = await getGoogleToken();

  const { title, description, startTime, endTime, attendees, location } = message;

  const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      summary: title,
      description,
      location,
      start: { dateTime: startTime, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
      end: { dateTime: endTime, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
      attendees: attendees?.map(email => ({ email })),
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `Calendar API error: ${response.status}`);
  }

  const result = await response.json();
  return { success: true, eventId: result.id, link: result.htmlLink };
}

// ============================================================
// GOOGLE DOCS API
// ============================================================
async function handleCreateGoogleDoc(title, content) {
  const token = await getGoogleToken();

  // Create document
  const createResponse = await fetch('https://docs.googleapis.com/v1/documents', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ title })
  });

  if (!createResponse.ok) {
    const error = await createResponse.json().catch(() => ({}));
    throw new Error(error.error?.message || `Docs API error: ${createResponse.status}`);
  }

  const doc = await createResponse.json();
  const documentId = doc.documentId;

  // Insert content
  const updateResponse = await fetch(`https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      requests: [{
        insertText: {
          location: { index: 1 },
          text: content
        }
      }]
    })
  });

  if (!updateResponse.ok) {
    console.warn('Failed to insert content, but doc was created');
  }

  const url = `https://docs.google.com/document/d/${documentId}/edit`;
  return { success: true, documentId, url };
}

// ============================================================
// GOOGLE SHEETS API
// ============================================================
async function handleFetchSpreadsheets() {
  let token;
  try {
    token = await getGoogleToken();
  } catch (e) {
    return { spreadsheets: [] };
  }

  try {
    const url = new URL('https://www.googleapis.com/drive/v3/files');
    url.searchParams.set('q', "mimeType='application/vnd.google-apps.spreadsheet'");
    url.searchParams.set('pageSize', '20');
    url.searchParams.set('fields', 'files(id,name)');

    const response = await fetch(url.toString(), {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) {
      return { spreadsheets: [] };
    }

    const data = await response.json();
    return { 
      spreadsheets: (data.files || []).map(f => ({ id: f.id, name: f.name }))
    };
  } catch (e) {
    return { spreadsheets: [] };
  }
}

async function handleAppendSheetRow(spreadsheetId, sheetName, values) {
  const token = await getGoogleToken();

  const range = `${sheetName || 'Sheet1'}!A:Z`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ values: [values] })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `Sheets API error: ${response.status}`);
  }

  const result = await response.json();
  return { success: true, updatedRange: result.updates?.updatedRange };
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
// DISCORD WEBHOOK
// ============================================================
async function handleSendDiscord(messageContent) {
  const webhookUrl = await getStoredToken('discord_webhook_url');
  
  if (!webhookUrl) {
    throw new Error('Discord webhook not configured. Add your webhook URL in settings.');
  }
  
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: messageContent,
      username: 'Keynection'
    })
  });
  
  if (!response.ok) {
    throw new Error(`Discord webhook failed: ${response.status}`);
  }
  
  return { success: true, message: 'Message sent to Discord!' };
}

// ============================================================
// NOTION API
// ============================================================
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

async function handleCreateNotionPage(title, content, parentId, parentType) {
  const token = await getStoredToken('notion_token');
  
  if (!token) {
    throw new Error('Notion token not configured. Add it in Settings.');
  }

  if (!parentId) {
    throw new Error('No parent page selected. Choose where to save.');
  }

  const paragraphs = content.split('\n\n').filter(p => p.trim());
  
  const children = paragraphs.slice(0, 50).map(paragraph => {
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
    pageData = {
      parent: { database_id: parentId },
      properties: {
        Name: { title: [{ text: { content: title } }] }
      },
      children: children
    };
  } else {
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

      const titleProp = page.properties?.Name || page.properties?.Title || page.properties?.title;
      let title = 'Untitled';
      if (titleProp?.title?.[0]?.plain_text) {
        title = titleProp.title[0].plain_text;
      }

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
      // Events API failed
    }

    if (recentRepos.size === 0) {
      try {
        const reposRes = await fetch(
          `https://api.github.com/user/repos?sort=pushed&per_page=10&affiliation=owner,collaborator`,
          { headers }
        );
        
        if (reposRes.ok) {
          const repos = await reposRes.json();
          repos.forEach(r => {
            if (new Date(r.pushed_at) > cutoff) {
              recentRepos.add(r.full_name);
            }
          });
        }
      } catch (e) {
        // Fallback failed
      }
    }

    if (recentRepos.size === 0) {
      return { commits: [], error: null };
    }

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

    const seen = new Set();
    const uniqueCommits = allCommits.filter(c => {
      if (seen.has(c.message)) return false;
      seen.add(c.message);
      return true;
    });

    uniqueCommits.sort((a, b) => new Date(b.time) - new Date(a.time));

    return { commits: uniqueCommits.slice(0, 15) };
  } catch (error) {
    return { commits: [], error: error.message };
  }
}

// ============================================================
// LINEAR API (GraphQL)
// ============================================================
async function handleFetchLinearTeams() {
  const apiKey = await getStoredToken('linear_api_key');
  if (!apiKey) {
    return { teams: [] };
  }

  try {
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

    if (!response.ok) {
      return { teams: [] };
    }

    const data = await response.json();
    return { teams: data?.data?.teams?.nodes || [] };
  } catch (e) {
    return { teams: [] };
  }
}

async function handleCreateLinearIssue(message) {
  const apiKey = await getStoredToken('linear_api_key');
  if (!apiKey) {
    throw new Error('Linear API key not configured. Add it in Settings.');
  }

  const { title, description, teamId, priority } = message;

  // If no teamId, fetch first available team
  let targetTeamId = teamId;
  if (!targetTeamId) {
    const teamsResult = await handleFetchLinearTeams();
    if (teamsResult.teams.length > 0) {
      targetTeamId = teamsResult.teams[0].id;
    } else {
      throw new Error('No Linear teams found');
    }
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
          priority: priority || undefined
        }
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Linear API error: ${response.status}`);
  }

  const data = await response.json();
  
  if (data.errors) {
    throw new Error(data.errors[0]?.message || 'Linear API error');
  }

  if (!data?.data?.issueCreate?.success) {
    throw new Error('Failed to create Linear issue');
  }

  const issue = data.data.issueCreate.issue;
  return { 
    success: true, 
    message: `Issue ${issue.identifier} created!`,
    identifier: issue.identifier,
    url: issue.url 
  };
}

// ============================================================
// CHECK ALL INTEGRATION STATUS
// ============================================================
async function checkAllIntegrationStatus() {
  const status = {
    google: false,
    slack: false,
    discord: false,
    notion: false,
    github: false,
    linear: false,
    server: false
  };

  // Google
  const googleToken = await getStoredToken('google_access_token');
  if (googleToken) {
    try {
      const response = await fetch(`https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${googleToken}`);
      status.google = response.ok;
    } catch (e) {
      status.google = false;
    }
  }

  // Slack
  status.slack = !!(await getStoredToken('slack_webhook_url'));

  // Discord
  status.discord = !!(await getStoredToken('discord_webhook_url'));

  // Notion
  status.notion = !!(await getStoredToken('notion_token'));

  // GitHub
  const githubToken = await getStoredToken('github_token');
  const githubUsername = await getStoredToken('github_username');
  status.github = !!(githubToken && githubUsername);

  // Linear
  status.linear = !!(await getStoredToken('linear_api_key'));

  // Server (for AI)
  const serverUrl = await getServerUrl();
  status.server = !!serverUrl;

  return { status };
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
    throw new Error("Server URL not configured. This is needed for AI-powered content generation.");
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
