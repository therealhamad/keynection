import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Clock, CheckCircle2, XCircle, AlertCircle, Activity, Sparkles } from "lucide-react";
import type { ActionLog } from "@shared/schema";

const statusConfig: Record<string, { icon: typeof CheckCircle2; className: string }> = {
  completed: { icon: CheckCircle2, className: "text-green-500" },
  failed: { icon: XCircle, className: "text-red-500" },
  pending: { icon: AlertCircle, className: "text-amber-500" },
};

export default function HistoryPage() {
  const { data: logs, isLoading } = useQuery<ActionLog[]>({
    queryKey: ["/api/action-logs"],
  });

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-history-title">
          Action History
        </h1>
        <p className="text-sm text-muted-foreground">
          A log of all AI-powered actions you've executed.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-md" />
          ))}
        </div>
      ) : !logs || logs.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-16 text-center border-dashed">
          <Activity className="h-10 w-10 text-muted-foreground/40 mb-4" />
          <p className="text-base font-medium text-muted-foreground">No actions recorded yet</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">
            Run your first smart action using the command palette (
            <kbd className="rounded-sm border bg-muted px-1.5 py-0.5 text-[10px] font-mono">
              {navigator.platform?.includes("Mac") ? "Cmd" : "Ctrl"}+K
            </kbd>
            ) and it will appear here.
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {logs.map((log) => {
            const statusInfo = statusConfig[log.status] ?? statusConfig.completed;
            const StatusIcon = statusInfo.icon;
            return (
              <Card
                key={log.id}
                className="p-4"
                data-testid={`card-history-${log.id}`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex items-center justify-center w-9 h-9 rounded-md bg-muted shrink-0 mt-0.5">
                    <Sparkles className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium">{log.title}</p>
                      <Badge variant="secondary" className="text-[10px]">
                        {log.integration}
                      </Badge>
                      <Badge
                        variant={log.status === "completed" ? "secondary" : "destructive"}
                        className="text-[10px] gap-1"
                      >
                        <StatusIcon className={`h-2.5 w-2.5 ${statusInfo.className}`} />
                        {log.status}
                      </Badge>
                    </div>
                    {log.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {log.description}
                      </p>
                    )}
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span>
                        {new Date(log.createdAt).toLocaleDateString("en-US", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </span>
                      <span className="text-muted-foreground/50">&middot;</span>
                      <span className="capitalize">{log.actionType.replace(/-/g, " ")}</span>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
