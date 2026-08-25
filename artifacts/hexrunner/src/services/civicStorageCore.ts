import type {
  CreateCivicReportRequest,
  CreateCivicReportResult,
} from '@workspace/api-client-react';

export type CivicStorageAdapter = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

export const PENDING_CIVIC_REPORTS_KEY = '@hexrunner/pending-civic-reports';

export function createCivicQueue({
  storage,
  submitReport,
}: {
  storage: CivicStorageAdapter;
  submitReport: (
    report: CreateCivicReportRequest,
  ) => Promise<CreateCivicReportResult>;
}) {
  let storageOperation = Promise.resolve();

  function serialized<T>(operation: () => Promise<T>): Promise<T> {
    const result = storageOperation.then(operation, operation);
    storageOperation = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async function readPendingCivicReports(): Promise<
    CreateCivicReportRequest[]
  > {
    const raw = await storage.getItem(PENDING_CIVIC_REPORTS_KEY);
    if (!raw) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed)
        ? parsed.filter(
            (item): item is CreateCivicReportRequest =>
              typeof item === 'object' &&
              item !== null &&
              typeof item.clientReportId === 'string' &&
              typeof item.clientRunId === 'string' &&
              typeof item.photoObjectPath === 'string',
          )
        : [];
    } catch {
      return [];
    }
  }

  function getPendingCivicReports(): Promise<CreateCivicReportRequest[]> {
    return serialized(readPendingCivicReports);
  }

  function queueCivicReport(report: CreateCivicReportRequest): Promise<void> {
    return serialized(async () => {
      const reports = await readPendingCivicReports();
      const next = [
        ...reports.filter(
          (item) => item.clientReportId !== report.clientReportId,
        ),
        report,
      ];
      await storage.setItem(PENDING_CIVIC_REPORTS_KEY, JSON.stringify(next));
    });
  }

  function removePendingCivicReport(clientReportId: string): Promise<void> {
    return serialized(async () => {
      const reports = await readPendingCivicReports();
      const next = reports.filter(
        (item) => item.clientReportId !== clientReportId,
      );
      if (next.length) {
        await storage.setItem(PENDING_CIVIC_REPORTS_KEY, JSON.stringify(next));
      } else {
        await storage.removeItem(PENDING_CIVIC_REPORTS_KEY);
      }
    });
  }

  async function flushPendingCivicReports(clientRunId?: string): Promise<{
    delivered: number;
    remaining: number;
  }> {
    const reports = await getPendingCivicReports();
    const candidates = clientRunId
      ? reports.filter((report) => report.clientRunId === clientRunId)
      : reports;
    let delivered = 0;

    for (const report of candidates) {
      try {
        const result = await submitReport(report);
        if (result.accepted || result.duplicate) {
          await removePendingCivicReport(report.clientReportId);
          delivered += 1;
        }
      } catch {
        // Keep the metadata draft when the run is unsaved or delivery is uncertain.
      }
    }

    const remaining = (await getPendingCivicReports()).filter(
      (report) => !clientRunId || report.clientRunId === clientRunId,
    ).length;
    return { delivered, remaining };
  }

  return {
    getPendingCivicReports,
    queueCivicReport,
    removePendingCivicReport,
    flushPendingCivicReports,
  };
}