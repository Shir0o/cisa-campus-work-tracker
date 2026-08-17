import React from "react";
import { LifeBuoy, ArrowLeft, Mail, Shield, Smartphone, HelpCircle } from "lucide-react";
import { useNavigate, Link } from "react-router-dom";

export default function Support() {
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
            to="/privacy"
            className="inline-flex items-center text-sm text-slate-400 hover:text-cyan-400 transition-colors gap-1.5"
          >
            <Shield className="w-4 h-4" />
            Privacy Policy
          </Link>
        </div>

        <div className="flex items-center gap-3 border-b border-slate-800 pb-6">
          <div className="p-3 bg-cyan-500/10 text-cyan-400 rounded-xl border border-cyan-500/20">
            <LifeBuoy className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-100">App Support & Help Center</h1>
            <p className="text-sm text-slate-400">CISA Campus Work Tracker Support & Documentation</p>
          </div>
        </div>

        <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-6 space-y-3">
          <div className="flex items-center gap-2 text-cyan-400 font-semibold">
            <Mail className="w-5 h-5" />
            <span>Contact Support</span>
          </div>
          <p className="text-sm text-slate-300">
            Need help with your account, reporting an issue, or requesting assistance?
          </p>
          <div className="text-sm space-y-1 text-slate-300">
            <p>
              <strong>Email:</strong>{" "}
              <a href="mailto:yilongwang05@gmail.com" className="text-cyan-400 hover:underline">
                yilongwang05@gmail.com
              </a>
            </p>
            <p>
              <strong>Hours:</strong> Monday – Friday, 9:00 AM – 5:00 PM PT
            </p>
            <p>
              <strong>Response Time:</strong> Within 24–48 business hours
            </p>
          </div>
        </div>

        <div className="space-y-6 text-sm text-slate-300">
          <div className="flex items-center gap-2 text-base font-semibold text-slate-100 border-b border-slate-800 pb-2">
            <HelpCircle className="w-5 h-5 text-cyan-400" />
            <h2>Frequently Asked Questions</h2>
          </div>

          <div className="space-y-4">
            <div className="space-y-1">
              <h3 className="font-semibold text-slate-100">How do I access my account?</h3>
              <p className="text-slate-400">
                CISA Campus Work Tracker is an internal workspace app. Accounts are provisioned and approved by organization administrators. You can sign in using your corporate email and password or your verified Google account.
              </p>
            </div>

            <div className="space-y-1">
              <h3 className="font-semibold text-slate-100">What are the user roles?</h3>
              <p className="text-slate-400">
                Access is categorized into four tiers: Full-timer (Admin), Trainee (Manager), Student (Operator), and Community (Viewer).
              </p>
            </div>

            <div className="space-y-1">
              <h3 className="font-semibold text-slate-100">How do I manage notifications?</h3>
              <p className="text-slate-400">
                Push notifications can be enabled or adjusted in your device settings under Settings &rarr; CISA Campus, or within User Preferences in the web app.
              </p>
            </div>

            <div className="space-y-1">
              <h3 className="font-semibold text-slate-100">How do I request account deletion?</h3>
              <p className="text-slate-400">
                To request deletion of your account or personal data, email{" "}
                <a href="mailto:yilongwang05@gmail.com" className="text-cyan-400 hover:underline">
                  yilongwang05@gmail.com
                </a>
                .
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-base font-semibold text-slate-100 border-b border-slate-800 pb-2 pt-4">
            <Smartphone className="w-5 h-5 text-cyan-400" />
            <h2>System Compatibility</h2>
          </div>

          <ul className="list-disc pl-5 space-y-1 text-slate-400">
            <li><strong>iOS:</strong> iPhone running iOS 15.0 or later</li>
            <li><strong>Android:</strong> Android 8.0 (API Level 26) or later</li>
            <li><strong>Web:</strong> Modern versions of Chrome, Safari, Firefox, and Edge</li>
          </ul>
        </div>

        <div className="pt-8 border-t border-slate-800 text-xs text-slate-500 text-center">
          Last Updated: August 2026 • CISA Campus Work Tracker Support
        </div>
      </div>
    </div>
  );
}
