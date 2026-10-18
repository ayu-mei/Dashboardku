import { useState } from "react";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import DashboardLayout from "./layouts/DashboardLayout";
import { signOut } from "./services/auth";
export default function App() {
  const [loggedIn, setLoggedIn] = useState(false),
    [page, setPage] = useState("dashboard");
  async function logout() {
    try {
      await signOut();
    } catch {
      /* Local session is always cleared. */
    } finally {
      setLoggedIn(false);
      setPage("dashboard");
    }
  }
  return loggedIn ? (
    <DashboardLayout page={page} onPage={setPage} onLogout={logout}>
      <DashboardPage page={page} />
    </DashboardLayout>
  ) : (
    <LoginPage onLogin={() => setLoggedIn(true)} />
  );
}
