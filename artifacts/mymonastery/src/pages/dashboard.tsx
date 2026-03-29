import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Plus, Coffee } from "lucide-react";
import { motion } from "framer-motion";
import { useListRituals } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/layout";
import { RitualCard } from "@/components/RitualCard";

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const { data: rituals, isLoading } = useListRituals({ ownerId: user?.id });

  useEffect(() => {
    if (!authLoading && !user) {
      setLocation("/");
    }
  }, [user, authLoading, setLocation]);

  if (authLoading) return null;
  if (!user) return null;

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } }
  };

  return (
    <Layout>
      <div className="flex flex-col h-full w-full">
        <div className="flex items-end justify-between mb-12">
          <div>
            <h1 className="text-4xl md:text-5xl font-serif text-foreground tracking-tight">
              Your Village, <span className="italic text-primary">{user.name}</span>
            </h1>
            <p className="mt-3 text-lg text-muted-foreground">
              The rituals that hold your community together.
            </p>
          </div>
          
          <Link href="/create" className="hidden md:flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-full font-medium shadow-[var(--shadow-warm-md)] hover:shadow-[var(--shadow-warm-lg)] hover:-translate-y-0.5 active:translate-y-0 transition-all duration-300">
            <Plus size={20} />
            <span>New Ritual</span>
          </Link>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-64 rounded-2xl bg-card border border-border animate-pulse" />
            ))}
          </div>
        ) : rituals && rituals.length > 0 ? (
          <motion.div 
            variants={container}
            initial="hidden"
            animate="show"
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {rituals.map((ritual) => (
              <motion.div key={ritual.id} variants={item}>
                <RitualCard ritual={ritual} />
              </motion.div>
            ))}
          </motion.div>
        ) : (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex-1 flex flex-col items-center justify-center text-center max-w-md mx-auto py-12"
          >
            <div className="w-48 h-48 mb-8 rounded-full overflow-hidden shadow-lg border-4 border-white">
              <img 
                src={`${import.meta.env.BASE_URL}images/empty-village.png`} 
                alt="Empty village illustration" 
                className="w-full h-full object-cover"
              />
            </div>
            <h3 className="font-serif text-2xl text-foreground mb-3">Quiet streets today</h3>
            <p className="text-muted-foreground mb-8">
              Every village starts with a single gathering. Create your first ritual to begin coordinating with your people.
            </p>
            <Link href="/create" className="inline-flex items-center gap-2 px-8 py-4 bg-primary text-primary-foreground rounded-full font-medium text-lg shadow-[var(--shadow-warm-md)] hover:shadow-[var(--shadow-warm-lg)] hover:-translate-y-0.5 active:translate-y-0 transition-all duration-300">
              <Coffee size={20} />
              <span>Gather the village</span>
            </Link>
          </motion.div>
        )}

        {/* Mobile FAB */}
        <Link href="/create" className="md:hidden fixed bottom-6 right-6 w-14 h-14 bg-primary text-primary-foreground rounded-full flex items-center justify-center shadow-xl hover:scale-105 active:scale-95 transition-transform z-50">
          <Plus size={24} />
        </Link>
      </div>
    </Layout>
  );
}
