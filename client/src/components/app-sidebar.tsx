import { useLocation, Link } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Command, LayoutDashboard, Puzzle, History, Settings, Sparkles, Keyboard, Chrome } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const navItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Actions", url: "/actions", icon: Sparkles },
  { title: "Integrations", url: "/integrations", icon: Puzzle },
  { title: "History", url: "/history", icon: History },
  { title: "Extension", url: "/extension", icon: Chrome },
];

export function AppSidebar() {
  const [location] = useLocation();

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary">
            <Command className="h-4 w-4 text-primary-foreground" />
          </div>
          <div>
            <span className="text-base font-semibold tracking-tight">Keynection</span>
            <Badge variant="secondary" className="ml-2 text-[9px]">BETA</Badge>
          </div>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive = location === item.url || (item.url !== "/" && location.startsWith(item.url));
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild data-active={isActive}>
                      <Link href={item.url} data-testid={`nav-${item.title.toLowerCase()}`}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Quick Access</SidebarGroupLabel>
          <SidebarGroupContent>
            <div className="px-3 py-2">
              <div className="rounded-md border border-dashed border-sidebar-border bg-sidebar p-3 text-center">
                <Keyboard className="h-5 w-5 mx-auto mb-2 text-muted-foreground" />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Press{" "}
                  <kbd className="rounded-sm border bg-muted px-1 py-0.5 text-[10px] font-mono">
                    {navigator.platform?.includes("Mac") ? "Cmd" : "Ctrl"}+K
                  </kbd>{" "}
                  to open the command palette
                </p>
              </div>
            </div>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-3">
        <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
          <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
          <span>Claude AI Connected</span>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
