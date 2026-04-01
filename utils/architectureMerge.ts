import { StoryBlueprint, StoryArcNode } from '../types';

type ConflictNode = StoryBlueprint['conflictArc']['nodes'][number];
type RelationshipNode = StoryBlueprint['relationshipArc']['nodes'][number];
type MysteryNode = StoryBlueprint['mysteryArc']['nodes'][number];

type ArchitectureResult = {
  summaryOfThisBatch?: string;
  updatedCumulativeSummary?: string;
  growthArc?: {
    summary?: string;
    newNodes?: StoryArcNode[];
  };
  conflictArcNodes?: ConflictNode[];
  relationshipNodes?: RelationshipNode[];
  mysteryArc?: {
    summary?: string;
  };
  mysteryNodes?: MysteryNode[];
};

const normalize = (value?: string) => value?.trim().toLowerCase() || '';

const mergeText = (previous?: string, incoming?: string) => {
  const next = incoming?.trim();
  if (!next) return previous || '';
  return next;
};

const mergeAppendSummary = (previous?: string, incoming?: string) => {
  const prev = previous?.trim();
  const next = incoming?.trim();
  if (!next) return prev || '';
  if (!prev) return next;
  if (prev.includes(next)) return prev;
  return `${prev}\n${next}`;
};

const findLastMatchingIndex = <T>(nodes: T[], predicate: (node: T) => boolean) => {
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    if (predicate(nodes[index])) {
      return index;
    }
  }
  return -1;
};

const mergeSequentialNodes = <T>(
  baseNodes: T[],
  incomingNodes: T[],
  isSameNode: (previous: T, incoming: T) => boolean,
  mergeNode: (previous: T, incoming: T) => T,
) => {
  const merged = [...baseNodes];

  incomingNodes.forEach((incomingNode) => {
    const lastNode = merged.length > 0 ? merged[merged.length - 1] : null;
    if (lastNode && isSameNode(lastNode, incomingNode)) {
      merged[merged.length - 1] = mergeNode(lastNode, incomingNode);
      return;
    }
    merged.push(incomingNode);
  });

  return merged;
};

const mergeKeyedNodes = <T>(
  baseNodes: T[],
  incomingNodes: T[],
  getKey: (node: T) => string,
  mergeNode: (previous: T, incoming: T) => T,
) => {
  const merged = [...baseNodes];

  incomingNodes.forEach((incomingNode) => {
    const key = getKey(incomingNode);
    if (!key) {
      merged.push(incomingNode);
      return;
    }

    const existingIndex = findLastMatchingIndex(merged, (node) => getKey(node) === key);
    if (existingIndex >= 0) {
      merged[existingIndex] = mergeNode(merged[existingIndex], incomingNode);
      return;
    }

    merged.push(incomingNode);
  });

  return merged;
};

const mergeGrowthNodes = (baseNodes: StoryArcNode[], incomingNodes: StoryArcNode[]) => mergeSequentialNodes(
  baseNodes,
  incomingNodes,
  (previous, incoming) => normalize(previous.stage) !== '' && normalize(previous.stage) === normalize(incoming.stage),
  (previous, incoming) => ({
    ...previous,
    stage: mergeText(previous.stage, incoming.stage),
    event: mergeText(previous.event, incoming.event),
    action: mergeText(previous.action, incoming.action),
    result: mergeText(previous.result, incoming.result),
  })
);

const mergeConflictNodes = (baseNodes: ConflictNode[], incomingNodes: ConflictNode[]) => mergeSequentialNodes(
  baseNodes,
  incomingNodes,
  (previous, incoming) => normalize(previous.stage) !== '' && normalize(previous.stage) === normalize(incoming.stage),
  (previous, incoming) => ({
    ...previous,
    stage: mergeText(previous.stage, incoming.stage),
    antagonist: mergeText(previous.antagonist, incoming.antagonist),
    conflict: mergeText(previous.conflict, incoming.conflict),
    result: mergeText(previous.result, incoming.result),
  })
);

const mergeRelationshipNodes = (baseNodes: RelationshipNode[], incomingNodes: RelationshipNode[]) => mergeKeyedNodes(
  baseNodes,
  incomingNodes,
  (node) => normalize(node.character),
  (previous, incoming) => ({
    ...previous,
    character: mergeText(previous.character, incoming.character),
    identity: mergeText(previous.identity, incoming.identity),
    change: mergeText(previous.change, incoming.change),
  })
);

const mergeMysteryNodes = (baseNodes: MysteryNode[], incomingNodes: MysteryNode[]) => mergeKeyedNodes(
  baseNodes,
  incomingNodes,
  (node) => normalize(node.origin),
  (previous, incoming) => ({
    ...previous,
    origin: mergeText(previous.origin, incoming.origin),
    progress: mergeText(previous.progress, incoming.progress),
    suspense: mergeText(previous.suspense, incoming.suspense),
    foreshadowingChapter: previous.foreshadowingChapter || incoming.foreshadowingChapter,
    payoffChapter: (incoming.payoffChapter && incoming.payoffChapter !== "暂无" && incoming.payoffChapter !== "无") 
        ? incoming.payoffChapter 
        : previous.payoffChapter,
  })
);

export const mergeArchitectureIntoBlueprint = (
  baseBlueprint: StoryBlueprint,
  architectureResult: ArchitectureResult | null | undefined,
) => {
  if (!architectureResult) return baseBlueprint;

  return {
    ...baseBlueprint,
    growthArc: {
      summary: mergeText(baseBlueprint.growthArc.summary, architectureResult.growthArc?.summary),
      nodes: mergeGrowthNodes(baseBlueprint.growthArc.nodes || [], architectureResult.growthArc?.newNodes || []),
    },
    conflictArc: {
      nodes: mergeConflictNodes(baseBlueprint.conflictArc.nodes || [], architectureResult.conflictArcNodes || []),
    },
    relationshipArc: {
      nodes: mergeRelationshipNodes(baseBlueprint.relationshipArc.nodes || [], architectureResult.relationshipNodes || []),
    },
    mysteryArc: {
      summary: mergeText(baseBlueprint.mysteryArc.summary, architectureResult.mysteryArc?.summary),
      nodes: mergeMysteryNodes(baseBlueprint.mysteryArc.nodes || [], architectureResult.mysteryNodes || []),
    },
    summarySoFar: architectureResult.updatedCumulativeSummary || mergeAppendSummary(baseBlueprint.summarySoFar, architectureResult.summaryOfThisBatch),
  };
};
