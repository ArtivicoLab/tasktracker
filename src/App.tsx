import { useEffect, useState } from "react";
import { useRoute } from "./router";
import { Header } from "./components/Header";
import { TabBar } from "./components/TabBar";
import { Sidebar } from "./components/Sidebar";
import { DemoBanner } from "./components/DemoBanner";
import { ReconnectBanner } from "./components/ReconnectBanner";
import { UpdatePrompt } from "./components/UpdatePrompt";
import { Toaster } from "./components/Toast";
import { ConfirmHost } from "./components/ConfirmDialog";
import { Celebration } from "./components/Celebration";
import { TabNotifier } from "./components/TabNotifier";
import { DashboardScreen } from "./features/dashboard/DashboardScreen";
import { TasksScreen } from "./features/tasks/TasksScreen";
import { CalendarScreen } from "./features/calendar/CalendarScreen";
import { RecurringScreen } from "./features/recurring/RecurringScreen";
import { MoreScreen } from "./features/more/MoreScreen";
import { PrivacyScreen } from "./features/privacy/PrivacyScreen";
import { WhatsNewScreen } from "./features/whatsnew/WhatsNewScreen";
import { SettingsScreen } from "./features/settings/SettingsScreen";
import { bootstrap } from "./stores/bootstrap";
import { preloadGis } from "./lib/google/auth";
import { CoachTour, hasSeenTour } from "./components/CoachTour";

export default function App() {
  const route = useRoute();
  const [ready, setReady] = useState(false);
  const [showTour, setShowTour] = useState(false);

  useEffect(() => {
    bootstrap().then(() => {
      setReady(true);
      if (!hasSeenTour()) setShowTour(true);
    });
    preloadGis();
  }, []);

  function replayTour() {
    setShowTour(true);
  }

  if (!ready) {
    return (
      <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center" }}>
        <div className="muted">Loading…</div>
      </div>
    );
  }

  return (
    <div className={`app${route === "dashboard" ? " app--dashboard" : ""}`}>
      <div className="grain" aria-hidden />
      <Sidebar active={route} onCoachTour={replayTour} />
      <div className="app__col">
        <Header onCoachTour={replayTour} />
        <DemoBanner />
        <ReconnectBanner />
        <main className={`app__main${route === "dashboard" ? " app__main--wide" : ""}`} key={route}>
          {route === "dashboard" && <DashboardScreen />}
          {route === "tasks" && <TasksScreen />}
          {route === "calendar" && <CalendarScreen />}
          {route === "recurring" && <RecurringScreen />}
          {route === "more" && <MoreScreen />}
          {route === "privacy" && <PrivacyScreen />}
          {route === "whatsnew" && <WhatsNewScreen />}
          {route === "settings" && <SettingsScreen />}
        </main>
      </div>
      <TabBar active={route} />
      <UpdatePrompt />
      <TabNotifier />
      <Toaster />
      <ConfirmHost />
      <Celebration />
      {showTour && <CoachTour onDone={() => setShowTour(false)} />}
    </div>
  );
}
