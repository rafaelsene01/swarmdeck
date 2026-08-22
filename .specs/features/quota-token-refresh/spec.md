# Quota Token Refresh Specification

## Problem Statement

The quota ring reads `~/.claude/.credentials.json` and sends whatever `accessToken` is there. That token lives ~8 h, and the Claude Code CLI is documented as failing to refresh it in several common situations — headless, subprocess, after a machine restart. So a user who has not touched the CLI recently opens SwarmDeck, the boot warm-up sends an expired token, gets a 401, and the ring shows "a sessão expirou" until the user happens to run `claude` themselves. The 5-minute polling interval then adds up to five more minutes of blank ring after the user fixes it.

## Goals

- [ ] The quota is already loaded when the boot overlay releases, for a user whose stored token is expired but whose refresh token is still valid.
- [ ] After the user makes the credential usable by other means (a fresh `claude login`), the ring reflects it within 30 s instead of up to 5 min.
- [ ] The user's CLI login keeps working: the rotated refresh token is written back, never dropped.

## Out of Scope

| Feature | Reason |
| ------- | ------- |
| Logging in from inside SwarmDeck | The OAuth authorization flow needs a browser and user consent. User decision (2026-08-21): a machine that never logged in simply shows no quota. |
| Spawning hidden `claude` / `codex` / `opencode` processes to make the CLI write its credential | Investigated and rejected: the CLI is documented as not refreshing the token when run as a subprocess without a TTY (anthropics/claude-code issues 28827, 53063, 50743), so the spawn would cost a process per profile per provider at every boot and produce nothing. AD-043. |
| Quota for providers other than Claude Code | AD-033 already establishes that no other catalog provider has a usage endpoint. Nothing to refresh and nothing to show. |
| Resolving a race against the CLI refreshing at the same instant | Both writers rotate the refresh token server-side, so one of them loses regardless of who writes the file. SwarmDeck serializes only *its own* attempts (QTR-08). A simultaneous CLI refresh can still force a re-login; that is a property of refresh-token rotation, not of this feature. |
| Refreshing a token that has no `refreshToken` in the file (API-key or Bedrock/Vertex setups) | There is nothing to exchange. Handled as a skip (QTR-06). |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| The app may write to `~/.claude/.credentials.json` | Yes — it rewrites the three OAuth fields in place | User authorized it explicitly on 2026-08-21 after being told this is the irreversible part of the plan. The endpoint rotates the refresh token, so *not* writing back would invalidate the CLI's own login — writing is the safer of the two. | y |
| Token endpoint and client id | `POST https://platform.claude.com/v1/oauth/token`, `grant_type=refresh_token`, `client_id=9d1c250a-e61b-44d9-88ed-5944d1962f5e` | Both are the values reported by Claude Code's own OAuth flow in the issue tracker and in community write-ups. Not a documented public contract — if either is wrong the request fails and QTR-05 makes that a no-op, identical to today's behavior. | y |
| Expiry margin | 60 s | A token that expires in the next few seconds would be sent and rejected mid-flight. One minute is far below the ~8 h lifetime, so it never causes an early refresh worth caring about. | y |
| Where the refreshed file is written | The exact path the credential was read from, whichever profile that was (host or a WSL distro, via UNC) | The candidate walk already picks one file; refreshing a different one would rotate a token the app is not using. | y |
| Fast-retry cadence | 30 s | Fast enough to feel immediate after a `claude login`, slow enough that the backend's 5-minute cache floor is the thing being bypassed, not hammered — the retry only runs in the two states that have no data to cache. | y |
| Cloudflare may reject the refresh request | Treated as any other failure: no write, keep the old token | Reported for headless Linux (anthropics/claude-code issue 47754). There is nothing the app can do about a WAF decision, and failing closed keeps the file intact. | y |

**Open questions:** none — all resolved or logged above.

Implicit-requirement dimensions: persistence (QTR-03, QTR-04), failure states (QTR-05), concurrency (QTR-08), observability (QTR-09), external-dependency failure (QTR-05). Auth boundaries are the subject of the whole feature. Remaining dimensions N/A for this scope.

---

## User Stories

### P1: Quota is ready when the loading screen ends ⭐ MVP

**User Story**: As a user who has not run `claude` today, I want the quota ring to already show my usage when the app finishes loading, so that I do not have to open a terminal and run the CLI to make it appear.

**Why P1**: This is the reported defect.

**Acceptance Criteria**:

1. WHEN a quota fetch starts and the located credential's `expiresAt` is at or before now plus 60 s THEN the system SHALL exchange the stored `refreshToken` at the token endpoint before contacting the usage endpoint.
2. WHEN the token endpoint returns a new token pair THEN the system SHALL write the new `accessToken`, `refreshToken` and `expiresAt` into the same file it read, leaving every other field of that file byte-identical in meaning.
3. The system SHALL write the credential file atomically: a temporary file in the same directory, then a rename over the original.
4. WHILE the located credential's `expiresAt` is later than now plus 60 s the system SHALL NOT contact the token endpoint and SHALL NOT write the credential file.
5. IF the refresh request fails, returns a non-success status, or returns a body without an `access_token` THEN the system SHALL leave the credential file untouched and continue with the token it already had.
6. IF the located credential has no non-empty `refreshToken` THEN the system SHALL skip the refresh and continue with the token it already had.
7. IF no credential is found in any profile THEN the system SHALL report `no_credential` and SHALL NOT contact the token endpoint.
8. WHILE a refresh is in flight the system SHALL make any concurrent quota fetch wait rather than start a second refresh of the same credential.
9. The system SHALL NOT log, emit over IPC, or include in any error value the `accessToken` or the `refreshToken`.

**Independent Test**: Point the app at a credential file whose `expiresAt` is in the past and whose `refreshToken` is valid; the ring shows usage without the user touching the CLI, and the file on disk carries a new `expiresAt`.

---

### P2: The ring catches up quickly after a login

**User Story**: As a user who just logged in with `claude` while SwarmDeck was open, I want the ring to light up in seconds, so that I do not wonder whether the app noticed.

**Why P2**: Comfort, not correctness — the 5-minute poll gets there eventually.

**Acceptance Criteria**:

1. WHILE the last quota snapshot's state is `no_credential` or `unauthorized` the indicator SHALL repeat the fetch every 30 s, bypassing the backend cache floor.
2. WHEN the state stops being `no_credential` or `unauthorized` THEN the indicator SHALL stop the 30 s repetition and keep only the 5-minute cadence.
3. WHILE the fast retry is active the indicator SHALL NOT stop the existing 5-minute cadence.

**Independent Test**: Render the indicator with a `no_credential` snapshot, advance the clock 30 s with fake timers, and assert a second fetch happened.

---

## Edge Cases

- IF the credential file is larger than 64 KB THEN the system SHALL skip it entirely, as it already does for reading (the existing size guard is not bypassed by the refresh path).
- IF the file has no `expiresAt` THEN the system SHALL treat the token as usable and SHALL NOT refresh — a missing expiry is not evidence of expiry.
- IF the token endpoint returns a body without a new `refreshToken` THEN the system SHALL keep the existing `refreshToken` in the file and still write the new `accessToken` and `expiresAt`.
- IF writing the temporary file or the rename fails THEN the system SHALL continue with the token it already had and SHALL log the failure to stderr without the token values.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| QTR-01 | P1 criterion 1 | Execute | Verified |
| QTR-02 | P1 criterion 2 | Execute | Verified |
| QTR-03 | P1 criterion 3 | Execute | Verified |
| QTR-04 | P1 criterion 4 | Execute | Verified |
| QTR-05 | P1 criterion 5 | Execute | Verified |
| QTR-06 | P1 criterion 6 | Execute | Verified |
| QTR-07 | P1 criterion 7 | Execute | Verified |
| QTR-08 | P1 criterion 8 | Execute | Verified |
| QTR-09 | P1 criterion 9 | Execute | Verified |
| QTR-10 | P2 criterion 1 | Execute | Verified |
| QTR-11 | P2 criterion 2 | Execute | Verified |
| QTR-12 | P2 criterion 3 | Execute | Verified |
| QTR-13 | Edge: no `expiresAt` → no refresh | Execute | Verified |
| QTR-14 | Edge: response without a new `refreshToken` | Execute | Verified |
| QTR-15 | Edge: write failure is logged and non-fatal | Execute | Verified |

**Coverage:** 15 total, 15 mapped, 0 unmapped.

## Revoked elsewhere

`QUOTA-18` ("the credential file is opened read-only") is **revoked by AD-043**. It survives only as a code comment — `.specs/features/quota-indicator/` was lost when `.specs/` was gitignored (see the note at the top of `STATE.md`), so there is no spec file to amend. The `SPEC:` markers that cite QUOTA-18 are annotated with the revocation instead.

---

## Success Criteria

- [ ] A machine whose token expired overnight shows quota at boot, with no terminal opened.
- [ ] `~/.claude/.credentials.json` after a refresh still works for the `claude` CLI.
- [ ] A machine that never logged in shows no quota and writes nothing.
