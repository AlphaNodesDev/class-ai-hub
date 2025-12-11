import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { dbGet, User } from '@/lib/firebase';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check for stored session
    const storedUser = localStorage.getItem('class360_user');
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch {
        localStorage.removeItem('class360_user');
      }
    }
    setIsLoading(false);
  }, []);

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      setIsLoading(true);
      const users = await dbGet('users') as Record<string, User> | null;
      
      if (!users) {
        return { success: false, error: 'No users found in database' };
      }

      const foundUser = Object.values(users).find(
        (u) => u.email === email && u.password === password
      );

      if (foundUser) {
        setUser(foundUser);
        localStorage.setItem('class360_user', JSON.stringify(foundUser));
        return { success: true };
      }

      return { success: false, error: 'Invalid email or password' };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: 'Failed to connect to database' };
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('class360_user');
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
