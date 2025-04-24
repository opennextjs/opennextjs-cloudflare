import { NextApiRequest, NextApiResponse } from 'next';
import { ChatAgent } from 'vercel/ai-chat';

const agent = new ChatAgent({
  tools: [
    // Add your tools here
  ],
  vectorization: {
    // Add your vectorization configuration here
  },
  durableChat: {
    // Add your durable chat configuration here
  },
  kv: {
    // Add your KV configuration here
  },
  r2: {
    // Add your R2 configuration here
  },
  d1: {
    // Add your D1 configuration here
  }
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const apiKey = req.headers['api-key'];

  if (apiKey !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { message } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  const response = await agent.sendMessage(message);

  res.status(200).json({ response });
}
