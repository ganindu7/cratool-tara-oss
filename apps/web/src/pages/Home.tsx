// The start page: the TARAs of this installation, starting a new one, the training examples, and taking
// in a TARA from a file.

import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api, type ImportPlan, type Installation, type TaraSummary } from "../api.ts";
import { Brand } from "../ui/Brand.tsx";

const day = (iso: string) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "";

/** What each example is and what it is there to teach. */
const EXAMPLE_NOTES: Record<string, { product: string; lesson: string }> = {
  kettle: {
    product: "A kettle you can switch on from your phone",
    lesson: "How a risk value comes about. Five risks that land on the five values, each for a different reason. Start here.",
  },
  "door-lock": {
    product: "A smart door lock",
    lesson:
      "What a TARA of an ordinary connected product looks like, from the design as first built to the controls it asked for.",
  },
  gateway: {
    product: "A remote service gateway for a machine",
    lesson:
      "A product in someone else's plant: two trust boundaries, a risk to people, a risk that is shared, and controls that are procedures.",
  },
};

export function Home({ who, onRename, version }: { who: string; onRename: () => void; version: string }) {
  const [taras, setTaras] = useState<TaraSummary[] | null>(null);
  const [installation, setInstallation] = useState<Installation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [product, setProduct] = useState("");
  const [documentNumber, setDocumentNumber] = useState("");
  const [methodId, setMethodId] = useState("");
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<TaraSummary | null>(null);
  const [typed, setTyped] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  /** A file that was read and not yet taken in, with what taking it in would do. */
  const [incoming, setIncoming] = useState<{ fileName: string; document: unknown; plan: ImportPlan } | null>(null);

  // Reads the list of TARAs and what this installation offers. `useCallback` keeps it the same function from
  // one drawing of the page to the next, so that the effect below runs once.
  const refresh = useCallback(
    () =>
      Promise.all([api.taras(), api.installation()])
        .then(([list, inst]) => {
          setTaras(list);
          setInstallation(inst);
          setMethodId((current) => current || (inst.methods[0]?.id ?? ""));
        })
        .catch((e: Error) => setError(e.message)),
    [],
  );
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const attempt = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (e) {
      const problems = e instanceof ApiError && e.problems.length > 0 ? ` ${e.problems.slice(0, 5).join(" ")}` : "";
      setError(`${(e as Error).message}${problems}`);
    } finally {
      setBusy(false);
    }
  };
  const create = (event: FormEvent) => {
    event.preventDefault();
    void attempt(async () => {
      const made = await api.create({ title, product, documentNumber, methodId });
      location.hash = `#/tara/${made.tara.id}/scope`;
    });
  };
  // An example opens at its guide: the document that says how to read it and what to try.
  const openExample = (name: string, guide: string | null) =>
    attempt(async () => {
      const loaded = await api.loadExample(name);
      location.hash = guide ? `#/tara/${loaded.id}/references/${guide}` : `#/tara/${loaded.id}/scope`;
    });
  // Taking in a file is two steps: it is read and what it would bring is shown; then the person decides.
  const lookAt = (file: File | undefined) =>
    file &&
    attempt(async () => {
      let document: unknown;
      try {
        document = JSON.parse(await file.text());
      } catch {
        throw new Error("The file is not readable as JSON.");
      }
      setIncoming({ fileName: file.name, document, plan: await api.checkImport(document) });
    });
  const takeIn = () =>
    incoming &&
    attempt(async () => {
      const made = await api.importDocument(incoming.document, incoming.fileName);
      location.hash = `#/tara/${made.tara.id}/scope`;
    });
  const forget = () => {
    setIncoming(null);
    if (fileInput.current) fileInput.current.value = "";
  };
  const remove = (event: FormEvent) => {
    event.preventDefault();
    if (!removing) return;
    void attempt(async () => {
      await api.remove(removing.id, typed);
      setRemoving(null);
      await refresh();
    });
  };

  /** The products that have a TARA here, and the one the typed name means, whatever its capitals. */
  const products = [...new Set((taras ?? []).map((t) => t.product).filter((name): name is string => name !== null))].sort();
  const sameProduct = products.find((name) => name.toLowerCase() === product.trim().toLowerCase() && name !== product.trim());

  const byProduct = new Map<string, TaraSummary[]>();
  for (const tara of taras ?? []) {
    const key = tara.product ?? "No product named";
    byProduct.set(key, [...(byProduct.get(key) ?? []), tara]);
  }

  return (
    <div className="home">
      <header className="topbar">
        <Brand version={version} />
        <span className="doc">
          <span className="doc-title">Threat analysis and risk assessment</span>
        </span>
        <button type="button" className="who" onClick={onRename} title="The name your changes are recorded under">
          {who || "Say who you are"}
        </button>
      </header>

      <main className="home-main">
        <section className="home-new" aria-labelledby="new-heading">
          <h1 id="new-heading">Start a TARA</h1>
          <p className="lede">
            A new TARA opens with the scoring method, the scope questions and the 21 essential requirements of the Cyber
            Resilience Act in place. You work through it step by step; the report is there from the first entry.
          </p>
          <form onSubmit={create} className="new-form">
            <label className="field">
              Title of the assessment
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Smart thermostat T1, software release 2.4"
                required
              />
            </label>
            <label className="field">
              Product
              <input
                value={product}
                onChange={(e) => setProduct(e.target.value)}
                placeholder="e.g. Smart thermostat T1"
                list="products-here"
              />
              {/* The products that have a TARA here are offered: a new TARA of one of them is listed with the others. */}
              <datalist id="products-here">
                {products.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
              {sameProduct && (
                <span className="help">A product called "{sameProduct}" is here already. The TARA is added to it.</span>
              )}
            </label>
            <label className="field">
              Document number
              <input value={documentNumber} onChange={(e) => setDocumentNumber(e.target.value)} placeholder="optional" />
            </label>
            {(installation?.methods.length ?? 0) > 1 && (
              <label className="field">
                Scoring method
                <select value={methodId} onChange={(e) => setMethodId(e.target.value)}>
                  {installation?.methods.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="row">
              <button type="submit" className="primary" disabled={busy || !title.trim()}>
                Create the TARA
              </button>
              <button type="button" onClick={() => fileInput.current?.click()} disabled={busy}>
                Take one in from a file
              </button>
              <input
                ref={fileInput}
                type="file"
                accept="application/json,.json"
                hidden
                onChange={(e) => lookAt(e.target.files?.[0])}
              />
            </div>
          </form>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {incoming && (
            <div className="add-form import-plan">
              <h2>Take in {incoming.fileName}?</h2>
              <p>
                It comes in as "{incoming.plan.title}"{incoming.plan.documentNumber ? `, ${incoming.plan.documentNumber}` : ""},
                revision {incoming.plan.revision}: a new draft that nobody has signed. It holds{" "}
                {incoming.plan.holds.join(", ") || "no records yet"}.
              </p>
              {incoming.plan.notes.length > 0 && (
                <ul className="needs">
                  {incoming.plan.notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              )}
              <p className="help">
                Nothing that is here is replaced or changed. Every value is worked out anew from the records.
              </p>
              <div className="row">
                <button type="button" className="primary" disabled={busy} onClick={takeIn}>
                  Take it in as a new draft
                </button>
                <button type="button" className="link" onClick={forget}>
                  Leave it
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="home-list" aria-labelledby="list-heading">
          <h2 id="list-heading">Your TARAs</h2>
          {taras === null && !error && <p className="muted">Loading…</p>}
          {taras?.length === 0 && (
            <p className="muted">
              None yet. The first one you create appears here. To see a finished one first, open an example below.
            </p>
          )}
          {[...byProduct].map(([name, list]) => (
            <div key={name} className="product-group">
              <h3>{name}</h3>
              <ul>
                {list.map((t) => (
                  <li key={t.id} className="tara-row">
                    {t.problem ? (
                      <div className="tara-open">
                        <span className="tara-title">{t.id}</span>
                        <span className="error">
                          This document cannot be read as a TARA. {t.problem.split("\n").slice(0, 3).join(" ")}
                        </span>
                      </div>
                    ) : (
                      <a className="tara-open" href={`#/tara/${t.id}/scope`}>
                        <span className="tara-title">{t.title}</span>
                        <span className="tara-meta">
                          {[
                            t.documentNumber,
                            `Revision ${t.revision}`,
                            t.status === "released" ? "Released" : "Draft",
                            t.example ? "Training example" : null,
                          ]
                            .filter(Boolean)
                            .join(", ")}
                        </span>
                      </a>
                    )}
                    <span className="tara-counts">
                      {t.problem ? "" : `${t.counts.risks} risks, ${t.counts.controls} controls`}
                    </span>
                    <span className="tara-date">{day(t.updatedAt)}</span>
                    <button
                      type="button"
                      className="link"
                      onClick={() => {
                        setRemoving(t);
                        setTyped("");
                      }}
                    >
                      Remove
                    </button>
                    {removing?.id === t.id && (
                      <form className="remove-confirm" onSubmit={remove}>
                        <p>
                          Remove "{t.title}"? It leaves this list and is moved to the trash folder of the data folder, with its
                          history. To confirm, type its title.
                        </p>
                        <input
                          value={typed}
                          onChange={(e) => setTyped(e.target.value)}
                          placeholder={t.title}
                          aria-label="Title, to confirm"
                        />
                        <div className="row">
                          <button type="submit" className="danger" disabled={busy || typed.trim() !== t.title.trim()}>
                            Remove it
                          </button>
                          <button type="button" className="link" onClick={() => setRemoving(null)}>
                            Keep it
                          </button>
                        </div>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        <section className="home-list" aria-labelledby="examples-heading">
          <h2 id="examples-heading">Learn from an example</h2>
          <p className="lede">
            Three complete assessments of invented products. Every record is filled in and every check is settled, so you can
            change something and watch what reacts.
          </p>
          <ol className="examples">
            {installation?.examples.map((example) => (
              <li key={example.name}>
                <div>
                  <h3>{EXAMPLE_NOTES[example.name]?.product ?? example.title}</h3>
                  <p>{EXAMPLE_NOTES[example.name]?.lesson}</p>
                </div>
                <button type="button" disabled={busy} onClick={() => openExample(example.name, example.guide)}>
                  {example.loaded ? "Open" : "Load and open"}
                </button>
              </li>
            ))}
          </ol>
        </section>

        <footer className="home-foot">
          <p>
            TARA workbench {installation?.version}. Open source under the Apache License 2.0. Everything you enter stays in the
            data folder of this installation; the tool sends nothing anywhere.
          </p>
        </footer>
      </main>
    </div>
  );
}
