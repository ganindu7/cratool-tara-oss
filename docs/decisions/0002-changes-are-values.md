# 0002: One way to change a TARA

## Decided

Every edit is a small value, a change (`{ "op": "set", "kind": "paths", "id": "AP002", "values": { … } }`), applied by one pure function, `applyChanges`. The function never modifies the TARA it is given. It works on a copy, validates the copy as a whole, and returns it or refuses with a reason. The store then works out what differs between the old and the new document, the delta, and keeps that as the history.

## Why

- **Safety of the data.** With one door, there is one place to read to know everything that can happen to a TARA, and one place to test. A change that does not fit is refused before anything is written, however many changes were sent together.
- **The screens cannot corrupt anything.** They hold no data and send only changes. A fault in a screen can at worst send a change that is refused.
- **The history is right by construction.** The delta is worked out by comparing two documents, not written by the code that made the change, so it cannot leave something out.
- **Undo, conflicts and audit come from the same thing.** Undo applies a delta backwards. Two people conflict when their deltas name the same place. The audit trail is the list of deltas.
- **The same change works everywhere**: from the screen, over the API, in a test, in a script.

## What it costs

- A change copies the document. For documents of this size that is not noticeable.
- Undo is per change, not per keystroke, and an undo is refused when the same place was changed again afterwards. That is deliberate: it never silently discards someone's later work.
