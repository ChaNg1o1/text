"use client";

import "@xyflow/react/dist/style.css";

import { useMemo, useState } from "react";
import dagre from "@dagrejs/dagre";
import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import type { ForensicReport } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { EvidenceInspector } from "@/components/report/evidence-inspector";

interface EvidenceGraphProps {
  report: ForensicReport;
  activeEvidenceId?: string | null;
  activeClusterId?: number | null;
}

type SelectedState =
  | { kind: "evidence"; id: string }
  | { kind: "conclusion"; id: string }
  | { kind: "cluster"; id: string }
  | { kind: "profile"; id: string }
  | null;

const NODE_W = 220;
const NODE_H = 92;

function layout(nodes: Node[], edges: Edge[]) {
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: "LR", nodesep: 38, ranksep: 70, marginx: 12, marginy: 12 });

  nodes.forEach((node) => graph.setNode(node.id, { width: NODE_W, height: NODE_H }));
  edges.forEach((edge) => graph.setEdge(edge.source, edge.target));
  dagre.layout(graph);

  return nodes.map((node) => {
    const position = graph.node(node.id);
    return {
      ...node,
      position: {
        x: position.x - NODE_W / 2,
        y: position.y - NODE_H / 2,
      },
    };
  });
}

export function EvidenceGraph({
  report,
  activeEvidenceId = null,
  activeClusterId = null,
}: EvidenceGraphProps) {
  const [selectedState, setSelectedState] = useState<SelectedState>(null);

  const graph = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const aliases = new Map(
      (report.entity_aliases?.text_aliases ?? []).map((item) => [item.text_id, item.alias]),
    );

    report.conclusions.forEach((conclusion) => {
      nodes.push({
        id: `conclusion:${conclusion.key}`,
        data: {
          label: conclusion.statement,
        },
        style: {
          width: NODE_W,
          height: NODE_H,
          borderRadius: 22,
          border: "1px solid rgba(56,189,248,0.35)",
          background: "rgba(3, 15, 28, 0.95)",
          color: "#f8fafc",
          padding: 14,
          fontSize: 12,
          boxShadow: "0 18px 50px -36px rgba(34,211,238,0.9)",
        },
        position: { x: 0, y: 0 },
      });
    });

    report.evidence_items.slice(0, 10).forEach((evidence) => {
      nodes.push({
        id: `evidence:${evidence.evidence_id}`,
        data: { label: `${evidence.evidence_id}\n${evidence.finding || evidence.summary}` },
        style: {
          width: NODE_W,
          height: NODE_H,
          borderRadius: 20,
          border: "1px solid rgba(251,191,36,0.28)",
          background: "rgba(25, 20, 7, 0.94)",
          color: "#fef3c7",
          padding: 14,
          fontSize: 12,
        },
        position: { x: 0, y: 0 },
      });
      evidence.linked_conclusion_keys?.forEach((key) => {
        edges.push({
          id: `edge-${evidence.evidence_id}-${key}`,
          source: `evidence:${evidence.evidence_id}`,
          target: `conclusion:${key}`,
          type: "smoothstep",
          markerEnd: { type: MarkerType.ArrowClosed },
          style: { stroke: "#38bdf8", strokeWidth: 1.4 },
        });
      });
    });

    report.cluster_view?.clusters.forEach((cluster) => {
      nodes.push({
        id: `cluster:${cluster.cluster_id}`,
        data: { label: `${cluster.label}\n${cluster.theme_summary}` },
        style: {
          width: NODE_W,
          height: NODE_H,
          borderRadius: 20,
          border: "1px solid rgba(16,185,129,0.28)",
          background: "rgba(6, 20, 16, 0.94)",
          color: "#d1fae5",
          padding: 14,
          fontSize: 12,
        },
        position: { x: 0, y: 0 },
      });
      cluster.representative_evidence_ids?.forEach((evidenceId) => {
        edges.push({
          id: `cluster-edge-${cluster.cluster_id}-${evidenceId}`,
          source: `cluster:${cluster.cluster_id}`,
          target: `evidence:${evidenceId}`,
          type: "smoothstep",
          markerEnd: { type: MarkerType.ArrowClosed },
          style: { stroke: "#34d399", strokeWidth: 1.2 },
        });
      });
    });

    report.writing_profiles.forEach((profile) => {
      nodes.push({
        id: `profile:${profile.subject}`,
        data: {
          label: `${profile.subject}\n${profile.headline || profile.observable_summary || profile.summary}`,
        },
        style: {
          width: NODE_W,
          height: NODE_H,
          borderRadius: 20,
          border: "1px solid rgba(168,85,247,0.28)",
          background: "rgba(22, 11, 34, 0.94)",
          color: "#ede9fe",
          padding: 14,
          fontSize: 12,
        },
        position: { x: 0, y: 0 },
      });

      profile.representative_text_ids?.forEach((textId) => {
        const alias = aliases.get(textId);
        const matchedEvidence = report.evidence_items.find((item) =>
          item.source_text_ids.includes(textId),
        );
        if (matchedEvidence && alias) {
          edges.push({
            id: `profile-edge-${profile.subject}-${textId}`,
            source: `profile:${profile.subject}`,
            target: `evidence:${matchedEvidence.evidence_id}`,
            type: "smoothstep",
            markerEnd: { type: MarkerType.ArrowClosed },
            label: alias,
            style: { stroke: "#c084fc", strokeWidth: 1.2 },
          });
        }
      });
    });

    return {
      nodes: layout(nodes, edges),
      edges,
    };
  }, [report]);

  const selected = useMemo<SelectedState>(() => {
    if (activeEvidenceId) {
      return { kind: "evidence", id: activeEvidenceId };
    }
    if (activeClusterId != null) {
      return { kind: "cluster", id: `${activeClusterId}` };
    }
    return selectedState;
  }, [activeClusterId, activeEvidenceId, selectedState]);

  const selectedItem = useMemo(() => {
    if (!selected) return null;
    if (selected.kind === "evidence") {
      const evidence = report.evidence_items.find((item) => item.evidence_id === selected.id);
      return evidence ? { kind: "evidence" as const, evidence } : null;
    }
    if (selected.kind === "conclusion") {
      const conclusion = report.conclusions.find((item) => item.key === selected.id);
      return conclusion ? { kind: "conclusion" as const, conclusion } : null;
    }
    if (selected.kind === "cluster") {
      const cluster = report.cluster_view?.clusters.find((item) => `${item.cluster_id}` === selected.id);
      return cluster ? { kind: "cluster" as const, cluster } : null;
    }
    const profile = report.writing_profiles.find((item) => item.subject === selected.id);
    return profile ? { kind: "profile" as const, profile } : null;
  }, [report, selected]);

  if (graph.nodes.length === 0) {
    return null;
  }

  return (
    <section className="space-y-6">
      <div>
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
          Evidence Graph
        </div>
        <h3 className="mt-1 text-2xl font-semibold">证据关系图</h3>
        <p className="mt-2 text-sm leading-7 text-muted-foreground">
          把结论、证据、画像和分组放进同一张关系图里，用户能直接看到“哪条证据支撑哪段结论”。
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="border-border/60 bg-card/95">
          <CardContent className="p-0">
            <div className="h-[560px]">
              <ReactFlow
                fitView
                nodes={graph.nodes}
                edges={graph.edges}
                onNodeClick={(_, node) => {
                  const [kind, id] = node.id.split(":");
                  if (
                    kind === "evidence" ||
                    kind === "conclusion" ||
                    kind === "cluster" ||
                    kind === "profile"
                  ) {
                    setSelectedState({ kind, id });
                  }
                }}
              >
                <MiniMap pannable zoomable />
                <Controls />
                <Background gap={20} size={1} />
              </ReactFlow>
            </div>
          </CardContent>
        </Card>
        <EvidenceInspector item={selectedItem} />
      </div>
    </section>
  );
}
