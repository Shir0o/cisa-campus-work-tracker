export type Role = 'fulltimer' | 'trainee' | 'trainee2' | 'student' | 'community' | 'reviewer';

export interface CredentialInfo {
  email: string;
  password: string;
  role: 'admin' | 'manager' | 'operator' | 'viewer';
  label: string;
}

export const DEFAULT_CREDENTIALS: Record<Role, CredentialInfo> = {
  fulltimer: {
    email: 'fulltimer.e2e@example.com',
    password: 'password123',
    role: 'admin',
    label: 'Full-timer Test User',
  },
  reviewer: {
    email: 'reviewer-appstore@yourdomain.com',
    password: 'TestReviewer2026!',
    role: 'admin',
    label: 'App Store Reviewer',
  },
  trainee: {
    email: 'trainee.e2e@example.com',
    password: 'password123',
    role: 'manager',
    label: 'Zion Adeyemi',
  },
  trainee2: {
    email: 'trainee2.e2e@example.com',
    password: 'password123',
    role: 'manager',
    label: 'Caleb Owusu',
  },
  student: {
    email: 'student.e2e@example.com',
    password: 'password123',
    role: 'operator',
    label: 'Timothy Hale',
  },
  community: {
    email: 'community.e2e@example.com',
    password: 'password123',
    role: 'viewer',
    label: 'Philip Nardi',
  },
};
