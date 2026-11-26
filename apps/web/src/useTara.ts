// One open TARA: loading it, sending changes, and noticing what others changed.

import { type Assessment, assess, type Change, type Tara } from "@tara/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, api, type Changed } from "./api.ts";

/** A TARA as a screen has it open: the document and what follows from it, the way to change it, and what to tell the person. */
export interface OpenTara {
  tara: Tara | null;
  /** Every status and value that follows from the TARA, worked out here with the server's own rule engine. */
  assessment: Assessment | null;
  /** A refusal or another message to show, and whether it is an error or only a note. */
  message: { text: string; kind: "error" | "note" } | null;
  dismiss: () => void;
  saving: boolean;
  /** Sends changes. Resolves to true when they were stored. */
  send: (...changes: Change[]) => Promise<boolean>;
  /** Runs any other request that answers with the changed TARA (an undo, say). */
  run: (request: Promise<Changed>) => Promise<boolean>;
  /** The TARA as it is at the moment of asking, for code that runs after a change was stored. */
  latest: () => Tara | null;
}

const isTyping = () => ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName ?? "");

/**
 * Opens a TARA for a screen: loads it, sends its changes, and every few seconds asks whether someone else has
 * changed it. After a refusal for a conflict it shows the TARA as it now is, with the reason.
 */
export function useTara(id: string): OpenTara {
  const [tara, setTara] = useState<Tara | null>(null);
  const [message, setMessage] = useState<OpenTara["message"]>(null);
  const [saving, setSaving] = useState(false);
  // The latest TARA, for callbacks that must not go stale between two quick changes.
  const latest = useRef<Tara | null>(null);
  latest.current = tara;

  useEffect(() => {
    setTara(null);
    api
      .tara(id)
      .then((answer) => setTara(answer.tara))
      .catch((error: Error) => setMessage({ text: error.message, kind: "error" }));
  }, [id]);

  // Someone else may be working in the same TARA. Every few seconds the page asks whether it has changed,
  // and shows the new state unless this person is in the middle of typing.
  useEffect(() => {
    const tick = setInterval(() => {
      const current = latest.current;
      if (!current || document.visibilityState !== "visible" || isTyping()) return;
      api
        .newerThan(id, current.seq)
        .then((answer) => {
          // An answer that took longer than a change made here in the meantime is about a state the page has left.
          if (answer && latest.current?.seq === current.seq) setTara(answer.tara);
        })
        .catch(() => undefined);
    }, 5000);
    return () => clearInterval(tick);
  }, [id]);

  const run = useCallback(async (request: Promise<Changed>): Promise<boolean> => {
    setSaving(true);
    try {
      const answer = await request;
      latest.current = answer.tara;
      setTara(answer.tara);
      setMessage(answer.notes.length > 0 ? { text: answer.notes.join(" "), kind: "note" } : null);
      return true;
    } catch (error) {
      // After a conflict the server sends the TARA as it now is: show it, with the reason.
      if (error instanceof ApiError && error.tara) setTara(error.tara);
      setMessage({ text: (error as Error).message, kind: "error" });
      return false;
    } finally {
      setSaving(false);
    }
  }, []);

  const send = useCallback(
    (...changes: Change[]) => {
      const current = latest.current;
      if (!current) return Promise.resolve(false);
      return run(api.change(id, changes, current.seq));
    },
    [id, run],
  );

  const assessment = useMemo(() => (tara ? assess(tara) : null), [tara]);
  return { tara, assessment, message, dismiss: () => setMessage(null), saving, send, run, latest: () => latest.current };
}
