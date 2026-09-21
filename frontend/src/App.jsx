import { Routes, Route, Navigate, Outlet, useLocation, useNavigate, useOutletContext } from 'react-router-dom';

import AuthProvider from './auth/AuthProvider';
import { useAuth } from './auth/useAuth';
import { useScanSession } from './hooks/useScanSession';
import { usePatientProfile } from './hooks/usePatientProfile';

import Login from './pages/Login';
import Signup from './pages/Signup';
import VerifyEmail from './pages/VerifyEmail';
import ForgotPassword from './pages/ForgotPassword';
import Dashboard from './pages/Dashboard';
import PatientDetailsPage from './pages/PatientDetailsPage';
import DetailedReportPage from './pages/DetailedReportPage';

function FullScreenMessage({ children }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 text-slate-500 text-sm font-semibold" role="status">
      {children}
    </div>
  );
}

/* ---------------------------- Public (auth) routes ---------------------------- */

// Signed-in users have no business on these pages.
function PublicOnly({ children }) {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <FullScreenMessage>Loading…</FullScreenMessage>;
  if (status === 'authenticated') return <Navigate to={location.state?.from || '/'} replace />;
  return children;
}

function LoginRoute() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const { state } = useLocation();
  return (
    <Login
      onLogin={signIn}
      notice={state?.notice}
      onForgotPassword={() => navigate('/forgot-password')}
      onGoToSignup={() => navigate('/signup')}
      onNeedsVerification={(email) => navigate('/verify', { state: { email } })}
    />
  );
}

function SignupRoute() {
  const navigate = useNavigate();
  return <Signup onSignup={(email) => navigate('/verify', { state: { email } })} onGoToLogin={() => navigate('/login')} />;
}

function ForgotPasswordRoute() {
  const navigate = useNavigate();
  return (
    <ForgotPassword
      onDone={(notice) => navigate('/login', { state: { notice } })}
      onBackToLogin={() => navigate('/login')}
    />
  );
}

function VerifyRoute() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const { state } = useLocation();
  if (!state?.email) return <Navigate to="/signup" replace />;
  return <VerifyEmail email={state.email} onVerified={signIn} onBack={() => navigate('/signup')} />;
}

/* --------------------------- Protected application --------------------------- */

function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <FullScreenMessage>Restoring your session…</FullScreenMessage>;
  if (status !== 'authenticated') return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <AppShell />;
}

// Holds the state that must survive moving between pages (uploads, results, patient profile).
// It only mounts while signed in, so signing out discards all of it.
function AppShell() {
  const { user } = useAuth();
  const session = useScanSession();
  const [patient, setPatient] = usePatientProfile(user);
  return <Outlet context={{ user, session, patient, setPatient }} />;
}

function DashboardRoute() {
  const { user, session, patient } = useOutletContext();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  return (
    <Dashboard
      user={user}
      patient={patient}
      session={session}
      onEditPatient={() => navigate('/patient-details')}
      onViewDetailedReport={() => navigate('/report')}
      onLogout={signOut}
    />
  );
}

function PatientRoute() {
  const { patient, setPatient } = useOutletContext();
  const navigate = useNavigate();
  return (
    <PatientDetailsPage
      initialData={patient}
      onSubmit={(data) => {
        setPatient(data);
        navigate('/');
      }}
    />
  );
}

function ReportRoute() {
  const { patient, session } = useOutletContext();
  const navigate = useNavigate();
  return <DetailedReportPage patient={patient} session={session} onBack={() => navigate('/')} />;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<PublicOnly><LoginRoute /></PublicOnly>} />
        <Route path="/signup" element={<PublicOnly><SignupRoute /></PublicOnly>} />
        <Route path="/verify" element={<PublicOnly><VerifyRoute /></PublicOnly>} />
        <Route path="/forgot-password" element={<PublicOnly><ForgotPasswordRoute /></PublicOnly>} />

        <Route element={<RequireAuth />}>
          <Route path="/" element={<DashboardRoute />} />
          <Route path="/patient-details" element={<PatientRoute />} />
          <Route path="/report" element={<ReportRoute />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
