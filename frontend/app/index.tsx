import React, { useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Linking as NativeLinking, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as SecureStore from "expo-secure-store";
import * as ExpoLinking from "expo-linking";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Notifications from "expo-notifications";
import DateTimePicker from "@react-native-community/datetimepicker";
import Constants from "expo-constants";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Circle } from "react-native-svg";
import Slider from "@react-native-community/slider";

const Linking = { getInitialURL: NativeLinking.getInitialURL, createURL: ExpoLinking.createURL };

WebBrowser.maybeCompleteAuthSession();
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});
const API = `${Constants.expoConfig?.extra?.backendUrl || process.env.EXPO_PUBLIC_BACKEND_URL}/api`;
const colors = { canvas: "#F5F1E8", surface: "#FFFDF7", ink: "#242728", muted: "#62645F", forest: "#294A3A", clay: "#B85C45", ochre: "#C58C32", line: "#D6D0C3", sage: "#A9B9A2" };
const tones = ["direct coach", "gentle companion", "neutral tracker"];
type Domain = { id: string; name: string; description: string; color: string; targetFrequency: number };
type Task = { id: string; title: string; dueDate?: string; done: boolean };
type Workspace = { user: any; profile: any; domains: Domain[]; logs: any[]; tasks: Task[] };

async function tokenGet() { return Platform.OS === "web" ? (globalThis as any).localStorage?.getItem("lifeos_token") : SecureStore.getItemAsync("lifeos_token"); }
async function tokenSet(value: string) { if (Platform.OS === "web") (globalThis as any).localStorage?.setItem("lifeos_token", value); else await SecureStore.setItemAsync("lifeos_token", value); }
async function api(path: string, options: any = {}) { const token = await tokenGet(); const response = await fetch(`${API}${path}`, { ...options, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) } }); if (!response.ok) throw new Error(await response.text()); return response.json(); }

export default function Index() {
  const [user, setUser] = useState<any>(null); const [loading, setLoading] = useState(true); const [workspace, setWorkspace] = useState<Workspace | null>(null); const [tab, setTab] = useState("Today"); const [showOnboarding, setShowOnboarding] = useState(false);
  useEffect(() => { const boot = async () => { try { const incoming = await getSessionId(); if (incoming) { const data = await api("/auth/session", { method: "POST", body: JSON.stringify({ session_id: incoming }) }); await tokenSet(data.session_token); setUser(data.user); } else { const me = await api("/auth/me"); setUser(me); } } catch {} finally { setLoading(false); } }; boot(); }, []);
  useEffect(() => { if (user) api("/workspace").then(setWorkspace).catch(() => {}); }, [user]);
  const login = async () => { const redirect = Platform.OS === "web" ? `${window.location.origin}/` : Linking.createURL(""); const result = await WebBrowser.openAuthSessionAsync(`https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirect)}`, redirect); const id = result.type === "success" && result.url ? extractSession(result.url) : await getSessionId(); if (id) { const data = await api("/auth/session", { method: "POST", body: JSON.stringify({ session_id: id }) }); await tokenSet(data.session_token); setUser(data.user); } };
  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.forest} /><Text style={styles.muted}>Opening your private space…</Text></View>;
  if (!user) return <Login onLogin={login} />;
  if (!workspace) return <View style={styles.center}><ActivityIndicator color={colors.forest} /><Text style={styles.muted}>Gathering your notes…</Text></View>;
  return <SafeAreaView style={styles.safe}><View style={styles.shell}><Header user={user} onOnboard={() => setShowOnboarding(true)} /><ScrollView contentContainerStyle={styles.content}>{tab === "Today" && <Today workspace={workspace} onRefresh={() => api("/workspace").then(setWorkspace)} />}{tab === "Tasks" && <Tasks workspace={workspace} onRefresh={() => api("/workspace").then(setWorkspace)} />}{tab === "Reflect" && <Reflect workspace={workspace} onRefresh={() => api("/workspace").then(setWorkspace)} />}{tab === "Domains" && <Domains workspace={workspace} onRefresh={() => api("/workspace").then(setWorkspace)} />}{tab === "Companion" && <Companion workspace={workspace} />}<Disclaimer /></ScrollView><TabBar tab={tab} setTab={setTab} /></View>{showOnboarding && <Onboarding close={() => setShowOnboarding(false)} onSaved={() => { setShowOnboarding(false); api("/workspace").then(setWorkspace); }} onDeleted={async () => { await tokenSet(""); setShowOnboarding(false); setWorkspace(null); setUser(null); }} />}</SafeAreaView>;
}

async function getSessionId() { if (Platform.OS === "web") return extractSession(window.location.href); const initial = await Linking.getInitialURL(); return initial ? extractSession(initial) : null; }
function extractSession(url: string) { const match = url.match(/[?#&]session_id=([^&#]+)/); return match ? decodeURIComponent(match[1]) : null; }
function Login({ onLogin }: { onLogin: () => void }) { return <SafeAreaView style={styles.safe}><View style={styles.login}><View style={styles.mark}><Ionicons name="compass-outline" size={30} color={colors.surface} /></View><Text style={styles.eyebrow}>A PERSONAL INSTRUMENT</Text><Text style={styles.hero}>Design a life{`\n`}that sounds like you.</Text><Text style={styles.lead}>Life OS brings your reflection, direction, and daily movement into one quiet place.</Text><View style={styles.promise}><Ionicons name="lock-closed-outline" size={18} color={colors.forest} /><Text style={styles.promiseText}>Private by default · editable by you</Text></View><Pressable testID="continue-google" style={({ pressed }) => [styles.primary, pressed && styles.pressed]} onPress={onLogin}><Ionicons name="logo-google" size={18} color={colors.surface} /><Text style={styles.primaryText}>Continue with Google</Text></Pressable><Text style={styles.disclaimer}>Life OS is a tracking and reflection tool, not a medical or mental health service.</Text></View></SafeAreaView>; }
function Header({ user, onOnboard }: any) { return <View style={styles.header}><View><Text style={styles.brand}>LIFE <Text style={{ color: colors.clay }}>OS</Text></Text><Text style={styles.date}>{new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric" }).format(new Date())}</Text></View><Pressable testID="profile-button" onPress={onOnboard} style={styles.avatar}><Text style={styles.avatarText}>{(user.name || "L").slice(0, 1).toUpperCase()}</Text></Pressable></View>; }
function Today({ workspace, onRefresh }: { workspace: Workspace; onRefresh: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const existing = workspace.logs.find((l: any) => l.date === today);
  const [activities, setActivities] = useState(existing?.activities || "");
  const [mood, setMood] = useState(existing?.moodScore || 3);
  const [sleep, setSleep] = useState(existing?.sleepHours ? String(existing.sleepHours) : "");
  const [touched, setTouched] = useState<string[]>(existing?.domainsTouched || []);
  const [rest, setRest] = useState(existing?.isRestDay || false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const toggleDomain = (id: string) => setTouched(t => t.includes(id) ? t.filter(x => x !== id) : [...t, id]);
  const save = async () => {
    setSaving(true);
    try {
      await api("/logs", { method: "POST", body: JSON.stringify({ date: today, activities, moodScore: mood, sleepHours: parseFloat(sleep) || 0, domainsTouched: rest ? [] : touched, isRestDay: rest }) });
      onRefresh();
      setToast(rest ? "Rest logged as a deliberate choice." : "Your note is in the record.");
      setTimeout(() => setToast(""), 2600);
    } finally { setSaving(false); }
  };
  return (<View>
    <Text style={styles.eyebrow}>{existing ? "TODAY · UPDATING" : "TODAY"}</Text>
    <Text style={styles.title}>What is present today?</Text>
    <Text style={styles.subtitle}>A small note is enough. This is observation, not evaluation.</Text>
    <View style={styles.card}>
      <Text style={styles.cardLabel}>MOOD · {mood} / 5</Text>
      <View style={styles.moodRow}>{[1, 2, 3, 4, 5].map(n => <Pressable testID={`mood-${n}`} key={n} onPress={() => setMood(n)} style={[styles.mood, mood === n && styles.moodActive]}><Text style={[styles.moodText, mood === n && { color: colors.surface }]}>{n}</Text></Pressable>)}</View>
      <Text style={[styles.cardLabel, { marginTop: 24 }]}>SLEEP · HOURS</Text>
      <TextInput testID="sleep-input" value={sleep} onChangeText={setSleep} placeholder="e.g. 7.5" placeholderTextColor={colors.muted} keyboardType="decimal-pad" style={styles.hoursInput} />
      <Text style={[styles.cardLabel, { marginTop: 24 }]}>DOMAINS TOUCHED</Text>
      {workspace.domains.length === 0 ? <Text style={[styles.small, { marginTop: 6 }]}>Add domains in the Domains tab to tag them here.</Text> :
        <View style={styles.chipWrap}>{workspace.domains.map((d: Domain) => { const on = touched.includes(d.id); return <Pressable testID={`touch-${d.id}`} key={d.id} onPress={() => toggleDomain(d.id)} disabled={rest} style={[styles.chip, on && { backgroundColor: d.color, borderColor: d.color }, rest && { opacity: 0.4 }]}><Text style={[styles.chipText, on && { color: colors.surface }]}>{d.name}</Text></Pressable>; })}</View>}
      <Text style={[styles.cardLabel, { marginTop: 24 }]}>A FEW WORDS</Text>
      <View style={styles.inputWithVoice}><TextInput testID="activities-input" value={activities} onChangeText={setActivities} placeholder="What did you do, notice, or make space for?" placeholderTextColor={colors.muted} multiline style={styles.textarea} /><VoiceButton field="activities" /></View>
      <Pressable testID="rest-toggle" onPress={() => setRest(!rest)} style={[styles.rest, rest && { backgroundColor: "#F2DDD5", borderColor: colors.clay }]}><Ionicons name={rest ? "checkmark-circle" : "moon-outline"} size={20} color={colors.clay} /><View style={{ flex: 1 }}><Text style={styles.restTitle}>{rest ? "Chosen rest" : "Mark today as chosen rest"}</Text><Text style={styles.small}>Rest is honored, never counted as a quiet domain.</Text></View></Pressable>
      <Pressable testID="save-checkin" onPress={save} disabled={saving} style={styles.primary}><Text style={styles.primaryText}>{saving ? "Saving…" : existing ? "Update today’s note" : "Save today’s note"}</Text></Pressable>
    </View>
    {toast ? <View testID="today-toast" style={styles.toast}><Ionicons name="checkmark-circle" size={16} color={colors.surface} /><Text style={styles.toastText}>{toast}</Text></View> : null}
    <Observation workspace={workspace} />
  </View>);
}
function Observation({ workspace }: { workspace: Workspace }) {
  const quiet = workspace.domains.map((d: any) => ({ d, n: deviationNote(d, workspace.logs) })).filter((x: any) => x.n.tone !== "active");
  const latest = workspace.logs[0];
  const lead = quiet.length ? `${quiet[0].d.name} — ${quiet[0].n.text}.` : latest ? `Your latest note was recorded on ${latest.date}.` : "Your first note will give this space a little history.";
  return <View style={styles.observation}><Text style={styles.eyebrow}>AN OBSERVATION</Text><Text style={styles.observationText}>{lead}</Text><Text style={styles.source}>Based only on your saved entries · rest is honored, never a gap</Text></View>;
}
function VoiceButton({ field }: { field: string }) {
  const [hint, setHint] = useState(false);
  return (<View>
    <Pressable testID={`voice-${field}`} onPress={() => { setHint(true); setTimeout(() => setHint(false), 2800); }} style={styles.voice}><Ionicons name="mic-outline" size={20} color={colors.forest} /></Pressable>
    {hint && <View style={styles.voiceHint}><Text style={styles.voiceHintText}>Tap your keyboard’s mic to dictate — the words stay private.</Text></View>}
  </View>);
}
function Tasks({ workspace, onRefresh }: any) {
  const [title, setTitle] = useState("");
  const [due, setDue] = useState<Date | null>(new Date());
  const [showPicker, setShowPicker] = useState(false);
  const [linkDomain, setLinkDomain] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const add = async () => {
    if (!title.trim()) return;
    const dueDate = due ? due.toISOString().slice(0, 10) : undefined;
    await api("/tasks", { method: "POST", body: JSON.stringify({ title, dueDate, domainId: linkDomain }) });
    const ok = await ensureNotifPermission();
    if (ok) await scheduleTaskReminder({ title, dueDate });
    else if (Platform.OS !== "web") { setNotice("Reminders are off. Enable notifications in Settings to be nudged on due dates."); setTimeout(() => setNotice(""), 4000); }
    setTitle(""); setLinkDomain(null);
    onRefresh();
  };
  const toggle = async (task: any) => { await api(`/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify({ title: task.title, dueDate: task.dueDate, domainId: task.domainId, done: !task.done }) }); onRefresh(); };
  const todayStr = new Date().toISOString().slice(0, 10);
  const open = workspace.tasks.filter((t: Task) => !t.done);
  const overdue = open.filter((t: Task) => t.dueDate && t.dueDate < todayStr);
  const upcoming = open.filter((t: Task) => !t.dueDate || t.dueDate >= todayStr);
  const done = workspace.tasks.filter((t: Task) => t.done);
  const domainName = (id?: string) => workspace.domains.find((d: Domain) => d.id === id)?.name;
  const Row = (task: any) => (<Pressable testID={`task-${task.id}`} key={task.id} onPress={() => toggle(task)} style={[styles.task, task.done && { opacity: .55 }]}><Ionicons name={task.done ? "checkmark-circle" : "ellipse-outline"} size={22} color={colors.forest} /><View style={{ flex: 1 }}><Text style={[styles.taskText, task.done && { textDecorationLine: "line-through" }]}>{task.title}</Text>{(task.dueDate || domainName(task.domainId)) ? <Text style={styles.taskMeta}>{[task.dueDate ? formatDue(task.dueDate) : "", domainName(task.domainId) || ""].filter(Boolean).join(" · ")}</Text> : null}</View></Pressable>);
  return (<View>
    <Text style={styles.eyebrow}>THE LEDGER</Text>
    <Text style={styles.title}>Tasks, without the noise.</Text>
    <View style={styles.card}>
      <View style={styles.inline}><TextInput testID="task-input" value={title} onChangeText={setTitle} placeholder="Add something worth moving" placeholderTextColor={colors.muted} style={[styles.input, { marginTop: 0 }]} /><VoiceButton field="task" /></View>
      <View style={styles.taskOptions}>
        <Pressable testID="due-date-button" onPress={() => setShowPicker(true)} style={styles.pill}><Ionicons name="calendar-outline" size={16} color={colors.forest} /><Text style={styles.pillText}>{due ? formatDue(due.toISOString().slice(0, 10)) : "No date"}</Text></Pressable>
        {due && <Pressable testID="clear-due" onPress={() => setDue(null)} style={styles.pill}><Ionicons name="close" size={14} color={colors.muted} /></Pressable>}
      </View>
      {workspace.domains.length > 0 && <View style={styles.chipWrap}>{workspace.domains.map((d: Domain) => <Pressable key={d.id} testID={`link-${d.id}`} onPress={() => setLinkDomain(linkDomain === d.id ? null : d.id)} style={[styles.chip, linkDomain === d.id && { backgroundColor: d.color, borderColor: d.color }]}><Text style={[styles.chipText, linkDomain === d.id && { color: colors.surface }]}>{d.name}</Text></Pressable>)}</View>}
      {showPicker && Platform.OS !== "web" && <DateTimePicker testID="date-picker" value={due || new Date()} mode="date" onChange={(_e, d) => { setShowPicker(false); if (d) setDue(d); }} />}
      {showPicker && Platform.OS === "web" && <View style={styles.chipWrap}>{webDateChoices().map(c => <Pressable key={c.label} testID={`web-due-${c.label.replace(/ /g, "-")}`} onPress={() => { setDue(c.date); setShowPicker(false); }} style={styles.chip}><Text style={styles.chipText}>{c.label}</Text></Pressable>)}</View>}
      <Pressable testID="add-task" onPress={add} style={styles.primary}><Text style={styles.primaryText}>Add task</Text></Pressable>
    </View>
    {notice ? <View style={styles.notice}><Text style={styles.noticeText}>{notice}</Text></View> : null}
    {overdue.length > 0 && <Text style={styles.sectionLabel}>OVERDUE</Text>}
    {overdue.map(Row)}
    <Text style={styles.sectionLabel}>UPCOMING</Text>
    {upcoming.length === 0 ? <Text style={styles.small}>Nothing queued. Add a task above.</Text> : upcoming.map(Row)}
    {done.length > 0 && <Text style={styles.sectionLabel}>DONE</Text>}
    {done.map(Row)}
  </View>);
}
function Reflect({ workspace, onRefresh }: any) {
  const [range, setRange] = useState<"week" | "month">("week");
  const windowDays = range === "week" ? 7 : 30;
  const cutoff = new Date(Date.now() - windowDays * 86400000).toISOString().slice(0, 10);
  const logs = workspace.logs.filter((l: any) => l.date >= cutoff);
  const restDays = logs.filter((l: any) => l.isRestDay).length;
  const avg = logs.length ? (logs.reduce((s: number, l: any) => s + (l.moodScore || 0), 0) / logs.length).toFixed(1) : "—";
  const avgSleep = logs.filter((l: any) => l.sleepHours).length ? (logs.reduce((s: number, l: any) => s + (l.sleepHours || 0), 0) / logs.filter((l: any) => l.sleepHours).length).toFixed(1) : "—";
  const tasksTotal = workspace.tasks.length;
  const completion = tasksTotal ? Math.round((workspace.tasks.filter((t: any) => t.done).length / tasksTotal) * 100) : 0;
  const saved = workspace.reflections?.[0];
  const [draft, setDraft] = useState(saved?.generatedText || "");
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState("");
  const generate = async () => { setLoading(true); try { const r = await api("/reflection/generate", { method: "POST" }); setDraft(r.text); setDismissed(false); } catch { setNote("Couldn’t generate a reflection right now."); setTimeout(() => setNote(""), 3000); } finally { setLoading(false); } };
  const saveDraft = async () => { await api("/reflection", { method: "PUT", body: JSON.stringify({ weekStart: cutoff, generatedText: draft, userEdited: true }) }); onRefresh?.(); setNote("Your edited reflection is saved."); setTimeout(() => setNote(""), 2600); };
  return (<View>
    <Text style={styles.eyebrow}>REFLECTION</Text>
    <Text style={styles.title}>Notice the shape of your {range}.</Text>
    <Text style={styles.subtitle}>Patterns are invitations to look closer, not verdicts.</Text>
    <View style={styles.segment}>{(["week", "month"] as const).map(r => <Pressable key={r} testID={`range-${r}`} onPress={() => setRange(r)} style={[styles.segmentBtn, range === r && styles.segmentActive]}><Text style={[styles.segmentText, range === r && { color: colors.surface }]}>{r === "week" ? "This week" : "This month"}</Text></Pressable>)}</View>
    <View style={styles.statGrid}>
      <View style={styles.stat}><Text style={styles.statValue}>{avg}</Text><Text style={styles.statLabel}>MOOD AVG</Text></View>
      <View style={styles.stat}><Text style={styles.statValue}>{avgSleep}</Text><Text style={styles.statLabel}>SLEEP AVG</Text></View>
    </View>
    <View style={styles.statGrid}>
      <View style={styles.stat}><Text style={styles.statValue}>{completion}%</Text><Text style={styles.statLabel}>TASKS DONE</Text></View>
      <View style={styles.stat}><Text style={styles.statValue}>{restDays}</Text><Text style={styles.statLabel}>CHOSEN REST</Text></View>
    </View>
    <View style={styles.card}>
      <Text style={styles.cardLabel}>AI-GENERATED DRAFT · EDITABLE</Text>
      {draft && !dismissed ? <>
        <TextInput testID="reflection-draft" value={draft} onChangeText={setDraft} multiline style={styles.draftInput} />
        <View style={styles.draftActions}><Pressable testID="save-reflection" onPress={saveDraft}><Text style={styles.actionText}>Save edit</Text></Pressable><Pressable testID="regen-reflection" onPress={generate}><Text style={styles.actionText}>Regenerate</Text></Pressable><Pressable testID="dismiss-reflection" onPress={() => setDismissed(true)}><Text style={styles.dismissText}>Dismiss</Text></Pressable></View>
        <Text style={styles.source}>Source: your saved daily logs · a draft, not a verdict</Text>
      </> : <>
        <Text style={[styles.small, { marginTop: 8, marginBottom: 14 }]}>Generate a reflection from your recent entries. You can edit or dismiss it — nothing is presented as settled fact.</Text>
        <Pressable testID="generate-reflection" onPress={generate} disabled={loading} style={styles.primary}><Text style={styles.primaryText}>{loading ? "Reading your notes…" : "Generate reflection"}</Text></Pressable>
      </>}
    </View>
    {note ? <View style={styles.notice}><Text style={styles.noticeText}>{note}</Text></View> : null}
    <Text style={styles.sectionLabel}>DOMAIN BALANCE</Text>
    {workspace.domains.length === 0 ? <Text style={styles.small}>No domains yet — add some in the Domains tab.</Text> : workspace.domains.map((d: Domain) => { const n = deviationNote(d, workspace.logs); return <View key={d.id} style={styles.balance}><View style={[styles.dot, { backgroundColor: d.color }]} /><Text style={[styles.balanceText, { flex: 1 }]}>{d.name} — {n.text}</Text>{n.tone === "rest" ? <View style={styles.restTag}><Ionicons name="moon" size={10} color={colors.clay} /><Text style={styles.restTagText}>rest</Text></View> : null}</View>; })}
    {workspace.reflections?.length > 0 && <><Text style={styles.sectionLabel}>REFLECTION HISTORY</Text>{workspace.reflections.map((r: any, i: number) => <View key={i} testID={`history-${i}`} style={styles.historyCard}><Text style={styles.historyDate}>WEEK OF {formatWeek(r.weekStart).toUpperCase()}</Text><Text style={styles.historyText}>{r.generatedText}</Text></View>)}</>}
  </View>);
}
function deviationNote(domain: any, logs: any[]) {
  const touchLogs = logs.filter((l: any) => l.domainsTouched?.includes(domain.id));
  const last = touchLogs[0];
  if (last) { const dd = daysAgo(last.date); if (dd <= 3) return { text: dd === 0 ? "logged today" : dd === 1 ? "last logged yesterday" : `last logged ${dd} days ago`, tone: "active" }; }
  const dd = last ? daysAgo(last.date) : null;
  const restCount = logs.filter((l: any) => l.isRestDay && (!last || l.date > last.date)).length;
  if (dd === null) return { text: "no entries yet", tone: "quiet" };
  if (restCount > 0) return { text: `quiet for ${dd} days — you chose rest on ${restCount} of them`, tone: "rest" };
  return { text: `no entries in ${dd} days`, tone: "quiet" };
}
function Ring({ progress, color, size = 48, stroke = 5, children }: any) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, progress || 0));
  return (<View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
    <Svg width={size} height={size} style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.line} strokeWidth={stroke} fill="none" />
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeDasharray={`${c} ${c}`} strokeDashoffset={c * (1 - pct)} strokeLinecap="round" />
    </Svg>
    {children}
  </View>);
}
function formatWeek(dateStr: string) { try { return new Date(dateStr + "T00:00:00").toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" }); } catch { return dateStr; } }
function Domains({ workspace, onRefresh }: any) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [roadLoading, setRoadLoading] = useState(false);
  const roadmap = workspace.roadmap || [];
  const cutoff7 = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const weekCount = (id: string) => workspace.logs.filter((l: any) => l.date >= cutoff7 && l.domainsTouched?.includes(id)).length;
  const add = async () => { if (!name.trim()) return; await api("/domains", { method: "POST", body: JSON.stringify({ name, description: "A space you chose to pay attention to.", targetFrequency: 3 }) }); setName(""); onRefresh(); };
  const breakdown = async (goal: string, domainId: string, key: string) => { setBusy(key); try { const r = await api("/goals/breakdown", { method: "POST", body: JSON.stringify({ goal, domainId }) }); setToast(`Added ${r.tasks.length} task${r.tasks.length === 1 ? "" : "s"} to your ledger.`); onRefresh(); } catch { setToast("Couldn’t break that down right now."); } finally { setBusy(null); setTimeout(() => setToast(""), 3000); } };
  const reviewRoadmap = async () => { setRoadLoading(true); try { await api("/roadmap/generate", { method: "POST" }); onRefresh(); } catch { setToast("Couldn’t review your roadmap right now."); setTimeout(() => setToast(""), 3000); } finally { setRoadLoading(false); } };
  const applySuggestion = async (id: string) => { await api(`/roadmap/${id}/apply`, { method: "POST" }); setToast("Target updated."); setTimeout(() => setToast(""), 2200); onRefresh(); };
  const dismissSuggestion = async (id: string) => { await api(`/roadmap/${id}/dismiss`, { method: "POST" }); onRefresh(); };
  return (<View>
    <Text style={styles.eyebrow}>YOUR MODULES</Text>
    <Text style={styles.title}>Nothing is preset.</Text>
    <Text style={styles.subtitle}>Name the parts of life you want to keep in view. Rings show this week against your target.</Text>
    <View style={styles.roadmapHead}><Text style={[styles.sectionLabel, { marginTop: 0, marginBottom: 0 }]}>WEEKLY ROADMAP</Text><Pressable testID="review-roadmap" onPress={reviewRoadmap} disabled={roadLoading} style={styles.pill}>{roadLoading ? <ActivityIndicator size="small" color={colors.forest} /> : <Ionicons name="refresh" size={14} color={colors.forest} />}<Text style={styles.pillText}>Review</Text></Pressable></View>
    {roadmap.length === 0 ? <Text style={[styles.small, { marginBottom: 8 }]}>No pending suggestions. Tap Review and the companion proposes target tweaks from your recent logs — you approve or reject each.</Text> : roadmap.map((s: any) => <View key={s.id} testID={`roadmap-${s.id}`} style={styles.roadmapCard}><Text style={styles.domainName}>{s.domainName}</Text><View style={styles.roadmapDelta}><Text style={styles.deltaOld}>{s.currentTarget}×</Text><Ionicons name="arrow-forward" size={14} color={colors.forest} /><Text style={styles.deltaNew}>{s.suggestedTarget}× / wk</Text></View><Text style={[styles.small, { marginTop: 6 }]}>{s.rationale}</Text><Text style={styles.source}>A suggestion · nothing changes until you approve.</Text><View style={styles.roadmapActions}><Pressable testID={`roadmap-apply-${s.id}`} onPress={() => applySuggestion(s.id)} style={styles.roadmapBtn}><Text style={styles.roadmapBtnText}>Approve</Text></Pressable><Pressable testID={`roadmap-dismiss-${s.id}`} onPress={() => dismissSuggestion(s.id)} style={styles.roadmapBtnGhost}><Text style={styles.roadmapGhostText}>Dismiss</Text></Pressable></View></View>)}
    <Text style={styles.sectionLabel}>DOMAINS</Text>
    {workspace.domains.map((d: any) => { const count = weekCount(d.id); return (<View key={d.id} style={styles.domainCard}>
      <View style={styles.domainHead}>
        <Ring progress={count / (d.targetFrequency || 1)} color={d.color}><Text style={styles.ringText}>{count}/{d.targetFrequency}</Text></Ring>
        <View style={{ flex: 1 }}><Text style={styles.domainName}>{d.name}</Text><Text style={[styles.small, { marginTop: 3 }]}>{d.description || "No description yet"}</Text></View>
      </View>
      {d.goals?.length > 0 && <View style={styles.goalList}>{d.goals.map((g: string, i: number) => { const key = `${d.id}-${i}`; return (<View key={i} style={styles.goalRow}><Ionicons name="ellipse" size={6} color={colors.clay} /><Text style={styles.goalText}>{g}</Text><Pressable testID={`breakdown-${key}`} disabled={busy === key} onPress={() => breakdown(g, d.id, key)} style={styles.wand}>{busy === key ? <ActivityIndicator size="small" color={colors.forest} /> : <Ionicons name="git-branch-outline" size={16} color={colors.forest} />}</Pressable></View>); })}</View>}
    </View>); })}
    <View style={styles.inline}><TextInput testID="domain-input" value={name} onChangeText={setName} placeholder="Name another domain" placeholderTextColor={colors.muted} style={styles.input} /><Pressable testID="add-domain" onPress={add} style={styles.square}><Ionicons name="add" size={24} color={colors.surface} /></Pressable></View>
    {toast ? <View testID="domain-toast" style={styles.toast}><Ionicons name="checkmark-circle" size={16} color={colors.surface} /><Text style={styles.toastText}>{toast}</Text></View> : null}
  </View>);
}
function Companion({ workspace }: any) {
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<any[]>(() => (workspace.messages || []).map((m: any) => ({ role: m.role, text: m.text, safety: !!m.safety })));
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");
  const [tuning, setTuning] = useState(false);
  const [tone, setTone] = useState(workspace.profile?.companionTone || tones[1]);
  const [directiveness, setDirectiveness] = useState<number>(workspace.profile?.directiveness ?? 50);
  const [savedNote, setSavedNote] = useState("");
  const dirLabel = directiveness <= 33 ? "Gentle" : directiveness >= 67 ? "Firm" : "Balanced";
  const saveTone = async () => { await api("/profile", { method: "PUT", body: JSON.stringify({ northStar: workspace.profile?.northStar || "", companionTone: tone, directiveness }) }); setSavedNote("Companion tuned."); setTimeout(() => setSavedNote(""), 2200); };
  const feedback = async (kind: string) => { try { const r = await api("/companion/feedback", { method: "POST", body: JSON.stringify({ kind }) }); setDirectiveness(r.directiveness); setSavedNote(kind === "too_pushy" ? "Noted — I’ll ease off next time." : "Noted — I’ll be more direct next time."); setTimeout(() => setSavedNote(""), 2800); } catch { /* ignore */ } };
  const send = async () => { if (!text.trim()) return; const current = text; setText(""); setMessages(m => [...m, { role: "user", text: current }]); setSending(true); try { const result = await api("/companion", { method: "POST", body: JSON.stringify({ text: current }) }); setMessages(m => [...m, { role: "assistant", text: result.text, safety: result.isSafety }]); } catch { setErr("Couldn’t reach your companion. Your note was not sent."); setTimeout(() => setErr(""), 3000); } finally { setSending(false); } };
  return (<KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"}>
    <Text style={styles.eyebrow}>COMPANION · DRAFTS, NOT ORDERS</Text>
    <Text style={styles.title}>A place to think out loud.</Text>
    <Text style={styles.subtitle}>The companion works only from what you record and flags a suggestion as a suggestion.</Text>
    <Pressable testID="tune-toggle" onPress={() => setTuning(!tuning)} style={styles.tunePill}><Ionicons name="options-outline" size={16} color={colors.forest} /><Text style={[styles.pillText, { flex: 1 }]}>Tune companion · {tone} · {dirLabel}</Text><Ionicons name={tuning ? "chevron-up" : "chevron-down"} size={16} color={colors.muted} /></Pressable>
    {tuning && <View style={styles.card}>
      <Text style={styles.cardLabel}>TONE PRESET</Text>
      <View style={styles.toneRow}>{tones.map(t => <Pressable testID={`ctone-${t.replace(/ /g, "-")}`} key={t} onPress={() => setTone(t)} style={[styles.tone, tone === t && styles.toneActive]}><Text style={[styles.toneText, tone === t && { color: colors.surface }]}>{t}</Text></Pressable>)}</View>
      <Text style={[styles.cardLabel, { marginTop: 18 }]}>DIRECTIVENESS · {dirLabel} ({directiveness})</Text>
      <View style={styles.sliderRow}><Text style={styles.sliderEnd}>Gentle</Text><View style={{ flex: 1 }}><Slider testID="directiveness-slider" style={{ width: "100%", height: 40 }} minimumValue={0} maximumValue={100} step={5} value={directiveness} onValueChange={setDirectiveness} minimumTrackTintColor={colors.forest} maximumTrackTintColor={colors.line} thumbTintColor={colors.clay} /></View><Text style={styles.sliderEnd}>Firm</Text></View>
      <Pressable testID="save-tone" onPress={saveTone} style={styles.primary}><Text style={styles.primaryText}>Save companion settings</Text></Pressable>
    </View>}
    {savedNote ? <View testID="tune-toast" style={styles.toast}><Ionicons name="checkmark-circle" size={16} color={colors.surface} /><Text style={styles.toastText}>{savedNote}</Text></View> : null}
    <View style={styles.chat}>{messages.length === 0 && <Text style={styles.empty}>Ask about a goal, a next step, or a pattern you want to understand.</Text>}{messages.map((m, i) => <View key={i} style={[styles.bubble, m.role === "user" ? styles.userBubble : m.safety ? styles.safetyBubble : styles.aiBubble]}><Text style={styles.bubbleLabel}>{m.role === "user" ? "YOU" : m.safety ? "SAFETY SUPPORT" : "AI DRAFT"}</Text><Text style={[styles.bubbleText, m.role === "user" && { color: colors.surface }]}>{m.text}</Text>{m.role === "assistant" && !m.safety && i === messages.length - 1 ? <View style={styles.fbRow}><Text style={styles.fbHint}>Tone:</Text><Pressable testID="fb-pushy" onPress={() => feedback("too_pushy")} style={styles.fbBtn}><Text style={styles.fbText}>Too pushy</Text></Pressable><Pressable testID="fb-soft" onPress={() => feedback("too_soft")} style={styles.fbBtn}><Text style={styles.fbText}>Too soft</Text></Pressable></View> : null}</View>)}</View>
    {err ? <View style={styles.notice}><Text style={styles.noticeText}>{err}</Text></View> : null}
    <View style={styles.inline}><TextInput testID="chat-input" value={text} onChangeText={setText} placeholder="What’s on your mind?" placeholderTextColor={colors.muted} style={styles.input} /><VoiceButton field="chat" /><Pressable testID="send-chat" onPress={send} disabled={sending} style={styles.square}><Ionicons name={sending ? "hourglass" : "arrow-up"} size={20} color={colors.surface} /></Pressable></View>
  </KeyboardAvoidingView>);
}
const QUESTIONS = [
  "What does a good life look like to you, in your own words?",
  "What are the biggest things you're working toward right now?",
  "Realistically, how much time do you have most days to invest?",
  "What habits or routines already work well for you?",
  "What are your strengths, and where do you tend to get stuck?",
  "Which parts of life matter most to you right now?",
];

async function readDocument(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: ["text/plain", "text/markdown", "text/*"], copyToCacheDirectory: true });
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  try {
    if (Platform.OS === "web") { const res = await fetch(asset.uri); return await res.text(); }
    return await FileSystem.readAsStringAsync(asset.uri);
  } catch { return null; }
}

function formatDue(dateStr: string) {
  const today = new Date().toISOString().slice(0, 10);
  const tmrw = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  if (dateStr === today) return "Due today";
  if (dateStr === tmrw) return "Due tomorrow";
  if (dateStr < today) return `Overdue · ${new Date(dateStr + "T00:00:00").toLocaleDateString("en", { month: "short", day: "numeric" })}`;
  return `Due ${new Date(dateStr + "T00:00:00").toLocaleDateString("en", { month: "short", day: "numeric" })}`;
}
function webDateChoices() {
  const mk = (days: number, label: string) => ({ label, date: new Date(Date.now() + days * 86400000) });
  return [mk(0, "Today"), mk(1, "Tomorrow"), mk(3, "In 3 days"), mk(7, "Next week")];
}
function daysAgo(dateStr?: string) {
  if (!dateStr) return 0;
  return Math.floor((Date.now() - new Date(dateStr + "T00:00:00").getTime()) / 86400000);
}
async function ensureNotifPermission(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  const settings = await Notifications.getPermissionsAsync();
  if (settings.granted) return true;
  if (settings.canAskAgain) { const req = await Notifications.requestPermissionsAsync(); return req.granted; }
  return false;
}
async function scheduleTaskReminder(task: { title: string; dueDate?: string }) {
  if (!task.dueDate || Platform.OS === "web") return;
  const due = new Date(`${task.dueDate}T09:00:00`);
  if (due.getTime() <= Date.now()) return;
  try {
    if (Platform.OS === "android") await Notifications.setNotificationChannelAsync("tasks", { name: "Task reminders", importance: Notifications.AndroidImportance.DEFAULT });
    await Notifications.scheduleNotificationAsync({ content: { title: "Life OS", body: `Due today: ${task.title}` }, trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: due } });
  } catch { /* scheduling is best-effort */ }
}

function Disclaimer() {
  return (<View style={styles.disclaimerBox}><Ionicons name="information-circle-outline" size={16} color={colors.muted} /><Text style={styles.disclaimerNote}>Life OS is a tracking and reflection tool, not a medical or mental health service.</Text></View>);
}

function DomainEditor({ domain, onChange, onRemove }: any) {
  return (<View style={styles.editDomain}>
    <View style={styles.inline0}><View style={[styles.dot, { backgroundColor: domain.color }]} /><TextInput testID="edit-domain-name" value={domain.name} onChangeText={(v) => onChange({ ...domain, name: v })} placeholder="Domain name" placeholderTextColor={colors.muted} style={styles.editName} /><Pressable testID="remove-domain" onPress={onRemove}><Ionicons name="trash-outline" size={18} color={colors.clay} /></Pressable></View>
    <TextInput value={domain.description} onChangeText={(v) => onChange({ ...domain, description: v })} placeholder="What does progress here look like?" placeholderTextColor={colors.muted} style={styles.editDesc} multiline />
    <View style={styles.freqRow}><Text style={styles.small}>Target · {domain.targetFrequency}× / week</Text><View style={styles.stepper}><Pressable testID="freq-minus" onPress={() => onChange({ ...domain, targetFrequency: Math.max(1, domain.targetFrequency - 1) })} style={styles.step}><Ionicons name="remove" size={16} color={colors.forest} /></Pressable><Pressable testID="freq-plus" onPress={() => onChange({ ...domain, targetFrequency: Math.min(7, domain.targetFrequency + 1) })} style={styles.step}><Ionicons name="add" size={16} color={colors.forest} /></Pressable></View></View>
    <TextInput value={(domain.goals || []).join("\n")} onChangeText={(v) => onChange({ ...domain, goals: v.split("\n") })} placeholder="Goals (one per line)" placeholderTextColor={colors.muted} style={styles.editDesc} multiline />
  </View>);
}
function Onboarding({ close, onSaved, onDeleted }: any) {
  const [path, setPath] = useState("");
  const [qIndex, setQIndex] = useState(0);
  const [answers, setAnswers] = useState<string[]>(Array(QUESTIONS.length).fill(""));
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState("");
  const [review, setReview] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteAccount = async () => { try { await api("/account", { method: "DELETE" }); } catch { /* proceed to sign out regardless */ } onDeleted?.(); };

  const runParse = async (endpoint: string, body: any) => {
    setParsing(true); setError("");
    try { const data = await api(endpoint, { method: "POST", body: JSON.stringify(body) }); setReview({ northStar: data.northStar || "", companionTone: data.companionTone || tones[1], domains: data.domains || [] }); }
    catch { setError("Couldn’t read that into a profile — you can still build it by hand below."); setReview({ northStar: "", companionTone: tones[1], domains: [] }); }
    finally { setParsing(false); }
  };
  const startDocument = async () => { const text = await readDocument(); if (!text || !text.trim()) { setError("No readable text found in that file. Try a .txt or .md file."); return; } await runParse("/onboard/document", { text }); };
  const finishQuestionnaire = async () => { const map: Record<string, string> = {}; QUESTIONS.forEach((q, i) => { map[q] = answers[i]; }); await runParse("/onboard/conversational", { answers: map }); };
  const commit = async () => { setSaving(true); try { const domains = review.domains.filter((d: any) => d.name?.trim()).map((d: any) => ({ ...d, goals: (d.goals || []).map((g: string) => g.trim()).filter(Boolean) })); await api("/onboard/commit", { method: "POST", body: JSON.stringify({ northStar: review.northStar, companionTone: review.companionTone, domains }) }); onSaved(); } finally { setSaving(false); } };
  const setDomain = (i: number, d: any) => setReview((r: any) => ({ ...r, domains: r.domains.map((x: any, idx: number) => idx === i ? d : x) }));
  const removeDomain = (i: number) => setReview((r: any) => ({ ...r, domains: r.domains.filter((_: any, idx: number) => idx !== i) }));
  const addDomain = () => setReview((r: any) => ({ ...r, domains: [...r.domains, { name: "", description: "", color: "#6B7A8F", icon: "sparkles", targetFrequency: 3, goals: [] }] }));

  return (<View style={styles.overlay}><View style={styles.modalWide}>
    <Pressable testID="close-onboarding" onPress={close} style={styles.close}><Ionicons name="close" size={22} color={colors.ink} /></Pressable>
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }} keyboardShouldPersistTaps="handled">
      <Text style={styles.eyebrow}>BEGIN WITH CONTEXT</Text>
      <Text style={styles.modalTitle}>Build your own map.</Text>
      {parsing ? <View style={styles.parseState}><ActivityIndicator color={colors.forest} /><Text style={styles.muted}>Shaping a first draft you can edit…</Text></View> :
       review ? <>
        <Text style={styles.subtitle}>Nothing is saved yet. Edit anything — this is your draft.</Text>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <Text style={styles.cardLabel}>NORTH STAR</Text>
        <TextInput testID="north-star-input" value={review.northStar} onChangeText={(v) => setReview((r: any) => ({ ...r, northStar: v }))} placeholder="What are you building toward?" placeholderTextColor={colors.muted} multiline style={styles.textarea} />
        <Text style={[styles.cardLabel, { marginTop: 18 }]}>COMPANION TONE</Text>
        <View style={styles.toneRow}>{tones.map(t => <Pressable testID={`tone-${t.replace(/ /g, "-")}`} key={t} onPress={() => setReview((r: any) => ({ ...r, companionTone: t }))} style={[styles.tone, review.companionTone === t && styles.toneActive]}><Text style={[styles.toneText, review.companionTone === t && { color: colors.surface }]}>{t}</Text></Pressable>)}</View>
        <Text style={[styles.cardLabel, { marginTop: 18 }]}>YOUR DOMAINS</Text>
        {review.domains.map((d: any, i: number) => <DomainEditor key={i} domain={d} onChange={(nd: any) => setDomain(i, nd)} onRemove={() => removeDomain(i)} />)}
        <Pressable testID="add-review-domain" onPress={addDomain} style={styles.addGhost}><Ionicons name="add" size={18} color={colors.forest} /><Text style={styles.uploadText}>Add a domain</Text></Pressable>
        <Pressable testID="save-profile" onPress={commit} disabled={saving} style={styles.primary}><Text style={styles.primaryText}>{saving ? "Saving…" : "Save my starting point"}</Text></Pressable>
       </> :
       !path ? <>
        <Text style={styles.subtitle}>Choose how you want to start. You can edit everything before it becomes part of your record.</Text>
        <Pressable testID="path-questionnaire" onPress={() => setPath("questionnaire")} style={styles.option}><Ionicons name="chatbubble-ellipses-outline" size={24} color={colors.forest} /><View style={{ flex: 1 }}><Text style={styles.optionTitle}>Build it together</Text><Text style={styles.small}>A short set of questions about what matters.</Text></View></Pressable>
        <Pressable testID="path-document" onPress={() => setPath("document")} style={styles.option}><Ionicons name="document-text-outline" size={24} color={colors.clay} /><View style={{ flex: 1 }}><Text style={styles.optionTitle}>Upload your story</Text><Text style={styles.small}>Start from a reflection you already have.</Text></View></Pressable>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
       </> :
       path === "document" ? <>
        <Text style={styles.subtitle}>Upload a text reflection (.txt or .md). We’ll turn it into an editable draft — nothing is committed.</Text>
        <Pressable testID="upload-story" onPress={startDocument} style={styles.upload}><Ionicons name="cloud-upload-outline" size={20} color={colors.forest} /><Text style={styles.uploadText}>Choose a document</Text></Pressable>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <Pressable testID="back-path" onPress={() => { setPath(""); setError(""); }} style={styles.backLink}><Text style={styles.dismissText}>Back</Text></Pressable>
       </> : <>
        <Text style={styles.subtitle}>Question {qIndex + 1} of {QUESTIONS.length}</Text>
        <Text style={styles.qText}>{QUESTIONS[qIndex]}</Text>
        <View style={styles.inputWithVoice}><TextInput testID="q-input" value={answers[qIndex]} onChangeText={(v) => setAnswers(a => a.map((x, i) => i === qIndex ? v : x))} placeholder="Say as much or as little as you like" placeholderTextColor={colors.muted} multiline style={styles.textarea} /><VoiceButton field="question" /></View>
        <View style={styles.qNav}>
          {qIndex > 0 && <Pressable testID="q-back" onPress={() => setQIndex(qIndex - 1)} style={styles.pill}><Text style={styles.pillText}>Back</Text></Pressable>}
          {qIndex < QUESTIONS.length - 1 ? <Pressable testID="q-next" onPress={() => setQIndex(qIndex + 1)} style={[styles.primary, { flex: 1, marginTop: 0 }]}><Text style={styles.primaryText}>Next</Text></Pressable> : <Pressable testID="q-finish" onPress={finishQuestionnaire} style={[styles.primary, { flex: 1, marginTop: 0 }]}><Text style={styles.primaryText}>Build my draft</Text></Pressable>}
        </View>
        <Pressable testID="back-path" onPress={() => { setPath(""); setQIndex(0); }} style={styles.backLink}><Text style={styles.dismissText}>Start over</Text></Pressable>
       </>}
      <View style={styles.dangerZone}>{!confirmDelete ? <Pressable testID="delete-account" onPress={() => setConfirmDelete(true)}><Text style={styles.dangerLink}>Delete my account & data</Text></Pressable> : <View><Text style={styles.small}>This permanently erases your profile, logs, tasks, reflections, and chats. This cannot be undone.</Text><View style={styles.qNav}><Pressable testID="cancel-delete" onPress={() => setConfirmDelete(false)} style={[styles.pill, { flex: 1, justifyContent: "center" }]}><Text style={styles.pillText}>Cancel</Text></Pressable><Pressable testID="confirm-delete" onPress={deleteAccount} style={[styles.roadmapBtn, { flex: 1, backgroundColor: colors.clay }]}><Text style={styles.roadmapBtnText}>Delete forever</Text></Pressable></View></View>}</View>
    </ScrollView>
  </View></View>);
}
function TabBar({ tab, setTab }: any) { return <View style={styles.tabbar}>{["Today", "Tasks", "Reflect", "Domains", "Companion"].map(t => <Pressable testID={`tab-${t.toLowerCase()}`} key={t} onPress={() => setTab(t)} style={styles.tab}><Ionicons name={t === "Today" ? "sunny-outline" : t === "Tasks" ? "checkbox-outline" : t === "Reflect" ? "analytics-outline" : t === "Domains" ? "grid-outline" : "chatbubbles-outline"} size={20} color={tab === t ? colors.forest : colors.muted} /><Text style={[styles.tabText, tab === t && { color: colors.forest, fontWeight: "700" }]}>{t}</Text></Pressable>)}</View>; }

const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.canvas }, shell: { flex: 1, maxWidth: 760, width: "100%", alignSelf: "center" }, content: { padding: 24, paddingBottom: 100 }, center: { flex: 1, backgroundColor: colors.canvas, alignItems: "center", justifyContent: "center", gap: 14 }, muted: { color: colors.muted, fontSize: 15 }, login: { flex: 1, padding: 30, justifyContent: "center", maxWidth: 560, alignSelf: "center" }, mark: { width: 56, height: 56, borderRadius: 18, backgroundColor: colors.forest, alignItems: "center", justifyContent: "center", marginBottom: 32 }, eyebrow: { color: colors.clay, letterSpacing: 2, fontSize: 11, fontWeight: "700", marginBottom: 10 }, hero: { color: colors.ink, fontSize: 42, lineHeight: 45, fontWeight: "700", marginBottom: 18 }, lead: { color: colors.muted, fontSize: 17, lineHeight: 26, maxWidth: 420 }, promise: { flexDirection: "row", gap: 10, alignItems: "center", marginVertical: 28 }, promiseText: { color: colors.forest, fontSize: 14, fontWeight: "600" }, primary: { minHeight: 52, paddingHorizontal: 20, borderRadius: 12, backgroundColor: colors.forest, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 10, marginTop: 12 }, primaryText: { color: colors.surface, fontSize: 15, fontWeight: "700" }, pressed: { opacity: .8, transform: [{ scale: .98 }] }, disclaimer: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 24 }, header: { paddingHorizontal: 24, paddingTop: 18, paddingBottom: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: colors.canvas }, brand: { fontSize: 20, color: colors.ink, fontWeight: "800", letterSpacing: 2 }, date: { color: colors.muted, fontSize: 12, marginTop: 3 }, avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.sage, justifyContent: "center", alignItems: "center" }, avatarText: { color: colors.forest, fontWeight: "800" }, title: { color: colors.ink, fontSize: 32, lineHeight: 37, fontWeight: "700", marginBottom: 8 }, subtitle: { color: colors.muted, fontSize: 15, lineHeight: 23, marginBottom: 24 }, card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, padding: 20, borderRadius: 16, marginTop: 10 }, cardLabel: { color: colors.muted, fontSize: 11, letterSpacing: 1.5, fontWeight: "700" }, moodRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 15 }, mood: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" }, moodActive: { backgroundColor: colors.forest, borderColor: colors.forest }, moodText: { color: colors.ink, fontWeight: "700" }, textarea: { flex: 1, minHeight: 100, padding: 12, borderWidth: 1, borderColor: colors.line, borderRadius: 10, color: colors.ink, fontSize: 15, lineHeight: 22, marginTop: 10, textAlignVertical: "top" }, inputWithVoice: { flexDirection: "row", alignItems: "flex-end", gap: 8 }, voice: { width: 46, height: 46, borderRadius: 12, backgroundColor: colors.sage, alignItems: "center", justifyContent: "center", marginBottom: 10 }, upload: { flexDirection: "row", gap: 10, alignItems: "center", padding: 13, borderWidth: 1, borderColor: colors.line, borderRadius: 10, marginTop: 10 }, uploadText: { color: colors.forest, fontWeight: "700" }, draftInput: { color: colors.ink, fontSize: 16, lineHeight: 25, marginTop: 14, minHeight: 100 }, draftActions: { flexDirection: "row", gap: 18, marginTop: 10 }, actionText: { color: colors.forest, fontWeight: "700" }, dismissText: { color: colors.clay, fontWeight: "700" }, safetyBubble: { backgroundColor: "#F2DDD5", borderWidth: 1, borderColor: colors.clay, alignSelf: "flex-start" }, rest: { flexDirection: "row", gap: 12, alignItems: "center", borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 13, marginTop: 16 }, restTitle: { color: colors.ink, fontWeight: "700", fontSize: 14 }, small: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 3 }, observation: { borderLeftWidth: 3, borderLeftColor: colors.ochre, paddingLeft: 16, marginTop: 34 }, observationText: { fontSize: 17, color: colors.ink, lineHeight: 25 }, source: { fontSize: 11, color: colors.muted, marginTop: 12 }, sectionLabel: { color: colors.muted, letterSpacing: 1.5, fontSize: 11, fontWeight: "700", marginTop: 28, marginBottom: 10 }, inline: { flexDirection: "row", gap: 8, marginTop: 14 }, input: { flex: 1, minHeight: 50, borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: 14, color: colors.ink, backgroundColor: colors.surface, fontSize: 15 }, square: { width: 50, minHeight: 50, borderRadius: 10, backgroundColor: colors.forest, alignItems: "center", justifyContent: "center" }, task: { minHeight: 58, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.line, paddingHorizontal: 6, flexDirection: "row", gap: 14, alignItems: "center" }, taskText: { color: colors.ink, fontSize: 15 }, statGrid: { flexDirection: "row", gap: 12, marginBottom: 18 }, stat: { flex: 1, backgroundColor: colors.surface, padding: 18, borderWidth: 1, borderColor: colors.line, borderRadius: 14 }, statValue: { fontSize: 30, fontWeight: "700", color: colors.forest }, statLabel: { fontSize: 10, letterSpacing: 1, color: colors.muted, marginTop: 5 }, draft: { color: colors.ink, fontSize: 16, lineHeight: 25, marginTop: 14 }, balance: { flexDirection: "row", gap: 10, alignItems: "center", paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.line }, dot: { width: 10, height: 10, borderRadius: 5 }, balanceText: { color: colors.ink, fontSize: 14 }, domain: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 14, marginBottom: 10 }, domainName: { color: colors.ink, fontSize: 17, fontWeight: "700" }, frequency: { color: colors.forest, fontSize: 12, fontWeight: "700" }, chat: { minHeight: 300, marginTop: 6, gap: 12 }, empty: { color: colors.muted, paddingVertical: 50, textAlign: "center", lineHeight: 22 }, bubble: { padding: 15, borderRadius: 14, maxWidth: "90%" }, userBubble: { backgroundColor: colors.forest, alignSelf: "flex-end" }, aiBubble: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignSelf: "flex-start" }, bubbleLabel: { color: colors.muted, fontSize: 10, letterSpacing: 1, marginBottom: 6 }, bubbleText: { color: colors.ink, fontSize: 15, lineHeight: 22 }, modal: { backgroundColor: colors.surface, borderRadius: 20, padding: 24, maxWidth: 600, width: "92%" }, overlay: { position: "absolute", inset: 0, backgroundColor: "rgba(36,39,40,.45)", justifyContent: "center", alignItems: "center", padding: 20 }, close: { position: "absolute", right: 16, top: 16, padding: 8 }, modalTitle: { fontSize: 28, color: colors.ink, fontWeight: "700", marginBottom: 10 }, option: { flexDirection: "row", gap: 14, padding: 16, borderWidth: 1, borderColor: colors.line, borderRadius: 14, marginTop: 12, alignItems: "center" }, optionTitle: { color: colors.ink, fontWeight: "700", fontSize: 16 }, toneRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 }, tone: { borderWidth: 1, borderColor: colors.line, padding: 11, borderRadius: 20 }, toneActive: { backgroundColor: colors.forest, borderColor: colors.forest }, toneText: { color: colors.ink, fontSize: 12 }, tabbar: { position: "absolute", bottom: 0, left: 0, right: 0, height: 76, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line, flexDirection: "row", justifyContent: "space-around", paddingTop: 10 }, tab: { alignItems: "center", minWidth: 55, gap: 3 }, tabText: { color: colors.muted, fontSize: 10 }, hoursInput: { minHeight: 46, borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: 14, color: colors.ink, fontSize: 15, marginTop: 10, width: 120 }, chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 }, chip: { flexShrink: 0, paddingHorizontal: 14, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }, chipText: { color: colors.ink, fontSize: 13, fontWeight: "600" }, toast: { flexDirection: "row", gap: 8, alignItems: "center", backgroundColor: colors.forest, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, marginTop: 14 }, toastText: { color: colors.surface, fontSize: 13, fontWeight: "600", flex: 1 }, voiceHint: { position: "absolute", bottom: 54, right: 0, width: 200, backgroundColor: colors.ink, padding: 10, borderRadius: 10 }, voiceHintText: { color: colors.surface, fontSize: 11, lineHeight: 16 }, taskOptions: { flexDirection: "row", gap: 8, marginTop: 12, alignItems: "center" }, pill: { flexDirection: "row", gap: 6, alignItems: "center", paddingHorizontal: 12, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface }, pillText: { color: colors.forest, fontSize: 13, fontWeight: "600" }, taskMeta: { color: colors.muted, fontSize: 12, marginTop: 2 }, notice: { backgroundColor: "#F2DDD5", borderWidth: 1, borderColor: colors.clay, borderRadius: 10, padding: 12, marginTop: 14 }, noticeText: { color: colors.ink, fontSize: 13, lineHeight: 19 }, segment: { flexDirection: "row", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 4, marginBottom: 16 }, segmentBtn: { flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: "center" }, segmentActive: { backgroundColor: colors.forest }, segmentText: { color: colors.muted, fontSize: 13, fontWeight: "700" }, domainCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 16, marginBottom: 12 }, domainHead: { flexDirection: "row", alignItems: "center", gap: 10 }, goalList: { marginTop: 12, gap: 8 }, goalRow: { flexDirection: "row", gap: 8, alignItems: "center" }, goalText: { color: colors.ink, fontSize: 14, flex: 1 }, modalWide: { backgroundColor: colors.surface, borderRadius: 20, padding: 24, maxWidth: 600, width: "94%", maxHeight: "88%" }, parseState: { alignItems: "center", gap: 12, paddingVertical: 40 }, errorText: { color: colors.clay, fontSize: 13, marginTop: 10, marginBottom: 4, lineHeight: 19 }, editDomain: { borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 12, marginTop: 10, gap: 8 }, inline0: { flexDirection: "row", alignItems: "center", gap: 8 }, editName: { flex: 1, fontSize: 16, fontWeight: "700", color: colors.ink, paddingVertical: 4 }, editDesc: { borderWidth: 1, borderColor: colors.line, borderRadius: 8, padding: 10, color: colors.ink, fontSize: 14, minHeight: 42, textAlignVertical: "top" }, freqRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, stepper: { flexDirection: "row", gap: 8 }, step: { width: 32, height: 32, borderRadius: 8, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" }, addGhost: { flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", padding: 12, borderWidth: 1, borderStyle: "dashed", borderColor: colors.forest, borderRadius: 10, marginTop: 12 }, backLink: { alignItems: "center", paddingVertical: 14 }, qText: { color: colors.ink, fontSize: 22, lineHeight: 30, fontWeight: "700", marginBottom: 8 }, qNav: { flexDirection: "row", gap: 10, marginTop: 14, alignItems: "center" }, disclaimerBox: { flexDirection: "row", gap: 8, alignItems: "flex-start", marginTop: 30, paddingTop: 18, borderTopWidth: 1, borderTopColor: colors.line }, disclaimerNote: { color: colors.muted, fontSize: 12, lineHeight: 18, flex: 1 }, ringText: { position: "absolute", fontSize: 11, fontWeight: "800", color: colors.ink }, wand: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: colors.canvas }, historyCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 14, marginBottom: 10 }, historyDate: { color: colors.clay, fontSize: 11, fontWeight: "700", letterSpacing: 1, marginBottom: 6 }, historyText: { color: colors.ink, fontSize: 14, lineHeight: 21 }, restTag: { flexDirection: "row", gap: 4, alignItems: "center", backgroundColor: "#F2DDD5", paddingHorizontal: 8, height: 22, borderRadius: 11 }, restTagText: { color: colors.clay, fontSize: 10, fontWeight: "700" }, tunePill: { flexDirection: "row", gap: 8, alignItems: "center", paddingHorizontal: 14, height: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, marginBottom: 6 }, sliderRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 }, sliderEnd: { color: colors.muted, fontSize: 11, fontWeight: "700", width: 44, textAlign: "center" }, fbRow: { flexDirection: "row", gap: 8, alignItems: "center", marginTop: 10 }, fbHint: { color: colors.muted, fontSize: 11 }, fbBtn: { borderWidth: 1, borderColor: colors.line, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 }, fbText: { color: colors.muted, fontSize: 11, fontWeight: "600" }, roadmapHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 6, marginBottom: 12 }, roadmapCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.ochre, borderRadius: 14, padding: 16, marginBottom: 10 }, roadmapDelta: { flexDirection: "row", gap: 8, alignItems: "center", marginTop: 6 }, deltaOld: { color: colors.muted, fontSize: 16, fontWeight: "700", textDecorationLine: "line-through" }, deltaNew: { color: colors.forest, fontSize: 16, fontWeight: "800" }, roadmapActions: { flexDirection: "row", gap: 10, marginTop: 14 }, roadmapBtn: { flex: 1, backgroundColor: colors.forest, paddingVertical: 11, borderRadius: 10, alignItems: "center" }, roadmapBtnText: { color: colors.surface, fontWeight: "700", fontSize: 13 }, roadmapBtnGhost: { flex: 1, borderWidth: 1, borderColor: colors.line, paddingVertical: 11, borderRadius: 10, alignItems: "center" }, roadmapGhostText: { color: colors.muted, fontWeight: "700", fontSize: 13 }, dangerZone: { marginTop: 24, paddingTop: 18, borderTopWidth: 1, borderTopColor: colors.line }, dangerLink: { color: colors.clay, fontWeight: "700", fontSize: 14 }, });