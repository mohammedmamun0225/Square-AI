from __future__ import annotations

import json
import os
from datetime import datetime, timedelta
from pathlib import Path
from uuid import uuid4

import numpy as np
import pandas as pd
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

try:
    from openai import OpenAI
except ImportError:  # pragma: no cover
    OpenAI = None

app = FastAPI(title="Vibeloop Ops Copilot", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DATASETS: dict[str, pd.DataFrame] = {}
BASE_DIR = Path(__file__).parent
UPLOAD_DIR = BASE_DIR / "uploads"
INDEX_FILE = UPLOAD_DIR / "index.json"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def load_upload_index() -> list[dict]:
    if not INDEX_FILE.exists():
        return []
    try:
        return json.loads(INDEX_FILE.read_text())
    except json.JSONDecodeError:
        return []


def save_upload_index(records: list[dict]) -> None:
    INDEX_FILE.write_text(json.dumps(records, indent=2))


UPLOAD_INDEX: list[dict] = load_upload_index()

EXPECTED_COLUMNS = {
    "date",
    "item",
    "sku",
    "units_sold",
    "revenue",
    "inventory_on_hand",
    "category",
    "expenses",
}


class AskRequest(BaseModel):
    dataset_id: str
    question: str


class ReprocessRequest(BaseModel):
    file_id: str


def normalize_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df.columns = [col.strip().lower() for col in df.columns]

    if "date" in df.columns:
        df["date"] = pd.to_datetime(df["date"], errors="coerce")

    for col in ["units_sold", "revenue", "inventory_on_hand"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")
    if "expenses" in df.columns:
        df["expenses"] = pd.to_numeric(df["expenses"], errors="coerce")

    return df


def compute_weekly_revenue(df: pd.DataFrame) -> pd.DataFrame:
    if "date" not in df.columns:
        return pd.DataFrame()

    weekly = (
        df.dropna(subset=["date"])
        .assign(week=lambda d: d["date"].dt.to_period("W").dt.start_time)
        .groupby("week", as_index=False)["revenue"]
        .sum()
        .sort_values("week")
    )
    return weekly.tail(6)


def compute_daily_financials(df: pd.DataFrame) -> pd.DataFrame:
    if "date" not in df.columns or "revenue" not in df.columns:
        return pd.DataFrame()

    daily = (
        df.dropna(subset=["date"])
        .groupby("date", as_index=False)[["revenue"]]
        .sum()
        .sort_values("date")
    )

    if "expenses" in df.columns:
        daily_expenses = (
            df.dropna(subset=["date"])
            .groupby("date", as_index=False)[["expenses"]]
            .sum()
        )
        daily = daily.merge(daily_expenses, on="date", how="left")
    else:
        daily["expenses"] = 0.0

    daily["net_income"] = daily["revenue"] - daily["expenses"]
    return daily.tail(14)


def compute_trending_items(df: pd.DataFrame) -> pd.DataFrame:
    if "date" not in df.columns or "item" not in df.columns:
        return pd.DataFrame()

    df = df.dropna(subset=["date"])
    last_date = df["date"].max()
    if pd.isna(last_date):
        return pd.DataFrame()

    last_week_start = last_date - timedelta(days=6)
    prior_week_start = last_week_start - timedelta(days=7)

    last_week = df[(df["date"] >= last_week_start) & (df["date"] <= last_date)]
    prior_week = df[(df["date"] >= prior_week_start) & (df["date"] < last_week_start)]

    last_sales = last_week.groupby("item")["units_sold"].sum()
    prior_sales = prior_week.groupby("item")["units_sold"].sum()

    trend = (
        pd.DataFrame({"last_week": last_sales, "prior_week": prior_sales})
        .fillna(0)
        .assign(change=lambda d: d["last_week"] - d["prior_week"])
        .sort_values("change", ascending=False)
        .head(8)
        .reset_index()
    )
    return trend


def compute_reorder_list(df: pd.DataFrame) -> pd.DataFrame:
    if "inventory_on_hand" not in df.columns:
        return pd.DataFrame()

    item_cols = [col for col in ["item", "sku", "category"] if col in df.columns]
    if not item_cols:
        item_cols = ["item"] if "item" in df.columns else []

    recent = df.dropna(subset=["units_sold"]).copy()
    demand = (
        recent.groupby(item_cols)["units_sold"].mean().rename("avg_daily_units")
    )
    inventory = df.groupby(item_cols)["inventory_on_hand"].mean()

    merged = (
        pd.concat([demand, inventory], axis=1)
        .fillna(0)
        .assign(weeks_of_cover=lambda d: d["inventory_on_hand"] / (d["avg_daily_units"] * 7 + 1e-6))
        .sort_values("weeks_of_cover")
        .reset_index()
    )

    return merged.head(10)


def compute_anomalies(df: pd.DataFrame) -> pd.DataFrame:
    if "date" not in df.columns or "revenue" not in df.columns:
        return pd.DataFrame()

    daily = (
        df.dropna(subset=["date"])
        .groupby("date", as_index=False)["revenue"]
        .sum()
        .sort_values("date")
    )

    if len(daily) < 7:
        return pd.DataFrame()

    daily["z_score"] = (daily["revenue"] - daily["revenue"].mean()) / (
        daily["revenue"].std(ddof=0) + 1e-6
    )

    anomalies = daily.loc[daily["z_score"].abs() >= 2]
    return anomalies.tail(5)


def build_metrics(df: pd.DataFrame) -> list[dict[str, str]]:
    metrics: list[dict[str, str]] = []

    if "revenue" in df.columns:
        total_revenue = df["revenue"].sum()
        metrics.append({"label": "Total revenue", "value": f"${total_revenue:,.0f}"})

    total_expenses = df["expenses"].sum() if "expenses" in df.columns else 0
    metrics.append({"label": "Total expenses", "value": f"${total_expenses:,.0f}"})

    if "revenue" in df.columns:
        net_income = df["revenue"].sum() - total_expenses
        metrics.append({"label": "Net income", "value": f"${net_income:,.0f}"})

    if "units_sold" in df.columns:
        total_units = df["units_sold"].sum()
        metrics.append({"label": "Units sold", "value": f"{total_units:,.0f}"})

    if "item" in df.columns:
        top_item = df.groupby("item")["revenue"].sum().sort_values(ascending=False)
        if not top_item.empty:
            metrics.append(
                {
                    "label": "Top item",
                    "value": f"{top_item.index[0]} (${top_item.iloc[0]:,.0f})",
                }
            )

    return metrics


def build_evidence(df: pd.DataFrame) -> list[dict]:
    evidence: list[dict] = []

    weekly = compute_weekly_revenue(df)
    if not weekly.empty:
        evidence.append(
            {
                "title": "Weekly revenue trend",
                "columns": ["week", "revenue"],
                "rows": weekly.assign(week=lambda d: d["week"].dt.date.astype(str)).to_dict(
                    orient="records"
                ),
            }
        )

    trending = compute_trending_items(df)
    if not trending.empty:
        evidence.append(
            {
                "title": "Trending items (last 7 days)",
                "columns": ["item", "last_week", "prior_week", "change"],
                "rows": trending.to_dict(orient="records"),
            }
        )

    anomalies = compute_anomalies(df)
    if not anomalies.empty:
        evidence.append(
            {
                "title": "Revenue anomalies",
                "columns": ["date", "revenue", "z_score"],
                "rows": anomalies.assign(date=lambda d: d["date"].dt.date.astype(str)).to_dict(
                    orient="records"
                ),
            }
        )

    return evidence


def build_charts(df: pd.DataFrame) -> list[dict]:
    charts: list[dict] = []
    daily = compute_daily_financials(df)
    if daily.empty:
        return charts

    charts.append(
        {
            "title": "Daily financials",
            "columns": ["date", "revenue", "expenses", "net_income"],
            "rows": daily.assign(date=lambda d: d["date"].dt.date.astype(str)).to_dict(
                orient="records"
            ),
        }
    )
    return charts


def build_actions(df: pd.DataFrame) -> list[str]:
    actions: list[str] = []
    reorder = compute_reorder_list(df)

    if not reorder.empty:
        top = reorder.head(3)
        for _, row in top.iterrows():
            item_name = row.get("item") or row.get("sku") or "Item"
            actions.append(
                f"Reorder {item_name}: only {row['inventory_on_hand']:.0f} on hand with ~{row['avg_daily_units']:.1f}/day demand."
            )

    if "revenue" in df.columns and "date" in df.columns:
        weekly = compute_weekly_revenue(df)
        if len(weekly) >= 2:
            last = weekly.iloc[-1]["revenue"]
            prev = weekly.iloc[-2]["revenue"]
            if prev > 0 and last < prev:
                drop = (prev - last) / prev * 100
                actions.append(
                    f"Revenue dropped {drop:.1f}% vs prior week. Consider a limited-time promo on slow movers."
                )

    if not actions:
        actions.append("Run a weekend promo on top-selling items to sustain momentum.")

    return actions


def rule_based_answer(question: str, df: pd.DataFrame) -> str:
    q = question.lower()
    weekly = compute_weekly_revenue(df)
    if "revenue" in q and "drop" in q and len(weekly) >= 2:
        last = weekly.iloc[-1]["revenue"]
        prev = weekly.iloc[-2]["revenue"]
        if prev > 0:
            drop = (prev - last) / prev * 100
            return (
                f"Revenue fell {drop:.1f}% week-over-week. The last week posted ${last:,.0f} "
                f"vs ${prev:,.0f} the week before. Check top items for softening demand and consider a promo."
            )

    if "reorder" in q or "stock" in q:
        reorder = compute_reorder_list(df)
        if reorder.empty:
            return "Inventory looks stable, but keep an eye on fast movers for any sudden spikes."
        top = reorder.iloc[0]
        item_name = top.get("item") or top.get("sku") or "Item"
        return (
            f"{item_name} is your most urgent reorder: only {top['inventory_on_hand']:.0f} on hand "
            f"with {top['avg_daily_units']:.1f} units/day demand."
        )

    if "trend" in q or "trending" in q:
        trending = compute_trending_items(df)
        if trending.empty:
            return "No clear trend detected yet. Try expanding the date range or checking category-specific views."
        top = trending.iloc[0]
        return (
            f"{top['item']} is trending up, gaining {top['change']:.0f} units vs the prior week."
        )

    if "anomal" in q:
        anomalies = compute_anomalies(df)
        if anomalies.empty:
            return "No major anomalies detected in the recent revenue pattern."
        last = anomalies.iloc[-1]
        return (
            f"An anomaly was detected on {last['date'].date()}: revenue ${last['revenue']:,.0f} "
            f"(z-score {last['z_score']:.1f})."
        )

    return "Here’s a quick read: check the evidence panels for weekly trends, anomalies, and reorder risks."


def llm_answer(question: str, df: pd.DataFrame, metrics: list[dict], actions: list[str]) -> str:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key or OpenAI is None:
        return rule_based_answer(question, df)

    client = OpenAI(api_key=api_key)

    summary = {
        "metrics": metrics,
        "actions": actions,
        "recent_rows": df.head(50).to_dict(orient="records"),
    }

    prompt = (
        "You are an AI ops copilot for a small business. "
        "Answer the question using the provided summary. "
        "Be concise, mention 1-2 key numbers, and end with one action.\n"
        f"Question: {question}\n"
        f"Summary: {summary}"
    )

    completion = client.responses.create(
        model="gpt-4o-mini",
        input=prompt,
        temperature=0.2,
    )

    return completion.output_text


@app.post("/upload")
async def upload_csv(file: UploadFile = File(...)):
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are supported.")

    uploaded_at = datetime.utcnow().isoformat()
    file_id = str(uuid4())
    stored_name = f"{file_id}.csv"
    stored_path = UPLOAD_DIR / stored_name
    contents = await file.read()
    stored_path.write_bytes(contents)

    df = pd.read_csv(stored_path)
    df = normalize_dataframe(df)

    if not EXPECTED_COLUMNS.intersection(set(df.columns)):
        raise HTTPException(
            status_code=400,
            detail="CSV missing expected columns. Include date, item, revenue, units_sold, inventory_on_hand.",
        )

    dataset_id = str(uuid4())
    DATASETS[dataset_id] = df

    record = {
        "file_id": file_id,
        "filename": file.filename,
        "stored_name": stored_name,
        "uploaded_at": uploaded_at,
    }
    UPLOAD_INDEX.insert(0, record)
    save_upload_index(UPLOAD_INDEX[:50])

    return {
        "dataset_id": dataset_id,
        "rows": len(df),
        "file_id": file_id,
        "filename": file.filename,
        "uploaded_at": uploaded_at,
    }


@app.post("/ask")
async def ask_copilot(payload: AskRequest):
    df = DATASETS.get(payload.dataset_id)
    if df is None:
        raise HTTPException(status_code=404, detail="Dataset not found.")

    metrics = build_metrics(df)
    evidence = build_evidence(df)
    charts = build_charts(df)
    actions = build_actions(df)
    answer = llm_answer(payload.question, df, metrics, actions)

    return {
        "answer": answer,
        "metrics": metrics,
        "evidence": evidence,
        "charts": charts,
        "actions": actions,
        "has_expenses": "expenses" in df.columns,
        "schema": list(df.columns),
    }


@app.get("/uploads")
async def list_uploads():
    return {"uploads": UPLOAD_INDEX[:50]}


@app.post("/reprocess")
async def reprocess_upload(payload: ReprocessRequest):
    record = next((item for item in UPLOAD_INDEX if item["file_id"] == payload.file_id), None)
    if not record:
        raise HTTPException(status_code=404, detail="Upload not found.")

    stored_path = UPLOAD_DIR / record["stored_name"]
    if not stored_path.exists():
        raise HTTPException(status_code=404, detail="Stored file missing.")

    df = pd.read_csv(stored_path)
    df = normalize_dataframe(df)
    dataset_id = str(uuid4())
    DATASETS[dataset_id] = df

    return {
        "dataset_id": dataset_id,
        "rows": len(df),
        "file_id": record["file_id"],
        "filename": record["filename"],
        "uploaded_at": record["uploaded_at"],
    }


@app.get("/health")
async def health():
    return {"status": "ok", "time": datetime.utcnow().isoformat()}
