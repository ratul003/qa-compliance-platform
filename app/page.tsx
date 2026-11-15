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

// ─── Visual building blocks ──────────────────────────────────────────────────

const INK = "var(--foreground)";
const MUT = "var(--foreground-muted)";
const SUB = "var(--foreground-subtle)";
const GOOD = "#34d399";
const WARN = "#fbbf24";
const BAD = "#f87171";

const panel: React.CSSProperties = { background: "var(--surface)", border: "1px solid var(--border-subtle)", borderRadius: "16px", padding: "22px" };
const eyebrow: React.CSSProperties = { fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.13em", color: SUB };
const caption: React.CSSProperties = { fontSize: "0.82rem", color: MUT, lineHeight: 1.5, margin: 0 };

function Chip({ tone, children }: { tone: string; children: ReactNode }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "0.7rem", fontWeight: 700, color: tone, border: `1px solid ${tone}55`, background: `${tone}14`, borderRadius: "6px", padding: "3px 9px", whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

function Tick({ ok }: { ok: boolean }) {
  const c = ok ? GOOD : BAD;
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle cx="9" cy="9" r="8" fill={`${c}1f`} stroke={`${c}66`} />
      {ok
        ? <path d="M5.2 9.3l2.5 2.5 5-5.4" stroke={c} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        : <path d="M6 6l6 6M12 6l-6 6" stroke={c} strokeWidth="1.8" strokeLinecap="round" />}
    </svg>
  );
}

// ─── Problem, drawn ──────────────────────────────────────────────────────────

function ProblemVisuals() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "14px" }}>
      {/* 1. The queue */}
      <div style={panel}>
        <div style={eyebrow}>Changing a rule</div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", margin: "22px 0 20px" }}>
          <div style={{ fontSize: "0.72rem", fontWeight: 700, color: INK, border: "1px solid var(--border)", borderRadius: "8px", padding: "9px 10px", textAlign: "center", lineHeight: 1.25 }}>Quality<br />lead</div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "4px" }} aria-label="A queue of five waiting tickets">
            {[1, 0.8, 0.62, 0.46, 0.32].map((o) => (
              <div key={o} style={{ height: "9px", borderRadius: "3px", background: `rgba(248,113,113,${o * 0.55})`, border: "1px solid rgba(248,113,113,0.35)" }} />
            ))}
          </div>
          <span style={{ color: SUB }}>→</span>
          <div style={{ fontSize: "0.72rem", fontWeight: 700, color: INK, border: "1px solid var(--border)", borderRadius: "8px", padding: "9px 10px", textAlign: "center", lineHeight: 1.25 }}>Engineering<br />release</div>
        </div>
        <p style={caption}>Every question, weight or pass rule waited in an engineering queue.</p>
      </div>

      {/* 2. The score that passed */}
      <div style={panel}>
        <div style={eyebrow}>A critical miss</div>
        <div style={{ display: "flex", alignItems: "center", gap: "16px", margin: "14px 0 14px" }}>
          <div className="gradient-number" style={{ fontSize: "3.4rem", fontWeight: 900, letterSpacing: "-0.04em", lineHeight: 1 }}>90%</div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "7px" }}>
            <Chip tone={GOOD}>PASS</Chip>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "0.74rem", color: MUT }}><Tick ok={false} />Recording notice</span>
          </div>
        </div>
        <p style={caption}>The most serious miss on a call cost 10 points of 100, and the call still passed.</p>
      </div>

      {/* 3. Coverage */}
      <div style={panel}>
        <div style={eyebrow}>What got reviewed</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "9px", margin: "16px 0 14px" }}>
          {[{ l: "Completed sales calls", ok: true }, { l: "Short calls", ok: false }, { l: "Non-sales calls", ok: false }].map((r) => (
            <div key={r.l} style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "0.86rem", color: r.ok ? INK : MUT }}><Tick ok={r.ok} />{r.l}</div>
          ))}
        </div>
        <p style={caption}>All by hand, at 7 to 8 reviews per analyst per day.</p>
      </div>
    </div>
  );
}

// ─── Parity: the same review through both systems ───────────────────────────

function ScoreSheet({ name, sub }: { name: string; sub: string }) {
  // Worked example from the scoring specification: one No in each section.
  const rows = [
    { l: "Call scorecard", v: 90, r: "pass" },
    { l: "Broadband scorecard", v: 85.71, r: "fail" },
  ];
  return (
    <div style={{ flex: 1, minWidth: "230px", background: "var(--surface-elevated)", border: "1px solid var(--border)", borderRadius: "14px", padding: "18px 20px" }}>
      <div style={{ fontSize: "0.92rem", fontWeight: 700, color: INK }}>{name}</div>
      <div style={{ fontSize: "0.7rem", color: SUB, marginBottom: "16px" }}>{sub}</div>
      {rows.map((x) => (
        <div key={x.l} style={{ marginBottom: "12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", color: MUT, marginBottom: "5px" }}>
            <span>{x.l}</span>
            <span style={{ color: INK, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{x.v.toFixed(2)}% <span style={{ color: x.r === "pass" ? GOOD : BAD, fontWeight: 700 }}>{x.r}</span></span>
          </div>
          <div style={{ height: "6px", borderRadius: "3px", background: "var(--border-subtle)" }}>
            <div style={{ width: `${x.v}%`, height: "100%", borderRadius: "3px", background: A }} />
          </div>
        </div>
      ))}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "16px", paddingTop: "14px", borderTop: "1px solid var(--border-subtle)" }}>
        <span style={{ fontSize: "0.72rem", color: SUB, textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700 }}>Overall</span>
        <span style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "1.5rem", fontWeight: 900, color: INK, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums" }}>87.86%</span>
          <Chip tone={BAD}>FAIL</Chip>
        </span>
      </div>
    </div>
  );
}

function ParityMatrix() {
  const R = 54, C = 2 * Math.PI * R;
  return (
    <div style={panel}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: "18px" }}>
        <ScoreSheet name="Old system" sub="Review tool inside the core system" />

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px", padding: "0 6px" }}>
          <svg width="150" height="150" viewBox="0 0 150 150" role="img" aria-label="1,281 of 1,281 production reviews re-scored to the same score and result. 0 mismatches.">
            <circle cx="75" cy="75" r={R} fill="none" stroke="var(--border)" strokeWidth="10" />
            <circle cx="75" cy="75" r={R} fill="none" stroke={A} strokeWidth="10" strokeDasharray={`${C} ${C}`} transform="rotate(-90 75 75)" />
            <text x="75" y="70" textAnchor="middle" fontSize="23" fontWeight="900" fill="#e8e8f0" letterSpacing="-0.5">1,281</text>
            <text x="75" y="89" textAnchor="middle" fontSize="10.5" fill="#8888a8">of 1,281 identical</text>
          </svg>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "1.3rem", fontWeight: 900, color: A, lineHeight: 1 }}>=</span>
            <Chip tone={GOOD}>0 mismatches</Chip>
          </div>
        </div>

        <ScoreSheet name="New platform" sub="Same review, re-scored independently" />
      </div>

      <p style={{ ...caption, textAlign: "center", margin: "18px auto 0", maxWidth: "620px" }}>
        One review from the scoring specification, shown through both systems. Every one of the 1,281 production reviews came out like this: same sections, same score, same result.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "8px", marginTop: "16px" }}>
        <Chip tone={A}>Points pooled, not averaged</Chip>
        <Chip tone={A}>A fail never changes the score</Chip>
        <Chip tone={A}>Rounding matched to the original</Chip>
        <Chip tone={WARN}>Old quirks copied, then logged for decision</Chip>
      </div>
    </div>
  );
}

// ─── The loaded call under three rulesets ────────────────────────────────────

function RulesetBars() {
  const rows = [
    { l: "Original rules", v: 95, pass: true, n: "The miss costs 10 points" },
    { l: "Notice fails the call", v: 0, pass: false, n: "First proposal" },
    { l: "Critical by section", v: 50, pass: false, n: "Adopted after review" },
  ];
  return (
    <div style={panel}>
      <div style={{ fontSize: "0.92rem", fontWeight: 700, color: INK, marginBottom: "4px" }}>The same call, scored three ways</div>
      <p style={{ ...caption, marginBottom: "18px" }}>Recording notice missed, everything else correct.</p>
      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        {rows.map((r) => (
          <div key={r.l} title={`${r.l}: ${r.v}%, ${r.pass ? "pass" : "fail"}`} style={{ display: "grid", gridTemplateColumns: "minmax(120px, 170px) 1fr 104px", alignItems: "center", gap: "14px" }}>
            <div>
              <div style={{ fontSize: "0.84rem", fontWeight: 600, color: INK }}>{r.l}</div>
              <div style={{ fontSize: "0.7rem", color: SUB }}>{r.n}</div>
            </div>
            <div style={{ height: "14px", borderLeft: "1px solid var(--border)", position: "relative" }}>
              {r.v > 0 && <div style={{ width: `${r.v}%`, height: "100%", background: A, borderRadius: "0 4px 4px 0" }} />}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", justifyContent: "flex-end" }}>
              <span style={{ fontSize: "0.95rem", fontWeight: 800, color: INK, fontVariantNumeric: "tabular-nums" }}>{r.v}%</span>
              <Chip tone={r.pass ? GOOD : BAD}>{r.pass ? "PASS" : "FAIL"}</Chip>
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "20px" }}>
        <Chip tone={A}>Sized on 3 months of real history first</Chip>
        <Chip tone={A}>Switches on the 1st of a month</Chip>
        <Chip tone={A}>A setting, not a deploy</Chip>
      </div>
    </div>
  );
}

// ─── The analyst's home, as a product mock (synthetic) ───────────────────────

function Ring({ v, of, label }: { v: number; of: number; label: string }) {
  const R = 26, C = 2 * Math.PI * R;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "12px" }} title={`${label}: ${v} of ${of}`}>
      <svg width="64" height="64" viewBox="0 0 64 64" role="img" aria-label={`${label}: ${v} of ${of}`}>
        <circle cx="32" cy="32" r={R} fill="none" stroke="var(--border)" strokeWidth="6" />
        <circle cx="32" cy="32" r={R} fill="none" stroke={A} strokeWidth="6" strokeLinecap="round" strokeDasharray={`${(v / of) * C} ${C}`} transform="rotate(-90 32 32)" />
        <text x="32" y="37" textAnchor="middle" fontSize="15" fontWeight="800" fill="#e8e8f0">{v}</text>
      </svg>
      <div>
        <div style={{ fontSize: "0.8rem", fontWeight: 700, color: INK }}>{label}</div>
        <div style={{ fontSize: "0.72rem", color: SUB }}>of {of}</div>
      </div>
    </div>
  );
}

function Key({ k, l }: { k: string; l: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
      <span style={{ width: "40px", height: "40px", borderRadius: "9px", border: "1px solid var(--border)", borderBottomWidth: "3px", background: "var(--surface-elevated)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.95rem", fontWeight: 800, color: INK }}>{k}</span>
      <span style={{ fontSize: "0.66rem", color: SUB }}>{l}</span>
    </div>
  );
}

function HomeMock() {
  const queue = [
    { a: "Agent C", n: 1, len: "12 min", first: true },
    { a: "Agent F", n: 2, len: "4 min", first: false },
    { a: "Agent A", n: 2, len: "11 min", first: false },
    { a: "Agent H", n: 3, len: "5 min", first: false },
  ];
  return (
    <div style={{ ...panel, padding: 0, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "11px 16px", borderBottom: "1px solid var(--border-subtle)", background: "rgba(255,255,255,0.02)" }}>
        {[0, 1, 2].map((i) => <span key={i} style={{ width: "8px", height: "8px", borderRadius: "50%", background: "rgba(255,255,255,0.14)" }} />)}
        <span style={{ fontSize: "0.72rem", color: SUB, marginLeft: "6px" }}>Analyst home</span>
        <span style={{ marginLeft: "auto", fontSize: "0.66rem", color: WARN }}>Synthetic data, real layout</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
        {/* Left: progress and queue */}
        <div style={{ padding: "20px 22px", borderRight: "1px solid var(--border-subtle)" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "26px", marginBottom: "20px" }}>
            <Ring v={3} of={7} label="Today" />
            <Ring v={22} of={36} label="This week" />
          </div>
          <div style={{ ...eyebrow, marginBottom: "10px" }}>Next calls to score</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
            {queue.map((q) => (
              <div key={q.a} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 12px", borderRadius: "10px", border: `1px solid ${q.first ? "rgba(132,204,22,0.4)" : "var(--border-subtle)"}`, background: q.first ? "rgba(132,204,22,0.07)" : "transparent" }}>
                <span style={{ fontSize: "0.84rem", fontWeight: 600, color: INK, width: "66px" }}>{q.a}</span>
                <span style={{ display: "flex", gap: "3px" }} aria-label={`${q.n} of 5 reviews this month`}>
                  {[1, 2, 3, 4, 5].map((i) => <span key={i} style={{ width: "13px", height: "6px", borderRadius: "3px", background: i <= q.n ? A : "var(--border)" }} />)}
                </span>
                <span style={{ fontSize: "0.72rem", color: SUB }}>{q.n} of 5</span>
                <span style={{ fontSize: "0.72rem", color: SUB, marginLeft: "auto" }}>{q.len}</span>
                {q.first && <Chip tone={A}>first in line</Chip>}
              </div>
            ))}
          </div>
        </div>

        {/* Right: keys, calendar, rules */}
        <div style={{ padding: "20px 22px", background: "rgba(12,12,20,0.5)" }}>
          <div style={{ ...eyebrow, marginBottom: "12px" }}>Scoring from the keyboard</div>
          <div style={{ display: "flex", gap: "10px", marginBottom: "22px" }}>
            <Key k="Y" l="Yes" /><Key k="N" l="No" /><Key k="A" l="N/A" />
            <span style={{ width: "1px", background: "var(--border-subtle)", margin: "0 4px" }} />
            <Key k="J" l="Down" /><Key k="K" l="Up" />
          </div>

          <div style={{ ...eyebrow, marginBottom: "10px" }}>The month after a review</div>
          <div style={{ display: "flex", gap: "4px", marginBottom: "8px" }} role="img" aria-label="Days 1 to 9 of the next month. Challenges close on the 5th. Scores lock on the 9th.">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => {
              const tone = d === 5 ? WARN : d === 9 ? BAD : null;
              return (
                <span key={d} style={{ flex: 1, height: "34px", borderRadius: "7px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.78rem", fontWeight: 700, color: tone ?? SUB, border: `1px solid ${tone ? tone + "77" : "var(--border-subtle)"}`, background: tone ? `${tone}18` : d < 5 ? "rgba(132,204,22,0.06)" : "transparent" }}>{d}</span>
              );
            })}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "20px" }}>
            <Chip tone={WARN}>5th: challenges close</Chip>
            <Chip tone={BAD}>9th: scores lock</Chip>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            <Chip tone={A}>Call claimed for 45 min</Chip>
            <Chip tone={A}>Skip needs a reason</Chip>
            <Chip tone={A}>Blind calibration</Chip>
            <Chip tone={A}>Autosave</Chip>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Thirty days: milestones and deployments per day ─────────────────────────

const DEPLOYS: Record<number, { n: number; note: string }> = {
  13: { n: 3, note: "Copy live, parity proven" },
  21: { n: 3, note: "Rulesets built" },
  22: { n: 14, note: "Analyst's day, demo" },
  25: { n: 10, note: "Second track, access" },
  29: { n: 4, note: "Reviewer feedback" },
};
const MARKS: Record<number, string> = { 0: "Scoped", 11: "Decision: copy it" };

function DeployChart() {
  const [hover, setHover] = React.useState<number | null>(null);
  const DAYS = 30, W = 1040, H = 250, L = 34, B = 34, T = 54, MAX = 14;
  const step = (W - L - 10) / DAYS, bw = Math.min(step - 2, 24);
  const y = (n: number) => T + (H - T - B) * (1 - n / MAX);
  const label = (i: number) => { const d = new Date(Date.UTC(2026, 9, 15 + i)); return `${d.getUTCDate()} ${d.getUTCMonth() === 9 ? "Oct" : "Nov"}`; };
  return (
    <div style={panel}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "8px", marginBottom: "6px" }}>
        <span style={{ fontSize: "0.92rem", fontWeight: 700, color: INK }}>Deployments per day, from first scope to parallel running</span>
        <span style={{ fontSize: "0.76rem", color: MUT, minHeight: "18px" }}>{hover !== null ? `${label(hover)}: ${DEPLOYS[hover]?.n ?? 0} deployments${DEPLOYS[hover] ? ` · ${DEPLOYS[hover].note}` : MARKS[hover] ? ` · ${MARKS[hover]}` : ""}` : "34 deployments in total"}</span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", minWidth: "720px" }} role="img" aria-label="Bar chart of deployments per day from 15 October to 13 November 2026. 3 on 28 October, 3 on 5 November, 14 on 6 November, 10 on 9 November, 4 on 13 November.">
          {[0, 7, 14].map((g) => (
            <g key={g}>
              <line x1={L} x2={W - 10} y1={y(g)} y2={y(g)} stroke="var(--border-subtle)" />
              <text x={L - 8} y={y(g) + 4} textAnchor="end" fontSize="11" fill="#4a4a68">{g}</text>
            </g>
          ))}
          {Array.from({ length: DAYS }, (_, i) => {
            const d = DEPLOYS[i], x = L + i * step + (step - bw) / 2, cx = x + bw / 2;
            return (
              <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <rect x={L + i * step} y={T - 40} width={step} height={H - T - B + 40} fill="transparent" />
                {d && <path d={`M${x},${y(0)} V${y(d.n) + 4} Q${x},${y(d.n)} ${x + 4},${y(d.n)} H${x + bw - 4} Q${x + bw},${y(d.n)} ${x + bw},${y(d.n) + 4} V${y(0)} Z`} fill={A} opacity={hover === null || hover === i ? 1 : 0.45} />}
                {d && <text x={cx} y={y(d.n) - 8} textAnchor="middle" fontSize="13" fontWeight="800" fill="#e8e8f0">{d.n}</text>}
                {d && <text x={cx} y={y(d.n) - 24} textAnchor={i > 26 || i === 21 ? "end" : "middle"} fontSize="11" fill="#8888a8">{d.note}</text>}
                {MARKS[i] && (
                  <g>
                    <circle cx={cx} cy={y(0)} r="5" fill="#0a0a0f" stroke={WARN} strokeWidth="2" />
                    <text x={cx} y={y(0) - 14} textAnchor={i === 0 ? "start" : "end"} fontSize="11" fill="#8888a8">{MARKS[i]}</text>
                  </g>
                )}
                {((d && i !== 21) || MARKS[i]) && <text x={cx} y={H - 12} textAnchor="middle" fontSize="10.5" fill="#4a4a68">{label(i)}</text>}
              </g>
            );
          })}
          <line x1={L} x2={W - 10} y1={y(0)} y2={y(0)} stroke="var(--border)" />
        </svg>
      </div>
    </div>
  );
}

// ─── Most-missed criteria (synthetic, from the same grid as the heat map) ────

function MissedBars() {
  const rows = HM_CRITERIA.map((c, ci) => ({ c, v: Math.round(HM_AGENTS.reduce((s, _, ai) => s + hmValue(ai, ci), 0) / HM_AGENTS.length) })).sort((a, b) => b.v - a.v);
  const max = rows[0].v;
  return (
    <div style={panel}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "8px", marginBottom: "16px" }}>
        <span style={{ fontSize: "0.92rem", fontWeight: 700, color: INK }}>Most-missed criteria</span>
        <span style={{ fontSize: "0.66rem", color: WARN }}>Synthetic data, real layout</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "11px" }}>
        {rows.map((r) => (
          <div key={r.c} title={`${r.c}: missed on ${r.v}% of reviewed calls`} style={{ display: "grid", gridTemplateColumns: "minmax(110px, 170px) 1fr 40px", alignItems: "center", gap: "12px" }}>
            <span style={{ fontSize: "0.8rem", color: MUT }}>{r.c}</span>
            <span style={{ height: "10px", borderLeft: "1px solid var(--border)" }}>
              <span style={{ display: "block", width: `${(r.v / max) * 100}%`, height: "100%", background: BAD, opacity: 0.75, borderRadius: "0 4px 4px 0" }} />
            </span>
            <span style={{ fontSize: "0.8rem", fontWeight: 700, color: INK, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.v}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Controls and limits, as a status board ──────────────────────────────────

function StatusBoard() {
  const live = ["No customer personal data stored", "Notes reject emails, phones and postcodes", "Agents see only their own scores", "Audit trail kept for 400 days", "Sessions revoked in about 30 seconds"];
  const open = ["Not cut over: both systems still run", "Audit log not locked to the database owner", "Backups not yet verified", "Model scoring waits for 95% agreement", "No time-saved figure yet"];
  const col = (title: string, tone: string, tag: string, items: string[]) => (
    <div style={panel}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
        <span style={{ fontSize: "0.95rem", fontWeight: 700, color: INK }}>{title}</span>
        <Chip tone={tone}>{items.length} {tag}</Chip>
      </div>
      {items.map((t) => (
        <div key={t} style={{ display: "flex", alignItems: "center", gap: "11px", padding: "10px 0", borderTop: "1px solid var(--border-subtle)" }}>
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" style={{ flexShrink: 0 }}>
            <circle cx="9" cy="9" r="8" fill={`${tone}1f`} stroke={`${tone}66`} />
            {tone === GOOD
              ? <path d="M5.2 9.3l2.5 2.5 5-5.4" stroke={tone} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              : <path d="M9 5v4.4l2.6 1.6" stroke={tone} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />}
          </svg>
          <span style={{ fontSize: "0.86rem", color: MUT }}>{t}</span>
        </div>
      ))}
    </div>
  );
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "14px" }}>
      {col("What it stores, and refuses", GOOD, "live", live)}
      {col("What is still open", WARN, "open", open)}
    </div>
  );
}

// ─── How the work moved between systems ──────────────────────────────────────

function ToolFlow() {
  const steps = [
    { n: "Granola", r: "Requirements", c: "#a3e635" },
    { n: "Linear", r: "Tickets", c: "#818cf8" },
    { n: "Docs & Sheets", r: "Brief, scorecard", c: "#38bdf8" },
    { n: "Claude Code", r: "Build", c: "#fb923c" },
    { n: "Metabase", r: "Data feed", c: "#22d3ee" },
    { n: "Railway", r: "Runs here", c: "#f472b6" },
  ];
  return (
    <div style={{ ...panel, display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: "6px" }}>
      {steps.map((s, i) => (
        <React.Fragment key={s.n}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", width: "118px", padding: "8px 0" }}>
            <span style={{ width: "46px", height: "46px", borderRadius: "13px", background: `${s.c}18`, border: `1px solid ${s.c}55`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.05rem", fontWeight: 900, color: s.c }}>{s.n[0]}</span>
            <span style={{ fontSize: "0.82rem", fontWeight: 700, color: INK }}>{s.n}</span>
            <span style={{ fontSize: "0.68rem", color: SUB }}>{s.r}</span>
          </div>
          {i < steps.length - 1 && <span style={{ color: SUB, fontSize: "0.9rem" }}>→</span>}
        </React.Fragment>
      ))}
    </div>
  );
}

// ─── Walkthrough video with chapters ─────────────────────────────────────────

const TOUR: { g: string; items: [string, number][] }[] = [
  { g: "Opening", items: [["Why it exists", 0]] },
  { g: "The story", items: [["The problem", 30], ["Parity first", 56], ["One call, three rulesets", 101]] },
  { g: "The product", items: [["The analyst's day", 141], ["After the review", 188], ["Insights", 217]] },
  { g: "Limits and delivery", items: [["Safety and limits", 257], ["How it was built", 285], ["Where it stands", 317]] },
];
const TOUR_FLAT = TOUR.flatMap((x) => x.items);
const mmss = (t: number) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;

function VideoTour() {
  const ref = React.useRef<HTMLVideoElement>(null);
  const [now, setNow] = React.useState(0);
  const active = TOUR_FLAT.reduce((acc, [, t], i) => (now >= t ? i : acc), 0);
  const go = (t: number) => { const v = ref.current; if (!v) return; v.currentTime = t; v.play().catch(() => {}); };
  let n = 0;
  return (
    <div style={{ ...panel, padding: 0, overflow: "hidden" }}>
      <div style={{ display: "flex", flexWrap: "wrap" }}>
        <div style={{ flex: "3 1 520px", minWidth: 0, background: "#000", display: "flex", alignItems: "center" }}>
          <video ref={ref} controls preload="metadata" playsInline poster="/walkthrough-poster.jpg"
            onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)}
            style={{ display: "block", width: "100%", aspectRatio: "16 / 9" }}
            aria-label="Six-minute narrated walkthrough of the QA Compliance Platform">
            <source src="/walkthrough.mp4" type="video/mp4" />
          </video>
        </div>
        <div style={{ flex: "1 1 260px", maxHeight: "470px", overflowY: "auto", padding: "14px 14px 16px", borderLeft: "1px solid var(--border-subtle)" }}>
          {TOUR.map((grp) => (
            <div key={grp.g} style={{ marginBottom: "10px" }}>
              <div style={{ ...eyebrow, padding: "6px 8px 4px" }}>{grp.g}</div>
              {grp.items.map(([label, t]) => {
                const i = n++;
                const on = i === active;
                return (
                  <button key={label} onClick={() => go(t)} aria-current={on ? "true" : undefined} style={{
                    display: "flex", alignItems: "center", gap: "10px", width: "100%", textAlign: "left", cursor: "pointer",
                    padding: "6px 8px", borderRadius: "8px", border: `1px solid ${on ? "rgba(132,204,22,0.35)" : "transparent"}`,
                    background: on ? "rgba(132,204,22,0.08)" : "transparent",
                  }}>
                    <span style={{ width: "20px", height: "20px", borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.6rem", fontWeight: 800, color: on ? "#0f1a02" : SUB, background: on ? A : "var(--surface-elevated)", border: "1px solid var(--border)" }}>{i + 1}</span>
                    <span style={{ flex: 1, fontSize: "0.8rem", color: on ? INK : MUT, fontWeight: on ? 600 : 400 }}>{label}</span>
                    <span style={{ fontSize: "0.7rem", color: SUB, fontVariantNumeric: "tabular-nums" }}>{mmss(t)}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function BigStat({ v, l }: { v: string; l: string }) {
  return (
    <div style={{ ...panel, textAlign: "center", padding: "26px 18px" }}>
      <div className="gradient-number" style={{ fontSize: "2.1rem", fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 1.1 }}>{v}</div>
      <div style={{ fontSize: "0.78rem", color: MUT, marginTop: "8px", lineHeight: 1.45 }}>{l}</div>
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
  { id: "walkthrough", label: "Walkthrough" },
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
  const [active, setActive] = React.useState<string>("walkthrough");
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
  const sec: React.CSSProperties = { padding: "80px 0" };
  const secAlt: React.CSSProperties = { ...sec, background: "rgba(12,12,20,0.5)" };
  const grid = (min: number): React.CSSProperties => ({ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`, gap: "14px" });
  const gap: React.CSSProperties = { marginTop: "30px" };

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
        <section className="hero-section" style={{ padding: "100px 0 70px" }}>
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
              fontSize: "clamp(2rem, 4.6vw, 3.3rem)", fontWeight: 900,
              letterSpacing: "-0.04em", lineHeight: 1.08, marginBottom: "22px", maxWidth: "920px",
            }}>
              QA Compliance Platform
            </h1>

            <p style={{
              fontSize: "clamp(1rem, 2vw, 1.18rem)", color: "var(--foreground-muted)",
              lineHeight: 1.7, maxWidth: "720px", marginBottom: "44px",
            }}>
              A platform that gives the quality team control of its own compliance rules, with no
              engineering release in the way. I built it in four weeks: an exact replica that reproduced
              all 1,281 historical reviews, then a keyboard-first workflow shaped around the analysts,
              wider call coverage and reporting that writes itself.
            </p>

            {/* Stat pills */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "14px" }}>
              {[
                { value: "1,281 / 1,281", label: "Reviews Reproduced Exactly" },
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

            {/* Role, status, CTA */}
            <div style={{ marginTop: "30px", display: "flex", flexWrap: "wrap", gap: "8px" }}>
              <Chip tone="#bef264">Product Manager and sole builder</Chip>
              <Chip tone="#bef264">Claude Code as the engineering pair</Chip>
              <Chip tone="#fbbf24">Status: running in parallel, not yet cut over</Chip>
            </div>

            <div style={{ marginTop: "26px", display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center" }}>
              <a href="#walkthrough" style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "linear-gradient(135deg, #65a30d, #a3e635)", color: "#0f1a02", fontSize: "0.85rem", fontWeight: 700, textDecoration: "none", borderRadius: "9px", padding: "10px 18px", boxShadow: "0 0 18px rgba(132,204,22,0.35)" }}>
                ▶ Watch the 6-minute tour
              </a>
              <a href="#scoring" style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "transparent", color: "var(--foreground-muted)", fontSize: "0.85rem", fontWeight: 600, textDecoration: "none", border: "1px solid var(--border)", borderRadius: "9px", padding: "10px 18px" }}>
                Score a call
              </a>
              <a href="https://wahid-ratul.vercel.app/writing/the-power-of-mcp" target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "transparent", color: "var(--foreground-muted)", fontSize: "0.85rem", fontWeight: 600, textDecoration: "none", border: "1px solid var(--border)", borderRadius: "9px", padding: "10px 18px" }}>
                Read the story behind it
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

        {/* ── Walkthrough ───────────────────────────────────────────────── */}
        <section id="walkthrough" style={{ padding: "20px 0 70px" }}>
          <div style={wrap}>
            <Label>Watch it run</Label>
            <Heading className="gradient-heading">The whole product in six minutes</Heading>
            <Body>A narrated walkthrough: the problem, the parity proof, the scoring engine, then the product itself on demo data. Pick a chapter to jump to it. The click-by-click guide that ships inside the tool is <a href="/tool-guide.mp4" style={{ color: A, textDecoration: "underline" }}>here</a>.</Body>
            <div style={gap}><VideoTour /></div>
          </div>
        </section>

        <div className="divider-gradient" />

        {/* ── Problem ───────────────────────────────────────────────────── */}
        <section id="problem" style={secAlt}>
          <div style={wrap}>
            <div><ChapterBadge n={1} color="#f43f5e" /></div>
            <Label>The Business Problem</Label>
            <Heading className="gradient-heading">A review tool that worked, and could not be changed</Heading>
            <Body>Analysts score sales calls against compliance scorecards, and the score feeds agent pay.</Body>
            <div style={gap}><ProblemVisuals /></div>
          </div>
        </section>

        <ChapterTransition from="The problem" to="Parity first" />

        {/* ── Parity ────────────────────────────────────────────────────── */}
        <section id="parity" style={sec}>
          <div style={wrap}>
            <div><ChapterBadge n={2} color="#f59e0b" /></div>
            <Label>Approach</Label>
            <Heading className="gradient-heading">Copy the old system exactly, then prove it</Heading>
            <Body>A stricter rule is only credible if the baseline is identical first.</Body>
            <div style={gap}><ParityMatrix /></div>
          </div>
        </section>

        <div className="divider-gradient" />

        {/* ── Architecture ──────────────────────────────────────────────── */}
        <section id="architecture" style={secAlt}>
          <div style={wrap}>
            <Label>Architecture</Label>
            <Heading className="gradient-heading">A narrow, read-only feed and nothing else</Heading>
            <Body>It never writes to the core system and never pulls customer personal data.</Body>
            <div style={gap}><ArchitectureDiagram /></div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "16px" }}>
              <Chip tone="#34d399">Leavers lose access on the next sync</Chip>
              <Chip tone="#34d399">Database has no public address</Chip>
              <Chip tone="#fbbf24">Deviation logged: reads through an API key, not database views</Chip>
            </div>
          </div>
        </section>

        <div className="divider-gradient" />

        {/* ── Scoring demo ──────────────────────────────────────────────── */}
        <section id="scoring" style={sec}>
          <div style={wrap}>
            <Label>Try it</Label>
            <Heading className="gradient-heading">One call, three rulesets</Heading>
            <Body>Synthetic scorecard, production arithmetic. The loaded call skipped the recording notice.</Body>
            <div style={gap}><ScoringDemo /></div>
            <div style={{ marginTop: "14px" }}><RulesetBars /></div>
          </div>
        </section>

        <ChapterTransition from="Parity first" to="The analyst's day" />

        {/* ── Workflow ──────────────────────────────────────────────────── */}
        <section id="workflow" style={secAlt}>
          <div style={wrap}>
            <div><ChapterBadge n={3} color="#84cc16" /></div>
            <Label>Product</Label>
            <Heading className="gradient-heading">Rebuilt around the analyst&apos;s day</Heading>
            <Body>The copy reproduced the old system, not the job. The real workflow lived in a spreadsheet beside it.</Body>
            <div style={gap}><HomeMock /></div>
          </div>
        </section>

        <div className="divider-gradient" />

        {/* ── Insights ──────────────────────────────────────────────────── */}
        <section id="insights" style={sec}>
          <div style={wrap}>
            <Label>Reporting</Label>
            <Heading className="gradient-heading">Computed from answers, not typed into a sheet</Heading>
            <Body>The team&apos;s heat map was built by hand. Now it refreshes with every sync.</Body>
            <div style={gap}><HeatMap /></div>
            <div style={{ ...grid(320), marginTop: "14px" }}>
              <MissedBars />
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <BigStat v="672" l="reviews in the quarter used to check the insights against a direct query. Counts, average and pass rate matched." />
                <BigStat v="2" l="manager reports, weekly and monthly, generated instead of compiled by hand." />
              </div>
            </div>
          </div>
        </section>

        <ChapterTransition from="The analyst's day" to="Safety and limits" />

        {/* ── Safety ────────────────────────────────────────────────────── */}
        <section id="safety" style={secAlt}>
          <div style={wrap}>
            <div><ChapterBadge n={4} color="#38bdf8" /></div>
            <Label>Controls and limitations</Label>
            <Heading className="gradient-heading">What is live, and what I would not claim yet</Heading>
            <div style={gap}><StatusBoard /></div>
          </div>
        </section>

        <div className="divider-gradient" />

        {/* ── Delivery ──────────────────────────────────────────────────── */}
        <section id="delivery" style={sec}>
          <div style={wrap}>
            <Label>Delivery</Label>
            <Heading className="gradient-heading">One person, an AI pair, six systems</Heading>
            <Body>I made the scope and data decisions. Nothing was deployed without my approval.</Body>
            <div style={gap}><ToolFlow /></div>
            <div style={{ marginTop: "14px" }}><DeployChart /></div>
            <div style={{ ...grid(180), marginTop: "14px" }}>
              <BigStat v="34" l="deployments in 17 days" />
              <BigStat v="21" l="unit tests" />
              <BigStat v="48" l="end-to-end checks" />
              <BigStat v="1" l="parity test over the full history" />
            </div>
          </div>
        </section>

        <div className="divider-gradient" />

        {/* ── Outcomes ──────────────────────────────────────────────────── */}
        <section id="outcomes" style={secAlt}>
          <div style={wrap}>
            <Label>Outcomes &amp; Implication</Label>
            <Heading className="gradient-heading">A compliance process the quality team can change themselves</Heading>
            <Body>The result so far is equivalence and reach, not yet speed.</Body>
            <div style={{ ...grid(220), marginTop: "30px" }}>
              <BigStat v="1,281 / 1,281" l="reviews identical in both systems" />
              <BigStat v="3" l="scoring rulesets behind one switch" />
              <BigStat v="2" l="call types newly in the queue: short and non-sales" />
              <BigStat v="2" l="sales tracks, with scores and pay kept apart" />
            </div>

            <div style={{ marginTop: "14px", background: "rgba(132,204,22,0.06)", border: "1px solid rgba(132,204,22,0.2)", borderRadius: "14px", padding: "22px 26px" }}>
              <div style={{ fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--accent)", marginBottom: "8px" }}>
                The connective thread
              </div>
              <p style={{ fontSize: "0.95rem", color: "var(--foreground-muted)", lineHeight: 1.7, maxWidth: "760px", margin: 0 }}>
                Proving the copy identical turned a stricter rule into a measurable change. Measuring it on
                real history sent it to leadership before it touched anyone&apos;s pay.
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
            Written case study: all architecture, processes and methods described from first-hand work at Just Move In. The walkthrough video shows the product running on demo data, with scorecard names as they appear in the tool. The scorecard, analyst home, heat map and most-missed chart on this page are synthetic. No customer data or real agent records are reproduced.
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
