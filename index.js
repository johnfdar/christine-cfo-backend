import 'dotenv/config';
import pkg from '@slack/bolt';
const { App, ExpressReceiver } = pkg;
import OpenAI from 'openai';

/** 1) RECEIVER + EXPRESS APP **/
const receiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET
});
const expressApp = receiver.app; // native Express app

/** 2) SLACK APP **/
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver
});

/** 3) OPENAI **/
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/** 4) HEALTH + DEBUG + LOGGING ROUTES **/
expressApp.get('/', (_req, res) => res.send('Backend is running ✅'));
expressApp.get('/slack/events', (_req, res) =>
  res.send('Slack events endpoint (GET) is alive')
);
expressApp.get('/debug', (_req, res) => {
  res.json({
    has_SIGNING_SECRET: Boolean(process.env.SLACK_SIGNING_SECRET),
    has_BOT_TOKEN: Boolean(process.env.SLACK_BOT_TOKEN),
    has_OPENAI_KEY: Boolean(process.env.OPENAI_API_KEY)
  });
});
expressApp.use((req, _res, next) => {
  console.log(`[req] ${req.method} ${req.url}`);
  next();
});

/** 5) CHRISTINE PERSONA + HELPER **/
const persona = `
You are Christine, the AI Chief Financial Officer for {COMPANY_NAME}.
Mission: Build and explain budgets, forecasts, runway, unit economics, and KPI dashboards; flag risks early.
Scope: cash runway, burn, gross margin, CAC/LTV, payback, pricing, fundraising needs.
Style: Start with numbers (table/bullets), then a short interpretation. List assumptions; ask for missing inputs.
Constraints: Stay in finance; route strategy to Fazal; ops/admin to Benji.
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

/** 6) SLACK EVENTS **/
app.event('app_mention', async ({ event, client }) => {
  try {
    const reply = await llmReply(persona, event.text || '');
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
      const reply = await llmReply(persona, event.text || '');
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

/** 7) START SERVER **/
(async () => {
  const port = process.env.PORT || 3000;
  await app.start(port);
  console.log(`⚡️ Christine service running on port ${port}`);
})();

