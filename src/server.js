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
app.use(helmet()); // 보안 헤더 설정
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
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
app.use('/api/points', pointsRoutes);
app.use('/api/music', musicRoutes);
app.use('/api/user', userRoutes);
app.use('/api/upload', uploadRoutes);

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
