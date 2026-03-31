import { Application } from 'express'
import ttsRoutes from './tts.route'
import history from 'connect-history-api-fallback'
import { healthHandler } from '../middleware/health.middleware'

// 1. 引入我们刚刚在 controller 里写好的方法
import { legadoApiHandler } from '../controllers/legado.controller'

export function setupRoutes(app: Application): void {
  app.use('/api/v1/tts', ttsRoutes)
  app.use('/api/health', healthHandler)
  
  // 2. 在这里注册阅读 App 的专属 AI 角色分配接口
  // 支持 GET 和 POST 请求
  app.post('/api/legado', legadoApiHandler)
  app.get('/api/legado', legadoApiHandler)

  // 注意：自定义的 API 接口必须放在这行 history() 代码之前！
  app.use(history())
}
