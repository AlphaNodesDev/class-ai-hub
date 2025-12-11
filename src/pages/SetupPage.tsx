import React, { useState } from 'react';
import { seedTestData, testCredentials } from '@/lib/seedData';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { Database, CheckCircle2, Loader2, Building2, Users, GraduationCap, Copy } from 'lucide-react';

const SetupPage: React.FC = () => {
  const [isSeeding, setIsSeeding] = useState(false);
  const [isSeeded, setIsSeeded] = useState(false);
  const navigate = useNavigate();

  const handleSeedData = async () => {
    setIsSeeding(true);
    try {
      const result = await seedTestData();
      if (result.success) {
        toast.success('Test data created successfully!');
        setIsSeeded(true);
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      toast.error('Failed to seed data');
      console.error(error);
    } finally {
      setIsSeeding(false);
    }
  };

  const copyCredentials = (email: string, password: string) => {
    navigator.clipboard.writeText(`${email} / ${password}`);
    toast.success('Credentials copied!');
  };

  const credentials = [
    { role: 'Institution Admin', icon: Building2, color: 'from-cyan-500 to-blue-500', ...testCredentials.institution },
    { role: 'Teacher', icon: Users, color: 'from-emerald-500 to-teal-500', ...testCredentials.teacher },
    { role: 'Student', icon: GraduationCap, color: 'from-violet-500 to-purple-500', ...testCredentials.student },
  ];

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-2xl space-y-6 animate-slide-up">
        <div className="text-center space-y-3">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-primary flex items-center justify-center">
            <Database className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold">Setup Class360</h1>
          <p className="text-muted-foreground font-body">
            Initialize test data in Firebase to get started
          </p>
        </div>

        <Card variant="glass">
          <CardHeader>
            <CardTitle>Initialize Test Data</CardTitle>
            <CardDescription>
              This will create test users, classes, videos, and questions in your Firebase database.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              onClick={handleSeedData}
              disabled={isSeeding || isSeeded}
              className="w-full"
              size="lg"
            >
              {isSeeding ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating test data...
                </>
              ) : isSeeded ? (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Data Created!
                </>
              ) : (
                <>
                  <Database className="w-4 h-4" />
                  Create Test Data
                </>
              )}
            </Button>

            {isSeeded && (
              <p className="text-sm text-success text-center font-body">
                ✓ Users, classes, videos, and questions have been added to Firebase
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Test Credentials</CardTitle>
            <CardDescription>
              Use these accounts to test different user roles
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {credentials.map((cred) => {
              const Icon = cred.icon;
              return (
                <div
                  key={cred.role}
                  className="flex items-center justify-between p-4 rounded-lg bg-secondary/50"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${cred.color} flex items-center justify-center`}>
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{cred.role}</p>
                      <p className="text-xs text-muted-foreground font-body">
                        {cred.email}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyCredentials(cred.email, cred.password)}
                  >
                    <Copy className="w-4 h-4 mr-1" />
                    Copy
                  </Button>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={() => navigate('/login')}>
            Go to Login
          </Button>
          <Button className="flex-1" onClick={() => navigate('/dashboard')} disabled={!isSeeded}>
            Open Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
};

export default SetupPage;
