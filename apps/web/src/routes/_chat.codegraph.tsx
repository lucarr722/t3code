import { createFileRoute } from "@tanstack/react-router";
import { SidebarInset } from "~/components/ui/sidebar";
import { CodeGraphView } from "~/components/codegraph/CodeGraphView";

export const Route = createFileRoute("/_chat/codegraph")({
  component: CodeGraphRouteView,
});

function CodeGraphRouteView() {
  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden bg-background">
      <CodeGraphView />
    </SidebarInset>
  );
}
