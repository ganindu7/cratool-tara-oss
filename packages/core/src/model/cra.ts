// The essential requirements of the Cyber Resilience Act: Regulation (EU) 2024/2847, Annex I.
//
// The summaries are one-line reminders written for this tool. They are not the legal text: the regulation
// itself is authoritative (https://eur-lex.europa.eu/eli/reg/2024/2847/oj).

/** One essential requirement of CRA Annex I, as the tool lists it, with a one-line reminder of what it asks. */
export interface CraRequirement {
  /** "a" to "m" for Annex I Part I(2); "II(1)" to "II(8)" for Part II. */
  key: string;
  /** The ID of the requirement's decision record in a TARA. */
  id: string;
  /** I: properties of the product. II: how its vulnerabilities are handled. */
  part: "I" | "II";
  summary: string;
}

const PART_ONE: [key: string, summary: string][] = [
  ["a", "No known exploitable vulnerabilities when made available on the market"],
  ["b", "Secure by default configuration, with the possibility to reset to the original state"],
  [
    "c",
    "Vulnerabilities can be addressed through security updates, automatic where applicable, with user notification and opt-out",
  ],
  [
    "d",
    "Protection from unauthorised access (authentication, identity or access management); reporting of possible unauthorised access",
  ],
  ["e", "Confidentiality of stored, transmitted or processed data, such as by encryption at rest or in transit"],
  ["f", "Integrity of data, commands, programs and configuration against unauthorised modification; reporting of corruptions"],
  ["g", "Data minimisation: process only data that are adequate, relevant and necessary for the intended purpose"],
  ["h", "Availability of essential and basic functions, also after an incident, including resilience against denial of service"],
  ["i", "Minimise the negative impact on the availability of services provided by other devices or networks"],
  ["j", "Limit attack surfaces, including external interfaces"],
  ["k", "Reduce the impact of an incident using exploitation mitigation mechanisms and techniques"],
  ["l", "Security-related information by recording and monitoring relevant internal activity, with a user opt-out"],
  ["m", "Users can securely and permanently remove all data and settings, and transfer data securely"],
];

const PART_TWO: [key: string, summary: string][] = [
  ["II(1)", "Identify and document vulnerabilities and components, including a software bill of materials"],
  ["II(2)", "Address and remediate vulnerabilities without delay, including by security updates"],
  ["II(3)", "Effective and regular tests and reviews of the product's security"],
  ["II(4)", "Share and publicly disclose information about fixed vulnerabilities once an update is available"],
  ["II(5)", "A policy on coordinated vulnerability disclosure, put in place and enforced"],
  ["II(6)", "Facilitate the sharing of information about potential vulnerabilities, including a contact address for reports"],
  ["II(7)", "Mechanisms to securely distribute updates so that vulnerabilities are fixed or mitigated in time"],
  ["II(8)", "Security updates disseminated without delay and free of charge, with advisory messages for users"],
];

/** "a" gives "CRA-a"; "II(3)" gives "CRA-II-3". */
export const craDecisionId = (requirementKey: string): string => `CRA-${requirementKey.replace(/\((\d+)\)/, "-$1")}`;

/** All 21 requirements, in the order of the regulation. */
export const CRA_REQUIREMENTS: readonly CraRequirement[] = [
  ...PART_ONE.map(([key, summary]) => ({ key, id: craDecisionId(key), part: "I" as const, summary })),
  ...PART_TWO.map(([key, summary]) => ({ key, id: craDecisionId(key), part: "II" as const, summary })),
];

/** The letters a control can be tagged with: the requirements of Part I(2). */
export const CRA_TAGS: readonly string[] = PART_ONE.map(([key]) => key);

/** The one-line reminder of a requirement, by its key. Empty for a key that names no requirement. */
export const craSummary = (requirementKey: string): string =>
  CRA_REQUIREMENTS.find((r) => r.key === requirementKey)?.summary ?? "";
