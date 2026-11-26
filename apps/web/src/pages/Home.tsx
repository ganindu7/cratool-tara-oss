// The start page: the TARAs of this installation, starting a new one, the training examples, and taking
// in a TARA from a file.

import { firstFew } from "@tara/core";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api, type ImportPlan, type Installation, type TaraSummary } from "../api.ts";
import { Brand } from "../ui/Brand.tsx";
import { WhoAmI } from "../ui/WhoAmI.tsx";

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

interface Props {
  /** The name the person goes by, and how to change it; no way to change it where a proxy says who the person is. */
  who: string;
  onRename: (() => void) | undefined;
  version: string;
}

/** The start page. The TARAs are listed by product; to remove one, its title is typed, so that none is removed by a slip. */
export function Home({ who, onRename, version }: Props) {
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
      const problems = e instanceof ApiError && e.problems.length > 0 ? ` ${firstFew(e.problems, 5)}` : "";
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
      <header className="masthead">
        <Brand version={version} />
        <span className="masthead-title">Threat analysis and risk assessment</span>
        <span className="masthead-actions">
          <WhoAmI who={who} onRename={onRename} />
        </span>
      </header>

      <main className="home-main">
        {/* the left column: starting a TARA, and taking one in from a file */}
        <div className="home-start">
          <section aria-labelledby="new-heading">
            <h1 id="new-heading">Start a TARA</h1>
            <p className="lede">
              A new TARA opens with the scoring method, the scope questions and the 21 essential requirements of the Cyber
              Resilience Act in place. You work through it step by step; the report is there from the first entry.
            </p>
            <form onSubmit={create} className="new-form">
              <label className="field">
                <span className="field-label">Title of the assessment</span>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Smart thermostat T1, software release 2.4"
                  required
                />
              </label>
              <label className="field">
                <span className="field-label">Product</span>
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
                <span className="field-label">Document number</span>
                <input value={documentNumber} onChange={(e) => setDocumentNumber(e.target.value)} placeholder="optional" />
              </label>
              {(installation?.methods.length ?? 0) > 1 && (
                <label className="field">
                  <span className="field-label">Scoring method</span>
                  <select value={methodId} onChange={(e) => setMethodId(e.target.value)}>
                    {installation?.methods.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <button type="submit" className="primary" disabled={busy || !title.trim()}>
                Create the TARA
              </button>
            </form>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
          </section>

          <section className="home-import" aria-labelledby="import-heading">
            <h2 id="import-heading">Take in a TARA from a file</h2>
            <p className="lede">
              A file that this tool exported (a .tara.json). It is read first, and what it would bring is shown before anything is
              stored.
            </p>
            <label className="field import-file">
              <span className="field-label">The file</span>
              <input
                ref={fileInput}
                type="file"
                accept="application/json,.json"
                disabled={busy}
                onChange={(e) => lookAt(e.target.files?.[0])}
              />
            </label>
            {incoming && (
              <div className="new-record import-plan">
                <h3>Take in {incoming.fileName}?</h3>
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
                <div className="actions">
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
        </div>

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
                  <li key={t.id} className="tara-card">
                    {t.problem ? (
                      <div className="tara-open">
                        <span className="tara-title">{t.id}</span>
                        <span className="error">
                          This document cannot be read as a TARA. {firstFew(t.problem.split("\n"), 3)}
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
                    <span className="tara-date">
                      {t.problem ? "" : `${t.counts.risks} risks, ${t.counts.controls} controls, `}
                      {day(t.updatedAt)}
                    </span>
                    <button
                      type="button"
                      className="link tara-delete"
                      onClick={() => {
                        setRemoving(t);
                        setTyped("");
                      }}
                    >
                      Remove
                    </button>
                    {removing?.id === t.id && (
                      <form className="confirm delete-tara" onSubmit={remove}>
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
                        <div className="actions">
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

        <section className="home-list home-examples" aria-labelledby="examples-heading">
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
            Open TARA workbench {installation?.version}. Open source under the Apache License 2.0. Everything you enter stays in
            the data folder of this installation; the tool sends nothing anywhere.
          </p>
        </footer>
      </main>
    </div>
  );
}
