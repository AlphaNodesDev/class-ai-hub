import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import InstitutionDashboard from '@/components/dashboards/InstitutionDashboard';
import TeacherDashboard from '@/components/dashboards/TeacherDashboard';
import StudentDashboard from '@/components/dashboards/StudentDashboard';

const Dashboard: React.FC = () => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-primary animate-pulse-glow" />
          <p className="text-muted-foreground font-body">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  switch (user.role) {
    case 'institution':
      return <InstitutionDashboard />;
    case 'faculty':
      return <TeacherDashboard />;
    case 'student':
      return <StudentDashboard />;
    default:
      return <Navigate to="/login" replace />;
  }
};

export default Dashboard;
