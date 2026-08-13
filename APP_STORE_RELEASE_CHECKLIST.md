# Enterprise App Store Release Package & Checklist

This document contains pre-configured templates, copy-paste review notes, and exact console steps for releasing an access-gated internal app on the **Apple App Store** and **Google Play Store**.

---

## 1. Credentials Setup Template

Before submitting to either store, create this dedicated reviewer account in Firebase Auth / internal database:

- **Email**: `reviewer-appstore@yourdomain.com`
- **Password**: `TestReviewer2026!`
- **Role / Permissions**: Viewer / Standard User (must have pre-populated data across all tabs).
- **MFA / OTP Bypass**: MFA disabled OR static code `123456`.
- **Network Exemption**: Whitelisted from IP firewall or VPN restrictions.

---

## 2. Apple App Store Connect Copy-Paste Block

Navigate to **App Store Connect** $\rightarrow$ **My Apps** $\rightarrow$ **[App Version]** $\rightarrow$ **App Review Information**:

### Sign-in required
- [x] **Sign-in required**

### Credentials
- **User name**: `reviewer-appstore@yourdomain.com`
- **Password**: `TestReviewer2026!`

### Notes (Copy & Paste):
```text
APP ACCESS & DEMO INSTRUCTIONS:
This application is an internal enterprise workspace tool. Access is gated by corporate user authentication.

DEMO CREDENTIALS:
- Username: reviewer-appstore@yourdomain.com
- Password: TestReviewer2026!
- Static 2FA Bypass Code: 123456 (if prompted)

TEST ENVIRONMENT NOTES:
1. The test account is pre-configured with active sample data (contacts, tasks, and attendance records).
2. No corporate VPN, hardware token, or IP whitelisting is required to log in with these credentials.
3. User accounts are provisioned exclusively by enterprise workspace administrators. Self-registration and automated public account creation are disabled by design.
4. Privacy policy is accessible at: https://shir0o.github.io/cisa-campus-work-traker/privacy.html

CONTACT FOR REVIEW ISSUES:
If you experience any issues logging in, please contact technical lead at support@yourdomain.com.
```

---

## 3. Google Play Console Copy-Paste Block

Navigate to **Google Play Console** $\rightarrow$ **Policy and programs** $\rightarrow$ **App content** $\rightarrow$ **App access**:

### App Access Selection
- Select **"All or some functionality is restricted"**
- Click **+ Add new instructions**

### Instruction Form:
- **Instruction Name**: `Internal Reviewer Access`
- **Username / Phone number**: `reviewer-appstore@yourdomain.com`
- **Password**: `TestReviewer2026!`
- **Instructions Text (Copy & Paste)**:
```text
This app requires user authentication. Use the provided demo credentials (reviewer-appstore@yourdomain.com / TestReviewer2026!). The account is pre-populated with test data and does not require VPN or MFA. Accounts are admin-provisioned for enterprise employees.
```

---

## 4. Platform Compliance Summary

| Requirement | Implementation Status | Note for Store Reviewers |
| :--- | :--- | :--- |
| **Privacy Policy URL** | Implemented (`/privacy`) | Accessible publicly on app login screen and web |
| **Account Deletion** | Enterprise Admin Provisioned | Stated in review notes: accounts managed by workspace admin |
| **IAP / Digital Purchases** | N/A (Internal Enterprise) | Free app for authorized organization users |
| **IPv6 / SSL** | Supported | Standard HTTPS secure endpoints |

---

## 5. Pre-Submission Execution Steps

1. **Verify Test Account**:
   ```bash
   # Log in on a clean mobile device off company VPN with:
   # Email: reviewer-appstore@yourdomain.com
   ```
2. **Build Production Bundle**:
   - **iOS**: Archive in Xcode $\rightarrow$ Distribute App $\rightarrow$ App Store Connect.
   - **Android**: `npm run build` / gradle build `.aab` $\rightarrow$ Upload to Play Console.
3. **Submit for Review**:
   - Check App Store Connect status $\rightarrow$ "Waiting for Review".
   - Check Play Console status $\rightarrow$ "In review".
