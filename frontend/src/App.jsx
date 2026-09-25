import { Routes, Route, Navigate, Outlet, useLocation, useNavigate, useOutletContext } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import AuthProvider from './auth/AuthProvider';
import { useAuth } from './auth/useAuth';
import { useScanSession } from './hooks/useScanSession';
import { usePatientProfile } from './hooks/usePatientProfile';
import { useExamHistory } from './hooks/useExamHistory';

import Login from './pages/Login';
import Signup from './pages/Signup';
import VerifyEmail from './pages/VerifyEmail';
import ForgotPassword from './pages/ForgotPassword';
import Dashboard from './pages/Dashboard';
import PatientDetailsPage from './pages/PatientDetailsPage';
import DetailedReportPage from './pages/DetailedReportPage';
import DistrictPlannerPage from './pages/DistrictPlannerPage';
import SpecialistReviewPage from './pages/SpecialistReviewPage';
import EvidencePage from './pages/EvidencePage';
import TourProvider from './tour/TourProvider';
import { useTour } from './tour/tourContext';

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
  const { t } = useTranslation();
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <FullScreenMessage>{t('common.loading')}</FullScreenMessage>;
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
  const { t } = useTranslation();
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <FullScreenMessage>{t('common.restoring')}</FullScreenMessage>;
  if (status !== 'authenticated') return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <AppShell />;
}

// Holds the state that must survive moving between pages (uploads, results, profile, exam history).
// It only mounts while signed in, so signing out discards all of it.
function AppShell() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const session = useScanSession();
  const profile = usePatientProfile(user);
  const history = useExamHistory(session.assessment);
  if (profile.status === 'loading') return <FullScreenMessage>{t('common.loadingProfile')}</FullScreenMessage>;
  return (
    <TourProvider session={session}>
      <Outlet context={{ user, session, profile, history }} />
    </TourProvider>
  );
}

function DashboardRoute() {
  const { user, session, profile, history } = useOutletContext();
  const { signOut, deleteAccount } = useAuth();
  const tour = useTour();
  const navigate = useNavigate();
  return (
    <Dashboard
      user={user}
      patient={profile.patient}
      session={session}
      history={history}
      onEditPatient={() => navigate('/patient-details')}
      onViewDetailedReport={() => navigate('/report')}
      onOpenDistrictPlanner={() => navigate('/district')}
      onOpenReview={() => navigate('/review')}
      onOpenEvidence={() => navigate('/evidence')}
      onStartTour={tour?.start}
      onLogout={signOut}
      onDeleteAccount={deleteAccount}
    />
  );
}

function PatientRoute() {
  const { profile, history } = useOutletContext();
  const navigate = useNavigate();
  return (
    <PatientDetailsPage
      initialData={profile.patient}
      onSubmit={async (data) => {
        await profile.save(data);
        navigate('/');
      }}
      onErase={async () => {
        await profile.eraseAll();
        history.clear();
        navigate('/');
      }}
      onCancel={() => navigate('/')}
    />
  );
}

function ReportRoute() {
  const { profile, session } = useOutletContext();
  const navigate = useNavigate();
  return <DetailedReportPage patient={profile.patient} session={session} onBack={() => navigate('/')} />;
}

function DistrictRoute() {
  const navigate = useNavigate();
  return <DistrictPlannerPage onBack={() => navigate('/')} />;
}

function ReviewRoute() {
  const { session } = useOutletContext();
  const navigate = useNavigate();
  return <SpecialistReviewPage session={session} onBack={() => navigate('/')} />;
}

function EvidenceRoute() {
  const navigate = useNavigate();
  return <EvidencePage onBack={() => navigate('/')} />;
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
          <Route path="/district" element={<DistrictRoute />} />
          <Route path="/review" element={<ReviewRoute />} />
          <Route path="/evidence" element={<EvidenceRoute />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
