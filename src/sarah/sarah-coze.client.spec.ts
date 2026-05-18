import { SarahCozeClient, SarahCozeServiceError } from './sarah-coze.client';

describe('SarahCozeClient parser', () => {
  const client = new SarahCozeClient({} as any);

  it('parses direct Coze JSON payloads', () => {
    expect(
      client.parseLetterParts({
        emotion_overview: { summary: '这一周你慢慢找回了节奏。' },
        signature: 'Sarah',
      }),
    ).toEqual({
      summary: '这一周你慢慢找回了节奏。',
      signature: 'Sarah',
    });
  });

  it('extracts JSON from markdown answers', () => {
    expect(
      client.parseLetterParts(`
        当然可以：
        \`\`\`json
        {"emotion_overview":{"summary":"你在关系里更诚实了。"},"signature":"一直在这里的 Sarah"}
        \`\`\`
      `),
    ).toEqual({
      summary: '你在关系里更诚实了。',
      signature: '一直在这里的 Sarah',
    });
  });

  it('joins SSE answer chunks before parsing', () => {
    const stream = [
      'data: {"type":"answer","content":"{\\"emotion_overview\\":{\\"summary\\":\\"你记录了更多细小感受。\\"},"}',
      'data: {"type":"answer","content":"\\"signature\\":\\"Sarah\\"}"}',
      'data: [DONE]',
    ].join('\n\n');

    expect(client.parseLetterParts(stream)).toEqual({
      summary: '你记录了更多细小感受。',
      signature: 'Sarah',
    });
  });

  it('falls back to plain text when JSON is unavailable', () => {
    expect(client.parseLetterParts('这一周，你对自己的需要更敏感了。')).toEqual({
      summary: '这一周，你对自己的需要更敏感了。',
      signature: 'Sarah',
    });
  });

  it('raises service errors from SSE message_end events', () => {
    expect(() =>
      client.parseLetterParts('data: {"type":"message_end","error":{"code":"bad_request"}}'),
    ).toThrow(SarahCozeServiceError);
  });
});
