// Who is at work: the name changes are recorded under, at the right of every ribbon. It is a label, not a
// sign-in. Where a proxy in front of the tool says who the person is, the name cannot be changed here.

/** The person's name in the ribbon, "Unnamed" while none is given, with a button to give or change it where that can be done. */
export function WhoAmI({ who, onRename }: { who: string; onRename: (() => void) | undefined }) {
  return (
    <span className="whoami">
      <span className="whoami-name">{who || "Unnamed"}</span>
      {onRename && (
        <button type="button" className="whoami-change" title="The name your changes are recorded under" onClick={onRename}>
          {who ? "Change" : "Say who you are"}
        </button>
      )}
    </span>
  );
}
