import React, { ReactNode, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  Home,
  Video,
  Users,
  Settings,
  LogOut,
  Menu,
  X,
  Bell,
  Search,
  ChevronDown,
  GraduationCap,
  BookOpen,
  FileText,
  HelpCircle,
  Calendar,
} from 'lucide-react';

interface DashboardLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
}

interface NavItem {
  icon: React.ElementType;
  label: string;
  href: string;
  badge?: number;
}

const navItemsByRole: Record<string, NavItem[]> = {
  institution: [
    { icon: Home, label: 'Dashboard', href: '/dashboard' },
    { icon: Users, label: 'Teachers', href: '/dashboard/teachers' },
    { icon: GraduationCap, label: 'Students', href: '/dashboard/students' },
    { icon: BookOpen, label: 'Classes', href: '/dashboard/classes' },
    { icon: Calendar, label: 'Timetable', href: '/dashboard/timetable' },
    { icon: Settings, label: 'Settings', href: '/dashboard/settings' },
  ],
  faculty: [
    { icon: Home, label: 'Dashboard', href: '/dashboard' },
    { icon: Video, label: 'Recordings', href: '/dashboard/recordings', badge: 3 },
    { icon: FileText, label: 'Notes', href: '/dashboard/notes' },
    { icon: HelpCircle, label: 'Questions', href: '/dashboard/questions' },
    { icon: Settings, label: 'Settings', href: '/dashboard/settings' },
  ],
  student: [
    { icon: Home, label: 'Dashboard', href: '/dashboard' },
    { icon: BookOpen, label: 'Subjects', href: '/dashboard/subjects' },
    { icon: Video, label: 'Videos', href: '/dashboard/videos' },
    { icon: FileText, label: 'Notes', href: '/dashboard/notes' },
    { icon: HelpCircle, label: 'Questions', href: '/dashboard/questions' },
  ],
};

const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children, title, subtitle }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = navItemsByRole[user?.role || 'student'];

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-50 h-full w-64 bg-sidebar border-r border-sidebar-border transform transition-transform duration-300 lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="h-16 flex items-center justify-between px-4 border-b border-sidebar-border">
            <Link to="/dashboard" className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-primary flex items-center justify-center">
                <span className="text-primary-foreground font-bold">C</span>
              </div>
              <span className="font-bold text-lg text-sidebar-foreground">Class360</span>
            </Link>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden text-sidebar-foreground hover:text-foreground"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.label}
                  to={item.href}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors group"
                >
                  <Icon className="w-5 h-5" />
                  <span className="flex-1 font-medium text-sm">{item.label}</span>
                  {item.badge && (
                    <span className="px-2 py-0.5 text-xs font-medium bg-primary text-primary-foreground rounded-full">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* User section */}
          <div className="p-4 border-t border-sidebar-border">
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
            >
              <LogOut className="w-5 h-5" />
              <span className="font-medium text-sm">Sign Out</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top bar */}
        <header className="sticky top-0 z-30 h-16 bg-background/80 backdrop-blur-md border-b border-border">
          <div className="flex items-center justify-between h-full px-4 lg:px-6">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-2 hover:bg-secondary rounded-lg transition-colors"
              >
                <Menu className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-lg font-semibold">{title}</h1>
                {subtitle && <p className="text-sm text-muted-foreground font-body">{subtitle}</p>}
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Search */}
              <div className="hidden md:flex items-center gap-2 px-3 py-2 bg-secondary rounded-lg">
                <Search className="w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search..."
                  className="w-40 bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none font-body"
                />
              </div>

              {/* Notifications */}
              <Button variant="ghost" size="icon" className="relative">
                <Bell className="w-5 h-5" />
                <span className="absolute top-1 right-1 w-2 h-2 bg-primary rounded-full" />
              </Button>

              {/* User menu */}
              <div className="relative">
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center gap-2 pl-2 pr-3 py-1.5 bg-secondary rounded-lg hover:bg-secondary/80 transition-colors"
                >
                  <div className="w-7 h-7 rounded-lg bg-gradient-primary flex items-center justify-center">
                    <span className="text-xs font-bold text-primary-foreground">
                      {user?.name?.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <span className="hidden sm:block text-sm font-medium">{user?.name}</span>
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                </button>

                {showUserMenu && (
                  <div className="absolute right-0 mt-2 w-48 py-2 bg-popover border border-border rounded-xl shadow-card animate-fade-in">
                    <div className="px-4 py-2 border-b border-border">
                      <p className="font-medium text-sm">{user?.name}</p>
                      <p className="text-xs text-muted-foreground font-body capitalize">{user?.role}</p>
                    </div>
                    <button
                      onClick={handleLogout}
                      className="flex items-center gap-2 w-full px-4 py-2 text-sm text-destructive hover:bg-secondary transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
};

export default DashboardLayout;
