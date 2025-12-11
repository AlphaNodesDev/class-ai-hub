import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Building2, GraduationCap, Users, Eye, EyeOff, Loader2 } from 'lucide-react';

type Role = 'institution' | 'faculty' | 'student';

const roleConfig = {
  institution: {
    icon: Building2,
    label: 'Institution',
    description: 'Manage teachers, students & classes',
    color: 'from-cyan-500 to-blue-500',
  },
  faculty: {
    icon: Users,
    label: 'Teacher',
    description: 'Record lectures & manage content',
    color: 'from-emerald-500 to-teal-500',
  },
  student: {
    icon: GraduationCap,
    label: 'Student',
    description: 'Watch lectures & access notes',
    color: 'from-violet-500 to-purple-500',
  },
};

const LoginPage: React.FC = () => {
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Please enter email and password');
      return;
    }

    setIsLoading(true);
    const result = await login(email, password);
    setIsLoading(false);

    if (result.success) {
      toast.success('Login successful!');
      navigate('/dashboard');
    } else {
      toast.error(result.error || 'Login failed');
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Animated background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/10 rounded-full blur-3xl animate-float" />
        <div className="absolute top-1/2 -left-40 w-96 h-96 bg-accent/10 rounded-full blur-3xl animate-float" style={{ animationDelay: '2s' }} />
        <div className="absolute -bottom-40 right-1/3 w-72 h-72 bg-primary/5 rounded-full blur-3xl animate-float" style={{ animationDelay: '4s' }} />
      </div>

      {/* Header */}
      <header className="relative z-10 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-lg">C</span>
          </div>
          <div>
            <h1 className="text-xl font-bold gradient-text">Class360</h1>
            <p className="text-xs text-muted-foreground">AI-Powered Learning</p>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="relative z-10 flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-4xl animate-slide-up">
          {!selectedRole ? (
            <div className="space-y-8">
              <div className="text-center space-y-3">
                <h2 className="text-4xl font-bold">Welcome Back</h2>
                <p className="text-muted-foreground text-lg font-body">
                  Select your role to continue
                </p>
              </div>

              <div className="grid md:grid-cols-3 gap-4">
                {(Object.entries(roleConfig) as [Role, typeof roleConfig.institution][]).map(([role, config]) => {
                  const Icon = config.icon;
                  return (
                    <Card
                      key={role}
                      variant="interactive"
                      className="group relative overflow-hidden"
                      onClick={() => setSelectedRole(role)}
                    >
                      <div className={`absolute inset-0 bg-gradient-to-br ${config.color} opacity-0 group-hover:opacity-10 transition-opacity duration-300`} />
                      <CardHeader className="text-center pb-2">
                        <div className={`w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br ${config.color} flex items-center justify-center mb-3 group-hover:scale-110 transition-transform duration-300`}>
                          <Icon className="w-8 h-8 text-white" />
                        </div>
                        <CardTitle className="text-lg">{config.label}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <CardDescription className="text-center">
                          {config.description}
                        </CardDescription>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              <p className="text-center text-sm text-muted-foreground font-body">
                Don't have an account? Contact your institution administrator.
              </p>
            </div>
          ) : (
            <Card variant="glass" className="max-w-md mx-auto">
              <CardHeader className="text-center">
                <button
                  onClick={() => setSelectedRole(null)}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors mb-4 flex items-center gap-2 mx-auto"
                >
                  ← Back to role selection
                </button>
                <div className={`w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br ${roleConfig[selectedRole].color} flex items-center justify-center mb-3`}>
                  {React.createElement(roleConfig[selectedRole].icon, { className: 'w-8 h-8 text-white' })}
                </div>
                <CardTitle>Sign in as {roleConfig[selectedRole].label}</CardTitle>
                <CardDescription>
                  Enter your credentials to access the dashboard
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Email</label>
                    <Input
                      type="email"
                      placeholder="Enter your email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Password</label>
                    <div className="relative">
                      <Input
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Enter your password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="current-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Signing in...
                      </>
                    ) : (
                      'Sign In'
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 px-6 py-4 text-center">
        <p className="text-sm text-muted-foreground font-body">
          © 2025 Class360 • AI-Powered Classroom Platform
        </p>
      </footer>
    </div>
  );
};

export default LoginPage;
