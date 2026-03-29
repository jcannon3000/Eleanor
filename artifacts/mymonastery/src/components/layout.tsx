import { ReactNode } from "react";
import { Link } from "wouter";
import { Leaf } from "lucide-react";
import { motion } from "framer-motion";

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden">
      <header className="absolute top-0 w-full z-10 p-6 md:p-8 flex justify-between items-center max-w-7xl mx-auto">
        <Link href="/dashboard" className="flex items-center gap-3 group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-md">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-300">
            <Leaf size={20} strokeWidth={1.5} />
          </div>
          <span className="font-serif text-xl tracking-tight text-foreground group-hover:text-primary transition-colors">
            MyMonastery
          </span>
        </Link>
      </header>
      
      <main className="flex-1 flex flex-col pt-24 pb-12 px-4 sm:px-6 md:px-8 max-w-7xl mx-auto w-full">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="flex-1 flex flex-col w-full h-full"
        >
          {children}
        </motion.div>
      </main>
    </div>
  );
}
