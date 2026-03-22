import { NetworkIcon } from "lucide-react";

interface CodeGraphEmptyStateProps {
  hasProject: boolean;
  isLoading: boolean;
}

export function CodeGraphEmptyState({ hasProject, isLoading }: CodeGraphEmptyStateProps) {
  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-3 size-8 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
          <p className="text-sm text-muted-foreground">Analyzing codebase...</p>
        </div>
      </div>
    );
  }

  if (!hasProject) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <NetworkIcon className="mx-auto mb-3 size-10 text-muted-foreground/50" />
          <p className="text-sm font-medium text-foreground">No project selected</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Select a project from the dropdown to visualize its code graph.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="text-center">
        <NetworkIcon className="mx-auto mb-3 size-10 text-muted-foreground/50" />
        <p className="text-sm font-medium text-foreground">No functions found</p>
        <p className="mt-1 text-sm text-muted-foreground">
          The project doesn't contain any supported source files, or the analysis returned no
          results.
        </p>
      </div>
    </div>
  );
}
