import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";
import { useUpsertUser } from "@workspace/api-client-react";
import { setLocalUser, getLocalUser } from "@/lib/user";
import { Layout } from "@/components/layout";
import { useToast } from "@/hooks/use-toast";

export default function Onboarding() {
  const [, setLocation] = useLocation();
  const [name, setName] = useState("");
  const { toast } = useToast();
  const upsertMutation = useUpsertUser();

  // Redirect if already logged in
  useEffect(() => {
    if (getLocalUser()) {
      setLocation("/dashboard");
    }
  }, [setLocation]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      const email = `${name.toLowerCase().replace(/[^a-z0-9]/g, "")}@mymonastery.local`;
      const user = await upsertMutation.mutateAsync({
        data: { name: name.trim(), email }
      });
      
      setLocalUser({ id: user.id, name: user.name, email: user.email });
      setLocation("/dashboard");
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Something went wrong",
        description: "Failed to create your profile. Please try again.",
      });
    }
  };

  return (
    <Layout>
      <div className="flex-1 flex flex-col md:flex-row items-center justify-center gap-12 lg:gap-24 max-w-5xl mx-auto w-full">
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, delay: 0.1 }}
          className="flex-1 text-center md:text-left"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 text-accent text-sm font-medium mb-6">
            <Sparkles size={14} />
            <span>Welcome to the village</span>
          </div>
          
          <h1 className="text-5xl md:text-6xl font-serif text-foreground leading-tight mb-6">
            Maintain your most <br/><span className="text-primary italic">sacred rituals</span>.
          </h1>
          
          <p className="text-lg text-muted-foreground mb-10 max-w-md mx-auto md:mx-0 leading-relaxed">
            MyMonastery helps you hold space for the people who matter. An AI elder coordinates the logistics, so you can focus on the connection.
          </p>

          <form onSubmit={handleSubmit} className="relative max-w-sm mx-auto md:mx-0">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="What is your name?"
              className="w-full px-6 py-4 rounded-2xl bg-card border-2 border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all duration-300 text-lg shadow-sm"
              disabled={upsertMutation.isPending}
            />
            <button
              type="submit"
              disabled={!name.trim() || upsertMutation.isPending}
              className="absolute right-2 top-2 bottom-2 aspect-square rounded-xl bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 hover:scale-105 active:scale-95 transition-all duration-200 disabled:opacity-50 disabled:hover:scale-100 shadow-[0_4px_10px_rgba(45,74,62,0.2)]"
            >
              <ArrowRight size={20} />
            </button>
          </form>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, delay: 0.3 }}
          className="flex-1 hidden md:block w-full"
        >
          <div className="relative rounded-[2rem] overflow-hidden aspect-[4/3] shadow-[var(--shadow-warm-xl)] border border-white/20">
            <div className="absolute inset-0 bg-primary/5 mix-blend-multiply pointer-events-none z-10" />
            <img 
              src={`${import.meta.env.BASE_URL}images/onboarding-hero.png`} 
              alt="Abstract connection art" 
              className="w-full h-full object-cover"
            />
          </div>
        </motion.div>
      </div>
    </Layout>
  );
}
