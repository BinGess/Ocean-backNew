import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SarahCozeRecord {
  record_time: string;
  content: string;
}

export interface SarahCozeLetterParts {
  summary: string;
  signature: string;
}

@Injectable()
export class SarahCozeClient {
  private readonly logger = new Logger(SarahCozeClient.name);

  constructor(private readonly config: ConfigService) {}

  async generateWeeklyLetter(input: {
    weekStart: string;
    weekEnd: string;
    records: SarahCozeRecord[];
  }): Promise<SarahCozeLetterParts> {
    const baseUrl = this.config.get<string>('SARAH_COZE_BASE_URL') ?? this.config.get<string>('COZE_BASE_URL');
    const token = this.config.get<string>('SARAH_COZE_TOKEN') ?? this.config.get<string>('COZE_TOKEN');
    const projectIdStr =
      this.config.get<string>('SARAH_COZE_PROJECT_ID') ?? this.config.get<string>('COZE_PROJECT_ID');
    const endpointPath = this.config.get<string>('SARAH_COZE_ENDPOINT_PATH') ?? '/stream_run';

    if (!baseUrl || !token || !projectIdStr) {
      throw new SarahCozeConfigurationError('Coze baseUrl, token, and project id are required');
    }

    const projectId = Number(projectIdStr);
    if (Number.isNaN(projectId)) {
      throw new SarahCozeConfigurationError('SARAH_COZE_PROJECT_ID must be a valid number');
    }

    const url = new URL(endpointPath, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
    const body = {
      content: {
        query: {
          prompt: [
            {
              type: 'text',
              content: { text: this.buildPrompt(input) },
            },
          ],
        },
      },
      type: 'query',
      session_id: this.newSessionId(),
      project_id: projectId,
    };

    const responseText = await this.postWithRetry(url, token, body);
    return this.parseLetterParts(responseText);
  }

  private buildPrompt(input: { weekStart: string; weekEnd: string; records: SarahCozeRecord[] }): string {
    const recordsText = input.records.map((r) => `[${r.record_time}] ${r.content}`).join('\n');
    return `以下是用户本周（${input.weekStart} 至 ${input.weekEnd}）的记录，请据此生成 Sarah 信件：\n\n${recordsText}`;
  }

  private newSessionId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  parseLetterParts(raw: unknown): SarahCozeLetterParts {
    const candidate = this.unwrapResponse(raw);
    const source = typeof candidate === 'string' ? this.extractAnswerText(candidate) : candidate;
    const parsed = typeof source === 'string' ? this.parseJsonLike(source) : source;
    const normalized = this.normalizeObject(parsed);

    const summary =
      this.readString(normalized, ['emotion_overview', 'summary']) ??
      this.readString(normalized, ['emotionOverview', 'summary']) ??
      this.readString(normalized, ['overview', 'summary']) ??
      this.readString(normalized, ['summary']) ??
      this.readString(normalized, ['content']) ??
      (typeof source === 'string' ? source.trim() : '');

    const signature =
      this.readString(normalized, ['signature']) ??
      this.readString(normalized, ['sign_off']) ??
      this.readString(normalized, ['signOff']) ??
      this.readString(normalized, ['落款']) ??
      'Sarah';

    if (!summary.trim()) {
      throw new SarahCozeParseError('Coze response did not contain a usable summary');
    }

    return {
      summary: summary.trim(),
      signature: signature.trim() || 'Sarah',
    };
  }

  private async postWithRetry(url: URL, token: string, body: Record<string, unknown>): Promise<string> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30_000);
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        const text = await response.text();
        if (!response.ok) {
          throw new SarahCozeServiceError(`Coze request failed with ${response.status}: ${text.slice(0, 300)}`);
        }
        return text;
      } catch (error) {
        lastError = error;
        if (attempt === 3 || error instanceof SarahCozeConfigurationError || error instanceof SarahCozeParseError) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
      } finally {
        clearTimeout(timeout);
      }
    }

    this.logger.warn(`Coze request failed after retries: ${this.errorMessage(lastError)}`);
    throw lastError instanceof Error ? lastError : new SarahCozeServiceError('Coze request failed');
  }

  private unwrapResponse(raw: unknown): unknown {
    if (typeof raw === 'string') {
      const parsed = this.tryJsonParse(raw);
      if (!parsed) return raw;
      return this.unwrapResponse(parsed);
    }

    if (!raw || typeof raw !== 'object') return raw;
    const value = raw as Record<string, unknown>;
    for (const key of ['data', 'result', 'output', 'answer', 'content']) {
      if (value[key] !== undefined) {
        return this.unwrapResponse(value[key]);
      }
    }
    return value;
  }

  private extractAnswerText(text: string): string {
    const chunks: string[] = [];
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice('data:'.length).trim();
      if (!data || data === '[DONE]') continue;
      const event = this.tryJsonParse(data);
      if (!event || typeof event !== 'object') continue;
      const type = this.readString(event, ['type']) ?? this.readString(event, ['event']);
      if (type === 'message_end') {
        const errorCode = this.readString(event, ['error', 'code']) ?? this.readString(event, ['code']);
        if (errorCode) throw new SarahCozeServiceError(`Coze stream ended with error: ${errorCode}`);
      }
      const content =
        this.readString(event, ['answer']) ??
        this.readString(event, ['content']) ??
        this.readString(event, ['message', 'content']) ??
        this.readString(event, ['data', 'content']);
      if (!type || type.includes('answer') || type.includes('message')) {
        if (content) chunks.push(content);
      }
    }
    return chunks.length > 0 ? chunks.join('') : text;
  }

  private parseJsonLike(text: string): unknown {
    const extracted = this.extractJsonText(text);
    const parsed = this.tryJsonParse(extracted);
    if (parsed) return parsed;

    const repaired = this.repairJson(extracted);
    const repairedParsed = this.tryJsonParse(repaired);
    return repairedParsed ?? text;
  }

  private extractJsonText(text: string): string {
    const jsonFence = text.match(/```json\s*([\s\S]*?)```/i);
    if (jsonFence?.[1]) return jsonFence[1].trim();

    const anyFence = text.match(/```\s*([\s\S]*?)```/);
    if (anyFence?.[1]) return anyFence[1].trim();

    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return text.slice(firstBrace, lastBrace + 1).trim();
    }

    return text.trim();
  }

  private repairJson(text: string): string {
    let repaired = text.trim().replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
    const lastBrace = repaired.lastIndexOf('}');
    if (lastBrace >= 0) repaired = repaired.slice(0, lastBrace + 1);
    return repaired;
  }

  private normalizeObject(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  }

  private readString(value: unknown, path: string[]): string | null {
    let current = value;
    for (const key of path) {
      if (!current || typeof current !== 'object') return null;
      current = (current as Record<string, unknown>)[key];
    }
    return typeof current === 'string' && current.trim() ? current : null;
  }

  private tryJsonParse(text: string): unknown | null {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}

export class SarahCozeConfigurationError extends Error {}
export class SarahCozeParseError extends Error {}
export class SarahCozeServiceError extends Error {}
