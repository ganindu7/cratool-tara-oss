// What a person does on the diagram besides arranging it: putting an asset or a control into an element,
// putting an element on a route, and doing either without dragging. Every such change is sent like any other,
// so it is in the history. It is also noted here, so that the diagram can offer to take back what was just done.

import type { Tara } from "@tara/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api.ts";
import type { OpenTara } from "../useTara.ts";
import { homesOf, type Placed, whatWasDone } from "./held.ts";
import type { Carried } from "./shapes.tsx";

/** Something done on the diagram: what, in words, and the number of the change in the history. */
export interface DoneNote {
  text: string;
  seq: number;
}

/** Placing on the diagram, as the page uses it: the way to place a record, and the notes that let the latest be taken back. */
export interface Moves {
  /** What was done on the diagram since it was opened, the latest last. */
  done: DoneNote[];
  /** Says which elements an asset lives in, a control acts in, or a route passes. */
  place: (kind: Placed, id: string, next: string[]) => Promise<void>;
  /** Takes back the latest, through the history: the undoing is itself a change, and nothing is lost. */
  undo: () => Promise<void>;
  /** Hides the note. What was done stays. */
  hide: () => void;
}

/** How many notes are kept: enough to walk back through a session of placing. */
const KEPT = 20;

/** Places assets, controls and routes on the open TARA, and keeps the notes of what was done. */
export function useMoves(open: OpenTara, tara: Tara): Moves {
  const [done, setDone] = useState<DoneNote[]>([]);
  const place = async (kind: Placed, id: string, next: string[]) => {
    const text = whatWasDone(kind, id, homesOf(tara, kind, id), next);
    if (text === null) return;
    if (!(await open.send({ op: "set", kind, id, values: { elementIds: next } }))) return;
    const seq = open.latest()?.seq;
    if (seq !== undefined) setDone((notes) => [...notes.slice(1 - KEPT), { text, seq }]);
  };
  const undo = async () => {
    const last = done.at(-1);
    if (last && (await open.run(api.undo(tara.id, last.seq)))) setDone((notes) => notes.slice(0, -1));
  };
  return { done, place, undo, hide: () => setDone([]) };
}

/** A row with the place on the screen where it is shown. */
export type Offered = Carried & { at: DOMRect };

/** How far placing without dragging has come: the row an offer is shown for, the row being placed, and the steps between. */
export interface PlacingByChoice {
  /** The row the pointer rests on: the offer to place it is shown beside it. */
  offered: Offered | null;
  /** The row being placed: the next element chosen is where it goes. */
  placing: Carried | null;
  /** The pointer is over a row, or has left it. */
  offer: (row: Carried, at: DOMRect | null) => void;
  /** The pointer has reached the offer itself, or left it. */
  hold: (held: boolean) => void;
  begin: (row: Carried) => void;
  end: () => void;
}

/** How long the offer stays after the pointer leaves its row: time to reach it. */
const LINGER = 350;

/**
 * Placing without dragging, for those who cannot drag or would rather not: point at a row, accept the offer,
 * then choose where it goes. Escape ends it with nothing changed.
 */
export function usePlacingByChoice(): PlacingByChoice {
  const [offered, setOffered] = useState<Offered | null>(null);
  const [placing, setPlacing] = useState<Carried | null>(null);
  const leaving = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stay = useCallback(() => {
    if (leaving.current) clearTimeout(leaving.current);
  }, []);
  const leave = useCallback(() => {
    stay();
    leaving.current = setTimeout(() => setOffered(null), LINGER);
  }, [stay]);
  const offer = useCallback(
    (row: Carried, at: DOMRect | null) => {
      if (at === null) return leave();
      stay();
      setOffered({ ...row, at });
    },
    [stay, leave],
  );

  useEffect(() => {
    if (!placing) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPlacing(null);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [placing]);

  const begin = (row: Carried) => {
    setPlacing({ kind: row.kind, id: row.id, from: row.from });
    setOffered(null);
  };
  return { offered, placing, offer, hold: (held) => (held ? stay() : leave()), begin, end: () => setPlacing(null) };
}
