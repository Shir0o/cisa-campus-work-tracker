# CISA Campus Work Tracker

A web and mobile application for full-time campus ministers, trainees, students, and community partners to track campus ministry contacts, follow-up interactions, prayer burdens, gatherings, and administrative configurations.

## Language

**Gospel Partners**:
Two (or three) trainees paired together for a term/semester who go out together on campus. Contacts created by either partner are automatically shared with the other (`coCreators`).
_Avoid_: Companion, buddy, accountability partner

**Full-timer**:
The administrative staff role (`admin`) with team-wide oversight, administrative settings access, gospel partner configuration, and full data access.
_Avoid_: Superuser, admin user, staff manager

**Trainee**:
The field worker role (`manager`) who manages assigned contacts, joins The Journey board, and participates in term gospel partnerships.
_Avoid_: Intern, field manager

**The Day's Goal**:
A shared target number of new campus connections to make on an on-campus day, configured globally by Full-timers in Settings.
_Avoid_: Quota, target metric, daily KPI

**QA Database (`qa-db`)**:
The dedicated non-production Firestore database instance in the `sac-campus-hub` project used for E2E tests and staging validation.
_Avoid_: Test database, sandbox Firestore, staging db
