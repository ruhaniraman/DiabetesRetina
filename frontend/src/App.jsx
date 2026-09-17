import React, { useState } from 'react';
import Login from './Login';
import Signup from './Signup';
import Dashboard from './Dashboard';

export default function App() {
  const [currentView, setCurrentView] = useState('login'); // 'login' | 'signup' | 'dashboard'
  const [user, setUser] = useState(null);
  const [lang, setLang] = useState('en');

  const handleLogin = (credentials) => {
    setUser(credentials);
    setCurrentView('dashboard');
  };

  const handleSignup = (userData) => {
    setUser(userData);
    setCurrentView('dashboard');
  };

  const handleLogout = () => {
    setUser(null);
    setCurrentView('login');
  };

  return (
    <main>
      {currentView === 'login' && (
        <Login 
          onLogin={handleLogin} 
          onSwitchToSignup={() => setCurrentView('signup')} 
          lang={lang} 
          setLang={setLang} 
        />
      )}

      {currentView === 'signup' && (
        <Signup 
          onSignup={handleSignup} 
          onSwitchToLogin={() => setCurrentView('login')} 
          lang={lang} 
          setLang={setLang} 
        />
      )}

      {currentView === 'dashboard' && (
        <Dashboard 
          user={user} 
          onLogout={handleLogout} 
          lang={lang} 
          setLang={setLang} 
        />
      )}
    </main>
  );
}