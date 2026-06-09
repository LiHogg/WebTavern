import { env } from "@/shared/lib/env";

export function createNotificationsSocket() {
  return new WebSocket(`${env.wsBaseUrl}/notifications/`);
}
