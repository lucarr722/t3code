import type { CodeGraphFunctionNode } from "@t3tools/contracts";

export interface MermaidGeneratorOptions {
  focusId: string | null;
  groupByFile: boolean;
  direction: "TD" | "LR";
}

/**
 * Sanitize an ID for use as a Mermaid node identifier.
 * Mermaid node IDs must be alphanumeric + underscores.
 */
function sanitizeNodeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, "_");
}

/**
 * Escape a label for use inside Mermaid double-quoted strings.
 */
function escapeLabel(label: string): string {
  return label.replace(/"/g, "#quot;").replace(/</g, "#lt;").replace(/>/g, "#gt;");
}

/**
 * Generate Mermaid flowchart source from a set of function nodes.
 */
export function generateMermaidSource(
  functions: readonly CodeGraphFunctionNode[],
  options: MermaidGeneratorOptions,
): string {
  if (functions.length === 0) {
    return `flowchart ${options.direction}\n  empty["No functions to display"]`;
  }

  const lines: string[] = [`flowchart ${options.direction}`];
  const nodeIds = new Set(functions.map((f) => f.id));
  const edgeSet = new Set<string>();

  if (options.groupByFile) {
    // Group functions by file
    const byFile = new Map<string, CodeGraphFunctionNode[]>();
    for (const fn of functions) {
      const group = byFile.get(fn.filePath) ?? [];
      group.push(fn);
      byFile.set(fn.filePath, group);
    }

    for (const [filePath, fileFunctions] of byFile) {
      const subgraphId = sanitizeNodeId(`sg_${filePath}`);
      lines.push(`  subgraph ${subgraphId}["${escapeLabel(filePath)}"]`);
      for (const fn of fileFunctions) {
        const nid = sanitizeNodeId(fn.id);
        const label = escapeLabel(fn.name);
        lines.push(`    ${nid}["${label}"]`);
      }
      lines.push("  end");
    }
  } else {
    // Flat node list
    for (const fn of functions) {
      const nid = sanitizeNodeId(fn.id);
      const label = escapeLabel(`${fn.name} (${fn.filePath})`);
      lines.push(`  ${nid}["${label}"]`);
    }
  }

  // Edges
  for (const fn of functions) {
    const fromId = sanitizeNodeId(fn.id);
    for (const calleeId of fn.calls) {
      if (!nodeIds.has(calleeId)) continue;
      const toId = sanitizeNodeId(calleeId);
      const edgeKey = `${fromId}-->${toId}`;
      if (edgeSet.has(edgeKey)) continue;
      edgeSet.add(edgeKey);
      lines.push(`  ${fromId} --> ${toId}`);
    }
  }

  // Click callbacks
  for (const fn of functions) {
    const nid = sanitizeNodeId(fn.id);
    lines.push(`  click ${nid} __t3_codegraph_click "${escapeLabel(fn.id)}"`);
  }

  // Highlight focus node
  if (options.focusId) {
    const focusNid = sanitizeNodeId(options.focusId);
    if (nodeIds.has(options.focusId)) {
      lines.push(`  style ${focusNid} fill:#3b82f6,color:#fff,stroke:#2563eb,stroke-width:2px`);
    }
  }

  return lines.join("\n");
}
