export type Role = 'fulltimer' | 'trainee' | 'student' | 'community' | 'reviewer';

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
    label: 'Trainee Test User',
  },
  student: {
    email: 'student.e2e@example.com',
    password: 'password123',
    role: 'operator',
    label: 'Student Test User',
  },
  community: {
    email: 'community.e2e@example.com',
    password: 'password123',
    role: 'viewer',
    label: 'Community Test User',
  },
};
