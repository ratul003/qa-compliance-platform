import { ImageResponse } from "next/og";

export const alt = "Self-Serve Call Quality Compliance Platform | Wahid Tawsif Ratul";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0a0a0f",
          backgroundImage:
            "radial-gradient(900px 600px at 75% -10%, rgba(132,204,22,0.22), transparent 60%), radial-gradient(700px 500px at 0% 110%, rgba(52,211,153,0.10), transparent 60%)",
          padding: "64px 72px",
          fontFamily: "sans-serif",
        }}
      >
        {/* Top — eyebrow */}
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <div
            style={{
              width: "44px",
              height: "44px",
              borderRadius: "11px",
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "center",
              gap: "4px",
              padding: "9px",
              background: "linear-gradient(135deg, #84cc16, #a3e635)",
              boxShadow: "0 0 30px rgba(132,204,22,0.5)",
            }}
          >
            <div style={{ width: "11px", height: "11px", borderRadius: "3px", background: "rgba(255,255,255,0.95)" }} />
            <div style={{ width: "11px", height: "11px", borderRadius: "3px", background: "rgba(255,255,255,0.6)" }} />
            <div style={{ width: "11px", height: "11px", borderRadius: "3px", background: "rgba(255,255,255,0.6)" }} />
            <div style={{ width: "11px", height: "11px", borderRadius: "3px", background: "rgba(255,255,255,0.95)" }} />
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              fontSize: "20px",
              fontWeight: 700,
              letterSpacing: "4px",
              textTransform: "uppercase",
              color: "#bef264",
            }}
          >
            <div
              style={{
                width: "9px",
                height: "9px",
                borderRadius: "50%",
                background: "#34d399",
              }}
            />
            Case Study · Just Move In
          </div>
        </div>

        {/* Middle — title + subtitle */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: "62px",
              fontWeight: 900,
              letterSpacing: "-3px",
              lineHeight: 1.02,
              color: "#f5f5fa",
              maxWidth: "960px",
            }}
          >
            Self-Serve Call Quality Compliance Platform
          </div>
          <div
            style={{
              marginTop: "26px",
              fontSize: "27px",
              lineHeight: 1.45,
              color: "#9a9ab8",
              maxWidth: "880px",
            }}
          >
            Gives the quality team control of its own compliance rules, with no
            engineering release in the way.
          </div>
        </div>

        {/* Bottom — name + stack */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: "1px solid rgba(255,255,255,0.1)",
            paddingTop: "28px",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: "26px", fontWeight: 700, color: "#e8e8f0" }}>
              Wahid Tawsif Ratul
            </div>
            <div style={{ fontSize: "20px", color: "#84cc16", fontWeight: 600 }}>
              Data Scientist · Product Manager
            </div>
          </div>
          <div style={{ display: "flex", gap: "12px" }}>
            {["Node", "PostgreSQL", "Railway", "Claude Code"].map((t) => (
              <div
                key={t}
                style={{
                  display: "flex",
                  fontSize: "18px",
                  color: "#d9f99d",
                  background: "rgba(132,204,22,0.1)",
                  border: "1px solid rgba(132,204,22,0.3)",
                  borderRadius: "8px",
                  padding: "8px 16px",
                }}
              >
                {t}
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
