import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import Onboarding from "./pages/onboarding";
import Dashboard from "./pages/dashboard";
import CreateRitual from "./pages/create";
import RitualDetail from "./pages/ritual-detail";
import RitualSchedule from "./pages/ritual-schedule";
import GuestSchedule from "./pages/guest-schedule";
import InvitePage from "./pages/invite";
import People from "./pages/people";
import PersonProfile from "./pages/person";
import MomentPlant from "./pages/moment-plant";
import MomentPostPage from "./pages/moment-post";

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
      <Route path="/create" component={CreateRitual} />
      <Route path="/ritual/:id/schedule" component={RitualSchedule} />
      <Route path="/ritual/:id/moment/plant" component={MomentPlant} />
      <Route path="/ritual/:id" component={RitualDetail} />
      <Route path="/schedule/:token" component={GuestSchedule} />
      <Route path="/invite/:token" component={InvitePage} />
      <Route path="/moment/:momentToken/:userToken" component={MomentPostPage} />
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
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
