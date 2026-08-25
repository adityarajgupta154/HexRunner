import type {
  CreateSafetyReportRequest,
  CreateSafetyReportResult,
} from '@workspace/api-client-react';

export type SafetyStorageAdapter = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

export const PENDING_SAFETY_REPORTS_KEY = '@hexrunner/pending-safety-reports';

export function createSafetyQueue({
  storage,
  submitReport,
  now = () => Date.now(),
}: {
  storage: SafetyStorageAdapter;
  submitReport: (
    report: CreateSafetyReportRequest,
  ) => Promise<CreateSafetyReportResult>;
  now?: () => number;
}) {
  async function getPendingSafetyReports(): Promise<CreateSafetyReportRequest[]> {
    const raw = await storage.getItem(PENDING_SAFETY_REPORTS_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      const reports = Array.isArray(parsed) ? parsed : [];
      const cutoff = now() - 24 * 60 * 60 * 1_000;
      const fresh = reports.filter(
        (item) =>
          typeof item?.occurredAt === 'string' &&
          new Date(item.occurredAt).getTime() >= cutoff,
      );
      if (fresh.length !== reports.length) {
        if (fresh.length) {
          await storage.setItem(
            PENDING_SAFETY_REPORTS_KEY,
            JSON.stringify(fresh),
          );
        } else {
          await storage.removeItem(PENDING_SAFETY_REPORTS_KEY);
        }
      }
      return fresh;
    } catch {
      return [];
    }
  }

  async function queueSafetyReport(
    report: CreateSafetyReportRequest,
  ): Promise<void> {
    const reports = await getPendingSafetyReports();
    const next = [
      ...reports.filter(
        (item) => item.clientReportId !== report.clientReportId,
      ),
      report,
    ].slice(-20);
    await storage.setItem(PENDING_SAFETY_REPORTS_KEY, JSON.stringify(next));
  }

  async function removePendingSafetyReport(
    clientReportId: string,
  ): Promise<void> {
    const reports = await getPendingSafetyReports();
    const next = reports.filter(
      (item) => item.clientReportId !== clientReportId,
    );
    if (next.length) {
      await storage.setItem(PENDING_SAFETY_REPORTS_KEY, JSON.stringify(next));
    } else {
      await storage.removeItem(PENDING_SAFETY_REPORTS_KEY);
    }
  }

  async function flushPendingSafetyReports(clientRunId?: string): Promise<{
    delivered: number;
    remaining: number;
  }> {
    const reports = await getPendingSafetyReports();
    const candidates = clientRunId
      ? reports.filter((report) => report.clientRunId === clientRunId)
      : reports;
    let delivered = 0;

    for (const report of candidates) {
      try {
        const result = await submitReport(report);
        if (result.accepted || result.duplicate) {
          await removePendingSafetyReport(report.clientReportId);
          delivered += 1;
        }
      } catch {
        // Preserve transient and verification failures for a later retry/expiry.
      }
    }

    const remaining = (await getPendingSafetyReports()).filter(
      (report) => !clientRunId || report.clientRunId === clientRunId,
    ).length;
    return { delivered, remaining };
  }

  return {
    getPendingSafetyReports,
    queueSafetyReport,
    removePendingSafetyReport,
    flushPendingSafetyReports,
  };
}