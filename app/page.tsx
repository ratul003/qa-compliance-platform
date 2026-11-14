"use client";

import React from "react";
import type { ReactNode } from "react";

// ─── Primitives ──────────────────────────────────────────────────────────────

function Label({ children }: { children: ReactNode }) {
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: "8px",
      fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase",
      letterSpacing: "0.15em", color: "var(--accent)", marginBottom: "14px",
    }}>
      <span style={{
        width: "6px", height: "6px", borderRadius: "50%",
        background: "var(--accent)", display: "inline-block",
        boxShadow: "0 0 6px var(--accent-glow)",
      }} />
      {children}
    </div>
  );
}

function Heading({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h2 className={className} style={{
      fontSize: "clamp(1.5rem, 3vw, 2.2rem)", fontWeight: 800,
      letterSpacing: "-0.03em", lineHeight: 1.2, marginBottom: "16px",
    }}>
      {children}
    </h2>
  );
}

function Body({ children }: { children: ReactNode }) {
  return (
    <p style={{ fontSize: "1rem", color: "var(--foreground-muted)", lineHeight: 1.8, maxWidth: "640px" }}>
      {children}
    </p>
  );
}

function Tag({ children, color }: { children: ReactNode; color?: string }) {
  return (
    <span style={{
      display: "inline-block",
      background: color ? `${color}15` : "var(--surface-elevated)",
      border: `1px solid ${color ? `${color}30` : "var(--border)"}`,
      borderRadius: "6px", padding: "3px 11px", fontSize: "0.77rem",
      color: color ?? "var(--foreground-muted)", fontWeight: 500,
      marginTop: "8px", marginRight: "6px",
    }}>
      {children}
    </span>
  );
}

const A = "#84cc16";

// ─── Scoring engine ──────────────────────────────────────────────────────────
// The same rules as the production tool, run on a synthetic scorecard.

type Ans = "yes" | "no" | "na";
type Kind = "dpa" | "financial" | "missold";
type Q = { id: string; text: string; weight: number; autoFail?: boolean; kind?: Kind };
type Sec = { id: string; name: string; note: string; auto: boolean; threshold: number; questions: Q[] };
type Rules = "core" | "dpa" | "critical";

const SECTIONS: Sec[] = [
  {
    id: "call", name: "Call scorecard", note: "Fixed weights, passes at 80%", auto: false, threshold: 80,
    questions: [
      { id: "c1", text: "Call opened and introduced correctly", weight: 10 },
      { id: "c2", text: "Recording notice given and data protection check passed", weight: 10, kind: "dpa" },
      { id: "c3", text: "Customer and address details confirmed", weight: 15 },
      { id: "c4", text: "Needs established before a product was recommended", weight: 15 },
      { id: "c5", text: "Products described accurately", weight: 20 },
      { id: "c6", text: "Next steps and confirmation explained", weight: 15 },
      { id: "c7", text: "Call closed correctly", weight: 15 },
      { id: "c8", text: "Service missold (Yes is the fail)", weight: 0, autoFail: true, kind: "missold" },
    ],
  },
  {
    id: "energy", name: "Energy scorecard", note: "Even weights, any No fails it", auto: true, threshold: 0,
    questions: [
      { id: "e1", text: "Full tariff name read", weight: 20 },
      { id: "e2", text: "Unit rate and standing charge read", weight: 20, kind: "financial" },
      { id: "e3", text: "Contract length and exit fee read", weight: 20, kind: "financial" },
      { id: "e4", text: "Payment method confirmed", weight: 20 },
      { id: "e5", text: "Cooling-off period explained", weight: 20, kind: "financial" },
    ],
  },
];

const ALL_Q = SECTIONS.flatMap((s) => s.questions.map((q) => ({ ...q, sec: s.id })));

const RULES: { key: Rules; label: string; desc: string }[] = [
  { key: "core", label: "Original rules", desc: "Parity with the old system. A critical miss costs its weight and nothing more." },
  { key: "dpa", label: "Notice fails the call", desc: "A missed recording notice or data protection check scores the call 0%." },
  { key: "critical", label: "Critical by section", desc: "A critical miss zeroes its own section. A missold service zeroes the whole call." },
];

const round2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;

type SecResult = { score: number; result: "pass" | "fail" | "na"; critical?: boolean };

function scoreReview(ans: Record<string, Ans>, rules: Rules) {
  let weight = 0, earned = 0, pass = true;
  const per: Record<string, SecResult> = {};
  const earnedBy: Record<string, number> = {};
  const crit: { kind: Kind; sec: string; text: string }[] = [];

  for (const s of SECTIONS) {
    let w = 0, e = 0, n = 0, yes = 0, anyNo = false, autoFail = false;
    for (const q of s.questions) {
      const v = ans[q.id] ?? "na";
      if (v === "na") continue;
      n++;
      if (q.autoFail) {
        if (v === "yes") autoFail = true;
      } else {
        w += q.weight;
        if (v === "yes") { e += q.weight; yes++; } else anyNo = true;
      }
      const failed = q.autoFail ? v === "yes" : v === "no";
      if (failed && q.kind) crit.push({ kind: q.kind, sec: s.id, text: q.text });
    }
    earnedBy[s.id] = e;
    weight += w; earned += e;
    if (n === 0) { per[s.id] = { score: 0, result: "na" }; pass = false; continue; }
    if (s.auto) {
      per[s.id] = { score: round2((yes / n) * 100), result: anyNo ? "fail" : "pass" };
    } else {
      const sc = w > 0 ? round2((e / w) * 100) : 0;
      per[s.id] = { score: sc, result: !autoFail && sc >= s.threshold ? "pass" : "fail" };
    }
    if (per[s.id].result !== "pass") pass = false;
  }

  const base = { total: weight > 0 ? round2((earned / weight) * 100) : 0, result: pass ? "pass" as const : "fail" as const, per, crit: [] as typeof crit, missold: false };
  const active = rules === "core" ? [] : crit.filter((c) => rules === "critical" || c.kind === "dpa");
  if (!active.length) return base;
  if (rules !== "critical") return { ...base, total: 0, result: "fail" as const, crit: active };
  if (active.some((c) => c.kind === "missold")) return { ...base, total: 0, result: "fail" as const, crit: active, missold: true };

  const failed = new Set(active.map((c) => c.sec));
  let kept = 0;
  const per2 = { ...per };
  for (const s of SECTIONS) {
    if (failed.has(s.id)) per2[s.id] = { score: 0, result: "fail", critical: true };
    else kept += earnedBy[s.id];
  }
  return { ...base, per: per2, total: weight > 0 ? round2((kept / weight) * 100) : 0, result: "fail" as const, crit: active };
}

const allYes = (): Record<string, Ans> => Object.fromEntries(ALL_Q.map((q) => [q.id, q.autoFail ? "no" : "yes"])) as Record<string, Ans>;

const PRESETS: { label: string; build: () => Record<string, Ans> }[] = [
  { label: "Clean call", build: allYes },
  { label: "Recording notice missed", build: () => ({ ...allYes(), c2: "no" }) },
  { label: "Unit rate not read", build: () => ({ ...allYes(), e2: "no" }) },
  { label: "Service missold", build: () => ({ ...allYes(), c8: "yes" }) },
];

function ScoringDemo() {
  const [ans, setAns] = React.useState<Record<string, Ans>>(() => PRESETS[1].build());
  const [rules, setRules] = React.useState<Rules>("core");
  const [cursor, setCursor] = React.useState(1);
  const r = scoreReview(ans, rules);

  const set = (id: string, v: Ans) => setAns((a) => ({ ...a, [id]: v }));
  const onKey = (e: React.KeyboardEvent) => {
    const k = e.key.toLowerCase();
    const map: Record<string, Ans> = { y: "yes", n: "no", a: "na" };
    if (map[k]) {
      e.preventDefault();
      set(ALL_Q[cursor].id, map[k]);
      setCursor((c) => Math.min(c + 1, ALL_Q.length - 1));
    } else if (k === "j") { e.preventDefault(); setCursor((c) => Math.min(c + 1, ALL_Q.length - 1)); }
    else if (k === "k") { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
  };

  const resColor = (x: string) => (x === "pass" ? "#34d399" : x === "fail" ? "#f87171" : "var(--foreground-subtle)");
  const btn = (on: boolean, tone: string): React.CSSProperties => ({
    fontSize: "0.68rem", fontWeight: 700, width: "34px", padding: "5px 0", borderRadius: "6px", cursor: "pointer",
    border: `1px solid ${on ? tone : "var(--border)"}`, background: on ? `${tone}22` : "transparent",
    color: on ? tone : "var(--foreground-subtle)",
  });
  const pill = (on: boolean): React.CSSProperties => ({
    fontSize: "0.76rem", fontWeight: 600, padding: "7px 14px", borderRadius: "20px", cursor: "pointer",
    border: `1px solid ${on ? A : "var(--border)"}`, background: on ? A : "transparent",
    color: on ? "#0f1a02" : "var(--foreground-muted)",
  });

  let idx = -1;
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border-subtle)", borderRadius: "16px", overflow: "hidden" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center", padding: "14px 18px", borderBottom: "1px solid var(--border-subtle)" }}>
        <span style={{ fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--foreground-subtle)", marginRight: "4px" }}>Load a call</span>
        {PRESETS.map((p) => (
          <button key={p.label} onClick={() => setAns(p.build())} style={{ fontSize: "0.74rem", fontWeight: 500, padding: "5px 12px", borderRadius: "7px", cursor: "pointer", border: "1px solid var(--border)", background: "var(--surface-elevated)", color: "var(--foreground-muted)" }}>{p.label}</button>
        ))}
        <span style={{ marginLeft: "auto", fontSize: "0.66rem", color: "var(--foreground-subtle)" }}>Synthetic scorecard · production arithmetic</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
        {/* Questions */}
        <div tabIndex={0} onKeyDown={onKey} aria-label="Scorecard. Press Y, N or A to answer, J and K to move." style={{ padding: "16px 18px", outline: "none", borderRight: "1px solid var(--border-subtle)" }}>
          {SECTIONS.map((s) => (
            <div key={s.id} style={{ marginBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: "10px", marginBottom: "8px" }}>
                <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--foreground)" }}>{s.name}</span>
                <span style={{ fontSize: "0.66rem", color: "var(--foreground-subtle)" }}>{s.note}</span>
              </div>
              {s.questions.map((q) => {
                idx++;
                const i = idx;
                const v = ans[q.id] ?? "na";
                const on = cursor === i;
                return (
                  <div key={q.id} onClick={() => setCursor(i)} style={{
                    display: "flex", alignItems: "center", gap: "10px", padding: "7px 9px", borderRadius: "8px",
                    background: on ? "rgba(132,204,22,0.07)" : "transparent",
                    border: `1px solid ${on ? "rgba(132,204,22,0.3)" : "transparent"}`,
                  }}>
                    <span style={{ flex: 1, fontSize: "0.79rem", color: "var(--foreground-muted)", lineHeight: 1.4 }}>
                      {q.text}
                      {q.kind && <span style={{ marginLeft: "7px", fontSize: "0.56rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.35)", borderRadius: "4px", padding: "1px 5px", whiteSpace: "nowrap" }}>critical</span>}
                    </span>
                    <span style={{ fontSize: "0.66rem", color: "var(--foreground-subtle)", width: "22px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{q.autoFail ? "" : q.weight}</span>
                    <span style={{ display: "flex", gap: "4px" }}>
                      <button aria-label={`${q.text}: Yes`} aria-pressed={v === "yes"} onClick={() => set(q.id, "yes")} style={btn(v === "yes", q.autoFail ? "#f87171" : "#34d399")}>Y</button>
                      <button aria-label={`${q.text}: No`} aria-pressed={v === "no"} onClick={() => set(q.id, "no")} style={btn(v === "no", q.autoFail ? "#34d399" : "#f87171")}>N</button>
                      <button aria-label={`${q.text}: Not applicable`} aria-pressed={v === "na"} onClick={() => set(q.id, "na")} style={btn(v === "na", "#94a3b8")}>N/A</button>
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
          <p style={{ fontSize: "0.68rem", color: "var(--foreground-subtle)", margin: 0 }}>
            Click the list, then use the keyboard as the analysts do: Y, N or A answers and moves on, J and K step down and up.
          </p>
        </div>

        {/* Result */}
        <div style={{ padding: "18px 20px", background: "rgba(12,12,20,0.5)" }}>
          <div style={{ fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--foreground-subtle)", marginBottom: "10px" }}>Ruleset</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "7px", marginBottom: "10px" }}>
            {RULES.map((x) => <button key={x.key} aria-pressed={rules === x.key} onClick={() => setRules(x.key)} style={pill(rules === x.key)}>{x.label}</button>)}
          </div>
          <p style={{ fontSize: "0.76rem", color: "var(--foreground-muted)", lineHeight: 1.55, minHeight: "38px", margin: "0 0 18px" }}>{RULES.find((x) => x.key === rules)!.desc}</p>

          <div style={{ display: "flex", alignItems: "flex-end", gap: "14px", marginBottom: "18px" }}>
            <div className="gradient-number" style={{ fontSize: "3rem", fontWeight: 900, lineHeight: 1, letterSpacing: "-0.04em", fontVariantNumeric: "tabular-nums" }}>{r.total}%</div>
            <span style={{ fontSize: "0.74rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", color: resColor(r.result), border: `1px solid ${resColor(r.result)}55`, background: `${resColor(r.result)}14`, borderRadius: "6px", padding: "4px 10px", marginBottom: "6px" }}>{r.result}</span>
          </div>

          {SECTIONS.map((s) => {
            const p = r.per[s.id];
            return (
              <div key={s.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", padding: "9px 0", borderTop: "1px solid var(--border-subtle)" }}>
                <span style={{ fontSize: "0.8rem", color: "var(--foreground-muted)" }}>{s.name}{p.critical && <span style={{ color: "#fbbf24", fontSize: "0.68rem" }}> · zeroed by a critical miss</span>}</span>
                <span style={{ fontSize: "0.8rem", fontWeight: 700, color: resColor(p.result), fontVariantNumeric: "tabular-nums" }}>{p.result === "na" ? "N/A" : `${p.score}% · ${p.result}`}</span>
              </div>
            );
          })}

          <p style={{ fontSize: "0.76rem", color: "var(--foreground-muted)", lineHeight: 1.6, margin: "16px 0 0", paddingTop: "14px", borderTop: "1px solid var(--border-subtle)" }}>
            {r.missold ? "A missold service zeroes the whole call and sends it to the agent's manager."
              : r.crit.length ? `Critical miss applied: ${r.crit.map((c) => c.text.toLowerCase()).join("; ")}.`
              : r.result === "pass" ? "Every ticked section passed. The overall score pools points across sections, it is not an average of section scores."
              : "A failed section fails the review without changing the score. A review can show a high percentage and still be a fail."}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Architecture ────────────────────────────────────────────────────────────

function ArchBox({ name, sub, tone }: { name: string; sub: string; tone: string }) {
  return (
    <div style={{ flex: 1, minWidth: "150px", borderRadius: "12px", padding: "14px 16px", textAlign: "center", background: `${tone}10`, border: `1px solid ${tone}38` }}>
      <div style={{ fontSize: "0.88rem", fontWeight: 700, color: tone }}>{name}</div>
      <div style={{ fontSize: "0.7rem", color: "var(--foreground-muted)", marginTop: "4px", lineHeight: 1.45 }}>{sub}</div>
    </div>
  );
}

function ArchHop({ label }: { label: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "8px 0" }}>
      <span style={{ width: "1px", height: "14px", background: "var(--border)" }} />
      <span style={{ color: "var(--foreground-subtle)", fontSize: "0.7rem", lineHeight: 1 }}>▼</span>
      <span style={{ fontSize: "0.68rem", color: "var(--foreground-subtle)", marginTop: "5px", textAlign: "center" }}>{label}</span>
    </div>
  );
}

function ArchitectureDiagram() {
  const row: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: "10px", justifyContent: "center" };
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border-subtle)", borderRadius: "16px", padding: "26px 22px" }}>
      <div style={row}>
        <ArchBox name="Core system" sub="Completed calls, products sold, staff, permissions, scorecards" tone="#38bdf8" />
        <ArchBox name="Phone system" sub="Every call on a customer record, with length and recording link" tone="#818cf8" />
      </div>
      <ArchHop label="Read-only, through the Metabase API. No customer personal data in the feed." />
      <div style={{ ...row, maxWidth: "520px", margin: "0 auto" }}>
        <ArchBox name="Sync job" sub="Every 15 minutes. First full run took 62 seconds." tone="#fbbf24" />
      </div>
      <ArchHop label="Upsert, with a count of changed and conflicting reviews logged on every run" />
      <div style={{ ...row, maxWidth: "520px", margin: "0 auto" }}>
        <ArchBox name="PostgreSQL" sub="Reviews, answers with a snapshot of each question, history, audit trail. No public address." tone="#34d399" />
      </div>
      <ArchHop label="" />
      <div style={{ ...row, maxWidth: "520px", margin: "0 auto" }}>
        <ArchBox name="Web application" sub="Node 22 on Railway. Scoring, queue, insights, reports, settings." tone={A} />
      </div>
      <ArchHop label="" />
      <div style={row}>
        <ArchBox name="Analysts and managers" sub="Google sign-in limited to the company domain, plus a role from the core system" tone="#f472b6" />
        <ArchBox name="Agents" sub="Their own scores and rank only, enforced on the server" tone="#f472b6" />
        <ArchBox name="Incentive tracker" sub="Token-protected feed of locked scores" tone="#fb923c" />
      </div>
    </div>
  );
}

// ─── Timeline ────────────────────────────────────────────────────────────────

const TIMELINE = [
  { d: "15 Oct", t: "Problem scoped", b: "The quality lead describes a tool that works but cannot be changed without an engineering ticket." },
  { d: "26 Oct", t: "Decision", b: "Replicate the whole compliance section first. A narrow, read-only feed every 15 minutes." },
  { d: "28 Oct", t: "Copy live, parity proven", b: "1,281 of 1,281 production reviews re-score to the same score and result." },
  { d: "5 Nov", t: "Rules and impact", b: "Critical-fail rulesets built behind a switch. Three months of history re-scored to size the effect." },
  { d: "6 Nov", t: "The analyst's day", b: "Home, prioritised queue, keyboard scoring, insights and reports. Demoed to leadership." },
  { d: "9 Nov", t: "Second track and access", b: "A second sales team as its own track, role-based viewing, audit trail, hardening." },
  { d: "13 Nov", t: "Reviewer feedback", b: "Critical misses score by section, call claiming, analyst view. In parallel running." },
];

function Timeline() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "10px" }}>
      {TIMELINE.map((x, i) => (
        <div key={x.d} className="card-hover" style={{ background: "var(--surface)", border: "1px solid var(--border-subtle)", borderRadius: "12px", padding: "16px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
            <span style={{ width: "20px", height: "20px", borderRadius: "50%", background: "var(--accent-muted)", border: "1px solid var(--accent-border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.58rem", fontWeight: 800, color: A }}>{i + 1}</span>
            <span style={{ fontSize: "0.66rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: A }}>{x.d} 2026</span>
          </div>
          <div style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--foreground)", marginBottom: "5px" }}>{x.t}</div>
          <p style={{ fontSize: "0.78rem", color: "var(--foreground-muted)", lineHeight: 1.6, margin: 0 }}>{x.b}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Heat map (synthetic) ────────────────────────────────────────────────────

const HM_CRITERIA = ["Call introduced correctly", "Recording notice", "Meter type advised", "Tariff name in full", "Review requested", "Email spelt back"];
const HM_AGENTS = ["Agent A", "Agent B", "Agent C", "Agent D", "Agent E", "Agent F", "Agent G", "Agent H"];
// Deterministic synthetic miss rates so the layout is real and the numbers are not.
const hmValue = (a: number, c: number) => {
  const v = (a * 37 + c * 53 + a * c * 11) % 61;
  return v < 22 ? 0 : v - 14;
};

function HeatMap() {
  const [sel, setSel] = React.useState<{ a: number; c: number } | null>(null);
  const tone = (v: number) => (v === 0 ? "rgba(52,211,153,0.10)" : `rgba(248,113,113,${0.12 + (v / 47) * 0.6})`);
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border-subtle)", borderRadius: "16px", padding: "20px 22px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "8px", marginBottom: "14px" }}>
        <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--foreground)" }}>Share of reviewed calls where each criterion was missed</span>
        <span style={{ fontSize: "0.66rem", color: "#fbbf24" }}>Synthetic data, real layout</span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: `90px repeat(${HM_CRITERIA.length}, minmax(92px, 1fr))`, gap: "4px", minWidth: "680px" }}>
          <span />
          {HM_CRITERIA.map((c) => <span key={c} style={{ fontSize: "0.64rem", color: "var(--foreground-subtle)", lineHeight: 1.3, padding: "0 4px 6px", alignSelf: "end" }}>{c}</span>)}
          {HM_AGENTS.map((a, ai) => (
            <React.Fragment key={a}>
              <span style={{ fontSize: "0.74rem", color: "var(--foreground-muted)", alignSelf: "center" }}>{a}</span>
              {HM_CRITERIA.map((c, ci) => {
                const v = hmValue(ai, ci);
                const on = sel?.a === ai && sel?.c === ci;
                return (
                  <button key={c} onClick={() => setSel({ a: ai, c: ci })} aria-label={`${a}, ${c}: ${v}% missed`} style={{
                    height: "34px", borderRadius: "6px", cursor: "pointer", background: tone(v),
                    border: `1px solid ${on ? "#ffffff" : "transparent"}`, color: v === 0 ? "rgba(52,211,153,0.8)" : "#fff",
                    fontSize: "0.72rem", fontWeight: 600, fontVariantNumeric: "tabular-nums",
                  }}>{v}%</button>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
      <p style={{ fontSize: "0.76rem", color: "var(--foreground-muted)", lineHeight: 1.6, margin: "14px 0 0", minHeight: "20px" }}>
        {sel
          ? `${HM_AGENTS[sel.a]} missed "${HM_CRITERIA[sel.c].toLowerCase()}" on ${hmValue(sel.a, sel.c)}% of reviewed calls. In the tool this cell opens the calls behind it, which is the coaching conversation.`
          : "Select a cell. In the tool each one drills down to the calls behind it."}
      </p>
    </div>
  );
}

// ─── Small shared cards ──────────────────────────────────────────────────────

function InfoCard({ title, children, tone }: { title: string; children: ReactNode; tone?: string }) {
  return (
    <div className="card-hover" style={{ background: "var(--surface)", border: "1px solid var(--border-subtle)", borderRadius: "14px", padding: "20px 22px" }}>
      <h3 style={{ fontSize: "0.94rem", fontWeight: 700, color: tone ?? "var(--foreground)", marginBottom: "7px" }}>{title}</h3>
      <p style={{ fontSize: "0.85rem", color: "var(--foreground-muted)", lineHeight: 1.7, margin: 0 }}>{children}</p>
    </div>
  );
}

function StatTile({ v, l }: { v: string; l: string }) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border-subtle)", borderRadius: "14px", padding: "20px 22px" }}>
      <div className="gradient-number" style={{ fontSize: "1.7rem", fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 1.1 }}>{v}</div>
      <div style={{ fontSize: "0.76rem", color: "var(--foreground-muted)", marginTop: "6px", lineHeight: 1.5 }}>{l}</div>
    </div>
  );
}

function StateRow({ state, children }: { state: "live" | "open"; children: ReactNode }) {
  const c = state === "live" ? "#34d399" : "#fbbf24";
  return (
    <div style={{ display: "flex", gap: "12px", alignItems: "flex-start", padding: "11px 0", borderTop: "1px solid var(--border-subtle)" }}>
      <span style={{ fontSize: "0.56rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", color: c, border: `1px solid ${c}55`, background: `${c}12`, borderRadius: "5px", padding: "3px 7px", flexShrink: 0, marginTop: "2px", width: "44px", textAlign: "center" }}>{state}</span>
      <p style={{ fontSize: "0.85rem", color: "var(--foreground-muted)", lineHeight: 1.65, margin: 0 }}>{children}</p>
    </div>
  );
}

const CHAPTERS = [
  { n: "01", title: "The Problem", sub: "Every change was an engineering ticket", href: "#problem", color: "#f43f5e" },
  { n: "02", title: "Parity First", sub: "Copy it exactly, then prove it", href: "#parity", color: "#f59e0b" },
  { n: "03", title: "The Analyst's Day", sub: "Queue · scoring · challenges · insights", href: "#workflow", color: "#84cc16" },
  { n: "04", title: "Safety and Limits", sub: "What it stores, what is still open", href: "#safety", color: "#38bdf8" },
];

function StoryArc() {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border-subtle)", borderRadius: "16px", padding: "20px 24px" }}>
      <div style={{ fontSize: "0.58rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--foreground-subtle)", marginBottom: "16px" }}>The story: four chapters</div>
      <div style={{ display: "flex", alignItems: "stretch", gap: "0", overflowX: "auto" }}>
        {CHAPTERS.map((c, i, arr) => (
          <React.Fragment key={c.n}>
            <a href={c.href} style={{ textDecoration: "none", flex: 1, minWidth: "160px" }}>
              <div style={{
                padding: "14px 16px", borderRadius: "12px",
                background: `${c.color}08`, border: `1px solid ${c.color}22`,
                height: "100%", boxSizing: "border-box",
                transition: "background 0.2s, border-color 0.2s",
              }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = `${c.color}14`; (e.currentTarget as HTMLElement).style.borderColor = `${c.color}40`; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = `${c.color}08`; (e.currentTarget as HTMLElement).style.borderColor = `${c.color}22`; }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                  <span style={{ width: "22px", height: "22px", borderRadius: "50%", background: `${c.color}18`, border: `1px solid ${c.color}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.6rem", fontWeight: 800, color: c.color, flexShrink: 0 }}>{c.n}</span>
                  <span style={{ fontSize: "0.88rem", fontWeight: 700, color: "var(--foreground)" }}>{c.title}</span>
                </div>
                <div style={{ fontSize: "0.7rem", color: "var(--foreground-subtle)", lineHeight: 1.5, paddingLeft: "30px" }}>{c.sub}</div>
              </div>
            </a>
            {i < arr.length - 1 && (
              <div style={{ display: "flex", alignItems: "center", padding: "0 6px", flexShrink: 0 }}>
                <span style={{ color: "var(--foreground-subtle)", fontSize: "1rem" }}>→</span>
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

function ChapterBadge({ n, color }: { n: number; color: string }) {
  const c = CHAPTERS[n - 1];
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: `${color}08`, border: `1px solid ${color}22`, borderRadius: "20px", padding: "5px 14px", marginBottom: "18px" }}>
      <span style={{ fontSize: "0.6rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", color }}>{c.n}</span>
      <span style={{ width: "3px", height: "3px", borderRadius: "50%", background: color, flexShrink: 0 }} />
      <span style={{ fontSize: "0.72rem", fontWeight: 600, color }}>{c.title}</span>
      <span style={{ fontSize: "0.68rem", color: "var(--foreground-subtle)" }}>·</span>
      <span style={{ fontSize: "0.68rem", color: "var(--foreground-subtle)" }}>{c.sub}</span>
    </div>
  );
}

function ChapterTransition({ from, to }: { from: string; to: string }) {
  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "0 24px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "18px 0" }}>
        <div style={{ flex: 1, height: "1px", background: "var(--border-subtle)" }} />
        <div style={{ display: "flex", alignItems: "center", gap: "10px", background: "var(--surface)", border: "1px solid var(--border-subtle)", borderRadius: "20px", padding: "6px 16px", flexShrink: 0 }}>
          <span style={{ fontSize: "0.72rem", color: "var(--foreground-subtle)" }}>{from}</span>
          <span style={{ color: "var(--accent)", fontSize: "0.8rem" }}>→</span>
          <span style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--foreground)" }}>{to}</span>
        </div>
        <div style={{ flex: 1, height: "1px", background: "var(--border-subtle)" }} />
      </div>
    </div>
  );
}

const NAV_SECTIONS = [
  { id: "problem", label: "Problem" },
  { id: "parity", label: "Parity" },
  { id: "architecture", label: "Architecture" },
  { id: "scoring", label: "Scoring" },
  { id: "workflow", label: "Workflow" },
  { id: "insights", label: "Insights" },
  { id: "safety", label: "Safety" },
  { id: "delivery", label: "Delivery" },
  { id: "outcomes", label: "Outcomes" },
];

function SectionNav() {
  const [active, setActive] = React.useState<string>("problem");
  React.useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => { if (e.isIntersecting) setActive((e.target as HTMLElement).id); });
      },
      { rootMargin: "-45% 0px -50% 0px" }
    );
    NAV_SECTIONS.forEach((s) => { const el = document.getElementById(s.id); if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, []);
  return (
    <nav aria-label="Section navigation" className="section-rail" style={{ position: "fixed", right: "26px", top: "50%", transform: "translateY(-50%)", zIndex: 40, flexDirection: "column", gap: "5px" }}>
      {NAV_SECTIONS.map((s) => {
        const on = active === s.id;
        return (
          <a key={s.id} href={`#${s.id}`} aria-current={on ? "true" : undefined}
            style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "10px", textDecoration: "none", padding: "3px 0" }}>
            <span style={{ fontSize: "0.7rem", fontWeight: on ? 700 : 500, color: on ? "var(--accent)" : "var(--foreground-subtle)", whiteSpace: "nowrap", transition: "color .2s" }}>{s.label}</span>
            <span style={{ width: on ? "24px" : "12px", height: "3px", borderRadius: "2px", background: on ? "var(--accent)" : "var(--border)", boxShadow: on ? "0 0 8px var(--accent-glow)" : "none", transition: "all .2s" }} />
          </a>
        );
      })}
    </nav>
  );
}

export default function Home() {
  const wrap: React.CSSProperties = { maxWidth: "1100px", margin: "0 auto", padding: "0 24px" };
  const sec: React.CSSProperties = { padding: "88px 0" };
  const secAlt: React.CSSProperties = { ...sec, background: "rgba(12,12,20,0.5)" };
  const grid = (min: number): React.CSSProperties => ({ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`, gap: "14px" });

  return (
    <div style={{ background: "var(--background)", minHeight: "100vh" }}>

      <SectionNav />

      {/* ── Nav ──────────────────────────────────────────────────────────── */}
      <nav style={{
        position: "sticky", top: 0, zIndex: 50,
        borderBottom: "1px solid var(--border-subtle)",
        background: "rgba(10,10,15,0.85)",
        backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
      }}>
        <div style={{ ...wrap, display: "flex", alignItems: "center", justifyContent: "space-between", height: "58px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{
              width: "26px", height: "26px", borderRadius: "6px",
              background: "linear-gradient(135deg, #65a30d, #a3e635)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 0 12px rgba(132,204,22,0.4)",
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M5 12.5l4.5 4.5L19 7.5" stroke="#0f1a02" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <span style={{ fontSize: "0.88rem", fontWeight: 700, color: "var(--foreground)", letterSpacing: "-0.01em" }}>
              QA Compliance Platform
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "2px" }}>
            <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--foreground)" }}>Wahid Tawsif Ratul</span>
            <span style={{ fontSize: "0.72rem", color: "var(--accent)" }}>Data Scientist · Product Manager</span>
          </div>
        </div>
      </nav>

      <main>

        {/* ── Hero ──────────────────────────────────────────────────────── */}
        <section className="hero-section" style={{ padding: "110px 0 90px" }}>
          <div style={wrap}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: "8px", marginBottom: "24px",
              background: "rgba(132,204,22,0.08)", border: "1px solid rgba(132,204,22,0.2)",
              borderRadius: "20px", padding: "5px 14px",
            }}>
              <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#34d399", boxShadow: "0 0 6px #34d399" }} />
              <span style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "#bef264" }}>
                Case Study · Just Move In
              </span>
            </div>

            <h1 className="gradient-heading" style={{
              fontSize: "clamp(2.2rem, 5.5vw, 4rem)", fontWeight: 900,
              letterSpacing: "-0.04em", lineHeight: 1.08, marginBottom: "22px", maxWidth: "860px",
            }}>
              QA Compliance Platform
            </h1>

            <p style={{
              fontSize: "clamp(1rem, 2vw, 1.18rem)", color: "var(--foreground-muted)",
              lineHeight: 1.75, maxWidth: "680px", marginBottom: "52px",
            }}>
              I replaced the call quality review section of the company&apos;s core system with a standalone
              platform. Phase one was an exact copy, proven by re-scoring every historical review to the same
              result. Phase two rebuilt it around how the quality analysts work: a prioritised queue, keyboard
              scoring, challenges, calibration and reporting.
            </p>

            {/* Stat pills */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "14px" }}>
              {[
                { value: "1,281 / 1,281", label: "Reviews Re-scored Identically" },
                { value: "15", label: "Scorecards Mirrored" },
                { value: "240+", label: "Questions" },
                { value: "15 min", label: "Read-only Sync" },
                { value: "13 days", label: "Scope to Live Copy" },
              ].map(({ value, label }) => (
                <div key={label} className="stat-glow" style={{
                  background: "rgba(132,204,22,0.08)", border: "1px solid rgba(132,204,22,0.25)",
                  borderRadius: "14px", padding: "18px 28px", textAlign: "center", minWidth: "130px",
                }}>
                  <div className="gradient-number" style={{ fontSize: "1.5rem", fontWeight: 900, lineHeight: 1.15, letterSpacing: "-0.03em" }}>
                    {value}
                  </div>
                  <div style={{ fontSize: "0.68rem", color: "var(--foreground-muted)", marginTop: "5px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    {label}
                  </div>
                </div>
              ))}
            </div>

            {/* Business outcomes */}
            <div style={{ marginTop: "44px", paddingTop: "32px", borderTop: "1px solid var(--border-subtle)", maxWidth: "720px" }}>
              <div style={{ fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--foreground-subtle)", marginBottom: "18px" }}>
                What changed
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                {[
                  "Scorecards, weights and critical-fail rules became configuration in the tool, not a release in the core system",
                  "Short calls and non-sales calls, which the old process never monitored, now enter the review queue",
                  "The heat map and the weekly and monthly manager reports, previously assembled by hand from a spreadsheet, are computed from every scorecard answer",
                ].map((outcome) => (
                  <div key={outcome} style={{ display: "flex", gap: "14px", alignItems: "flex-start" }}>
                    <div style={{
                      width: "22px", height: "22px", borderRadius: "50%", flexShrink: 0, marginTop: "1px",
                      background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.28)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <span style={{ color: "#34d399", fontSize: "0.65rem", fontWeight: 700 }}>✓</span>
                    </div>
                    <p style={{ fontSize: "0.92rem", color: "var(--foreground-muted)", lineHeight: 1.65 }}>{outcome}</p>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: "0.8rem", color: "var(--foreground-subtle)", lineHeight: 1.6, marginTop: "18px" }}>
                Status, November 2026: running in parallel with the system it replaces. Cut-over has not happened yet.
              </p>
            </div>

            {/* Role & scope */}
            <div style={{ marginTop: "30px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "14px", maxWidth: "720px" }}>
              <div style={{ background: "var(--surface)", border: "1px solid var(--border-subtle)", borderRadius: "12px", padding: "16px 18px" }}>
                <div style={{ fontSize: "0.58rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--accent)", marginBottom: "8px" }}>My role</div>
                <p style={{ fontSize: "0.83rem", color: "var(--foreground-muted)", lineHeight: 1.6 }}>Product Manager and sole builder: scope, scoring specification, data model, interface and delivery, with Claude Code as the engineering pair. I approved every deploy.</p>
              </div>
              <div style={{ background: "var(--surface)", border: "1px solid var(--border-subtle)", borderRadius: "12px", padding: "16px 18px" }}>
                <div style={{ fontSize: "0.58rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--accent)", marginBottom: "8px" }}>Partnered with</div>
                <p style={{ fontSize: "0.83rem", color: "var(--foreground-muted)", lineHeight: 1.6 }}>The quality assurance lead and analysts · call operations management · the data security owner, who holds sign-off before wider rollout.</p>
              </div>
            </div>

            {/* Contact / CTA */}
            <div style={{ marginTop: "28px", display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center" }}>
              <a href="#scoring" style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "linear-gradient(135deg, #65a30d, #a3e635)", color: "#0f1a02", fontSize: "0.85rem", fontWeight: 700, textDecoration: "none", borderRadius: "9px", padding: "10px 18px", boxShadow: "0 0 18px rgba(132,204,22,0.35)" }}>
                Score a call
              </a>
              <a href="mailto:wahidtratul@gmail.com" style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "transparent", color: "var(--foreground-muted)", fontSize: "0.85rem", fontWeight: 600, textDecoration: "none", border: "1px solid var(--border)", borderRadius: "9px", padding: "10px 18px" }}>
                Email me
              </a>
              <a href="https://github.com/ratul003/qa-compliance-platform" target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "transparent", color: "var(--foreground-muted)", fontSize: "0.85rem", fontWeight: 600, textDecoration: "none", border: "1px solid var(--border)", borderRadius: "9px", padding: "10px 18px" }}>
                GitHub
              </a>
            </div>
          </div>
        </section>

        {/* ── Story arc ──────────────────────────────────────────────────── */}
        <section style={{ padding: "0 0 40px" }}>
          <div style={wrap}>
            <StoryArc />
          </div>
        </section>

        <div className="divider-gradient" />

        {/* ── Problem ───────────────────────────────────────────────────── */}
        <section id="problem" style={secAlt}>
          <div style={wrap}>
            <ChapterBadge n={1} color="#f43f5e" />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "48px", alignItems: "start" }}>
              <div>
                <Label>The Business Problem</Label>
                <Heading className="gradient-heading">
                  A review tool that worked, and could not be changed.
                </Heading>
                <Body>
                  Analysts score sales calls against compliance scorecards. The score decides whether a call
                  passes and feeds agent pay, so the rules behind it have to be both correct and adjustable.
                </Body>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <InfoCard title="Every change was an engineering ticket">
                  The review section lived inside the core system. Changing a question, a weight or a pass rule
                  meant a release, and the quality lead had a backlog of changes waiting on engineering time.
                </InfoCard>
                <InfoCard title="Critical misses barely moved the score">
                  The recording notice and data protection check carried 10 points of 100. An agent could miss
                  it, score 90% and pass. The most serious failure on a call was weighted like any other question.
                </InfoCard>
                <InfoCard title="Thin coverage, manual effort">
                  Short calls and non-sales calls were not monitored at all. Scoring was fully manual at 7 to 8
                  reviews per analyst per day, with trend reporting typed into a separate spreadsheet.
                </InfoCard>
              </div>
            </div>
          </div>
        </section>

        <ChapterTransition from="The problem" to="Parity first" />

        {/* ── Parity ────────────────────────────────────────────────────── */}
        <section id="parity" style={sec}>
          <div style={wrap}>
            <ChapterBadge n={2} color="#f59e0b" />
            <Label>Approach</Label>
            <Heading className="gradient-heading">Copy the old system exactly, then prove it</Heading>
            <Body>
              A stricter rule is only credible if the baseline is identical first. Before changing anything I
              ported the scoring logic line for line, including the rounding behaviour of the original
              language, and re-scored every review the old system held. Any difference would have been a bug
              in the copy, found before an agent&apos;s pay depended on it.
            </Body>

            <div style={{ ...grid(200), marginTop: "36px" }}>
              <StatTile v="1,281 of 1,281" l="production reviews re-scored to the same score and the same pass or fail" />
              <StatTile v="0" l="mismatches between the two systems" />
              <StatTile v="6" l="tables of the old compliance section rebuilt and mirrored" />
              <StatTile v="62 s" l="for the first full sync on production" />
            </div>

            <div style={{ ...grid(300), marginTop: "14px" }}>
              <InfoCard title="What parity had to reproduce">
                The overall score pools points across sections, it is not an average of section scores. A
                failed section fails the review without changing the score, so a review can read 95% and
                still be a fail. Evenly weighted sections split 100 across their questions with the rounding
                remainder on the last one.
              </InfoCard>
              <InfoCard title="Quirks kept on purpose">
                The old system fails a review when a ticked section is entirely not applicable, and colours
                scores in bands that do not match the pay bands. Both look like mistakes. I copied them, logged
                them as decisions for the quality lead, and changed neither until parity was signed off.
              </InfoCard>
              <InfoCard title="History the old system did not keep">
                Each answer is saved with a snapshot of the question as it stood: text, guidance and weight.
                Editing a scorecard never rewrites an old review, and every edit to a review keeps the previous
                version.
              </InfoCard>
            </div>
          </div>
        </section>

        <div className="divider-gradient" />

        {/* ── Architecture ──────────────────────────────────────────────── */}
        <section id="architecture" style={secAlt}>
          <div style={wrap}>
            <Label>Architecture</Label>
            <Heading className="gradient-heading">A narrow, read-only feed and nothing else</Heading>
            <Body>
              The platform never writes to the core system and never pulls customer personal data. It reads
              completed calls, products sold, staff and permissions every 15 minutes, and keeps its own
              reviews in its own database.
            </Body>
            <div style={{ marginTop: "36px" }}>
              <ArchitectureDiagram />
            </div>
            <div style={{ ...grid(300), marginTop: "14px" }}>
              <InfoCard title="Access follows the source of truth">
                Sign-in is limited to the company Google domain and a role held in the core system. Someone
                who leaves the company is inactive there, and loses access here on the next sync.
              </InfoCard>
              <InfoCard title="A deviation, written down" tone="#fbbf24">
                The design called for two read-only database views. The build reads through an existing
                Metabase API key instead. That is recorded as a deviation for the data security owner to
                accept or reject, not left for them to discover.
              </InfoCard>
            </div>
          </div>
        </section>

        <div className="divider-gradient" />

        {/* ── Scoring demo ──────────────────────────────────────────────── */}
        <section id="scoring" style={sec}>
          <div style={wrap}>
            <Label>Try it</Label>
            <Heading className="gradient-heading">One call, three rulesets</Heading>
            <Body>
              The scorecard below is synthetic. The arithmetic is the production logic. The loaded call is the
              case that started the project: the agent skipped the recording notice. Switch the ruleset and
              watch what the same answers are worth.
            </Body>
            <div style={{ marginTop: "36px" }}>
              <ScoringDemo />
            </div>
            <div style={{ ...grid(300), marginTop: "14px" }}>
              <InfoCard title="Sizing a rule before proposing it">
                Before recommending the stricter rule I re-scored three months of historical reviews under
                it, agent by agent, to show which pay bands would move. The effect was large enough that the
                rule went to leadership before launch instead of being switched on.
              </InfoCard>
              <InfoCard title="The rule that came out of review">
                The first version zeroed the whole call on any critical miss. After the reviewers&apos; feedback
                it zeroes only the section the miss sits in, and reserves the whole-call zero for a missold
                service, which also goes to the agent&apos;s manager.
              </InfoCard>
              <InfoCard title="Switched, not deployed">
                Each ruleset is a setting. The default stays on the original rules so parity holds, and a
                change takes effect on the first day of a month, never part-way through a pay period.
              </InfoCard>
            </div>
          </div>
        </section>

        <ChapterTransition from="Parity first" to="The analyst's day" />

        {/* ── Workflow ──────────────────────────────────────────────────── */}
        <section id="workflow" style={secAlt}>
          <div style={wrap}>
            <ChapterBadge n={3} color="#84cc16" />
            <Label>Product</Label>
            <Heading className="gradient-heading">Rebuilt around the analyst&apos;s day</Heading>
            <Body>
              The exact copy reproduced the old system, not the job. A session with the quality team showed
              that their real workflow lived in a spreadsheet beside the tool: who to review next, daily
              targets, notes on what was missed. The second build moved that work into the product.
            </Body>
            <div style={{ ...grid(300), marginTop: "36px" }}>
              <InfoCard title="A queue that picks the next call">
                The home page shows progress against 7 reviews a day and 36 a week, and puts the agent
                furthest under their monthly minimum of 5 reviews first. Agents on a performance plan or
                with high call volume can carry a higher minimum.
              </InfoCard>
              <InfoCard title="Scoring from the keyboard">
                Y, N or A answers a question and moves on. J and K step down and up. A section can be filled
                with Yes in one action, the score updates live, and answers are kept in the browser if the
                tab closes.
              </InfoCard>
              <InfoCard title="One analyst per call">
                Opening a scorecard claims the call for 45 minutes. Other analysts see who has it, it leaves
                their queue, and taking it over asks first.
              </InfoCard>
              <InfoCard title="Skipping is recorded, not silent">
                A call that cannot be scored leaves the queue with a reason. One of those reasons is a phone
                system fault, counted on the manager report so it can be raised with the vendor.
              </InfoCard>
              <InfoCard title="Challenges with a deadline">
                An agent or their manager can challenge a score until the 5th of the following month. Scores
                lock on the 9th. A critical miss opens a follow-up record for the coaching conversation.
              </InfoCard>
              <InfoCard title="Calibration">
                Analysts score the same call blind. The tool compares them side by side and reports agreement
                per analyst and per question, so drift between reviewers is measured, not assumed.
              </InfoCard>
            </div>

            <div style={{ marginTop: "44px" }}>
              <div style={{ fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--foreground-subtle)", marginBottom: "14px" }}>
                Four weeks, in order
              </div>
              <Timeline />
            </div>
          </div>
        </section>

        <div className="divider-gradient" />

        {/* ── Insights ──────────────────────────────────────────────────── */}
        <section id="insights" style={sec}>
          <div style={wrap}>
            <Label>Reporting</Label>
            <Heading className="gradient-heading">Computed from answers, not typed into a sheet</Heading>
            <Body>
              The team&apos;s heat map was built by hand from free-text comments. The platform derives the same
              views from every scorecard answer and refreshes them with each sync: trends by day, week or
              month, the ten most-missed criteria, and which agents miss which criteria.
            </Body>
            <div style={{ marginTop: "36px" }}>
              <HeatMap />
            </div>
            <div style={{ ...grid(300), marginTop: "14px" }}>
              <InfoCard title="Validated against the source">
                I checked the insights against a direct query on a full quarter of 672 reviews. Review count,
                average score and pass rate matched before anyone was shown the page.
              </InfoCard>
              <InfoCard title="The manager report writes itself">
                The weekly and monthly reports that were compiled by hand are generated from the same data,
                with a written summary of what slipped and what improved since the previous period.
              </InfoCard>
            </div>
          </div>
        </section>

        <ChapterTransition from="The analyst's day" to="Safety and limits" />

        {/* ── Safety ────────────────────────────────────────────────────── */}
        <section id="safety" style={secAlt}>
          <div style={wrap}>
            <ChapterBadge n={4} color="#38bdf8" />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "40px" }}>
              <div>
                <Label>Controls</Label>
                <Heading className="gradient-heading">What it stores, and what it refuses</Heading>
                <div style={{ marginTop: "20px" }}>
                  <StateRow state="live">No customer personal data is pulled or stored. Where a customer name must be shown, it is read live from the core system, held in memory for 10 minutes and never written to the database. That display sits behind a switch pending privacy review.</StateRow>
                  <StateRow state="live">Review notes reject emails, phone numbers and postcodes when saved.</StateRow>
                  <StateRow state="live">Agents see only their own scores and rank. Scoping is enforced on the server, not in the interface.</StateRow>
                  <StateRow state="live">An audit trail records who opened which agent, review or record, and is kept for 400 days. Five named people can read it.</StateRow>
                  <StateRow state="live">Security headers, a content policy that runs only the tool&apos;s own scripts, per-address rate limits, and session revocation that takes effect within about 30 seconds.</StateRow>
                </div>
              </div>
              <div>
                <Label>Limitations</Label>
                <Heading className="gradient-heading">What is still open</Heading>
                <div style={{ marginTop: "20px" }}>
                  <StateRow state="open">It has not replaced the old system. Both run in parallel until the quality lead and the data security owner sign off.</StateRow>
                  <StateRow state="open">The audit log is not yet locked against the database owner.</StateRow>
                  <StateRow state="open">Backups are a hosting setting that had not been configured and verified at the time of writing.</StateRow>
                  <StateRow state="open">Scoring by a language model is deliberately not built. The plan is to run it beside human reviewers and adopt it only above 95% agreement.</StateRow>
                  <StateRow state="open">I have no measured time saved per review yet. That needs a full month of scoring in the new tool.</StateRow>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="divider-gradient" />

        {/* ── Delivery ──────────────────────────────────────────────────── */}
        <section id="delivery" style={sec}>
          <div style={wrap}>
            <Label>Delivery</Label>
            <Heading className="gradient-heading">One person, an AI pair and the systems the work already lived in</Heading>
            <Body>
              I built this with Claude Code as the engineering pair. Requirements came from meeting notes,
              work was tracked in Linear, the brief and the scorecard lived in Google Docs and Sheets, the
              data arrives through Metabase and the service runs on Railway. I made the scope and data
              decisions, and nothing was deployed without my approval.
            </Body>
            <div style={{ ...grid(200), marginTop: "36px" }}>
              <StatTile v="34" l="deployments in the 17 days from first release to mid November" />
              <StatTile v="21" l="unit tests" />
              <StatTile v="48" l="end-to-end checks run against an in-process Postgres" />
              <StatTile v="1" l="parity test that re-scores the full review history on demand" />
            </div>
          </div>
        </section>

        <div className="divider-gradient" />

        {/* ── Outcomes ──────────────────────────────────────────────────── */}
        <section id="outcomes" style={secAlt}>
          <div style={wrap}>
            <Label>Outcomes &amp; Implication</Label>
            <Heading className="gradient-heading">A compliance process the quality team can change themselves</Heading>
            <Body>
              The result so far is equivalence and reach, not yet speed. Here is what is established, and
              what it sets up.
            </Body>

            <div style={{ marginTop: "40px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "14px" }}>
              {[
                {
                  category: "Proven equivalence",
                  color: "#84cc16",
                  outcomes: [
                    "1,281 of 1,281 production reviews re-score to the same score and result, with 0 mismatches",
                    "Every sync logs how many reviews changed and how many conflict with the old system's copy",
                  ],
                },
                {
                  category: "Wider coverage",
                  color: "#10b981",
                  outcomes: [
                    "Short and non-sales calls enter the queue as their own call type, excluded from pay by default",
                    "A second sales team was added as a separate track, so its numbers never mix with the first team's scores or pay",
                  ],
                },
                {
                  category: "Reporting without the spreadsheet",
                  color: "#f59e0b",
                  outcomes: [
                    "Heat map, trends and most-missed criteria computed from scorecard answers on every sync",
                    "Weekly and monthly manager reports generated, not compiled by hand",
                  ],
                },
                {
                  category: "Change without a release",
                  color: "#38bdf8",
                  outcomes: [
                    "Three scoring rulesets behind one setting, switchable at the start of a month",
                    "Scorecards, minimums, targets and analyst assignments edited in the tool by the quality team",
                  ],
                },
              ].map(({ category, color, outcomes }) => (
                <div key={category} className="card-hover" style={{ background: "var(--surface)", border: "1px solid var(--border-subtle)", borderRadius: "16px", padding: "24px" }}>
                  <div style={{ fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color, marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: color, boxShadow: `0 0 6px ${color}80` }} />
                    {category}
                  </div>
                  {outcomes.map((o) => (
                    <div key={o} style={{ display: "flex", gap: "10px", marginBottom: "12px", alignItems: "flex-start" }}>
                      <div style={{ width: "18px", height: "18px", borderRadius: "50%", flexShrink: 0, marginTop: "1px", background: `${color}10`, border: `1px solid ${color}28`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <span style={{ color, fontSize: "0.6rem", fontWeight: 700 }}>✓</span>
                      </div>
                      <p style={{ fontSize: "0.82rem", color: "var(--foreground-muted)", lineHeight: 1.65 }}>{o}</p>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            <div style={{ marginTop: "28px", background: "rgba(132,204,22,0.06)", border: "1px solid rgba(132,204,22,0.2)", borderRadius: "14px", padding: "24px 28px" }}>
              <div style={{ fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--accent)", marginBottom: "10px" }}>
                The connective thread
              </div>
              <p style={{ fontSize: "0.92rem", color: "var(--foreground-muted)", lineHeight: 1.8, maxWidth: "800px" }}>
                Each later step depended on the first one. Proving the copy identical is what made a stricter
                rule a measurable change and not an argument. Measuring that change on real history is what
                sent it to leadership before it touched anyone&apos;s pay. The same order applies to the next step:
                a model will score calls beside the human reviewers, and replaces them only when the two agree.
              </p>
            </div>
          </div>
        </section>

        <div className="divider-gradient" />

        {/* ── Tech Stack ────────────────────────────────────────────────── */}
        <section style={{ ...sec, paddingBottom: "60px" }}>
          <div style={wrap}>
            <Label>Stack</Label>
            <Heading>Technology</Heading>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "2px", marginTop: "14px" }}>
              {["Node 22", "PostgreSQL", "Railway", "Docker", "Metabase API", "Google OAuth", "Chart.js", "PGlite", "Claude Code", "Linear", "Granola", "Google Docs & Sheets"].map((name) => (
                <Tag key={name} color="#84cc16">{name}</Tag>
              ))}
            </div>
          </div>
        </section>

      </main>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer style={{ borderTop: "1px solid var(--border-subtle)", padding: "32px 0", background: "var(--surface)" }}>
        <div style={{ ...wrap, display: "flex", flexDirection: "column", gap: "20px" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
            <span style={{ fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--foreground-subtle)", marginRight: "6px" }}>
              Portfolio
            </span>
            {[
              { label: "Claude-ing WorkOS", href: "https://claude-ing.vercel.app", color: "#F5A524" },
              { label: "Product Intelligence Platform", href: "https://product-intelligence-platform.vercel.app", color: "#6366f1" },
              { label: "Experimentation Science", href: "https://experimentation-science.vercel.app", color: "#f59e0b" },
            ].map(({ label, href, color }) => (
              <a key={label} href={href} target="_blank" rel="noopener noreferrer" style={{
                fontSize: "0.79rem", fontWeight: 500, color: "var(--foreground-muted)",
                textDecoration: "none", border: "1px solid var(--border-subtle)",
                borderRadius: "7px", padding: "5px 12px",
                display: "inline-flex", alignItems: "center", gap: "6px",
                transition: "border-color 0.2s, color 0.2s",
              }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.borderColor = color; (e.currentTarget as HTMLAnchorElement).style.color = color; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.borderColor = "var(--border-subtle)"; (e.currentTarget as HTMLAnchorElement).style.color = "var(--foreground-muted)"; }}
              >
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: color, flexShrink: 0 }} />
                {label}
              </a>
            ))}
          </div>

          <div style={{ fontSize: "0.7rem", color: "var(--foreground-subtle)", lineHeight: 1.6, maxWidth: "640px" }}>
            Written case study: all architecture, processes and methods described from first-hand work at Just Move In. The scorecard and heat map on this page are synthetic. No customer data, agent records, supplier names or confidential figures are reproduced.
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ width: "22px", height: "22px", borderRadius: "5px", background: "linear-gradient(135deg, #65a30d, #a3e635)", boxShadow: "0 0 8px rgba(132,204,22,0.3)" }} />
              <span style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--foreground)" }}>Wahid Tawsif Ratul</span>
                <span style={{ fontSize: "0.72rem", color: "var(--foreground-subtle)" }}>Data Scientist · Product Manager</span>
              </span>
            </div>
            <a href="https://github.com/ratul003/qa-compliance-platform" target="_blank" rel="noopener noreferrer" style={{
              display: "inline-flex", alignItems: "center", gap: "8px",
              fontSize: "0.82rem", fontWeight: 600, color: "var(--foreground-muted)",
              textDecoration: "none", border: "1px solid var(--border)",
              borderRadius: "8px", padding: "7px 14px",
            }}>
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
