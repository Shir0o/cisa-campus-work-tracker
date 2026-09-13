# Store submission checklist

What to paste into each console when submitting for review, and what the
reviewers need in order to get in.

The **build, signing, and upload are automated** — see
[`RELEASING.md`](RELEASING.md). This file is only about the parts a human still
does, which are the review metadata and the promotion click.

> This file previously contained a reviewer email with a plaintext password and
a static 2FA bypass code. It is a **public repository**. Credentials are never
committed: create the reviewer account in the QA database and keep its password
where the other secrets live.

## 1. The reviewer account

The app is access-gated, so both stores require a working account a reviewer can
sign into. One already exists in the QA database and is described by the
**Test Account Purge** entry in [`CONTEXT.md`](CONTEXT.md) — it is one of the
`reviewer*` accounts that tool scrubs.

Before a submission, confirm the account:

- Signs in from a clean device with no company VPN and no hardware token.
- Has sample data across every tab, so nothing a reviewer taps is empty.
- Does **not** trip MFA, or has a bypass code you can safely put in the store
  console's review notes (which are private, unlike this file).
- Is not swept away by running Test Account Purge.

## 2. App Store Connect → App Review Information

Under **App Version → App Review Information**:

- **Sign-in required**: checked.
- **User name / Password**: the reviewer account's. Type these directly into App
  Store Connect; do not record them here.
- **Notes**:

```text
This is an internal enterprise workspace tool. Access is gated by corporate
user authentication.

DEMO CREDENTIALS: supplied in the User name and Password fields above.

TEST ENVIRONMENT NOTES:
1. The test account is pre-configured with active sample data (contacts, tasks,
   and attendance records).
2. No corporate VPN, hardware token, or IP whitelisting is required with these
   credentials.
3. Accounts are provisioned exclusively by enterprise workspace administrators.
   Self-registration and public account creation are disabled by design.
4. Privacy policy: https://shir0o.github.io/cisa-campus-work-tracker/privacy.html
5. Support: https://shir0o.github.io/cisa-campus-work-tracker/support.html

CONTACT FOR REVIEW ISSUES: yilongwang05@gmail.com
```

## 3. Play Console → App content → App access

Select **“All or some functionality is restricted”**, then **+ Add new
instructions**:

- **Instruction name**: `Internal Reviewer Access`
- **Username / Password**: the reviewer account's, typed here directly.
- **Instructions**:

```text
This app requires user authentication. Use the credentials above. The account is
pre-populated with test data and needs no VPN or MFA. Accounts are
admin-provisioned for enterprise employees. Support:
https://shir0o.github.io/cisa-campus-work-tracker/support.html | Privacy:
https://shir0o.github.io/cisa-campus-work-tracker/privacy.html
```

## 4. Compliance summary

| Requirement | Status |
| --- | --- |
| Privacy policy URL | `https://shir0o.github.io/cisa-campus-work-tracker/privacy.html` |
| Support URL | `https://shir0o.github.io/cisa-campus-work-tracker/support.html` |
| Account deletion | Admin-provisioned accounts; deletion handled by a workspace admin (contact above) |
| IAP / digital purchases | N/A — free app for authorised organisation users |
| IPv6 / SSL | Supported; standard HTTPS endpoints |

## 5. Promotion

1. **Android** — the AAB lands on the Play **internal testing** track as a
   **draft**, so no tester is notified. Open the Play Console, paste the release
   notes attached to the GitHub Release, and promote when ready.
2. **iOS** — the IPA lands in **TestFlight** with “What to Test” already filled
   from the compiled notes. Promote to review from App Store Connect when ready.

Neither step is automated, by design. See
[ADR 0020](docs/adr/0020-mobile-release-automation.md).
