import axios from "axios";
import { env } from "../../config/env.js";
import type { DocumentRemovedEvent } from "./documents.types.js";

export interface DocumentEventPublisher {
  publish(event: DocumentRemovedEvent): Promise<boolean>;
}

export class HttpDocumentEventPublisher implements DocumentEventPublisher {
  constructor(private readonly webhookUrl: string | undefined = env.DOCUMENT_EVENTS_WEBHOOK_URL) {}

  async publish(event: DocumentRemovedEvent): Promise<boolean> {
    const url = this.webhookUrl?.trim();
    if (!url) return false;
    try {
      await axios.post(url, event, {
        timeout: 10_000,
        headers: { "Idempotency-Key": event.event_id },
      });
      return true;
    } catch {
      return false;
    }
  }
}
