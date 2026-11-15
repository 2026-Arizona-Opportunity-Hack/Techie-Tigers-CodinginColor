import { AuthProvider } from "./auth/AuthProvider";
import RequireAuth from "./components/RequireAuth";

import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useParams,
} from "react-router-dom";

import OutreachPage from "./pages/OutreachPage.tsx";
import Login from "./pages/Login";
import DashboardLayout from "./components/DashboardLayout";
import DonorsPage from "./pages/DonorsPage.tsx";
import DonorDetails from "./pages/DonorDetails";
import FollowUpsPage from "./pages/FollowUpsPage";
import ImportsPage from "./pages/ImportsPage";
import RetentionPage from "./pages/RetentionPage";
import OverviewPage from "./pages/OverviewPage";
import DuplicatesPage from "./pages/DuplicatesPage";
import ApiKeysPage from "./pages/ApiKeysPage";
import ProgramsPage from "./pages/ProgramsPage";
import BoardMembersPage from "./pages/BoardMembersPage";
import BoardMemberPage from "./pages/BoardMemberPage";

// Absolute on purpose: a relative "overview" inside a "*" route would resolve
// to /board/history/overview and redirect forever.
function ToOverview() {
  const { role } = useParams();
  return <Navigate to={`/${role}/overview`} replace />;
}

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

          {/* CSV / Excel imports (admin only) */}
          <Route
            path="imports"
            element={<ImportsPage />}
          />

          {/* Year-over-year retention */}
          <Route
            path="retention"
            element={<RetentionPage />}
          />

          {/* Duplicate review (CEO) */}
          <Route
            path="duplicates"
            element={<DuplicatesPage />}
          />

          {/* Overview (every role) */}
          <Route
            path="overview"
            element={<OverviewPage />}
          />

          {/* Board members (admin and fundraising) */}
          <Route
            path="members"
            element={<BoardMembersPage />}
          />
          <Route
            path="members/:memberId"
            element={<BoardMemberPage />}
          />

          {/* API keys for the org dashboard (admin only) */}
          <Route
            path="api-keys"
            element={<ApiKeysPage />}
          />

          {/* Programs & outcomes for updates and funder packets (admin only) */}
          <Route
            path="programs"
            element={<ProgramsPage />}
          />

          {/* Unknown or old links (e.g. /board/history) go to the Overview */}
          <Route
            path="*"
            element={<ToOverview />}
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
