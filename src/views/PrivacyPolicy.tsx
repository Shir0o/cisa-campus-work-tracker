import React from "react";
import { Shield, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function PrivacyPolicy() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-8">
        <button
          onClick={() => navigate("/")}
          className="inline-flex items-center text-sm text-cyan-400 hover:text-cyan-300 transition-colors gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Application
        </button>

        <div className="flex items-center gap-3 border-b border-slate-800 pb-6">
          <div className="p-3 bg-cyan-500/10 text-cyan-400 rounded-xl border border-cyan-500/20">
            <Shield className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-100">Privacy Policy</h1>
            <p className="text-sm text-slate-400">Enterprise Access & Data Protection Notice</p>
          </div>
        </div>

        <div className="prose prose-invert max-w-none space-y-6 text-slate-300 text-sm leading-relaxed">
          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-100">1. Overview</h2>
            <p>
              This application is an internal, access-gated enterprise software tool provided strictly for authorized workspace users. Access requires authentication via provisioned enterprise credentials.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-100">2. Data We Collect</h2>
            <p>To provide secure authentication and internal functionality, the app collects:</p>
            <ul className="list-disc pl-5 space-y-1 text-slate-400">
              <li>Account Credentials (Email address and authentication tokens)</li>
              <li>User Identity & Profile Information (Name, role, assigned workspace)</li>
              <li>Usage Diagnostics & Log Events (App interactions, system error reports)</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-100">3. How Data Is Used</h2>
            <p>
              Collected data is processed strictly for enterprise authentication, access control, audit logging, and core workflow operations within your workspace. We do not sell, track, or share your data with third-party advertisers.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-100">4. Account Provisioning & Deletion</h2>
            <p>
              Accounts are provisioned by enterprise system administrators. Users requiring account modification or account data removal may request account deactivation through their corporate system administrator.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-100">5. Security & Data Retention</h2>
            <p>
              Access to stored workspace data is restricted to authorized system administrators and authenticated enterprise users.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-100">6. Contact Information</h2>
            <p>
              For privacy inquiries or technical support regarding this application, please contact your workspace administrator or support team.
            </p>
          </section>
        </div>

        <div className="pt-8 border-t border-slate-800 text-xs text-slate-500 text-center">
          Last Updated: August 2026 • Enterprise App Store Release Compliance
        </div>
      </div>
    </div>
  );
}
