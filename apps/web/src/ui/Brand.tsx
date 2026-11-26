// The word mark of the tool, with its version beside it. It stands in the top bar of every page, so the
// version is always in sight: the first thing asked when something behaves unexpectedly.

/** href: where the mark leads; without it the mark is not a link (the start page, which is where it would lead). */
export function Brand({ version, href }: { version: string; href?: string }) {
  const mark = (
    <>
      Open <b>TARA</b> workbench
    </>
  );
  return (
    <span className="brand-with-version">
      {href ? (
        <a className="brand" href={href} title="All TARAs">
          {mark}
        </a>
      ) : (
        <span className="brand">{mark}</span>
      )}
      {version && (
        <span className="brand-version" title={`Version ${version} of the tool`}>
          {version}
        </span>
      )}
    </span>
  );
}
