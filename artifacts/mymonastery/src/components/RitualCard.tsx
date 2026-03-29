import { Link } from "wouter";
import { format, parseISO } from "date-fns";
import { Users, Calendar, ArrowRight } from "lucide-react";
import { Ritual } from "@workspace/api-client-react";
import { StreakBadge } from "./StreakBadge";

export function RitualCard({ ritual }: { ritual: Ritual }) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case "on_track": return "bg-green-100 text-green-800 border-green-200";
      case "overdue": return "bg-destructive/10 text-destructive border-destructive/20";
      case "needs_scheduling": return "bg-yellow-100 text-yellow-800 border-yellow-200";
      default: return "bg-secondary text-secondary-foreground border-secondary-border";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "on_track": return "On Track";
      case "overdue": return "Overdue";
      case "needs_scheduling": return "Needs Scheduling";
      default: return status;
    }
  };

  return (
    <Link href={`/ritual/${ritual.id}`} className="block group focus:outline-none">
      <div className="h-full bg-card rounded-2xl p-6 border border-card-border shadow-[var(--shadow-warm-sm)] hover:shadow-[var(--shadow-warm-md)] hover:-translate-y-1 transition-all duration-300 ease-out flex flex-col group-focus-visible:ring-2 group-focus-visible:ring-primary group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-background">
        
        <div className="flex justify-between items-start mb-4">
          <div className={`px-2.5 py-1 rounded-md text-xs font-medium border ${getStatusColor(ritual.status)}`}>
            {getStatusLabel(ritual.status)}
          </div>
          <StreakBadge count={ritual.streak} size="sm" />
        </div>

        <h3 className="font-serif text-2xl mb-2 text-foreground group-hover:text-primary transition-colors">
          {ritual.name}
        </h3>
        
        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mb-6">
          <div className="flex items-center gap-1.5">
            <Calendar size={16} />
            <span className="capitalize">{ritual.frequency}</span>
          </div>
          {ritual.nextMeetupDate && (
            <div className="flex items-center gap-1.5">
              <span className="w-1 h-1 rounded-full bg-border" />
              <span>Next: {format(parseISO(ritual.nextMeetupDate), "MMM d")}</span>
            </div>
          )}
        </div>

        <div className="mt-auto pt-6 border-t border-border/50 flex items-center justify-between">
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
  );
}
