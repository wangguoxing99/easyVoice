import { Request, Response } from 'express'
import OpenAI from 'openai'
import { EdgeTTS } from '../lib/node-edge-tts/edge-tts-fixed'

// 默认的声音映射表（可根据你的喜好修改）
const VOICE_MAP: Record<string, string> = {
  narrator: 'zh-CN-YunxiNeural', // 旁白：云希（沉稳男声）
  male: 'zh-CN-YunyangNeural',   // 男角色对话：云扬（清朗男声）
  female: 'zh-CN-XiaoxiaoNeural' // 女角色对话：晓晓（温柔女声）
}

export const legadoApiHandler = async (req: Request, res: Response) => {
  // 兼容 GET 和 POST 请求
  const text = (req.query.text || req.body.text || req.body.speakText) as string
  if (!text) {
    return res.status(400).send('Missing text parameter')
  }

  console.log(`[Legado API] 收到阅读App请求，长度: ${text.length} 字`)

  try {
    // 1. 调用大模型极速分析文本角色
    // 注意：这里需要你的 .env 中配置了 OPENAI_API_KEY 和 OPENAI_BASE_URL
    const openai = new OpenAI({
      baseURL: process.env.OPENAI_BASE_URL,
      apiKey: process.env.OPENAI_API_KEY,
    })

    const prompt = `你是一个小说语音分配助手。请将下面的文本拆分为片段，并判断每个片段是旁白(narrator)、男性对话(male)还是女性对话(female)。
必须返回严格的JSON对象，格式如下：
{
  "segments": [
    {"text": "推开门，他冷冷地说：", "role": "narrator"},
    {"text": "“谁让你进来的？”", "role": "male"}
  ]
}
小说文本：
${text}`

    // 推荐使用 gpt-4o-mini 或 qwen-turbo 等极速模型，防止阅读 App 等待超时
    const completion = await openai.chat.completions.create({
      model: process.env.LLM_MODEL || 'gpt-4o-mini', 
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3
    })

    const content = completion.choices[0].message.content || '{"segments":[]}'
    let segments: { text: string; role: string }[] = []

    try {
      const parsed = JSON.parse(content)
      segments = parsed.segments || []
    } catch (e) {
      console.warn('[Legado API] AI JSON 解析失败，降级为全旁白')
      segments = [{ text, role: 'narrator' }]
    }

    // 2. 顺序请求 TTS 音频 (保证语序正确)
    const audioBuffers: Buffer[] = []

    for (const seg of segments) {
      if (!seg.text.trim()) continue

      // 根据 AI 分析的 role 映射到具体的微软音色
      const voiceName = VOICE_MAP[seg.role] || VOICE_MAP.narrator
      const tts = new EdgeTTS({
        voice: voiceName,
        outputFormat: 'audio-24khz-48kbitrate-mono-mp3'
      })

      console.log(`  - 正在生成 [${seg.role}]: ${seg.text.substring(0, 15)}...`)
      
      // 获取 Buffer
      const audio = (await tts.ttsPromise(seg.text, { outputType: 'buffer' })) as Buffer
      if (audio) {
        audioBuffers.push(audio)
      }
    }

    // 3. 内存极速拼接所有音频片段
    const finalAudio = Buffer.concat(audioBuffers)

    // 4. 返回 MP3 流给阅读 App
    res.setHeader('Content-Type', 'audio/mpeg')
    res.setHeader('Content-Length', finalAudio.length)
    res.send(finalAudio)

    console.log(`[Legado API] 响应完成，音频大小: ${(finalAudio.length / 1024).toFixed(2)} KB\n`)

  } catch (error) {
    console.error('[Legado API] 发生错误:', error)
    
    // 终极容错：如果 AI 超时或网络异常，直接用旁白音色读完这整段，绝对不让阅读 App 卡死报错
    try {
      const fallbackTts = new EdgeTTS({ voice: VOICE_MAP.narrator })
      const fallbackAudio = (await fallbackTts.ttsPromise(text, { outputType: 'buffer' })) as Buffer
      res.setHeader('Content-Type', 'audio/mpeg')
      res.send(fallbackAudio)
    } catch (e) {
      res.status(500).send('TTS Generation Failed')
    }
  }
}
