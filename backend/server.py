from fastapi import FastAPI, APIRouter, Header, HTTPException, Depends
from dotenv import load_dotenv
import json
import re
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
import httpx
import secrets


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


class SessionInput(BaseModel):
    session_id: str

class ProfileInput(BaseModel):
    northStar: str = ""
    companionTone: str = "gentle companion"
    directiveness: int = 50

class DomainInput(BaseModel):
    name: str
    description: str = ""
    color: str = "#B85C45"
    icon: str = "sparkles"
    targetFrequency: int = 3
    progressDefinition: str = ""
    goals: List[str] = []

class LogInput(BaseModel):
    date: str
    activities: str = ""
    moodScore: int = 3
    sleepHours: float = 0
    domainsTouched: List[str] = []
    isRestDay: bool = False

class TaskInput(BaseModel):
    title: str
    dueDate: Optional[str] = None
    domainId: Optional[str] = None
    done: bool = False

class ChatInput(BaseModel):
    text: str

class DocInput(BaseModel):
    text: str = ""

class ConversationalInput(BaseModel):
    answers: Dict[str, str] = {}

class ReviewDomain(BaseModel):
    name: str
    description: str = ""
    color: str = "#B85C45"
    icon: str = "sparkles"
    targetFrequency: int = 3
    goals: List[str] = []

class CommitInput(BaseModel):
    northStar: str = ""
    companionTone: str = "gentle companion"
    domains: List[ReviewDomain] = []

class ReflectionSaveInput(BaseModel):
    weekStart: str
    generatedText: str
    userEdited: bool = True

class GoalBreakdownInput(BaseModel):
    goal: str
    domainId: Optional[str] = None

class FeedbackInput(BaseModel):
    kind: str  # 'too_pushy' | 'too_soft'

def now_iso():
    return datetime.now(timezone.utc).isoformat()

def directiveness_note(d: int) -> str:
    if d <= 33:
        return "Lean gentle and non-directive: offer soft, optional suggestions, validate feelings, and avoid pushing."
    if d >= 67:
        return "Lean firm and direct: give clear, decisive, concrete next steps while staying respectful and kind."
    return "Stay balanced: supportive and warm, but offer clear suggestions when useful."

async def current_user(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Authentication required")
    token = authorization.split(" ", 1)[1]
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        raise HTTPException(401, "Invalid session")
    expires = session["expires_at"]
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires < datetime.now(timezone.utc):
        raise HTTPException(401, "Expired session")
    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(401, "User not found")
    return user

# Add your routes to the router instead of directly to app
@api_router.get("/")
async def root():
    return {"message": "Life OS API"}

@api_router.post("/auth/session")
async def exchange_session(input: SessionInput):
    async with httpx.AsyncClient(timeout=12) as client_http:
        response = await client_http.get("https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data", headers={"X-Session-ID": input.session_id})
    if response.status_code != 200:
        raise HTTPException(401, "Invalid Google session")
    data = response.json()
    user = await db.users.find_one({"email": data.get("email")}, {"_id": 0})
    user_id = user.get("user_id") if user else f"user_{uuid.uuid4().hex[:12]}"
    user = {"user_id": user_id, "email": data.get("email", ""), "name": data.get("name", "Friend"), "picture": data.get("picture"), "created_at": user.get("created_at", now_iso()) if user else now_iso(), "tone": user.get("tone", "gentle companion") if user else "gentle companion"}
    await db.users.replace_one({"email": user["email"]}, user, upsert=True)
    token = data.get("session_token") or secrets.token_urlsafe(32)
    await db.user_sessions.insert_one({"session_token": token, "user_id": user_id, "created_at": datetime.now(timezone.utc), "expires_at": datetime.now(timezone.utc) + timedelta(days=7)})
    return {"session_token": token, "user": user}

@api_router.get("/auth/me")
async def me(user=__import__('fastapi').Depends(current_user)):
    return user

@api_router.get("/workspace")
async def workspace(user=__import__('fastapi').Depends(current_user)):
    uid = user["user_id"]
    profile = await db.profiles.find_one({"user_id": uid}, {"_id": 0}) or {"user_id": uid, "northStar": "", "companionTone": user.get("tone", "gentle companion")}
    profile.setdefault("directiveness", 50)
    domains = await db.domains.find({"user_id": uid}, {"_id": 0}).to_list(50)
    logs = await db.daily_logs.find({"user_id": uid}, {"_id": 0}).sort("date", -1).to_list(30)
    tasks = await db.tasks.find({"user_id": uid}, {"_id": 0}).sort("dueDate", 1).to_list(100)
    reflections = await db.reflection_summaries.find({"user_id": uid}, {"_id": 0}).sort("weekStart", -1).to_list(12)
    messages = await db.companion_messages.find({"user_id": uid}, {"_id": 0}).sort("timestamp", 1).to_list(200)
    roadmap = await db.roadmap_suggestions.find({"user_id": uid, "status": "pending"}, {"_id": 0}).sort("created_at", -1).to_list(20)
    return {"user": user, "profile": profile, "domains": domains, "logs": logs, "tasks": tasks, "reflections": reflections, "messages": messages, "roadmap": roadmap}

@api_router.put("/profile")
async def save_profile(input: ProfileInput, user=__import__('fastapi').Depends(current_user)):
    item = {"user_id": user["user_id"], **input.model_dump()}
    await db.profiles.replace_one({"user_id": user["user_id"]}, item, upsert=True)
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"tone": input.companionTone}})
    return item

async def save_entity(collection, input_data, user):
    item = {"id": uuid.uuid4().hex[:10], "user_id": user["user_id"], **input_data}
    await db[collection].insert_one(item)
    item.pop("_id", None)
    return item

@api_router.post("/domains")
async def add_domain(input: DomainInput, user=__import__('fastapi').Depends(current_user)):
    return await save_entity("domains", input.model_dump(), user)

@api_router.post("/logs")
async def add_log(input: LogInput, user=__import__('fastapi').Depends(current_user)):
    await db.daily_logs.delete_many({"user_id": user["user_id"], "date": input.date})
    return await save_entity("daily_logs", input.model_dump(), user)

@api_router.post("/tasks")
async def add_task(input: TaskInput, user=__import__('fastapi').Depends(current_user)):
    return await save_entity("tasks", input.model_dump(), user)

@api_router.patch("/tasks/{task_id}")
async def update_task(task_id: str, input: TaskInput, user=__import__('fastapi').Depends(current_user)):
    item = input.model_dump()
    result = await db.tasks.update_one({"id": task_id, "user_id": user["user_id"]}, {"$set": item})
    if not result.matched_count: raise HTTPException(404, "Task not found")
    return {"id": task_id, **item}

@api_router.post("/companion")
async def companion(input: ChatInput, user=__import__('fastapi').Depends(current_user)):
    uid = user["user_id"]
    profile = await db.profiles.find_one({"user_id": uid}, {"_id": 0}) or {}
    domains = await db.domains.find({"user_id": uid}, {"_id": 0}).to_list(20)
    logs = await db.daily_logs.find({"user_id": uid}, {"_id": 0}).sort("date", -1).to_list(7)
    crisis = any(word in input.text.lower() for word in ["kill myself", "suicide", "self-harm", "end my life", "hopeless"])
    if crisis:
        answer = "I’m really sorry this feels heavy. Please pause and move somewhere safer, take one slow breath, and contact someone you trust now. If you may act on these thoughts, call your local emergency number or a crisis line (US/Canada: 988). I can stay with you, but I’m not a crisis service."
    else:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        d = int(profile.get("directiveness", 50))
        prompt = f"You are Life OS companion. Tone preset: {profile.get('companionTone','gentle companion')}. Directiveness {d}/100 — {directiveness_note(d)} North star: {profile.get('northStar','not set')}. Domains: {domains}. Recent logs: {logs}. Never diagnose or give medical, legal, or financial advice. Treat suggestions as editable drafts and cite the supplied data. User: {input.text}"
        chat = LlmChat(api_key=os.getenv("EMERGENT_LLM_KEY"), session_id=uid, system_message=prompt).with_model("openai", "gpt-5.6-luna")
        answer = (await chat.send_message(UserMessage(text=input.text))).strip()
    await db.companion_messages.insert_many([{ "user_id": uid, "role": "user", "text": input.text, "timestamp": now_iso(), "safety": False }, {"user_id": uid, "role": "assistant", "text": answer, "timestamp": now_iso(), "safety": crisis}])
    return {"text": answer, "isSafety": crisis}

PALETTE = ["#294A3A", "#B85C45", "#C58C32", "#A9B9A2", "#6B7A8F", "#8A6D9B", "#4E6E58", "#9B6D5C"]

PARSE_SYSTEM = (
    "You are the intake parser for Life OS, a private life-design app. Turn a person's self-reflection into an "
    "editable starting profile. Return ONLY valid JSON (no markdown) with keys: "
    "northStar (a single warm sentence in the user's own voice describing what they are building toward), "
    "companionTone (one of: 'direct coach', 'gentle companion', 'neutral tracker'), and "
    "domains (an array of 3 to 8 objects). Each domain object has: name (2-3 words), description (<=12 words, neutral), "
    "targetFrequency (integer 1-7 times per week), goals (array of 2-3 short, concrete goal strings). "
    "Name the user's own domains from what they wrote; do not force generic categories. Never diagnose, never give "
    "medical, legal, or financial advice. Everything is a first draft the user will edit."
)


async def llm_parse(user_text: str, session_id: str) -> dict:
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    chat = LlmChat(api_key=os.getenv("EMERGENT_LLM_KEY"), session_id=session_id, system_message=PARSE_SYSTEM).with_model("openai", "gpt-5.6-luna")
    raw = (await chat.send_message(UserMessage(text=user_text))).strip()
    match = re.search(r"\{.*\}", raw, re.DOTALL)
    data = json.loads(match.group(0)) if match else {}
    return normalize_profile(data)


def normalize_profile(data: dict) -> dict:
    tone = data.get("companionTone", "gentle companion")
    if tone not in ("direct coach", "gentle companion", "neutral tracker"):
        tone = "gentle companion"
    domains = []
    for i, d in enumerate((data.get("domains") or [])[:8]):
        if not isinstance(d, dict) or not d.get("name"):
            continue
        goals = [str(g) for g in (d.get("goals") or []) if str(g).strip()][:3]
        try:
            freq = max(1, min(7, int(d.get("targetFrequency", 3))))
        except (ValueError, TypeError):
            freq = 3
        domains.append({
            "name": str(d.get("name", "")).strip()[:40],
            "description": str(d.get("description", "")).strip()[:120],
            "color": PALETTE[i % len(PALETTE)],
            "icon": "sparkles",
            "targetFrequency": freq,
            "goals": goals,
        })
    return {"northStar": str(data.get("northStar", "")).strip(), "companionTone": tone, "domains": domains}


@api_router.post("/onboard/document")
async def onboard_document(input: DocInput, user=Depends(current_user)):
    text = (input.text or "").strip()
    if not text:
        raise HTTPException(400, "No document text provided")
    return await llm_parse(f"Here is the person's self-reflection document:\n\n{text[:6000]}", f"doc_{user['user_id']}")


@api_router.post("/onboard/conversational")
async def onboard_conversational(input: ConversationalInput, user=Depends(current_user)):
    if not input.answers:
        raise HTTPException(400, "No answers provided")
    qa = "\n".join(f"Q: {k}\nA: {v}" for k, v in input.answers.items() if str(v).strip())
    return await llm_parse(f"Here are the person's answers to an intake questionnaire:\n\n{qa}", f"conv_{user['user_id']}")


@api_router.post("/onboard/commit")
async def onboard_commit(input: CommitInput, user=Depends(current_user)):
    uid = user["user_id"]
    existing = await db.profiles.find_one({"user_id": uid}, {"_id": 0}) or {}
    await db.profiles.replace_one({"user_id": uid}, {"user_id": uid, "northStar": input.northStar, "companionTone": input.companionTone, "directiveness": existing.get("directiveness", 50)}, upsert=True)
    await db.users.update_one({"user_id": uid}, {"$set": {"tone": input.companionTone}})
    created = []
    if input.domains:
        await db.domains.delete_many({"user_id": uid})
        for d in input.domains:
            item = {"id": uuid.uuid4().hex[:10], "user_id": uid, **d.model_dump()}
            await db.domains.insert_one(item)
            item.pop("_id", None)
            created.append(item)
    return {"ok": True, "domains": created}


@api_router.post("/reflection/generate")
async def generate_reflection(user=Depends(current_user)):
    uid = user["user_id"]
    profile = await db.profiles.find_one({"user_id": uid}, {"_id": 0}) or {}
    domains = await db.domains.find({"user_id": uid}, {"_id": 0}).to_list(20)
    logs = await db.daily_logs.find({"user_id": uid}, {"_id": 0}).sort("date", -1).to_list(7)
    tone = profile.get("companionTone", "gentle companion")
    system = (
        f"You write ONE weekly reflection paragraph (90-140 words) for Life OS in a {tone} voice. "
        "Base it strictly on the supplied data and name what you are basing it on (e.g. 'based on your last 7 entries'). "
        "State any quiet domain as a neutral fact, never as guilt or a verdict. Treat rest days as a positive, deliberate "
        "choice. This is an editable draft, not instruction. Never diagnose, never give medical, legal, or financial advice."
    )
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    chat = LlmChat(api_key=os.getenv("EMERGENT_LLM_KEY"), session_id=f"reflect_{uid}", system_message=system).with_model("openai", "gpt-5.6-luna")
    user_text = f"North star: {profile.get('northStar', 'not set')}. Domains: {domains}. Last 7 daily logs (most recent first): {logs}."
    text = (await chat.send_message(UserMessage(text=user_text))).strip()
    return {"text": text}


@api_router.put("/reflection")
async def save_reflection(input: ReflectionSaveInput, user=Depends(current_user)):
    uid = user["user_id"]
    item = {"user_id": uid, "weekStart": input.weekStart, "generatedText": input.generatedText, "userEdited": input.userEdited, "updated_at": now_iso()}
    await db.reflection_summaries.replace_one({"user_id": uid, "weekStart": input.weekStart}, item, upsert=True)
    return item


@api_router.post("/goals/breakdown")
async def goal_breakdown(input: GoalBreakdownInput, user=Depends(current_user)):
    goal = (input.goal or "").strip()
    if not goal:
        raise HTTPException(400, "No goal provided")
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    system = (
        "You break a personal goal into 3-5 small, concrete, actionable next tasks. "
        "Return ONLY a JSON array of short task title strings (each <= 8 words), no numbering, no extra text."
    )
    chat = LlmChat(api_key=os.getenv("EMERGENT_LLM_KEY"), session_id=f"goal_{user['user_id']}", system_message=system).with_model("openai", "gpt-5.6-luna")
    raw = (await chat.send_message(UserMessage(text=f"Goal: {goal}"))).strip()
    match = re.search(r"\[.*\]", raw, re.DOTALL)
    titles: List[str] = []
    if match:
        try:
            titles = [str(t).strip() for t in json.loads(match.group(0)) if str(t).strip()][:5]
        except json.JSONDecodeError:
            titles = []
    if not titles:
        titles = [goal]
    created = []
    for t in titles:
        item = {"id": uuid.uuid4().hex[:10], "user_id": user["user_id"], "title": t, "dueDate": None, "domainId": input.domainId, "done": False}
        await db.tasks.insert_one(item)
        item.pop("_id", None)
        created.append(item)
    return {"tasks": created}


@api_router.post("/roadmap/generate")
async def roadmap_generate(user=Depends(current_user)):
    uid = user["user_id"]
    domains = await db.domains.find({"user_id": uid}, {"_id": 0}).to_list(20)
    if not domains:
        return {"suggestions": []}
    logs = await db.daily_logs.find({"user_id": uid}, {"_id": 0}).sort("date", -1).to_list(40)
    cutoff = (datetime.now(timezone.utc) - timedelta(days=14)).date().isoformat()
    summary = []
    for d in domains:
        cnt = sum(1 for l in logs if l.get("date", "") >= cutoff and d["id"] in (l.get("domainsTouched") or []))
        summary.append({"domainId": d["id"], "name": d["name"], "currentTarget": d.get("targetFrequency", 3), "recentTouchesLast14Days": cnt, "goals": d.get("goals", [])})
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    system = (
        "You are the roadmap engine for Life OS. Review each domain's stated goals, its current weekly target frequency, and how "
        "often it was actually touched in the last 14 days. Suggest a realistic updated weekly target (integer 1-7) per domain that "
        "better fits reality and the goals — it is fine to lower a target to reduce pressure, or raise it when there is clear momentum. "
        "Return ONLY a JSON array of objects {domainId, suggestedTarget, rationale (<=20 words, neutral, factual, no guilt)}. "
        "Only include a domain when suggestedTarget differs from its current target. These are suggestions the user approves or "
        "rejects — never phrase them as commands, and never auto-apply."
    )
    chat = LlmChat(api_key=os.getenv("EMERGENT_LLM_KEY"), session_id=f"roadmap_{uid}", system_message=system).with_model("openai", "gpt-5.6-luna")
    raw = (await chat.send_message(UserMessage(text=f"Domains data: {summary}"))).strip()
    match = re.search(r"\[.*\]", raw, re.DOTALL)
    parsed = []
    if match:
        try:
            parsed = json.loads(match.group(0))
        except json.JSONDecodeError:
            parsed = []
    await db.roadmap_suggestions.delete_many({"user_id": uid, "status": "pending"})
    by_id = {d["id"]: d for d in domains}
    suggestions = []
    for p in parsed:
        dom = by_id.get(p.get("domainId"))
        if not dom:
            continue
        try:
            st = max(1, min(7, int(p.get("suggestedTarget"))))
        except (ValueError, TypeError):
            continue
        if st == dom.get("targetFrequency", 3):
            continue
        item = {"id": uuid.uuid4().hex[:10], "user_id": uid, "domainId": dom["id"], "domainName": dom["name"], "currentTarget": dom.get("targetFrequency", 3), "suggestedTarget": st, "rationale": str(p.get("rationale", ""))[:160], "status": "pending", "created_at": now_iso()}
        await db.roadmap_suggestions.insert_one(item)
        item.pop("_id", None)
        suggestions.append(item)
    return {"suggestions": suggestions}


@api_router.post("/roadmap/{sid}/apply")
async def roadmap_apply(sid: str, user=Depends(current_user)):
    uid = user["user_id"]
    s = await db.roadmap_suggestions.find_one({"id": sid, "user_id": uid}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Suggestion not found")
    await db.domains.update_one({"id": s["domainId"], "user_id": uid}, {"$set": {"targetFrequency": s["suggestedTarget"]}})
    await db.roadmap_suggestions.update_one({"id": sid, "user_id": uid}, {"$set": {"status": "accepted"}})
    return {"ok": True, "domainId": s["domainId"], "targetFrequency": s["suggestedTarget"]}


@api_router.post("/roadmap/{sid}/dismiss")
async def roadmap_dismiss(sid: str, user=Depends(current_user)):
    result = await db.roadmap_suggestions.update_one({"id": sid, "user_id": user["user_id"]}, {"$set": {"status": "dismissed"}})
    if not result.matched_count:
        raise HTTPException(404, "Suggestion not found")
    return {"ok": True}


@api_router.post("/companion/feedback")
async def companion_feedback(input: FeedbackInput, user=Depends(current_user)):
    uid = user["user_id"]
    profile = await db.profiles.find_one({"user_id": uid}, {"_id": 0}) or {"user_id": uid, "northStar": "", "companionTone": "gentle companion", "directiveness": 50}
    d = int(profile.get("directiveness", 50))
    if input.kind == "too_pushy":
        d = max(0, d - 15)
    elif input.kind == "too_soft":
        d = min(100, d + 15)
    else:
        raise HTTPException(400, "Unknown feedback kind")
    profile["directiveness"] = d
    profile["user_id"] = uid
    await db.profiles.replace_one({"user_id": uid}, {k: v for k, v in profile.items() if k != "_id"}, upsert=True)
    await db.companion_feedback.insert_one({"user_id": uid, "kind": input.kind, "directiveness": d, "created_at": now_iso()})
    return {"directiveness": d}


# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
