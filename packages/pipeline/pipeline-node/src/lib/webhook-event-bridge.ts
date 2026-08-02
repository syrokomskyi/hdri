/*
<MODULE_CONTRACT>
<purpose>Provides a PipelineEventCallback that sends pipeline events as HTTP POST webhooks to the pipeline-host, enabling real-time event propagation for messenger-driven pipelines.</purpose>
<non-goals>
  <item>Does not handle webhook authentication beyond Bearer token.</item>
  <item>Does not retry failed webhook deliveries.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation of createWebhookEventBridge for sending PipelineEvent callbacks as HTTP POST webhooks.</item>
</CHANGE_SUMMARY>
*/

import type { PipelineEvent, PipelineEventCallback } from "@syrokomskyi/pipeline-core";

type WebhookEventPayload = {
  runId: string;
  event: string;
  timestamp: string;
  data?: Record<string, unknown>;
};

const sendWebhookEvent = async (
  url: string,
  token: string,
  payload: WebhookEventPayload,
): Promise<void> => {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error(
        `[webhook-bridge] Failed to send ${payload.event} for run ${payload.runId}: ${response.status} ${response.statusText}`,
      );
    }
  } catch (error) {
    console.error(
      `[webhook-bridge] Error sending ${payload.event} for run ${payload.runId}:`,
      error,
    );
  }
};

const eventToPayload = (
  runId: string,
  event: PipelineEvent,
): WebhookEventPayload => {
  const timestamp = new Date().toISOString();

  switch (event.type) {
    case "pipeline_started":
      return {
        runId,
        event: event.type,
        timestamp,
        data: { totalSteps: event.totalSteps },
      };

    case "step_started":
      return {
        runId,
        event: event.type,
        timestamp,
        data: {
          stepId: event.stepId,
          stepNumber: event.stepNumber,
          title: event.title,
        },
      };

    case "step_completed":
      return {
        runId,
        event: event.type,
        timestamp,
        data: {
          stepId: event.stepId,
          stepNumber: event.stepNumber,
        },
      };

    case "step_failed":
      return {
        runId,
        event: event.type,
        timestamp,
        data: {
          stepId: event.stepId,
          stepNumber: event.stepNumber,
          error: event.error,
        },
      };

    case "step_skipped":
      return {
        runId,
        event: event.type,
        timestamp,
        data: {
          stepId: event.stepId,
          stepNumber: event.stepNumber,
          reason: event.reason,
        },
      };

    case "pipeline_completed":
      return {
        runId,
        event: event.type,
        timestamp,
      };

    case "pipeline_paused":
      return {
        runId,
        event: event.type,
        timestamp,
        data: {
          reason: event.reason,
          stepId: event.stepId,
          pauseType: event.pauseType,
          message: event.message,
          declarationText: event.declarationText,
          availableArtifacts: event.availableArtifacts,
          requiredFiles: event.requiredFiles,
        },
      };
  }
};

/**
 * Creates a PipelineEventCallback that sends pipeline events as HTTP POST
 * webhooks to the specified URL with Bearer token authentication.
 *
 * When WEBHOOK_URL and WEBHOOK_RUN_ID environment variables are set,
 * the bridge is automatically created. Otherwise, returns undefined.
 */
export const createWebhookEventBridge = (): PipelineEventCallback | undefined => {
  const url = process.env.WEBHOOK_URL;
  const token = process.env.WEBHOOK_TOKEN;
  const runId = process.env.WEBHOOK_RUN_ID;

  if (!url || !token || !runId) {
    return undefined;
  }

  return (event: PipelineEvent) => {
    const payload = eventToPayload(runId, event);
    void sendWebhookEvent(url, token, payload);
  };
};
