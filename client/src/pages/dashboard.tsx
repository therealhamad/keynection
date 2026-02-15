import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sparkles,
  Zap,
  ArrowRight,
  Activity,
  Puzzle,
  Clock,
  TrendingUp,
  Command,
} from "lucide-react";
import { smartActions } from "@/lib/actions";
import { Link } from "wouter";
import type { ActionLog, Integration } from "@shared/schema";

export default function Dashboard() {
  const { data: logs, isLoading: logsLoading } = useQuery<ActionLog[]>({
    queryKey: ["/api/action-logs"],
  });

  const { data: integrations, isLoading: intLoading } = useQuery<Integration[]>({
    queryKey: ["/api/integrations"],
  });

  const connectedCount = integrations?.filter((i) => i.connected).length ?? 0;
  const totalActions = logs?.length ?? 0;
  const recentLogs = logs?.slice(0, 5) ?? [];

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-dashboard-title">
          Welcome to Keynection
        </h1>
        <p className="text-sm text-muted-foreground">
          Your AI-powered command palette for productivity across 11 platforms.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<Zap className="h-4 w-4" />}
          label="Smart Actions"
          value={String(smartActions.length)}
          subtitle="Available actions"
          loading={false}
          color="text-amber-500"
          bgColor="bg-amber-500/10"
        />
        <StatCard
          icon={<Puzzle className="h-4 w-4" />}
          label="Integrations"
          value={intLoading ? "..." : `${connectedCount}`}
          subtitle={`of ${integrations?.length ?? 0} connected`}
          loading={intLoading}
          color="text-blue-500"
          bgColor="bg-blue-500/10"
        />
        <StatCard
          icon={<Activity className="h-4 w-4" />}
          label="Actions Run"
          value={logsLoading ? "..." : String(totalActions)}
          subtitle="Total executions"
          loading={logsLoading}
          color="text-green-500"
          bgColor="bg-green-500/10"
        />
        <StatCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Time Saved"
          value={logsLoading ? "..." : `${totalActions * 3}m`}
          subtitle="Estimated savings"
          loading={logsLoading}
          color="text-purple-500"
          bgColor="bg-purple-500/10"
        />
      </div>

      <Card className="p-5 border-dashed">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex items-center justify-center w-10 h-10 rounded-md bg-primary/10 shrink-0">
            <Command className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 space-y-1">
            <p className="text-sm font-medium">Quick Tip: Use the Command Palette</p>
            <p className="text-xs text-muted-foreground">
              Press{" "}
              <kbd className="rounded-sm border bg-muted px-1.5 py-0.5 text-[10px] font-mono">
                {navigator.platform?.includes("Mac") ? "Cmd" : "Ctrl"}+K
              </kbd>{" "}
              anywhere to instantly access all smart actions powered by Claude AI.
            </p>
          </div>
          <Badge variant="secondary">Pro Tip</Badge>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold">Quick Actions</h2>
            <Link href="/actions">
              <Button variant="ghost" size="sm" data-testid="link-view-all-actions">
                View All <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-2">
            {smartActions.slice(0, 4).map((action) => {
              const Icon = action.icon;
              return (
                <Card
                  key={action.id}
                  className="flex items-center gap-3 p-3 hover-elevate cursor-pointer"
                  data-testid={`card-action-${action.id}`}
                >
                  <div
                    className="flex items-center justify-center w-9 h-9 rounded-md shrink-0"
                    style={{ backgroundColor: `${action.integrationColor}12` }}
                  >
                    <Icon className="h-4 w-4" style={{ color: action.integrationColor }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{action.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{action.description}</p>
                  </div>
                  <Sparkles className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                </Card>
              );
            })}
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold">Recent Activity</h2>
            <Link href="/history">
              <Button variant="ghost" size="sm" data-testid="link-view-all-history">
                View All <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </Link>
          </div>
          {logsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full rounded-md" />
              ))}
            </div>
          ) : recentLogs.length > 0 ? (
            <div className="space-y-2">
              {recentLogs.map((log) => (
                <Card key={log.id} className="flex items-center gap-3 p-3" data-testid={`card-log-${log.id}`}>
                  <div className="flex items-center justify-center w-9 h-9 rounded-md bg-muted shrink-0">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{log.title}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {log.integration} &middot;{" "}
                      {new Date(log.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <Badge
                    variant={log.status === "completed" ? "secondary" : "destructive"}
                    className="text-[10px] shrink-0"
                  >
                    {log.status}
                  </Badge>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="flex flex-col items-center justify-center p-8 text-center border-dashed">
              <Activity className="h-8 w-8 text-muted-foreground/50 mb-3" />
              <p className="text-sm text-muted-foreground">No actions yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Use{" "}
                <kbd className="rounded-sm border bg-muted px-1 py-0.5 text-[10px] font-mono">
                  {navigator.platform?.includes("Mac") ? "Cmd" : "Ctrl"}+K
                </kbd>{" "}
                to run your first action
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  subtitle,
  loading,
  color,
  bgColor,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtitle: string;
  loading: boolean;
  color: string;
  bgColor: string;
}) {
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <div className={`flex items-center justify-center w-7 h-7 rounded-md ${bgColor}`}>
          <span className={color}>{icon}</span>
        </div>
      </div>
      {loading ? (
        <Skeleton className="h-8 w-16" />
      ) : (
        <div>
          <p className="text-2xl font-bold tracking-tight">{value}</p>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      )}
    </Card>
  );
}
