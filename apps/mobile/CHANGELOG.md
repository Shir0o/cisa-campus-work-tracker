# Changelog

## [1.8.2](https://github.com/Shir0o/cisa-campus-work-tracker/compare/v1.8.1...v1.8.2) (2026-09-23)


### Bug Fixes

* **mobile:** resolve image-size metro bundling and xmldom plist parsing in release builds ([#1198](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1198)) ([09f112c](https://github.com/Shir0o/cisa-campus-work-tracker/commit/09f112c1edda5002b6a5e13d257143bc6d236cf7))

## [1.8.1](https://github.com/Shir0o/cisa-campus-work-tracker/compare/v1.8.0...v1.8.1) (2026-09-23)


### Bug Fixes

* **mobile:** resolve project fingerprint and xml parsing failures in release build ([#1195](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1195)) ([111489d](https://github.com/Shir0o/cisa-campus-work-tracker/commit/111489dfa4654eb0ce502e719feb1145a3c327bd))

## [1.8.0](https://github.com/Shir0o/cisa-campus-work-tracker/compare/v1.7.0...v1.8.0) (2026-09-23)


### Features

* **whats-new:** setup release video hosting and manual capture workflow ([#1151](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1151)) ([#1160](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1160)) ([17b228e](https://github.com/Shir0o/cisa-campus-work-tracker/commit/17b228ea047ac7bc545712a6c166b29d3aff933d))


### Bug Fixes

* **mobile:** add BFA toggle to sign-up form, remove from settings ([#1174](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1174)) ([6c25d5c](https://github.com/Shir0o/cisa-campus-work-tracker/commit/6c25d5cfa15808f94d3663d68eb7f777608d4070))
* **mobile:** end the eternal loading skeleton on read errors and add Sentry monitoring ([#1173](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1173)) ([ed61062](https://github.com/Shir0o/cisa-campus-work-tracker/commit/ed61062f9db18d1122e198b44f4670f1d44b251d))
* **mobile:** keep bottom safe-area edge on Screen for Android edge-to-edge ([#1175](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1175)) ([b085100](https://github.com/Shir0o/cisa-campus-work-tracker/commit/b085100a598c6eb18f0d0a09cbc5a5b817fc34b3))
* **mobile:** override @xmldom/xmldom to 0.9.x and bump joi to clear dependabot alerts ([#1158](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1158)) ([e7b0a4a](https://github.com/Shir0o/cisa-campus-work-tracker/commit/e7b0a4ad8d170429c2e558be3451bd3cde270d56))
* **notifications:** propagate team actions to trainees and ensure Android delivery ([#1166](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1166)) ([#1170](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1170)) ([da7d5f7](https://github.com/Shir0o/cisa-campus-work-tracker/commit/da7d5f741070950e8ee127362f95c6626da1c5b3))
* **notifications:** push every bell entry to web, PWA and native devices ([#1177](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1177)) ([4539c66](https://github.com/Shir0o/cisa-campus-work-tracker/commit/4539c662618e12e8df80f39bd5d18aa52ed314c1))
* **security:** resolve Dependabot vulnerabilities and CodeQL code scanning alerts ([#1165](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1165)) ([b2672cc](https://github.com/Shir0o/cisa-campus-work-tracker/commit/b2672cc32cf5b463f169da92fae74f12fd5c5309))

## [1.7.0](https://github.com/Shir0o/cisa-campus-work-tracker/compare/v1.6.0...v1.7.0) (2026-09-20)


### Features

* **auth:** add TOTP multi-factor authentication across web and mobile ([#1146](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1146)) ([#1146](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1146)) ([ee4054c](https://github.com/Shir0o/cisa-campus-work-tracker/commit/ee4054c547cd342d76753c1dfc8b9d4944f821e1))
* **board:** add QR code for coordination doc guest links on web and mobile ([#1149](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1149)) ([897e15f](https://github.com/Shir0o/cisa-campus-work-tracker/commit/897e15f1db8bd2a067ade9ba146fcc9d49c9cd01))
* delete a single conversation thread message (author or admin) ([#1126](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1126)) ([#1138](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1138)) ([320ac0a](https://github.com/Shir0o/cisa-campus-work-tracker/commit/320ac0a9b51f512b23bd8b27c45afddbd4d1688f))
* **mobile:** add Your notes read-back view ([#1137](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1137)) ([688d381](https://github.com/Shir0o/cisa-campus-work-tracker/commit/688d38154ca668e577ee92cae48068d6ff374565))
* **mobile:** bring the BFA intake tag to mobile, mirroring web ([#1117](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1117)) ([#1148](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1148)) ([2f36b75](https://github.com/Shir0o/cisa-campus-work-tracker/commit/2f36b751809fbd5c43bdedfc338cb3c70a0344a5))
* remove emoji reactions everywhere, keep heart-only encourage ([#1107](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1107)) ([#1141](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1141)) ([d023efc](https://github.com/Shir0o/cisa-campus-work-tracker/commit/d023efc5942065da88aa9efe14ab14799de11259))
* **security:** configure Firebase App Check for web with monitoring-first rollout ([#1145](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1145)) ([832434c](https://github.com/Shir0o/cisa-campus-work-tracker/commit/832434c1f71bf14581041845a1203339e943f949))
* **translator:** show already-Spanish content as-is, en→es only ([#1043](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1043)) ([#1111](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1111)) ([60a3972](https://github.com/Shir0o/cisa-campus-work-tracker/commit/60a3972304186b5bfe697fcd6f47acf7a1d39869))
* **whats-new:** add What's New Video release companion ([#1151](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1151)) ([#1153](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1153)) ([3de5eee](https://github.com/Shir0o/cisa-campus-work-tracker/commit/3de5eee850132ff36921f23a184489ac00c9aef9))
* **whats-new:** auto-draft release notes on each release tag ([#1147](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1147)) ([c6a7bfa](https://github.com/Shir0o/cisa-campus-work-tracker/commit/c6a7bfad774557ec0f41a3ae4114cc865fa5075b))

## [1.6.0](https://github.com/Shir0o/cisa-campus-work-tracker/compare/v1.5.0...v1.6.0) (2026-09-17)


### Features

* **attendance:** move attendance onto the Gathering ([#958](https://github.com/Shir0o/cisa-campus-work-tracker/issues/958)) ([#1027](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1027)) ([f97da39](https://github.com/Shir0o/cisa-campus-work-tracker/commit/f97da3987f8ab5dcbb08169964f808d6a577d13b))
* **bible-study:** copy a permanent per-week link, not just the latest ([#1098](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1098)) ([cd590f2](https://github.com/Shir0o/cisa-campus-work-tracker/commit/cd590f2e653f467c131adc7d9c498def2e7a6538))
* **contact:** denormalise contact ties into visibleTo, and backfill ([#1024](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1024) phase 4, part 1/2) ([#1035](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1035)) ([5cbea6c](https://github.com/Shir0o/cisa-campus-work-tracker/commit/5cbea6c9d70206d287cbae5b2803008cc5a6c404))
* **contacts:** founders are co-equal and the current-term widening retires ([#1054](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1054)) ([#1084](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1084)) ([e1f9647](https://github.com/Shir0o/cisa-campus-work-tracker/commit/e1f96471f877dbbc0aa805f5f32339487f6ae832))
* **contacts:** remove the contact caregiver field and care transfer ([#1053](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1053)) ([#1083](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1083)) ([21133ef](https://github.com/Shir0o/cisa-campus-work-tracker/commit/21133ef511cc93bf7b8de104bb7b11f827bbb783))
* **partners:** dated pairing model — types + interval logic ([#1048](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1048)) ([#1078](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1078)) ([b924e3c](https://github.com/Shir0o/cisa-campus-work-tracker/commit/b924e3cbdefd49aa13819c1bf37e9f7b04c541ac))
* **release:** one authored record rendered as announcement + nudge ([#1021](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1021)) ([#1046](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1046)) ([0df0207](https://github.com/Shir0o/cisa-campus-work-tracker/commit/0df0207832f27ab7de827729950e41a64780a69e))
* **sheep:** cared for by reads who has taken a person on — your sheep becomes a contact tie ([#1051](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1051)) ([#1081](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1081)) ([cd37271](https://github.com/Shir0o/cisa-campus-work-tracker/commit/cd37271abf21b99739f85f02170c805a07ec9238))


### Bug Fixes

* **contact:** enforce contact visibility on mobile, and cut team scope by effective role ([#1024](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1024)) ([#1031](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1031)) ([5049c98](https://github.com/Shir0o/cisa-campus-work-tracker/commit/5049c987ec30f12abe749dcb9cd44d3dbcfe000f))
* **mobile:** derive the app version from the release tag, never commit it ([#1040](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1040)) ([#1057](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1057)) ([88232f6](https://github.com/Shir0o/cisa-campus-work-tracker/commit/88232f634f38530907b5ae2069dd1415443e7306))
* **mobile:** don't re-dismiss a self-dismissed bottom sheet ([#1066](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1066)) ([4372612](https://github.com/Shir0o/cisa-campus-work-tracker/commit/4372612c98f8cb46bbee121a35472110b5a15ab1))

## [1.5.0](https://github.com/Shir0o/cisa-campus-work-tracker/compare/v1.4.2...v1.5.0) (2026-09-14)


### Features

* **contacts:** allow co-owners to manage collaborators and fix impersonation bypass ([#1013](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1013)) ([#1017](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1017)) ([8b20de3](https://github.com/Shir0o/cisa-campus-work-tracker/commit/8b20de342293de7bf88d7316e221c96bc77f34f7))

## [1.4.2](https://github.com/Shir0o/cisa-campus-work-tracker/compare/v1.4.1...v1.4.2) (2026-09-14)


### Bug Fixes

* **mobile,core:** fix trainee impersonation crash and scope queue messages ([#1006](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1006)) ([9553efe](https://github.com/Shir0o/cisa-campus-work-tracker/commit/9553efecddbfbc5735458b3b73a02c6097ee53bf))
* **mobile:** anchor the fastlane lane's paths to the project root ([#1008](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1008)) ([f45fcc1](https://github.com/Shir0o/cisa-campus-work-tracker/commit/f45fcc179a4fc43452e1ee6160263aa2d18e3518))

## [1.4.1](https://github.com/Shir0o/cisa-campus-work-tracker/compare/v1.4.0...v1.4.1) (2026-09-14)


### Bug Fixes

* **mobile:** actually raise Gradle JVM memory, and bound the build ([#1001](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1001)) ([6336115](https://github.com/Shir0o/cisa-campus-work-tracker/commit/63361159a839027296cdfd01288258a4f0dacf87))
* **mobile:** give Gradle metaspace 2 GiB, not 1 ([#1003](https://github.com/Shir0o/cisa-campus-work-tracker/issues/1003)) ([edb6cfb](https://github.com/Shir0o/cisa-campus-work-tracker/commit/edb6cfbb73e33e86a71fa4fa96b27defd2af1664))

## [1.4.0](https://github.com/Shir0o/cisa-campus-work-tracker/compare/v1.3.8...v1.4.0) (2026-09-14)


### Features

* **feedback:** capture screenshots in-app, show them to admins, never sync to GitHub ([#984](https://github.com/Shir0o/cisa-campus-work-tracker/issues/984)) ([e9c20a2](https://github.com/Shir0o/cisa-campus-work-tracker/commit/e9c20a251c5cb677cef1ce07cf6728c4de8fc81c))
* **mobile:** attach Play release notes after eas submit ([#994](https://github.com/Shir0o/cisa-campus-work-tracker/issues/994)) ([4c40576](https://github.com/Shir0o/cisa-campus-work-tracker/commit/4c40576ca47552f6a092824dacbc9b0079e481ca))
* **mobile:** automate the mobile release to Play internal and TestFlight ([#991](https://github.com/Shir0o/cisa-campus-work-tracker/issues/991)) ([b9e70ce](https://github.com/Shir0o/cisa-campus-work-tracker/commit/b9e70ce94253dda51c263caa924eddf8ae2028bb))
* **mobile:** mobile pass follow-ups for touch targets, action ordering, loading fallback, and off-palette pages ([#761](https://github.com/Shir0o/cisa-campus-work-tracker/issues/761)) ([#807](https://github.com/Shir0o/cisa-campus-work-tracker/issues/807)) ([d79ac42](https://github.com/Shir0o/cisa-campus-work-tracker/commit/d79ac4219ecc8495dcd3ca3813f6e33612962d2e))
* tailor-made What's New popups with release note compilation and git commit fallback ([#812](https://github.com/Shir0o/cisa-campus-work-tracker/issues/812)) ([#816](https://github.com/Shir0o/cisa-campus-work-tracker/issues/816)) ([1f189d3](https://github.com/Shir0o/cisa-campus-work-tracker/commit/1f189d334cb356a1f3dddfc1a336fc8e08abdc00))
* **threads:** let a Full-timer ask a Trainee about a contact, and make it land ([#813](https://github.com/Shir0o/cisa-campus-work-tracker/issues/813)) ([#844](https://github.com/Shir0o/cisa-campus-work-tracker/issues/844)) ([5afb132](https://github.com/Shir0o/cisa-campus-work-tracker/commit/5afb132ea84907d93fbc65485350c07290810b27))
* **whats-new:** categorize release notes with color badges and tighten layout ([#821](https://github.com/Shir0o/cisa-campus-work-tracker/issues/821)) ([#824](https://github.com/Shir0o/cisa-campus-work-tracker/issues/824)) ([145876a](https://github.com/Shir0o/cisa-campus-work-tracker/commit/145876a74d756e3e06d037226d2e4948fc266679))


### Bug Fixes

* **inbox:** scope trainee waiting items to contacts in care ([#795](https://github.com/Shir0o/cisa-campus-work-tracker/issues/795)) ([5eb0eba](https://github.com/Shir0o/cisa-campus-work-tracker/commit/5eb0eba9aa8b7a752a2073869e3fea70bbc8dbd9))
* **mobile:** register the push token the moment permission is granted ([#977](https://github.com/Shir0o/cisa-campus-work-tracker/issues/977)) ([#981](https://github.com/Shir0o/cisa-campus-work-tracker/issues/981)) ([b84f3e9](https://github.com/Shir0o/cisa-campus-work-tracker/commit/b84f3e90b9c7b0892d3f37ba5848f18a82c34f8b))
* **mobile:** restore purple background for android adaptive icon ([#843](https://github.com/Shir0o/cisa-campus-work-tracker/issues/843)) ([9887763](https://github.com/Shir0o/cisa-campus-work-tracker/commit/98877633a1e0d305812613255bc7efe651925972))
* **mobile:** use brand purple background for splash screen ([#847](https://github.com/Shir0o/cisa-campus-work-tracker/issues/847)) ([54e9000](https://github.com/Shir0o/cisa-campus-work-tracker/commit/54e9000417ba49352233301ee2fb1d39974ab389))
