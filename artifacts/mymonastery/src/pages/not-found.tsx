import { useLocation } from "wouter";

export default function NotFound() {
  const [, setLocation] = useLocation();
  return (
    <div className="min-h-screen w-full flex items-center justify-center px-4" style={{ background: "#FAF6F0" }}>
      <div className="text-center max-w-sm">
        <div className="text-5xl mb-6">📮</div>
        <h1 className="text-2xl font-bold mb-3" style={{ color: "#2C1810", fontFamily: "'Space Grotesk', sans-serif" }}>
          Lost in the post
        </h1>
        <p className="text-base mb-8" style={{ color: "#9a9390" }}>
          This path doesn't lead anywhere. Let Phoebe guide you back.
        </p>
        <button
          onClick={() => setLocation("/dashboard")}
          className="px-6 py-3 rounded-xl font-semibold text-sm"
          style={{ background: "#4A6FA5", color: "#fff" }}
        >
          Back to Phoebe
        </button>
      </div>
    </div>
  );
}
