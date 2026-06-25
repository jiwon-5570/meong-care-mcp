export const SAFETY_MESSAGE =
  "이 안내는 진단이나 처방이 아니며, 이상 증상이 심하거나 지속되면 수의사 상담을 권장합니다.";

export function withSafetyMessage<T extends object>(
  payload: T,
): T & { safetyMessage: string } {
  return {
    ...payload,
    safetyMessage: SAFETY_MESSAGE,
  };
}
