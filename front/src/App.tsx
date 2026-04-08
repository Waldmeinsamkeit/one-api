import { useEffect, useMemo, useState } from "react";
import Editor from "@monaco-editor/react";
import {
  Activity,
  Cable,
  Copy,
  FlaskConical,
  KeyRound,
  LoaderCircle,
  Logs,
  Play,
  Rocket,
  Save
} from "lucide-react";
import { ApiClient } from "./lib/api";
import { cn, copyText } from "./lib/utils";
import type { AdapterRecord, ExecutionRecord, SecretRecord, ViewKey } from "./lib/types";

const API_BASE = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:3000";
const TOKEN_KEY = "oneapi.platform_token";
const WORKSPACE_KEY = "oneapi.workspace";

const DEFAULT_CURL = `curl https://jsonplaceholder.typicode.com/posts -d '{"title":"foo","body":"bar","userId":1}' -H "Content-type: application/json"`;

function pretty(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function parsePayloadKeys(adapter: AdapterRecord | null) {
  if (!adapter?.spec) {
    return [];
  }
  const text = pretty(adapter.spec);
  const matches = [...text.matchAll(/\{\{payload\.([a-zA-Z0-9_]+)\}\}/g)];
  return [...new Set(matches.map((m) => m[1]))];
}

function App() {
  const [view, setView] = useState<ViewKey>("adapters");
  const [token, setToken] = useState(localStorage.getItem(TOKEN_KEY) ?? "dev-token");
  const [workspace, setWorkspace] = useState(localStorage.getItem(WORKSPACE_KEY) ?? "default");

  const api = useMemo(() => new ApiClient(API_BASE, token, workspace), [token, workspace]);

  const [sourceType, setSourceType] = useState<"curl" | "openapi" | "raw">("curl");
  const [source, setSource] = useState(DEFAULT_CURL);
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

  const [secretName, setSecretName] = useState("api_key");
  const [secretValue, setSecretValue] = useState("");

  const [playAdapter, setPlayAdapter] = useState<AdapterRecord | null>(null);
  const [playPayload, setPlayPayload] = useState<Record<string, string>>({});
  const [playTempSecret, setPlayTempSecret] = useState("");
  const [playResult, setPlayResult] = useState<unknown>(null);
  const [playRunning, setPlayRunning] = useState(false);

  useEffect(() => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(WORKSPACE_KEY, workspace);
  }, [token, workspace]);

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

  useEffect(() => {
    refreshAdapters();
    refreshSecrets();
    refreshLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, workspace]);

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
        source_content: source,
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
      setNotice("Dry Run 执行完成，日志已记录。");
      await refreshLogs();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPlayRunning(false);
    }
  }

  return (
    <div className="flex min-h-screen text-foreground">
      <aside className="w-20 border-r border-slate-200 bg-white/80 backdrop-blur">
        <div className="flex h-full flex-col items-center py-4">
          <div className="mb-4 rounded-xl bg-accent p-2 text-white">
            <Cable size={18} />
          </div>
          {[
            { key: "adapters", icon: Rocket, label: "Adapters" },
            { key: "secrets", icon: KeyRound, label: "Secrets" },
            { key: "logs", icon: Logs, label: "Logs" },
            { key: "playground", icon: FlaskConical, label: "Play" }
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
        <header className="flex items-center justify-between border-b border-slate-200 bg-white/70 px-6 py-3 backdrop-blur">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold">Workspace</span>
            <input
              value={workspace}
              onChange={(e) => setWorkspace(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1 text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="w-72 rounded-md border border-slate-300 px-2 py-1 text-sm"
            />
            <button
              onClick={() => copyText(token)}
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1 text-sm"
            >
              <Copy size={14} />
              复制Token
            </button>
          </div>
        </header>

        {error && (
          <div className="mx-6 mt-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </div>
        )}
        {notice && (
          <div className="mx-6 mt-4 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {notice}
          </div>
        )}

        <section className="flex-1 p-6">
          {view === "adapters" && (
            <div className="grid h-full grid-cols-2 gap-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
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
                <div className="mb-3 grid grid-cols-2 gap-2">
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
                <textarea
                  value={targetFormat}
                  onChange={(e) => setTargetFormat(e.target.value)}
                  className="mb-3 h-20 w-full rounded-md border border-slate-300 p-2 text-xs"
                  placeholder="可选：目标统一格式(JSON)"
                />
                <Editor
                  height="360px"
                  defaultLanguage={sourceType === "openapi" ? "json" : "shell"}
                  language={sourceType === "openapi" ? "json" : "shell"}
                  value={source}
                  onChange={(v) => setSource(v || "")}
                  options={{ minimap: { enabled: false }, fontSize: 13 }}
                />
                <button
                  onClick={onGenerate}
                  disabled={generating}
                  className="mt-3 inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  {generating ? <LoaderCircle className="animate-spin" size={14} /> : <Activity size={14} />}
                  Generate Adapter
                </button>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="mb-3 text-lg font-semibold">AI Preview</h2>
                {generating && (
                  <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
                    AI 正在逆向工程 API 结构...
                  </div>
                )}
                {!generating && generated && (
                  <>
                    <div className="mb-3 rounded-md bg-slate-50 p-2 text-xs">
                      <div>Method/URL: {String((generated.spec as any)?.target?.method)} {String((generated.spec as any)?.target?.url)}</div>
                      <div>生成模式: {generated.generation_mode}</div>
                      {generated.generation_warning && <div className="text-amber-600">警告: {generated.generation_warning}</div>}
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
                        Play
                      </button>
                    </div>
                  </>
                )}

                <h3 className="mt-6 mb-2 text-sm font-semibold">适配器列表</h3>
                <div className="space-y-2 overflow-auto max-h-52 pr-1">
                  {adapters.map((item) => (
                    <div key={item.id} className="rounded-md border border-slate-200 bg-slate-50 p-2 text-xs">
                      <div className="flex items-center justify-between">
                        <div>{item.api_slug} / {item.action}</div>
                        <span className={cn("rounded px-1.5 py-0.5", item.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600")}>
                          {item.status}
                        </span>
                      </div>
                      <div className="mt-1 flex gap-2">
                        <button onClick={() => onPublish(item.id)} className="text-accent">发布</button>
                        <button onClick={() => openPlay(item)} className="text-slate-700">Play</button>
                        <button onClick={() => setGenerated(item)} className="text-slate-700">预览</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {view === "secrets" && (
            <div className="max-w-3xl rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-lg font-semibold">Secrets 管理</h2>
              <div className="mb-4 grid grid-cols-3 gap-2">
                <input
                  value={secretName}
                  onChange={(e) => setSecretName(e.target.value)}
                  className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                  placeholder="name"
                />
                <input
                  value={secretValue}
                  onChange={(e) => setSecretValue(e.target.value)}
                  className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                  placeholder="value"
                />
                <button onClick={onSaveSecret} className="rounded-md bg-slate-900 px-3 py-2 text-sm text-white">
                  保存
                </button>
              </div>
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2">Name</th>
                    <th>Algorithm</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {secrets.map((item) => (
                    <tr key={item.name} className="border-b border-slate-100">
                      <td className="py-2">{item.name}</td>
                      <td>{item.algorithm}</td>
                      <td>{new Date(item.updated_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {view === "logs" && (
            <div className="relative rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-lg font-semibold">执行日志</h2>
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
                  {executions.map((item) => (
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
        </section>
      </main>

      {playAdapter && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40">
          <div className="w-[680px] rounded-xl bg-white p-4 shadow-2xl">
            <h3 className="mb-2 text-lg font-semibold">Play: {playAdapter.api_slug} / {playAdapter.action}</h3>
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
                运行 Dry Run
              </button>
              <button onClick={() => setPlayAdapter(null)} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
                关闭
              </button>
            </div>
            {playResult && (
              <pre className="mt-3 max-h-72 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100">{pretty(playResult)}</pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
