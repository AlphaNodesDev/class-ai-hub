import React, { useState, useEffect } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { dbGet, dbSet, dbListen, User, ClassInfo, TimetableSlot } from '@/lib/firebase';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import {
  Users,
  GraduationCap,
  Video,
  BookOpen,
  Plus,
  Loader2,
  Camera,
  Clock,
  Settings,
  Upload,
  Trash2,
  Edit2,
  Save,
  X,
} from 'lucide-react';

interface Stats {
  teachers: number;
  students: number;
  classes: number;
  videos: number;
}

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const InstitutionDashboard: React.FC = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats>({ teachers: 0, students: 0, classes: 0, videos: 0 });
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [teachers, setTeachers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Modal states
  const [showCreateTeacher, setShowCreateTeacher] = useState(false);
  const [showCreateStudent, setShowCreateStudent] = useState(false);
  const [showCreateClass, setShowCreateClass] = useState(false);
  const [showTimetable, setShowTimetable] = useState<string | null>(null);
  const [showCameraSettings, setShowCameraSettings] = useState<string | null>(null);
  
  // Form states
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '' });
  const [newClass, setNewClass] = useState({ name: '', cameraEnabled: false });
  const [creating, setCreating] = useState(false);
  
  // Timetable editing
  const [editingTimetable, setEditingTimetable] = useState<Record<string, TimetableSlot[]>>({});
  const [newPeriod, setNewPeriod] = useState<Partial<TimetableSlot>>({ hour: 1, start: '09:00', end: '09:50', subject: '', teacher: '' });
  const [selectedDay, setSelectedDay] = useState('monday');

  useEffect(() => {
    loadData();
    
    // Listen for real-time updates
    const unsubUsers = dbListen('users', (data) => {
      if (data) {
        const userList = Object.values(data as Record<string, User>);
        setStats(prev => ({
          ...prev,
          teachers: userList.filter(u => u.role === 'faculty').length,
          students: userList.filter(u => u.role === 'student').length,
        }));
        setTeachers(userList.filter(u => u.role === 'faculty'));
      }
    });
    
    const unsubClasses = dbListen('classes', (data) => {
      if (data) {
        const classList = Object.values(data as Record<string, ClassInfo>);
        setClasses(classList);
        setStats(prev => ({ ...prev, classes: classList.length }));
      }
    });
    
    const unsubVideos = dbListen('videos', (data) => {
      if (data) {
        setStats(prev => ({ ...prev, videos: Object.keys(data).length }));
      }
    });
    
    return () => {
      unsubUsers();
      unsubClasses();
      unsubVideos();
    };
  }, []);

  const loadData = async () => {
    try {
      const [usersData, classesData, videosData] = await Promise.all([
        dbGet('users'),
        dbGet('classes'),
        dbGet('videos'),
      ]);
      
      const userList = usersData ? Object.values(usersData as Record<string, User>) : [];
      const classList = classesData ? Object.values(classesData as Record<string, ClassInfo>) : [];
      
      setTeachers(userList.filter(u => u.role === 'faculty'));
      setClasses(classList);
      setStats({
        teachers: userList.filter(u => u.role === 'faculty').length,
        students: userList.filter(u => u.role === 'student').length,
        classes: classList.length,
        videos: videosData ? Object.keys(videosData).length : 0,
      });
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Failed to load data');
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
        created_by: user?.id || 'institution',
        created_at: new Date().toISOString(),
        ...(role === 'faculty' ? { assigned_classes: [] } : { enrolled_classes: [] }),
      };

      await dbSet(`users/${userId}`, userData);
      toast.success(`${role === 'faculty' ? 'Teacher' : 'Student'} created successfully!`);
      setNewUser({ name: '', email: '', password: '' });
      setShowCreateTeacher(false);
      setShowCreateStudent(false);
    } catch (error) {
      console.error('Error creating user:', error);
      toast.error('Failed to create user');
    } finally {
      setCreating(false);
    }
  };

  const createClass = async () => {
    if (!newClass.name) {
      toast.error('Please enter class name');
      return;
    }

    setCreating(true);
    try {
      const classId = `class_${Date.now()}`;
      const classData: ClassInfo = {
        id: classId,
        name: newClass.name,
        institution_id: user?.id || 'institution',
        timetable: {},
        camera: {
          prototype_camera_id: '',
          camera_type: newClass.cameraEnabled ? 'live' : 'upload',
        },
      };

      await dbSet(`classes/${classId}`, classData);
      toast.success('Class created successfully!');
      setNewClass({ name: '', cameraEnabled: false });
      setShowCreateClass(false);
    } catch (error) {
      console.error('Error creating class:', error);
      toast.error('Failed to create class');
    } finally {
      setCreating(false);
    }
  };

  const openTimetableEditor = (classInfo: ClassInfo) => {
    setShowTimetable(classInfo.id);
    setEditingTimetable(classInfo.timetable || {});
    setSelectedDay('monday');
  };

  const addPeriod = () => {
    if (!newPeriod.subject || !newPeriod.teacher) {
      toast.error('Please fill subject and teacher');
      return;
    }

    const dayPeriods = editingTimetable[selectedDay] || [];
    const updatedPeriods = [...dayPeriods, { ...newPeriod, hour: dayPeriods.length + 1 } as TimetableSlot];
    setEditingTimetable({ ...editingTimetable, [selectedDay]: updatedPeriods });
    setNewPeriod({ hour: updatedPeriods.length + 1, start: '', end: '', subject: '', teacher: '' });
  };

  const removePeriod = (day: string, index: number) => {
    const dayPeriods = [...(editingTimetable[day] || [])];
    dayPeriods.splice(index, 1);
    // Renumber hours
    dayPeriods.forEach((p, i) => p.hour = i + 1);
    setEditingTimetable({ ...editingTimetable, [day]: dayPeriods });
  };

  const saveTimetable = async () => {
    if (!showTimetable) return;
    
    try {
      await dbSet(`classes/${showTimetable}/timetable`, editingTimetable);
      toast.success('Timetable saved!');
      setShowTimetable(null);
    } catch (error) {
      console.error('Error saving timetable:', error);
      toast.error('Failed to save timetable');
    }
  };

  const updateCameraSettings = async (classId: string, enabled: boolean, cameraType: string) => {
    try {
      await dbSet(`classes/${classId}/camera`, {
        prototype_camera_id: enabled ? 'camera_1' : '',
        camera_type: cameraType,
      });
      toast.success('Camera settings updated!');
    } catch (error) {
      console.error('Error updating camera:', error);
      toast.error('Failed to update camera settings');
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
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Quick Actions */}
        <div className="grid md:grid-cols-3 gap-4">
          <Card variant="interactive" onClick={() => setShowCreateTeacher(true)}>
            <CardContent className="p-6 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center">
                <Plus className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="font-semibold">Add Teacher</h3>
                <p className="text-sm text-muted-foreground font-body">Create faculty account</p>
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
                <p className="text-sm text-muted-foreground font-body">Enroll new student</p>
              </div>
            </CardContent>
          </Card>

          <Card variant="interactive" onClick={() => setShowCreateClass(true)}>
            <CardContent className="p-6 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center">
                <Plus className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="font-semibold">Add Classroom</h3>
                <p className="text-sm text-muted-foreground font-body">Create new class</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Classes List with Timetable & Camera */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="w-5 h-5" />
              Classrooms
            </CardTitle>
          </CardHeader>
          <CardContent>
            {classes.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No classes created yet</p>
            ) : (
              <div className="space-y-4">
                {classes.map((cls) => (
                  <div key={cls.id} className="flex items-center justify-between p-4 bg-card-hover rounded-xl border border-border">
                    <div>
                      <h4 className="font-semibold">{cls.name}</h4>
                      <p className="text-sm text-muted-foreground">
                        {Object.keys(cls.timetable || {}).length} days scheduled • 
                        Camera: {cls.camera?.camera_type || 'Not set'}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => openTimetableEditor(cls)}>
                        <Clock className="w-4 h-4 mr-1" /> Timetable
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setShowCameraSettings(cls.id)}>
                        <Camera className="w-4 h-4 mr-1" /> Camera
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Create Teacher Modal */}
        {showCreateTeacher && (
          <Card variant="glass" className="animate-fade-in">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Create New Teacher</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setShowCreateTeacher(false)}>
                <X className="w-4 h-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input placeholder="Full Name" value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} />
              <Input type="email" placeholder="Email Address" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} />
              <Input type="password" placeholder="Password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} />
              <Button onClick={() => createUser('faculty')} disabled={creating} className="w-full">
                {creating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Create Teacher
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Create Student Modal */}
        {showCreateStudent && (
          <Card variant="glass" className="animate-fade-in">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Create New Student</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setShowCreateStudent(false)}>
                <X className="w-4 h-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input placeholder="Full Name" value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} />
              <Input type="email" placeholder="Email Address" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} />
              <Input type="password" placeholder="Password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} />
              <Button onClick={() => createUser('student')} disabled={creating} className="w-full">
                {creating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Create Student
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Create Class Modal */}
        {showCreateClass && (
          <Card variant="glass" className="animate-fade-in">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Create New Classroom</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setShowCreateClass(false)}>
                <X className="w-4 h-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input placeholder="Class Name (e.g., EEE 3A)" value={newClass.name} onChange={(e) => setNewClass({ ...newClass, name: e.target.value })} />
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="cameraEnabled"
                  checked={newClass.cameraEnabled}
                  onChange={(e) => setNewClass({ ...newClass, cameraEnabled: e.target.checked })}
                  className="w-4 h-4"
                />
                <label htmlFor="cameraEnabled" className="text-sm">Enable live camera recording</label>
              </div>
              <Button onClick={createClass} disabled={creating} className="w-full">
                {creating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Create Classroom
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Timetable Editor Modal */}
        {showTimetable && (
          <Card variant="glass" className="animate-fade-in">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Edit Timetable - {classes.find(c => c.id === showTimetable)?.name}
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setShowTimetable(null)}>
                <X className="w-4 h-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Day selector */}
              <div className="flex gap-2 flex-wrap">
                {DAYS.map(day => (
                  <Button
                    key={day}
                    variant={selectedDay === day ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedDay(day)}
                    className="capitalize"
                  >
                    {day.slice(0, 3)}
                  </Button>
                ))}
              </div>

              {/* Periods for selected day */}
              <div className="space-y-2">
                {(editingTimetable[selectedDay] || []).map((period, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-3 bg-background rounded-lg border border-border">
                    <span className="w-8 text-center font-bold text-muted-foreground">H{period.hour}</span>
                    <span className="text-sm">{period.start} - {period.end}</span>
                    <span className="flex-1 font-medium">{period.subject}</span>
                    <span className="text-sm text-muted-foreground">{period.teacher}</span>
                    <Button variant="ghost" size="sm" onClick={() => removePeriod(selectedDay, idx)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>

              {/* Add new period */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2 p-4 bg-background rounded-lg border border-border">
                <Input
                  type="time"
                  placeholder="Start"
                  value={newPeriod.start}
                  onChange={(e) => setNewPeriod({ ...newPeriod, start: e.target.value })}
                />
                <Input
                  type="time"
                  placeholder="End"
                  value={newPeriod.end}
                  onChange={(e) => setNewPeriod({ ...newPeriod, end: e.target.value })}
                />
                <Input
                  placeholder="Subject"
                  value={newPeriod.subject}
                  onChange={(e) => setNewPeriod({ ...newPeriod, subject: e.target.value })}
                />
                <select
                  className="px-3 py-2 rounded-lg bg-input border border-border text-foreground"
                  value={newPeriod.teacher}
                  onChange={(e) => setNewPeriod({ ...newPeriod, teacher: e.target.value })}
                >
                  <option value="">Select Teacher</option>
                  {teachers.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                <Button onClick={addPeriod}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>

              <Button onClick={saveTimetable} className="w-full">
                <Save className="w-4 h-4 mr-2" /> Save Timetable
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Camera Settings Modal */}
        {showCameraSettings && (
          <Card variant="glass" className="animate-fade-in">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Camera className="w-5 h-5" />
                Camera Settings - {classes.find(c => c.id === showCameraSettings)?.name}
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setShowCameraSettings(null)}>
                <X className="w-4 h-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4">
                <Card 
                  variant="interactive" 
                  onClick={() => {
                    updateCameraSettings(showCameraSettings, true, 'live');
                    setShowCameraSettings(null);
                  }}
                >
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center">
                      <Camera className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h4 className="font-semibold">Live Camera Feed</h4>
                      <p className="text-sm text-muted-foreground">24/7 recording, auto-trim by timetable</p>
                    </div>
                  </CardContent>
                </Card>

                <Card 
                  variant="interactive" 
                  onClick={() => {
                    updateCameraSettings(showCameraSettings, false, 'upload');
                    setShowCameraSettings(null);
                  }}
                >
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                      <Upload className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h4 className="font-semibold">Manual Upload</h4>
                      <p className="text-sm text-muted-foreground">Upload full day video, auto-split by periods</p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
};

export default InstitutionDashboard;
