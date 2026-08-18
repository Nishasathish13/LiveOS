# Life OS — Product Requirements

## Problem statement
Life OS is a private, modular mobile life-design app that helps each person define their own north star, domains, goals, daily progress, deliberate rest, reflections, and AI companion tone. It must observe neutrally, keep sensitive data private, label AI output as editable drafts, and use a calm crisis-safety fallback instead of normal coaching.

## Architecture
- Expo SDK 54 / React Native frontend with Expo Router, SecureStore session storage, responsive mobile layouts, and vector icons.
- FastAPI backend on port 8001 with MongoDB via Motor and `/api` routes.
- Emergent-managed Google OAuth session exchange on the backend.
- Emergent LLM integration for companion responses using GPT 5.6 Luna; prompts include profile, domains, recent logs, tone, and safety constraints.
- Per-user collections and bearer-token session isolation.

## User personas
- The self-directed builder: wants flexible domains and goals without a rigid productivity template.
- The reflective journaler: wants a calm place to notice patterns in mood, sleep, rest, and activity.
- The gentle planner: needs practical tasks and reminders without guilt or streak pressure.

## Core requirements
- User-configured onboarding paths: guided questionnaire or document import.
- Editable profile north star, companion tone, domains, frequencies, descriptions, and progress definitions.
- Daily check-in with mood, sleep, activities, touched domains, voice affordance, and chosen rest.
- Tasks with due date, optional domain, completion, grouping, and notification permission request.
- Weekly/monthly reflection surface with neutral balance observations and editable AI draft.
- Persistent companion with source-aware, non-authoritative responses and crisis fallback.
- Google authentication and private per-user data isolation.
- Permanent medical/mental-health disclaimer.

## Implemented
### 2026-08-18 (session 2 — intelligent MVP)
- AI onboarding Path A: `POST /api/onboard/document` reads uploaded .txt/.md text and parses it via GPT-5.6-Luna into an editable {northStar, tone, domains[name,description,color,targetFrequency,goals]} draft.
- AI onboarding Path B: 6-question guided flow -> `POST /api/onboard/conversational` -> same editable review draft. `POST /api/onboard/commit` saves profile and replaces domains (with goals). Nothing auto-committed; full review/edit/add/remove/frequency-stepper before save.
- AI weekly/monthly reflection: `POST /api/reflection/generate` writes a neutral, tone-adapted paragraph from profile + last 7 logs; editable draft with Save/Regenerate/Dismiss; `PUT /api/reflection` persists ReflectionSummary. Week/month segment + mood/sleep/task-completion/chosen-rest tiles + neutral per-domain balance facts.
- Daily check-in fixed: real numeric sleep-hours input, multi-select domain chips, chosen-rest clears touched domains, same-date replace, prefill when today already logged.
- Tasks: due-date picker (native DateTimePicker; web quick-date chips), optional linked domain, overdue/upcoming/done grouping, and real local notification reminders scheduled at 9am on due date with proper permission handling.
- Companion chat now persists (loaded from `/api/workspace.messages`); crisis-keyword safety fallback returns grounding + 988 without calling the LLM.
- Permanent in-app disclaimer added on every screen. Replaced all Alert popups with inline toasts/notices.
- Seeded deterministic test session (`seed_test_user.py`, token in test_credentials.md). Verified 21/21 backend pytest + 8/8 frontend E2E flows pass.

### 2026-08-18 (session 1 — shell)
- Added Google OAuth session exchange, protected workspace APIs, profile persistence, domains, daily logs, tasks, companion chat, and crisis keyword fallback.
- Added onboarding path choice, text document picker control, tone selection, north-star editing, deliberate rest, task completion/grouping, editable reflection draft, safety-state styling, and voice-input affordances.
- Added notification permission configuration and request during task creation.
- Validated backend root/401 boundaries, TypeScript, ESLint, Python lint, mobile screenshot rendering, and Expo regression checks.

## Prioritized backlog
### P0
- Add a Google test identity/session and run authenticated end-to-end tests for profile creation, workspace isolation, logs, tasks, domains, and companion.
- Complete native device speech-to-text integration beyond the current device-microphone affordance.
- Parse uploaded document contents through a dedicated LLM review endpoint rather than only importing the document name into the editable field.

### P1
- Schedule actual local notifications for task due dates after permission is granted.
- Persist reflection draft edits and dismissals as ReflectionSummary records.
- Add full adaptive 15–20-question onboarding flow and structured profile/domain/goal review.
- Add monthly reflection calculations and domain touch-frequency gauges.

### P2
- Add domain editing, deletion, colors, icons, and goal CRUD.
- Add voice transcript storage and privacy controls.
- Add export/delete-my-data controls and richer offline/error states.

## Next tasks
1. Supply an approved Google test identity for authenticated regression coverage.
2. Implement native speech recognition and document text extraction/LLM review.
3. Add persisted reflection summaries and scheduled due-date notifications.