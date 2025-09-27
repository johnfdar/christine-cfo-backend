import 'dotenv/config';
import express from 'express';
import pkg from '@slack/bolt';
const { App, ExpressReceiver } = pkg;
import OpenAI from 'openai';

/**
 * 1) EXPRESS RECEIVER (gives us our own Express app)
 */
const receiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET
});

// our own express app
const expressApp = receiver.app;

/**
 * 2) SLACK APP USING EXPRESS RECEIVER
 */
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver
});

// OpenAI client
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * 3) HEALTH ROUTE + LOGGING
 */
expressApp.get('/', (req, res) => {
  res.send('Cofounders OS backend is running ✅');
});
expressApp.use((req, _res, next) => {
  console.log(`[req] ${req.method} ${req.url}`);
  next();
});

/**
 * 4) BENJI PERSONA + HELPER
 */
const personaBenji = `
You are Benji, the founder’s AI management assistant.
Mission: organise information, extract tasks, summarise threads, and keep decisions crisp.
`;

async function llmReply(system, user) {
  const r = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ]
  });
  return r.choices?.[0]?.message?.content ?? '…';
}

/**
 * 5) SLACK EVENT HANDLERS
 */
app.event('app_mention', async ({ event, client }) => {
  try {
    const reply = await llmReply(personaBenji, event.text || '');
    await client.chat.postMessage({
      channel: event.channel,
      thread_ts: event.thread_ts || event.ts,
      text: reply
    });
  } catch (err) {
    console.error('app_mention error', err);
  }
});

app.event('message', async ({ event, client }) => {
  if (event.channel_type === 'im' && !event.bot_id && event.text) {
    try {
      const reply = await llmReply(personaBenji, event.text || '');
      await client.chat.postMessage({
        channel: event.channel,
        thread_ts: event.thread_ts || event.ts,
        text: reply
      });
    } catch (err) {
      console.error('dm error', err);
    }
  }
});

/**
 * 6) START SERVER
 */
(async () => {
  const port = process.env.PORT || 3000;
  await app.start(port);
  console.log(`⚡️ Cofounders OS backend running on port ${port}`);
})();
