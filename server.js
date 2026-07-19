import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { Readable } from 'stream';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;
const MAX_IMAGE_PROXY_BYTES = 25 * 1024 * 1024;

// Log requests for debugging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// NetEase audio proxy endpoint
app.get('/api/song', async (req, res) => {
  const id = req.query.id;
  if (!id) {
    return res.status(400).send('missing id');
  }

  const target = `https://music.163.com/song/media/outer/url?id=${id}.mp3`;
  try {
    const upstreamResponse = await fetch(target, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://music.163.com/'
      }
    });

    if (!upstreamResponse.ok) {
      return res.status(502).send('no audio from upstream');
    }

    if (!upstreamResponse.body) {
      return res.status(502).send('no response body from upstream');
    }

    // Set headers
    res.setHeader('Content-Type', upstreamResponse.headers.get('content-type') || 'audio/mpeg');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=3600');

    // Convert Web Stream to Node Stream and pipe to Express response
    Readable.fromWeb(upstreamResponse.body).pipe(res);

  } catch (error) {
    console.error('Proxy error:', error);
    if (!res.headersSent) {
      res.status(502).send('upstream error');
    }
  }
});

app.post('/api/image-materialize', express.json({ limit: '1mb' }), async (req, res) => {
  const { url, key } = req.body || {};
  if (!url || typeof url !== 'string') {
    return res.status(400).send('missing image url');
  }

  let target;
  try {
    target = new URL(url);
  } catch (error) {
    return res.status(400).send('invalid image url');
  }

  if (!['http:', 'https:'].includes(target.protocol)) {
    return res.status(400).send('unsupported image url protocol');
  }

  const hostname = target.hostname.toLowerCase();
  const isLocalTarget =
    hostname === 'localhost' ||
    hostname === '::1' ||
    hostname.startsWith('127.') ||
    hostname.startsWith('10.') ||
    hostname.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname);

  if (isLocalTarget) {
    return res.status(400).send('local image proxy targets are blocked');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);

  try {
    const upstreamResponse = await fetch(target, {
      headers: {
        Accept: 'image/*',
        ...(key ? { Authorization: `Bearer ${key}` } : {})
      },
      signal: controller.signal
    });

    if (!upstreamResponse.ok) {
      return res.status(502).send(`image upstream ${upstreamResponse.status}`);
    }

    const contentLength = Number(upstreamResponse.headers.get('content-length') || 0);
    if (contentLength > MAX_IMAGE_PROXY_BYTES) {
      return res.status(413).send('image too large');
    }

    const contentType = upstreamResponse.headers.get('content-type') || 'image/png';
    if (!contentType.toLowerCase().startsWith('image/')) {
      return res.status(415).send('upstream response is not an image');
    }

    const buffer = Buffer.from(await upstreamResponse.arrayBuffer());
    if (buffer.byteLength > MAX_IMAGE_PROXY_BYTES) {
      return res.status(413).send('image too large');
    }

    res.json({
      dataUrl: `data:${contentType};base64,${buffer.toString('base64')}`
    });
  } catch (error) {
    console.error('Image materialize error:', error);
    res.status(502).send(error.message || 'image materialize failed');
  } finally {
    clearTimeout(timeoutId);
  }
});

// Server-side Gemini API Proxy
app.post(['/api/chat', '/api/chat/chat/completions'], express.json({ limit: '15mb' }), async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(400).json({
      error: {
        message: '未在后台配置 GEMINI_API_KEY。请在 Google AI Studio Build 左侧的 Settings > Secrets 面板添加您的 API Key 之后再使用。'
      }
    });
  }

  const { model, messages, stream, temperature, top_p } = req.body;

  try {
    const ai = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });

    let systemInstruction = '';
    const geminiContents = [];

    if (Array.isArray(messages)) {
      for (const msg of messages) {
        if (msg.role === 'system') {
          systemInstruction = typeof msg.content === 'string' ? msg.content : '';
        } else {
          const role = msg.role === 'assistant' ? 'model' : 'user';
          const parts = [];

          if (typeof msg.content === 'string') {
            parts.push({ text: msg.content });
          } else if (Array.isArray(msg.content)) {
            for (const item of msg.content) {
              if (item.type === 'text') {
                parts.push({ text: item.text });
              } else if (item.type === 'image_url' && item.image_url?.url) {
                const match = item.image_url.url.match(/^data:([^;]+);base64,(.+)$/);
                if (match) {
                  parts.push({
                    inlineData: {
                      mimeType: match[1],
                      data: match[2]
                    }
                  });
                }
              }
            }
          }

          if (parts.length > 0) {
            geminiContents.push({ role, parts });
          }
        }
      }
    }

    const geminiModel = 'gemini-3.5-flash';

    if (stream) {
      const responseStream = await ai.models.generateContentStream({
        model: geminiModel,
        contents: geminiContents,
        config: {
          systemInstruction,
          temperature: typeof temperature === 'number' ? temperature : undefined,
          topP: typeof top_p === 'number' ? top_p : undefined,
        }
      });

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      for await (const chunk of responseStream) {
        const text = chunk.text;
        if (text) {
          const data = {
            choices: [{
              delta: { content: text }
            }]
          };
          res.write(`data: ${JSON.stringify(data)}\n\n`);
        }
      }
      res.write('data: [DONE]\n\n');
      res.end();
    } else {
      const response = await ai.models.generateContent({
        model: geminiModel,
        contents: geminiContents,
        config: {
          systemInstruction,
          temperature: typeof temperature === 'number' ? temperature : undefined,
          topP: typeof top_p === 'number' ? top_p : undefined,
        }
      });

      res.json({
        choices: [{
          message: {
            role: 'assistant',
            content: response.text || ''
          }
        }]
      });
    }

  } catch (error) {
    console.error('Gemini API Error:', error);
    if (!res.headersSent) {
      res.status(500).json({
        error: {
          message: error.message || 'Call to Gemini API failed'
        }
      });
    }
  }
});

// Server-side Free Chat Proxy with Auto-Failover to Gemini
app.post(['/api/free-chat', '/api/free-chat/chat/completions'], express.json({ limit: '15mb' }), async (req, res) => {
  const { model, messages, stream, temperature, top_p } = req.body;
  const selectedModel = 'openai';

  try {
    const upstreamUrl = 'https://text.pollinations.ai/v1/chat/completions';
    
    // Set a timeout to avoid waiting too long if it is down
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7000); // 7s timeout

    const upstreamResponse = await fetch(upstreamUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        model: selectedModel,
        messages: messages,
        stream: stream,
        temperature: temperature,
        top_p: top_p
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (upstreamResponse.ok) {
      if (stream) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        
        Readable.fromWeb(upstreamResponse.body).pipe(res);
      } else {
        const data = await upstreamResponse.json();
        res.json(data);
      }
      return;
    }
    
    console.warn(`Pollinations API returned status: ${upstreamResponse.status}. Attempting local Gemini fallback...`);
    throw new Error(`Upstream returned ${upstreamResponse.status}`);

  } catch (err) {
    console.error('Failed to connect to free model upstream:', err);
    
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      console.log('Failover: GEMINI_API_KEY is configured. Routing free model request to local Gemini proxy...');
      try {
        const ai = new GoogleGenAI({
          apiKey: apiKey,
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build',
            }
          }
        });

        let systemInstruction = '';
        const geminiContents = [];

        if (Array.isArray(messages)) {
          for (const msg of messages) {
            if (msg.role === 'system') {
              systemInstruction = typeof msg.content === 'string' ? msg.content : '';
            } else {
              const role = msg.role === 'assistant' ? 'model' : 'user';
              const parts = [];

              if (typeof msg.content === 'string') {
                parts.push({ text: msg.content });
              } else if (Array.isArray(msg.content)) {
                for (const item of msg.content) {
                  if (item.type === 'text') {
                    parts.push({ text: item.text });
                  } else if (item.type === 'image_url' && item.image_url?.url) {
                    const match = item.image_url.url.match(/^data:([^;]+);base64,(.+)$/);
                    if (match) {
                      parts.push({
                        inlineData: {
                          mimeType: match[1],
                          data: match[2]
                        }
                      });
                    }
                  }
                }
              }

              if (parts.length > 0) {
                geminiContents.push({ role, parts });
              }
            }
          }
        }

        const geminiModel = 'gemini-3.5-flash';

        if (stream) {
          const responseStream = await ai.models.generateContentStream({
            model: geminiModel,
            contents: geminiContents,
            config: {
              systemInstruction,
              temperature: typeof temperature === 'number' ? temperature : undefined,
              topP: typeof top_p === 'number' ? top_p : undefined,
            }
          });

          res.setHeader('Content-Type', 'text/event-stream');
          res.setHeader('Cache-Control', 'no-cache');
          res.setHeader('Connection', 'keep-alive');

          for await (const chunk of responseStream) {
            const text = chunk.text;
            if (text) {
              const data = {
                choices: [{
                  delta: { content: text }
                }]
              };
              res.write(`data: ${JSON.stringify(data)}\n\n`);
            }
          }
          res.write('data: [DONE]\n\n');
          res.end();
        } else {
          const response = await ai.models.generateContent({
            model: geminiModel,
            contents: geminiContents,
            config: {
              systemInstruction,
              temperature: typeof temperature === 'number' ? temperature : undefined,
              topP: typeof top_p === 'number' ? top_p : undefined,
            }
          });

          res.json({
            choices: [{
              message: {
                role: 'assistant',
                content: response.text || ''
              }
            }]
          });
        }
        return;
      } catch (geminiErr) {
        console.error('Failover to Gemini failed:', geminiErr);
      }
    }

    if (!res.headersSent) {
      const errorMsg = '⚠️ 免费模型底层服务商 (pollinations.ai) 目前正处于服务中断或维护状态 (502 Bad Gateway)。\n\n💡 极力推荐您在 Google AI Studio Build 左侧的 Settings > Secrets 面板中，添加您的 [GEMINI_API_KEY] 后，切换并使用「内置 Gemini」模型，享受极速、高稳定性的不间断对话体验！';
      
      if (stream) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        
        const data = {
          choices: [{
            delta: { content: errorMsg }
          }]
        };
        res.write(`data: ${JSON.stringify(data)}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      } else {
        res.status(500).json({
          error: {
            message: errorMsg
          }
        });
      }
    }
  }
});

// Serve static files from root directory
app.use(express.static(__dirname));

// Fallback to index.html for unknown routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
