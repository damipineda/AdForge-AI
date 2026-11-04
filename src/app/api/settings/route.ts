import { NextResponse } from "next/server";
import { deleteSetting, getSetting, setSetting } from "@/lib/store/db";
import { getProvider, type Provider } from "@/lib/pipeline/provider";

export type ApiKeySettingsStatus = {
  configured: boolean;
  maskedKey: string | null;
  source: "ui" | "env" | "none";
  provider: Provider;
  verified?: boolean;
};

function maskKey(key: string): string {
  const clean = key.trim();
  if (clean.length <= 8) return "••••••••";
  return `${clean.slice(0, 4)}••••••••${clean.slice(-4)}`;
}

function currentStatus(verified?: boolean): ApiKeySettingsStatus {
  const saved = getSetting("MUSE_IMAGE_API_KEY")?.trim() ?? "";
  const envKey = process.env.MUSE_IMAGE_API_KEY?.trim() ?? "";
  const activeKey = saved || envKey;
  const source: "ui" | "env" | "none" = saved ? "ui" : envKey ? "env" : "none";
  return {
    configured: Boolean(activeKey),
    maskedKey: activeKey ? maskKey(activeKey) : null,
    source,
    provider: getProvider(),
    ...(typeof verified === "boolean" ? { verified } : {}),
  };
}

export async function GET() {
  return NextResponse.json(currentStatus());
}

export async function PUT(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { apiKey?: unknown };
    const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
    if (!apiKey || apiKey.length < 8) {
      return NextResponse.json(
        { error: "Invalid API Key / Ingresá una API Key válida." },
        { status: 400 },
      );
    }

    setSetting("MUSE_IMAGE_API_KEY", apiKey);
    process.env.AI_PROVIDER = "meta";
    process.env.DEMO_MODE = "false";

    let verified = false;
    try {
      const res = await fetch("https://api.meta.ai/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(8000),
      });
      verified = res.ok;
    } catch {
      verified = false;
    }

    return NextResponse.json(currentStatus(verified));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save API Key" },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  deleteSetting("MUSE_IMAGE_API_KEY");
  return NextResponse.json(currentStatus());
}
