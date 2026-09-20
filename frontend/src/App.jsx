import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';

// Page Imports matching your src/pages directory
import Login from './pages/Login';
import Signup from './pages/Signup';
import VerifyEmail from './pages/VerifyEmail';
import PatientDetailsPage from './pages/PatientDetailsPage';
import Dashboard from './pages/Dashboard';
import DetailedReportPage from './pages/DetailedReportPage';

import { fetchMe, getToken, setToken, clearToken } from './api/auth';

/** Blocks a page until the user is signed in. */
function ProtectedRoute({ user, children }) {
  return user ? children : <Navigate to="/" replace />;
}

/** Reads the email passed via navigate('/verify-email', { state: { email } }). */
function VerifyEmailRoute({ onVerified, onBack }) {
  const { state } = useLocation();
  if (!state?.email) return <Navigate to="/signup" replace />;
  return <VerifyEmail email={state.email} onVerified={onVerified} onBack={onBack} />;
}

export default function App() {
  const navigate = useNavigate();

  // Signed-in account (null = signed out). Restored from the saved token on page load.
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(Boolean(getToken()));

  // Shared Patient State
  const [patientData, setPatientData] = useState({
    fullName: 'Jane Doe',
    age: '54',
    systolicBP: '138',
    diastolicBP: '88',
    diabetesDuration: '12'
  });

  // Restore the session if a valid token is saved.
  useEffect(() => {
    if (!getToken()) return;
    let cancelled = false;

    fetchMe()
      .then(({ user }) => {
        if (!cancelled) setUser(user);
      })
      .catch((err) => {
        if (err.status === 401) clearToken(); // expired or invalid token
      })
      .finally(() => {
        if (!cancelled) setAuthLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Called after a successful sign in or email verification.
  const startSession = (token, nextUser) => {
    setToken(token);
    setUser(nextUser);
    navigate('/patient-details');
  };

  const goToVerify = (email) => navigate('/verify-email', { state: { email } });

  const handleLogout = () => {
    clearToken();
    setUser(null);
    navigate('/');
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#eceff4] flex items-center justify-center text-xs font-bold text-slate-500">
        Loading…
      </div>
    );
  }

  return (
    <Routes>
      {/* 1. STEP ONE: Sign In (Default Route) */}
      <Route
        path="/"
        element={
          <Login
            onLogin={startSession}
            onGoToSignup={() => navigate('/signup')}
            onNeedsVerification={goToVerify}
          />
        }
      />

      {/* STEP ONE (ALT): Sign Up */}
      <Route
        path="/signup"
        element={
          <Signup
            onSignup={goToVerify}
            onGoToLogin={() => navigate('/')}
          />
        }
      />

      {/* STEP ONE (VERIFY): Confirm email with the 6-digit code */}
      <Route
        path="/verify-email"
        element={
          <VerifyEmailRoute
            onVerified={startSession}
            onBack={() => navigate('/signup')}
          />
        }
      />

      {/* 2. STEP TWO: Patient Details Onboarding */}
      <Route
        path="/patient-details"
        element={
          <ProtectedRoute user={user}>
            <PatientDetailsPage
              initialData={patientData}
              onSubmit={(data) => {
                setPatientData(data);
                navigate('/dashboard');
              }}
            />
          </ProtectedRoute>
        }
      />

      {/* 3. STEP THREE: Main Dashboard */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute user={user}>
            <Dashboard
              patientData={patientData}
              onEditPatient={() => navigate('/patient-details')}
              onViewDetailedReport={() => navigate('/report')}
              onLogout={handleLogout}
            />
          </ProtectedRoute>
        }
      />

      {/* 4. STEP FOUR: Detailed Diagnostic Report */}
      <Route
        path="/report"
        element={
          <ProtectedRoute user={user}>
            <DetailedReportPage
              patientData={patientData}
              onBack={() => navigate('/dashboard')}
            />
          </ProtectedRoute>
        }
      />

      {/* Anything else goes back to sign in */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
