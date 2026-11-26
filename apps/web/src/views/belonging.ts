// What belongs to a record beyond the links of the graph: what the architecture knows about it.
//
// The graph (graph.ts) has the chain of the method. The architecture adds links the chain does not have:
// a data flow joins two elements and carries assets, a control acts in places, an attack path has a route,
// a boundary contains elements. A view lights these up with a chosen record, and its card lists them.

import type { Element, Tara } from "@tara/core";
import { chainOf, flowsAt, type Graph, isThing, placedIn } from "./graph.ts";

const endsOf = (flow: Element): string[] => [flow.sourceId, flow.targetId].filter((end): end is string => end !== null);

/**
 * What an element belongs to: a data flow to its ends and to what follows from the assets it carries; any
 * other to what its flows join it to; and each to the controls that act in it.
 */
function addAroundElement(all: Set<string>, graph: Graph, tara: Tara, element: Element): void {
  if (element.kind === "data_flow") {
    for (const end of endsOf(element)) all.add(end);
    for (const asset of placedIn(tara.assets, element.id)) for (const id of chainOf(graph, [asset.id])) all.add(id);
  } else {
    for (const flow of flowsAt(tara.elements, element.id)) {
      all.add(flow.id);
      for (const end of endsOf(flow)) all.add(end);
    }
  }
  for (const control of placedIn(tara.controls, element.id)) all.add(control.id);
}

/**
 * What belongs to a record that is chosen in a view, and is lit with it: its chain, as on the graph, and what
 * the architecture knows besides. A data flow belongs to the elements at its ends and to the assets it
 * carries; an element to what its data flows join it to and to the controls that act in it; an asset to every
 * place it lives in; a control that is chosen to the places it acts in. An attack path belongs to the places
 * on its route and to the controls that cover it, and they to it; a boundary to what it contains, and that to
 * it. A line of a drawing is lit when everything it joins is in this.
 */
export function belongingTo(graph: Graph, tara: Tara, id: string): Set<string> {
  const all = graph.things.has(id) ? chainOf(graph, [id]) : new Set([id]);
  const element = tara.elements.find((candidate) => candidate.id === id);
  if (element) addAroundElement(all, graph, tara, element);

  for (const asset of tara.assets) if (all.has(asset.id)) for (const home of asset.elementIds) all.add(home);
  for (const place of tara.controls.find((control) => control.id === id)?.elementIds ?? []) all.add(place);
  for (const path of tara.paths) {
    const covering = tara.controls.filter((control) => control.coveredPathIds.includes(path.id)).map((control) => control.id);
    if (path.id === id) for (const other of [...path.elementIds, ...covering]) all.add(other);
    else if (path.elementIds.includes(id) || covering.includes(id)) all.add(path.id);
  }
  if (element?.boundaryId) all.add(element.boundaryId);
  for (const other of tara.elements) if (other.boundaryId === id) all.add(other.id);
  return all;
}

/** Records to list under one heading of a card. none: what to say when there is none; without it the heading is left out. */
export interface CardSection {
  title: string;
  ids: string[];
  none?: string;
}

/**
 * What the architecture knows about a record besides the links of the graph, as the sections of its card.
 * Nothing for a record the architecture says nothing more about.
 */
export function architectureLinks(graph: Graph, tara: Tara, id: string): CardSection[] {
  const element = tara.elements.find((candidate) => candidate.id === id);
  if (element) {
    const acting = { title: "Controls that act here", ids: placedIn(tara.controls, id).map((control) => control.id) };
    if (element.kind === "data_flow") {
      const carried = placedIn(tara.assets, id).map((asset) => asset.id);
      return [
        { title: "Joins", ids: endsOf(element), none: "Both ends are open." },
        { title: "Assets it carries", ids: carried },
        acting,
      ];
    }
    if (isThing(element)) {
      const flows = flowsAt(tara.elements, id).map((flow) => flow.id);
      return [{ title: "Data flows", ids: flows }, acting];
    }
    const contained = tara.elements.filter((other) => other.boundaryId === id).map((other) => other.id);
    return [{ title: "Contains", ids: contained }, acting];
  }
  // the graph lists the components and stores an asset lives in; a data flow that carries it is not on the graph
  const asset = tara.assets.find((candidate) => candidate.id === id);
  if (asset) return [{ title: "Carried by", ids: asset.elementIds.filter((elementId) => !graph.things.has(elementId)) }];
  const control = tara.controls.find((candidate) => candidate.id === id);
  return control ? [{ title: "Acts in", ids: control.elementIds }] : [];
}
