import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { ArrowLeft, Sparkles, Send, Loader2, CheckCircle2, Copy, Check } from "lucide-react";
import { type SmartAction } from "@/lib/actions";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ActionFormProps {
  action: SmartAction;
  onBack: () => void;
  onClose: () => void;
}

const actionInputSchema = z.object({
  title: z.string().min(1, "Title is required"),
  url: z.string().optional().default(""),
  content: z.string().optional().default(""),
  recipient: z.string().email("Must be a valid email").optional().or(z.literal("")),
});

type ActionInput = z.infer<typeof actionInputSchema>;

type FormStep = "input" | "generating" | "review" | "success";

export function ActionForm({ action, onBack, onClose }: ActionFormProps) {
  const [step, setStep] = useState<FormStep>("input");
  const [result, setResult] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const Icon = action.icon;

  const form = useForm<ActionInput>({
    resolver: zodResolver(actionInputSchema),
    defaultValues: {
      title: "",
      url: "",
      content: "",
      recipient: "",
    },
  });

  const handleGenerate = async (data: ActionInput) => {
    setStep("generating");
    try {
      const res = await apiRequest("POST", "/api/actions/execute", {
        actionId: action.id,
        input: data,
      });
      const responseData = await res.json();
      setResult(responseData.result);
      setStep("review");
      queryClient.invalidateQueries({ queryKey: ["/api/action-logs"] });
    } catch (error: any) {
      toast({
        title: "Generation failed",
        description: error.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
      setStep("input");
    }
  };

  const handleCopy = async () => {
    const text = typeof result === "string" ? result : JSON.stringify(result, null, 2);
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Copied to clipboard" });
  };

  const showRecipient = action.id === "email-page" || action.id === "smart-reply";

  return (
    <Card className="overflow-hidden border-border">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
        <Button size="icon" variant="ghost" onClick={onBack} data-testid="button-action-back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div
          className="flex items-center justify-center w-8 h-8 rounded-md shrink-0"
          style={{ backgroundColor: `${action.integrationColor}15` }}
        >
          <Icon className="h-4 w-4" style={{ color: action.integrationColor }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">{action.name}</div>
          <div className="text-xs text-muted-foreground">{action.description}</div>
        </div>
        <Badge variant="secondary" className="text-[10px]">{action.integration}</Badge>
      </div>

      <div className="p-4">
        {step === "input" && (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleGenerate)} className="space-y-4">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Page Title</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Enter the page title or topic..."
                        {...field}
                        data-testid="input-action-title"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>URL (optional)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="https://example.com/article"
                        {...field}
                        data-testid="input-action-url"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="content"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Content / Selected Text</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Paste the content or selected text here..."
                        className="min-h-[120px] resize-none text-sm"
                        {...field}
                        data-testid="input-action-content"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {showRecipient && (
                <FormField
                  control={form.control}
                  name="recipient"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Recipient Email</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="recipient@example.com"
                          {...field}
                          data-testid="input-action-recipient"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              <Button
                type="submit"
                disabled={form.formState.isSubmitting}
                className="w-full"
                data-testid="button-generate"
              >
                <Sparkles className="h-4 w-4 mr-2" />
                Generate with AI
              </Button>
            </form>
          </Form>
        )}

        {step === "generating" && (
          <div className="flex flex-col items-center py-10 space-y-4">
            <div className="relative">
              <div className="w-12 h-12 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              <Sparkles className="h-5 w-5 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-medium">Generating with Claude AI...</p>
              <p className="text-xs text-muted-foreground">Analyzing content and crafting the perfect output</p>
            </div>
            <div className="flex flex-col items-start gap-2 mt-2 w-full max-w-xs">
              <StepIndicator label="Reading content" active done />
              <StepIndicator label="Understanding context" active done />
              <StepIndicator label="Generating output" active />
            </div>
          </div>
        )}

        {step === "review" && result && (
          <div className="space-y-4">
            <div className="rounded-md border border-border bg-card p-4">
              {typeof result === "object" && !Array.isArray(result) ? (
                <div className="space-y-3">
                  {Object.entries(result).map(([key, value]) => (
                    <div key={key}>
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        {key.replace(/([A-Z])/g, " $1").trim()}
                      </label>
                      {Array.isArray(value) ? (
                        <ul className="mt-1 space-y-1">
                          {(value as string[]).map((item, i) => (
                            <li key={i} className="text-sm flex items-start gap-2">
                              <span className="text-muted-foreground mt-0.5">-</span>
                              <span>{String(item)}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm mt-1 whitespace-pre-wrap">{String(value)}</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : Array.isArray(result) ? (
                <div className="space-y-3">
                  {result.map((item: any, i: number) => (
                    <div key={i} className="border-b border-border last:border-0 pb-2 last:pb-0">
                      {typeof item === "object" ? (
                        Object.entries(item).map(([k, v]) => (
                          <div key={k} className="flex items-start gap-2 text-sm">
                            <span className="text-xs font-medium text-muted-foreground min-w-[80px]">{k}:</span>
                            <span>{String(v)}</span>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm">{String(item)}</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm whitespace-pre-wrap">{String(result)}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={handleCopy} variant="outline" className="flex-1" data-testid="button-copy-result">
                {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                {copied ? "Copied" : "Copy Result"}
              </Button>
              <Button
                onClick={() => {
                  setStep("success");
                  setTimeout(() => onClose(), 1500);
                }}
                className="flex-1"
                data-testid="button-send-action"
              >
                <Send className="h-4 w-4 mr-2" />
                Send / Save
              </Button>
            </div>
          </div>
        )}

        {step === "success" && (
          <div className="flex flex-col items-center py-10 space-y-3">
            <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center">
              <CheckCircle2 className="h-6 w-6 text-green-500" />
            </div>
            <p className="text-sm font-medium" data-testid="text-action-success">Action completed successfully!</p>
            <p className="text-xs text-muted-foreground">
              Result saved and sent via {action.integration}
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}

function StepIndicator({ label, active, done }: { label: string; active?: boolean; done?: boolean }) {
  return (
    <div className={`flex items-center gap-2 text-sm ${active ? (done ? "text-green-500" : "text-primary") : "text-muted-foreground"}`}>
      {done ? (
        <CheckCircle2 className="h-3.5 w-3.5" />
      ) : active ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <div className="h-3.5 w-3.5 rounded-full border border-muted-foreground/30" />
      )}
      <span>{label}</span>
    </div>
  );
}
