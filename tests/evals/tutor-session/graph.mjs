// Learning graph / topology (docs/features/tutor-decision-eval.md §Graph): the cards the Tutor created and how they
// are linked, rebuilt from append-only events at any point in a session - never inferred from canvas positions.
//   material_node_created   one node per logical material (subcards are not nodes)
//   material_link_created   an explicit edge with relation_type, created_by (tutor | learner | system), reason codes
//   material_link_removed   the edge is gone from that point on
//   rabbit_hole_opened / rabbit_hole_returned
//   next_steps_ready / next_step_selected   offered hooks are CANDIDATE edges, never nodes; a selection becomes a
//                                           committed edge only through the node the Tutor then created
// Topology is descriptive (linear / mostly_linear / branching / highly_branching); review flags carry justified: null.
import { evidenceDelta, round, stats, sum, tally } from './events.mjs';

// The graph as of `until` (ms on the session timeline; default: the end).
export function learningGraph(events, { until = Infinity } = {}) {
  const nodes = new Map(), edges = new Map(), holes = new Map(), offered = [];
  // A selection commits to the node its decision creates; it expires when the following decision starts without one.
  let pendingSelection = null, pendingDecision = false;
  for (const event of events.toSorted((a, b) => a.t_ms - b.t_ms || a.seq - b.seq)) {
    if (event.t_ms > until) break;
    switch (event.type) {
      case 'material_node_created': {
        const { node_id, material_id, decision_id, canvas_id, session_id, material_type, modality, concept_ids, claim_ids, origin_relation, journey_id, section_id, planner_version, canvas_version } = event;
        nodes.set(node_id, { node_id, material_id, decision_id: decision_id ?? null, canvas_id, session_id, material_type: material_type ?? null, modality: modality ?? null, concept_ids: concept_ids ?? [], claim_ids: claim_ids ?? [], created_at: event.t_ms, origin_relation: origin_relation ?? null, rabbit_hole_id: event.rabbit_hole_id ?? event.dive_id ?? null, journey_id: journey_id ?? null, section_id: section_id ?? null, planner_version: planner_version ?? null, canvas_version: canvas_version ?? null });
        if (pendingSelection) { pendingSelection.selection_to_material_node_id = node_id; pendingSelection = null; }
        break;
      }
      case 'material_link_created': {
        const { edge_id, from_node_id, to_node_id, relation_type, created_by, decision_id, reason_codes, rationale_summary } = event;
        edges.set(edge_id, { edge_id, from_node_id, to_node_id, relation_type, created_by, decision_id: decision_id ?? null, reason_codes: reason_codes ?? [], rationale_summary: rationale_summary ?? null, created_at: event.t_ms });
        break;
      }
      case 'material_link_removed': edges.delete(event.edge_id); break;
      case 'tutor_decision_started': if (pendingSelection && pendingDecision) pendingSelection = null; pendingDecision = !!pendingSelection; break;
      case 'rabbit_hole_opened': {
        const fields = ['parent_canvas_id', 'child_canvas_id', 'origin_node_id', 'origin_card_id', 'origin_block_id', 'origin_scene_id', 'origin_part_id', 'origin_concept_ids', 'opened_by', 'origin_action', 'depth', 'source_provenance', 'reason_codes', 'rationale_summary'];
        holes.set(event.rabbit_hole_id, { rabbit_hole_id: event.rabbit_hole_id, session_id: event.session_id, opened_at: event.t_ms, returned_at: null, ...Object.fromEntries(fields.map(key => [key, event[key] ?? null])) });
        break;
      }
      case 'rabbit_hole_returned': if (holes.has(event.rabbit_hole_id)) holes.get(event.rabbit_hole_id).returned_at = event.t_ms; break;
      case 'next_steps_ready': offered.push({ hook_set_id: event.hook_set_id, session_id: event.session_id, shown_at: event.t_ms, options: (event.options || []).map(({ id, position, learning_goal }) => ({ id, position, learning_goal: learning_goal ?? null })), selected: null }); break;
      case 'next_step_selected': {
        const set = offered.find(entry => entry.hook_set_id === event.hook_set_id);
        if (set) { pendingSelection = set.selected = { option_id: event.option_id, option_position: event.position, option_target: event.option_target ?? null, selected_at: event.t_ms, selection_to_material_node_id: null }; pendingDecision = false; }
        break;
      }
      default: break;
    }
  }
  const list = [...nodes.values()];
  for (const node of list) Object.assign(node, { parent_node_ids: [], child_node_ids: [] });
  for (const edge of edges.values()) { nodes.get(edge.to_node_id)?.parent_node_ids.push(edge.from_node_id); nodes.get(edge.from_node_id)?.child_node_ids.push(edge.to_node_id); }
  return { nodes: list, edges: [...edges.values()], rabbit_holes: [...holes.values()], next_step_options: offered };
}

// Restrict a graph to some decisions (a section, a planner version): their nodes and the edges among them.
export function subgraph(graph, decisionIds) {
  const keep = new Set(graph.nodes.filter(node => decisionIds.has(node.decision_id)).map(node => node.node_id));
  return { nodes: graph.nodes.filter(node => keep.has(node.node_id)), edges: graph.edges.filter(edge => keep.has(edge.from_node_id) && keep.has(edge.to_node_id)), rabbit_holes: graph.rabbit_holes.filter(hole => keep.has(hole.origin_node_id)), next_step_options: [] };
}
export const mergeGraphs = graphs => ({ nodes: graphs.flatMap(g => g.nodes), edges: graphs.flatMap(g => g.edges), rabbit_holes: graphs.flatMap(g => g.rabbit_holes), next_step_options: graphs.flatMap(g => g.next_step_options) });

// ---------- Topology ----------

// Structural edges carry depth and branching; `reference` relations (and an extra parent) are cross-links.
function shapeOf(graph, taxonomy) {
  const relation = edge => taxonomy.relations?.[edge.relation_type]?.category ?? 'unclassified';
  const structural = graph.edges.filter(edge => relation(edge) !== 'reference');
  const ids = graph.nodes.map(node => node.node_id);
  const out = Object.fromEntries(ids.map(id => [id, []])), into = Object.fromEntries(ids.map(id => [id, []]));
  for (const edge of structural) if (out[edge.from_node_id] && into[edge.to_node_id]) { out[edge.from_node_id].push(edge); into[edge.to_node_id].push(edge); }
  // Depth: the longest structural path from a root (cycles are cut, never followed twice).
  const depth = {};
  const depthOf = (id, seen = new Set()) => {
    if (depth[id] != null) return depth[id];
    if (seen.has(id)) return 0;
    seen.add(id);
    return (depth[id] = into[id].length ? 1 + Math.max(...into[id].map(edge => depthOf(edge.from_node_id, seen))) : 0);
  };
  ids.forEach(id => depthOf(id));
  // Linear runs: u -> v where u has one child and v one parent.
  const linearNext = id => (out[id].length === 1 && into[out[id][0].to_node_id].length === 1 ? out[id][0].to_node_id : null);
  let longestRun = ids.length ? 1 : 0, runNodes = ids.length ? [ids[0]] : [];
  for (const id of ids) {
    if (into[id].length === 1 && out[into[id][0].from_node_id].length === 1) continue; // not a run start
    const run = [id];
    for (let next = linearNext(id); next && !run.includes(next); next = linearNext(next)) run.push(next);
    if (run.length > longestRun) { longestRun = run.length; runNodes = run; }
  }
  // Weakly connected components.
  const parent = Object.fromEntries(ids.map(id => [id, id]));
  const find = id => (parent[id] === id ? id : (parent[id] = find(parent[id])));
  for (const edge of graph.edges) if (parent[edge.from_node_id] && parent[edge.to_node_id]) parent[find(edge.from_node_id)] = find(edge.to_node_id);
  return { relation, structural, out, into, depth, longestRun, runNodes, components: new Set(ids.map(find)).size };
}

export function graphMetrics(graph, { steps = [], records = [], taxonomy = {}, sessions = 1 } = {}) {
  const limits = taxonomy.graph_review || {};
  const { relation, structural, out, into, depth, longestRun, runNodes, components } = shapeOf(graph, taxonomy);
  const nodes = graph.nodes, n = nodes.length;
  const depths = nodes.map(node => depth[node.node_id]);
  const breadth = tally(depths.map(String));
  const nonLeaf = nodes.filter(node => out[node.node_id].length);
  const branchNodes = nodes.filter(node => out[node.node_id].length >= 2);
  const pedagogical = structural.filter(edge => relation(edge) === 'pedagogical');
  const maxDepth = depths.length ? Math.max(...depths) : 0, maxBreadth = Object.values(breadth).length ? Math.max(...Object.values(breadth)) : 0;
  const meanBranching = nonLeaf.length ? round(sum(nonLeaf.map(node => out[node.node_id].length)) / nonLeaf.length, 3) : 0;
  const branchRate = nonLeaf.length ? round(branchNodes.length / nonLeaf.length, 3) : 0;
  const linearEdgeRatio = pedagogical.length ? round(pedagogical.filter(edge => out[edge.from_node_id].length === 1).length / pedagogical.length, 3) : null;
  const shape = !n ? 'empty' : branchRate === 0 ? 'linear' : (linearEdgeRatio ?? 0) >= (limits.mostly_linear_edge_ratio ?? 0.8) ? 'mostly_linear'
    : meanBranching >= (limits.highly_branching_factor ?? 3) || branchRate >= (limits.highly_branching_rate ?? 0.5) ? 'highly_branching' : 'branching';
  // The main path: the longest structural path through nodes outside any Rabbit Hole.
  const main = nodes.filter(node => !node.rabbit_hole_id);
  const mainSet = new Set(main.map(node => node.node_id));
  let mainPath = [];
  const walk = (id, path) => { const next = out[id].map(edge => edge.to_node_id).filter(child => mainSet.has(child) && !path.includes(child)); if (!next.length) { if (path.length > mainPath.length) mainPath = path; return; } next.forEach(child => walk(child, [...path, child])); };
  main.filter(node => !into[node.node_id].some(edge => mainSet.has(edge.from_node_id))).forEach(root => walk(root.node_id, [root.node_id]));
  const onMain = new Set(mainPath);
  const position = node => (node.rabbit_hole_id ? 'rabbit_hole' : onMain.has(node.node_id) ? 'main_path' : 'side_branch');
  // Rabbit Holes: depth as recorded, else nesting (a hole opened from a node inside another hole is one deeper).
  const holeOf = Object.fromEntries(graph.rabbit_holes.map(hole => [hole.rabbit_hole_id, hole]));
  const nodeHole = Object.fromEntries(nodes.map(node => [node.node_id, node.rabbit_hole_id]));
  const holeDepth = (hole, seen = new Set()) => hole.depth ?? (seen.has(hole.rabbit_hole_id) ? 1 : 1 + (holeOf[nodeHole[hole.origin_node_id]] ? holeDepth(holeOf[nodeHole[hole.origin_node_id]], seen.add(hole.rabbit_hole_id)) : 0));
  const holeDepths = graph.rabbit_holes.map(hole => holeDepth(hole));
  const holeNodes = graph.rabbit_holes.map(hole => nodes.filter(node => node.rabbit_hole_id === hole.rabbit_hole_id).length);
  const end = Math.max(0, ...nodes.map(node => node.created_at), ...steps.map(step => step.timeline?.t5_tutor_action_ready ?? 0));
  const learning = sum(steps.map(step => step.estimated_learning_seconds || 0));
  const inHoles = steps.filter(step => step.dive_id);
  const outcomeOf = step => { const delta = evidenceDelta(step.evidence_before, step.evidence_after); return delta.regressed.length ? 'regressed' : delta.improved.length ? 'improved' : 'unchanged'; };
  const stepOf = Object.fromEntries(steps.map(step => [step.decision_id, step]));
  // Professor Next Steps: offered options are candidates; selections are the committed ones.
  const sets = graph.next_step_options, options = sets.flatMap(set => set.options.map(option => ({ ...option, set })));
  const unselected = options.filter(option => option.set.selected?.option_id !== option.id);
  const seenGoals = new Set(), repeatedUnselected = unselected.filter(option => { const key = option.learning_goal; const repeat = key != null && seenGoals.has(key); if (key != null) seenGoals.add(key); return repeat; });
  // When did the first branch, and the first learner choice, happen (counted in nodes created before it)?
  const byTime = nodes.toSorted((a, b) => a.created_at - b.created_at);
  const firstBranchAt = Math.min(...branchNodes.map(node => out[node.node_id].map(edge => edge.created_at).sort((a, b) => a - b)[1]));
  const firstChoiceAt = Math.min(...sets.filter(set => set.selected).map(set => set.selected.selected_at), ...graph.edges.filter(edge => edge.created_by === 'learner').map(edge => edge.created_at));
  const nodesBefore = t => (Number.isFinite(t) ? byTime.filter(node => node.created_at < t).length : null);
  const nodeReasonCodes = node => [...new Set([...into[node.node_id].flatMap(edge => edge.reason_codes), ...(stepOf[node.decision_id]?.tutor_decision?.reason_codes || [])])];
  const flags = [];
  const flag = (kind, value, threshold, extra = {}) => flags.push({ id: `graph-${flags.length + 1}`, kind, value, threshold, justified: null, ...extra });
  if (longestRun >= (limits.linear_chain_length ?? 6) && !runNodes.some(id => into[id].some(edge => edge.created_by === 'learner'))) flag('deep_linear_chain_without_learner_choice', longestRun, limits.linear_chain_length ?? 6, { node_ids: runNodes });
  for (const node of nodes) if (out[node.node_id].length >= (limits.wide_branch ?? 4)) flag('very_wide_branch', out[node.node_id].length, limits.wide_branch ?? 4, { node_id: node.node_id });
  if (holeDepths.filter(d => d >= 2).length >= (limits.nested_holes ?? 2)) flag('repeated_nested_rabbit_holes', holeDepths.filter(d => d >= 2).length, limits.nested_holes ?? 2);
  if (n > 1) for (const node of nodes) if (!into[node.node_id].length && !out[node.node_id].length) flag('node_without_relation', 0, null, { node_id: node.node_id });
  for (const node of nodes) {
    const kids = out[node.node_id].map(edge => graph.nodes.find(other => other.node_id === edge.to_node_id)).filter(Boolean);
    const keys = kids.map(kid => [...kid.concept_ids].sort().join('|')).filter(Boolean);
    if (new Set(keys).size < keys.length) flag('repeated_branch_to_equivalent_concepts', keys.length - new Set(keys).size, null, { node_id: node.node_id });
  }
  for (const record of records) if (record.status === 'generated' && !record.was_seen && record.engagement_source) flag('branch_never_visited', record.material_id, null);
  for (const edge of graph.edges.filter(entry => taxonomy.relations?.[entry.relation_type]?.remediation)) if (!out[edge.to_node_id]?.length && !onMain.has(edge.to_node_id)) flag('remediation_branch_never_returns', edge.edge_id, null, { node_id: edge.to_node_id, method: 'heuristic: the remediation target is a leaf off the main path; no explicit return signal yet' });
  if (learning && sum(inHoles.map(step => step.estimated_learning_seconds || 0)) / learning >= (limits.side_exploration_share ?? 0.5)) flag('side_exploration_dominates', round(sum(inHoles.map(step => step.estimated_learning_seconds || 0)) / learning, 3), limits.side_exploration_share ?? 0.5);
  return {
    node_count: n, edge_count: graph.edges.length, structural_edge_count: structural.length,
    root_count: nodes.filter(node => !into[node.node_id].length).length, leaf_count: nodes.filter(node => !out[node.node_id].length).length,
    max_depth: maxDepth, mean_depth: stats(depths).mean, median_depth: stats(depths).p50,
    max_breadth: maxBreadth, breadth_by_depth: breadth,
    mean_branching_factor: meanBranching, branch_node_count: branchNodes.length, branch_rate: branchRate,
    longest_linear_run: longestRun, main_path_length: mainPath.length,
    orphan_node_count: n > 1 ? nodes.filter(node => !into[node.node_id].length && !out[node.node_id].length).length : 0,
    disconnected_component_count: components, cross_link_count: graph.edges.length - structural.length + sum(nodes.map(node => Math.max(0, into[node.node_id].length - 1))),
    linear_edge_ratio: linearEdgeRatio, breadth_depth_ratio: maxDepth ? round(maxBreadth / maxDepth, 3) : null, shape,
    edges_by_relation: tally(graph.edges.map(edge => edge.relation_type)), edges_by_created_by: tally(graph.edges.map(edge => edge.created_by)),
    branching_by_created_by: tally(branchNodes.flatMap(node => out[node.node_id].map(edge => edge.created_by))),
    position_share: Object.fromEntries(Object.entries(tally(nodes.map(position))).map(([key, count]) => [key, round(count / n, 3)])),
    cards_before_first_branch: nodesBefore(firstBranchAt), cards_before_first_learner_choice: nodesBefore(firstChoiceAt),
    modality_by_depth: Object.fromEntries(Object.entries(Object.groupBy(nodes, node => String(depth[node.node_id]))).map(([d, list]) => [d, tally(list.map(node => node.modality ?? 'unknown'))])),
    evidence_outcome_by_position: Object.fromEntries(Object.entries(Object.groupBy(nodes.filter(node => stepOf[node.decision_id]), position)).map(([key, list]) => [key, tally(list.map(node => outcomeOf(stepOf[node.decision_id])))])),
    rabbit_holes: {
      count: graph.rabbit_holes.length, per_session: round(graph.rabbit_holes.length / Math.max(1, sessions), 3),
      rate_per_decision: steps.length ? round(graph.rabbit_holes.length / steps.length, 3) : null,
      max_depth: holeDepths.length ? Math.max(...holeDepths) : 0, mean_depth: stats(holeDepths).mean, nodes_per_hole: stats(holeNodes),
      opened_by: tally(graph.rabbit_holes.map(hole => hole.opened_by ?? 'unknown')),
      return_rate: graph.rabbit_holes.length ? round(graph.rabbit_holes.filter(hole => hole.returned_at != null).length / graph.rabbit_holes.length, 3) : null,
      unfinished_rate: graph.rabbit_holes.length ? round(graph.rabbit_holes.filter(hole => hole.returned_at == null).length / graph.rabbit_holes.length, 3) : null,
      time_spent_seconds: round(sum(graph.rabbit_holes.map(hole => ((hole.returned_at ?? end) - hole.opened_at) / 1000)), 1),
      time_spent_method: 'heuristic: opened -> returned, else -> the last recorded activity',
      return_method: 'rabbit_hole_returned events; heuristic until the production contract has a stronger return signal',
      learning_share: learning ? round(sum(inHoles.map(step => step.estimated_learning_seconds || 0)) / learning, 3) : null,
      evidence_transitions_in_holes: sum(inHoles.map(step => { const d = evidenceDelta(step.evidence_before, step.evidence_after); return d.improved.length + d.regressed.length; })),
    },
    next_steps: {
      sets_shown: sets.length, options_shown: options.length, sets_selected: sets.filter(set => set.selected).length,
      hook_branch_selection_rate: sets.length ? round(sets.filter(set => set.selected).length / sets.length, 3) : null,
      unselected_option_rate: options.length ? round(unselected.length / options.length, 3) : null,
      repeated_unselected_goal_rate: unselected.length ? round(repeatedUnselected.length / unselected.length, 3) : null,
      selections: sets.filter(set => set.selected).map(set => ({ hook_set_id: set.hook_set_id, ...set.selected })),
    },
    topology_by: {
      material_type: topologyBy(nodes, node => [node.material_type ?? 'unknown'], { out, into, depth, position }),
      modality: topologyBy(nodes, node => [node.modality ?? 'unknown'], { out, into, depth, position }),
      reason_code: topologyBy(nodes, node => nodeReasonCodes(node), { out, into, depth, position }),
      concept: topologyBy(nodes, node => node.concept_ids, { out, into, depth, position }),
      section: topologyBy(nodes, node => [node.section_id ?? 'none'], { out, into, depth, position }),
      planner_version: topologyBy(nodes, node => [node.planner_version ?? 'unknown'], { out, into, depth, position }),
    },
    review_flags: flags,
  };
}

// Per group of nodes: how deep, how terminal, how branching, how often on the main path or in a hole.
function topologyBy(nodes, keysOf, { out, into, depth, position }) {
  const groups = {};
  for (const node of nodes) for (const key of keysOf(node)) (groups[key] ||= []).push(node);
  return Object.fromEntries(Object.entries(groups).map(([key, list]) => [key, {
    nodes: list.length, mean_depth: stats(list.map(node => depth[node.node_id])).mean,
    leaf_rate: round(list.filter(node => !out[node.node_id].length).length / list.length, 3),
    branch_rate: round(list.filter(node => out[node.node_id].length >= 2).length / list.length, 3),
    mean_out_degree: round(sum(list.map(node => out[node.node_id].length)) / list.length, 3),
    root_rate: round(list.filter(node => !into[node.node_id].length).length / list.length, 3),
    position: tally(list.map(position)),
  }]));
}
