import type { CallAndResponseLine } from "./types";

interface CallAndResponseProps {
  lines: CallAndResponseLine[];
}

const SPEAKER_STYLES: Record<CallAndResponseLine["speaker"], React.CSSProperties> = {
  officiant: {
    color: "#2C1810",
    fontWeight: 400,
    paddingLeft: 0,
  },
  people: {
    color: "#D4896A",
    fontWeight: 400,
    paddingLeft: 0,
  },
  both: {
    color: "#2C1810",
    fontWeight: 500,
  },
};

const SPEAKER_LABEL: Record<CallAndResponseLine["speaker"], string | null> = {
  officiant: "V.",
  people: "R.",
  both: null,
};

export function CallAndResponse({ lines }: CallAndResponseProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {lines.map((line, i) => {
        const label = SPEAKER_LABEL[line.speaker];
        return (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            {label && (
              <span
                style={{
                  fontSize: 11,
                  color: "#9B8577",
                  fontFamily: "Space Grotesk, sans-serif",
                  letterSpacing: "0.05em",
                  minWidth: 18,
                  paddingTop: 3,
                  flexShrink: 0,
                }}
              >
                {label}
              </span>
            )}
            <p
              style={{
                margin: 0,
                fontSize: 18,
                lineHeight: 1.85,
                fontFamily: "Space Grotesk, sans-serif",
                ...SPEAKER_STYLES[line.speaker],
                paddingLeft: !label ? 26 : 0,
              }}
            >
              {line.text}
            </p>
          </div>
        );
      })}
    </div>
  );
}
