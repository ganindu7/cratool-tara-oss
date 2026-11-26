// The entry of the screens: which page the address asks for, and who the person says they are.
//
// Addresses: #/ is the list of TARAs; #/tara/<id>/<step>/<record> is one TARA at one step, with one record
// open; what follows a "?" says how the step is shown (?show=diagram, ?show=links). Everything a person can
// look at has an address, so it can be linked to and the back button works.

import { type FormEvent, StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { api, author } from "./api.ts";
import { Home } from "./pages/Home.tsx";
import { Workspace } from "./pages/Workspace.tsx";
import "./styles.css";

/** A part of the address as the text it stands for. One that was typed wrongly ("%" and no number) is taken as it is. */
const decoded = (part: string): string => {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
};

function App() {
  const [hash, setHash] = useState(location.hash);
  const [who, setWho] = useState(author.get());
  /** Set when a proxy in front of the tool says who the person is: then the name is not asked for here. */
  const [givenName, setGivenName] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [version, setVersion] = useState("");

  useEffect(() => {
    const onChange = () => setHash(location.hash);
    addEventListener("hashchange", onChange);
    api
      .installation()
      .then((installation) => {
        setGivenName(installation.author);
        setVersion(installation.version);
      })
      .catch(() => undefined);
    return () => removeEventListener("hashchange", onChange);
  }, []);

  // The address is "#/tara/<id>/<step>/<record>?<how it is shown>": what follows the "?" names what is laid
  // over a drawing or which panel is open, so that such a view can be linked to as well.
  const [path = "", query = ""] = hash.replace(/^#/, "").split("?");
  const [, page, id, step, record] = path.split("/");
  const view = new URLSearchParams(query);
  const setView = (name: string, value: string | null) => {
    const next = new URLSearchParams(query);
    if (value === null) next.delete(name);
    else next.set(name, value);
    location.hash = `#${path}${next.size > 0 ? `?${next}` : ""}`;
  };
  const name = givenName ?? who;
  // Where a proxy says who the person is, the name is not theirs to change here.
  const rename = givenName === null ? () => setAsking(true) : undefined;

  return (
    <>
      {page === "tara" && id ? (
        <Workspace
          key={id}
          taraId={id}
          stepKey={step || "scope"}
          recordId={record ? decoded(record) : null}
          view={view}
          setView={setView}
          who={name}
          onRename={rename}
          version={version}
        />
      ) : (
        <Home who={name} onRename={rename} version={version} />
      )}
      {asking && (
        <NameDialog
          name={who}
          onDone={(next) => {
            if (next !== null) {
              author.set(next);
              setWho(next.trim());
            }
            setAsking(false);
          }}
        />
      )}
    </>
  );
}

/** Asks for the name the person's changes are recorded under. */
function NameDialog({ name, onDone }: { name: string; onDone: (name: string | null) => void }) {
  const [draft, setDraft] = useState(name);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onDone(draft);
  };
  return (
    <div className="dialog-shade">
      <form className="dialog" onSubmit={submit} aria-label="Your name">
        <h2>Who are you?</h2>
        <p>
          Your name is recorded with every change you make, on the reviews you confirm and under what you sign. It is kept in this
          browser. It is a label, not a sign-in: this tool has none of its own.
        </p>
        <label className="field">
          <span className="field-label">Your name</span>
          {/* biome-ignore lint/a11y/noAutofocus: the dialog exists to ask this one thing */}
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="e.g. Ada Example" autoFocus />
        </label>
        <div className="actions">
          <button type="submit" className="primary">
            Use this name
          </button>
          <button type="button" className="link" onClick={() => onDone(null)}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
