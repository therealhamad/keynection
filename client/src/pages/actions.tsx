import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Sparkles, Zap, Code2, MessageSquare, FileText } from "lucide-react";
import { smartActions, type SmartAction } from "@/lib/actions";
import { ActionForm } from "@/components/action-form";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";

const categoryIcons: Record<string, typeof Zap> = {
  productivity: Zap,
  communication: MessageSquare,
  content: FileText,
  development: Code2,
};

export default function ActionsPage() {
  const [search, setSearch] = useState("");
  const [selectedAction, setSelectedAction] = useState<SmartAction | null>(null);
  const [activeTab, setActiveTab] = useState("all");

  const filtered = smartActions.filter((a) => {
    const matchesSearch =
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.description.toLowerCase().includes(search.toLowerCase()) ||
      a.integration.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = activeTab === "all" || a.category === activeTab;
    return matchesSearch && matchesCategory;
  });

  const categories = ["all", "productivity", "communication", "content", "development"];

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-actions-title">
          Smart Actions
        </h1>
        <p className="text-sm text-muted-foreground">
          AI-powered actions that understand your context and execute across platforms.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search actions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-actions"
          />
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          {categories.map((cat) => (
            <TabsTrigger key={cat} value={cat} className="capitalize" data-testid={`tab-${cat}`}>
              {cat === "all" ? "All" : cat}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          {filtered.length === 0 ? (
            <Card className="flex flex-col items-center justify-center p-12 text-center border-dashed">
              <Search className="h-8 w-8 text-muted-foreground/50 mb-3" />
              <p className="text-sm text-muted-foreground">No actions match your search</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {filtered.map((action) => {
                const Icon = action.icon;
                const CategoryIcon = categoryIcons[action.category] || Zap;
                return (
                  <Card
                    key={action.id}
                    className="p-4 hover-elevate cursor-pointer group"
                    onClick={() => setSelectedAction(action)}
                    data-testid={`card-action-${action.id}`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="flex items-center justify-center w-10 h-10 rounded-md shrink-0"
                        style={{ backgroundColor: `${action.integrationColor}12` }}
                      >
                        <Icon className="h-5 w-5" style={{ color: action.integrationColor }} />
                      </div>
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium">{action.name}</p>
                          <Badge variant="secondary" className="text-[9px]">
                            Phase {action.phase}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {action.description}
                        </p>
                        <div className="flex items-center gap-2 pt-1 flex-wrap">
                          <Badge variant="outline" className="text-[10px] gap-1">
                            <CategoryIcon className="h-2.5 w-2.5" />
                            {action.category}
                          </Badge>
                          <Badge variant="secondary" className="text-[10px]">
                            {action.integration}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-border">
                      <Button variant="ghost" size="sm" className="w-full gap-1.5 text-xs" data-testid={`button-run-${action.id}`}>
                        <Sparkles className="h-3 w-3" />
                        Run Action
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={!!selectedAction} onOpenChange={(open) => !open && setSelectedAction(null)}>
        <DialogContent className="p-0 gap-0 max-w-[640px] border-0 bg-transparent shadow-none">
          {selectedAction && (
            <ActionForm
              action={selectedAction}
              onBack={() => setSelectedAction(null)}
              onClose={() => setSelectedAction(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
