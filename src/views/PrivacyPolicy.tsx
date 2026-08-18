import React from "react";
import { Shield, ArrowLeft, LifeBuoy } from "lucide-react";
import { useNavigate, Link } from "react-router-dom";

export default function PrivacyPolicy() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate("/")}
            className="inline-flex items-center text-sm text-cyan-400 hover:text-cyan-300 transition-colors gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Application
          </button>
          <Link
            to="/support"
            className="inline-flex items-center text-sm text-slate-400 hover:text-cyan-400 transition-colors gap-1.5"
          >
            <LifeBuoy className="w-4 h-4" />
            Help & Support
          </Link>
        </div>

        <div className="flex items-center gap-3 border-b border-slate-800 pb-6">
          <div className="p-3 bg-cyan-500/10 text-cyan-400 rounded-xl border border-cyan-500/20">
            <Shield className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-100">Privacy Policy</h1>
            <p className="text-sm text-slate-400">Enterprise Access & Data Protection Notice</p>
          </div>
        </div>

        <div className="prose prose-invert max-w-none space-y-6 text-slate-300 text-sm leading-relaxed">
          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-100">1. Overview & Purpose</h2>
            <p>
              CISA Campus Work Tracker is an internal, access-gated organization application developed to facilitate campus ministry coordination, student onboarding, pastoral care, prayer tracking, gathering attendance, and collaborative workflows. Access is restricted to authorized team members and registered community participants.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-100">2. Data We Collect</h2>
            <p>To provide secure authentication and internal functionality, the app collects:</p>
            <ul className="list-disc pl-5 space-y-1 text-slate-400">
              <li><strong>Account Credentials & Auth Data:</strong> Email address, Firebase Auth user ID, profile photo, and display name (including Google OAuth sign-in).</li>
              <li><strong>Member & Contact Profiles:</strong> Name, phone, email, university major, year, gender, pronouns, Instagram handle, spiritual background, journey stages, tags, and assigned stewards.</li>
              <li><strong>Welcome / Intake Submissions:</strong> Contact info and fellowship interests submitted by prospective members.</li>
              <li><strong>Pastoral Care & Visit Records:</strong> Interaction logs, pastoral visit reports, follow-up tasks, and photos uploaded to secure cloud storage.</li>
              <li><strong>Prayer Records:</strong> Prayer burdens, personal prayer lists, and answered prayer celebration photos.</li>
              <li><strong>Gatherings & Attendance:</strong> Event schedules, check-in status (present/absent/late), and RSVP responses.</li>
              <li><strong>Tasks & Notes:</strong> Action items, priorities, due dates, collaborative coordination notes, and board docs.</li>
              <li><strong>Team Messaging:</strong> Direct, group, and announcement channel messages, reactions, and attachments.</li>
              <li><strong>Diagnostics & Feedback:</strong> Bug reports, user-agents, viewport sizes, and optional client-side screenshot diagnostics.</li>
              <li><strong>Push Notification Tokens:</strong> Expo Push / Web Push tokens for delivery of reminders and updates.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-100">3. How Data Is Used</h2>
            <p>
              Collected data is processed strictly for enterprise authentication, access control, audit logging, and core workflow operations within your workspace. We do not sell, track, or share your data with third-party advertisers.
            </p>
            <p>
              Server-side AI processing (e.g. Smart Import parsing of notes via Google Gemini API) operates strictly for real-time extraction and is not used to train public machine learning models.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-100">4. Role-Based Access Control</h2>
            <p>
              Access is segregated into four role tiers: <strong>Full-timer (Admin)</strong>, <strong>Trainee (Manager)</strong>, <strong>Student (Operator)</strong>, and <strong>Community (Viewer)</strong>. Sensitive pastoral visit logs and administrative settings are restricted to Full-timers.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-100">5. Account Provisioning & Deletion</h2>
            <p>
              Accounts are provisioned by enterprise system administrators. Users requiring account modification or account data removal may request account deactivation through their corporate system administrator or by emailing <a href="mailto:yilongwang05@gmail.com" className="text-cyan-400 hover:underline">yilongwang05@gmail.com</a>.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-100">6. Security & Data Retention</h2>
            <p>
              Access to stored workspace data is restricted to authorized system administrators and authenticated enterprise users. All data in transit is protected via TLS/HTTPS encryption.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-100">7. Contact Information</h2>
            <p>
              For privacy inquiries, data deletion requests, or technical support regarding this application, please contact our administrative team at <a href="mailto:yilongwang05@gmail.com" className="text-cyan-400 hover:underline">yilongwang05@gmail.com</a>.
            </p>
          </section>
        </div>

        <div className="pt-8 border-t border-slate-800 text-xs text-slate-500 text-center">
          Last Updated: August 2026 • CISA Campus Work Tracker Enterprise Privacy Policy
        </div>
      </div>
    </div>
  );
}
