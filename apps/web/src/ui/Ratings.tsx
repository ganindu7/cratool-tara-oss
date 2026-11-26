// The ratings of a record, drawn. What the ratings are is worked out in views/ratings.ts; here is how they
// look, in three sizes. As a strip on the record itself, where a view draws its records large, so that records
// can be compared at a glance. In full in the card of the record while it is read, in the order of its form.
// And as what the record is made of, line by line, in the block of its ego view.

import { levelName, type Scores, type Tara } from "@tara/core";
import type { Thing } from "../views/graph.ts";
import {
  type Composition,
  type DrawnMatrix,
  damageRatings,
  type Gauge,
  IMPACT_STEPS,
  pathRatings,
  riskRatings,
  stripOf,
} from "../views/ratings.ts";

/** A rating as so many steps, so many of them filled. More ink is more risk. */
function Meter({ steps, filled, says }: Gauge) {
  return (
    <span className={filled === null ? "meter open" : "meter"} role="img" aria-label={says} title={says}>
      {Array.from({ length: steps }, (_, step) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: the steps of a meter never change places
        <i key={step} className={filled !== null && step < filled ? "on" : undefined} />
      ))}
    </span>
  );
}

/** The matrix of the method with the place of one risk in it, in the colour of its value. */
function Matrix({ matrix }: { matrix: DrawnMatrix }) {
  return (
    <table className="pf-matrix" aria-label="The risk matrix of the method, with the place of this risk">
      <tbody>
        {matrix.rows.map((row) => (
          <tr key={row.name}>
            <th scope="row">{row.name}</th>
            {row.cells.map((cell, column) => (
              <td key={matrix.columns[column]} className={cell.here ? "here" : `wash-${cell.value}`} title={cell.says}>
                {cell.here ? <span className={`risk risk-${cell.value}`}>{cell.value}</span> : cell.value}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td />
          {matrix.columns.map((name) => (
            <th key={name} scope="col">
              {name}
            </th>
          ))}
        </tr>
      </tfoot>
    </table>
  );
}

/** The room the strip takes beneath the text of a record: what a placing reserves for it, and the height it is given. */
export const STRIP_HEIGHT = 20;

/** The ratings of a record as one line on the record itself. Nothing for a record that has none. */
export function RatingStrip({ tara, scores, thing }: { tara: Tara; scores: Scores; thing: Thing }) {
  const strip = stripOf(tara, scores, thing.kind, thing.id);
  if (!strip) return null;
  return (
    <span className="pf-strip" style={{ height: STRIP_HEIGHT }}>
      {strip.lost && (
        <span className="pf-lost" role="img" aria-label={strip.lostSays} title={strip.lostSays}>
          {strip.lost.map((property) => (
            <i key={property.letter} className={property.on ? "on" : undefined}>
              {property.letter}
            </i>
          ))}
        </span>
      )}
      {/* among several, the one that decides the result stands out */}
      {strip.meters.map((meter) => (
        <span key={meter.label} className={meter.sets ? "pf-rated sets" : "pf-rated"} title={meter.says}>
          {meter.label}
          <Meter {...meter} />
        </span>
      ))}
      {strip.note && <span>{strip.note}</span>}
    </span>
  );
}

/** The height of one line of the block, of the matrix, and of the room around them. */
const PART = 17;
const MATRIX = 112;
const AROUND = 12;

/** The room that what a record is made of takes in the block of its ego view: what a placing reserves for it. */
export function compositionHeight(made: Composition): number {
  if (made.parts.length === 0 && !made.matrix) return 0;
  return AROUND + made.parts.length * PART + (made.matrix ? MATRIX : 0);
}

/** What a record is made of, line by line: its name, its value drawn where it is a rating, the value in words, its points. */
export function CompositionBlock({ made }: { made: Composition }) {
  const height = compositionHeight(made);
  if (height === 0) return null;
  return (
    <span className="pf-block" style={{ height }}>
      <span className="pf-parts" style={{ gridAutoRows: PART }}>
        {made.parts.map((part) => {
          const says = part.meter?.says ?? `${part.name}: ${part.words ?? ""}`;
          return (
            <span key={part.name} className={part.sets ? "pf-part sets" : "pf-part"}>
              <span className="pf-part-name" title={says}>
                {part.name}
              </span>
              <span className="pf-part-drawn">
                {part.lost && (
                  <span className="pf-lost">
                    {part.lost.map((property) => (
                      <i key={property.letter} className={property.on ? "on" : undefined}>
                        {property.letter}
                      </i>
                    ))}
                  </span>
                )}
                {part.meter && <Meter {...part.meter} />}
              </span>
              <span className="pf-part-words" title={says}>
                {part.words}
              </span>
              <span className="pf-part-points">{part.points ?? ""}</span>
            </span>
          );
        })}
      </span>
      {made.matrix && <Matrix matrix={made.matrix} />}
    </span>
  );
}

interface FullProps {
  tara: Tara;
  scores: Scores;
  thing: Thing;
}

/** Every rating of a record with its name and its words, as the sections of its card. Nothing for a record that has none. */
export function Ratings({ tara, scores, thing }: FullProps) {
  if (thing.kind === "damages") return <DamageRatings tara={tara} scores={scores} id={thing.id} />;
  if (thing.kind === "paths") return <PathRatings tara={tara} scores={scores} id={thing.id} />;
  if (thing.kind === "risks") return <RiskRatings tara={tara} scores={scores} id={thing.id} />;
  return null;
}

interface OfRecord {
  tara: Tara;
  scores: Scores;
  id: string;
}

function DamageRatings({ tara, scores, id }: OfRecord) {
  const ratings = damageRatings(tara, scores, id);
  if (!ratings) return null;
  return (
    <>
      <section>
        <h3>Security property lost</h3>
        <p className="pf-lost full">
          {ratings.lost.map((property) => (
            <span key={property.letter} className={property.on ? "on" : undefined}>
              <i className={property.on ? "on" : undefined}>{property.letter}</i>
              {property.name}
            </span>
          ))}
        </p>
        {ratings.lost.every((property) => !property.on) && <p className="muted">None is marked yet.</p>}
      </section>
      <section>
        <h3>Impact rating</h3>
        <ul className="pf-rows">
          {ratings.rated.map((category) => {
            // a rating is named by its code and level, with what that means beneath: "S3 Severe", "life is in danger"
            const [head, ...rest] = (category.label ?? "").split(": ");
            return (
              <li key={category.key} className={category.sets ? "sets" : undefined}>
                <span>{category.name}</span>
                <Meter steps={IMPACT_STEPS} filled={category.level} says={category.says} />
                {category.label ? (
                  <span className="pf-words">
                    <b>{head}</b>
                    {rest.length > 0 && <small>{rest.join(": ")}</small>}
                  </span>
                ) : (
                  <span className="muted">Not rated yet</span>
                )}
              </li>
            );
          })}
        </ul>
        <p className="muted">
          {ratings.impact !== null ? (
            <>
              The highest rating is the impact of the scenario: <b>{levelName(tara.method, ratings.impact)}</b>.
            </>
          ) : (
            "The impact follows once every category is rated."
          )}
        </p>
      </section>
      {ratings.rationale && (
        <section>
          <h3>Impact rationale</h3>
          <p className="map-more">{ratings.rationale}</p>
        </section>
      )}
    </>
  );
}

function PathRatings({ tara, scores, id }: OfRecord) {
  const ratings = pathRatings(tara, scores, id);
  if (!ratings) return null;
  return (
    <>
      <section>
        <h3>Attack potential needed</h3>
        {ratings.screened ? (
          <p className="muted">Screened out: it does not count towards the risk, and is not rated.</p>
        ) : (
          <>
            <ul className="pf-rows pf-points">
              {ratings.factors.map((factor) => (
                <li key={factor.key}>
                  <span>{factor.name}</span>
                  <span>{factor.option ?? <span className="muted">Not chosen yet</span>}</span>
                  <b>{factor.points ?? ""}</b>
                </li>
              ))}
            </ul>
            <p className="pf-sum">
              <span>Together</span>
              <b>{ratings.points ?? <span className="muted">not rated yet</span>}</b>
            </p>
            {/* where the points fall: the fewer an attack needs, the more feasible it is */}
            <ol className="pf-scale" aria-label={ratings.says}>
              {ratings.bands.map((band) => (
                <li key={band.key} className={band.on ? "on" : undefined}>
                  <b>{band.name}</b>
                  <span>{band.range}</span>
                </li>
              ))}
            </ol>
            <p className="muted">
              {ratings.feasibility ? (
                <>
                  With {ratings.points} points the feasibility is <b>{ratings.bands.find((band) => band.on)?.name}</b>.
                </>
              ) : (
                "The feasibility follows once every factor is chosen."
              )}
            </p>
          </>
        )}
      </section>
      {ratings.rationale && (
        <section>
          <h3>{ratings.screened ? "Why it is screened out" : "Feasibility rationale"}</h3>
          <p className="map-more">{ratings.rationale}</p>
        </section>
      )}
    </>
  );
}

function RiskRatings({ tara, scores, id }: OfRecord) {
  const ratings = riskRatings(tara, scores, id);
  if (!ratings) return null;
  const rows = [
    { name: "Impact", steps: IMPACT_STEPS, ...ratings.impact },
    { name: "Feasibility", steps: ratings.matrix.columns.length, ...ratings.feasibility },
  ];
  return (
    <section>
      <h3>How its value comes about</h3>
      <ul className="pf-rows">
        {rows.map((row) => (
          <li key={row.name}>
            <span>{row.name}</span>
            <Meter steps={row.steps} filled={row.filled} says={row.says} />
            <span className={row.filled === null ? "muted" : undefined}>{row.words}</span>
          </li>
        ))}
      </ul>
      <Matrix matrix={ratings.matrix} />
      <p className="muted">
        The highest impact of the damage scenarios it leads to, and the most feasible attack path that counts.
        {ratings.value === null && " The value follows once both are rated."}
      </p>
    </section>
  );
}
