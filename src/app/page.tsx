import { getProvider } from "@/lib/pipeline";
import { Dashboard } from "@/components/Dashboard";
import { connection } from "next/server";
import { Suspense } from "react";

async function RuntimeDashboard() {
  await connection();
  return <Dashboard provider={getProvider()} />;
}

export default function Page() {
  return <Suspense fallback={<main>Preparando AdForge AI…</main>}><RuntimeDashboard /></Suspense>;
}
