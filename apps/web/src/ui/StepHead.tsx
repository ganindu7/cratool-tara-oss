// The head of a step: its title, what the step is for, and at the right what can be done from it
// (how it is shown, adding a record). Every step has one, so that every page begins the same way.

import type { ReactNode } from "react";

/** The head of a step: its title and what the step is for. children: what can be done from it, shown at the right. */
export function StepHead({ title, intro, children }: { title: string; intro: string; children?: ReactNode }) {
  return (
    <div className="step-head">
      <div>
        <h1>{title}</h1>
        <p className="lede">{intro}</p>
      </div>
      {children}
    </div>
  );
}

/** One way of showing a step among a few: the one in force is filled. Each way has an address, so it is a link. */
export function Ways({ label, ways }: { label: string; ways: { name: string; href: string; on: boolean; title: string }[] }) {
  return (
    <nav className="ways view-choice" aria-label={label}>
      {ways.map((way) => (
        <a
          key={way.name}
          className={way.on ? "way way-on" : "way"}
          href={way.href}
          title={way.title}
          aria-current={way.on ? "page" : undefined}
        >
          {way.name}
        </a>
      ))}
    </nav>
  );
}
