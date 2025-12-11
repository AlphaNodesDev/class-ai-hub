import React, { useState, useEffect } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { dbGet, dbSet, User, ClassInfo } from '@/lib/firebase';
import { toast } from 'sonner';
import {
  Users,
  GraduationCap,
  Video,
  BookOpen,
  Plus,
  TrendingUp,
  Loader2,
} from 'lucide-react';

interface Stats {
  teachers: number;
  students: number;
  classes: number;
  videos: number;
}

const InstitutionDashboard: React.FC = () => {
  const [stats, setStats] = useState<Stats>({ teachers: 0, students: 0, classes: 0, videos: 0 });
  const [showCreateTeacher, setShowCreateTeacher] = useState(false);
  const [showCreateStudent, setShowCreateStudent] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '' });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const users = await dbGet('users') as Record<string, User> | null;
      const classes = await dbGet('classes') as Record<string, ClassInfo> | null;
      const videos = await dbGet('videos');

      const userList = users ? Object.values(users) : [];
      
      setStats({
        teachers: userList.filter(u => u.role === 'faculty').length,
        students: userList.filter(u => u.role === 'student').length,
        classes: classes ? Object.keys(classes).length : 0,
        videos: videos ? Object.keys(videos).length : 0,
      });
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const createUser = async (role: 'faculty' | 'student') => {
    if (!newUser.name || !newUser.email || !newUser.password) {
      toast.error('Please fill all fields');
      return;
    }

    setCreating(true);
    try {
      const userId = `${role}_${Date.now()}`;
      const userData: User = {
        id: userId,
        role,
        name: newUser.name,
        email: newUser.email,
        password: newUser.password,
        created_by: 'institution_abc',
        created_at: new Date().toISOString(),
        ...(role === 'faculty' ? { assigned_classes: [] } : { enrolled_classes: [] }),
      };

      await dbSet(`users/${userId}`, userData);
      toast.success(`${role === 'faculty' ? 'Teacher' : 'Student'} created successfully!`);
      setNewUser({ name: '', email: '', password: '' });
      setShowCreateTeacher(false);
      setShowCreateStudent(false);
      loadStats();
    } catch (error) {
      console.error('Error creating user:', error);
      toast.error('Failed to create user');
    } finally {
      setCreating(false);
    }
  };

  const statCards = [
    { icon: Users, label: 'Teachers', value: stats.teachers, color: 'from-emerald-500 to-teal-500' },
    { icon: GraduationCap, label: 'Students', value: stats.students, color: 'from-violet-500 to-purple-500' },
    { icon: BookOpen, label: 'Classes', value: stats.classes, color: 'from-cyan-500 to-blue-500' },
    { icon: Video, label: 'Videos', value: stats.videos, color: 'from-orange-500 to-amber-500' },
  ];

  return (
    <DashboardLayout title="Institution Dashboard" subtitle="Manage your educational platform">
      <div className="space-y-6 animate-slide-up">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((stat) => {
            const Icon = stat.icon;
            return (
              <Card key={stat.label} variant="stat">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground font-body">{stat.label}</p>
                      <p className="text-3xl font-bold mt-1">
                        {isLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : stat.value}
                      </p>
                    </div>
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center`}>
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                  </div>
                  <div className="flex items-center gap-1 mt-3 text-sm text-muted-foreground">
                    <TrendingUp className="w-4 h-4 text-success" />
                    <span className="text-success font-medium">+12%</span>
                    <span className="font-body">this month</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Quick Actions */}
        <div className="grid md:grid-cols-2 gap-4">
          <Card variant="interactive" onClick={() => setShowCreateTeacher(true)}>
            <CardContent className="p-6 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center">
                <Plus className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="font-semibold">Add Teacher</h3>
                <p className="text-sm text-muted-foreground font-body">Create a new faculty account</p>
              </div>
            </CardContent>
          </Card>

          <Card variant="interactive" onClick={() => setShowCreateStudent(true)}>
            <CardContent className="p-6 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center">
                <Plus className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="font-semibold">Add Student</h3>
                <p className="text-sm text-muted-foreground font-body">Enroll a new student</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Create Teacher Modal */}
        {showCreateTeacher && (
          <Card variant="glass" className="animate-fade-in">
            <CardHeader>
              <CardTitle>Create New Teacher</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                placeholder="Full Name"
                value={newUser.name}
                onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
              />
              <Input
                type="email"
                placeholder="Email Address"
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
              />
              <Input
                type="password"
                placeholder="Password"
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
              />
              <div className="flex gap-3">
                <Button onClick={() => createUser('faculty')} disabled={creating}>
                  {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Teacher'}
                </Button>
                <Button variant="outline" onClick={() => setShowCreateTeacher(false)}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Create Student Modal */}
        {showCreateStudent && (
          <Card variant="glass" className="animate-fade-in">
            <CardHeader>
              <CardTitle>Create New Student</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                placeholder="Full Name"
                value={newUser.name}
                onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
              />
              <Input
                type="email"
                placeholder="Email Address"
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
              />
              <Input
                type="password"
                placeholder="Password"
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
              />
              <div className="flex gap-3">
                <Button onClick={() => createUser('student')} disabled={creating}>
                  {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Student'}
                </Button>
                <Button variant="outline" onClick={() => setShowCreateStudent(false)}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { action: 'New video uploaded', subject: 'Circuits - EEE 3A', time: '2 hours ago' },
                { action: 'Teacher added', subject: 'Raj Kumar', time: '5 hours ago' },
                { action: 'Student enrolled', subject: 'Abhiram', time: '1 day ago' },
              ].map((activity, index) => (
                <div key={index} className="flex items-center justify-between py-3 border-b border-border last:border-0">
                  <div>
                    <p className="font-medium text-sm">{activity.action}</p>
                    <p className="text-sm text-muted-foreground font-body">{activity.subject}</p>
                  </div>
                  <span className="text-sm text-muted-foreground font-body">{activity.time}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default InstitutionDashboard;
