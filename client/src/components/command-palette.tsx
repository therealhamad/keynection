import { useState, useEffect, useCallback, useRef } from "react";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandSeparator } from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { smartActions, type SmartAction } from "@/lib/actions";
import { Sparkles, Keyboard } from "lucide-react";
import { ActionForm } from "./action-form";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const [search, setSearch] = useState("");
  const [selectedAction, setSelectedAction] = useState<SmartAction | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setSearch("");
      setSelectedAction(null);
    }
  }, [open]);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === overlayRef.current) {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (selectedAction) {
          setSelectedAction(null);
        } else {
          onClose();
        }
      }
    };
    if (open) {
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose, selectedAction]);

  if (!open) return null;

  const phase1 = smartActions.filter((a) => a.phase === 1);
  const phase2 = smartActions.filter((a) => a.phase === 2);

  if (selectedAction) {
    return (
      <div
        ref={overlayRef}
        onClick={handleOverlayClick}
        className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/60 dark:bg-black/70 backdrop-blur-sm animate-in fade-in duration-150"
        data-testid="command-palette-overlay"
      >
        <div className="w-full max-w-[640px] mx-4 animate-in slide-in-from-top-4 duration-200">
          <ActionForm action={selectedAction} onBack={() => setSelectedAction(null)} onClose={onClose} />
        </div>
      </div>
    );
  }

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/60 dark:bg-black/70 backdrop-blur-sm animate-in fade-in duration-150"
      data-testid="command-palette-overlay"
    >
      <div className="w-full max-w-[640px] mx-4 animate-in slide-in-from-top-4 duration-200">
        <Command className="rounded-md border border-border bg-popover shadow-lg overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <Sparkles className="h-4 w-4 text-primary shrink-0" />
            <CommandInput
              placeholder="What do you want to do?"
              value={search}
              onValueChange={setSearch}
              className="border-0 focus:ring-0 p-0 text-base h-auto"
              data-testid="input-command-search"
              autoFocus
            />
            <kbd className="hidden sm:inline-flex items-center gap-1 rounded-md border bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground shrink-0">
              ESC
            </kbd>
          </div>
          <CommandList className="max-h-[400px] overflow-y-auto">
            <CommandEmpty className="py-8 text-center text-sm text-muted-foreground">
              No actions found. Try a different search.
            </CommandEmpty>
            <CommandGroup heading="Core Actions">
              {phase1.map((action) => (
                <ActionCommandItem
                  key={action.id}
                  action={action}
                  onSelect={() => setSelectedAction(action)}
                />
              ))}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Power Actions">
              {phase2.map((action) => (
                <ActionCommandItem
                  key={action.id}
                  action={action}
                  onSelect={() => setSelectedAction(action)}
                />
              ))}
            </CommandGroup>
          </CommandList>
          <div className="flex items-center justify-between gap-4 border-t border-border px-4 py-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Keyboard className="h-3 w-3" />
              <span>Navigate with arrow keys</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <kbd className="rounded-sm border bg-muted px-1 py-0.5 text-[10px] font-mono">Enter</kbd>
              <span>to select</span>
            </div>
          </div>
        </Command>
      </div>
    </div>
  );
}

function ActionCommandItem({ action, onSelect }: { action: SmartAction; onSelect: () => void }) {
  const Icon = action.icon;
  return (
    <CommandItem
      onSelect={onSelect}
      className="flex items-center gap-3 px-3 py-2.5 cursor-pointer"
      data-testid={`action-item-${action.id}`}
    >
      <div
        className="flex items-center justify-center w-8 h-8 rounded-md shrink-0"
        style={{ backgroundColor: `${action.integrationColor}15` }}
      >
        <Icon className="h-4 w-4" style={{ color: action.integrationColor }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{action.name}</div>
        <div className="text-xs text-muted-foreground truncate">{action.description}</div>
      </div>
      <Badge variant="secondary" className="text-[10px] shrink-0">
        {action.integration}
      </Badge>
    </CommandItem>
  );
}
