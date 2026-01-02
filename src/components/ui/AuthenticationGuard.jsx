import React, { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

const AuthenticationGuard = ({ children }) => {
  const location = useLocation();
  const isAuthenticated = localStorage.getItem('isAuthenticated') === 'true';
  const userProfile = JSON.parse(localStorage.getItem('userProfile') || '{}');

  useEffect(() => {
    if (!isAuthenticated && location?.pathname !== '/login') {
      localStorage.setItem('redirectPath', location?.pathname);
    }
  }, [isAuthenticated, location?.pathname]);

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!userProfile?.role || !userProfile?.email) {
    localStorage.removeItem('isAuthenticated');
    localStorage.removeItem('userProfile');
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

export default AuthenticationGuard;