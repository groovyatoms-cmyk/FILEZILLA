import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { Dashboard } from "./pages/Dashboard";
import { Send } from "./pages/Send";
import { Receive } from "./pages/Receive";
import { Devices } from "./pages/Devices";
import { History } from "./pages/History";
import { Settings } from "./pages/Settings";
import { ToastProvider } from "./components/ui/Toast";
import { ThemeProvider } from "./hooks/useTheme";

export function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<AppLayout />}>
              <Route index element={<Dashboard />} />
              <Route path="send" element={<Send />} />
              <Route path="receive" element={<Receive />} />
              <Route path="devices" element={<Devices />} />
              <Route path="history" element={<History />} />
              <Route path="settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </ThemeProvider>
  );
}
