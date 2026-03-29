import { Link } from "wouter";
import { Sprout } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background px-4">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 rounded-full bg-primary/8 flex items-center justify-center mx-auto mb-6">
          <Sprout size={28} strokeWidth={1} className="text-primary/50" />
        </div>
        <h1 className="font-serif text-3xl text-foreground mb-3">Lost in the garden</h1>
        <p className="text-muted-foreground mb-8 leading-relaxed">
          This path doesn't lead anywhere. Let Eleanor guide you back.
        </p>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-full font-medium hover:shadow-lg transition-all"
        >
          Back to Your Garden
        </Link>
      </div>
    </div>
  );
}
