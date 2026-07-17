import { redirect } from "next/navigation";
import { BenchmarkWorkspace } from "../components/benchmark-workspace";
import { BenchmarkApiError } from "../lib/api-errors";
import { loadBenchmarkPageData } from "../lib/benchmark-page-data";

export const dynamic = "force-dynamic";

export default async function RigorousBenchmarkPage() {
  try {
    const data = await loadBenchmarkPageData();
    return <BenchmarkWorkspace {...data} initialHistory={data.history} mode="rigorous" />;
  } catch (error) {
    if (error instanceof BenchmarkApiError && error.status === 401) {
      redirect("/login");
    }
    throw error;
  }
}
