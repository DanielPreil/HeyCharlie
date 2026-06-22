import type { KeyCombo } from "../../hooks/useKeyMonitor";

interface Props {
  combos: KeyCombo[];
}

const pill: React.CSSProperties = {
  background: "rgba(20,20,20,0.88)",
  color: "#fff",
  borderRadius: 6,
  padding: "3px 9px",
  fontSize: 13,
  fontFamily: "ui-monospace, 'SF Mono', monospace",
  fontWeight: 700,
  border: "1px solid rgba(255,255,255,0.12)",
  boxShadow: "0 2px 8px rgba(0,0,0,0.45)",
  backdropFilter: "blur(6px)",
  letterSpacing: "0.03em",
  lineHeight: 1.4,
  whiteSpace: "nowrap" as const,
};

export function KeyBadge({ combos }: Props) {
  if (combos.length === 0) return null;

  return (
    <div style={{ display: "flex", gap: 5, alignItems: "center", pointerEvents: "none" }}>
      {combos.map((combo, i) => {
        const opacity = i === combos.length - 1 ? 1 : Math.max(0.25, 0.3 + i * 0.2);
        return (
          <span key={combo.id} style={{ ...pill, opacity }}>
            {combo.keys.join("+")}
          </span>
        );
      })}
    </div>
  );
}
