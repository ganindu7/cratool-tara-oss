# 0006: The scoring method is data

## Decided

How impact, attack feasibility and risk are rated is a JSON file, not code. Every TARA carries its own copy. The rule engine reads the criteria, the points, the bands and the matrix from the TARA it is working on. Records refer to the method by stable keys (`expert`, level `2`), never by the words shown to people.

## Why

- **Organisations differ.** Many have their own criteria for what "severe" means, approved by someone. They should not have to change code to use them.
- **An old assessment must not change.** With its own copy of the method, a TARA gives the same values in ten years, whatever the default has become.
- **Wording can improve.** Because records hold keys, a method can be reworded without touching a single record.
- **The method that ships had to be free to share.** The Open TARA method 1.0 was built from sources that allow reuse, and names them, so that the tool carries no licensed text.

## What it costs

- The shape of a method is fixed: four impact categories at four levels, five factors, four feasibility ratings, risk values 1 to 5. The records depend on it. A method of another shape would need a new version of the document format.
- A method is validated before it is accepted, so that a mistake in a file, such as a band that leaves a gap, cannot produce wrong values quietly.
