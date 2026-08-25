export type BaselineActivityLevel =
  | "beginner"
  | "casual"
  | "regular"
  | "trained";

const budgetByActivityLevel: Readonly<Record<BaselineActivityLevel, number>> = {
  beginner: 6,
  casual: 10,
  regular: 15,
  trained: 20,
};

/**
 * The API enforces the persisted baseline's daily claim budget. The on-device
 * model may personalize the coaching tier further, but never bypasses this
 * server-side cap.
 */
export function dailyBudgetForActivity(
  activityLevel: BaselineActivityLevel,
): number {
  return budgetByActivityLevel[activityLevel];
}