"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

type EvidenceRow = Record<string, string | number | null>;

type CopilotResponse = {
  answer: string;
  evidence: {
    title: string;
    columns: string[];
    rows: EvidenceRow[];
  }[];
  charts: {
    title: string;
    columns: string[];
    rows: EvidenceRow[];
  }[];
  actions: string[];
  metrics: { label: string; value: string }[];
  has_expenses?: boolean;
  schema?: string[];
};

type UploadRecord = {
  file_id: string;
  filename: string;
  uploaded_at: string;
};

const sampleQuestions = [
  "Why did revenue drop last week?",
  "What should I reorder this week?",
  "Which items are trending up?",
  "Any anomalies I should know about?",
];

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [datasetId, setDatasetId] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<CopilotResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [useFancyCharts, setUseFancyCharts] = useState(true);
  const [uploadInfo, setUploadInfo] = useState<{
    filename: string;
    uploadedAt: string;
  } | null>(null);
  const [uploadHistory, setUploadHistory] = useState<UploadRecord[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const formatDate = (value: string) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleString();
  };

  const canAsk = useMemo(() => datasetId && question.trim().length > 3, [
    datasetId,
    question,
  ]);

  const handleUpload = async () => {
    if (!file) return;
    setError(null);
    setLoading(true);
    setResponse(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`${API_BASE}/upload`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        throw new Error("Upload failed. Check backend logs.");
      }

      const data = await res.json();
      setDatasetId(data.dataset_id);
      setUploadInfo({
        filename: data.filename ?? file.name,
        uploadedAt: formatDate(data.uploaded_at ?? new Date().toISOString()),
      });
      await fetchUploadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleAsk = async () => {
    if (!canAsk) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/ask`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dataset_id: datasetId,
          question,
        }),
      });

      if (!res.ok) {
        throw new Error("Copilot request failed.");
      }

      const data = await res.json();
      setResponse(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed.");
    } finally {
      setLoading(false);
    }
  };

  const fetchUploadHistory = async () => {
    try {
      const res = await fetch(`${API_BASE}/uploads`);
      if (!res.ok) {
        return;
      }
      const data = await res.json();
      setUploadHistory(data.uploads ?? []);
    } catch {
      // ignore
    }
  };

  const handleReprocess = async (fileId: string) => {
    setError(null);
    setLoading(true);
    setResponse(null);
    try {
      const res = await fetch(`${API_BASE}/reprocess`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ file_id: fileId }),
      });

      if (!res.ok) {
        throw new Error("Reprocess failed.");
      }

      const data = await res.json();
      setDatasetId(data.dataset_id);
      setUploadInfo({
        filename: data.filename,
        uploadedAt: formatDate(data.uploaded_at),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reprocess failed.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUploadHistory();
  }, []);

  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="absolute inset-0 bg-sunset" />
      <div className="absolute inset-0 bg-grain pattern-grain opacity-40" />

      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-12">
        <header className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-ink text-sand shadow-lift">
                <span className="font-display text-2xl">V</span>
              </div>
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-ink/60">
                  AI Ops Copilot
                </p>
                <h1 className="font-display text-3xl text-ink md:text-4xl">
                  Square AI
                </h1>
                <p className="text-sm text-ink/60">
                  Here to help your Business Succeed
                </p>
              </div>
            </div>
            <div className="rounded-full border border-ink/10 bg-white/70 px-4 py-2 text-sm text-ink/70 shadow-sm">
              Square-ready analytics · CSV to action
            </div>
          </div>
          <p className="max-w-2xl text-lg text-ink/80 text-balance">
            Upload sales + inventory CSVs, ask a question, and get a crisp
            narrative, proof, and actions you can take today.
          </p>
        </header>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="flex h-full flex-col rounded-3xl border border-ink/10 bg-white/80 p-6 shadow-lift">
            <div className="flex flex-col gap-6">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-2xl">Data ingest</h2>
                <span className="text-sm text-ink/60">CSV only</span>
              </div>
              <div className="flex flex-col gap-4">
                <label className="rounded-2xl border border-dashed border-ink/20 bg-white p-6 transition hover:border-ink/40">
                  <input
                    type="file"
                    accept=".csv"
                    className="hidden"
                    ref={fileInputRef}
                    onChange={(event) => {
                      const nextFile = event.target.files?.[0] ?? null;
                      setFile(nextFile);
                    }}
                  />
                  <div className="flex flex-col gap-3">
                    <p className="font-medium">
                      {file ? file.name : "Drop CSV or click to upload"}
                    </p>
                    <p className="text-sm text-ink/60">
                      Expected columns: date, item, sku, units_sold, revenue,
                      expenses, inventory_on_hand, category.
                    </p>
                  </div>
                </label>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-full border border-ink/20 bg-white px-5 py-3 text-sm font-semibold text-ink transition hover:border-ink/40"
                  >
                    Click to add CSV
                  </button>
                  <button
                    onClick={handleUpload}
                    disabled={!file || loading}
                    className="rounded-full bg-ink px-6 py-3 text-sm font-semibold text-sand transition disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {datasetId ? "Re-upload" : "Upload and analyze"}
                  </button>
                  <span className="text-sm text-ink/60">
                    {datasetId
                      ? `Dataset ready: ${datasetId}`
                      : "No dataset loaded"}
                  </span>
                </div>
                {uploadInfo && (
                  <div className="rounded-2xl border border-ink/10 bg-white px-4 py-3 text-xs text-ink/70">
                    <p>
                      Uploaded file:{" "}
                      <span className="font-semibold">{uploadInfo.filename}</span>
                    </p>
                    <p>Uploaded at: {uploadInfo.uploadedAt}</p>
                  </div>
                )}
                <div className="rounded-2xl border border-ink/10 bg-white/70 p-3">
                  <p className="text-xs font-semibold uppercase tracking-widest text-ink/50">
                    Upload history
                  </p>
                  <div className="mt-2 max-h-32 space-y-2 overflow-y-auto pr-2 text-xs text-ink/70">
                    {uploadHistory.length === 0 ? (
                      <p>No uploads yet.</p>
                    ) : (
                      uploadHistory.map((entry, index) => (
                        <div
                          key={`${entry.file_id}-${index}`}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink/10 bg-white px-3 py-2"
                        >
                          <div>
                            <p className="font-semibold">{entry.filename}</p>
                            <p>{formatDate(entry.uploaded_at)}</p>
                          </div>
                          <button
                            type="button"
                            className="rounded-full border border-ink/20 px-3 py-1 text-[11px] font-semibold text-ink"
                            onClick={() => handleReprocess(entry.file_id)}
                          >
                            Re-run
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex h-full flex-col rounded-3xl border border-ink/10 bg-white/80 p-6 shadow-lift">
            <div className="flex flex-col gap-6">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-2xl">Ask the copilot</h2>
                <span className="text-sm text-ink/60">AI narrative + ops</span>
              </div>
              <div className="flex flex-col gap-3">
                <textarea
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  placeholder="e.g. Why did revenue drop last week?"
                  className="min-h-[120px] rounded-2xl border border-ink/20 bg-white p-4 text-sm focus:border-ink/40 focus:outline-none"
                />
                <div className="flex flex-wrap gap-2">
                  {sampleQuestions.map((sample) => (
                    <button
                      key={sample}
                      type="button"
                      onClick={() => setQuestion(sample)}
                      className="rounded-full border border-ink/10 px-4 py-2 text-xs text-ink/70 transition hover:border-ink/40"
                    >
                      {sample}
                    </button>
                  ))}
                </div>
              </div>
              <button
                onClick={handleAsk}
                disabled={!canAsk || loading}
                className="rounded-full bg-tide px-6 py-3 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? "Thinking..." : "Run analysis"}
              </button>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="flex h-full flex-col rounded-3xl border border-ink/10 bg-white/90 p-6 shadow-lift">
            <h3 className="font-display text-xl">Copilot summary</h3>
            <p className="mt-4 text-base text-ink/80">
              {response?.answer ??
                "Ask a question to see a narrative answer grounded in your data."}
            </p>
            {error && (
              <p className="mt-4 rounded-2xl bg-ember/10 p-4 text-sm text-ember">
                {error}
              </p>
            )}
          </div>

          <div className="flex h-full flex-col rounded-3xl border border-ink/10 bg-white/90 p-6 shadow-lift">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h3 className="font-display text-xl">Key metrics</h3>
              <label className="flex items-center gap-2 text-xs text-ink/60">
                <input
                  type="checkbox"
                  checked={useFancyCharts}
                  onChange={(event) => setUseFancyCharts(event.target.checked)}
                  className="h-4 w-4 accent-ink"
                />
                Use Recharts
              </label>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {(response?.metrics ?? []).length === 0 ? (
                <p className="text-sm text-ink/60">
                  Metrics will appear here after analysis.
                </p>
              ) : (
                response?.metrics.map((metric) => (
                  <div
                    key={metric.label}
                    className="rounded-2xl border border-ink/10 bg-white px-4 py-3"
                  >
                    <p className="text-xs uppercase tracking-widest text-ink/40">
                      {metric.label}
                    </p>
                    <p className="mt-2 font-display text-lg">{metric.value}</p>
                  </div>
                ))
              )}
            </div>
            {response && response.has_expenses === false && (
              <p className="mt-4 rounded-2xl bg-ember/10 p-3 text-xs text-ember">
                Missing <span className="font-semibold">expenses</span> column.
                Net income is estimated as revenue only.
              </p>
            )}
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="flex h-full flex-col rounded-3xl border border-ink/10 bg-white/90 p-6 shadow-lift">
            <h3 className="font-display text-xl">Evidence snapshots</h3>
            <div className="mt-4 flex flex-col gap-6">
              {(response?.evidence ?? []).length === 0 ? (
                <p className="text-sm text-ink/60">
                  Evidence tables will populate once the analysis runs.
                </p>
              ) : (
                response?.evidence.map((evidence) => (
                  <div key={evidence.title} className="flex flex-col gap-3">
                    <h4 className="font-semibold">{evidence.title}</h4>
                    <div className="overflow-auto rounded-2xl border border-ink/10">
                      <table className="min-w-full text-left text-sm">
                        <thead className="bg-ink/5 text-xs uppercase tracking-wider">
                          <tr>
                            {evidence.columns.map((col) => (
                              <th key={col} className="px-4 py-2">
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {evidence.rows.map((row, idx) => (
                            <tr
                              key={`${evidence.title}-${idx}`}
                              className="border-t border-ink/10"
                            >
                              {evidence.columns.map((col) => (
                                <td key={col} className="px-4 py-2">
                                  {row[col] ?? "—"}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="flex h-full flex-col rounded-3xl border border-ink/10 bg-white/90 p-6 shadow-lift">
            <h3 className="font-display text-xl">Financial charts</h3>
            <div className="mt-4 flex flex-col gap-4">
              {(response?.charts ?? []).length === 0 ? (
                <p className="text-sm text-ink/60">
                  Charts will appear after analysis.
                </p>
              ) : (
                response?.charts.map((chart) => (
                  <div key={chart.title} className="flex flex-col gap-3">
                    <h4 className="font-semibold">{chart.title}</h4>
                    {useFancyCharts ? (
                      <div className="h-64 w-full rounded-2xl border border-ink/10 bg-white p-3">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={chart.rows}>
                            <XAxis
                              dataKey="date"
                              tick={{ fontSize: 10 }}
                              label={{
                                value: "Date",
                                position: "insideBottom",
                                offset: -4,
                              }}
                            />
                            <YAxis
                              tick={{ fontSize: 10 }}
                              label={{
                                value: "Amount ($)",
                                angle: -90,
                                position: "insideLeft",
                              }}
                            />
                            <Tooltip
                              formatter={(value: number) =>
                                `$${Number(value).toLocaleString()}`
                              }
                            />
                            <Line
                              type="monotone"
                              dataKey="revenue"
                              stroke="#2f6f64"
                              strokeWidth={2}
                            />
                            <Line
                              type="monotone"
                              dataKey="expenses"
                              stroke="#e85d4a"
                              strokeWidth={2}
                            />
                            <Line
                              type="monotone"
                              dataKey="net_income"
                              stroke="#ffb347"
                              strokeWidth={2}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                        <div className="mt-2 flex flex-wrap gap-4 text-xs text-ink/60">
                          <span className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-[#2f6f64]" />
                            Revenue
                          </span>
                          <span className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-[#e85d4a]" />
                            Expenses
                          </span>
                          <span className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-[#ffb347]" />
                            Net income
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="overflow-hidden rounded-2xl border border-ink/10 bg-white p-4">
                        <svg viewBox="0 0 600 240" className="h-56 w-full">
                          <text x="300" y="18" textAnchor="middle" fontSize="12" fill="#1b1b1b">
                            Amount ($) over time
                          </text>
                          <text x="300" y="232" textAnchor="middle" fontSize="10" fill="#6b6b6b">
                            Date
                          </text>
                          <text
                            x="12"
                            y="120"
                            textAnchor="middle"
                            fontSize="10"
                            fill="#6b6b6b"
                            transform="rotate(-90 12 120)"
                          >
                            Amount ($)
                          </text>
                          {(() => {
                            const maxValue = Math.max(
                              ...chart.rows.map((r) =>
                                Math.max(
                                  Number(r.revenue ?? 0),
                                  Number(r.expenses ?? 0),
                                  Number(r.net_income ?? 0)
                                )
                              ),
                              1
                            );
                            const count = Math.max(chart.rows.length - 1, 1);

                            return chart.rows.map((row, idx) => {
                              const x = (idx / count) * 560 + 20;
                            const revenueY =
                              200 -
                              (Number(row.revenue ?? 0) / maxValue) * 160;
                            const expensesY =
                              200 -
                              (Number(row.expenses ?? 0) / maxValue) * 160;
                            const netY =
                              200 -
                              (Number(row.net_income ?? 0) / maxValue) * 160;

                            return (
                              <g key={idx}>
                                <circle cx={x} cy={revenueY} r={3} fill="#2f6f64" />
                                <circle cx={x} cy={expensesY} r={3} fill="#e85d4a" />
                                <circle cx={x} cy={netY} r={3} fill="#ffb347" />
                              </g>
                            );
                          });
                          })()}
                        </svg>
                        <div className="mt-2 flex flex-wrap gap-4 text-xs text-ink/60">
                          <span className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-[#2f6f64]" />
                            Revenue
                          </span>
                          <span className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-[#e85d4a]" />
                            Expenses
                          </span>
                          <span className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-[#ffb347]" />
                            Net income
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="flex h-full flex-col rounded-3xl border border-ink/10 bg-white/90 p-6 shadow-lift">
            <h3 className="font-display text-xl">Recommended actions</h3>
            <div className="mt-4 flex flex-col gap-3">
              {(response?.actions ?? []).length === 0 ? (
                <p className="text-sm text-ink/60">
                  Actionable next steps will appear after analysis.
                </p>
              ) : (
                response?.actions.map((action) => (
                  <div
                    key={action}
                    className="rounded-2xl border border-ink/10 bg-white px-4 py-3"
                  >
                    <p className="text-sm text-ink/80">{action}</p>
                  </div>
                ))
              )}
            </div>
          </div>
          <div className="flex h-full flex-col rounded-3xl border border-ink/10 bg-white/90 p-6 shadow-lift">
            <h3 className="font-display text-xl">Notes</h3>
            <p className="mt-4 text-sm text-ink/70">
              Metrics and charts are computed from your CSV. Expenses use the
              <span className="font-semibold"> expenses</span> column and net
              income is calculated as revenue minus expenses.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
