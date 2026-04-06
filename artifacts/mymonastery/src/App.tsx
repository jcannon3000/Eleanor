import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Component, type ReactNode, type ErrorInfo } from "react";

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("React render error:", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, fontFamily: "monospace", background: "#FAF6F0", minHeight: "100vh" }}>
          <h2 style={{ color: "#C17F24" }}>Something went wrong</h2>
          <pre style={{ whiteSpace: "pre-wrap", color: "#2C1810", fontSize: 13 }}>
            {this.state.error.message}
            {"\n"}
            {this.state.error.stack}
          </pre>
          <button
            onClick={() => { this.setState({ error: null }); window.location.href = "/dashboard"; }}
            style={{ marginTop: 16, padding: "8px 20px", background: "#2C1810", color: "#F7F0E6", border: "none", borderRadius: 8, cursor: "pointer" }}
          >
            Back to dashboard
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

import NotFound from "@/pages/not-found";
import Onboarding from "./pages/onboarding";
import Dashboard from "./pages/dashboard";
import RitualDetail from "./pages/ritual-detail";
import RitualSchedule from "./pages/ritual-schedule";
import GuestSchedule from "./pages/guest-schedule";
import InvitePage from "./pages/invite";
import People from "./pages/people";
import PersonProfile from "./pages/person";
import TraditionNew from "./pages/tradition-new";
import LettersPage from "./pages/Letters/LettersPage";
import CorrespondencePage from "./pages/Letters/CorrespondencePage";
import WriteLetter from "./pages/Letters/WriteLetter";
import ReadLetter from "./pages/Letters/ReadLetter";
import LetterInvitePage from "./pages/Letters/InvitePage";
import LetterNew from "./pages/Letters/LetterNew";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={Onboarding} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/ritual/:id/schedule" component={RitualSchedule} />
      <Route path="/tradition/new" component={TraditionNew} />
      <Route path="/ritual/:id" component={RitualDetail} />
      <Route path="/schedule/:token" component={GuestSchedule} />
      <Route path="/invite/:token" component={InvitePage} />
      <Route path="/letters" component={LettersPage} />
      <Route path="/letters/new" component={LetterNew} />
      <Route path="/letters/invite/:token" component={LetterInvitePage} />
      <Route path="/letters/:id/write" component={WriteLetter} />
      <Route path="/letters/:id/read/:letterId" component={ReadLetter} />
      <Route path="/letters/:id" component={CorrespondencePage} />
      <Route path="/people" component={People} />
      <Route path="/people/:email" component={PersonProfile} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ErrorBoundary>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </ErrorBoundary>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
