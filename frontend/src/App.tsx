import { AuthProvider } from "./auth/AuthProvider";
import RequireAuth from "./components/RequireAuth";

import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

import OutreachPage from "./pages/OutreachPage.tsx";
import Login from "./pages/Login";
import DashboardLayout from "./components/DashboardLayout";
import DashboardPage from "./pages/DashboardPage";
import DonorsPage from "./pages/DonorsPage.tsx";
import DonorDetails from "./pages/DonorDetails";
import FollowUpsPage from "./pages/FollowUpsPage";
import ImportsPage from "./pages/ImportsPage";

export default function App() {
  return (
    <AuthProvider>
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={<Navigate to="/login" replace />}
        />

        <Route path="/login" element={<Login />} />

        <Route
          path="/:role"
          element={
            <RequireAuth>
              <DashboardLayout />
            </RequireAuth>
          }
        >
          <Route
            index
            element={<Navigate to="overview" replace />}
          />

          {/* Donor Directory */}
          <Route
            path="donors"
            element={<DonorsPage />}
          />

          {/* Individual Donor */}
          <Route
            path="donors/:donorId"
            element={<DonorDetails />}
          />
          
          {/* Follow Up Page*/}
          <Route
            path="followups"
            element={<FollowUpsPage />}
          />

          {/* Outreach Page*/}

          <Route
            path="outreach"
            element={<OutreachPage />} 
          />

          {/* CSV / Excel imports (admin and fundraising) */}
          <Route
            path="imports"
            element={<ImportsPage />}
          />

          {/* Other Dashboard Sections */}
          <Route
            path=":section"
            element={<DashboardPage />}
          />
        </Route>

        <Route
          path="*"
          element={<Navigate to="/login" replace />}
        />
      </Routes>
    </BrowserRouter>
    </AuthProvider>
  );
}
