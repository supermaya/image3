import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import winston from 'winston';

// 라우터 임포트
import authRoutes from './routes/auth.js';
import pointsRoutes from './routes/points.js';
import musicRoutes from './routes/music.js';
import userRoutes from './routes/user.js';
import uploadRoutes from './routes/upload.js';
import socialAuthRoutes from './routes/socialAuth.js';
import paymentRoutes from './routes/payment.js';
import stripeRoutes from './routes/stripePayment.js';
import paypalRoutes from './routes/paypalPayment.js';
import tossRoutes from './routes/tossPayment.js';
import paymentwallRoutes from './routes/paymentwallPayment.js';
import eximbayRoutes from './routes/eximbayPayment.js';
import iamportRoutes from './routes/iamportPayment.js';
import comfyRoutes from './routes/comfyProxy.js';

// 환경 변수 로드
dotenv.config();

// Express 앱 생성
const app = express();
const PORT = process.env.PORT || 3001;

// 로거 설정
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

// 미들웨어 설정
app.use(helmet({
  crossOriginResourcePolicy: false, // Firebase → ngrok cross-origin 허용
})); // 보안 헤더 설정
app.use(cors({
  origin: (origin, callback) => {
    // origin이 없으면 서버간 요청 (허용)
    if (!origin) return callback(null, true);
    const allowed = (process.env.CORS_ORIGIN || '')
      .split(',')
      .map(o => o.trim())
      .filter(Boolean);
    // 기본 허용 목록: 로컬 개발 + Firebase Hosting + ngrok
    const defaults = [
      'http://localhost:3000',
      'http://localhost:5173',
      'http://localhost:5174',
      'https://pixelplanet-95dd9.web.app',
      'https://pixelplanet-95dd9.firebaseapp.com',
    ];
    // Firebase / ngrok / 모든 출처 허용 (배포 환경)
    const isAllowed =
      [...defaults, ...allowed].includes(origin) ||
      origin.endsWith('.ngrok-free.dev') ||
      origin.endsWith('.ngrok.io') ||
      origin.endsWith('.web.app') ||
      origin.endsWith('.firebaseapp.com');
    callback(null, isAllowed ? true : true); // 현재는 전체 허용
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  // allowedHeaders 미지정 시 요청의 Access-Control-Request-Headers를 자동 반영 (fal.ai 등 모든 헤더 허용)
}));
app.use(express.json()); // JSON 파싱
app.use(express.urlencoded({ extended: true })); // URL-encoded 파싱

// 요청 로깅 미들웨어
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`, {
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  next();
});

// 라우트 설정
app.use('/api/auth', authRoutes);
app.use('/api/auth/social', socialAuthRoutes);
app.use('/api/points', pointsRoutes);
app.use('/api/music', musicRoutes);
app.use('/api/user', userRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/stripe', stripeRoutes);
app.use('/api/paypal', paypalRoutes);
app.use('/api/toss', tossRoutes);
app.use('/api/paymentwall', paymentwallRoutes);
app.use('/api/eximbay', eximbayRoutes);
app.use('/api/iamport', iamportRoutes);  // KG이니시스 V1 검증
app.use('/api/comfy', comfyRoutes);     // ComfyUI 프록시

// 헬스 체크 엔드포인트
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 에러 핸들러
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: '요청한 리소스를 찾을 수 없습니다.'
  });
});

// 에러 핸들러
app.use((err, req, res, next) => {
  logger.error('서버 에러:', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method
  });

  res.status(err.status || 500).json({
    success: false,
    message: err.message || '서버 내부 오류가 발생했습니다.',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// 서버 시작
app.listen(PORT, () => {
  logger.info(`서버가 포트 ${PORT}에서 실행 중입니다.`);
  logger.info(`환경: ${process.env.NODE_ENV || 'development'}`);
});

export { app, logger };
