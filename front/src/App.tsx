import { useEffect, useMemo, useState } from "react";
import Editor from "@monaco-editor/react";
import {
  Activity,
  BookOpenText,
  Bot,
  Cable,
  Check,
  Copy,
  FlaskConical,
  KeyRound,
  LoaderCircle,
  Logs,
  Play,
  RefreshCw,
  Rocket,
  Save,
  ShieldCheck,
  Trash2
} from "lucide-react";
import { ApiClient } from "./lib/api";
import { cn, copyText } from "./lib/utils";
import type { AdapterRecord, ExecutionRecord, ModelProfile, SecretRecord, ViewKey } from "./lib/types";

const API_BASE = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:3000";
const TOKEN_KEY = "oneapi.platform_token";
const FIXED_WORKSPACE = import.meta.env.VITE_WORKSPACE_ID ?? "default";

const DEFAULT_CURL = `curl https://jsonplaceholder.typicode.com/posts -d '{"title":"foo","body":"bar","userId":1}' -H "Content-type: application/json"`;

function pretty(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function adapterStatusClass(status: AdapterRecord["status"]) {
  if (status === "active") {
    return "bg-emerald-100 text-emerald-700 border border-emerald-200";
  }
  if (status === "archived") {
    return "bg-slate-200 text-slate-600 border border-slate-300";
  }
  return "bg-amber-100 text-amber-700 border border-amber-200";
}

function parsePayloadKeys(adapter: AdapterRecord | null) {
  if (!adapter?.spec) {
    return [];
  }
  const text = pretty(adapter.spec);
  const matches = [...text.matchAll(/\{\{payload\.([a-zA-Z0-9_]+)\}\}/g)];
  return [...new Set(matches.map((m) => m[1]))];
}

function detectAuthMode(adapter: AdapterRecord | null): "none" | "secret" {
  if (!adapter?.spec || typeof adapter.spec !== "object") {
    return "none";
  }
  const explicit = (adapter.spec as Record<string, unknown>).auth_mode;
  if (explicit === "secret") {
    return "secret";
  }
  if (explicit === "none") {
    return "none";
  }
  const text = pretty(adapter.spec);
  if (text.includes("{{secrets.") || text.includes('"auth_ref"')) {
    return "secret";
  }
  return "none";
}

function authValidationHint(adapter: AdapterRecord | null): string | null {
  if (!adapter?.spec || typeof adapter.spec !== "object") {
    return null;
  }
  const mode = detectAuthMode(adapter);
  const spec = adapter.spec as Record<string, unknown>;
  const hasAuthRef =
    Boolean(spec.auth_ref) &&
    typeof spec.auth_ref === "object" &&
    Boolean((spec.auth_ref as Record<string, unknown>).secret_name);
  const hasSecretPlaceholder = pretty(spec).includes("{{secrets.");

  if (mode === "none" && (hasAuthRef || hasSecretPlaceholder)) {
    return "当前标记为无鉴权，但检测到 auth_ref 或 secrets 占位符，请修正。";
  }
  if (mode === "secret" && !hasAuthRef) {
    return "当前标记为需鉴权，但缺少 auth_ref.secret_name。";
  }
  return null;
}

function buildExecuteRequestExport(adapter: AdapterRecord, token: string, workspace: string) {
  const payloadKeys = parsePayloadKeys(adapter);
  const payload: Record<string, string> = {};
  if (payloadKeys.length === 0) {
    payload.example_field = "<value>";
  } else {
    payloadKeys.forEach((key) => {
      payload[key] = `<${key}>`;
    });
  }
  const body = {
    api_slug: adapter.api_slug,
    action: adapter.action,
    payload
  };
  const bodyJson = JSON.stringify(body);
  const bodyForCmd = bodyJson.replace(/"/g, '\\"');
  const bodyForPowerShell = bodyJson.replace(/'/g, "''");
  const bodyForBash = bodyJson.replace(/'/g, "'\\''");
  const url = `${API_BASE}/v1/execute`;

  const curlCmd = `curl.exe -X POST "${url}" -H "Authorization: Bearer ${token}" -H "Content-Type: application/json" -H "x-workspace-id: ${workspace}" -d "${bodyForCmd}"`;
  const curlPowerShell = `curl -X POST "${url}" -H "Authorization: Bearer ${token}" -H "Content-Type: application/json" -H "x-workspace-id: ${workspace}" -d '${bodyForPowerShell}'`;
  const curlBash = `curl -X POST '${url}' -H 'Authorization: Bearer ${token}' -H 'Content-Type: application/json' -H 'x-workspace-id: ${workspace}' -d '${bodyForBash}'`;

  return `# Windows CMD\n${curlCmd}\n\n# PowerShell\n${curlPowerShell}\n\n# Bash/Zsh\n${curlBash}\n\n# JSON Body\n${pretty(body)}`;
}

function App() {
  const isAdminRoute = typeof window !== "undefined" && window.location.pathname.startsWith("/admin");
  const [view, setView] = useState<ViewKey>("adapters");
  const [token, setToken] = useState(localStorage.getItem(TOKEN_KEY) ?? "dev-token");
  const [workspace, setWorkspace] = useState(FIXED_WORKSPACE);
  const [authChecked, setAuthChecked] = useState(false);
  const [me, setMe] = useState<{
    id: string;
    provider: string;
    provider_user_id: string;
    username: string | null;
    email: string | null;
    workspace_id: string;
  } | null>(null);
  const [adminMe, setAdminMe] = useState<{
    username: string;
    created_at: string;
    expires_at: string;
  } | null>(null);
  const [adminUsers, setAdminUsers] = useState<
    Array<{
      id: string;
      provider: string;
      provider_user_id: string;
      username: string | null;
      email: string | null;
      workspace_id: string;
      created_at: string;
      updated_at: string;
      last_login_at: string | null;
    }>
  >([]);
  const [adminLoginForm, setAdminLoginForm] = useState({ username: "admin", password: "" });
  const [adminLoggingIn, setAdminLoggingIn] = useState(false);
  const [adminLoadingUsers, setAdminLoadingUsers] = useState(false);
  const [adminDeletingUser, setAdminDeletingUser] = useState("");
  const [adminSearch, setAdminSearch] = useState("");
  const [passwordLoginForm, setPasswordLoginForm] = useState({ username: "", password: "" });
  const [passwordLoggingIn, setPasswordLoggingIn] = useState(false);

  const api = useMemo(() => new ApiClient(API_BASE, token, workspace), [token, workspace]);

  const [sourceType, setSourceType] = useState<"curl" | "openapi" | "raw">("curl");
  const [source, setSource] = useState(DEFAULT_CURL);
  const [sourceUrl, setSourceUrl] = useState("");
  const [apiSlug, setApiSlug] = useState("demo_api");
  const [action, setAction] = useState("execute_demo");
  const [targetFormat, setTargetFormat] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [generated, setGenerated] = useState<AdapterRecord | null>(null);

  const [adapters, setAdapters] = useState<AdapterRecord[]>([]);
  const [secrets, setSecrets] = useState<SecretRecord[]>([]);
  const [executions, setExecutions] = useState<ExecutionRecord[]>([]);
  const [selectedExecution, setSelectedExecution] = useState<ExecutionRecord | null>(null);
  const [activeModel, setActiveModel] = useState<{ provider: string; model: string } | null>(null);
  const [modelProfiles, setModelProfiles] = useState<ModelProfile[]>([]);
  const [modelPromptDrafts, setModelPromptDrafts] = useState<Record<string, string>>({});
  const [savingModelId, setSavingModelId] = useState("");
  const [savingPromptModelId, setSavingPromptModelId] = useState("");
  const [llmKeyInputs, setLlmKeyInputs] = useState<Record<"openai" | "gemini" | "deepseek", string>>({
    openai: "",
    gemini: "",
    deepseek: ""
  });
  const [savingLlmKey, setSavingLlmKey] = useState("");
  const [logQuery, setLogQuery] = useState("");
  const [logStatusFilter, setLogStatusFilter] = useState("all");
  const [logPageSize, setLogPageSize] = useState(20);
  const [logPage, setLogPage] = useState(1);
  const [tokenMasked, setTokenMasked] = useState("");
  const [tokenCopied, setTokenCopied] = useState(false);
  const [showTokenPlain, setShowTokenPlain] = useState(false);

  const [secretName, setSecretName] = useState("api_key");
  const [secretValue, setSecretValue] = useState("");
  const [deletingSecret, setDeletingSecret] = useState("");

  const [playAdapter, setPlayAdapter] = useState<AdapterRecord | null>(null);
  const [playPayload, setPlayPayload] = useState<Record<string, string>>({});
  const [playTempSecret, setPlayTempSecret] = useState("");
  const [playResult, setPlayResult] = useState<unknown>(null);
  const [playRunning, setPlayRunning] = useState(false);

  useEffect(() => {
    localStorage.setItem(TOKEN_KEY, token);
  }, [token]);

  useEffect(() => {
    let mounted = true;
    if (isAdminRoute) {
      api
        .getAdminMe()
        .then((admin) => {
          if (!mounted) {
            return;
          }
          setAdminMe(admin);
        })
        .catch(() => {
          if (!mounted) {
            return;
          }
          setAdminMe(null);
        })
        .finally(() => {
          if (mounted) {
            setAuthChecked(true);
          }
        });
    } else {
      api
        .getMe()
        .then((user) => {
          if (!mounted) {
            return;
          }
          setMe(user);
          setWorkspace(user.workspace_id || FIXED_WORKSPACE);
        })
        .catch(() => {
          if (!mounted) {
            return;
          }
          setMe(null);
        })
        .finally(() => {
          if (mounted) {
            setAuthChecked(true);
          }
        });
    }
    return () => {
      mounted = false;
    };
  }, [api, isAdminRoute]);

  useEffect(() => {
    if (!error) {
      return;
    }
    const timer = setTimeout(() => setError(""), 4000);
    return () => clearTimeout(timer);
  }, [error]);

  useEffect(() => {
    if (!notice) {
      return;
    }
    const timer = setTimeout(() => setNotice(""), 3000);
    return () => clearTimeout(timer);
  }, [notice]);

  async function refreshAdapters() {
    try {
      setAdapters(await api.listAdapters());
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function refreshSecrets() {
    try {
      setSecrets(await api.listSecrets());
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function refreshLogs() {
    try {
      setExecutions(await api.listExecutions(200));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function refreshActiveModel() {
    try {
      const model = await api.getActiveModel();
      if (!model) {
        setActiveModel(null);
        return;
      }
      setActiveModel({ provider: model.provider, model: model.model });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function refreshModels() {
    try {
      const [models, active] = await Promise.all([api.listModels(), api.getActiveModel()]);
      setModelProfiles(models);
      const drafts: Record<string, string> = {};
      for (const item of models) {
        drafts[item.id] = item.system_prompt ?? "";
      }
      setModelPromptDrafts(drafts);
      if (!active) {
        setActiveModel(null);
        return;
      }
      setActiveModel({ provider: active.provider, model: active.model });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function refreshTokenInfo() {
    try {
      const info = await api.getPlatformTokenInfo();
      setTokenMasked(info.masked);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    if (isAdminRoute || !me) {
      return;
    }
    refreshAdapters();
    refreshSecrets();
    refreshLogs();
    refreshModels();
    refreshTokenInfo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, workspace, me?.id, isAdminRoute]);

  useEffect(() => {
    setLogPage(1);
  }, [logQuery, logStatusFilter, logPageSize]);

  const filteredExecutions = useMemo(() => {
    return executions.filter((item) => {
      const statusOk =
        logStatusFilter === "all" ||
        (logStatusFilter === "success" && item.upstream_status >= 200 && item.upstream_status < 300) ||
        (logStatusFilter === "error" && (item.upstream_status < 200 || item.upstream_status >= 300));
      if (!statusOk) {
        return false;
      }
      const q = logQuery.trim().toLowerCase();
      if (!q) {
        return true;
      }
      const haystack = `${item.id} ${item.api_slug} ${item.action} ${item.upstream_status}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [executions, logQuery, logStatusFilter]);

  const totalLogPages = Math.max(1, Math.ceil(filteredExecutions.length / logPageSize));
  const currentLogPage = Math.min(logPage, totalLogPages);
  const pagedExecutions = filteredExecutions.slice(
    (currentLogPage - 1) * logPageSize,
    currentLogPage * logPageSize
  );

  async function refreshAdminUsers(search = adminSearch) {
    try {
      setAdminLoadingUsers(true);
      setAdminUsers(await api.listAdminUsers(200, 0, search));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAdminLoadingUsers(false);
    }
  }

  useEffect(() => {
    if (!isAdminRoute || !adminMe) {
      return;
    }
    refreshAdminUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminMe?.username, isAdminRoute]);

  async function onAdminLogin() {
    setError("");
    setNotice("");
    setAdminLoggingIn(true);
    try {
      await api.adminLogin(adminLoginForm.username, adminLoginForm.password);
      const admin = await api.getAdminMe();
      setAdminMe(admin);
      setNotice("管理员登录成功");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAdminLoggingIn(false);
    }
  }

  async function onAdminLogout() {
    setError("");
    setNotice("");
    try {
      await api.adminLogout();
      setAdminMe(null);
      setAdminUsers([]);
      setNotice("管理员已退出");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function onDeleteAdminUser(userId: string, label: string) {
    if (!window.confirm(`确认删除用户 ${label} ? 这会清理其 workspace 数据。`)) {
      return;
    }
    setError("");
    setNotice("");
    setAdminDeletingUser(userId);
    try {
      const result = await api.deleteAdminUser(userId);
      setNotice(
        `用户已删除，清理 adapters=${result.purged.adapters_deleted}, executions=${result.purged.executions_deleted}, secrets=${result.purged.secrets_deleted}`
      );
      await refreshAdminUsers();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAdminDeletingUser("");
    }
  }

  async function onGenerate() {
    setError("");
    setNotice("");
    setGenerating(true);
    setGenerated(null);
    try {
      const data = await api.generateAdapter({
        api_slug: apiSlug,
        action,
        source_type: sourceType,
        source_content: source.trim() || undefined,
        source_url: sourceUrl.trim() || undefined,
        target_format: targetFormat || undefined
      });
      setGenerated(data);
      setNotice("Adapter 生成成功。");
      await refreshAdapters();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  async function onPasswordLogin() {
    setError("");
    setNotice("");
    if (passwordLoginForm.username.trim().toLowerCase() === "admin") {
      setError("管理员账号请使用 /admin 入口登录。");
      return;
    }
    setPasswordLoggingIn(true);
    try {
      await api.passwordLogin(passwordLoginForm.username, passwordLoginForm.password);
      const user = await api.getMe();
      setMe(user);
      setWorkspace(user.workspace_id || FIXED_WORKSPACE);
      setNotice("账号登录成功");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPasswordLoggingIn(false);
    }
  }

  async function onPublish(adapterId: string) {
    setError("");
    setNotice("");
    try {
      const published = await api.publishAdapter(adapterId);
      setGenerated(published);
      setNotice(`已发布到 V1：${published.api_slug}/${published.action} (v${published.logic_version})`);
      await refreshAdapters();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function keyInputByProvider(provider: string) {
    if (provider === "openai") {
      return llmKeyInputs.openai;
    }
    if (provider === "google") {
      return llmKeyInputs.gemini;
    }
    if (provider === "deepseek") {
      return llmKeyInputs.deepseek;
    }
    return "";
  }

  function secretNameByProvider(provider: string) {
    if (provider === "openai") {
      return "openai_api_key";
    }
    if (provider === "google") {
      return "gemini_api_key";
    }
    if (provider === "deepseek") {
      return "deepseek_api_key";
    }
    return "";
  }

  function llmKeyStateKey(provider: string): "openai" | "gemini" | "deepseek" | "" {
    if (provider === "openai") {
      return "openai";
    }
    if (provider === "google") {
      return "gemini";
    }
    if (provider === "deepseek") {
      return "deepseek";
    }
    return "";
  }

  async function onActivateModel(modelProfileId: string) {
    setError("");
    setNotice("");
    setSavingModelId(modelProfileId);
    try {
      await api.activateModel(modelProfileId);
      setNotice("已切换激活模型");
      await refreshModels();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingModelId("");
    }
  }

  async function onSaveModelPrompt(modelProfileId: string) {
    setError("");
    setNotice("");
    setSavingPromptModelId(modelProfileId);
    try {
      await api.updateModelPrompt(modelProfileId, modelPromptDrafts[modelProfileId] ?? "");
      setNotice("System Prompt 已保存");
      await refreshModels();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingPromptModelId("");
    }
  }

  async function onSaveProviderKey(provider: string) {
    const secretName = secretNameByProvider(provider);
    const keySlot = llmKeyStateKey(provider);
    if (!secretName || !keySlot) {
      setError(`Unsupported provider: ${provider}`);
      return;
    }
    const value = keyInputByProvider(provider).trim();
    if (!value) {
      setError("API Key 不能为空");
      return;
    }
    setError("");
    setNotice("");
    setSavingLlmKey(provider);
    try {
      await api.saveSecret(secretName, value);
      setLlmKeyInputs((prev) => ({ ...prev, [keySlot]: "" }));
      setNotice(`${provider} API Key 已保存`);
      await Promise.all([refreshSecrets(), refreshModels()]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingLlmKey("");
    }
  }

  async function onSaveSecret() {
    setError("");
    setNotice("");
    try {
      await api.saveSecret(secretName, secretValue);
      setSecretValue("");
      setNotice(`Secret ${secretName} 已保存`);
      await refreshSecrets();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function onDeleteSecret(name: string) {
    if (!window.confirm(`确认删除 Secret: ${name} ?`)) {
      return;
    }
    setError("");
    setNotice("");
    setDeletingSecret(name);
    try {
      await api.deleteSecret(name);
      setNotice(`Secret ${name} 已删除`);
      await refreshSecrets();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDeletingSecret("");
    }
  }

  async function openExecution(executionId: string) {
    setError("");
    setNotice("");
    try {
      setSelectedExecution(await api.getExecution(executionId));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function openPlay(adapter: AdapterRecord) {
    const keys = parsePayloadKeys(adapter);
    const initial: Record<string, string> = {};
    keys.forEach((k) => {
      initial[k] = "";
    });
    setPlayPayload(initial);
    setPlayTempSecret("");
    setPlayResult(null);
    setPlayAdapter(adapter);
  }

  async function runPlay() {
    if (!playAdapter) {
      return;
    }
    setPlayRunning(true);
    setError("");
    setNotice("");
    try {
      const result = await api.dryRun(
        playAdapter.spec,
        playPayload,
        playTempSecret ? { api_key: playTempSecret } : {}
      );
      setPlayResult(result);
      setNotice("Sandbox Test 执行完成，日志已记录。");
      await refreshLogs();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPlayRunning(false);
    }
  }

  async function onExportExecuteRequest(adapter: AdapterRecord) {
    setError("");
    setNotice("");
    try {
      const text = buildExecuteRequestExport(adapter, token, workspace);
      await copyText(text);
      setNotice("可调用 API 请求格式已复制。");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    !authChecked ? (
      <div className="grid min-h-screen place-items-center bg-slate-50">
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-5 text-sm text-slate-600 shadow-sm">
          正在检查{isAdminRoute ? "管理员" : "登录"}状态...
        </div>
      </div>
    ) : isAdminRoute ? (
      !adminMe ? (
        <div className="grid min-h-screen place-items-center bg-slate-50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4">
              <h1 className="text-xl font-semibold text-slate-900">管理员登录</h1>
              <p className="mt-2 text-sm text-slate-600">仅允许本机访问，登录后可查看并删除用户</p>
            </div>
            <div className="space-y-3">
              <input
                value={adminLoginForm.username}
                onChange={(e) => setAdminLoginForm((prev) => ({ ...prev, username: e.target.value }))}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder="管理员账号"
              />
              <input
                type="password"
                value={adminLoginForm.password}
                onChange={(e) => setAdminLoginForm((prev) => ({ ...prev, password: e.target.value }))}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder="管理员密码"
              />
              <button
                onClick={onAdminLogin}
                disabled={adminLoggingIn}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {adminLoggingIn ? <LoaderCircle size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                登录管理后台
              </button>
            </div>
            <div className="mt-4 text-xs text-slate-500">地址需从本机访问，否则后端会拒绝登录</div>
          </div>
        </div>
      ) : (
        <div className="min-h-screen bg-slate-50">
          <div className="pointer-events-none fixed right-5 top-5 z-50 flex w-[420px] flex-col gap-2">
            {notice && (
              <div className="pointer-events-auto rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 shadow-sm">
                {notice}
              </div>
            )}
            {error && (
              <div className="pointer-events-auto rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 shadow-sm">
                {error}
              </div>
            )}
          </div>

          <div className="mx-auto max-w-7xl px-6 py-8">
            <div className="mb-6 flex items-end justify-between">
              <div>
                <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Admin Console</div>
                <h1 className="mt-2 text-3xl font-semibold text-slate-900">用户管理</h1>
                <p className="mt-2 text-sm text-slate-600">
                  当前管理员: {adminMe.username}，会话到期时间 {formatUpdatedAt(adminMe.expires_at)}
                </p>
              </div>
              <button
                onClick={onAdminLogout}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
              >
                退出管理后台
              </button>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-end justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">用户列表</h2>
                  <p className="mt-1 text-xs text-slate-500">支持按用户名、邮箱、provider user id 搜索</p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    value={adminSearch}
                    onChange={(e) => setAdminSearch(e.target.value)}
                    className="w-72 rounded-md border border-slate-300 px-3 py-2 text-sm"
                    placeholder="搜索用户"
                  />
                  <button
                    onClick={() => refreshAdminUsers(adminSearch)}
                    disabled={adminLoadingUsers}
                    className="rounded-md bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-60"
                  >
                    {adminLoadingUsers ? "加载中..." : "查询"}
                  </button>
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-200">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                      <th className="py-3 pl-3">用户</th>
                      <th>Provider</th>
                      <th>Workspace</th>
                      <th>最近登录</th>
                      <th>创建时间</th>
                      <th className="pr-3 text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminUsers.length === 0 && !adminLoadingUsers && (
                      <tr>
                        <td colSpan={6} className="px-3 py-10 text-center text-sm text-slate-500">
                          暂无用户数据
                        </td>
                      </tr>
                    )}
                    {adminUsers.map((user) => {
                      const label = user.username || user.email || user.provider_user_id;
                      return (
                        <tr key={user.id} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/70">
                          <td className="py-3 pl-3">
                            <div className="font-medium text-slate-900">{label}</div>
                            <div className="text-xs text-slate-500">{user.email || user.provider_user_id}</div>
                          </td>
                          <td>{user.provider}</td>
                          <td className="text-xs text-slate-600">{user.workspace_id}</td>
                          <td className="text-xs text-slate-600">
                            {user.last_login_at ? formatUpdatedAt(user.last_login_at) : "从未"}
                          </td>
                          <td className="text-xs text-slate-600">{formatUpdatedAt(user.created_at)}</td>
                          <td className="pr-3 text-right">
                            <button
                              onClick={() => onDeleteAdminUser(user.id, label)}
                              disabled={adminDeletingUser === user.id}
                              className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs text-red-700 disabled:opacity-60"
                            >
                              {adminDeletingUser === user.id ? <LoaderCircle size={12} className="animate-spin" /> : <Trash2 size={12} />}
                              删除用户
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )
    ) : !me ? (
      <div className="grid min-h-screen place-items-center bg-slate-50 p-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-semibold text-slate-900">one-api 登录</h1>
          <p className="mt-2 text-sm text-slate-600">支持 Linux.do OAuth 登录，也支持账号密码登录。</p>
          <a
            href={api.getLoginUrl()}
            className="mt-5 inline-flex w-full items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white"
          >
            使用 Linux.do 登录
          </a>
          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-3 text-sm font-medium text-slate-900">账号密码登录</div>
            <div className="mb-2 text-xs text-slate-500">管理员账号请访问 /admin 登录。</div>
            <div className="space-y-2">
              <input
                value={passwordLoginForm.username}
                onChange={(e) => setPasswordLoginForm((prev) => ({ ...prev, username: e.target.value }))}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder="用户名"
              />
              <input
                type="password"
                value={passwordLoginForm.password}
                onChange={(e) => setPasswordLoginForm((prev) => ({ ...prev, password: e.target.value }))}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder="密码"
              />
              <button
                onClick={onPasswordLogin}
                disabled={passwordLoggingIn}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 disabled:opacity-60"
              >
                {passwordLoggingIn ? <LoaderCircle size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                使用账号密码登录
              </button>
            </div>
          </div>
        </div>
      </div>
    ) : (
    <div className="flex min-h-screen text-foreground">
      <aside className="w-20 border-r border-slate-200 bg-white/80 backdrop-blur">
        <div className="flex h-full flex-col items-center py-4">
          <div className="mb-4 rounded-xl bg-accent p-2 text-white">
            <Cable size={18} />
          </div>
          {[
            { key: "adapters", icon: Rocket, label: "Adapters" },
            { key: "secrets", icon: KeyRound, label: "Secrets" },
            { key: "llm", icon: Bot, label: "LLM" },
            { key: "logs", icon: Logs, label: "Logs" },
            { key: "playground", icon: FlaskConical, label: "Play" }
            ,
            { key: "guide", icon: BookOpenText, label: "说明" }
          ].map((item) => (
            <button
              key={item.key}
              onClick={() => setView(item.key as ViewKey)}
              className={cn(
                "mb-3 flex h-14 w-14 flex-col items-center justify-center rounded-xl text-[11px]",
                view === item.key ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"
              )}
            >
              <item.icon size={16} />
              <span className="mt-1">{item.label}</span>
            </button>
          ))}
        </div>
      </aside>

      <main className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white/80 px-6 py-3 backdrop-blur">
          <div className="flex items-center gap-2">
            <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700">
              Workspace: {workspace}
            </span>
            <span className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700">
              User: {me.username || me.email || me.provider_user_id}
            </span>
            <span className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700">
              Model: {activeModel ? `${activeModel.provider}/${activeModel.model}` : "未获取"}
            </span>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2 py-1 shadow-sm">
            <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700">
              <ShieldCheck size={12} />
              Token
            </span>
            <input
              value={showTokenPlain ? token : tokenMasked || (token ? `${token.slice(0, 4)}...${token.slice(-4)}` : "")}
              onChange={(e) => setToken(e.target.value)}
              className="w-64 rounded-md border border-slate-300 px-2 py-1 text-xs"
              readOnly={!showTokenPlain}
            />
            <button onClick={() => setShowTokenPlain((v) => !v)} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs">
              {showTokenPlain ? "隐藏" : "显示"}
            </button>
            <button
              onClick={async () => {
                await copyText(token);
                setTokenCopied(true);
                setTimeout(() => setTokenCopied(false), 1200);
                setNotice("Token 已复制");
              }}
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
            >
              {tokenCopied ? <Check size={12} /> : <Copy size={12} />}
              {tokenCopied ? "已复制" : "复制"}
            </button>
            <button
              onClick={async () => {
                setError("");
                setNotice("");
                try {
                  const rotated = await api.rotatePlatformToken();
                  setToken(rotated.token);
                  setTokenMasked(rotated.masked);
                  setShowTokenPlain(true);
                  setNotice("Token 已重置，请立即复制并更新调用方配置。");
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
              title="Rotate Token"
            >
              <RefreshCw size={12} />
              重置
            </button>
            <button onClick={refreshModels} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs">
              刷新模型
            </button>
            <button
              onClick={async () => {
                await api.logout();
                setMe(null);
                setAuthChecked(true);
              }}
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
            >
              退出
            </button>
          </div>
        </header>

        <div className="pointer-events-none fixed right-5 top-5 z-50 flex w-[360px] flex-col gap-2">
          {notice && (
            <div className="pointer-events-auto rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 shadow-sm">
              {notice}
            </div>
          )}
          {error && (
            <div className="pointer-events-auto rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 shadow-sm">
              {error}
            </div>
          )}
        </div>

        <section className="flex-1 p-6">
          {view === "adapters" && (
            <div className="grid h-full grid-cols-2 gap-4">
              <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Adapter 生成器</h2>
                  <div className="flex gap-1">
                    {(["curl", "openapi", "raw"] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => setSourceType(s)}
                        className={cn(
                          "rounded-md px-3 py-1 text-xs",
                          sourceType === s ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"
                        )}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mb-3 rounded-xl border border-slate-200 bg-white p-3">
                  <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">Step 1 · 基础参数</div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      value={apiSlug}
                      onChange={(e) => setApiSlug(e.target.value)}
                      placeholder="api_slug"
                      className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                    />
                    <input
                      value={action}
                      onChange={(e) => setAction(e.target.value)}
                      placeholder="action"
                      className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                    />
                  </div>
                </div>
                <div className="mb-2 text-xs text-slate-500">
                  <div>`api_slug` 用于标识某个第三方服务（如 `openweather`）</div>
                  <div>`action` 用于标识具体能力（如 `get_current_weather`）</div>
                </div>
                <div className="mb-3 rounded-xl border border-slate-200 bg-white p-3">
                  <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">Step 2 · 目标统一格式</div>
                  <textarea
                    value={targetFormat}
                    onChange={(e) => setTargetFormat(e.target.value)}
                    className="h-20 w-full rounded-md border border-slate-300 p-2 text-xs"
                    placeholder="可选：目标统一格式(JSON)"
                  />
                </div>
                <div className="mb-3 text-xs text-slate-500">
                  目标统一格式用于告诉模型你期望的入参与出参结构；不填则使用系统默认格式。
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">Step 3 · 源信息输入</div>
                  <input
                    value={sourceUrl}
                    onChange={(e) => setSourceUrl(e.target.value)}
                    className="mb-2 w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
                    placeholder="可选：source_url（留空则使用下方输入内容）"
                  />
                  <input
                    type="hidden"
                    value={sourceType}
                    readOnly
                  />
                  <Editor
                    height="340px"
                    defaultLanguage={sourceType === "openapi" ? "json" : "shell"}
                    language={sourceType === "openapi" ? "json" : "shell"}
                    value={source}
                    onChange={(v) => setSource(v || "")}
                    options={{ minimap: { enabled: false }, fontSize: 13 }}
                  />
                </div>
                <button
                  onClick={onGenerate}
                  disabled={generating}
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  {generating ? <LoaderCircle className="animate-spin" size={14} /> : <Activity size={14} />}
                  Generate Adapter
                </button>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="mb-3 text-lg font-semibold">AI Preview</h2>
                {generating && sourceType === "openapi" && (
                  <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
                    AI 正在逆向工程 API 结构...
                  </div>
                )}
                {!generating && generated && (
                  <>
                    <div className="mb-3 rounded-md bg-slate-50 p-2 text-xs">
                      <div>Method/URL: {String((generated.spec as any)?.target?.method)} {String((generated.spec as any)?.target?.url)}</div>
                      <div>生成模式: {generated.generation_mode}</div>
                      <div>鉴权模式: {detectAuthMode(generated) === "secret" ? "需鉴权" : "无鉴权"}</div>
                      {generated.generation_warning && <div className="text-amber-600">警告: {generated.generation_warning}</div>}
                      {authValidationHint(generated) && <div className="text-amber-600">校验: {authValidationHint(generated)}</div>}
                    </div>
                    <Editor
                      height="240px"
                      defaultLanguage="json"
                      language="json"
                      value={pretty(generated.spec)}
                      options={{ readOnly: true, minimap: { enabled: false }, fontSize: 12 }}
                    />
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => onPublish(generated.id)}
                        className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-3 py-2 text-sm text-white"
                      >
                        <Save size={14} />
                        Publish to V1
                      </button>
                      <button
                        onClick={() => openPlay(generated)}
                        className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm"
                      >
                        <Play size={14} />
                        Sandbox Test
                      </button>
                      <button
                        onClick={() => onExportExecuteRequest(generated)}
                        className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm"
                      >
                        <Copy size={14} />
                        导出请求
                      </button>
                    </div>
                  </>
                )}

                <h3 className="mt-6 mb-2 text-sm font-semibold">适配器列表</h3>
                <div className="max-h-72 space-y-3 overflow-auto pr-1">
                  {adapters.length === 0 && (
                    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-center text-xs text-slate-500">
                      暂无适配器，先在左侧生成并发布一个版本。
                    </div>
                  )}
                  {adapters.map((item) => (
                    <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-3 text-xs shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-slate-900">
                            {item.api_slug} / {item.action}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                            <span className="rounded bg-slate-100 px-1.5 py-0.5">v{item.logic_version}</span>
                            <span className="rounded bg-slate-100 px-1.5 py-0.5">schema {item.adapter_schema_version}</span>
                            <span className="rounded bg-slate-100 px-1.5 py-0.5">
                              {detectAuthMode(item) === "secret" ? "需鉴权" : "无鉴权"}
                            </span>
                            <span>更新于 {formatUpdatedAt(item.updated_at)}</span>
                          </div>
                        </div>
                        <span className={cn("rounded-md px-2 py-0.5 text-[11px] font-medium", adapterStatusClass(item.status))}>
                          {item.status}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          onClick={() => onPublish(item.id)}
                          className="rounded-md bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-white"
                        >
                          发布
                        </button>
                        <button
                          onClick={() => openPlay(item)}
                          className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] text-slate-700"
                        >
                          Sandbox Test
                        </button>
                        <button
                          onClick={() => onExportExecuteRequest(item)}
                          className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] text-slate-700"
                        >
                          导出请求
                        </button>
                        <button
                          onClick={() => setGenerated(item)}
                          className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] text-slate-700"
                        >
                          预览
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {view === "secrets" && (
            <div className="max-w-5xl rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-5 shadow-sm">
              <div className="mb-4 flex items-end justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Secrets 管理</h2>
                  <p className="mt-1 text-xs text-slate-500">仅保存上游 API 所需凭证，执行时按模板中的 `secrets.xxx` 注入。</p>
                </div>
                <span className="rounded-md bg-slate-900 px-2 py-1 text-[11px] text-white">
                  {secrets.length} items
                </span>
              </div>

              <div className="mb-4 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                  <input
                    value={secretName}
                    onChange={(e) => setSecretName(e.target.value)}
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                    placeholder="Secret 名称（如 api_key）"
                  />
                  <input
                    value={secretValue}
                    onChange={(e) => setSecretValue(e.target.value)}
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                    placeholder="Secret 值"
                  />
                  <button onClick={onSaveSecret} className="rounded-md bg-slate-900 px-3 py-2 text-sm text-white">
                    保存 Secret
                  </button>
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                      <th className="py-2 pl-3">Name</th>
                      <th>Algorithm</th>
                      <th>Updated</th>
                      <th className="pr-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {secrets.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-3 py-8 text-center text-xs text-slate-500">
                          暂无 Secret，先添加一个用于上游鉴权。
                        </td>
                      </tr>
                    )}
                    {secrets.map((item) => (
                      <tr key={item.name} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/60">
                        <td className="py-2 pl-3 font-medium text-slate-800">{item.name}</td>
                        <td>
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">{item.algorithm}</span>
                        </td>
                        <td className="text-slate-600">{new Date(item.updated_at).toLocaleString()}</td>
                        <td className="pr-3 text-right">
                          <button
                            onClick={() => onDeleteSecret(item.name)}
                            disabled={deletingSecret === item.name}
                            className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs text-red-700 disabled:opacity-60"
                          >
                            {deletingSecret === item.name ? <LoaderCircle size={12} className="animate-spin" /> : <Trash2 size={12} />}
                            删除
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {view === "llm" && (
            <div className="max-w-6xl space-y-4 rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">LLM 管理</h2>
                  <p className="mt-1 text-xs text-slate-500">按 workspace 配置模型激活状态、System Prompt 与 API Key。</p>
                </div>
                <button
                  onClick={refreshModels}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs"
                >
                  <RefreshCw size={12} />
                  刷新
                </button>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                {modelProfiles.map((item) => {
                  const keySlot = llmKeyStateKey(item.provider);
                  return (
                    <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                      <div className="mb-2 flex items-center justify-between">
                        <div className="text-sm font-semibold text-slate-900">{item.provider}/{item.model}</div>
                        <span className={cn(
                          "rounded px-1.5 py-0.5 text-[11px]",
                          item.api_key_configured ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                        )}>
                          {item.api_key_configured ? "Key已配置" : "Key未配置"}
                        </span>
                      </div>
                      <div className="mb-2">
                        <button
                          onClick={() => onActivateModel(item.id)}
                          disabled={savingModelId === item.id || activeModel?.provider === item.provider}
                          className="rounded-md bg-slate-900 px-2.5 py-1 text-xs text-white disabled:opacity-60"
                        >
                          {savingModelId === item.id ? "切换中..." : activeModel?.provider === item.provider ? "当前激活" : "设为激活"}
                        </button>
                      </div>
                      <div className="mb-2">
                        <input
                          type="password"
                          value={keySlot ? llmKeyInputs[keySlot] : ""}
                          onChange={(e) => keySlot && setLlmKeyInputs((prev) => ({ ...prev, [keySlot]: e.target.value }))}
                          className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
                          placeholder={`输入 ${item.provider} API Key`}
                        />
                        <button
                          onClick={() => onSaveProviderKey(item.provider)}
                          disabled={savingLlmKey === item.provider}
                          className="mt-2 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 disabled:opacity-60"
                        >
                          {savingLlmKey === item.provider ? "保存中..." : "保存 API Key"}
                        </button>
                      </div>
                      <div>
                        <textarea
                          value={modelPromptDrafts[item.id] ?? ""}
                          onChange={(e) => setModelPromptDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))}
                          className="h-24 w-full rounded-md border border-slate-300 p-2 text-xs"
                          placeholder="System Prompt（可选）"
                        />
                        <button
                          onClick={() => onSaveModelPrompt(item.id)}
                          disabled={savingPromptModelId === item.id}
                          className="mt-2 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 disabled:opacity-60"
                        >
                          {savingPromptModelId === item.id ? "保存中..." : "保存 Prompt"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {view === "logs" && (
            <div className="relative rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-end justify-between gap-3">
                <h2 className="text-lg font-semibold">执行日志</h2>
                <div className="flex items-center gap-2">
                  <input
                    value={logQuery}
                    onChange={(e) => setLogQuery(e.target.value)}
                    className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                    placeholder="搜索 id/api/action"
                  />
                  <select
                    value={logStatusFilter}
                    onChange={(e) => setLogStatusFilter(e.target.value)}
                    className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                  >
                    <option value="all">全部</option>
                    <option value="success">成功</option>
                    <option value="error">失败</option>
                  </select>
                  <select
                    value={String(logPageSize)}
                    onChange={(e) => setLogPageSize(Number(e.target.value))}
                    className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                  >
                    <option value="10">10/页</option>
                    <option value="20">20/页</option>
                    <option value="50">50/页</option>
                  </select>
                </div>
              </div>
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2">ID</th>
                    <th>API Slug</th>
                    <th>Action</th>
                    <th>Status</th>
                    <th>Latency</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedExecutions.map((item) => (
                    <tr
                      key={item.id}
                      onClick={() => openExecution(item.id)}
                      className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
                    >
                      <td className="py-2">{item.id.slice(0, 8)}</td>
                      <td>{item.api_slug}</td>
                      <td>{item.action}</td>
                      <td>{item.upstream_status}{item.dry_run ? " (dry)" : ""}</td>
                      <td>{item.latency_ms}ms</td>
                      <td>{new Date(item.created_at).toLocaleTimeString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                <div>共 {filteredExecutions.length} 条，当前第 {currentLogPage}/{totalLogPages} 页</div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setLogPage((p) => Math.max(1, p - 1))}
                    disabled={currentLogPage <= 1}
                    className="rounded-md border border-slate-300 bg-white px-2 py-1 disabled:opacity-60"
                  >
                    上一页
                  </button>
                  <button
                    onClick={() => setLogPage((p) => Math.min(totalLogPages, p + 1))}
                    disabled={currentLogPage >= totalLogPages}
                    className="rounded-md border border-slate-300 bg-white px-2 py-1 disabled:opacity-60"
                  >
                    下一页
                  </button>
                </div>
              </div>

              {selectedExecution && (
                <div className="absolute right-0 top-0 h-full w-[45%] border-l border-slate-200 bg-white p-4 shadow-xl">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="font-semibold">执行详情 {selectedExecution.id.slice(0, 8)}</h3>
                    <button onClick={() => setSelectedExecution(null)}>关闭</button>
                  </div>
                  <div className="space-y-2 text-xs">
                    <details open>
                      <summary className="cursor-pointer font-medium">脱敏请求体</summary>
                      <pre className="overflow-auto rounded bg-slate-900 p-2 text-slate-100">{pretty(selectedExecution.request_snapshot)}</pre>
                    </details>
                    <details>
                      <summary className="cursor-pointer font-medium">Upstream Response</summary>
                      <pre className="overflow-auto rounded bg-slate-900 p-2 text-slate-100">{pretty(selectedExecution.upstream_response)}</pre>
                    </details>
                    <details>
                      <summary className="cursor-pointer font-medium">Final Output</summary>
                      <pre className="overflow-auto rounded bg-slate-900 p-2 text-slate-100">{pretty(selectedExecution.final_output)}</pre>
                    </details>
                    <details>
                      <summary className="cursor-pointer font-medium">Debug Trace</summary>
                      <pre className="overflow-auto rounded bg-slate-900 p-2 text-slate-100">{pretty(selectedExecution.trace_snapshot)}</pre>
                    </details>
                  </div>
                </div>
              )}
            </div>
          )}

          {view === "playground" && (
            <div className="max-w-4xl rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="mb-2 text-lg font-semibold">Playground First</h2>
              <p className="mb-4 text-sm text-slate-600">粘贴 cURL，点击生成，在右侧一键 Play。该页为快速入口，实际执行走 Adapters 页面。</p>
              <button onClick={() => setView("adapters")} className="rounded-md bg-slate-900 px-4 py-2 text-sm text-white">
                进入生成器
              </button>
            </div>
          )}

          {view === "guide" && (
            <div className="max-w-5xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-xl font-semibold">使用说明（折叠卡片版）</h2>
              <div className="space-y-3 text-sm leading-6 text-slate-700">
                <details className="rounded-lg border border-slate-200 p-4" open>
                  <summary className="cursor-pointer text-base font-semibold">1. Web 控制台（前端）</summary>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    <li><strong>Adapters</strong>：生成、预览、发布、Sandbox Test</li>
                    <li><strong>Secrets</strong>：录入并管理 API Key</li>
                    <li><strong>Logs</strong>：查看执行日志、状态、耗时与调试信息</li>
                    <li><strong>LLM</strong>：切换模型、编辑系统提示词、配置模型密钥</li>
                  </ul>
                </details>

                <details className="rounded-lg border border-slate-200 p-4" open>
                  <summary className="cursor-pointer text-base font-semibold">2. CLI 常用命令（开发者）</summary>
                  <p className="mt-2">先在 <code>cli/</code> 下执行：<code>npm install &amp;&amp; npm run build</code></p>
                  <pre className="mt-2 overflow-auto rounded bg-slate-900 p-3 text-xs text-slate-100">{`# 初始化
node dist/index.js init --profile default --backend-url http://127.0.0.1:3000 --token <TOKEN> --workspace-id default

# 生成适配器
node dist/index.js gen -f ./sample.curl -t curl --api-slug reqres --action users

# 执行适配器
node dist/index.js run reqres --action users --payload '{"page":2}' --include-hint

# 日志
node dist/index.js logs --tail 10

# 设置密钥
node dist/index.js secrets set openai_api_key=sk-xxxx`}</pre>
                  <p className="mt-2">配置优先级：<code>ENV &gt; .av-cli.json &gt; 全局配置</code>。</p>
                </details>

                <details className="rounded-lg border border-slate-200 p-4" open>
                  <summary className="cursor-pointer text-base font-semibold">3. MCP 常用工具（AI Agent）</summary>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    <li><code>init_config</code>：设置 backend/token/workspace</li>
                    <li><code>gen_from_curl</code>：从 cURL 生成适配器</li>
                    <li><code>adapters_list</code> / <code>adapter_get</code>：工具发现与详情读取</li>
                    <li><code>execute_api</code>：执行统一 API（支持 include_hint）</li>
                    <li><code>secrets_set</code>：设置密钥并刷新 readiness</li>
                    <li><code>logs_tail</code>：读取最近执行日志</li>
                  </ul>
                </details>

                <details className="rounded-lg border border-slate-200 p-4" open>
                  <summary className="cursor-pointer text-base font-semibold">4. 统一执行接口示例</summary>
                  <pre className="mt-2 overflow-auto rounded bg-slate-900 p-3 text-xs text-slate-100">{`POST /v1/execute
Authorization: Bearer <PLATFORM_TOKEN>
x-workspace-id: <workspace>
Content-Type: application/json

{
  "api_slug": "weather_service",
  "action": "get_current_weather",
  "payload": {
    "city": "Paris",
    "units": "celsius"
  },
  "options": {
    "include_hint": true
  }
}`}</pre>
                </details>

                <details className="rounded-lg border border-slate-200 p-4">
                  <summary className="cursor-pointer text-base font-semibold">5. 旧版说明（保留）</summary>
                  <div className="mt-2 space-y-4">
                    <section>
                      <h4 className="text-sm font-semibold">5.1 三种输入模式区别</h4>
                      <p><strong>curl</strong>：适合快速接入单接口，自动解析 URL/方法/Header/Body。</p>
                      <p><strong>openapi</strong>：适合结构化文档，模型按 action 选择最匹配端点。</p>
                      <p><strong>raw</strong>：最灵活，支持自然语言描述和 source_url 抓取解析。</p>
                      <pre className="mt-2 overflow-auto rounded bg-slate-900 p-3 text-xs text-slate-100">{`Hi AI, we have this weather API. The URL is https://api.test.com/info. You need to put the city in the body as { 'location': 'city_name' }. It needs a Bearer token in the header.`}</pre>
                    </section>

                    <section>
                      <h4 className="text-sm font-semibold">5.2 推荐操作流程</h4>
                      <p>在 Adapters 页填写 <code>api_slug</code> / <code>action</code> 后生成适配器。</p>
                      <p>先 Sandbox Test 验证映射和鉴权，再 Publish to V1 正式发布。</p>
                      <p>密钥统一放到 Secrets，不要把明文写到适配器。</p>
                    </section>

                    <section>
                      <h4 className="text-sm font-semibold">5.3 Adapter 三个核心输入项</h4>
                      <p><strong>api_slug</strong>：建议全小写+下划线，如 <code>openweather</code>。</p>
                      <p><strong>action</strong>：建议动词开头，如 <code>get_current_weather</code>。</p>
                      <p><strong>target_format</strong>：可选，不确定可先留空后续迭代。</p>
                      <p><strong>auth_mode</strong>：预览中会显示“无鉴权/需鉴权”，发布前会按该模式校验。</p>
                    </section>

                    <section>
                      <h4 className="text-sm font-semibold">5.4 转换后如何调用</h4>
                      <p>发布后统一走 <code>/v1/execute</code>，返回 <code>success/data/error/meta</code>。</p>
                    </section>

                    <section>
                      <h4 className="text-sm font-semibold">5.5 日志怎么看</h4>
                      <p>Logs 页可查看每次执行状态码、耗时、上游响应和 Debug Trace。</p>
                    </section>
                  </div>
                </details>
              </div>
            </div>
          )}
        </section>
      </main>

      {playAdapter && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40">
          <div className="w-[680px] rounded-xl bg-white p-4 shadow-2xl">
            <h3 className="mb-2 text-lg font-semibold">Sandbox Test: {playAdapter.api_slug} / {playAdapter.action}</h3>
            <div className="mb-2 text-xs text-slate-500">自动推导 Payload 字段，可按需修改</div>
            <div className="grid grid-cols-2 gap-2">
              {parsePayloadKeys(playAdapter).map((k) => (
                <input
                  key={k}
                  value={playPayload[k] ?? ""}
                  onChange={(e) => setPlayPayload((prev) => ({ ...prev, [k]: e.target.value }))}
                  className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                  placeholder={k}
                />
              ))}
            </div>
            <input
              value={playTempSecret}
              onChange={(e) => setPlayTempSecret(e.target.value)}
              className="mt-2 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
              placeholder="可选临时 secret(api_key)"
            />
            <div className="mt-3 flex gap-2">
              <button
                onClick={runPlay}
                disabled={playRunning}
                className="inline-flex items-center gap-1 rounded-md bg-accent px-3 py-2 text-sm text-white disabled:opacity-60"
              >
                {playRunning ? <LoaderCircle size={14} className="animate-spin" /> : <Play size={14} />}
                运行 Sandbox Test
              </button>
              <button onClick={() => setPlayAdapter(null)} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
                关闭
              </button>
            </div>
            {Boolean(playResult) && (
              <pre className="mt-3 max-h-72 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100">{pretty(playResult)}</pre>
            )}
          </div>
        </div>
      )}
    </div>
    )
  );
}

export default App;

