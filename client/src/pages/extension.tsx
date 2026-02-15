import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Chrome, Download, Settings, Zap, Globe, Command } from "lucide-react";
import { Button } from "@/components/ui/button";
import screenshot1 from "@assets/Screenshot_2026-02-10_at_05.25.19_1771136150175.png";
import screenshot2 from "@assets/Screenshot_2026-02-10_at_05.26.32_1771136150177.png";
import screenshot3 from "@assets/Screenshot_2026-02-10_at_05.26.47_1771136150177.png";

export default function ExtensionPage() {
  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-extension-title">
            Chrome Extension
          </h1>
          <p className="text-muted-foreground mt-1">
            Use Keynection's command palette on any website
          </p>
        </div>
        <Badge variant="secondary">
          <Chrome className="h-3 w-3 mr-1" /> Manifest V3
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Install the Extension
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-semibold">1</div>
              <div>
                <p className="font-medium">Download the extension</p>
                <p className="text-sm text-muted-foreground">
                  The extension files are in the <code className="bg-muted px-1.5 py-0.5 rounded text-xs">extension/</code> folder of this project.
                  Download or clone the project to get them.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-semibold">2</div>
              <div>
                <p className="font-medium">Load in Chrome</p>
                <p className="text-sm text-muted-foreground">
                  Open <code className="bg-muted px-1.5 py-0.5 rounded text-xs">chrome://extensions</code>, enable Developer mode,
                  click "Load unpacked" and select the <code className="bg-muted px-1.5 py-0.5 rounded text-xs">extension/</code> folder.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-semibold">3</div>
              <div>
                <p className="font-medium">Configure server URL</p>
                <p className="text-sm text-muted-foreground">
                  Click the Keynection icon in your browser toolbar and enter your server URL to connect to the AI backend.
                  Use your published app URL (e.g., <code className="bg-muted px-1.5 py-0.5 rounded text-xs">https://your-app.replit.app</code>).
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-semibold">4</div>
              <div>
                <p className="font-medium">Start using it</p>
                <p className="text-sm text-muted-foreground">
                  Press <kbd className="bg-muted border px-1.5 py-0.5 rounded text-xs font-mono">Option</kbd> + <kbd className="bg-muted border px-1.5 py-0.5 rounded text-xs font-mono">Space</kbd> or
                  <kbd className="bg-muted border px-1.5 py-0.5 rounded text-xs font-mono">Cmd</kbd> + <kbd className="bg-muted border px-1.5 py-0.5 rounded text-xs font-mono">K</kbd> on any page to open the command palette.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card data-testid="card-feature-anywhere">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
                <Globe className="h-5 w-5 text-primary" />
              </div>
              <div className="font-medium">Works Anywhere</div>
            </div>
            <p className="text-sm text-muted-foreground">
              The overlay appears on any webpage. Read articles, browse docs, check emails - trigger AI actions right from the page you're on.
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-feature-context">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
                <Zap className="h-5 w-5 text-primary" />
              </div>
              <div className="font-medium">Context-Aware</div>
            </div>
            <p className="text-sm text-muted-foreground">
              Keynection detects page content, selected text, and articles automatically. Smart actions adapt to what you're viewing.
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-feature-keyboard">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
                <Command className="h-5 w-5 text-primary" />
              </div>
              <div className="font-medium">Keyboard-First</div>
            </div>
            <p className="text-sm text-muted-foreground">
              Navigate with arrow keys, select with Enter, submit with Cmd+Enter, close with Escape. No mouse needed.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Preview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-md overflow-hidden border">
              <img src={screenshot1} alt="Command palette on Google AI Studio" className="w-full h-auto" />
              <div className="p-2 text-xs text-muted-foreground text-center">Command palette</div>
            </div>
            <div className="rounded-md overflow-hidden border">
              <img src={screenshot2} alt="Context-aware actions on Gemini API docs" className="w-full h-auto" />
              <div className="p-2 text-xs text-muted-foreground text-center">Context-aware smart actions</div>
            </div>
            <div className="rounded-md overflow-hidden border">
              <img src={screenshot3} alt="AI-generated email form" className="w-full h-auto" />
              <div className="p-2 text-xs text-muted-foreground text-center">AI-generated content</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Keyboard Shortcuts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2 border-b border-border/50">
              <span className="text-sm">Open command palette</span>
              <div className="flex gap-1">
                <kbd className="bg-muted border px-2 py-1 rounded text-xs font-mono">Option</kbd>
                <span className="text-muted-foreground text-xs">+</span>
                <kbd className="bg-muted border px-2 py-1 rounded text-xs font-mono">Space</kbd>
              </div>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-border/50">
              <span className="text-sm">Alternative shortcut</span>
              <div className="flex gap-1">
                <kbd className="bg-muted border px-2 py-1 rounded text-xs font-mono">Cmd</kbd>
                <span className="text-muted-foreground text-xs">+</span>
                <kbd className="bg-muted border px-2 py-1 rounded text-xs font-mono">K</kbd>
              </div>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-border/50">
              <span className="text-sm">Navigate actions</span>
              <div className="flex gap-1">
                <kbd className="bg-muted border px-2 py-1 rounded text-xs font-mono">\u2191</kbd>
                <kbd className="bg-muted border px-2 py-1 rounded text-xs font-mono">\u2193</kbd>
              </div>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-border/50">
              <span className="text-sm">Select action</span>
              <kbd className="bg-muted border px-2 py-1 rounded text-xs font-mono">Enter</kbd>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-border/50">
              <span className="text-sm">Submit form</span>
              <div className="flex gap-1">
                <kbd className="bg-muted border px-2 py-1 rounded text-xs font-mono">Cmd</kbd>
                <span className="text-muted-foreground text-xs">+</span>
                <kbd className="bg-muted border px-2 py-1 rounded text-xs font-mono">Enter</kbd>
              </div>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm">Close / Go back</span>
              <kbd className="bg-muted border px-2 py-1 rounded text-xs font-mono">Esc</kbd>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
