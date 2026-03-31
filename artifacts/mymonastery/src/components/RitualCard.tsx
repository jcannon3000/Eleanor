import { useState } from "react";
import { Link } from "wouter";
import { format, parseISO } from "date-fns";
import { Calendar, ArrowRight, Sprout, Trash2 } from "lucide-react";
import { Ritual } from "@workspace/api-client-react";
import { StreakBadge } from "./StreakBadge";

interface RitualCardProps {
  ritual: Ritual;
  onDelete?: (id: number) => void;
}

export function RitualCard({ ritual, onDelete }: RitualCardProps) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const getStatusStyle = (status: string) => {
    switch (status) {
      case "on_track": return "bg-green-50 text-green-800 border-green-200";
      case "overdue": return "bg-amber-50 text-amber-800 border-amber-200";
      case "needs_scheduling": return "bg-secondary text-secondary-foreground border-secondary-border";
      default: return "bg-secondary text-secondary-foreground border-secondary-border";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "on_track": return "Blooming";
      case "overdue": return "Needs tending";
      case "needs_scheduling": return "Just planted";
      default: return "";
    }
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setConfirming(true);
  };

  const handleConfirmDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDeleting(true);
    try {
      await fetch(`/api/rituals/${ritual.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      onDelete?.(ritual.id);
    } catch {
      setDeleting(false);
      setConfirming(false);
    }
  };

  const handleCancelDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setConfirming(false);
  };

  return (
    <div className="relative group">
      <Link href={`/ritual/${ritual.id}`} className="block focus:outline-none">
        <div className="h-full bg-card rounded-2xl p-6 border border-card-border shadow-[var(--shadow-warm-sm)] hover:shadow-[var(--shadow-warm-md)] hover:-translate-y-1 transition-all duration-300 ease-out flex flex-col focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background">

          <div className="flex justify-between items-start mb-4">
            {getStatusLabel(ritual.status) ? (
              <div className={`px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusStyle(ritual.status)}`}>
                {getStatusLabel(ritual.status)}
              </div>
            ) : <div />}
            <StreakBadge count={ritual.streak} size="sm" />
          </div>

          <h3 className="font-serif text-2xl mb-2 text-foreground group-hover:text-primary transition-colors">
            {ritual.name}
          </h3>

          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mb-6">
            <div className="flex items-center gap-1.5">
              <Calendar size={14} />
              <span className="capitalize">{ritual.frequency}</span>
            </div>
            {ritual.nextMeetupDate && (
              <div className="flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-border" />
                <span>Next: {format(parseISO(ritual.nextMeetupDate), "MMM d")}</span>
              </div>
            )}
          </div>

          <div className="mt-auto pt-5 border-t border-border/50 flex items-center justify-between">
            <div className="flex -space-x-2">
              {ritual.participants.slice(0, 4).map((p, i) => (
                <div
                  key={i}
                  className="w-8 h-8 rounded-full border-2 border-card bg-primary/10 flex items-center justify-center text-xs font-medium text-primary shadow-sm"
                  title={p.name}
                >
                  {p.name.charAt(0).toUpperCase()}
                </div>
              ))}
              {ritual.participants.length > 4 && (
                <div className="w-8 h-8 rounded-full border-2 border-card bg-secondary flex items-center justify-center text-xs font-medium text-muted-foreground shadow-sm">
                  +{ritual.participants.length - 4}
                </div>
              )}
            </div>

            <div className="w-8 h-8 rounded-full bg-secondary group-hover:bg-primary flex items-center justify-center text-muted-foreground group-hover:text-primary-foreground transition-colors duration-300">
              <ArrowRight size={16} />
            </div>
          </div>
        </div>
      </Link>

      {onDelete && !confirming && (
        <button
          onClick={handleDeleteClick}
          className="absolute top-4 right-4 w-7 h-7 rounded-full bg-background border border-border flex items-center justify-center text-muted-foreground hover:text-destructive hover:border-destructive/40 opacity-0 group-hover:opacity-100 transition-all duration-200 shadow-sm z-10"
          title="Delete ritual"
        >
          <Trash2 size={13} />
        </button>
      )}

      {confirming && (
        <div
          className="absolute inset-0 bg-card/95 backdrop-blur-sm rounded-2xl border border-destructive/20 flex flex-col items-center justify-center gap-4 p-6 z-20"
          onClick={(e) => e.preventDefault()}
        >
          <div className="text-3xl">🌿</div>
          <p className="text-foreground font-medium text-center text-sm leading-snug">
            Archive <span className="font-semibold">{ritual.name}</span>?
          </p>
          <p className="text-muted-foreground text-xs text-center">
            This will permanently remove the ritual and all its history.
          </p>
          <div className="flex gap-3 w-full">
            <button
              onClick={handleCancelDelete}
              className="flex-1 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Keep it
            </button>
            <button
              onClick={handleConfirmDelete}
              disabled={deleting}
              className="flex-1 py-2 rounded-xl bg-destructive text-destructive-foreground text-sm font-medium hover:bg-destructive/90 disabled:opacity-60 transition-colors"
            >
              {deleting ? "Removing..." : "Yes, remove"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
