import { useQuery, useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Puzzle, CheckCircle2, Circle } from "lucide-react";
import { SiDiscord, SiGithub, SiGmail, SiGooglecalendar, SiGoogledocs, SiGoogledrive, SiGooglesheets, SiLinear, SiNotion } from "react-icons/si";
import { Mail, Cloud } from "lucide-react";
import type { Integration } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const iconMap: Record<string, React.ReactNode> = {
  discord: <SiDiscord className="h-5 w-5" />,
  github: <SiGithub className="h-5 w-5" />,
  gmail: <SiGmail className="h-5 w-5" />,
  "google-calendar": <SiGooglecalendar className="h-5 w-5" />,
  "google-docs": <SiGoogledocs className="h-5 w-5" />,
  "google-drive": <SiGoogledrive className="h-5 w-5" />,
  "google-sheets": <SiGooglesheets className="h-5 w-5" />,
  linear: <SiLinear className="h-5 w-5" />,
  notion: <SiNotion className="h-5 w-5" />,
  outlook: <Mail className="h-5 w-5" />,
  onedrive: <Cloud className="h-5 w-5" />,
};

export default function IntegrationsPage() {
  const { data: integrations, isLoading } = useQuery<Integration[]>({
    queryKey: ["/api/integrations"],
  });
  const { toast } = useToast();

  const toggleMutation = useMutation({
    mutationFn: async ({ id, connected }: { id: number; connected: boolean }) => {
      await apiRequest("PATCH", `/api/integrations/${id}`, { connected });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
      toast({ title: "Integration updated" });
    },
    onError: (error: any) => {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    },
  });

  const connectedCount = integrations?.filter((i) => i.connected).length ?? 0;

  const grouped = integrations?.reduce<Record<string, Integration[]>>((acc, int) => {
    if (!acc[int.category]) acc[int.category] = [];
    acc[int.category].push(int);
    return acc;
  }, {}) ?? {};

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-integrations-title">
            Integrations
          </h1>
          <p className="text-sm text-muted-foreground">
            Connect your tools to unlock AI-powered actions across platforms.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1.5" data-testid="badge-connected-count">
            <CheckCircle2 className="h-3 w-3 text-green-500" />
            {connectedCount} Connected
          </Badge>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-32 w-full rounded-md" />
          ))}
        </div>
      ) : (
        Object.entries(grouped).map(([category, items]) => (
          <div key={category} className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider" data-testid={`text-category-${category}`}>
              {category}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {items.map((integration) => (
                <Card
                  key={integration.id}
                  className="p-4"
                  data-testid={`card-integration-${integration.slug}`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="flex items-center justify-center w-10 h-10 rounded-md shrink-0"
                      style={{ backgroundColor: `${integration.color}15`, color: integration.color }}
                    >
                      {iconMap[integration.slug] || <Puzzle className="h-5 w-5" />}
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium" data-testid={`text-integration-name-${integration.slug}`}>
                          {integration.name}
                        </p>
                        {integration.connected ? (
                          <Badge variant="secondary" className="text-[9px] gap-1" data-testid={`badge-status-${integration.slug}`}>
                            <CheckCircle2 className="h-2.5 w-2.5 text-green-500" />
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[9px] gap-1" data-testid={`badge-status-${integration.slug}`}>
                            <Circle className="h-2.5 w-2.5" />
                            Inactive
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2" data-testid={`text-integration-desc-${integration.slug}`}>
                        {integration.description}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-4 mt-3 pt-3 border-t border-border">
                    <span className="text-xs text-muted-foreground capitalize" data-testid={`text-integration-category-${integration.slug}`}>
                      {integration.category}
                    </span>
                    <Switch
                      checked={integration.connected}
                      onCheckedChange={(checked) =>
                        toggleMutation.mutate({ id: integration.id, connected: checked })
                      }
                      disabled={toggleMutation.isPending}
                      data-testid={`switch-integration-${integration.slug}`}
                    />
                  </div>
                </Card>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
